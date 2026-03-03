// app/routes/webhooks.orders.create.jsx
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// imports for different services
import { getCustomerStats } from "../services/shopify.service";
// import { checkFraudPhone } from "../services/fraudspy.service";
// import { appendOrderToSheet } from "../services/sheets.service";

export const action = async ({ request }) => {
  try {
    // Verify the webhook is from Shopify
    const { topic, shop, payload, admin } = await authenticate.webhook(request);
    
    console.log(`📦 Order created webhook received from ${shop}`);
    console.log(`Order ID: ${payload.id}`);
    console.log(`Order number: #${payload.order_number}`);

    // 1️⃣ Extract
    const shippingPhone = payload.shipping_address?.phone || null;
    const customerId = payload.customer?.id;

    const customerFullName =
      `${payload.customer?.first_name || ""} ${payload.customer?.last_name || ""}`.trim() || null;

    // 2️⃣ Get stats
    let customerStats = null;

    if (customerId) {
      customerStats = await getCustomerStats(admin, customerId);
    }
    
    // Extract and format order data
    const orderData = {
      shop,
      orderId: payload.id.toString(),
      orderNumber: payload.order_number,
      name: payload.name, // Shopify order name (e.g., "#1001")
      totalPrice: parseFloat(payload.total_price),
      subtotalPrice: parseFloat(payload.subtotal_price),
      totalTax: parseFloat(payload.total_tax),
      currency: payload.currency,
      financialStatus: payload.financial_status,
      fulfillmentStatus: payload.fulfillment_status,
      cancelReason: payload.cancel_reason,
      
      // Customer information
      customerEmail: payload.email,
      customerFirstName: payload.customer?.first_name,
      customerLastName: payload.customer?.last_name,
      customerId: payload.customer?.id?.toString(),
      
      // Shipping and billing
      shippingAddress: payload.shipping_address ? JSON.stringify(payload.shipping_address) : null,
      billingAddress: payload.billing_address ? JSON.stringify(payload.billing_address) : null,

      // 👇 Add your custom extracted fields
      shippingPhone,
      customerFullName,
      // shippingAddress,

      // 👇 Add customer stats safely
      customerTotalOrders: parseInt(customerStats?.totalOrders) || 0,
      customerFulfilledOrders: Number(customerStats?.fulfilledOrders) || 0,
      
      // Line items (products)
      lineItems: JSON.stringify(payload.line_items || []),
      
      // Discounts and shipping lines
      discountCodes: JSON.stringify(payload.discount_codes || []),
      shippingLines: JSON.stringify(payload.shipping_lines || []),
      
      // Timestamps
      orderDate: new Date(payload.created_at),
      updatedAt: new Date(payload.updated_at),
      processedAt: payload.processed_at ? new Date(payload.processed_at) : null,
      
      // Raw data for reference
      rawData: JSON.stringify(payload),
    };

    // Save to database
    const savedOrder = await prisma.order.upsert({
      where: { 
        orderId_shop: {
          orderId: orderData.orderId,
          shop: orderData.shop
        }
      },
      update: orderData,
      create: orderData,
    });

    console.log(`✅ Order #${orderData.orderNumber} saved to database`);

    // You can add custom logic here
    // For example: fraud detection, inventory sync, etc.
    // if (parseFloat(payload.total_price) > 1000) {
    //   console.log(`⚠️ High-value order detected: $${payload.total_price}`);
    //   // Send notification email, create alert, etc.
    // }

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
    return new Response(error.message, { status: 500 });
  }
};

// Handle GET requests (Shopify sends POST, but this is for testing)
export const loader = async ({ request }) => {
  return new Response("Orders webhook endpoint is ready", { status: 200 });
};