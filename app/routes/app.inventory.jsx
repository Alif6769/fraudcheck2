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
                const isActive = location.pathname.includes(item.to);

                return (
                  <button
                    key={item.to}
                    type="button"
                    onClick={() => navigate(item.to)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "none",
                      backgroundColor: isActive ? "var(--p-color-bg-surface-selected)" : "transparent",
                      color: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </s-stack>
          </s-box>

          {/* Main content area */}
          <s-section padding="none">
            <s-stack gap="base">
              {/* Top-level app nav row */}
              <s-stack direction="inline" gap="small">
                <s-link href="/app">Home</s-link>
                <s-link href="/app/inventory">Inventory</s-link>
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