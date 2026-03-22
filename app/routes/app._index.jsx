// app/routes/app._index.jsx
import { useState } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate, syncOrders, syncSheetForToday, clearSheetForShop } from "../shopify.server";
import prisma from "../db.server";
import OrderReports from "./app.order-reports";
import Setup from "./app.setup";

// ---------- Action (existing + new hold handling) ----------
export const action = async ({ request }) => {
  try {
    const { session, admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent");

    // Handle hold/unhold actions from the OrderReports component
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
      return new Response(JSON.stringify({ success: true, message: "Sheet sync started", intent }));
    }
    if (intent === "clear-sheet") {
      await clearSheetForShop(session.shop);
      return new Response(JSON.stringify({ success: true, message: "Sheet clear started", intent }));
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
    return new Response(JSON.stringify({ success: true, synced: count, intent }));
  } catch (error) {
    console.error("❌ /app action failed:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
  }
};

// ---------- Loader (unchanged) ----------
export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    const orders = await prisma.order.findMany({
      where: { shop: session.shop },
      orderBy: { orderTime: "desc" },
    });
    // Also fetch hold status to pass to OrderReports
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

// ---------- Component ----------
export default function HomePage() {
  const { orders, shop, settings } = useLoaderData();
  const [activeTab, setActiveTab] = useState("reports"); // "reports" or "setup"

  return (
    <s-page heading="Orders dashboard" inlineSize="large">
      <s-section padding="base">
        <s-stack gap="base">
          {/* Top‑level navigation */}
          <s-stack direction="inline" gap="small">
            <s-link href="/app">Home</s-link>
            <s-link href="/app/inventory">Inventory</s-link>
            <s-link href="/app/courier">Courier Services</s-link>
          </s-stack>

          {/* Sub‑navigation for Home page */}
          <s-stack direction="inline" gap="small">
            <s-button
              onClick={() => setActiveTab("reports")}
              variant={activeTab === "reports" ? "primary" : "secondary"}
            >
              Order Reports
            </s-button>
            <s-button
              onClick={() => setActiveTab("setup")}
              variant={activeTab === "setup" ? "primary" : "secondary"}
            >
              Setup
            </s-button>
          </s-stack>

          {/* Content based on active sub‑tab */}
          {activeTab === "reports" ? (
            <OrderReports orders={orders} shop={shop} />
          ) : (
            <Setup />
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}