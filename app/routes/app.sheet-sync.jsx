// app/routes/app.sheet-sync.jsx
import { authenticate } from "../shopify.server";
import { sheetQueue } from "../queues/sheetQueue.server";

// app/routes/app.sheet-sync.jsx
import { sheetQueue } from "../queues/sheetQueue.server";

export const action = async ({ request }) => {
  try {
    // Get shop from the query string
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");

    if (!shop) {
      console.error("Sheet sync: missing shop query param");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing shop parameter.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Optionally: perform a sanity check that this shop exists in your DB
    // (so a random POST can’t enqueue jobs for arbitrary shops)
    // const existingShopSettings = await prisma.shopSettings.findUnique({ where: { shop } });
    // if (!existingShopSettings) { ... }

    await sheetQueue.add("export-today", {
      type: "export-today",
      shop, // use the shop from the authenticated page's loader
    });

    return new Response(
      JSON.stringify({ success: true, message: "Sheet sync started" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
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

export default function SheetSync() {
  return null;
}