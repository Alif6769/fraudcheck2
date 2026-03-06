import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { fetchFraudReport } from './services/fraudspy.service';
import { fetchSteadfastReport } from './services/steadfast.service';

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
      orderName: payload.name,        // ✅ this is correct
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
      where: { orderName: orderData.orderName },   // ✅ FIXED
      update: orderData,
      create: orderData,
    });

    // Determine source – Shopify uses `source_name`
    const source = payload.source_name || null;

    if (source === 'web' && shippingPhone) {
      // Check what reports we already have for this order
      const existing = await prisma.order.findUnique({
        where: { orderName: orderData.orderName },
        select: { fraudReport: true, steadFastReport: true },
      });

      // Prepare fetch tasks only for missing reports
      const fetchTasks = [];

      if (!existing?.fraudReport) {
        fetchTasks.push(
          fetchFraudReport(shippingPhone)
            .then(result => ({ type: 'fraud', result }))
            .catch(error => ({ type: 'fraud', error: error.message }))
        );
      } else {
        console.log(`⏭️ FraudSpy report already exists for order ${orderId}, skipping`);
      }

      if (!existing?.steadFastReport) {
        fetchTasks.push(
          fetchSteadfastReport(shippingPhone)
            .then(result => ({ type: 'steadfast', result }))
            .catch(error => ({ type: 'steadfast', error: error.message }))
        );
      } else {
        console.log(`⏭️ Steadfast report already exists for order ${orderId}, skipping`);
      }

      // Prepare update object – start with source only
      const updateData = { source };

      if (fetchTasks.length > 0) {
        // Run all needed fetches concurrently
        const results = await Promise.all(fetchTasks);

        for (const res of results) {
          if (res.error) {
            // Fetch failed for this service
            console.error(`❌ ${res.type === 'fraud' ? 'FraudSpy' : 'Steadfast'} failed for order ${orderId}:`, res.error);
          } else {
            // Success – add report to updateData
            if (res.type === 'fraud') {
              updateData.fraudReport = res.result;
              console.log(`✅ FraudSpy report saved for order ${orderId}`);
            } else {
              updateData.steadFastReport = res.result;
              console.log(`✅ Steadfast report saved for order ${orderId}`);
            }
          }
        }
      } else {
        console.log(`⏭️ Both reports already exist for order ${orderId}, no API calls made`);
      }

      // Update the order with any new reports (and source)
      await prisma.order.update({
        where: { orderName: orderData.orderName },
        data: updateData,
      });
    } else {
      // Not a web order or no shipping phone – just store the source
      await prisma.order.update({
        where: { orderName: orderData.orderName },
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