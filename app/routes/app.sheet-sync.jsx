import { authenticate } from "../shopify.server";
import { sheetQueue } from "../queues/sheetQueue.server";

export const action = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    // Enqueue a job to export today's orders for this shop
    await sheetQueue.add("export-today", {
      type: "export-today",
      shop: session.shop, // important: pass shop to filter orders
    });
    return new Response(
      JSON.stringify({ success: true, message: "Sheet sync started" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Sheet sync error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

// No loader needed