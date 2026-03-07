// app/routes/webhooks.orders.create.jsx
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { orderQueue, ORDER_QUEUE_NAME } from "../queues/orderQueue.server";

export const action = async ({ request }) => {
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);

    console.log(`📦 Order created webhook received from ${shop}`);
    console.log(`Order ID: ${payload.id}`);
    console.log(`Order number: #${payload.order_number}`);

    const orderId = payload.id.toString();
    const orderTime = new Date(payload.created_at);

    // Customer details
    const customerId = payload.customer?.id?.toString() || null;
    const firstName = payload.customer?.first_name || null;
    const lastName = payload.customer?.last_name || null;
    const contactPhone = payload.customer?.phone || null;

    // Shipping details
    const shippingPhone = payload.shipping_address?.phone || null;
    const shippingAddress = payload.shipping_address
      ? JSON.stringify(payload.shipping_address)
      : null;

    // Total price
    const totalPrice = payload.total_price || "0";

    // Shipping fee
    let shippingFee = "0";
    if (payload.total_shipping_price_set?.shop_money?.amount) {
      shippingFee = payload.total_shipping_price_set.shop_money.amount;
    } else if (payload.shipping_lines && payload.shipping_lines.length > 0) {
      shippingFee = payload.shipping_lines
        .reduce((sum, line) => sum + parseFloat(line.price || "0"), 0)
        .toString();
    }

    // Products
    const products = (payload.line_items || []).map((item) => ({
      id: item.id,
      title: item.title,
      quantity: item.quantity,
      price: item.price,
      variant_id: item.variant_id,
      product_id: item.product_id,
      sku: item.sku,
    }));

    // Build order data
    const orderData = {
      orderId,
      orderName: payload.name,
      shop,
      orderTime,
      customerId,
      firstName,
      lastName,
      contactPhone,
      shippingPhone,
      shippingAddress,
      totalPrice,
      shippingFee,
      products,
    };

    // Upsert basic order data immediately
    const { fraudReport, steadFastReport, realName1, realName2, ...orderWithoutReports } = orderData;
    await prisma.order.upsert({
      where: { orderName: orderData.orderName },
      create: orderData,
      update: orderWithoutReports, // don't overwrite enrichment fields
    });

    // Fetch the shop's current settings
    const settings = await prisma.shopSettings.findUnique({
      where: { shop },
    });

    // Default values if not set yet
    const jobOptions = {
      fraudspyEnabled: settings?.fraudspyEnabled ?? true,
      steadfastEnabled: settings?.steadfastEnabled ?? true,
      // telegramEnabled: settings?.telegramEnabled ?? true,
      allSources: settings?.allSources ?? false,
    };

    // Enqueue job with options
    await orderQueue.add("process-order", {
      orderName: orderData.orderName,
      orderId: orderData.orderId,
      shop,
      shippingPhone: orderData.shippingPhone,
      source: payload.source_name || null,
      ...jobOptions,
    });

    const source = payload.source_name || null;

    // Enqueue a background job for the slow work
    await orderQueue.add("process-order", {
      orderName: orderData.orderName,
      orderId: orderData.orderId,
      shop,
      shippingPhone,
      source,
    });

    console.log(`✅ Order #${payload.order_number} saved and enqueued for enrichment`);
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
    return new Response(error.message, { status: 500 });
  }
};