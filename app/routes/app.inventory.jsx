// app/routes/app.inventory.jsx
import { Outlet, NavLink, redirect } from "react-router";

export async function loader({ request }) {
  const url = new URL(request.url);
  if (url.pathname === "/app/inventory") {
    return redirect("/app/inventory/product-mapping");
  }
  return null;
}

export default function InventoryLayout() {
  const navItems = [
    { to: "product-mapping", label: "Product Mapping" },
    { to: "todays-inventory", label: "Today's Inventory" },
    { to: "manual-sell-return", label: "Manual Sell & Return" },
    { to: "analysis", label: "Analysis" },
  ];

  return (
    <s-page heading="Inventory" inlineSize="large">
      <s-section padding="base">
        {/* 200px sidebar + main content using Polaris Grid */}
        <s-grid gridTemplateColumns="200px 1fr" gap="base">
          {/* Sidebar container */}
          <s-box
            background="base"
            border="base"
            borderRadius="base"
            padding="small"
          >
            <s-heading>Inventory S</s-heading>

            {/* Nav items – we still use NavLink for routing, 
                but layout is done via Polaris stack. */}
            <s-stack gap="small" paddingBlockStart="small">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    [
                      "block w-full text-left px-3 py-2 rounded",
                      isActive ? "bg-black text-white" : "bg-transparent",
                    ].join(" ")
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </s-stack>
          </s-box>

          {/* Main content area */}
          <s-section padding="none">
            <s-stack gap="base">
              {/* Optional shared nav row for consistency with Home */}
              <s-stack direction="inline" gap="small">
                <s-link href="/app">Home</s-link>
                <s-link href="/app/inventory">Inventory</s-link>
              </s-stack>

              {/* Nested inventory routes (product-mapping, etc.) render here */}
              <Outlet />
            </s-stack>
          </s-section>
        </s-grid>
      </s-section>
    </s-page>
  );
}