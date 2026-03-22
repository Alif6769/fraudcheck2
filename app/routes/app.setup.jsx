import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import Setup from "../components/Setup";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  // You can fetch any settings here if needed
  return { shop: session.shop };
};

export default function SetupPage() {
  // You could also use useLoaderData if you need shop info
  return (
    <s-page heading="Setup" inlineSize="large">
      <s-section padding="base">
        <s-stack gap="base">
          {/* Top‑level navigation (consistent with other pages) */}
          <s-stack direction="inline" gap="small">
            <s-link href="/app">Order Reports</s-link>
            <s-link href="/app/inventory">Inventory</s-link>
            <s-link href="/app/courier">Courier Services</s-link>
            <s-link href="/app/setup">Setup</s-link>
          </s-stack>

          {/* Setup content */}
          <s-stack gap="base">
            <s-heading level="2">Setup</s-heading>
            <s-text>Configure your order reports settings here.</s-text>
            <s-text>Placeholder – add your configuration options.</s-text>
            </s-stack>
        </s-stack>
      </s-section>
    </s-page>
  );
}