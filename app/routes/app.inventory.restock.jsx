import { useLoaderData, useFetcher, useRevalidator } from "react-router";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// ---------- Helper: convert local datetime + offset to UTC Date ----------
function parseLocalToUTC(dateTimeStr, offsetMinutes) {
  const [datePart, timePart] = dateTimeStr.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  utcDate.setMinutes(utcDate.getMinutes() + offsetMinutes);
  return utcDate;
}

// ---------- Loader (unchanged) ----------
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const products = await prisma.product.findMany({
    where: { rawProductFlag: true },
    orderBy: { productName: "asc" },
  });

  const productsWithDetails = await Promise.all(
    products.map(async (product) => {
      const transactions = await prisma.productTransaction.findMany({
        where: { productId: product.productId },
        orderBy: { timestamp: "asc" },
      });

      const restocks = transactions
        .filter(t => t.type === "RESTOCK")
        .map(t => ({
          id: t.id,
          timestamp: t.timestamp,
          quantity: t.quantity,
        }));

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

      return {
        ...product,
        currentStock,
        restocks,
      };
    })
  );

  return { products: productsWithDetails, shopDomain };
}

// ---------- Action ----------
export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.json();
  const { intent, productId, quantity, timestamp, tzOffset, restockId } = formData;

  // Handle deletion of a single restock
  if (intent === "delete-restock") {
    if (!restockId) {
      return new Response(
        JSON.stringify({ error: "Missing restock ID" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    try {
      const transaction = await prisma.productTransaction.findUnique({
        where: { id: restockId },
      });
      if (!transaction || transaction.type !== "RESTOCK") {
        return new Response(
          JSON.stringify({ error: "Invalid restock transaction" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      await prisma.$transaction([
        prisma.productTransaction.delete({ where: { id: restockId } }),
        prisma.product.update({
          where: { productId: transaction.productId },
          data: { quantity: { decrement: transaction.quantity } },
        }),
      ]);

      return new Response(
        JSON.stringify({ success: true, action: "delete-restock" }),
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Delete restock error:", error);
      return new Response(
        JSON.stringify({ error: error.message || "Failed to delete restock" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // Handle deletion of all restocks for a product
  if (intent === "delete-all-restocks") {
    if (!productId) {
      return new Response(
        JSON.stringify({ error: "Missing product ID" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    try {
      const restocks = await prisma.productTransaction.findMany({
        where: { productId, type: "RESTOCK" },
      });
      const totalRestockQty = restocks.reduce((sum, r) => sum + r.quantity, 0);

      await prisma.$transaction([
        prisma.productTransaction.deleteMany({
          where: { productId, type: "RESTOCK" },
        }),
        prisma.product.update({
          where: { productId },
          data: { quantity: { decrement: totalRestockQty } },
        }),
      ]);

      return new Response(
        JSON.stringify({ success: true, action: "delete-all-restocks" }),
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Delete all restocks error:", error);
      return new Response(
        JSON.stringify({ error: error.message || "Failed to delete all restocks" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // Handle regular restock (create new restock)
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

  // Convert custom timestamp from local to UTC if provided
  let customTimestamp = undefined;
  if (timestamp && tzOffset !== undefined) {
    customTimestamp = parseLocalToUTC(timestamp, tzOffset);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { productId } });
      if (!product) throw new Error("Product not found");

      const transaction = await tx.productTransaction.create({
        data: {
          productId,
          type: "RESTOCK",
          quantity: restockQty,
          timestamp: customTimestamp, // if undefined, Prisma uses now()
        },
      });

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
  const revalidator = useRevalidator();
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState({});
  const [restockTimestamps, setRestockTimestamps] = useState({});
  const [selectedRestock, setSelectedRestock] = useState({});

  const filteredProducts = products.filter(p =>
    p.productName.toLowerCase().includes(search.toLowerCase())
  );

  const handleQuantityChange = (productId, value) => {
    if (/^\d*\.?\d*$/.test(value) || value === "") {
      setQuantities({ ...quantities, [productId]: value });
    }
  };

  const handleTimestampChange = (productId, value) => {
    setRestockTimestamps({ ...restockTimestamps, [productId]: value });
  };

  const handleRestock = (productId) => {
    const qty = quantities[productId];
    if (!qty || isNaN(parseFloat(qty)) || parseFloat(qty) <= 0) {
      alert("Please enter a valid positive quantity");
      return;
    }
    const customTime = restockTimestamps[productId];
    const payload = { productId, quantity: qty };
    if (customTime) {
      payload.timestamp = customTime;
      payload.tzOffset = new Date().getTimezoneOffset(); // browser's offset in minutes
    }
    fetcher.submit(payload, { method: "post", encType: "application/json" });
  };

  const handleDeleteRestock = (productId, restockId) => {
    if (!restockId) return;
    if (window.confirm("Delete this restock transaction? This cannot be undone.")) {
      fetcher.submit(
        { intent: "delete-restock", restockId },
        { method: "post", encType: "application/json" }
      );
    }
  };

  const handleDeleteAllRestocks = (productId) => {
    if (window.confirm(`Delete ALL restocks for "${productId}"? This cannot be undone.`)) {
      fetcher.submit(
        { intent: "delete-all-restocks", productId },
        { method: "post", encType: "application/json" }
      );
    }
  };

  const handleClearAllRestocks = () => {
    if (window.confirm("Delete ALL restocks for ALL products? This action is irreversible.")) {
      products.forEach(product => {
        fetcher.submit(
          { intent: "delete-all-restocks", productId: product.productId },
          { method: "post", encType: "application/json" }
        );
      });
    }
  };

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

          <s-stack direction="inline" gap="small" align="center">
            <s-button
              variant="secondary"
              tone="critical"
              onClick={handleClearAllRestocks}
              disabled={fetcher.state !== "idle"}
            >
              Clear All Restocks
            </s-button>
          </s-stack>

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

          <s-box background="base" border="base" borderRadius="base" padding="base">
            <s-heading>Raw Products</s-heading>
            <s-table variant="auto">
              <s-table-header-row>
                <s-table-header>Product Name</s-table-header>
                <s-table-header>Current Stock</s-table-header>
                <s-table-header>Restock Quantity</s-table-header>
                <s-table-header>Restock Date/Time (local)</s-table-header>
                <s-table-header>Restock History</s-table-header>
                <s-table-header>Actions</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {filteredProducts.length === 0 ? (
                  <s-table-row>
                    <s-table-cell colSpan={6}>No products found.</s-table-cell>
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
                        <input
                          type="datetime-local"
                          value={restockTimestamps[product.productId] || ""}
                          onChange={(e) => handleTimestampChange(product.productId, e.target.value)}
                          style={{ width: "180px" }}
                        />
                      </s-table-cell>
                      <s-table-cell>
                        {product.restocks.length > 0 ? (
                          <select
                            value={selectedRestock[product.productId] || ""}
                            onChange={(e) =>
                              setSelectedRestock({ ...selectedRestock, [product.productId]: e.target.value })
                            }
                            style={{ width: "140px", marginRight: "8px" }}
                          >
                            <option value="">-- Select --</option>
                            {product.restocks.map((r) => (
                              <option key={r.id} value={r.id}>
                                {new Date(r.timestamp).toLocaleString()} ({r.quantity})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span>No restocks</span>
                        )}
                      </s-table-cell>
                      <s-table-cell>
                        <s-stack direction="inline" gap="small">
                          <s-button
                            size="small"
                            onClick={() => handleRestock(product.productId)}
                            disabled={fetcher.state !== "idle"}
                          >
                            Restock
                          </s-button>
                          {selectedRestock[product.productId] && (
                            <s-button
                              size="small"
                              variant="secondary"
                              tone="critical"
                              onClick={() =>
                                handleDeleteRestock(product.productId, selectedRestock[product.productId])
                              }
                              disabled={fetcher.state !== "idle"}
                            >
                              Delete Selected
                            </s-button>
                          )}
                          <s-button
                            size="small"
                            variant="secondary"
                            tone="critical"
                            onClick={() => handleDeleteAllRestocks(product.productId)}
                            disabled={fetcher.state !== "idle"}
                          >
                            Clear All
                          </s-button>
                        </s-stack>
                      </s-table-cell>
                    </s-table-row>
                  ))
                )}
              </s-table-body>
            </s-table>
          </s-box>

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