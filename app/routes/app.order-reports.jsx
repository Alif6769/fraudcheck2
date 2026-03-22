// app/routes/app.order-reports.jsx (layout)
import { Outlet, useLocation } from "react-router";

// No loader needed here – the children will have their own loaders
export default function OrderReportsLayout() {
  const location = useLocation();
  const isSetupPage = location.pathname === "/app/order-reports/setup";

  return (
    <s-page heading="Order Reports" inlineSize="large">
      <s-section style={{ width: "100%", padding: 0 }}>
        {/* Top‑level navigation */}
        <s-stack direction="inline" gap="small" style={{ marginBottom: "1rem" }}>
          <s-link href="/app/order-reports">Order Reports</s-link>
          <s-link href="/app/inventory">Inventory</s-link>
          <s-link href="/app/courier">Courier Services</s-link>
        </s-stack>

        {/* Sub‑navigation */}
        <s-stack direction="inline" gap="small" style={{ marginBottom: "1rem" }}>
          <s-link
            href={`/app/order-reports${location.search}`}
            style={{
              fontWeight: !isSetupPage ? "bold" : "normal",
              textDecoration: "none",
              color: !isSetupPage ? "#008060" : "#666",
              borderBottom: !isSetupPage ? "2px solid #008060" : "none",
              padding: "8px 12px",
            }}
          >
            Order Reports
          </s-link>
          <s-link
            href={`/app/order-reports/setup${location.search}`}
            style={{
              fontWeight: isSetupPage ? "bold" : "normal",
              textDecoration: "none",
              color: isSetupPage ? "#008060" : "#666",
              borderBottom: isSetupPage ? "2px solid #008060" : "none",
              padding: "8px 12px",
            }}
          >
            Setup
          </s-link>
        </s-stack>

        {/* Child routes (index and setup) render here */}
        <Outlet />
      </s-section>
    </s-page>
  );
}