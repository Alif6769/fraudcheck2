import { useLoaderData, useFetcher, useRevalidator } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// ---------- Loader ----------
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // Fetch all products that are raw (rawProductFlag = true)
  const products = await prisma.product.findMany({
    where: { rawProductFlag: true },
    orderBy: { productName: "asc" },
  });

  // For each product, compute current stock based on transactions after first restock
  const productsWithStock = await Promise.all(
    products.map(async (product) => {
      // Get all transactions for this product, ordered by timestamp
      const transactions = await prisma.productTransaction.findMany({
        where: { productId: product.productId },
        orderBy: { timestamp: "asc" },
      });

      // Find the first RESTOCK transaction
      const firstRestock = transactions.find(t => t.type === "RESTOCK");
      let currentStock = 0;
      if (firstRestock) {
        // Consider only transactions from firstRestock onward
        const relevantTransactions = transactions.filter(
          t => t.timestamp >= firstRestock.timestamp
        );
        for (const t of relevantTransactions) {
          switch (t.type) {
            case "RESTOCK":
            case "RETURN":
              currentStock += t.quantity;
              break;
            case "SALE":
            case "DAMAGE":
            case "MANUAL_SALE":
              currentStock -= t.quantity;
              break;
          }
        }
      }
      // If no restock, stock remains 0

      return {
        ...product,
        currentStock,
      };
    })
  );

  return { products: productsWithStock, shopDomain };
}

// ---------- Action ----------
export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop; // not used but ensures auth
  const formData = await request.json();
  const { productId, quantity } = formData;

  if (!productId || !quantity || isNaN(parseFloat(quantity))) {
    return new Response(
      JSON.stringify({ error: "Invalid product or quantity" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const restockQty = parseFloat(quantity);
  if (restockQty <= 0) {
    return new Response(
      JSON.stringify({ error: "Quantity must be positive" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Use a transaction to ensure consistency
    const result = await prisma.$transaction(async (tx) => {
      // Get the product (optional, for verification)
      const product = await tx.product.findUnique({
        where: { productId },
      });
      if (!product) throw new Error("Product not found");

      // Create RESTOCK transaction
      const transaction = await tx.productTransaction.create({
        data: {
          productId,
          type: "RESTOCK",
          quantity: restockQty,
        },
      });

      // Update product's current stock (denormalized field)
      const updatedProduct = await tx.product.update({
        where: { productId },
        data: { quantity: { increment: restockQty } },
      });

      return { transaction, updatedProduct };
    });

    return new Response(
      JSON.stringify({ success: true, newStock: result.updatedProduct.quantity }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Restock error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to restock" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// ---------- Component ----------
export default function Restock() {
  const { products, shopDomain } = useLoaderData();
  const fetcher = useFetcher();
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState({});
  const revalidator = useRevalidator();

  const filteredProducts = products.filter(p =>
    p.productName.toLowerCase().includes(search.toLowerCase())
  );

  const handleQuantityChange = (productId, value) => {
    // Allow only digits and optional decimal point
    if (/^\d*\.?\d*$/.test(value) || value === "") {
      setQuantities({ ...quantities, [productId]: value });
    }
  };

  const handleRestock = (productId) => {
    const qty = quantities[productId];
    if (!qty || isNaN(parseFloat(qty)) || parseFloat(qty) <= 0) {
      alert("Please enter a valid positive quantity");
      return;
    }
    fetcher.submit(
      { productId, quantity: qty },
      { method: "post", encType: "application/json" }
    );
  };

  // Optional: reload after successful restock to update stock display
  // We could listen to fetcher.data and then refetch loader data, but simplest is to reload the page.
  // For better UX, we could update the product list locally. For now, we'll reload.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      revalidator.revalidate();
    }
  }, [fetcher.state, fetcher.data, revalidator]);

  return (
    <s-page heading="Restock Inventory" inlineSize="large">
      <s-section>
        <s-stack gap="base">
          <s-text>Shop: {shopDomain}</s-text>

          {/* Search and Process button */}
          <s-stack direction="inline" gap="small" align="center">
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1, padding: "0.5rem" }}
            />
            <s-button onClick={() => alert("Process Stock not implemented")}>
              Process Stock
            </s-button>
          </s-stack>

          {/* Products table */}
          <s-box background="base" border="base" borderRadius="base" padding="base">
            <s-heading>Raw Products</s-heading>
            <s-table variant="auto">
              <s-table-header-row>
                <s-table-header>Product Name</s-table-header>
                <s-table-header>Current Stock</s-table-header>
                <s-table-header>Restock Quantity</s-table-header>
                <s-table-header>Action</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {filteredProducts.length === 0 ? (
                  <s-table-row>
                    <s-table-cell colSpan={4}>No products found.</s-table-cell>
                  </s-table-row>
                ) : (
                  filteredProducts.map((product) => (
                    <s-table-row key={product.productId}>
                      <s-table-cell>{product.productName}</s-table-cell>
                      <s-table-cell>{product.currentStock}</s-table-cell>
                      <s-table-cell>
                        <input
                          type="text"
                          value={quantities[product.productId] || ""}
                          onChange={(e) => handleQuantityChange(product.productId, e.target.value)}
                          style={{ width: "80px" }}
                        />
                      </s-table-cell>
                      <s-table-cell>
                        <s-button
                          size="small"
                          onClick={() => handleRestock(product.productId)}
                          disabled={fetcher.state !== "idle"}
                        >
                          Restock
                        </s-button>
                      </s-table-cell>
                    </s-table-row>
                  ))
                )}
              </s-table-body>
            </s-table>
          </s-box>

          {/* Optional: show fetcher error */}
          {fetcher.data?.error && (
            <s-box background="critical" padding="base" borderRadius="base">
              <s-text color="critical">Error: {fetcher.data.error}</s-text>
            </s-box>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}