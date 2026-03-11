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
        const updateData = {}; // ensure this is defined

        for (const res of results) {
          if (res.status === 'fulfilled') {
            const { type, result, error } = res.value; // ✅ include error
            if (error) {
              console.error(`❌ ${type} failed:`, error);
            } else {
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
            console.error(`❌ A service failed:`, res.reason?.message);
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

// ============================
// SYNC SHEET FUNCTION (NEW)
// ============================
export async function syncSheetForToday(shop) {
  try {
    // Optional: check that this shop is known / installed
    const shopSettings = await prisma.shopSettings.findUnique({
      where: { shop },
    });
    if (!shopSettings) {
      console.warn(`syncSheetForToday: No shopSettings found for ${shop}`);
      // You can choose to throw or just log
    }

    // Dynamically import the server-only queue, so this stays server-only
    const { sheetQueue } = await import("./queues/sheetQueue.server");

    await sheetQueue.add("export-today", {
      type: "export-today",
      shop,
    });

    console.log(`✅ Enqueued "export-today" sheet job for ${shop}`);
    return true;
  } catch (error) {
    console.error(`❌ syncSheetForToday failed for ${shop}:`, error);
    throw error;
  }
}

// ============================
// CLEAR SHEET FUNCTION
// ============================
export async function clearSheetForShop(shop) {
  try {
    const { sheetQueue } = await import("./queues/sheetQueue.server");
    await sheetQueue.add("clear-sheet", {
      type: "clear-sheet",
      shop,
    });
    console.log(`✅ Enqueued "clear-sheet" job for ${shop}`);
    return true;
  } catch (error) {
    console.error(`❌ clearSheetForShop failed for ${shop}:`, error);
    throw error;
  }
}

// ============================
// SYNC PRODUCTS FUNCTION
// ============================
export async function syncProducts(session, admin) {
  try {
    console.log(`🔄 Syncing products for shop: ${session.shop}`);
    let hasNextPage = true;
    let cursor = null;
    let syncedCount = 0;

    const PRODUCTS_QUERY = `
      query getProducts($first: Int!, $after: String) {
        products(first: $first, after: $after) {
          edges {
            cursor
            node {
              id
              title
              descriptionHtml
              createdAt
              updatedAt
              variants(first: 1) {
                edges {
                  node {
                    price
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
          }
        }
      }
    `;

    while (hasNextPage) {
      const response = await admin.graphql(PRODUCTS_QUERY, {
        variables: {
          first: 50, // fetch 50 per page (max 250)
          after: cursor,
        },
      });

      const { data } = await response.json();
      const products = data?.products?.edges || [];
      const pageInfo = data?.products?.pageInfo;

      // Process each product
      for (const { node } of products) {
        // Extract first variant price (or fallback to 0)
        const price = node.variants?.edges?.[0]?.node?.price
          ? parseFloat(node.variants.edges[0].node.price)
          : 0;

        await prisma.product.upsert({
          where: { productId: node.id },
          update: {
            productName: node.title,
            description: node.descriptionHtml || "",
            price: price,
            updatedAt: new Date(), // explicitly set, though Prisma @updatedAt might handle it
          },
          create: {
            productId: node.id,
            productName: node.title,
            description: node.descriptionHtml || "",
            price: price,
            quantity: 0, // default, will be updated via inventory sync
            createdAt: new Date(node.createdAt),
            updatedAt: new Date(node.updatedAt),
          },
        });
        syncedCount++;
      }

      hasNextPage = pageInfo?.hasNextPage || false;
      cursor = products.length > 0 ? products[products.length - 1].cursor : null;
    }

    console.log(`✅ Synced ${syncedCount} products for ${session.shop}`);
    return syncedCount;
  } catch (error) {
    console.error(`❌ Product sync failed for ${session.shop}:`, error);
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
