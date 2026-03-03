import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

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
      deliveryMethod: "http",
      callbackUrl: "/webhooks/orders/create",
    },
    ORDERS_UPDATED: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks/orders/update",
    },
    ORDERS_PAID: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks/orders/paid",
    },
    ORDERS_CANCELLED: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks/orders/cancelled",
    },
    ORDERS_FULFILLED: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks/orders/fulfilled",
    },
    // App uninstall webhook
    APP_UNINSTALLED: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks/app/uninstalled",
    },
    // Customer webhooks
    CUSTOMERS_CREATE: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks/customers/create",
    },
    CUSTOMERS_UPDATE: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks/customers/update",
    },
  },
  
  // Register webhooks after installation
  hooks: {
    afterAuth: async ({ session, admin, registerWebhooks }) => {
      // This will automatically register webhooks after app install
      await registerWebhooks({ session });
      console.log(`Webhooks registered for shop: ${session.shop}`);
    },
  },
  
  // future: {
  //   expiringOfflineAccessTokens: true,
  // },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
