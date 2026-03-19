// app/hooks/useAuthenticatedFetch.js
import {useMemo} from "react";
import {useAppBridge} from "@shopify/app-bridge-react";
import {authenticatedFetch} from "@shopify/app-bridge/utilities";

export function useAuthenticatedFetch() {
  const app = useAppBridge();

  // authenticatedFetch returns a fetch-like function that already
  // handles session tokens and Authorization headers
  return useMemo(() => {
    return authenticatedFetch(app);
  }, [app]);
}