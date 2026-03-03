// app/routes/api/orders/route.jsx
import prisma from "../../../db.server";
import { authenticate } from "../../../shopify.server";

// Loader for React Router route
export async function loader({ request }) {
  try {
    // Get shop from query params if embedded in Shopify
    const url = new URL(request.url);
    const shopParam = url.searchParams.get("shop");

    const { session } = shopParam
      ? await authenticate.admin(request, shopParam)
      : await authenticate.admin(request);

    const orders = await prisma.order.findMany({
      where: { shop: session.shop },
      orderBy: { orderDate: "desc" },
    });

    return new Response(JSON.stringify({ orders, shop: session.shop }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Orders API loader error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// This route has no UI
export default function OrdersRoute() {
  return null;
}