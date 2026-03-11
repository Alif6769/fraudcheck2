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
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="inventory-sidebar w-[200px] bg-white shadow-lg">
        <div className="p-4 border-b">
          <h1 className="text-lg font-semibold">Inventory</h1>
        </div>
        <nav className="p-2">
          {navItems.map((item) => (
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                `block w-full text-left px-4 py-2 rounded-lg mb-1 truncate ${isActive ? 'active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}