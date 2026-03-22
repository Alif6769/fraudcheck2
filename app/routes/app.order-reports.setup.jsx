// app/routes/app.order-reports.setup.jsx
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
}

export default function Setup() {
  // You could use the loader data if needed, but not required for placeholder
  return (
    <s-stack gap="base">
      <s-heading level="2">Setup</s-heading>
      <s-text>Configure your order reports settings here.</s-text>
      <s-text>Placeholder – add your configuration options.</s-text>
    </s-stack>
  );
}