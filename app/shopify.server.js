import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { DeliveryMethod } from "@shopify/shopify-app-react-router/server";
import { fetchFraudReport } from './services/fraudspy.service';
import { fetchSteadfastReport } from './services/steadfast.service';

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  // Add webhook configuration here
  webhooks: {
    // Order webhooks
    ORDERS_CREATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/orders/create",
    },
    // ORDERS_UPDATED: {
    //   deliveryMethod: DeliveryMethod.Http,
    //   callbackUrl: "/webhooks/orders/update",
    // },
    // ORDERS_PAID: {
    //   deliveryMethod: DeliveryMethod.Http,
    //   callbackUrl: "/webhooks/orders/paid",
    // },
    // ORDERS_CANCELLED: {
    //   deliveryMethod: DeliveryMethod.Http,
    //   callbackUrl: "/webhooks/orders/cancelled",
    // },
    // ORDERS_FULFILLED: {
    //   deliveryMethod: DeliveryMethod.Http,
    //   callbackUrl: "/webhooks/orders/fulfilled",
    // },
    // // App uninstall webhook
    // APP_UNINSTALLED: {
    //   deliveryMethod: DeliveryMethod.Http,
    //   callbackUrl: "/webhooks/app/uninstalled",
    // },
    // // Customer webhooks
    // CUSTOMERS_CREATE: {
    //   deliveryMethod: DeliveryMethod.Http,
    //   callbackUrl: "/webhooks/customers/create",
    // },
    // CUSTOMERS_UPDATE: {
    //   deliveryMethod: DeliveryMethod.Http,
    //   callbackUrl: "/webhooks/customers/update",
    // },
  },
  
  hooks: {
    afterAuth: async ({ session, admin }) => {  // ← you MUST include `admin`
      console.log("✅ afterAuth hook started for", session.shop);
      try {
        // ✅ Pass BOTH session and admin
        await shopify.registerWebhooks({ session, admin });
        console.log(`✅ Webhooks registered for shop: ${session.shop}`);
      } catch (error) {
        console.error("❌ Webhook registration failed:", error);
      }
    },
  },

  
  
  // future: {
  //   expiringOfflineAccessTokens: true,
  // },


  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});


// ============================
// SYNC ORDERS FUNCTION (FIXED)
// ============================
export async function syncOrders(session, admin) {
  const tenDaysAgo = new Date();
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
  const dateQuery = `created_at:>=${tenDaysAgo.toISOString()}`;

  const GET_ORDERS = `
    query getOrders($query: String!) {
      orders(first: 100, query: $query, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            sourceName
            createdAt
            totalPriceSet {
              shopMoney { amount }
            }
            customer {
              id
              firstName
              lastName
              defaultPhoneNumber { phoneNumber }
            }
            shippingAddress {
              address1
              city
              country
              phone
            }
            shippingLines(first: 10) {
              edges {
                node {
                  originalPriceSet { shopMoney { amount } }
                }
              }
            }
            lineItems(first: 20) {
              edges {
                node { title quantity }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await admin.graphql(GET_ORDERS, {
      variables: { query: dateQuery },
    });
    const { data } = await response.json();
    const orders = data?.orders?.edges || [];

    const cleanedOrders = orders.map(({ node }) => ({
      orderId: node.id,
      orderName: node.name,
      orderTime: node.createdAt,
      source: node.sourceName || null,
      customerId: node.customer?.id || null,
      firstName: node.customer?.firstName || null,
      lastName: node.customer?.lastName || null,
      contactPhone: node.customer?.defaultPhoneNumber?.phoneNumber || null,
      shippingPhone: node.shippingAddress?.phone || null,
      shippingAddress: node.shippingAddress ? JSON.stringify(node.shippingAddress) : null,
      totalPrice: String(node.totalPriceSet?.shopMoney?.amount ?? "0"),
      shippingFee: String(
        node.shippingLines?.edges?.[0]?.node?.originalPriceSet?.shopMoney?.amount ?? "0"
      ),
      products: (node.lineItems?.edges || []).map((item) => ({
        title: item.node.title,
        quantity: item.node.quantity,
      })),
      shop: session.shop,
    }));

    // Upsert all orders using orderName as the unique identifier
    for (const order of cleanedOrders) {
      const {
        fraudReport,        // eslint-disable-line @typescript-eslint/no-unused-vars
        steadFastReport,    // eslint-disable-line @typescript-eslint/no-unused-vars
        ...orderWithoutReports
      } = order;

      await prisma.order.upsert({
        where: { orderName: order.orderName },
        create: order, // it's fine if create includes them or not
        update: orderWithoutReports, // DO NOT overwrite existing reports
      });
    }

    const ordersNeedingFSReports = await prisma.order.findMany({
      where: {
        shop: session.shop,
        source: 'web',
        fraudReport: null,
        NOT: { shippingPhone: null }
      },
      orderBy: { orderTime: 'desc' },
      take: 10,
    });

    const ordersNeedingSteadFastReports = await prisma.order.findMany({
      where: {
        shop: session.shop,
        source: 'web',
        steadFastReport: null,
        NOT: { shippingPhone: null }
      },
      orderBy: { orderTime: 'desc' },
      take: 10,
    });


    for (const order of ordersNeedingFSReports) {
      const phone = order.shippingPhone;

      // FraudSpy
      if (!order.fraudReport) {
        try {
          const report = await fetchFraudReport(phone);
          await prisma.order.update({
            where: { orderName: order.orderName }, // ✅ use orderName here too
            data: { fraudReport: report },
          });
          console.log(`✅ FraudSpy synced for ${order.orderName}`);
        } catch (error) {
          console.error(`❌ FraudSpy failed for ${order.orderName}:`, error.message);
        }
      }
    }

    for (const order of ordersNeedingSteadFastReports) {
      const phone = order.shippingPhone;
      // Steadfast
      if (!order.steadFastReport) {
        try {
          const report = await fetchSteadfastReport(phone);
          await prisma.order.update({
            where: { orderName: order.orderName }, // ✅ use orderName here too
            data: { steadFastReport: report },
          });
          console.log(`✅ Steadfast synced for ${order.orderName}`);
        } catch (error) {
          console.error(`❌ Steadfast failed for ${order.orderName}:`, error.message);
        }
      }
    }

    console.log(`✅ Synced ${cleanedOrders.length} orders for ${session.shop}`);
    return cleanedOrders.length;
  } catch (error) {
    console.error(`❌ Sync failed for ${session.shop}:`, error);
    throw error;
  }
}

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
