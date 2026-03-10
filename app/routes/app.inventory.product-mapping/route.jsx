import { useLoaderData, useFetcher } from "react-router";
import { useState } from "react";
import prisma from "../../db.server";
import { Page } from "@shopify/polaris";

// SERVER: loader
export async function loader() {
  const products = await prisma.product.findMany({
    orderBy: { productName: "asc" },
  });
  return { products };
}

// SERVER: action
export async function action({ request }) {
  const formData = await request.formData();
  const productId = formData.get("productId");
  const actionType = formData.get("actionType");

  if (actionType === "update") {
    const rawProductFlag = formData.get("rawProductFlag") === "true";
    const isCombo = formData.get("isCombo") === "true";
    const isDuplicate = formData.get("isDuplicate") === "true";
    const rootProductId = formData.get("rootProductId") || null;
    const comboReference = formData.get("comboReference") || null;

    await prisma.product.update({
      where: { productId },
      data: {
        rawProductFlag,
        isCombo,
        isDuplicate,
        rootProductId,
        comboReference,
      },
    });

    return { success: true };
  }

  return new Response(
    JSON.stringify({ error: "Invalid action" }),
    { status: 400 },
  );
}

// CLIENT: component
export default function ProductMapping() {
  const { products } = useLoaderData();
  const [selectedProductId, setSelectedProductId] = useState(null);
  const fetcher = useFetcher();

  const selectedProduct = products.find(
    (p) => p.productId === selectedProductId,
  );

  const handleSave = (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    formData.append("actionType", "update");
    fetcher.submit(formData, { method: "post" });
  };

  return (
    <Page title="Product Mapping">
      <div className="flex">
        {/* Product list sidebar */}
        <div className="w-1/3 border-r p-4 overflow-auto">
          <h3 className="font-bold mb-2">Products</h3>
          <ul className="space-y-1">
            {products.map((product) => (
              <li
                key={product.productId}
                onClick={() => setSelectedProductId(product.productId)}
                className={`cursor-pointer p-2 rounded ${
                  selectedProductId === product.productId
                    ? "bg-blue-100"
                    : "hover:bg-gray-100"
                }`}
              >
                {product.productName}
                <span className="ml-2 text-xs text-gray-500">
                  {product.rawProductFlag && "🟢"}
                  {product.isCombo && "🔵"}
                  {product.isDuplicate && "🟠"}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Editor panel */}
        <div className="flex-1 p-4">
          {selectedProduct ? (
            <fetcher.Form method="post" onSubmit={handleSave}>
              <input
                type="hidden"
                name="productId"
                value={selectedProduct.productId}
              />
              <h2 className="text-xl font-bold mb-4">
                Edit: {selectedProduct.productName}
              </h2>

              {/* TODO: add actual inputs for rawProductFlag, isCombo, etc. */}
              {/* Example:
              <label>
                <input
                  type="checkbox"
                  name="rawProductFlag"
                  value="true"
                  defaultChecked={selectedProduct.rawProductFlag}
                />
                Raw product
              </label>
              */}

              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                disabled={fetcher.state === "submitting"}
              >
                {fetcher.state === "submitting" ? "Saving..." : "Save Changes"}
              </button>
            </fetcher.Form>
          ) : (
            <p className="text-gray-500">Select a product from the list.</p>
          )}
        </div>
      </div>
    </Page>
  );
}