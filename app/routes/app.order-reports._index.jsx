import { useLoaderData, useFetcher, useLocation } from "react-router";
import { useState, useEffect } from "react";
import { authenticate, syncOrders, syncSheetForToday, clearSheetForShop } from "../shopify.server";
import prisma from "../db.server";

// ---------- Loader ----------
export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    const orders = await prisma.order.findMany({
      where: { shop: session.shop },
      orderBy: { orderTime: "desc" },
    });
    // Fetch holds for all orders (any courier)
    const holds = await prisma.courierOrderHold.findMany({
      where: { orderName: { in: orders.map(o => o.orderName) } },
    });
    const heldOrderNames = new Set(holds.map(h => h.orderName));
    const ordersWithHold = orders.map(order => ({
      ...order,
      isHeld: heldOrderNames.has(order.orderName),
    }));
    const settings = await prisma.shopSettings.findUnique({
      where: { shop: session.shop },
    });
    return {
      orders: ordersWithHold,
      shop: session.shop,
      settings: settings || {},
    };
  } catch (error) {
    console.error("❌ Loader error:", error);
    throw new Response("Failed to load orders", { status: 500 });
  }
};

// ---------- Action ----------
export const action = async ({ request }) => {
  try {
    const { session, admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent");

    // Handle hold/unhold actions
    if (intent === "hold" || intent === "unhold") {
      const orderName = formData.get("orderName");
      const allCouriers = ["pathao", "steadfast"];
      if (intent === "hold") {
        await prisma.$transaction(
          allCouriers.map(courierName =>
            prisma.courierOrderHold.upsert({
              where: { orderName_courierName: { orderName, courierName } },
              update: {},
              create: { orderName, courierName },
            })
          )
        );
        return new Response(JSON.stringify({ success: true, held: true }));
      } else if (intent === "unhold") {
        await prisma.courierOrderHold.deleteMany({ where: { orderName } });
        return new Response(JSON.stringify({ success: true, held: false }));
      }
    }

    // Existing sync actions
    if (intent === "sync-sheet") {
      await syncSheetForToday(session.shop);
      return new Response(
        JSON.stringify({ success: true, message: "Sheet sync started", intent }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (intent === "clear-sheet") {
      await clearSheetForShop(session.shop);
      return new Response(
        JSON.stringify({ success: true, message: "Sheet clear started", intent }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Default: sync orders
    const options = {
      fetchLimit: parseInt(formData.get("fetchLimit") || "100", 10),
      reportLimit: parseInt(formData.get("reportLimit") || "10", 10),
      fraudspyEnabled: formData.get("fraudspyEnabled") === "on",
      steadfastEnabled: formData.get("steadfastEnabled") === "on",
    };
    await prisma.shopSettings.upsert({
      where: { shop: session.shop },
      update: options,
      create: { shop: session.shop, ...options },
    });
    const count = await syncOrders(session, admin, options);
    return new Response(
      JSON.stringify({ success: true, synced: count, intent }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ /app action failed:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

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
    const address = JSON.parse(shippingAddressStr);
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
    fullAddress = shippingAddressStr;
  }

  return fullAddress.toLowerCase().includes("dhaka") ? "Inside Dhaka" : "Outside Dhaka";
}

// ================== HELPER: Parse FraudSpy Report ==================
function parseFraudSpyReport(report) {
  if (!report) return { ratio: null, totalOrders: null, hasFraudReports: false };

  const ratioMatch = report.match(/(?:Success ratio|Success Rate):\s*(\d+(?:\.\d+)?)%/i);
  const ratio = ratioMatch ? parseFloat(ratioMatch[1]) : null;

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

  const hasFraudReports = report.includes("Fraud reports:") && !report.includes("No fraud reports.");

  return { ratio, totalOrders, hasFraudReports };
}

// ================== HELPER: Parse Steadfast Report ==================
function parseSteadfastReport(report) {
  if (!report) return null;
  const text = report.toLowerCase();
  return text.includes("fraud reports:") && !text.includes("no fraud reports.");
}

// ================== MAIN RISK INDICATOR ==================
function getRiskIndicator(fraudReport, steadfastReport, shippingAddress) {
  if (!fraudReport) return "";
  const parsed = parseFraudSpyReport(fraudReport);
  if (parsed.ratio === null) return "";
  const steadfastFraud = parseSteadfastReport(steadfastReport);
  const hasAnyFraudReport = (steadfastFraud === true);
  const isOutside = getDhakaStatus(shippingAddress) === "Outside Dhaka";

  if (parsed.ratio < 80) return "🔴🔴🔴";
  if (parsed.ratio < 90 && hasAnyFraudReport) return "🔴🔴🔴";
  if (hasAnyFraudReport) return "🔴🔴";
  if (parsed.ratio < 90 && isOutside) return "🔴🔴";
  if (parsed.ratio < 90) return "🔴";
  if (parsed.totalOrders !== null && parsed.totalOrders < 10) return "🟠";
  return "🟢";
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

// ---------- Component ----------
export default function OrderReports() {
  const { orders, shop, settings } = useLoaderData();
  const fetcher = useFetcher();
  const location = useLocation(); // ✅ get location object
  const [messages, setMessages] = useState({});
  const [fetchLimit, setFetchLimit] = useState(settings.fetchLimit ?? 100);
  const [reportLimit, setReportLimit] = useState(settings.reportLimit ?? 10);
  const [fraudspyEnabled, setFraudspyEnabled] = useState(settings.fraudspyEnabled ?? false);
  const [steadfastEnabled, setSteadfastEnabled] = useState(settings.steadfastEnabled ?? true);

  const isSubmitting = fetcher.state === "submitting";
  const currentIntent = fetcher.submission?.formData?.get("intent") || null;

  const handleMessageChange = (orderName, value) => {
    setMessages({ ...messages, [orderName]: value });
  };

  const handleSend = (orderName) => {
    const msg = messages[orderName] || "";
    alert(`Sending message to ${orderName}: ${msg}`);
  };

  const handleHold = (orderName, currentlyHeld) => {
    const intent = currentlyHeld ? "unhold" : "hold";
    fetcher.submit(
      { intent, orderName },
      { method: "post", encType: "application/json" }
    );
  };

  // Reload on hold change
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      window.location.reload();
    }
  }, [fetcher.state, fetcher.data]);

  const isSetupPage = location.pathname === "/app/order-reports/setup";

  return (
    <s-page heading="Order Reports" inlineSize="large">
      <s-section style={{ width: "100%", padding: 0 }}>
        {/* Settings form */}
        <fetcher.Form method="post">
          <div style={{ display: 'flex', gap: '20px', marginBottom: '15px', flexWrap: 'wrap' }}>
            <label>
              Pull orders (max):
              <input
                type="number"
                name="fetchLimit"
                value={fetchLimit}
                onChange={(e) => setFetchLimit(e.target.value)}
                min="1"
                max="250"
                style={{ marginLeft: '8px', width: '80px' }}
              />
            </label>
            <label>
              Reports per service:
              <input
                type="number"
                name="reportLimit"
                value={reportLimit}
                onChange={(e) => setReportLimit(e.target.value)}
                min="0"
                max="50"
                style={{ marginLeft: '8px', width: '80px' }}
              />
            </label>
            <label>
              <input
                type="checkbox"
                name="fraudspyEnabled"
                checked={fraudspyEnabled}
                onChange={(e) => setFraudspyEnabled(e.target.checked)}
              />
              Enable FraudSpy
            </label>
            <label>
              <input
                type="checkbox"
                name="steadfastEnabled"
                checked={steadfastEnabled}
                onChange={(e) => setSteadfastEnabled(e.target.checked)}
              />
              Enable Steadfast
            </label>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "15px" }}>
            <button
              type="submit"
              name="intent"
              value="sync-orders"
              disabled={isSubmitting && currentIntent === "sync-orders"}
              style={{ padding: "8px 16px", background: "#008060", color: "white", border: "none", borderRadius: "6px" }}
            >
              {isSubmitting && currentIntent === "sync-orders" ? "Syncing..." : "Sync Orders"}
            </button>
            <button
              type="submit"
              name="intent"
              value="sync-sheet"
              disabled={isSubmitting && currentIntent === "sync-sheet"}
              style={{ padding: "8px 16px", background: "#4285F4", color: "white", border: "none", borderRadius: "6px" }}
            >
              {isSubmitting && currentIntent === "sync-sheet" ? "Syncing Sheet..." : "Sync Today to Sheet"}
            </button>
            <button
              type="submit"
              name="intent"
              value="clear-sheet"
              disabled={isSubmitting && currentIntent === "clear-sheet"}
              style={{ padding: "8px 16px", background: "#dc3545", color: "white", border: "none", borderRadius: "6px" }}
            >
              {isSubmitting && currentIntent === "clear-sheet" ? "Clearing..." : "Clear Sheet"}
            </button>
          </div>
        </fetcher.Form>

        {/* Feedback messages */}
        {fetcher.data?.success && (
          <div style={{ marginBottom: "10px", color: "green", fontWeight: "500" }}>
            ✅ {fetcher.data.synced ? `${fetcher.data.synced} orders synced` : fetcher.data.message}
          </div>
        )}
        {fetcher.data?.error && (
          <div style={{ marginBottom: "10px", color: "red", fontWeight: "500" }}>
            ❌ {fetcher.data.error}
          </div>
        )}

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
                  <th style={{ ...thStyle, width: "200px" }}>Message</th>
                  <th style={{ ...thStyle, width: "100px" }}>Actions</th>
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
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                    <tr key={order.id}>
                    {/* Message & Send column */}
                    <td style={tdStyle}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <input
                            type="text"
                            value={messages[order.orderName] || ""}
                            onChange={(e) => handleMessageChange(order.orderName, e.target.value)}
                            style={{ width: "100%", padding: "4px" }}
                            placeholder="Enter message"
                        />
                        <button onClick={() => handleSend(order.orderName)}>Send</button>
                        </div>
                    </td>

                    {/* Hold column */}
                    <td style={tdStyle}>
                        <button onClick={() => handleHold(order.orderName, order.isHeld)}>
                        {order.isHeld ? "Unhold" : "Hold"}
                        </button>
                    </td>

                    {/* Remaining columns */}
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