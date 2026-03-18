import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const url = new URL(request.url);
  const orderName = url.searchParams.get("name");

  if (!orderName) {
    return new Response(JSON.stringify({ error: "Order name required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Try UnfulfilledOrder first, then Order
  let order = await prisma.unfulfilledOrder.findUnique({
    where: { orderName },
  });

  if (!order) {
    order = await prisma.order.findUnique({
      where: { orderName },
    });
  }

  if (!order) {
    return new Response(JSON.stringify({ error: "Order not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ order }), {
    headers: { "Content-Type": "application/json" },
  });
}

export function action() {
  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
}