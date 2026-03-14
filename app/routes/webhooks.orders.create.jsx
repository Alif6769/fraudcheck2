// app/routes/webhooks.orders.create.jsx
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);

    console.log(`📦 Order created webhook received from ${shop}`);
    console.log(`Order ID: ${payload.id}`);
    console.log(`Order number: #${payload.order_number}`);

    const { orderQueue } = await import("../queues/orderQueue.server");
    const { sheetQueue } = await import("../queues/sheetQueue.server");

    const orderId = payload.id.toString();
    const orderTime = new Date(payload.created_at);
    const updatedAt = payload.updated_at ? new Date(payload.updated_at) : null;
    const cancelledAt = payload.cancelled_at ? new Date(payload.cancelled_at) : null;
    const fulfilledAt = payload.fulfilled_at ? new Date(payload.fulfilled_at) : null;
    const fulfillmentStatus = payload.fulfillment_status || null; // might be "fulfilled", "partial", etc.

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

    // Products and productIds
    const lineItems = payload.line_items || [];
    const products = lineItems.map((item) => ({
      id: item.id,
      title: item.title,
      quantity: item.quantity,
      price: item.price,
      variant_id: item.variant_id,
      product_id: item.product_id,
      sku: item.sku,
    }));

    // Build productIds array (for efficient querying)
    const productIds = lineItems.map((item) => ({
      productId: item.product_id?.toString() || null,
      variantId: item.variant_id?.toString() || null,
      title: item.title,
      quantity: item.quantity,
    }));

    // Build order data including all fields
    const orderData = {
      orderId,
      orderName: payload.name,
      shop,
      orderTime,
      updatedAt,
      cancelledAt,
      fulfilledAt,
      fulfillmentStatus,
      customerId,
      firstName,
      lastName,
      contactPhone,
      shippingPhone,
      shippingAddress,
      totalPrice,
      shippingFee,
      products,
      productIds: productIds.length ? JSON.stringify(productIds) : null,
      source: payload.source_name || null,
      // Enrichment fields start as null
      fraudReport: null,
      steadFastReport: null,
      realName1: null,
      realName2: null,
    };

    // Upsert order data
    await prisma.order.upsert({
      where: { orderName: orderData.orderName },
      create: orderData,
      update: {
        // Update all fields except enrichment ones (they should be preserved)
        orderId: orderData.orderId,
        orderTime: orderData.orderTime,
        updatedAt: orderData.updatedAt,
        cancelledAt: orderData.cancelledAt,
        fulfilledAt: orderData.fulfilledAt,
        fulfillmentStatus: orderData.fulfillmentStatus,
        customerId: orderData.customerId,
        firstName: orderData.firstName,
        lastName: orderData.lastName,
        contactPhone: orderData.contactPhone,
        shippingPhone: orderData.shippingPhone,
        shippingAddress: orderData.shippingAddress,
        totalPrice: orderData.totalPrice,
        shippingFee: orderData.shippingFee,
        products: orderData.products,
        productIds: orderData.productIds,
        source: orderData.source,
        // Do not update fraudReport, steadFastReport, realName1, realName2
      },
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
      // allSources: settings?.allSources ?? false,
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

    try {
      await sheetQueue.add("export-single", {
        type: "export-single",
        orderName: orderData.orderName,
        shop: orderData.shop,
      });
    } catch (queueError) {
      console.error("Failed to enqueue sheet job for web hook:", queueError);
    }

    console.log(`✅ Order #${payload.order_number} saved and enqueued for enrichment`);
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
    return new Response(error.message, { status: 500 });
  }
};