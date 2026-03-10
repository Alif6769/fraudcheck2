import { Outlet, useLoaderData, useNavigate, useLocation, Link } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { Frame, Navigation, TopBar } from "@shopify/polaris";
import { HomeIcon, InventoryIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import enTranslations from '@shopify/polaris/locales/en.json';

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

  const navigationMarkup = (
    <Navigation location={location.pathname}>
      <Navigation.Section items={navigationItems} />
    </Navigation>
  );

  return (
    <AppProvider i18n={enTranslations}>
      <Frame navigation={navigationMarkup}>
        <Outlet />
      </Frame>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};