// app/routes/app.inventory.return_manual_sell_damage.jsx
import { useLoaderData, useFetcher } from "react-router";
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
      const transactions = await prisma.productTransaction.findMany({
        where: { productId: product.productId },
        orderBy: { timestamp: "asc" },
      });

      const firstRestock = transactions.find(t => t.type === "RESTOCK");
      let currentStock = 0;
      if (firstRestock) {
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
      return { ...product, currentStock };
    })
  );

  return { products: productsWithStock, shopDomain };
}

// ---------- Action ----------
export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop; // ensures auth
  const formData = await request.json();
  const { productId, quantity, type } = formData; // type: "MANUAL_SALE", "RETURN", "DAMAGE"

  if (!productId || !quantity || isNaN(parseFloat(quantity))) {
    return new Response(
      JSON.stringify({ error: "Invalid product or quantity" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const qty = parseFloat(quantity);
  if (qty <= 0) {
    return new Response(
      JSON.stringify({ error: "Quantity must be positive" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!["MANUAL_SALE", "RETURN", "DAMAGE"].includes(type)) {
    return new Response(
      JSON.stringify({ error: "Invalid transaction type" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { productId },
      });
      if (!product) throw new Error("Product not found");

      // For RETURN, quantity adds to stock; for others, subtracts
      const stockChange = (type === "RETURN") ? qty : -qty;

      // Create transaction
      const transaction = await tx.productTransaction.create({
        data: {
          productId,
          type: type,
          quantity: qty, // store positive quantity
        },
      });

      // Update product's current stock
      const updatedProduct = await tx.product.update({
        where: { productId },
        data: { quantity: { increment: stockChange } },
      });

      return { transaction, updatedProduct };
    });

    return new Response(
      JSON.stringify({ success: true, newStock: result.updatedProduct.quantity }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error(`${type} error:`, error);
    return new Response(
      JSON.stringify({ error: error.message || `Failed to process ${type}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// ---------- Component ----------
export default function ReturnManualDamage() {
  const { products, shopDomain } = useLoaderData();
  const fetcher = useFetcher();
  const [search, setSearch] = useState("");
  const [manualQuantities, setManualQuantities] = useState({});
  const [returnQuantities, setReturnQuantities] = useState({});
  const [damageQuantities, setDamageQuantities] = useState({});

  const filteredProducts = products.filter(p =>
    p.productName.toLowerCase().includes(search.toLowerCase())
  );

  const handleManualChange = (productId, value) => {
    if (/^\d*\.?\d*$/.test(value) || value === "") {
      setManualQuantities({ ...manualQuantities, [productId]: value });
    }
  };
  const handleReturnChange = (productId, value) => {
    if (/^\d*\.?\d*$/.test(value) || value === "") {
      setReturnQuantities({ ...returnQuantities, [productId]: value });
    }
  };
  const handleDamageChange = (productId, value) => {
    if (/^\d*\.?\d*$/.test(value) || value === "") {
      setDamageQuantities({ ...damageQuantities, [productId]: value });
    }
  };

  const handleSubmit = (productId, type) => {
    let qty;
    switch (type) {
      case "MANUAL_SALE":
        qty = manualQuantities[productId];
        break;
      case "RETURN":
        qty = returnQuantities[productId];
        break;
      case "DAMAGE":
        qty = damageQuantities[productId];
        break;
      default:
        return;
    }
    if (!qty || isNaN(parseFloat(qty)) || parseFloat(qty) <= 0) {
      alert("Please enter a valid positive quantity");
      return;
    }
    fetcher.submit(
      { productId, quantity: qty, type },
      { method: "post", encType: "application/json" }
    );
  };

  // Optional reload after success
  if (fetcher.state === "idle" && fetcher.data?.success) {
    window.location.reload();
  }

  return (
    <s-page heading="Manual Transactions" inlineSize="large">
      <s-section>
        <s-stack gap="base">
          <s-text>Shop: {shopDomain}</s-text>

          {/* Search bar */}
          <s-stack direction="inline" gap="small" align="center">
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1, padding: "0.5rem" }}
            />
          </s-stack>

          {/* Products table */}
          <s-box background="base" border="base" borderRadius="base" padding="base">
            <s-heading>Raw Products</s-heading>
            <s-table variant="auto">
              <s-table-header-row>
                <s-table-header>Product Name</s-table-header>
                <s-table-header>Current Stock</s-table-header>
                <s-tableHeader>Manual Sell</s-tableHeader>
                <s-tableHeader>Action (Manual)</s-tableHeader>
                <s-tableHeader>Return</s-tableHeader>
                <s-tableHeader>Action (Return)</s-tableHeader>
                <s-tableHeader>Damage</s-tableHeader>
                <s-tableHeader>Action (Damage)</s-tableHeader>
              </s-table-header-row>
              <s-table-body>
                {filteredProducts.length === 0 ? (
                  <s-table-row>
                    <s-table-cell colSpan={8}>No products found.</s-table-cell>
                  </s-table-row>
                ) : (
                  filteredProducts.map((product) => (
                    <s-table-row key={product.productId}>
                      <s-table-cell>{product.productName}</s-table-cell>
                      <s-table-cell>{product.currentStock}</s-table-cell>
                      {/* Manual Sell */}
                      <s-table-cell>
                        <input
                          type="text"
                          value={manualQuantities[product.productId] || ""}
                          onChange={(e) => handleManualChange(product.productId, e.target.value)}
                          style={{ width: "80px" }}
                        />
                      </s-table-cell>
                      <s-table-cell>
                        <s-button
                          size="small"
                          onClick={() => handleSubmit(product.productId, "MANUAL_SALE")}
                          disabled={fetcher.state !== "idle"}
                        >
                          Sell
                        </s-button>
                      </s-table-cell>
                      {/* Return */}
                      <s-table-cell>
                        <input
                          type="text"
                          value={returnQuantities[product.productId] || ""}
                          onChange={(e) => handleReturnChange(product.productId, e.target.value)}
                          style={{ width: "80px" }}
                        />
                      </s-table-cell>
                      <s-table-cell>
                        <s-button
                          size="small"
                          onClick={() => handleSubmit(product.productId, "RETURN")}
                          disabled={fetcher.state !== "idle"}
                        >
                          Return
                        </s-button>
                      </s-table-cell>
                      {/* Damage */}
                      <s-table-cell>
                        <input
                          type="text"
                          value={damageQuantities[product.productId] || ""}
                          onChange={(e) => handleDamageChange(product.productId, e.target.value)}
                          style={{ width: "80px" }}
                        />
                      </s-table-cell>
                      <s-table-cell>
                        <s-button
                          size="small"
                          onClick={() => handleSubmit(product.productId, "DAMAGE")}
                          disabled={fetcher.state !== "idle"}
                        >
                          Damage
                        </s-button>
                      </s-table-cell>
                    </s-table-row>
                  ))
                )}
              </s-table-body>
            </s-table>
          </s-box>

          {/* Error display */}
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