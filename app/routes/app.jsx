import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
// Import Polaris translations (English as default)
import enTranslations from '@shopify/polaris/locales/en.json';

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider
      i18n={enTranslations}
      // Optional: Add linkComponent for React Router if needed
      // linkComponent={CustomLinkComponent}
    >
      <s-app-nav>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/inventory">Inventory</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Error boundary remains the same
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};