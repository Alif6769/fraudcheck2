// app/routes/app.courier.pathao.jsx
import { useLoaderData, useFetcher } from "react-router";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { decrypt } from "../../utils/encryption.js";
import axios from "axios";

// ---------- Loader ----------
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // Fetch unfulfilled orders
  const unfulfilledOrders = await prisma.unfulfilledOrder.findMany({
    where: { shop: shopDomain },
    orderBy: { orderTime: "desc" },
  });

  // Fetch cancelled orders
  const cancelledOrders = await prisma.cancelledOrder.findMany({
    where: { shop: shopDomain },
    orderBy: { orderTime: "desc" },
  });

  // Fetch Pathao service and credentials
  const pathaoService = await prisma.courierService.findUnique({
    where: { name: "pathao" },
  });
  if (!pathaoService) {
    throw new Error("Pathao courier service not found in database");
  }
  const creds = await prisma.shopCourierCredentials.findUnique({
    where: {
      shopDomain_courierServiceId: {
        shopDomain,
        courierServiceId: pathaoService.id,
      },
    },
  });

  // Decrypt credentials to get store list (if any)
  let stores = [];
  let defaultStoreId = null;
  if (creds) {
    const full = JSON.parse(decrypt(creds.credentials));
    stores = full.stores || [];
    defaultStoreId = creds.storeId;
  }

  // For each unfulfilled order, get shipment count, hold status, and latest shipment
  const ordersWithMeta = await Promise.all(
    unfulfilledOrders.map(async (order) => {
      const shipmentCount = await prisma.courierShipment.count({
        where: { orderName: order.orderName, courierName: "pathao" },
      });
      const hold = await prisma.courierOrderHold.findUnique({
        where: {
          orderName_courierName: {
            orderName: order.orderName,
            courierName: "pathao",
          },
        },
      });
      const latestShipment = await prisma.courierShipment.findFirst({
        where: { orderName: order.orderName, courierName: "pathao" },
        orderBy: { createdAt: "desc" },
      });
      return {
        ...order,
        shipmentCount,
        isHeld: !!hold,
        consignmentId: latestShipment?.consignmentId || null,
        shipmentStatus: latestShipment?.status || null,
        trackingLink: latestShipment?.trackingLink || null,
      };
    })
  );

  // Fetch all sent orders
  const sentOrders = await prisma.courierShipment.findMany({
    where: { courierName: "pathao" },
    include: { order: true },
    orderBy: { createdAt: "desc" },
  });

  console.log(`shop domain in pathao ${shopDomain}, total unfulfilled orders ${unfulfilledOrders.length}`);

  return {
    unfulfilledOrders: ordersWithMeta,
    cancelledOrders,
    sentOrders,
    shopDomain,
    stores,
    defaultStoreId,
    credentialsConfigured: !!creds,
  };
}

// ---------- Action ----------
export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.json();
  const { actionType, orderName, codAmount, selectedStoreId } = formData;

  // Get Pathao service and credentials
  const pathaoService = await prisma.courierService.findUnique({
    where: { name: "pathao" },
  });
  const creds = await prisma.shopCourierCredentials.findUnique({
    where: {
      shopDomain_courierServiceId: {
        shopDomain,
        courierServiceId: pathaoService.id,
      },
    },
  });
  if (!creds) {
    return new Response(JSON.stringify({ error: "Pathao not configured" }), { status: 400 });
  }

  const accessToken = decrypt(creds.accessToken);

  if (actionType === "send") {
    // Fetch the order from UnfulfilledOrder
    const order = await prisma.unfulfilledOrder.findUnique({
      where: { orderName },
    });
    if (!order) {
      return new Response(JSON.stringify({ error: "Order not found" }), { status: 404 });
    }

    // ---------- Clean phone number ----------
    let phone = order.shippingPhone || order.contactPhone || "";
    // Remove all non‑digit characters
    phone = phone.replace(/\D/g, "");

    if (phone.length >= 11) {
        // Take the last 11 digits (if more than 11, use the last 11)
        phone = phone.slice(-11);
    } else if (phone.length === 10) {
        // Add a leading zero
        phone = "0" + phone;
    } else {
        console.warn(`Phone number for order ${order.orderName} has unexpected length: ${phone}`);
    }

    // ---------- Clean address ----------
    let address = order.shippingAddress || "";
    try {
      // Try to parse if it's a JSON string (from Shopify)
      const addrObj = JSON.parse(address);
      // Build a simple address string from common fields
      const parts = [
        addrObj.address1,
        addrObj.address2,
        addrObj.city,
        addrObj.province,
        addrObj.country,
      ].filter(Boolean);
      address = parts.join(", ");
    } catch {
      // Already a plain string – keep as is
    }

    const storeId = selectedStoreId || creds.storeId;
    if (!storeId) {
      return new Response(JSON.stringify({ error: "No store selected" }), { status: 400 });
    }

    // Prepare payload with cleaned data
    const payload = {
      store_id: parseInt(storeId),
      merchant_order_id: order.orderName,
      recipient_name: order.firstName + " " + order.lastName,
      recipient_phone: phone,                     // cleaned phone
      recipient_address: address,                  // cleaned address
      delivery_type: 48,
      item_type: 2,
      item_quantity: 1,
      item_weight: 0.5,
      amount_to_collect: parseFloat(codAmount) || parseFloat(order.totalPrice),
      item_description: "Order from " + order.orderName,
    };

    try {
      const response = await axios.post(
        "https://api-hermes.pathao.com/aladdin/api/v1/orders",
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.code === 200) {
        const consignmentId = response.data.data.consignment_id;
        const trackingLink = `https://merchant.pathao.com/tracking?consignment_id=${consignmentId}&phone=${payload.recipient_phone}`;

        // Create shipment record
        await prisma.courierShipment.create({
          data: {
            orderName,
            courierName: "pathao",
            consignmentId,
            trackingLink,
            status: response.data.data.order_status,
            response: response.data,
          },
        });

        // Remove any existing hold
        await prisma.courierOrderHold.deleteMany({
          where: { orderName, courierName: "pathao" },
        });

        return new Response(
          JSON.stringify({ success: true, consignmentId, trackingLink }),
          { headers: { "Content-Type": "application/json" } }
        );
      } else {
        throw new Error(response.data.message || "Pathao order failed");
      }
    } catch (error) {
      console.error("Pathao send error:", error);
      return new Response(
        JSON.stringify({ error: error.message || "Failed to send order" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  } else if (actionType === "hold") {
    // Create hold record
    await prisma.courierOrderHold.upsert({
      where: {
        orderName_courierName: { orderName, courierName: "pathao" },
      },
      update: {},
      create: {
        orderName,
        courierName: "pathao",
      },
    });
    return new Response(JSON.stringify({ success: true, held: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } else if (actionType === "unhold") {
    // Remove hold
    await prisma.courierOrderHold.deleteMany({
      where: { orderName, courierName: "pathao" },
    });
    return new Response(JSON.stringify({ success: true, held: false }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  else if (actionType === "cancel_sent") {
    const { shipmentId } = formData;
    await prisma.courierShipment.delete({
      where: { id: parseInt(shipmentId) },
    });
    return new Response(
      JSON.stringify({ success: true, actionType: "cancel_sent" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400 });
}

// ---------- Component ----------
export default function PathaoDashboard() {
  const { unfulfilledOrders, cancelledOrders, sentOrders, shopDomain, stores, defaultStoreId, credentialsConfigured } = useLoaderData();
  const fetcher = useFetcher();
  const [selectedStore, setSelectedStore] = useState(defaultStoreId || "");
  const [codInputs, setCodInputs] = useState({});
  const [codErrors, setCodErrors] = useState({}); // for validation warnings
  const [activeTab, setActiveTab] = useState("unfulfilled");
  const [searchOrderName, setSearchOrderName] = useState("");
  const [searchedOrder, setSearchedOrder] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [sendingAll, setSendingAll] = useState(false);
  const [sendAllResults, setSendAllResults] = useState(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      const { actionType } = fetcher.data;
      if (actionType === "cancel" || actionType === "cancel_sent") {
        window.location.reload();
      }
    }
  }, [fetcher.state, fetcher.data]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/unfulfilled", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      alert(`Sync successful: ${data.message}`);
      // Reload to show updated orders
      window.location.reload();
    } catch (err) {
      alert(`Sync error: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };
  
  const handleSendAll = async () => {
    const ordersToSend = unfulfilledOrders.filter(order => !order.isHeld);
    if (ordersToSend.length === 0) {
      alert("No eligible orders to send (all are held or none).");
      return;
    }

    const confirmMsg = `Send ${ordersToSend.length} order(s) to Pathao?`;
    if (!window.confirm(confirmMsg)) return;

    setSendingAll(true);
    setSendAllResults(null);

    const results = [];
    for (const order of ordersToSend) {
      const defaultCod = parseFloat(order.totalPrice);
      const cod = codInputs[order.orderName] !== undefined ? codInputs[order.orderName] : defaultCod;

      // Validate COD input
      if (isNaN(parseFloat(cod))) {
        results.push({ orderName: order.orderName, success: false, error: "Invalid COD" });
        continue;
      }

      try {
        const response = await fetch("/app/courier/pathao", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: 'include', // 👈 this sends the session cookie
          body: JSON.stringify({
            actionType: "send",
            orderName: order.orderName,
            codAmount: cod,
            selectedStoreId: selectedStore,
          }),
        });

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          // Server returned HTML – read it as text and show snippet
          const text = await response.text();
          throw new Error(`Server returned ${response.status} (not JSON): ${text.substring(0, 200)}`);
        }

        const data = await response.json();
        results.push({
          orderName: order.orderName,
          success: data.success,
          consignmentId: data.consignmentId,
          error: data.error,
        });
      } catch (error) {
        results.push({ orderName: order.orderName, success: false, error: error.message });
      }
    }

    setSendAllResults(results);
    setSendingAll(false);
  };

  const handleCodChange = (orderName, value) => {
    // Validate: only digits allowed
    const isValid = /^\d*\.?\d*$/.test(value); // allows decimals
    setCodInputs({ ...codInputs, [orderName]: value });
    setCodErrors({ ...codErrors, [orderName]: isValid ? null : "Only numbers allowed" });
  };

  const handleSend = (orderName, defaultCod) => {
    const cod = codInputs[orderName] !== undefined ? codInputs[orderName] : defaultCod;
    // Validate before sending
    if (isNaN(parseFloat(cod))) {
      setCodErrors({ ...codErrors, [orderName]: "Invalid number" });
      return;
    }
    fetcher.submit(
      {
        actionType: "send",
        orderName,
        codAmount: cod,
        selectedStoreId: selectedStore,
      },
      { method: "post", encType: "application/json" }
    );
  };

  const handleSendCancelled = (orderName, defaultCod) => {
    if (window.confirm(`Are you sure you want to send cancelled order ${orderName}?`)) {
      handleSend(orderName, defaultCod);
    }
  };

  const handleHold = (orderName, currentlyHeld) => {
    fetcher.submit(
      {
        actionType: currentlyHeld ? "unhold" : "hold",
        orderName,
      },
      { method: "post", encType: "application/json" }
    );
  };

  const handleSearch = async () => {
    if (!searchOrderName.trim()) return;
    setSearchLoading(true);
    setSearchError("");
    setSearchedOrder(null);
    try {
      // Fetch order by name from the database (could be from UnfulfilledOrder or Order)
      const response = await fetch(`/api/orders/by-name?name=${encodeURIComponent(searchOrderName)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Order not found");
      setSearchedOrder(data.order);
    } catch (err) {
      setSearchError(err.message);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleCancelSent = (shipmentId, orderName) => {
    if (window.confirm(`Are you sure you want to cancel shipment for order ${orderName}?`)) {
      fetcher.submit(
        { actionType: "cancel_sent", shipmentId },
        { method: "post", encType: "application/json" }
      );
    }
  };

  if (!credentialsConfigured) {
    return (
      <s-page heading="Pathao Courier" inlineSize="large">
        <s-section>
          <s-box background="critical" padding="base" borderRadius="base">
            <s-heading level="3">Pathao Not Configured</s-heading>
            <s-text>
              Please configure Pathao credentials in the welcome page first.
            </s-text>
          </s-box>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Pathao Courier – Dashboard" inlineSize="large">
      <s-section>
        <s-stack gap="base">
          <s-text>Shop: {shopDomain}</s-text>

          {/* Store selector (if multiple stores) */}
          {stores.length > 1 && (
            <s-box background="soft" padding="base" borderRadius="base">
              <s-stack direction="inline" gap="small" align="center">
                <label>Select Pickup Store:</label>
                <select value={selectedStore} onChange={(e) => setSelectedStore(e.target.value)}>
                  {stores.map((store) => (
                    <option key={store.store_id} value={store.store_id}>
                      {store.store_name} (ID: {store.store_id})
                    </option>
                  ))}
                </select>
              </s-stack>
            </s-box>
          )}

          {/* Tab Navigation */}
          <s-stack direction="inline" gap="small">
            <s-button onClick={() => setActiveTab("unfulfilled")} variant={activeTab === "unfulfilled" ? "primary" : "secondary"}>Unfulfilled</s-button>
            <s-button onClick={() => setActiveTab("fulfilled")} variant={activeTab === "fulfilled" ? "primary" : "secondary"}>Fulfilled (Search)</s-button>
            <s-button onClick={() => setActiveTab("sent")} variant={activeTab === "sent" ? "primary" : "secondary"}>Sent Orders</s-button>
          </s-stack>

          {/* Unfulfilled Tab */}
          {activeTab === "unfulfilled" && (
            <s-stack gap="base">
              <s-stack direction="inline" gap="small">
                <s-button onClick={handleSync} disabled={syncing}>
                  {syncing ? "Syncing..." : "Sync Unfulfilled"}
                </s-button>
                <s-button onClick={handleSendAll} disabled={sendingAll}>
                  {sendingAll ? "Sending..." : "Send All"}
                </s-button>
              </s-stack>
              {sendAllResults && (
                <s-box background="info" padding="base" borderRadius="base" border="base">
                  <s-heading level="3">Send All Results</s-heading>
                  <s-table variant="auto">
                    <s-table-header-row>
                      <s-table-header>Order</s-table-header>
                      <s-table-header>Status</s-table-header>
                      <s-table-header>Consignment ID</s-table-header>
                    </s-table-header-row>
                    <s-table-body>
                      {sendAllResults.map((r) => (
                        <s-table-row key={r.orderName}>
                          <s-table-cell>{r.orderName}</s-table-cell>
                          <s-table-cell>{r.success ? "✅" : "❌"}</s-table-cell>
                          <s-table-cell>{r.consignmentId || r.error}</s-table-cell>
                        </s-table-row>
                      ))}
                    </s-table-body>
                  </s-table>
                </s-box>
              )}

              {/* Unfulfilled Orders Table */}
              <s-box background="base" border="base" borderRadius="base" padding="base">
                <s-heading>Unfulfilled Orders</s-heading>
                <s-table variant="auto">
                  <s-table-header-row>
                    <s-table-header>Actions</s-table-header>
                    <s-table-header>Times Sent</s-table-header>
                    <s-table-header>Order Name</s-table-header>
                    <s-table-header>Total Price</s-table-header>
                    <s-table-header>Customer Name</s-table-header>
                    <s-table-header>Shipping Phone</s-table-header>
                    <s-table-header>Consignment ID</s-table-header>
                    <s-table-header>Status</s-table-header>
                  </s-table-header-row>
                  <s-table-body>
                    {unfulfilledOrders.length === 0 ? (
                      <s-table-row><s-table-cell colSpan={8}>No unfulfilled orders found.</s-table-cell></s-table-row>
                    ) : (
                      unfulfilledOrders.map((order) => {
                        const defaultCod = parseFloat(order.totalPrice);
                        const codValue = codInputs[order.orderName] !== undefined ? codInputs[order.orderName] : defaultCod;
                        const error = codErrors[order.orderName];
                        return (
                          <s-table-row key={order.orderName}>
                            <s-table-cell>
                              <s-stack direction="inline" gap="small">
                                <s-button size="small" onClick={() => handleSend(order.orderName, defaultCod)} disabled={order.isHeld || fetcher.state !== "idle"}>Send</s-button>
                                <s-button size="small" onClick={() => handleHold(order.orderName, order.isHeld)} disabled={fetcher.state !== "idle"}>{order.isHeld ? "Unhold" : "Hold"}</s-button>
                              </s-stack>
                            </s-table-cell>
                            <s-table-cell>{order.shipmentCount}</s-table-cell>
                            <s-table-cell>{order.orderName}</s-table-cell>
                            <s-table-cell>
                              <s-stack direction="inline" gap="small">
                                <span>${defaultCod.toFixed(2)}</span>
                                <div>
                                  <input
                                    type="text"
                                    value={codValue}
                                    onChange={(e) => handleCodChange(order.orderName, e.target.value)}
                                    disabled={order.isHeld}
                                    style={{ width: "80px" }}
                                  />
                                  {error && <span style={{ color: "red", fontSize: "0.8em" }}>{error}</span>}
                                </div>
                              </s-stack>
                            </s-table-cell>
                            <s-table-cell>{order.firstName} {order.lastName}</s-table-cell>
                            <s-table-cell>{order.shippingPhone || order.contactPhone}</s-table-cell>
                            <s-table-cell>{order.consignmentId || "-"}</s-table-cell>
                            <s-table-cell>{order.shipmentStatus || "-"}</s-table-cell>
                          </s-table-row>
                        );
                      })
                    )}
                  </s-table-body>
                </s-table>
              </s-box>

              {/* Cancelled Orders Table */}
              <s-box background="base" border="base" borderRadius="base" padding="base" marginBlockStart="base">
                <s-heading>Cancelled Orders</s-heading>
                <s-table variant="auto">
                  <s-table-header-row>
                    <s-table-header>Actions</s-table-header>
                    <s-table-header>Order Name</s-table-header>
                    <s-table-header>Total Price</s-table-header>
                    <s-table-header>Customer Name</s-table-header>
                    <s-table-header>Shipping Phone</s-table-header>
                    <s-table-header>Cancelled At</s-table-header>
                  </s-table-header-row>
                  <s-table-body>
                    {cancelledOrders.length === 0 ? (
                      <s-table-row><s-table-cell colSpan={6}>No cancelled orders found.</s-table-cell></s-table-row>
                    ) : (
                      cancelledOrders.map((order) => {
                        const defaultCod = parseFloat(order.totalPrice);
                        const codValue = codInputs[order.orderName] !== undefined ? codInputs[order.orderName] : defaultCod;
                        const error = codErrors[order.orderName];
                        return (
                          <s-table-row key={order.orderName}>
                            <s-table-cell>
                              <s-button size="small" onClick={() => handleSendCancelled(order.orderName, defaultCod)} disabled={fetcher.state !== "idle"}>Send</s-button>
                            </s-table-cell>
                            <s-table-cell>{order.orderName}</s-table-cell>
                            <s-table-cell>
                              <s-stack direction="inline" gap="small">
                                <span>${defaultCod.toFixed(2)}</span>
                                <div>
                                  <input
                                    type="text"
                                    value={codValue}
                                    onChange={(e) => handleCodChange(order.orderName, e.target.value)}
                                    style={{ width: "80px" }}
                                  />
                                  {error && <span style={{ color: "red", fontSize: "0.8em" }}>{error}</span>}
                                </div>
                              </s-stack>
                            </s-table-cell>
                            <s-table-cell>{order.firstName} {order.lastName}</s-table-cell>
                            <s-table-cell>{order.shippingPhone || order.contactPhone}</s-table-cell>
                            <s-table-cell>{new Date(order.cancelledAt).toLocaleString()}</s-table-cell>
                          </s-table-row>
                        );
                      })
                    )}
                  </s-table-body>
                </s-table>
              </s-box>
            </s-stack>
          )}

          {/* Fulfilled Tab – Search by order name */}
          {activeTab === "fulfilled" && (
            <s-box background="soft" padding="base" borderRadius="base">
              <s-heading level="3">Find Order by Name</s-heading>
              <s-stack direction="inline" gap="small">
                <input
                  type="text"
                  placeholder="Enter order name (e.g., #Mehwish3328)"
                  value={searchOrderName}
                  onChange={(e) => setSearchOrderName(e.target.value)}
                  style={{ flex: 1 }}
                />
                <s-button onClick={handleSearch} disabled={searchLoading}>
                  {searchLoading ? "Searching..." : "Fetch Order"}
                </s-button>
              </s-stack>
              {searchError && <s-text color="critical">{searchError}</s-text>}
              {searchedOrder && (
                <s-box background="base" marginBlockStart="base" padding="base" borderRadius="base">
                  <s-heading level="4">Order Details</s-heading>
                  <s-table variant="auto">
                    <s-table-header-row>
                      <s-table-header>Order Name</s-table-header>
                      <s-table-header>Customer</s-table-header>
                      <s-table-header>Phone</s-table-header>
                      <s-table-header>Total</s-table-header>
                      <s-table-header>Action</s-table-header>
                    </s-table-header-row>
                    <s-table-body>
                      <s-table-row>
                        <s-table-cell>{searchedOrder.orderName}</s-table-cell>
                        <s-table-cell>{searchedOrder.firstName} {searchedOrder.lastName}</s-table-cell>
                        <s-table-cell>{searchedOrder.shippingPhone || searchedOrder.contactPhone}</s-table-cell>
                        <s-table-cell>${parseFloat(searchedOrder.totalPrice).toFixed(2)}</s-table-cell>
                        <s-table-cell>
                          <s-button
                            size="small"
                            onClick={() => handleSend(searchedOrder.orderName, parseFloat(searchedOrder.totalPrice))}
                            disabled={fetcher.state !== "idle"}
                          >
                            Send
                          </s-button>
                        </s-table-cell>
                      </s-table-row>
                    </s-table-body>
                  </s-table>
                </s-box>
              )}
            </s-box>
          )}

          {/* Sent Orders Tab */}
          {activeTab === "sent" && (
            <s-box background="base" border="base" borderRadius="base" padding="base">
              <s-heading level="3">Sent Orders</s-heading>
              <s-table variant="auto">
                <s-table-header-row>
                  <s-table-header>Order Name</s-table-header>
                  <s-table-header>Consignment ID</s-table-header>
                  <s-table-header>Tracking Link</s-table-header>
                  <s-table-header>Status</s-table-header>
                  <s-table-header>Sent At</s-table-header>
                  <s-table-header>Actions</s-table-header>   {/* New column */}
                </s-table-header-row>
                <s-table-body>
                  {sentOrders.length === 0 ? (
                    <s-table-row>
                      <s-table-cell colSpan={6}>No orders have been sent yet.</s-table-cell>
                    </s-table-row>
                  ) : (
                    sentOrders.map((shipment) => (
                      <s-table-row key={shipment.id}>
                        <s-table-cell>{shipment.orderName}</s-table-cell>
                        <s-table-cell>{shipment.consignmentId}</s-table-cell>
                        <s-table-cell>
                          {shipment.trackingLink ? (
                            <a href={shipment.trackingLink} target="_blank" rel="noreferrer">Track</a>
                          ) : "-"}
                        </s-table-cell>
                        <s-table-cell>{shipment.status || "-"}</s-table-cell>
                        <s-table-cell>{new Date(shipment.createdAt).toLocaleString()}</s-table-cell>
                        <s-table-cell>
                          <s-button
                            size="small"
                            onClick={() => handleCancelSent(shipment.id, shipment.orderName)}
                            disabled={fetcher.state !== "idle"}
                          >
                            Cancel
                          </s-button>
                        </s-table-cell>
                      </s-table-row>
                    ))
                  )}
                </s-table-body>
              </s-table>
            </s-box>
          )}
          {/* Response status from fetcher */}
          {fetcher.data && (
            <s-box
              background={fetcher.data.success ? "success" : "critical"}
              padding="base"
              borderRadius="base"
              border="base"
            >
              <s-heading level="3">
                {fetcher.data.success ? "✅ Success" : "❌ Error"}
              </s-heading>
              <pre style={{ whiteSpace: "pre-wrap" }}>
                {JSON.stringify(fetcher.data, null, 2)}
              </pre>
            </s-box>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}