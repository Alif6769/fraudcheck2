import prisma from "../../db.server";
import { authenticate } from "../../shopify.server";

// Server-only route to fetch orders
export async function getOrders(req, res) {
  try {
    const { session } = await authenticate.admin(req);

    const orders = await prisma.order.findMany({
      where: { shop: session.shop },
      orderBy: { orderDate: "desc" },
    });

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ orders, shop: session.shop }));
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  }
}