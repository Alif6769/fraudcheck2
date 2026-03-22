// app/routes/app.inventory.jsx
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
    { to: "check-inventory", label: "Check Inventory" },
    { to: "todays-inventory", label: "Today's Inventory" },
    { to: "restock", label: "Restock" },
    { to: "return-manual-sell-damage", label: "Return, Damage & Manual Sell" },
    { to: "inventory-summary", label: "Inventory Summary" },
    { to: "analysis", label: "Analysis" },
  ];

  return (
    <s-page heading="Inventory" inlineSize="large">
      <s-section padding="base">
        <s-grid gridTemplateColumns="200px 1fr" gap="base">
          {/* Sidebar container */}
          <s-box
            background="base"
            border="base"
            borderRadius="base"
            padding="small"
          >
            <s-heading>Inventory</s-heading>

            {/* Vertical nav list */}
            <s-stack gap="small" paddingBlockStart="small">
              {navItems.map((item) => {
                const href = `/app/inventory/${item.to}`;
                const isActive = location.pathname === href;

                return (
                  <s-clickable
                    key={item.to}
                    // Use token-based background/border so it stays on-brand
                    background={isActive ? "base" : "transparent"}
                    border={isActive ? "base" : "none"}
                    borderRadius="base"
                    padding="small-300"
                    // Clicking navigates to nested route
                    onClick={() => navigate(item.to)}
                  >
                    <s-text
                      type="strong"
                      color={isActive ? "base" : "subdued"}
                    >
                      {item.label}
                    </s-text>
                  </s-clickable>
                );
              })}
            </s-stack>
          </s-box>

          {/* Main content area */}
          <s-section padding="none">
            <s-stack gap="base">
              {/* Top-level app nav row */}
              <s-stack direction="inline" gap="small">
                <s-link href="/app/order-reports">Order Reports</s-link>
                <s-link href="/app/inventory">Inventory</s-link>
                <s-link href="/app/courier">Courier Services</s-link>
              </s-stack>

              {/* Nested inventory routes render here */}
              <Outlet />
            </s-stack>
          </s-section>
        </s-grid>
      </s-section>
    </s-page>
  );
}