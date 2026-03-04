import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { DeliveryMethod } from "@shopify/shopify-app-react-router/server";

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
// SYNC ORDERS FUNCTION
// ============================
export async function syncOrders(session, admin) {
  const tenDaysAgo = new Date();
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
  const dateQuery = `created_at:>=${tenDaysAgo.toISOString()}`;

  const GET_ORDERS = `
    query getOrders($query: String!) {
      orders(first: 100, query: $query) {
        edges { node {
          id
          createdAt
          totalPriceSet { shopMoney { amount } }
          customer { id firstName lastName phone }
          shippingAddress { address1 city country phone }
          shippingLines(first:1) { edges { node { priceSet { shopMoney { amount } } } } }
          lineItems(first:20) { edges { node { title quantity } } }
        } }
      }
    }
  `;

  const result = await admin.graphql(GET_ORDERS, { variables: { query: dateQuery } });
  const orders = result.orders.edges;

  const cleanedOrders = orders.map(({ node }) => ({
    orderId: node.id,
    orderTime: node.createdAt,
    customerId: node.customer?.id || null,
    firstName: node.customer?.firstName || null,
    lastName: node.customer?.lastName || null,
    contactPhone: node.customer?.phone || null,
    shippingPhone: node.shippingAddress?.phone || null,
    shippingAddress: node.shippingAddress?.address1 || null,
    totalPrice: node.totalPriceSet.shopMoney.amount,
    shippingFee: node.shippingLines.edges[0]?.node.priceSet.shopMoney.amount || 0,
    products: node.lineItems.edges.map((item) => ({
      title: item.node.title,
      quantity: item.node.quantity,
    })),
    shop: session.shop,
  }));

  for (const order of cleanedOrders) {
    await prisma.order.upsert({
      where: { orderId: order.orderId },
      update: order,
      create: order,
    });
  }

  console.log(`✅ Synced ${cleanedOrders.length} orders for ${session.shop}`);
  return cleanedOrders.length;
}

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
