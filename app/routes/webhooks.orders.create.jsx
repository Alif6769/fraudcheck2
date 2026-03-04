export const action = async ({ request }) => {
  try {
    const { topic, shop, payload, admin } = await authenticate.webhook(request);
    
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

    // Build order data – including the new orderName field
    const orderData = {
      orderId,
      orderName: payload.name,        // ✅ Added this line
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

    await prisma.order.upsert({
      where: { orderId },
      update: orderData,
      create: orderData,
    });

    // Determine source – Shopify uses `source_name` (e.g., "web", "pos", "admin")
    const source = payload.source_name || null;

    // Only fetch fraud report if source is "web" and we have a shipping phone
    if (source === 'web' && shippingPhone) {
      try {
        const { fetchFraudReport } = await import('../services/fraudspy.service');
        const report = await fetchFraudReport(shippingPhone);
        // Update the order with the report
        await prisma.order.update({
          where: { orderId },
          data: { fraudReport: report, source },
        });
        console.log(`✅ Fraud report saved for order ${orderId}`);
      } catch (error) {
        console.error(`❌ Fraud report failed for order ${orderId}:`, error.message);
        // Optionally store error in a separate field or just log
      }
    } else {
      // Still store the source even if no report
      await prisma.order.update({
        where: { orderId },
        data: { source },
      });
    }

    console.log(`✅ Order #${payload.order_number} saved to database`);
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
    return new Response(error.message, { status: 500 });
  }
};