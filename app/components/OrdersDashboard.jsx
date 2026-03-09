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

export default function OrdersDashboard() {
  const { orders = [], shop = "", settings = {} } = useLoaderData() || {};
  const fetcher = useFetcher();
  const revalidator = useRevalidator();

  // Initialize state with saved settings (with defaults)
  const [fetchLimit, setFetchLimit] = useState(settings.fetchLimit ?? 100);
  const [reportLimit, setReportLimit] = useState(settings.reportLimit ?? 10);
  const [fraudspyEnabled, setFraudspyEnabled] = useState(settings.fraudspyEnabled ?? false);
  const [steadfastEnabled, setSteadfastEnabled] = useState(settings.steadfastEnabled ?? true);
  // const [allSources, setAllSources] = useState(false);

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
            {/* <label>
              <input
                type="checkbox"
                name="allSources"
                checked={allSources}
                onChange={(e) => setAllSources(e.target.checked)}
              />
              Run reports on all sources
            </label> */}
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
                      {getRiskIndicator(order.fraudReport, order.steadFastReport, order.shippingAddress)}
                    </td>
                    <td style={tdStyle}>{order.orderName || "-"}</td>
                    <td style={tdStyle}>{formatDate(order.orderTime)}</td>
                    <td style={tdStyle}>
                      {formatCustomerName(order.firstName, order.lastName)}
                    </td>
                    <td style={tdStyle}>
                      name1: {order.realName1 || "-"}
                      <br />
                      name2: {order.realName2 || "-"}
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