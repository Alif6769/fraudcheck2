// app/routes/app.order-reports.setup.jsx
import { useLoaderData, useLocation } from "react-router";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
}

export default function OrderReportsSetup() {
  const { shop } = useLoaderData();
  const location = useLocation();
  const isSetupPage = location.pathname === "/app/order-reports/setup";

  return (
    <s-page heading="Order Reports Setup" inlineSize="large">
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
            href="/app/order-reports"
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
            href="/app/order-reports/setup"
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

        {/* Setup content */}
        <s-stack gap="base">
          <s-heading level="2">Setup</s-heading>
          <s-text>Configure your order reports settings here.</s-text>
          <s-text>Placeholder – add your configuration options.</s-text>
        </s-stack>
      </s-section>
    </s-page>
  );
}