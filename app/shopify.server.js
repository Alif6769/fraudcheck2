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
import { fetchTelegramNames } from '../app/services/telegramMicroservice.service.js';

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
      // Create default settings for this shop
      await prisma.shopSettings.upsert({
        where: { shop: session.shop },
        update: {},
        create: { shop: session.shop },
      });
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
export async function syncOrders(
  session,
  admin,
  options = {}
) {
  try {
    const {
      fetchLimit = 100,
      reportLimit = 10,
      fraudspyEnabled = true,
      steadfastEnabled = true,
      // allSources = false,
    } = options;

    // 1. Fetch recent orders from Shopify
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    const dateQuery = `created_at:>=${tenDaysAgo.toISOString()}`;

    const GET_ORDERS = `
      query getOrders($query: String!, $first: Int!) {
        orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              sourceName
              createdAt
              totalPriceSet { shopMoney { amount } }
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

    const response = await admin.graphql(GET_ORDERS, {
      variables: { query: dateQuery, first: fetchLimit },
    });
    const { data } = await response.json();
    const orders = data?.orders?.edges || [];

    // 2. Clean and upsert orders
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

    // Instead of three separate queries, fetch the latest reportLimit orders
    const latestOrders = await prisma.order.findMany({
      where: {
        shop: session.shop,
        NOT: { shippingPhone: null },
      },
      orderBy: { orderTime: 'desc' },
      take: reportLimit,
    });

    // Now process each order individually
    for (const order of latestOrders) {
      const { source, shippingPhone, fraudReport, steadFastReport, realName1, realName2 } = order;

      // Determine if we should run fraud checks
      const shouldRunFraud = (fraudspyEnabled || source === 'web') && 
        shippingPhone &&
        !fraudReport;

      const shouldRunSteadfast = (steadfastEnabled || source === 'web') && 
        shippingPhone &&
        !steadFastReport;

      const shouldRunTelegram = shippingPhone && !realName1;

      // Run tasks (you can use Promise.allSettled for both)
      const tasks = [];
      if (shouldRunFraud) {
        tasks.push(
          fetchFraudReport(shippingPhone)
            .then(result => ({ type: 'fraud', result }))
            .catch(error => ({ type: 'fraud', error: error.message }))
        );
      }
      if (shouldRunSteadfast) {
        tasks.push(
          fetchSteadfastReport(shippingPhone)
            .then(result => ({ type: 'steadfast', result }))
            .catch(error => ({ type: 'steadfast', error: error.message }))
        );
      }
      if (shouldRunTelegram) {
        tasks.push(
          fetchTelegramNames(shippingPhone)
            .then(result => ({ type: 'telegram', result }))
            .catch(error => ({ type: 'telegram', error: error.message }))
        );
      }

      if (tasks.length > 0) {
        const results = await Promise.allSettled(tasks);
        // Build updateData and persist
        const updateData = {};
        for (const res of results) {
          if (res.status === 'fulfilled') {
            const { type, result } = res.value;
            if (error) {
                // Service failed – log with type
                console.error(`❌ ${type} failed:`, error);
              } else {
                // Success – add to updateData
                if (type === 'fraud') {
                  updateData.fraudReport = result;
                } else if (type === 'steadfast') {
                  updateData.steadFastReport = result;
                } else if (type === 'telegram') {
                  updateData.realName1 = result.name1;
                  updateData.realName2 = result.name2;
                }
              }
          } else {
            console.error(`❌ Service failed:`, res.reason?.message);
          }
        }
        if (Object.keys(updateData).length > 0) {
          await prisma.order.update({
            where: { orderName: order.orderName },
            data: updateData,
          });
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
