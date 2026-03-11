// app/routes/app.inventory.product-mapping.jsx
import { useLoaderData, useFetcher } from "react-router";
import { useState, useEffect, useMemo } from "react";
import prisma from "../db.server";

/* =========================
   LOADER – fetches all products
========================= */
export async function loader() {
  const products = await prisma.product.findMany({
    orderBy: { productName: "asc" },
  });
  return { products };
}

/* =========================
   ACTION – handles product deletion (and future sync)
========================= */
export async function action({ request }) {
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "delete") {
    const id = formData.get("id");
    await prisma.product.delete({ where: { id } });
    return { success: true };
  }

  // You can add a "sync-products" actionType later if you need it.
  // For now we just return 400 for unsupported actions.
  return new Response("Invalid action", { status: 400 });
}

/* =========================
   HELPERS
========================= */

function parseComboReference(comboRef) {
  try {
    return comboRef ? JSON.parse(comboRef) : [];
  } catch {
    return [];
  }
}

function renderComponents(product, products) {
  if (!product.isCombo) return "—";

  const components = parseComboReference(product.comboReference);
  if (components.length === 0) return "No components";

  return components
    .map((comp) => {
      const refProduct = products.find((p) => p.productId === comp.productId);
      const name = refProduct ? refProduct.productName : `ID: ${comp.productId}`;
      return `${name} (x${comp.quantity})`;
    })
    .join(", ");
}

function renderRootProduct(product, products) {
  if (!product.isDuplicate || !product.rootProductId) return "—";

  const root = products.find((p) => p.productId === product.rootProductId);
  if (!root) return `Root ID: ${product.rootProductId}`;

  return (
    <s-link href={`/app/inventory/product-mapping/edit/${root.id}`}>
      {root.productName}
    </s-link>
  );
}

function getTypeBadge(product) {
  if (product.isCombo) {
    return <s-badge tone="info">Combo</s-badge>;
  }
  if (product.isDuplicate) {
    return <s-badge tone="caution">Duplicate</s-badge>;
  }
  return <s-badge tone="success">Raw</s-badge>;
}

/* =========================
   COMPONENT
========================= */
export default function ProductMapping() {
  const { products } = useLoaderData();
  const fetcher = useFetcher();

  const [search, setSearch] = useState("");

  const isSubmitting = fetcher.state === "submitting";
  const currentAction = fetcher.submission?.formData?.get("actionType") || null;

  const deleteProduct = (id) => {
    if (!confirm("Are you sure you want to delete this product?")) return;
    fetcher.submit(
      { actionType: "delete", id },
      { method: "post" }
    );
  };

  // Client-side filtering by search term (name/description)
  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;

    return products.filter((p) => {
      const name = (p.productName || "").toLowerCase();
      const desc = (p.description || "").toLowerCase();
      return name.includes(term) || desc.includes(term);
    });
  }, [products, search]);

  return (
    <s-page heading="Product mapping" inlineSize="large">
      <s-section padding="base">
        <s-stack gap="base">
          {/* Top row: Search bar (left) + Buttons (right) */}
          <s-stack
            direction="inline"
            gap="base"
            justifyContent="space-between"
            alignItems="center"
          >
            {/* Search field */}
            <s-search-field
              name="query"
              value={search}
              onInput={(event) =>
                setSearch(event.currentTarget.value || "")
              }
              placeholder="Search products"
            />

            {/* Right-side buttons */}
            <s-stack direction="inline" gap="small">
              {/* Sync products (placeholder action) */}
              <s-button
                variant="secondary"
                loading={isSubmitting && currentAction === "sync-products"}
                onClick={() => {
                  // later you can implement sync logic:
                  // fetcher.submit({ actionType: "sync-products" }, { method: "post" });
                  alert("Sync products not implemented yet.");
                }}
              >
                Sync products
              </s-button>

              {/* Add product */}
              <s-button
                variant="primary"
                href="/app/inventory/product-mapping/add"
              >
                Add product
              </s-button>
            </s-stack>
          </s-stack>

          {/* Table or empty state */}
          {filteredProducts.length === 0 ? (
            <s-paragraph>No products found.</s-paragraph>
          ) : (
            <s-table>
              <s-table-header-row>
                <s-table-header>Product name</s-table-header>
                <s-table-header>Description</s-table-header>
                <s-table-header>Price</s-table-header>
                <s-table-header>Stock</s-table-header>
                <s-table-header>Category</s-table-header>
                <s-table-header>Type</s-table-header>
                <s-table-header>Components / Root product</s-table-header>
                <s-table-header>Base datetime</s-table-header>
                <s-table-header>Actions</s-table-header>
              </s-table-header-row>

              <s-table-body>
                {filteredProducts.map((product) => (
                  <s-table-row key={product.id}>
                    <s-table-cell>
                      <s-text type="strong">{product.productName}</s-text>
                    </s-table-cell>

                    <s-table-cell>
                      {product.description || "—"}
                    </s-table-cell>

                    <s-table-cell>
                      {typeof product.price === "number"
                        ? `$${product.price.toFixed(2)}`
                        : "—"}
                    </s-table-cell>

                    <s-table-cell>
                      {product.quantity}
                    </s-table-cell>

                    <s-table-cell>
                      {product.inventoryCategory || "—"}
                    </s-table-cell>

                    <s-table-cell>
                      {getTypeBadge(product)}
                    </s-table-cell>

                    <s-table-cell>
                      {product.isCombo && renderComponents(product, products)}
                      {product.isDuplicate && renderRootProduct(product, products)}
                      {!product.isCombo && !product.isDuplicate && "—"}
                    </s-table-cell>

                    <s-table-cell>
                      {product.baseDatetime
                        ? new Date(product.baseDatetime).toLocaleString()
                        : "—"}
                    </s-table-cell>

                    <s-table-cell>
                      <s-stack direction="inline" gap="small">
                        {/* Edit button */}
                        <s-button
                          variant="secondary"
                          href={`/app/inventory/product-mapping/edit/${product.id}`}
                        >
                          Edit
                        </s-button>

                        {/* Delete button */}
                        <s-button
                          variant="tertiary"
                          tone="critical"
                          loading={
                            isSubmitting &&
                            currentAction === "delete" &&
                            fetcher.submission?.formData?.get("id") === product.id
                          }
                          onClick={() => deleteProduct(product.id)}
                        >
                          Delete
                        </s-button>
                      </s-stack>
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}