// app/routes/app.courier.jsx
import { Outlet, useNavigate, useLocation, redirect } from "react-router";

// Minimal placeholder components
function Welcome() {
  return (
    <s-stack gap="base">
      <s-heading level="2">Welcome (minimal)</s-heading>
      <s-text>This is the welcome page. Setup forms will go here later.</s-text>
    </s-stack>
  );
}

function PathaoConfig() {
  return (
    <s-stack gap="base">
      <s-heading level="2">Pathao Dashboard (minimal)</s-heading>
      <s-text>Placeholder for Pathao order management.</s-text>
    </s-stack>
  );
}

function SteadfastConfig() {
  return (
    <s-stack gap="base">
      <s-heading level="2">Steadfast Dashboard (minimal)</s-heading>
      <s-text>Placeholder for Steadfast order management.</s-text>
    </s-stack>
  );
}

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
                <s-link href="/app">Home</s-link>
                <s-link href="/app/courier">Courier</s-link>
              </s-stack>

              <Outlet />
            </s-stack>
          </s-section>
        </s-grid>
      </s-section>
    </s-page>
  );
}