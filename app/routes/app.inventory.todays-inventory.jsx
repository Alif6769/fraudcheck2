import { useLoaderData, useFetcher } from "react-router";
import { useState } from "react";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

// Helper to get yesterday's date range in UTC
function getYesterdayRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();

  // Start of yesterday (local midnight) – we'll convert to UTC for query
  const startLocal = new Date(year, month, day - 1, 0, 0, 0, 0);
  const endLocal = new Date(year, month, day - 1, 23, 59, 59, 999);

  // Convert to UTC timestamps (ISO strings)
  const startUTC = new Date(startLocal.toISOString());
  const endUTC = new Date(endLocal.toISOString());
  return { startUTC, endUTC };
}

export async function loader({ request }) {
  await authenticate.admin(request);

  const { startUTC, endUTC } = getYesterdayRange();

  // Fetch all products (raw or combo)
  const products = await prisma.product.findMany({
    where: {
      OR: [{ rawProductFlag: true }, { isCombo: true }],
    },
    orderBy: { productName: "asc" },
  });

  // Fetch all transactions from yesterday
  const transactions = await prisma.productTransaction.findMany({
    where: {
      timestamp: {
        gte: startUTC,
        lte: endUTC,
      },
    },
  });

  // Build a map of productId -> transaction sums
  const totals = {};
  for (const txn of transactions) {
    if (!totals[txn.productId]) {
      totals[txn.productId] = {
        SALE: 0,
        MANUAL_SALE: 0,
        RETURN: 0,
        DAMAGE: 0,
      };
    }
    totals[txn.productId][txn.type] += txn.quantity;
  }

  // For each product, attach its totals (default zero)
  const productsWithTotals = products.map((product) => ({
    ...product,
    fulfilled: {
      sells: totals[product.productId]?.SALE || 0,
      manualSells: totals[product.productId]?.MANUAL_SALE || 0,
      return: totals[product.productId]?.RETURN || 0,
      damage: totals[product.productId]?.DAMAGE || 0,
    },
    // Unfulfilled data pending – set to zero for now
    unfulfilled: {
      sells: 0,
      manualSells: 0,
      return: 0,
      damage: 0,
    },
  }));

  return { products: productsWithTotals };
}

export default function TodaysInventory() {
  const { products } = useLoaderData();
  const fetcher = useFetcher();
  const [search, setSearch] = useState("");

  const handleSync = () => {
    alert("Sync not implemented yet.");
  };

  const filteredProducts = products.filter((p) =>
    p.productName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <s-page heading="Today's Inventory" inlineSize="large">
      <s-section padding="base">
        <s-stack gap="base">
          {/* Top bar with search and sync button */}
          <s-stack direction="inline" gap="small" alignItems="center">
            <s-search-field
              label="Search products"
              placeholder="Search by name"
              value={search}
              onInput={(e) => setSearch(e.currentTarget.value)}
            />
            <s-button variant="secondary" onClick={handleSync}>
              Sync
            </s-button>
          </s-stack>

          {/* Info banner about unfulfilled data */}
          <s-banner tone="info">
            ⚠️ Unfulfilled data is pending implementation. It will show quantities from open orders soon.
          </s-banner>

          {/* Table */}
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Product</s-table-header>
              <s-table-header>Type</s-table-header>
              <s-table-header colspan="4">Fulfilled (yesterday)</s-table-header>
              <s-table-header colspan="4">Unfulfilled</s-table-header>
            </s-table-header-row>
            <s-table-header-row>
              <s-table-header />
              <s-table-header />
              <s-table-header>Sells</s-table-header>
              <s-table-header>Manual sells</s-table-header>
              <s-table-header>Return</s-table-header>
              <s-table-header>Damage</s-table-header>
              <s-table-header>Sells</s-table-header>
              <s-table-header>Manual sells</s-table-header>
              <s-table-header>Return</s-table-header>
              <s-table-header>Damage</s-table-header>
            </s-table-header-row>

            <s-table-body>
              {filteredProducts.map((product) => (
                <s-table-row key={product.id}>
                  <s-table-cell>
                    <s-text type="strong">{product.productName}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    {product.isCombo ? "Combo" : "Raw"}
                  </s-table-cell>
                  {/* Fulfilled columns */}
                  <s-table-cell>{product.fulfilled.sells}</s-table-cell>
                  <s-table-cell>{product.fulfilled.manualSells}</s-table-cell>
                  <s-table-cell>{product.fulfilled.return}</s-table-cell>
                  <s-table-cell>{product.fulfilled.damage}</s-table-cell>
                  {/* Unfulfilled columns */}
                  <s-table-cell>{product.unfulfilled.sells}</s-table-cell>
                  <s-table-cell>{product.unfulfilled.manualSells}</s-table-cell>
                  <s-table-cell>{product.unfulfilled.return}</s-table-cell>
                  <s-table-cell>{product.unfulfilled.damage}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-stack>
      </s-section>
    </s-page>
  );
}