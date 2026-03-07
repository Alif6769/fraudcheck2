// app/routes/app._index.jsx
import { authenticate, syncOrders } from "../shopify.server";
import prisma from "../db.server";
import OrdersDashboard from "../components/OrdersDashboard"; // ✅ import the component

/* =========================
   ACTION (Sync Orders)
========================= */
export const action = async ({ request }) => {
  try {
    const { session, admin } = await authenticate.admin(request);
    const count = await syncOrders(session, admin);
    return new Response(
      JSON.stringify({ success: true, synced: count }),
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
   COMPONENT (now imported)
========================= */
export default OrdersDashboard; // ✅ re‑export the component

/* =========================
   HEADERS (unchanged)
========================= */
export const headers = () => ({});