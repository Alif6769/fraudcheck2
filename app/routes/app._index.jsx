// app/routes/app._index.jsx
import { authenticate, syncOrders, syncSheetForToday  } from "../shopify.server";
import prisma from "../db.server";
import OrdersDashboard from "../components/OrdersDashboard"; // ✅ import the component

/* =========================
   ACTION (Sync Orders / Sync Sheet)
========================= */
export const action = async ({ request }) => {
  try {
    const { session, admin } = await authenticate.admin(request);
    const formData = await request.formData();

    const intent = formData.get("intent") || "sync-orders";

    if (intent === "sync-sheet") {
      // Just enqueue the sheet sync for this shop
      await syncSheetForToday(session.shop);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Sheet sync started",
          intent,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Default: sync orders (existing logic)
    const options = {
      fetchLimit: parseInt(formData.get("fetchLimit") || "100", 10),
      reportLimit: parseInt(formData.get("reportLimit") || "10", 10),
      fraudspyEnabled: formData.get("fraudspyEnabled") === "on",
      steadfastEnabled: formData.get("steadfastEnabled") === "on",
      // allSources: formData.get('allSources') === 'on',
    };

    // Save settings for this shop
    await prisma.shopSettings.upsert({
      where: { shop: session.shop },
      update: options,
      create: { shop: session.shop, ...options },
    });

    const count = await syncOrders(session, admin, options);
    return new Response(
      JSON.stringify({ success: true, synced: count, intent }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("❌ /app action failed:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
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
    const settings = await prisma.shopSettings.findUnique({
      where: { shop: session.shop },
    });
    return { 
      orders, 
      shop: session.shop, 
      settings: settings || {}  // fallback to empty object if not found
    };
  } catch (error) {
    console.error("❌ Loader error:", error);
    throw new Response("Failed to load orders", { status: 500 });
  }
};

/* =========================
   COMPONENT (now imported)
========================= */
export default OrdersDashboard; // ✅ re‑export the component

/* =========================
   HEADERS (unchanged)
========================= */
export const headers = () => ({});