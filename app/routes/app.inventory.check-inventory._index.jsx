import { useFetcher, useLoaderData } from "react-router";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server"; // needed for loader

// Loader to fetch products (same as product-mapping)
export async function loader() {
  const products = await prisma.product.findMany({
    orderBy: { productName: "asc" },
  });
  return { products };
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const from = formData.get("from");
  const to = formData.get("to");

  if (!from || !to) {
    return new Response("Missing date range", { status: 400 });
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  // TODO: implement processFulfilledOrders
  // const result = await processFulfilledOrders(fromDate, toDate);
  // return { success: true, ...result };

  return {
    success: true,
    processedOrders: 0,
    transactionsCreated: 0,
    warning: "Functionality not yet implemented.",
  };
}

export default function CheckInventory() {
  const { products } = useLoaderData();
  const fetcher = useFetcher();

  // Helper to get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split("T")[0];

  const [from, setFrom] = useState(`${today}T00:00`);
  const [to, setTo] = useState(`${today}T23:59`);

  // For per‑product rows – we'll manage individual date ranges in state
  // Each product gets its own from/to and a loading flag
  const [productQueries, setProductQueries] = useState({});

  useEffect(() => {
    // Initialize product queries with default from/to (same as global)
    const initial = {};
    products.forEach((p) => {
      initial[p.id] = { from: `${today}T00:00`, to: `${today}T23:59`, checking: false };
    });
    setProductQueries(initial);
  }, [products, today]);

  const handleProductFromChange = (productId, value) => {
    setProductQueries((prev) => ({
      ...prev,
      [productId]: { ...prev[productId], from: value },
    }));
  };

  const handleProductToChange = (productId, value) => {
    setProductQueries((prev) => ({
      ...prev,
      [productId]: { ...prev[productId], to: value },
    }));
  };

  const handleProductCheck = (productId) => {
    // TODO: implement per‑product check
    alert(`Check product ${productId} from ${productQueries[productId].from} to ${productQueries[productId].to}`);
    // For now, just simulate a loading state
    setProductQueries((prev) => ({
      ...prev,
      [productId]: { ...prev[productId], checking: true },
    }));
    setTimeout(() => {
      setProductQueries((prev) => ({
        ...prev,
        [productId]: { ...prev[productId], checking: false },
      }));
    }, 1000);
  };

  const isSubmitting = fetcher.state === "submitting";

  // Helper to get badge based on product type
  const getTypeBadge = (product) => {
    if (product.isCombo) return <s-badge tone="info">Combo</s-badge>;
    if (product.isDuplicate) return <s-badge tone="caution">Duplicate</s-badge>;
    return <s-badge tone="success">Raw</s-badge>;
  };

  return (
    <s-page heading="Check Inventory" inlineSize="large">
      <s-section padding="base">
        <s-stack gap="base">
          {/* Global date range and process button */}
          <s-banner tone="warning">
            ⚠️ This is a preview – functionality will be implemented later.
          </s-banner>

          <s-stack direction="inline" gap="small" alignItems="center">
            <s-text-field
              label="From"
              type="datetime-local"
              value={from}
              onInput={(e) => setFrom(e.currentTarget.value)}
            />
            <s-text-field
              label="To"
              type="datetime-local"
              value={to}
              onInput={(e) => setTo(e.currentTarget.value)}
            />
            <s-button
              variant="primary"
              loading={isSubmitting}
              onClick={() => {
                const fd = new FormData();
                fd.set("from", from);
                fd.set("to", to);
                fetcher.submit(fd, { method: "post" });
              }}
            >
              Process Orders
            </s-button>
          </s-stack>

          {fetcher.data?.success && (
            <s-banner tone="success">
              ✅ Processed {fetcher.data.processedOrders} orders, created{" "}
              {fetcher.data.transactionsCreated} transactions.
              {fetcher.data.warning && <div>{fetcher.data.warning}</div>}
            </s-banner>
          )}

          {fetcher.data?.error && (
            <s-banner tone="critical">
              ❌ {fetcher.data.error}
            </s-banner>
          )}

          {/* Products table with per‑product date pickers */}
          <s-heading>Products</s-heading>
          <s-table>
            <s-table-header-row>
              <s-table-header>Product Name</s-table-header>
              <s-table-header>Type</s-table-header>
              <s-table-header>Stock</s-table-header>
              <s-tableHeader>Custom From</s-tableHeader>
              <s-tableHeader>Custom To</s-tableHeader>
              <s-tableHeader>Actions</s-tableHeader>
            </s-table-header-row>

            <s-table-body>
              {products.map((product) => (
                <s-table-row key={product.id}>
                  <s-table-cell>
                    <s-text type="strong">{product.productName}</s-text>
                  </s-table-cell>
                  <s-table-cell>{getTypeBadge(product)}</s-table-cell>
                  <s-table-cell>{product.quantity}</s-table-cell>
                  <s-table-cell>
                    <s-text-field
                      type="datetime-local"
                      value={productQueries[product.id]?.from || ""}
                      onInput={(e) => handleProductFromChange(product.id, e.currentTarget.value)}
                      style={{ width: "200px" }}
                    />
                  </s-table-cell>
                  <s-table-cell>
                    <s-text-field
                      type="datetime-local"
                      value={productQueries[product.id]?.to || ""}
                      onInput={(e) => handleProductToChange(product.id, e.currentTarget.value)}
                      style={{ width: "200px" }}
                    />
                  </s-table-cell>
                  <s-table-cell>
                    <s-button
                      variant="secondary"
                      loading={productQueries[product.id]?.checking}
                      onClick={() => handleProductCheck(product.id)}
                    >
                      Check
                    </s-button>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-stack>
      </s-section>
    </s-page>
  );
}