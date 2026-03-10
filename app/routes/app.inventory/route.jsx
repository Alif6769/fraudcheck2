import { Outlet, NavLink, useNavigate, useLocation, redirect } from "react-router";
import { Card, Navigation as PolarisNavigation } from "@shopify/polaris";
import {
  ProductIcon,
  InventoryIcon,
  OrderIcon,
  ChartVerticalIcon
} from "@shopify/polaris-icons";

export async function loader({ request }) {
  const url = new URL(request.url);
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
      icon: ProductIcon,
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

  return (
    <div style={{ display: "flex", gap: "20px" }}>
      <Card style={{ width: "240px", padding: "10px" }}>
        <PolarisNavigation location={location.pathname}>
          <PolarisNavigation.Section items={navItems} />
        </PolarisNavigation>
      </Card>
      <div style={{ flex: 1 }}>
        <Outlet />
      </div>
    </div>
  );
}