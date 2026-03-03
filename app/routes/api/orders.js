// app/routes/api/orders.js
import prisma from "../../db.server";
import { authenticate } from "../../shopify.server";

export async function getOrders(req, res) {
  try {
    // For embedded app requests, get shop from query params
    const url = new URL(req.url, `https://${req.headers.host}`);
    const shopParam = url.searchParams.get("shop");

    const { session } = shopParam
      ? await authenticate.admin(req, shopParam)
      : await authenticate.admin(req);

    const orders = await prisma.order.findMany({
      where: { shop: session.shop },
      orderBy: { orderDate: "desc" },
    });

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ orders, shop: session.shop }));
  } catch (err) {
    console.error("API orders error:", err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  }
}