import { Outlet, NavLink, redirect } from "react-router";

export async function loader({ request }) {
  const url = new URL(request.url);

  // If the user hits /app/inventory exactly, redirect to the first tab
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
    <div className="min-h-screen flex">   {/* ← use min-h-screen instead of h-full */}
      <div className="w-64 border-r p-4 bg-gray-50 sticky top-0 h-screen">
        <h2 className="text-lg font-bold mb-4">Inventory Management</h2>
        <nav className="space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block p-2 rounded ${
                  isActive ? "bg-blue-100" : "hover:bg-gray-200"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Main content */}
      <div className="flex-1 p-4 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}