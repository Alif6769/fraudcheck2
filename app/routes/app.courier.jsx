// app/routes/app.courier.jsx
import { Outlet, useNavigate, useLocation, redirect } from "react-router";

export async function loader({ request }) {
  const url = new URL(request.url);
  if (url.pathname === "/app/courier") {
    return redirect("/app/courier/welcome");
  }
  return null;
}

export default function CourierLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { to: "welcome", label: "Welcome" },
    { to: "pathao", label: "Pathao" },
    { to: "steadfast", label: "Steadfast" },
    { to: "test", label: "Test" },
  ];

  return (
    <s-page heading="Courier Integration (test)" inlineSize="large">
      <s-section padding="base">
        <s-grid gridTemplateColumns="200px 1fr" gap="base">
          {/* Sidebar */}
          <s-box background="base" border="base" borderRadius="base" padding="small">
            <s-heading>Couriers</s-heading>
            <s-stack gap="small" paddingBlockStart="small">
              {navItems.map((item) => {
                const href = `/app/courier/${item.to}`;
                const isActive = location.pathname === href;

                return (
                  <s-clickable
                    key={item.to}
                    background={isActive ? "base" : "transparent"}
                    border={isActive ? "base" : "none"}
                    borderRadius="base"
                    padding="small-300"
                    onClick={() => navigate(item.to)}
                  >
                    <s-text type="strong" color={isActive ? "base" : "subdued"}>
                      {item.label}
                    </s-text>
                  </s-clickable>
                );
              })}
            </s-stack>
          </s-box>

          {/* Main content */}
          <s-section padding="none">
            <s-stack gap="base">
              {/* Breadcrumb */}
              <s-stack direction="inline" gap="small">
                <s-link href="/app/order-reports">Order Reports</s-link>
                <s-link href="/app/inventory">Inventory</s-link>
                <s-link href="/app/courier">Courier Services</s-link>
                <s-link href="/app/setup">Setup</s-link>
              </s-stack>

              <Outlet />
            </s-stack>
          </s-section>
        </s-grid>
      </s-section>
    </s-page>
  );
}