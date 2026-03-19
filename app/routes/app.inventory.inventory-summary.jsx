// app/routes/app.inventory.inventory-summary.jsx
import { useLoaderData } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// ---------- Loader ----------
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // Fetch all raw products
  const products = await prisma.product.findMany({
    where: { rawProductFlag: true },
    orderBy: { productName: "asc" },
  });

  // For each product, compute totals after first restock
  const productsWithSummary = await Promise.all(
    products.map(async (product) => {
      const transactions = await prisma.productTransaction.findMany({
        where: { productId: product.productId },
        orderBy: { timestamp: "asc" },
      });

      const firstRestock = transactions.find(t => t.type === "RESTOCK");
      if (!firstRestock) {
        // No restock ever, all values zero
        return {
          ...product,
          totalSell: 0,
          totalManualSell: 0,
          totalReturn: 0,
          totalDamage: 0,
          totalRestock: 0,
          currentInventory: 0,
        };
      }

      // Consider only transactions from the first restock onward
      const relevant = transactions.filter(t => t.timestamp >= firstRestock.timestamp);

      let totalSell = 0;
      let totalManualSell = 0;
      let totalReturn = 0;
      let totalDamage = 0;
      let totalRestock = 0;

      for (const t of relevant) {
        switch (t.type) {
          case "SALE":
            totalSell += t.quantity;
            break;
          case "MANUAL_SALE":
            totalManualSell += t.quantity;
            break;
          case "RETURN":
            totalReturn += t.quantity;
            break;
          case "DAMAGE":
            totalDamage += t.quantity;
            break;
          case "RESTOCK":
            totalRestock += t.quantity;
            break;
        }
      }

      const currentInventory = totalRestock + totalReturn - totalSell - totalManualSell - totalDamage;

      return {
        ...product,
        totalSell,
        totalManualSell,
        totalReturn,
        totalDamage,
        totalRestock,
        currentInventory,
      };
    })
  );

  return { products: productsWithSummary, shopDomain };
}

// ---------- Component ----------
export default function InventorySummary() {
  const { products, shopDomain } = useLoaderData();
  const [search, setSearch] = useState("");

  const filteredProducts = products.filter(p =>
    p.productName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <s-page heading="Inventory Summary" inlineSize="large">
      <s-section>
        <s-stack gap="base">
          <s-text>Shop: {shopDomain}</s-text>

          {/* Search bar */}
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: "0.5rem", marginBottom: "1rem" }}
          />

          {/* Summary table */}
          <s-box background="base" border="base" borderRadius="base" padding="base">
            <s-heading>Raw Products Inventory</s-heading>
            <s-table variant="auto">
              <s-table-header-row>
                <s-table-header>Product Name</s-table-header>
                <s-table-header>Total Sell</s-table-header>
                <s-table-header>Manual Sell</s-table-header>
                <s-table-header>Return</s-table-header>
                <s-table-header>Damage</s-table-header>
                <s-table-header>Total Restock</s-table-header>
                <s-table-header>Current Inventory</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {filteredProducts.length === 0 ? (
                  <s-table-row>
                    <s-table-cell colSpan={7}>No products found.</s-table-cell>
                  </s-table-row>
                ) : (
                  filteredProducts.map((product) => (
                    <s-table-row key={product.productId}>
                      <s-table-cell>{product.productName}</s-table-cell>
                      <s-table-cell>{product.totalSell}</s-table-cell>
                      <s-table-cell>{product.totalManualSell}</s-table-cell>
                      <s-table-cell>{product.totalReturn}</s-table-cell>
                      <s-table-cell>{product.totalDamage}</s-table-cell>
                      <s-table-cell>{product.totalRestock}</s-table-cell>
                      <s-table-cell>{product.currentInventory}</s-table-cell>
                    </s-table-row>
                  ))
                )}
              </s-table-body>
            </s-table>
          </s-box>
        </s-stack>
      </s-section>
    </s-page>
  );
}