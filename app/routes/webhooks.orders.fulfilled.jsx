import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  try {
    // const { topic, shop, payload } = await authenticate.webhook(request);
    // console.log(`📦 Order fulfilled webhook received from ${shop}`);
    // console.log(`Order ID: ${payload.id}`);

    // // Import queues dynamically to avoid server‑only issues
    // const { orderQueue } = await import("../queues/orderQueue.server");

    // const orderId = payload.id.toString();
    // const orderName = payload.name; // e.g., "#1001"

    // // Determine overall fulfillment status from Shopify
    // // Possible values: "fulfilled", "partial", "unfulfilled"
    // const fulfillmentStatus = payload.displayFulfillmentStatus?.toLowerCase() || null;

    // // Get the most recent fulfillment date
    // let fulfilledAt = null;
    // if (payload.fulfillments && payload.fulfillments.length > 0) {
    //   const fulfillmentDates = payload.fulfillments.map(f => new Date(f.created_at));
    //   fulfilledAt = new Date(Math.max(...fulfillmentDates));
    // }

    // // Update the order in the database
    // const existingOrder = await prisma.order.findUnique({
    //   where: { orderName },
    // });

    // if (!existingOrder) {
    //   console.warn(`⚠️ Order ${orderName} not found in DB – creating minimal record`);
    //   // Optionally create a minimal order record if missing
    //   await prisma.order.create({
    //     data: {
    //       orderId,
    //       orderName,
    //       shop,
    //       orderTime: new Date(payload.created_at),
    //       fulfillmentStatus,
    //       fulfilledAt,
    //       products: payload.line_items || [],
    //       // other fields can be left null; they may be filled later by sync
    //     },
    //   });
    // } else {
    //   await prisma.order.update({
    //     where: { orderName },
    //     data: {
    //       fulfillmentStatus,
    //       fulfilledAt,
    //     },
    //   });
    // }

    // Enqueue a job to process transactions for this order
    // await orderQueue.add("process-fulfillment", {
    //   orderName,
    //   shop,
    //   fulfilledAt: fulfilledAt?.toISOString(),
    // });

    // console.log(`✅ Order ${orderName} fulfillment recorded and job enqueued`);
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("❌ Order fulfilled webhook error:", error);
    return new Response(error.message, { status: 500 });
  }
};