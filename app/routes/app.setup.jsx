// app/routes/app.setup.jsx
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
}

export default function Setup() {
  return (
    <s-page heading="Setup" inlineSize="large">
      <s-section padding="base">
        <s-stack gap="base">
          <s-text>Configure order reports settings here.</s-text>
          <s-text>Currently placeholder – add your configuration options.</s-text>
        </s-stack>
      </s-section>
    </s-page>
  );
}