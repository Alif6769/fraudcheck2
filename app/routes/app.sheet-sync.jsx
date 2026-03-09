// app/routes/app.sheet-sync.jsx

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

    // Dynamically import the server-only queue module
    const { sheetQueue } = await import("../queues/sheetQueue.server");

    await sheetQueue.add("export-today", {
      type: "export-today",
      shop,
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

// This route is "action-only" – nothing for the client to render
export default function SheetSync() {
  return null;
}