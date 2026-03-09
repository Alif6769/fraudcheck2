// app/routes/app.sheet-sync.jsx
import { authenticate } from "../shopify.server";
import { sheetQueue } from "../queues/sheetQueue.server";

export const action = async ({ request }) => {
  try {
    // This will validate the embedded admin session (cookies + shop context)
    const { session } = await authenticate.admin(request);

    if (!session || !session.shop) {
      console.error("Sheet sync: missing session or shop on session");
      return new Response(
        JSON.stringify({
          success: false,
          error: "No valid Shopify session found for this shop.",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // Enqueue a "today" export job for this shop
    await sheetQueue.add("export-today", {
      type: "export-today",
      shop: session.shop,
    });

    return new Response(
      JSON.stringify({ success: true, message: "Sheet sync started" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    // --- IMPORTANT: handle auth redirects thrown by authenticate.admin ---
    //
    // In a Shopify CLI Remix app, authenticate.admin(request) *throws* a
    // Response (usually a redirect to /auth/login) when the session is invalid.
    // We don't want the embedded iframe following that redirect (which can
    // cause "accounts.shopify.com refused to connect"), so we translate that
    // into a JSON error for the fetcher.
    if (error instanceof Response) {
      console.error(
        "Sheet sync: authenticate.admin threw a Response (likely a redirect). " +
          `status=${error.status}, url=${error.headers.get("Location") || ""}`,
      );

      // Optional: you can inspect error.status here if you want to handle
      // 401 vs 302 differently.
      return new Response(
        JSON.stringify({
          success: false,
          error: "Authentication failed. Please reload the app and try again.",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // Any other kind of error (programming / runtime)
    console.error("Sheet sync error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || "Unexpected error while syncing sheet.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};

// This route is "action-only" – no UI
export default function SheetSync() {
  return null;
}