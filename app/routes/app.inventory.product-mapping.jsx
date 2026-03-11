import { useLoaderData, useFetcher } from "react-router";
import { Link, useNavigate } from "react-router";
import { Page, Card, Button, IndexTable, useIndexResourceState, Text, Badge } from "@shopify/polaris";
import prisma from "../../db.server";

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

  const deleteProduct = (id) => {
    if (!confirm("Are you sure?")) return;
    fetcher.submit({ actionType: "delete", id }, { method: "post" });
  };

  const resourceName = { singular: "product", plural: "products" };
  const { selectedResources, allResourcesSelected, handleSelectionChange } = useIndexResourceState(products);

  // Helper to parse comboReference JSON safely
  const parseComboReference = (comboRef) => {
    try {
      return comboRef ? JSON.parse(comboRef) : [];
    } catch {
      return [];
    }
  };

  // Render combo components
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

  // Render root product for duplicates
  const renderRootProduct = (product) => {
    if (!product.isDuplicate || !product.rootProductId) return "—";
    const root = products.find(p => p.productId === product.rootProductId);
    if (!root) return `Root ID: ${product.rootProductId}`;
    return <Link to={`/app/inventory/product-mapping/edit/${root.id}`}>{root.productName}</Link>;
  };

  // Determine product type badge
  const getTypeBadge = (product) => {
    if (product.isCombo) return <Badge status="info">Combo</Badge>;
    if (product.isDuplicate) return <Badge status="warning">Duplicate</Badge>;
    return <Badge status="success">Raw</Badge>;
  };

  const rowMarkup = products.map((product, index) => {
    const { id, productName, description, price, quantity, inventoryCategory, baseDatetime } = product;
    return (
      <IndexTable.Row id={id} key={id} selected={selectedResources.includes(id)} position={index}>
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">{productName}</Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{description || "—"}</IndexTable.Cell>
        <IndexTable.Cell>${price}</IndexTable.Cell>
        <IndexTable.Cell>{quantity}</IndexTable.Cell>
        <IndexTable.Cell>{inventoryCategory || "—"}</IndexTable.Cell>
        <IndexTable.Cell>{getTypeBadge(product)}</IndexTable.Cell>
        <IndexTable.Cell>
          {product.isCombo && renderComponents(product)}
          {product.isDuplicate && renderRootProduct(product)}
          {!product.isCombo && !product.isDuplicate && "—"}
        </IndexTable.Cell>
        <IndexTable.Cell>{baseDatetime ? new Date(baseDatetime).toLocaleString() : "—"}</IndexTable.Cell>
        <IndexTable.Cell>
          <Button size="slim" onClick={() => deleteProduct(id)}>Delete</Button>
          <Link to={`/app/inventory/product-mapping/edit/${id}`}>
            <Button size="slim">Edit</Button>
          </Link>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page
      title="Products"
      primaryAction={{ content: "Add product", url: "/app/inventory/product-mapping/add" }}
    >
      <Card padding="0">
        <IndexTable
          resourceName={resourceName}
          itemCount={products.length}
          selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
          onSelectionChange={handleSelectionChange}
          headings={[
            { title: "Product Name" },
            { title: "Description" },
            { title: "Price" },
            { title: "Stock" },
            { title: "Category" },
            { title: "Type" },
            { title: "Components / Root Product" },
            { title: "Base Datetime" },
            { title: "Actions" },
          ]}
          loading={fetcher.state === "submitting"}
        >
          {rowMarkup}
        </IndexTable>
      </Card>
    </Page>
  );
}