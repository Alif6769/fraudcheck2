import { useState } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { decrypt } from "../../utils/encryption.js";
import axios from "axios";

// ---------- Loader ----------
export async function loader({ request }) {
    console.log("prisma before action:", prisma);
  if (!prisma) {
    throw new Error("prisma is undefined");
  }

  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // Get Pathao service and credentials
  const pathaoService = await prisma.courierService.findUnique({
    where: { name: "pathao" },
  });
  if (!pathaoService) {
    throw new Error("Pathao courier service not configured");
  }

  const creds = await prisma.shopCourierCredentials.findUnique({
    where: {
      shopDomain_courierServiceId: {
        shopDomain,
        courierServiceId: pathaoService.id,
      },
    },
  });

  // Get all unfulfilled orders for this shop
  const unfulfilledOrders = await prisma.unfulfilledOrder.findMany({
    where: { shop: shopDomain },
    orderBy: { orderTime: "desc" },
  });

  // Get all existing Pathao shipments for these orders
  const shipments = await prisma.courierShipment.findMany({
    where: {
      orderName: { in: unfulfilledOrders.map(o => o.orderName) },
      courierName: "pathao",
    },
  });

  // Get holds for Pathao
  const holds = await prisma.courierOrderHold.findMany({
    where: {
      orderName: { in: unfulfilledOrders.map(o => o.orderName) },
      courierName: "pathao",
    },
  });

  // Decrypt credentials for later use (only needed if sending orders)
  let decryptedCreds = null;
  let stores = [];
  if (creds) {
    decryptedCreds = {
      accessToken: decrypt(creds.accessToken),
      storeId: creds.storeId,
      // also decrypt the full credentials to get stores list if needed
      full: JSON.parse(decrypt(creds.credentials)),
    };
    stores = decryptedCreds.full.stores || [];
  }

  // Map orders with shipment and hold info
  const ordersWithMeta = unfulfilledOrders.map(order => {
    const shipment = shipments.find(s => s.orderName === order.orderName);
    const hold = holds.find(h => h.orderName === order.orderName);
    return {
      ...order,
      shipment,
      hold: !!hold,
    };
  });

  return {
    shopDomain,
    orders: ordersWithMeta,
    credentialsConfigured: !!creds,
    defaultStoreId: creds?.storeId,
    stores,
  };
}

// ---------- Action ----------
export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.json();
  const { actionType, orderName, codAmount, selectedStoreId } = formData;

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
    // Fetch the order details from UnfulfilledOrder
    const order = await prisma.unfulfilledOrder.findUnique({
      where: { orderName },
    });
    if (!order) {
      return new Response(JSON.stringify({ error: "Order not found" }), { status: 404 });
    }

    // Prepare payload for Pathao
    const storeId = selectedStoreId || creds.storeId;
    if (!storeId) {
      return new Response(JSON.stringify({ error: "No store selected" }), { status: 400 });
    }

    const payload = {
      store_id: parseInt(storeId),
      merchant_order_id: order.orderName,
      recipient_name: order.firstName + " " + order.lastName,
      recipient_phone: order.shippingPhone || order.contactPhone,
      recipient_address: order.shippingAddress || "",
      delivery_type: 48, // Normal
      item_type: 2, // Parcel
      item_quantity: 1, // You may need to calculate from products
      item_weight: 0.5, // Default; could be made configurable
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

        return new Response(JSON.stringify({ success: true, consignmentId, trackingLink }), {
          headers: { "Content-Type": "application/json" },
        });
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
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } else if (actionType === "unhold") {
    // Remove hold
    await prisma.courierOrderHold.deleteMany({
      where: { orderName, courierName: "pathao" },
    });
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400 });
}

// ---------- Component ----------
export default function PathaoDashboard() {
  const { orders, credentialsConfigured, defaultStoreId, stores } = useLoaderData();
  const fetcher = useFetcher();
  const [selectedStore, setSelectedStore] = useState(defaultStoreId || "");
  const [codInputs, setCodInputs] = useState({});
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    // In a real app, you might call an API to sync from Shopify
    // For now, just reload the page
    window.location.reload();
  };

  const handleSend = (orderName, defaultCod) => {
    const cod = codInputs[orderName] !== undefined ? codInputs[orderName] : defaultCod;
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

  const handleHold = (orderName, currentHold) => {
    fetcher.submit(
      {
        actionType: currentHold ? "unhold" : "hold",
        orderName,
      },
      { method: "post", encType: "application/json" }
    );
  };

  if (!credentialsConfigured) {
    return (
      <s-box background="critical" padding="base" borderRadius="base">
        <s-heading level="3">Pathao Not Configured</s-heading>
        <s-text>Please configure Pathao credentials in the welcome page first.</s-text>
      </s-box>
    );
  }

  return (
    <s-stack gap="base">
      <s-heading level="2">Pathao Courier Dashboard</s-heading>

      {/* Store selector (if multiple stores) */}
      {stores.length > 1 && (
        <s-box background="soft" padding="base" borderRadius="base">
          <s-stack direction="inline" gap="small" align="center">
            <label>Select Pickup Store:</label>
            <select value={selectedStore} onChange={(e) => setSelectedStore(e.target.value)}>
              {stores.map((store) => (
                <option key={store.store_id} value={store.store_id}>
                  {store.store_name}
                </option>
              ))}
            </select>
          </s-stack>
        </s-box>
      )}

      {/* Sync button */}
      <s-stack direction="inline" gap="small" align="center">
        <s-button onClick={handleSync} disabled={syncing}>
          {syncing ? "Syncing..." : "Sync Unfulfilled Orders"}
        </s-button>
      </s-stack>

      {/* Orders table */}
      <s-box background="base" border="base" borderRadius="base" padding="base">
        <s-heading level="3">Unfulfilled Orders</s-heading>
        <s-table>
          <thead>
            <tr>
              <th>Order Name</th>
              <th>Customer</th>
              <th>Phone</th>
              <th>Order Date</th>
              <th>Total</th>
              <th>COD Amount</th>
              <th>Consignment ID</th>
              <th>Status</th>
              <th>Tracking Link</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const defaultCod = parseFloat(order.totalPrice);
              const codValue = codInputs[order.orderName] !== undefined ? codInputs[order.orderName] : defaultCod;
              return (
                <tr key={order.orderName}>
                  <td>{order.orderName}</td>
                  <td>{order.firstName} {order.lastName}</td>
                  <td>{order.shippingPhone || order.contactPhone}</td>
                  <td>{new Date(order.orderTime).toLocaleString()}</td>
                  <td>{defaultCod.toFixed(2)}</td>
                  <td>
                    <input
                      type="number"
                      value={codValue}
                      onChange={(e) =>
                        setCodInputs({ ...codInputs, [order.orderName]: e.target.value })
                      }
                      disabled={order.shipment}
                      style={{ width: "100px" }}
                    />
                  </td>
                  <td>{order.shipment?.consignmentId || "-"}</td>
                  <td>{order.shipment?.status || (order.hold ? "On Hold" : "Pending")}</td>
                  <td>
                    {order.shipment?.trackingLink ? (
                      <a href={order.shipment.trackingLink} target="_blank" rel="noreferrer">
                        Track
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    <s-stack direction="inline" gap="small">
                      <s-button
                        size="small"
                        onClick={() => handleSend(order.orderName, defaultCod)}
                        disabled={order.shipment || fetcher.state !== "idle"}
                      >
                        Send
                      </s-button>
                      <s-button
                        size="small"
                        onClick={() => handleHold(order.orderName, order.hold)}
                        disabled={order.shipment || fetcher.state !== "idle"}
                      >
                        {order.hold ? "Unhold" : "Hold"}
                      </s-button>
                    </s-stack>
                  </td>
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr>
                <td colSpan={10} style={{ textAlign: "center" }}>
                  No unfulfilled orders found.
                </td>
              </tr>
            )}
          </tbody>
        </s-table>
      </s-box>

      {/* Cancelled orders subsection (you can add similar table) */}
      <s-box background="base" border="base" borderRadius="base" padding="base">
        <s-heading level="3">Cancelled Orders</s-heading>
        {/* You can add a similar table for cancelled orders, maybe with limited columns */}
      </s-box>

      {/* Search by order name */}
      <s-box background="soft" padding="base" borderRadius="base">
        <s-heading level="3">Send Specific Order</s-heading>
        <s-stack direction="inline" gap="small">
          <input type="text" placeholder="Enter order name (e.g., #Mehwish3328)" />
          <s-button>Fetch & Send</s-button>
        </s-stack>
      </s-box>
    </s-stack>
  );
}