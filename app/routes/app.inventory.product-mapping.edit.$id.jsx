// app/routes/app.inventory.product-mapping.edit.$id.jsx
import { useLoaderData } from "react-router";

export async function loader({ params }) {
  return { id: params.id || params.productId };
}

export default function DebugEdit() {
  const { id } = useLoaderData();
  return (
    <s-page heading="DEBUG EDIT PAGE" inlineSize="large">
      <s-section padding="base">
        <s-heading>Edit route is working</s-heading>
        <s-paragraph>Param id: {id}</s-paragraph>
      </s-section>
    </s-page>
  );
}