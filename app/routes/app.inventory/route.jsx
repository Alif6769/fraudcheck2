// app/routes/app.inventory/route.jsx

import {
  Outlet,
  useNavigate,
  useLocation,
  redirect,
} from "react-router";

import {
  Navigation,
  Page,
} from "@shopify/polaris";

import {
  InventoryIcon,
  OrderIcon,
  ChartVerticalIcon,
} from "@shopify/polaris-icons";

export async function loader({ request }) {
  const url = new URL(request.url);

  // Redirect from /app/inventory to the first tab
  if (url.pathname === "/app/inventory") {
    return redirect("/app/inventory/product-mapping");
  }

  return null;
}

export default function InventoryLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    {
      label: "Product Mapping",
      icon: InventoryIcon,
      onClick: () => navigate("product-mapping"),
      selected: location.pathname.includes("/product-mapping"),
    },
    {
      label: "Today's Inventory",
      icon: InventoryIcon,
      onClick: () => navigate("todays-inventory"),
      selected: location.pathname.includes("/todays-inventory"),
    },
    {
      label: "Manual Sell & Return",
      icon: OrderIcon,
      onClick: () => navigate("manual-sell-return"),
      selected: location.pathname.includes("/manual-sell-return"),
    },
    {
      label: "Analysis",
      icon: ChartVerticalIcon,
      onClick: () => navigate("analysis"),
      selected: location.pathname.includes("/analysis"),
    },
  ];

  const navigationMarkup = (
    <Navigation location={location.pathname}>
      <Navigation.Section
        title="Inventory Management"
        items={navItems}
      />
    </Navigation>
  );

  // This content is rendered INSIDE the Frame defined in app.jsx
  return (
    <Page
      title="Inventory"
      secondaryActions={[]} // or any actions you want
    >
      {/* You can render the navigation somewhere appropriate inside the page */}
      {navigationMarkup}

      {/* Child routes: product-mapping, todays-inventory, etc. */}
      <Outlet />
    </Page>
  );
}