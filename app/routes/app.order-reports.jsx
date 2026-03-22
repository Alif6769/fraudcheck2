// app/routes/app.order-reports.jsx
import { useLoaderData, useFetcher } from "react-router";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// // ---------- Loader ----------
// export async function loader({ request }) {
//   const { session } = await authenticate.admin(request);
//   const orders = await prisma.order.findMany({
//     where: { shop: session.shop },
//     orderBy: { orderTime: "desc" },
//   });

//   // Fetch all holds for these orders (any courier)
//   const holds = await prisma.courierOrderHold.findMany({
//     where: {
//       orderName: { in: orders.map(o => o.orderName) },
//     },
//   });
//   // Mark order as held if at least one hold exists
//   const heldOrderNames = new Set(holds.map(h => h.orderName));

//   const ordersWithHold = orders.map(order => ({
//     ...order,
//     isHeld: heldOrderNames.has(order.orderName),
//   }));

//   return { orders: ordersWithHold, shop: session.shop };
// }

// // ---------- Action ----------
// export async function action({ request }) {
//   const { session } = await authenticate.admin(request);
//   const formData = await request.json();
//   const { orderName, actionType } = formData;

//   // List of all active couriers – could be fetched from DB dynamically
//   const allCouriers = ["pathao", "steadfast"];

//   if (actionType === "hold") {
//     // Create hold records for all couriers
//     await prisma.$transaction(
//       allCouriers.map(courierName =>
//         prisma.courierOrderHold.upsert({
//           where: {
//             orderName_courierName: { orderName, courierName },
//           },
//           update: {},
//           create: { orderName, courierName },
//         })
//       )
//     );
//     return new Response(JSON.stringify({ success: true, held: true }));
//   } else if (actionType === "unhold") {
//     // Delete all hold records for this order
//     await prisma.courierOrderHold.deleteMany({
//       where: { orderName },
//     });
//     return new Response(JSON.stringify({ success: true, held: false }));
//   }

//   return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400 });
// }

// ---------- Helper Functions (copied from OrdersDashboard) ----------
function formatDate(date) {
  if (!date) return "-";
  return new Date(date).toLocaleString();
}

function formatCustomerName(first, last) {
  return [first, last].filter(Boolean).join(" ") || "-";
}

function getDhakaStatus(shippingAddressStr) {
  if (!shippingAddressStr) return "-";

  let fullAddress = "";
  try {
    // Attempt to parse as JSON (Shopify address object)
    const address = JSON.parse(shippingAddressStr);
    // Combine all relevant address fields
    const parts = [
      address.address1,
      address.address2,
      address.city,
      address.province,
      address.country,
      address.zip,
    ].filter(Boolean);
    fullAddress = parts.join(" ");
  } catch (e) {
    // Not JSON – treat as plain text
    fullAddress = shippingAddressStr;
  }

  // Case‑insensitive check for "dhaka"
  if (fullAddress.toLowerCase().includes("dhaka")) {
    return "Inside Dhaka";
  } else {
    return "Outside Dhaka";
  }
}

// ================== HELPER: Parse FraudSpy Report ==================
function parseFraudSpyReport(report) {
  if (!report) return { ratio: null, totalOrders: null, hasFraudReports: false };

  // Extract success ratio (handles both "Success ratio:" and "Success Rate:")
  const ratioMatch = report.match(/(?:Success ratio|Success Rate):\s*(\d+(?:\.\d+)?)%/i);
  const ratio = ratioMatch ? parseFloat(ratioMatch[1]) : null;

  // Extract total orders
  let totalOrders = null;
  const totalMatch = report.match(/Total:\s*(\d+)/i);
  if (totalMatch) {
    totalOrders = parseInt(totalMatch[1], 10);
  } else {
    const deliveredMatch = report.match(/Total Delivered:\s*(\d+)/i);
    const cancelledMatch = report.match(/Total Cancelled:\s*(\d+)/i);
    if (deliveredMatch && cancelledMatch) {
      totalOrders = parseInt(deliveredMatch[1], 10) + parseInt(cancelledMatch[1], 10);
    } else if (deliveredMatch) {
      totalOrders = parseInt(deliveredMatch[1], 10);
    }
  }

  // Check if FraudSpy report contains actual fraud reports
  const hasFraudReports = report.includes("Fraud reports:") && !report.includes("No fraud reports.");

  return { ratio, totalOrders, hasFraudReports };
}

// ================== HELPER: Parse Steadfast Report ==================
function parseSteadfastReport(report) {
  if (!report) return null; // no report → null

  const text = report.toLowerCase();

  return text.includes("fraud reports:") && !text.includes("no fraud reports.");
}

// ================== MAIN RISK INDICATOR ==================
function getRiskIndicator(fraudReport, steadfastReport, shippingAddress) {
  if (!fraudReport) return "";               // no FraudSpy report → empty

  const parsed = parseFraudSpyReport(fraudReport);
  if (parsed.ratio === null) return "";      // can't parse ratio → empty

  const steadfastFraud = parseSteadfastReport(steadfastReport);
  // Combine fraud indicators: true if either source has fraud reports (ignore null/undefined)
  const hasAnyFraudReport = (steadfastFraud === true);

  const isOutside = getDhakaStatus(shippingAddress) === "Outside Dhaka";

  // Apply rules in priority order
  if (parsed.ratio < 80) {
    return "🔴🔴🔴";                          // below 80% → triple red
  } else if (parsed.ratio < 90 && hasAnyFraudReport) {
    return "🔴🔴🔴";                          // below 90% + fraud → triple red
  } else if (hasAnyFraudReport) {
    return "🔴🔴";                            // fraud present → double red
  } else if (parsed.ratio < 90 && isOutside) {
    return "🔴🔴";                            // below 90% + outside Dhaka → double red
  } else if (parsed.ratio < 90) {
    return "🔴";                              // only below 90% → single red
  } else if (parsed.totalOrders !== null && parsed.totalOrders < 10) {
    return "🟠";                              // low volume → orange
  } else {
    return "🟢";                              // all good → green
  }
}

const thStyle = {
  borderBottom: "1px solid #ddd",
  padding: "8px",
  textAlign: "left",
  background: "#f4f6f8",
};

const tdStyle = {
  borderBottom: "1px solid #eee",
  padding: "8px",
  verticalAlign: "top",
};

export default function OrderReports() {
  const { orders, shop } = useLoaderData();
  const fetcher = useFetcher();
  const [messages, setMessages] = useState({});

  const handleMessageChange = (orderName, value) => {
    setMessages({ ...messages, [orderName]: value });
  };

  const handleSend = (orderName) => {
    const msg = messages[orderName] || "";
    alert(`Sending message to ${orderName}: ${msg}`);
    // Here you would implement actual sending (e.g., via API)
  };

  const handleHold = (orderName, currentlyHeld) => {
    const actionType = currentlyHeld ? "unhold" : "hold";
    fetcher.submit(
      { orderName, actionType },
      { method: "post", encType: "application/json" }
    );
  };

  // Reload on hold change
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      window.location.reload();
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <s-page heading="Order Reports" inlineSize="large">
      <s-section style={{ width: "100%", padding: 0 }}>
        <s-paragraph>Showing orders for: <strong>{shop}</strong></s-paragraph>

        {orders.length === 0 ? (
          <s-paragraph>No orders found.</s-paragraph>
        ) : (
          <div style={{ overflow: "auto", maxHeight: "80vh", marginTop: "10px", width: "100%" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "14px",
                tableLayout: "fixed",
              }}
            >
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: "70px" }}>Risk</th>
                  <th style={{ ...thStyle, width: "100px" }}>Order Name</th>
                  <th style={{ ...thStyle, width: "100px" }}>Order Time</th>
                  <th style={{ ...thStyle, width: "150px" }}>Customer Name</th>
                  <th style={{ ...thStyle, width: "250px" }}>FraudSpy Report</th>
                  <th style={{ ...thStyle, width: "250px" }}>Steadfast Report</th>
                  <th style={{ ...thStyle, width: "120px" }}>Shipping Phone</th>
                  <th style={{ ...thStyle, width: "130px" }}>Shipping Address</th>
                  <th style={{ ...thStyle, width: "90px" }}>Total Price</th>
                  <th style={{ ...thStyle, width: "90px" }}>Shipping Fee</th>
                  <th style={{ ...thStyle, width: "200px" }}>Products</th>
                  <th style={{ ...thStyle, width: "150px" }}>Message</th>
                  <th style={{ ...thStyle, width: "100px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td style={{ ...tdStyle, textAlign: "center", fontSize: "20px" }}>
                      {getRiskIndicator(order.fraudReport, order.steadFastReport, order.shippingAddress)}
                    </td>
                    <td style={tdStyle}>{order.orderName || "-"}</td>
                    <td style={tdStyle}>{formatDate(order.orderTime)}</td>
                    <td style={tdStyle}>{formatCustomerName(order.firstName, order.lastName)}</td>
                    <td style={tdStyle}>
                      {order.fraudReport ? (
                        <div style={{ maxWidth: "100%", maxHeight: "150px", overflow: "auto", whiteSpace: "pre-wrap", background: "#f5f5f5", padding: "4px", fontSize: "11px", border: "1px solid #ccc", borderRadius: "4px" }}>
                          {order.fraudReport}
                        </div>
                      ) : "-"}
                    </td>
                    <td style={tdStyle}>
                      {order.steadFastReport ? (
                        <div style={{ maxWidth: "100%", maxHeight: "150px", overflow: "auto", whiteSpace: "pre-wrap", background: "#f5f5f5", padding: "4px", fontSize: "11px", border: "1px solid #ccc", borderRadius: "4px" }}>
                          {order.steadFastReport}
                        </div>
                      ) : "-"}
                    </td>
                    <td style={tdStyle}>{order.shippingPhone || "-"}</td>
                    <td style={tdStyle}>{getDhakaStatus(order.shippingAddress)}</td>
                    <td style={tdStyle}>{order.totalPrice || "0"}</td>
                    <td style={tdStyle}>{order.shippingFee || "0"}</td>
                    <td style={tdStyle}>
                      {Array.isArray(order.products) && order.products.length > 0 ? (
                        order.products.map((product, idx) => (
                          <div key={idx}>{product.title || "Product"} × {product.quantity || 1}</div>
                        ))
                      ) : "-"}
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        value={messages[order.orderName] || ""}
                        onChange={(e) => handleMessageChange(order.orderName, e.target.value)}
                        style={{ width: "100%", padding: "4px" }}
                        placeholder="Enter message"
                      />
                    </td>
                    <td style={tdStyle}>
                      <button onClick={() => handleSend(order.orderName)} style={{ marginRight: "8px" }}>
                        Send
                      </button>
                      <button onClick={() => handleHold(order.orderName, order.isHeld)}>
                        {order.isHeld ? "Unhold" : "Hold"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </s-section>
    </s-page>
  );
}