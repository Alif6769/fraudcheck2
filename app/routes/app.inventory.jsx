import { Outlet, useNavigate, useLocation, redirect } from "react-router";
import { Navigation, Card } from "@shopify/polaris";
import {
  ProductIcon,
  InventoryIcon,
  OrderIcon,
  ChartVerticalIcon,
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
      label: "Inventory Analysis",
        icon: ChartVerticalIcon,
        onClick: () => navigate("/inventory-analysis"),
      selected: location.pathname.includes("/inventory-analysis"),
    },
    {
      label: "Today's Inventory",
        icon: InventoryIcon,
        onClick: () => navigate("/todays-inventory"),
      selected: location.pathname.includes("/todays-inventory"),
    },
    {
      label: "Manual Sell",
        icon: OrderIcon,
        onClick: () => navigate("/manual-sell"),
      selected: location.pathname.includes("/manual-sell"),
    },
    {
      label: "Return",
        icon: OrderIcon,
        onClick: () => navigate("/return"),
      selected: location.pathname.includes("/return"),
    },
    {
      label: "Damage",
        icon: OrderIcon,
        onClick: () => navigate("/damage"),
      selected: location.pathname.includes("/damage"),
    },
  ];

  const navigationMarkup = (
    <Navigation location={location.pathname}>
      <Navigation.Section items={navItems} />
    </Navigation>
  );

  return (
    <Frame>  {/* ← Add Frame here */}
      <s-page heading="Inventory" inlineSize="large">
        <s-section padding="base">
          <s-grid gridTemplateColumns="240px 1fr" gap="base">
            <Card padding="0">
              {navigationMarkup}
            </Card>
            <s-section padding="none">
              <s-stack gap="base">
                <s-stack direction="inline" gap="small">
                  <s-link href="/app">Home</s-link>
                  <s-link href="/app/inventory">Inventory</s-link>
                </s-stack>
                <Outlet />
              </s-stack>
            </s-section>
          </s-grid>
        </s-section>
      </s-page>
    </Frame>
  );
}