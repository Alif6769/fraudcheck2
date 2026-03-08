import {
  useLoaderData,
  useFetcher,
  useRevalidator,
} from "react-router";
import { useEffect, useState } from "react";

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
  const isLow = ratio < 90 || (ratio > 100 && ratio < 9000);

  if (isOutside && isLow) {
    return "🔴🔴"; // double red for outside + low ratio
  } else if (isLow) {
    return "🔴"; // red for low ratio
  } else {
    return "🟢"; // green for good ratio
  }
}

export default function OrdersDashboard() {
  const { orders = [], shop = "" } = useLoaderData() || {};
  const fetcher = useFetcher();
  const revalidator = useRevalidator();

  // State for form inputs
  const [fetchLimit, setFetchLimit] = useState(100);
  const [reportLimit, setReportLimit] = useState(10);
  const [fraudspyEnabled, setFraudspyEnabled] = useState(false);
  const [steadfastEnabled, setSteadfastEnabled] = useState(true);
  const [allSources, setAllSources] = useState(false);

  useEffect(() => {
    if (fetcher.data?.success) {
      revalidator.revalidate();
    }
  }, [fetcher.data]);

  return (
    <s-page heading="Orders Dashboard" inlineSize="large">
      <s-section style={{ width: "100%", padding: 0 }}>
        {/* Form with controls */}
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
            <label>
              <input
                type="checkbox"
                name="allSources"
                checked={allSources}
                onChange={(e) => setAllSources(e.target.checked)}
              />
              Run reports on all sources
            </label>
          </div>

          <button
            type="submit"
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
        </fetcher.Form>

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
                  <th style={{ ...thStyle, width: "50px" }}>Risk</th>
                  <th style={{ ...thStyle, width: "100px" }}>Order Name</th>
                  <th style={{ ...thStyle, width: "100px" }}>Order Time</th>
                  <th style={{ ...thStyle, width: "150px" }}>Customer Name</th>
                  <th style={{ ...thStyle, width: "150px" }}>Real Name</th>
                  <th style={{ ...thStyle, width: "400px" }}>FraudSpy Report</th>
                  <th style={{ ...thStyle, width: "180px" }}>Steadfast Report</th>
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
                    <td style={{ ...tdStyle, textAlign: "center", fontSize: "20px" }}>
                      {getRiskIndicator(order.fraudReport, order.shippingAddress)}
                    </td>
                    <td style={tdStyle}>{order.orderName || "-"}</td>
                    <td style={tdStyle}>{formatDate(order.orderTime)}</td>
                    <td style={tdStyle}>
                      {formatCustomerName(order.firstName, order.lastName)}
                    </td>
                    <td style={tdStyle}>
                      Real name1: {order.realName1 || "-"}
                      <br />
                      Real name2: {order.realName2 || "-"}
                    </td>
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
                    <td style={tdStyle}>
                      {order.steadFastReport ? (
                        <div
                          style={{
                            maxWidth: "100%",
                            maxHeight: "80px",
                            overflow: "auto",
                            whiteSpace: "pre-wrap",
                            background: "#f5f5f5",
                            padding: "4px",
                            fontSize: "11px",
                            border: "1px solid #ccc",
                            borderRadius: "4px",
                          }}
                        >
                          {order.steadFastReport}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td style={tdStyle}>{order.shippingPhone || "-"}</td>
                    <td style={tdStyle}>{getDhakaStatus(order.shippingAddress)}</td>
                    <td style={tdStyle}>{order.totalPrice || "0"}</td>
                    <td style={tdStyle}>{order.shippingFee || "0"}</td>
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