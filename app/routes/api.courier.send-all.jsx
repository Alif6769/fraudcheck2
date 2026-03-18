// app/routes/api.courier.send-all.jsx
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { decrypt } from "../../utils/encryption.js";
import axios from "axios";

export async function action({ request }) {
  try {
    const { session } = await authenticate.admin(request);
    const shopDomain = session.shop;

    const { storeId, orders } = await request.json();
    if (!storeId || !Array.isArray(orders)) {
      return new Response(
        JSON.stringify({ error: "Invalid payload" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get Pathao service and credentials
    const pathaoService = await prisma.courierService.findUnique({
      where: { name: "pathao" },
    });
    if (!pathaoService) {
      return new Response(
        JSON.stringify({ error: "Pathao service not found" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const creds = await prisma.shopCourierCredentials.findUnique({
      where: {
        shopDomain_courierServiceId: {
          shopDomain,
          courierServiceId: pathaoService.id,
        },
      },
    });
    if (!creds) {
      return new Response(
        JSON.stringify({ error: "Pathao not configured" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const accessToken = decrypt(creds.accessToken);
    const results = [];

    // Process each order sequentially
    for (const item of orders) {
      const { orderName, codAmount } = item;
      try {
        // Fetch the order from UnfulfilledOrder
        const order = await prisma.unfulfilledOrder.findUnique({
          where: { orderName },
        });
        if (!order) {
          results.push({ orderName, success: false, error: "Order not found" });
          continue;
        }

        // Clean phone number
        let phone = order.shippingPhone || order.contactPhone || "";
        phone = phone.replace(/\D/g, "");
        if (phone.length >= 11) {
          phone = phone.slice(-11);
        } else if (phone.length === 10) {
          phone = "0" + phone;
        } else {
          results.push({ orderName, success: false, error: "Invalid phone number" });
          continue;
        }

        // Clean address
        let address = order.shippingAddress || "";
        try {
          const addrObj = JSON.parse(address);
          const parts = [
            addrObj.address1,
            addrObj.address2,
            addrObj.city,
            addrObj.province,
            addrObj.country,
          ].filter(Boolean);
          address = parts.join(", ");
        } catch {
          // already plain string
        }

        const payload = {
          store_id: parseInt(storeId),
          merchant_order_id: order.orderName,
          recipient_name: order.firstName + " " + order.lastName,
          recipient_phone: phone,
          recipient_address: address,
          delivery_type: 48,
          item_type: 2,
          item_quantity: 1,
          item_weight: 0.5,
          amount_to_collect: parseFloat(codAmount) || parseFloat(order.totalPrice),
          item_description: "Order from " + order.orderName,
        };

        const response = await axios.post(
          "https://api-hermes.pathao.com/aladdin/api/v1/orders",
          payload,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (response.data.code === 200) {
          const consignmentId = response.data.data.consignment_id;
          const trackingLink = `https://merchant.pathao.com/tracking?consignment_id=${consignmentId}&phone=${phone}`;

          // Create shipment record
          await prisma.courierShipment.create({
            data: {
              orderName,
              courierName: "pathao",
              consignmentId,
              trackingLink,
              status: response.data.data.order_status,
              response: response.data,
            },
          });

          // Remove any existing hold
          await prisma.courierOrderHold.deleteMany({
            where: { orderName, courierName: "pathao" },
          });

          results.push({
            orderName,
            success: true,
            consignmentId,
            trackingLink,
          });
        } else {
          results.push({
            orderName,
            success: false,
            error: response.data.message || "Pathao order failed",
          });
        }
      } catch (error) {
        console.error(`Error processing order ${orderName}:`, error);
        results.push({
          orderName,
          success: false,
          error: error.message || "Unknown error",
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Send all error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export function loader() {
  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
}