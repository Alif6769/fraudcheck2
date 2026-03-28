import { useLoaderData, useFetcher, useLocation, useRevalidator } from "react-router";
import { useState, useEffect } from "react";
import { authenticate, syncOrders, syncSheetForToday, clearSheetForShop } from "../shopify.server";
import prisma from "../db.server";

// ---------- Loader ----------
export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    console.log("🔹 loader got session:", { shop: session?.shop });

    // Calculate cutoff date (10 days ago, UTC)
    const cutoffDate = new Date();
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 5);
    // Set time to beginning of that day to include all orders from that day onward
    cutoffDate.setUTCHours(0, 0, 0, 0);

    const orders = await prisma.order.findMany({
      where: {
        shop: session.shop,
        orderTime: { gte: cutoffDate },
      },
      orderBy: { orderTime: "desc" },
    });

    // Fetch holds for these orders
    const holds = await prisma.courierOrderHold.findMany({
      where: { orderName: { in: orders.map((o) => o.orderName) } },
    });
    const heldOrderNames = new Set(holds.map((h) => h.orderName));
    const ordersWithHold = orders.map((order) => ({
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
    const url = new URL(request.url);
    // console.log("🔹 action /app/order-reports hit:", {
    //   pathname: url.pathname,
    //   search: url.search,
    // });

    const { session, admin } = await authenticate.admin(request);
    console.log("🔹 action got session:", { shop: session?.shop });

    const contentType = request.headers.get("content-type") || "";

    let intent, orderName, formData;
    let body = null;

    if (contentType.includes("application/json")) {
      // Handle JSON (hold/unhold, send-telegram)
      body = await request.json();
      intent = body.intent;
      orderName = body.orderName;
    } else {
      // Handle form data (sync-orders, sync-sheet, clear-sheet)
      formData = await request.formData();
      intent = formData.get("intent");
      orderName = formData.get("orderName");
    }

    // Process hold/unhold
    if (intent === "hold" || intent === "unhold") {
      if (!orderName) {
        return new Response(JSON.stringify({ error: "Missing orderName" }), {
          status: 400,
        });
      }

      const allCouriers = ["pathao", "steadfast"];

      if (intent === "hold") {
        await prisma.$transaction(
          allCouriers.map((courierName) =>
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

    // Existing sync actions (use formData from above)
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

    // Send Telegram
    if (intent === "send-telegram") {
      if (!body) {
        console.error("[Action] send-telegram: no body");
        return new Response(
          JSON.stringify({ error: "Invalid request format", intent: "send-telegram" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const { orderName: bodyOrderName, message } = body;
      console.log(`[Action] send-telegram for order ${bodyOrderName}`);

      if (!bodyOrderName || !message) {
        console.error("[Action] Missing orderName or message");
        return new Response(
          JSON.stringify({
            error: "Missing orderName or message",
            intent: "send-telegram",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const order = await prisma.order.findUnique({ where: { orderName: bodyOrderName } });
      if (!order) {
        console.error(`[Action] Order not found: ${bodyOrderName}`);
        return new Response(
          JSON.stringify({ error: "Order not found", intent: "send-telegram" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      console.log("[Action] Order found");

      const { sendOrderToTelegram } = await import("../services/telegrambot.service");
      try {
        console.log("[Action] Calling sendOrderToTelegram");
        await sendOrderToTelegram(session.shop, order, message);
        console.log("[Action] sendOrderToTelegram succeeded");
        console.log("[Action] Returning success JSON");
        return new Response(
          JSON.stringify({ success: true, intent: "send-telegram" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } catch (sendError) {
        console.error("[Action] sendOrderToTelegram failed:", sendError);
        return new Response(
          JSON.stringify({
            error: sendError.message || "Failed to send message",
            intent: "send-telegram",
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
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

// ---------- Helper Functions ----------
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
    ]
      .filter(Boolean)
      .join(" ");
    fullAddress = parts;
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
      totalOrders =
        parseInt(deliveredMatch[1], 10) + parseInt(cancelledMatch[1], 10);
    } else if (deliveredMatch) {
      totalOrders = parseInt(deliveredMatch[1], 10);
    }
  }

  const hasFraudReports =
    report.includes("Fraud reports:") && !report.includes("No fraud reports.");

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
  const hasAnyFraudReport = steadfastFraud === true;
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
  const location = useLocation();
  const revalidator = useRevalidator();

  const [messages, setMessages] = useState({});
  const [fetchLimit, setFetchLimit] = useState(settings.fetchLimit ?? 100);
  const [reportLimit, setReportLimit] = useState(settings.reportLimit ?? 10);
  const [fraudspyEnabled, setFraudspyEnabled] = useState(
    settings.fraudspyEnabled ?? false
  );
  const [steadfastEnabled, setSteadfastEnabled] = useState(
    settings.steadfastEnabled ?? true
  );

  const isSubmitting = fetcher.state === "submitting";
  const currentIntent = fetcher.submission?.formData?.get("intent") || null;

  const [lastSentOrder, setLastSentOrder] = useState(null);

  // ✅ Per-order status message: { [orderName]: { type: 'success'|'error', text: string } }
  const [sendStatusByOrder, setSendStatusByOrder] = useState({});

  const handleMessageChange = (orderName, value) => {
    setMessages((prev) => ({ ...prev, [orderName]: value }));
    // Clear old status when user edits message
    setSendStatusByOrder((prev) => ({ ...prev, [orderName]: undefined }));
  };

  const handleSend = (orderName, message) => {
    if (!message.trim()) {
      alert("Please enter a message before sending.");
      return;
    }
    setLastSentOrder(orderName); // store which order we're sending
    fetcher.submit(
      { intent: "send-telegram", orderName, message },
      { method: "post", encType: "application/json", action: "/app/order-reports?index" }
    );
  };

  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data?.intent === "send-telegram"
    ) {
      if (fetcher.data.success) {
        // Success: show success text below that order's button and clear textarea
        if (lastSentOrder) {
          setSendStatusByOrder((prev) => ({
            ...prev,
            [lastSentOrder]: {
              type: "success",
              text: "Message sent to Telegram!",
            },
          }));
          setMessages((prev) => ({ ...prev, [lastSentOrder]: "" }));
        }
      } else if (fetcher.data.error) {
        // Error: show error text below that order's button
        if (lastSentOrder) {
          setSendStatusByOrder((prev) => ({
            ...prev,
            [lastSentOrder]: {
              type: "error",
              text: `Failed to send: ${fetcher.data.error}`,
            },
          }));
        }
      }
      setLastSentOrder(null);
    }
  }, [fetcher.state, fetcher.data, lastSentOrder]);

  const handleHold = (orderName, currentlyHeld) => {
    const intent = currentlyHeld ? "unhold" : "hold";
    fetcher.submit(
      { intent, orderName },
      { method: "post", encType: "application/json" }
    );
  };

  // Reload on hold change (still global based on success)
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      revalidator.revalidate();
    }
  }, [fetcher.state, fetcher.data, revalidator]);

  const isSetupPage = location.pathname === "/app/order-reports/setup";

  return (
    <s-page heading="Order Reports" inlineSize="large">
      <s-section style={{ width: "100%", padding: 0 }}>
        {/* Settings form */}
        <fetcher.Form method="post">
          <div
            style={{
              display: "flex",
              gap: "20px",
              marginBottom: "15px",
              flexWrap: "wrap",
            }}
          >
            <label>
              Pull orders (max):
              <input
                type="number"
                name="fetchLimit"
                value={fetchLimit}
                onChange={(e) => setFetchLimit(e.target.value)}
                min="1"
                max="250"
                style={{ marginLeft: "8px", width: "80px" }}
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
                style={{ marginLeft: "8px", width: "80px" }}
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

          <div
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "center",
              marginBottom: "15px",
            }}
          >
            <button
              type="submit"
              name="intent"
              value="sync-orders"
              disabled={isSubmitting && currentIntent === "sync-orders"}
              style={{
                padding: "8px 16px",
                background: "#008060",
                color: "white",
                border: "none",
                borderRadius: "6px",
              }}
            >
              {isSubmitting && currentIntent === "sync-orders"
                ? "Syncing..."
                : "Sync Orders"}
            </button>
            <button
              type="submit"
              name="intent"
              value="sync-sheet"
              disabled={isSubmitting && currentIntent === "sync-sheet"}
              style={{
                padding: "8px 16px",
                background: "#4285F4",
                color: "white",
                border: "none",
                borderRadius: "6px",
              }}
            >
              {isSubmitting && currentIntent === "sync-sheet"
                ? "Syncing Sheet..."
                : "Sync Today to Sheet"}
            </button>
            <button
              type="submit"
              name="intent"
              value="clear-sheet"
              disabled={isSubmitting && currentIntent === "clear-sheet"}
              style={{
                padding: "8px 16px",
                background: "#dc3545",
                color: "white",
                border: "none",
                borderRadius: "6px",
              }}
            >
              {isSubmitting && currentIntent === "clear-sheet"
                ? "Clearing..."
                : "Clear Sheet"}
            </button>
          </div>
        </fetcher.Form>

        {/* Feedback messages (global; you might want to ignore send-telegram here if it's noisy) */}
        {fetcher.data?.success && fetcher.data?.intent !== "send-telegram" && (
          <div
            style={{
              marginBottom: "10px",
              color: "green",
              fontWeight: "500",
            }}
          >
            ✅{" "}
            {fetcher.data.synced
              ? `${fetcher.data.synced} orders synced`
              : fetcher.data.message}
          </div>
        )}
        {fetcher.data?.error && fetcher.data?.intent !== "send-telegram" && (
          <div
            style={{
              marginBottom: "10px",
              color: "red",
              fontWeight: "500",
            }}
          >
            ❌ {fetcher.data.error}
          </div>
        )}

        <s-paragraph>
          Showing orders for: <strong>{shop}</strong>
        </s-paragraph>

        {orders.length === 0 ? (
          <s-paragraph>No orders found.</s-paragraph>
        ) : (
          <div
            style={{
              overflow: "auto",
              maxHeight: "80vh",
              marginTop: "10px",
              width: "100%",
            }}
          >
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
                  <th style={{ ...thStyle, width: "150px" }}>Real Name</th>
                  <th style={{ ...thStyle, width: "250px" }}>FraudSpy Report</th>
                  <th style={{ ...thStyle, width: "250px" }}>
                    Steadfast Report
                  </th>
                  <th style={{ ...thStyle, width: "120px" }}>Shipping Phone</th>
                  <th style={{ ...thStyle, width: "130px" }}>
                    Shipping Address
                  </th>
                  <th style={{ ...thStyle, width: "90px" }}>Total Price</th>
                  <th style={{ ...thStyle, width: "90px" }}>Shipping Fee</th>
                  <th style={{ ...thStyle, width: "200px" }}>Products</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const status = sendStatusByOrder[order.orderName];
                  const isThisOrderSubmitting =
                    isSubmitting &&
                    fetcher.submission?.formData?.get("orderName") ===
                      order.orderName &&
                    fetcher.submission?.formData?.get("intent") ===
                      "send-telegram";

                  return (
                    <tr key={order.id}>
                      {/* Message & Send column */}
                      <td style={tdStyle}>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                          }}
                        >
                          <textarea
                            value={messages[order.orderName] || ""}
                            onChange={(e) =>
                              handleMessageChange(
                                order.orderName,
                                e.target.value
                              )
                            }
                            style={{
                              width: "100%",
                              padding: "8px",
                              resize: "vertical",
                              minHeight: "60px",
                              maxHeight: "120px",
                              overflow: "auto",
                              fontFamily: "inherit",
                              fontSize: "inherit",
                              border: "1px solid #ccc",
                              borderRadius: "4px",
                            }}
                            placeholder="Enter message (long text supported)"
                          />
                          <button
                            onClick={() =>
                              handleSend(
                                order.orderName,
                                messages[order.orderName] || ""
                              )
                            }
                            disabled={isThisOrderSubmitting}
                          >
                            {isThisOrderSubmitting ? "Sending..." : "Send"}
                          </button>

                          {/* ✅ Status message under the button */}
                          {status && (
                            <span
                              style={{
                                fontSize: "12px",
                                color:
                                  status.type === "success" ? "green" : "red",
                              }}
                            >
                              {status.text}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Hold column */}
                      <td style={tdStyle}>
                        <button
                          onClick={() =>
                            handleHold(order.orderName, order.isHeld)
                          }
                        >
                          {order.isHeld ? "Unhold" : "Hold"}
                        </button>
                      </td>

                      {/* Remaining columns */}
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: "center",
                          fontSize: "20px",
                        }}
                      >
                        {getRiskIndicator(
                          order.fraudReport,
                          order.steadFastReport,
                          order.shippingAddress
                        )}
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
                            {order.steadFastReport}
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td style={tdStyle}>{order.shippingPhone || "-"}</td>
                      <td style={tdStyle}>
                        {getDhakaStatus(order.shippingAddress)}
                      </td>
                      <td style={tdStyle}>{order.totalPrice || "0"}</td>
                      <td style={tdStyle}>{order.shippingFee || "0"}</td>
                      <td style={tdStyle}>
                        {Array.isArray(order.products) &&
                        order.products.length > 0 ? (
                          order.products.map((product, idx) => (
                            <div key={idx}>
                              {product.title || "Product"} ×{" "}
                              {product.quantity || 1}
                            </div>
                          ))
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </s-section>
    </s-page>
  );
}