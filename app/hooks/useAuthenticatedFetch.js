// app/hooks/useAuthenticatedFetch.js
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticatedFetch } from "@shopify/app-bridge-utils";

export function useAuthenticatedFetch() {
  const app = useAppBridge();
  const fetchFunction = authenticatedFetch(app);
  return async (url, options = {}) => {
    const response = await fetchFunction(url, options);
    return response;
  };
}