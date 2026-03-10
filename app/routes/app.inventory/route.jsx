import { Outlet, useNavigate, useLocation, redirect } from "react-router";
import { Frame, Navigation } from "@shopify/polaris";
import {
  InventoryIcon,
  OrderIcon,
  ChartVerticalIcon
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

  return (
    <Frame showTopBar={false} navigation={navigationMarkup}>
      <Outlet />
    </Frame>
  );
}