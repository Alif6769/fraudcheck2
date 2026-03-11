import {
  Outlet,
  useLoaderData,
  useNavigate,
  useLocation,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisAppProvider, Frame, Navigation } from "@shopify/polaris";
import { HomeIcon, InventoryIcon } from "@shopify/polaris-icons";
import enTranslations from "@shopify/polaris/locales/en.json";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();
  const navigate = useNavigate();
  const location = useLocation();

  const navigationItems = [
    {
      label: "Home",
      icon: HomeIcon,
      onClick: () => navigate("/app"),
      selected: location.pathname === "/app",
    },
    {
      label: "Inventory",
      icon: InventoryIcon,
      onClick: () => navigate("/app/inventory"),
      selected: location.pathname.startsWith("/app/inventory"),
    },
  ];

  return (
    <ShopifyAppProvider isEmbedded apiKey={apiKey}>
      <PolarisAppProvider i18n={enTranslations}>
        {/* Frame with showTopBar={false} – no duplicate top bar */}
        <Frame navigation={<Navigation location={location.pathname}><Navigation.Section items={navigationItems} /></Navigation>} showTopBar={false}>
          <Outlet />
        </Frame>
      </PolarisAppProvider>
    </ShopifyAppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = boundary.headers;