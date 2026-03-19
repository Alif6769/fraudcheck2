// app/hooks/useAuthenticatedFetch.js
import {useMemo} from "react";
import {useAppBridge} from "@shopify/shopify-app-react-router/react";
import {authenticatedFetch} from "@shopify/app-bridge-utils";

export function useAuthenticatedFetch() {
  const app = useAppBridge();

  return useMemo(() => {
    // authenticatedFetch returns a fetch-like function that already
    // attaches Authorization headers using a session token
    return authenticatedFetch(app);
  }, [app]);
}