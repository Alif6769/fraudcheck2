import { useLoaderData, useFetcher } from "react-router";
import { useState } from "react";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

// Helper to get UTC Date objects for local start and end of yesterday
function getYesterdayUTC() {
  const now = new Date();

  // Get current year, month, day in user's local time
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();

  // Local start of yesterday (00:00:00.000)
  const startLocal = new Date(year, month, day - 1, 0, 0, 0, 0);
  // Local end of yesterday (23:59:59.999)
  const endLocal = new Date(year, month, day - 1, 23, 59, 59, 999);

  // Convert to UTC timestamps by subtracting timezone offset
  const startUTC = new Date(startLocal.getTime() - startLocal.getTimezoneOffset() * 60000);
  const endUTC = new Date(endLocal.getTime() - endLocal.getTimezoneOffset() * 60000);

  return { startUTC, endUTC, today: now };
}

export async function loader({ request }) {
  await authenticate.admin(request);

  const { startUTC, endUTC, today } = getYesterdayUTC();
  const todayDateString = today.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Fetch all products (raw or combo)
  const products = await prisma.product.findMany({
    where: {
      OR: [{ rawProductFlag: true }, { isCombo: true }],
    },
    orderBy: { productName: "asc" },
  });

  // Fetch all transactions from yesterday (UTC)
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
    unfulfilled: {
      sells: 0,
      manualSells: 0,
      return: 0,
      damage: 0,
    },
  }));

  // Compute overall totals across all products
  const overallTotals = {
    fulfilled: productsWithTotals.reduce(
      (acc, p) => {
        acc.sells += p.fulfilled.sells;
        acc.manualSells += p.fulfilled.manualSells;
        acc.return += p.fulfilled.return;
        acc.damage += p.fulfilled.damage;
        return acc;
      },
      { sells: 0, manualSells: 0, return: 0, damage: 0 }
    ),
    unfulfilled: { sells: 0, manualSells: 0, return: 0, damage: 0 }, // unchanged
  };

  return {
    products: productsWithTotals,
    totals: overallTotals,
    todayDateString,
  };
}

export default function TodaysInventory() {
  const { products, totals, todayDateString } = useLoaderData();
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
          {/* Top bar with search, sync button, and today's date */}
          <s-stack direction="inline" gap="small" alignItems="center" wrap={false}>
            <s-search-field
              label="Search products"
              placeholder="Search by name"
              value={search}
              onInput={(e) => setSearch(e.currentTarget.value)}
            />
            <s-button variant="secondary" onClick={handleSync}>
              Sync
            </s-button>
            <s-text>📅 {todayDateString}</s-text>
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
              {/* Totals row */}
              <s-table-row tone="strong">
                <s-table-cell>
                  <s-text weight="bold">Totals</s-text>
                </s-table-cell>
                <s-table-cell />
                {/* Fulfilled totals */}
                <s-table-cell>
                  <s-text weight="bold">{totals.fulfilled.sells}</s-text>
                </s-table-cell>
                <s-table-cell>
                  <s-text weight="bold">{totals.fulfilled.manualSells}</s-text>
                </s-table-cell>
                <s-table-cell>
                  <s-text weight="bold">{totals.fulfilled.return}</s-text>
                </s-table-cell>
                <s-table-cell>
                  <s-text weight="bold">{totals.fulfilled.damage}</s-text>
                </s-table-cell>
                {/* Unfulfilled totals */}
                <s-table-cell>
                  <s-text weight="bold">{totals.unfulfilled.sells}</s-text>
                </s-table-cell>
                <s-table-cell>
                  <s-text weight="bold">{totals.unfulfilled.manualSells}</s-text>
                </s-table-cell>
                <s-table-cell>
                  <s-text weight="bold">{totals.unfulfilled.return}</s-text>
                </s-table-cell>
                <s-table-cell>
                  <s-text weight="bold">{totals.unfulfilled.damage}</s-text>
                </s-table-cell>
              </s-table-row>
            </s-table-body>
          </s-table>
        </s-stack>
      </s-section>
    </s-page>
  );
}