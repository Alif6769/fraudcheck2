import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { decrypt } from "../../utils/encryption.js";
import axios from "axios";

export async function action({ request }) {
  try {
    const { session } = await authenticate.admin(request);
    const shopDomain = session.shop;

    const { orders } = await request.json();
    if (!Array.isArray(orders)) {
      return new Response(
        JSON.stringify({ error: "Invalid payload" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get Steadfast service and credentials
    const steadfastService = await prisma.courierService.findUnique({
      where: { name: "steadfast" },
    });
    if (!steadfastService) {
      return new Response(
        JSON.stringify({ error: "Steadfast service not found" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const creds = await prisma.shopCourierCredentials.findUnique({
      where: {
        shopDomain_courierServiceId: {
          shopDomain,
          courierServiceId: steadfastService.id,
        },
      },
    });
    if (!creds) {
      return new Response(
        JSON.stringify({ error: "Steadfast not configured" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const apiCreds = JSON.parse(decrypt(creds.credentials));
    const results = [];

    // Process each order sequentially
    for (const item of orders) {
      const { orderName, codAmount } = item;
      try {
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
          invoice: order.orderName,
          recipient_name: order.firstName + " " + order.lastName,
          recipient_phone: phone,
          recipient_address: address,
          cod_amount: parseFloat(codAmount) || parseFloat(order.totalPrice),
          note: "",
          alternative_phone: "",
          recipient_email: "",
          item_description: "Order from " + order.orderName,
        };

        const response = await axios.post(
          "https://portal.packzy.com/api/v1/create_order",
          payload,
          {
            headers: {
              "Api-Key": apiCreds.api_key,
              "Secret-Key": apiCreds.api_secret,
              "Content-Type": "application/json",
            },
          }
        );

        if (response.data.status === 200) {
          const consignmentId = response.data.consignment.consignment_id.toString();
          const trackingCode = response.data.consignment.tracking_code;
          const trackingLink = `https://steadfast.com.bd/t/${trackingCode}`;

          await prisma.courierShipment.create({
            data: {
              orderName,
              courierName: "steadfast",
              consignmentId,
              trackingCode,
              trackingLink,
              status: response.data.consignment.status,
              response: response.data,
            },
          });

          await prisma.courierOrderHold.deleteMany({
            where: { orderName, courierName: "steadfast" },
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
            error: response.data.message || "Steadfast order failed",
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