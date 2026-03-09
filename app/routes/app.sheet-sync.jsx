import { authenticate } from "../shopify.server";
import { sheetQueue } from "../queues/sheetQueue.server";

export const action = async ({ request }) => {
  try {
    // authenticate.admin will now see the shop from the URL query parameter
    const { session } = await authenticate.admin(request);
    
    // Add a job to the sheet queue for this shop
    await sheetQueue.add("export-today", {
      type: "export-today",
      shop: session.shop, // important: filter by shop in the worker
    });

    return new Response(
      JSON.stringify({ success: true, message: "Sheet sync started" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    // If the error is a redirect (like 302 to login), return a JSON error instead
    if (error instanceof Response) {
      return new Response(
        JSON.stringify({ success: false, error: "Authentication failed" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    console.error("Sheet sync error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

// React Router requires a default export, even if it's just a dummy component
export default function SheetSync() {
  return null; // This route doesn't render anything, only handles actions
}