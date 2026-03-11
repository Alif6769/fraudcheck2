import { useLoaderData, useFetcher } from "react-router";
import { useState, useEffect, useRef } from "react";
import prisma from "../db.server";

// Loader – fetches all products from the database
export async function loader() {
  const products = await prisma.product.findMany({
    orderBy: { productName: "asc" },
  });
  return { products };
}

// Action – handles product deletion
export async function action({ request }) {
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "delete") {
    const id = formData.get("id");
    await prisma.product.delete({ where: { id } });
    return { success: true };
  }

  return new Response("Invalid action", { status: 400 });
}

export default function ProductMapping() {
  const { products } = useLoaderData();
  const fetcher = useFetcher();

  // State for selected resources (simulates useIndexResourceState)
  const [selectedResources, setSelectedResources] = useState([]);
  const tableRef = useRef(null);

  const deleteProduct = (id) => {
    if (!confirm("Are you sure?")) return;
    fetcher.submit({ actionType: "delete", id }, { method: "post" });
  };

  // Helper to parse comboReference JSON safely
  const parseComboReference = (comboRef) => {
    try {
      return comboRef ? JSON.parse(comboRef) : [];
    } catch {
      return [];
    }
  };

  // Render combo components (plain text now)
  const renderComponents = (product) => {
    if (!product.isCombo) return "—";
    const components = parseComboReference(product.comboReference);
    if (components.length === 0) return "No components";
    return components.map(comp => {
      const refProduct = products.find(p => p.productId === comp.productId);
      const name = refProduct ? refProduct.productName : `ID: ${comp.productId}`;
      return `${name} (x${comp.quantity})`;
    }).join(", ");
  };

  // Render root product for duplicates (as link)
  const renderRootProduct = (product) => {
    if (!product.isDuplicate || !product.rootProductId) return "—";
    const root = products.find(p => p.productId === product.rootProductId);
    if (!root) return `Root ID: ${product.rootProductId}`;
    return <a href={`/app/inventory/product-mapping/edit/${root.id}`} class="s-link">{root.productName}</a>;
  };

  // Determine product type badge
  const getTypeBadge = (product) => {
    if (product.isCombo) return <s-badge status="info">Combo</s-badge>;
    if (product.isDuplicate) return <s-badge status="warning">Duplicate</s-badge>;
    return <s-badge status="success">Raw</s-badge>;
  };

  // Handle selection change from the index table
  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;

    const handleSelectionChange = (event) => {
      setSelectedResources(event.detail.selectedResources || []);
    };

    table.addEventListener("selection-change", handleSelectionChange);
    return () => table.removeEventListener("selection-change", handleSelectionChange);
  }, []);

  return (
    <s-page title="Products">
      <s-card padding="0">
        <s-index-table
          ref={tableRef}
          resource-name={{ singular: "product", plural: "products" }}
          item-count={products.length}
          selected-items-count={selectedResources.length === products.length ? "All" : selectedResources.length}
          headings={[
            "Product Name",
            "Description",
            "Price",
            "Stock",
            "Category",
            "Type",
            "Components / Root Product",
            "Base Datetime",
            "Actions",
          ]}
          loading={fetcher.state === "submitting"}
        >
          {products.map((product, index) => (
            <s-index-table-row
              key={product.id}
              id={product.id}
              selected={selectedResources.includes(product.id)}
              position={index}
            >
              <s-index-table-cell>
                <s-text variant="bodyMd" font-weight="bold">{product.productName}</s-text>
              </s-index-table-cell>
              <s-index-table-cell>{product.description || "—"}</s-index-table-cell>
              <s-index-table-cell>${product.price}</s-index-table-cell>
              <s-index-table-cell>{product.quantity}</s-index-table-cell>
              <s-index-table-cell>{product.inventoryCategory || "—"}</s-index-table-cell>
              <s-index-table-cell>{getTypeBadge(product)}</s-index-table-cell>
              <s-index-table-cell>
                {product.isCombo && renderComponents(product)}
                {product.isDuplicate && renderRootProduct(product)}
                {!product.isCombo && !product.isDuplicate && "—"}
              </s-index-table-cell>
              <s-index-table-cell>
                {product.baseDatetime ? new Date(product.baseDatetime).toLocaleString() : "—"}
              </s-index-table-cell>
              <s-index-table-cell>
                <s-button size="slim" onClick={() => deleteProduct(product.id)}>Delete</s-button>
                <a href={`/app/inventory/product-mapping/edit/${product.id}`} class="s-button s-button--slim">Edit</a>
              </s-index-table-cell>
            </s-index-table-row>
          ))}
        </s-index-table>
      </s-card>
      <s-button
        variant="primary"
        url="/app/inventory/product-mapping/add"
        style={{ marginTop: "1rem" }}
      >
        Add product
      </s-button>
    </s-page>
  );
}