// app/routes/api.sync.unfulfilled.jsx
import { authenticate } from "../shopify.server";
import { updateUnfulfilledOrders } from "../services/inventory.server"; // adjust import path if needed

export async function action({ request }) {
  try {
    const { session, admin } = await authenticate.admin(request);
    const shop = session.shop;

    // Call the sync function
    const orders = await updateUnfulfilledOrders(shop, admin);

    return new Response(
      JSON.stringify({
        success: true,
        count: orders.length,
        message: `Synced ${orders.length} unfulfilled orders.`,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Sync failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// Only POST allowed
export function loader() {
  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
}