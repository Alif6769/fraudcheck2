import { Outlet, useNavigate, useLocation, redirect } from "react-router";

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
    { to: "product-mapping", label: "Product Mapping" },
    { to: "todays-inventory", label: "Today's Inventory" },
    { to: "manual-sell-return", label: "Manual Sell & Return" },
    { to: "analysis", label: "Analysis" },
  ];

  return (
    <s-page heading="Inventory" inlineSize="large">
      <s-section padding="base">
        <s-grid gridTemplateColumns="200px 1fr" gap="base">
          {/* Sidebar container */}
          <s-box background="base" border="base" borderRadius="base" padding="small">
            <s-heading>Inventory</s-heading>
            <s-navigation>
              <s-navigation-section>
                {navItems.map((item) => (
                  <s-navigation-item
                    key={item.to}
                    label={item.label}
                    selected={location.pathname.includes(item.to)}
                    onClick={() => navigate(item.to)}
                  />
                ))}
              </s-navigation-section>
            </s-navigation>
          </s-box>

          {/* Main content area */}
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
  );
}