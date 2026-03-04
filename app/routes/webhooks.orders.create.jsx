// app/routes/webhooks.orders.create.jsx
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  try {
    // Verify the webhook is from Shopify
    const { topic, shop, payload, admin } = await authenticate.webhook(request);
    
    console.log(`📦 Order created webhook received from ${shop}`);
    console.log(`Order ID: ${payload.id}`);
    console.log(`Order number: #${payload.order_number}`);

    // --- Extract data according to the new Prisma schema ---
    const orderId = payload.id.toString();
    const orderTime = new Date(payload.created_at);
    
    // Customer details
    const customerId = payload.customer?.id?.toString() || null;
    const firstName = payload.customer?.first_name || null;
    const lastName = payload.customer?.last_name || null;
    const contactPhone = payload.customer?.phone || null; // customer's main phone, if any

    // Shipping details
    const shippingPhone = payload.shipping_address?.phone || null;
    const shippingAddress = payload.shipping_address
      ? JSON.stringify(payload.shipping_address)
      : null;

    // Total price (keep as string, e.g., "49.99")
    const totalPrice = payload.total_price || "0";

    // Shipping fee – try to get from total_shipping_price_set, otherwise sum shipping lines
    let shippingFee = "0";
    if (payload.total_shipping_price_set?.shop_money?.amount) {
      shippingFee = payload.total_shipping_price_set.shop_money.amount;
    } else if (payload.shipping_lines && payload.shipping_lines.length > 0) {
      shippingFee = payload.shipping_lines
        .reduce((sum, line) => sum + parseFloat(line.price || "0"), 0)
        .toString();
    }

    // Products – store as JSON array with relevant fields
    const products = (payload.line_items || []).map((item) => ({
      id: item.id,
      title: item.title,
      quantity: item.quantity,
      price: item.price,
      variant_id: item.variant_id,
      product_id: item.product_id,
      sku: item.sku,
    }));

    // Build the object that exactly matches the Prisma model
    const orderData = {
      orderId,
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
      products, // Prisma will automatically convert this to JSON
    };

    // Save to database – upsert using the unique orderId
    await prisma.order.upsert({
      where: { orderId }, // because orderId is marked @unique
      update: orderData,
      create: orderData,
    });

    console.log(`✅ Order #${payload.order_number} saved to database`);
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
    return new Response(error.message, { status: 500 });
  }
};

// Handle GET requests (for testing only)
export const loader = async ({ request }) => {
  return new Response("Orders webhook endpoint is ready", { status: 200 });
};