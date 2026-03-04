import {
  useLoaderData,
  useFetcher,
  useRevalidator,
} from "react-router";
import { useEffect } from "react";

import { authenticate, syncOrders } from "../shopify.server";
import prisma from "../db.server";

/* =========================
   ACTION (Sync Orders)
========================= */
export const action = async ({ request }) => {
  try {
    const { session, admin } = await authenticate.admin(request);

    // First sync orders from Shopify (last 10 days)
    const count = await syncOrders(session, admin);

    // Then ensure the most recent 20 online orders have fraud reports
    const recentOrders = await prisma.order.findMany({
      where: {
        shop: session.shop,
        source: 'web',
        fraudReport: null,
      },
      orderBy: { orderTime: 'desc' },
      take: 20,
    });

    for (const order of recentOrders) {
      if (order.shippingPhone) {
        try {
          const { fetchFraudReport } = await import('../services/fraudspy.service');
          const report = await fetchFraudReport(order.shippingPhone);
          await prisma.order.update({
            where: { orderId: order.orderId },
            data: { fraudReport: report },
          });
        } catch (error) {
          console.error(`Failed fraud report for ${order.orderId}:`, error.message);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, synced: count, fraudProcessed: recentOrders.length }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ Sync orders failed:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

/* =========================
   LOADER (Load Orders)
========================= */
export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);

    const orders = await prisma.order.findMany({
      where: { shop: session.shop },
      orderBy: { orderTime: "desc" },
    });

    return { orders, shop: session.shop };
  } catch (error) {
    console.error("❌ Loader error:", error);
    throw new Response("Failed to load orders", { status: 500 });
  }
};

/* =========================
   HELPERS
========================= */
function formatDate(date) {
  if (!date) return "-";
  return new Date(date).toLocaleString();
}

function formatCustomerName(first, last) {
  return [first, last].filter(Boolean).join(" ") || "-";
}

function getDhakaStatus(shippingAddressStr) {
  if (!shippingAddressStr) return "-";
  try {
    const address = JSON.parse(shippingAddressStr);
    const city = address.city || "";
    if (city.toLowerCase().includes("dhaka")) {
      return "Inside Dhaka";
    } else {
      return "Outside Dhaka";
    }
  } catch (e) {
    return "-";
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

/**
 * Extracts success ratio from fraud report text.
 * Returns a number (0-100) or null if not found.
 */
function extractSuccessRatio(report) {
  if (!report) return null;
  const match = report.match(/Success ratio:\s*([0-9.]+)%/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Returns emoji indicator based on fraud report and shipping location.
 */
function getRiskIndicator(fraudReport, shippingAddress) {
  if (!fraudReport) return ""; // no report – empty cell

  const ratio = extractSuccessRatio(fraudReport);
  if (ratio === null) return ""; // couldn't parse – treat as unknown

  const isOutside = getDhakaStatus(shippingAddress) === "Outside Dhaka";
  const isLow = ratio < 90;

  if (isOutside && isLow) {
    return "🔴🔴"; // double red for outside + low ratio
  } else if (isLow) {
    return "🔴"; // red for low ratio
  } else {
    return "🟢"; // green for good ratio
  }
}

/* =========================
   COMPONENT
========================= */
export default function Index() {
  const { orders = [], shop = "" } = useLoaderData() || {};
  const fetcher = useFetcher();
  const revalidator = useRevalidator();

  useEffect(() => {
    if (fetcher.data?.success) {
      revalidator.revalidate();
    }
  }, [fetcher.data]);

  return (
    <s-page heading="Orders Dashboard">
      <s-section style={{ width: "100%", padding: 0 }}>
        {/* Sync Button and messages – unchanged */}
        <button
          onClick={() => fetcher.submit({}, { method: "post" })}
          disabled={fetcher.state === "submitting"}
          style={{
            padding: "8px 16px",
            marginBottom: "15px",
            cursor: "pointer",
            background: "#008060",
            color: "white",
            border: "none",
            borderRadius: "6px",
          }}
        >
          {fetcher.state === "submitting" ? "Syncing..." : "Sync Orders"}
        </button>

        {fetcher.data?.success && (
          <div style={{ marginBottom: "10px", color: "green", fontWeight: "500" }}>
            ✅ {fetcher.data.synced} orders synced successfully
          </div>
        )}
        {fetcher.data?.error && (
          <div style={{ marginBottom: "10px", color: "red", fontWeight: "500" }}>
            ❌ {fetcher.data.error}
          </div>
        )}

        <s-paragraph>
          Showing orders for: <strong>{shop}</strong>
        </s-paragraph>

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
                  <th style={{ ...thStyle, width: "50px" }}>Risk</th> {/* new column */}
                  <th style={{ ...thStyle, width: "100px" }}>Order Name</th>
                  <th style={{ ...thStyle, width: "100px" }}>Order Time</th>
                  <th style={{ ...thStyle, width: "150px" }}>Customer Name</th>
                  <th style={{ ...thStyle, width: "400px" }}>FraudSpy Report</th>
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
                    {/* Risk Indicator */}
                    <td style={{ ...tdStyle, textAlign: "center", fontSize: "20px" }}>
                      {getRiskIndicator(order.fraudReport, order.shippingAddress)}
                    </td>

                    <td style={tdStyle}>{order.orderName || "-"}</td>
                    <td style={tdStyle}>{formatDate(order.orderTime)}</td>
                    <td style={tdStyle}>
                      {formatCustomerName(order.firstName, order.lastName)}
                    </td>

                    {/* Fraud Report Cell */}
                    <td style={tdStyle}>
                      {order.fraudReport ? (
                        <div
                          style={{
                            maxWidth: "100%",
                            maxHeight: "150px",
                            overflow: "auto",
                            whiteSpace: "pre-wrap",
                            background: "#f5f5f5",
                            padding: "4px",
                            fontSize: "11px",
                            border: "1px solid #ccc",
                            borderRadius: "4px",
                          }}
                        >
                          {order.fraudReport}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>

                    <td style={tdStyle}>{order.shippingPhone || "-"}</td>
                    <td style={tdStyle}>{getDhakaStatus(order.shippingAddress)}</td>
                    <td style={tdStyle}>{order.totalPrice || "0"}</td>
                    <td style={tdStyle}>{order.shippingFee || "0"}</td>

                    {/* Products Cell */}
                    <td style={tdStyle}>
                      {Array.isArray(order.products) && order.products.length > 0 ? (
                        order.products.map((product, index) => (
                          <div key={index}>
                            {product.title || "Product"} × {product.quantity || 1}
                          </div>
                        ))
                      ) : (
                        "-"
                      )}
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

/* =========================
   HEADERS
========================= */
export const headers = () => {
  return {};
};