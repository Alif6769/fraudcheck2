import { useLoaderData, useFetcher } from "react-router";
import { useState } from "react";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

// Helper to get UTC Date objects for local start/end of yesterday
// Returns:
//   startUTC – start of yesterday in UTC (for queries)
//   endUTC   – end of yesterday in UTC
//   yesterdayLocalDate – Date object representing the start of yesterday (local)
//   todayLocalDate     – Date object representing now (local)
// Helper to get UTC Date objects for local start/end of yesterday using client's timezone offset
function getYesterdayRangeWithOffset(tzOffset) {
  // tzOffset is minutes from UTC (e.g., -360 for UTC+6)
  const now = new Date(); // server UTC

  // Convert server UTC to client local time by adding offset minutes
  const clientNow = new Date(now.getTime() + tzOffset * 60000);

  const year = clientNow.getFullYear();
  const month = clientNow.getMonth();
  const day = clientNow.getDate();

  // Local start and end of yesterday in client's time
  const startLocal = new Date(Date.UTC(year, month, day - 1, 0, 0, 0, 0));
  const endLocal = new Date(Date.UTC(year, month, day - 1, 23, 59, 59, 999));

  // Convert back to UTC by subtracting offset
  const startUTC = new Date(startLocal.getTime() - tzOffset * 60000);
  const endUTC = new Date(endLocal.getTime() - tzOffset * 60000);

  return {
    startUTC,
    endUTC,
    yesterdayLocalDate: new Date(year, month, day - 1, 0, 0, 0, 0), // local date object for display
    todayLocalDate: new Date(year, month, day, 0, 0, 0, 0), // local today midnight
  };
}

export async function loader({ request }) {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const tzOffsetParam = url.searchParams.get("tzOffset");
  if (!tzOffsetParam) {
    // If no offset, we still need to return something, but component will redirect
    return { products: [], needsOffset: true };
  }
  const tzOffset = parseInt(tzOffsetParam, 10);

  const {
    startUTC,
    endUTC,
    yesterdayLocalDate,
    todayLocalDate,
  } = getYesterdayRangeWithOffset(tzOffset);

  // Fetch products (raw or combo)
  const products = await prisma.product.findMany({
    where: {
      OR: [{ rawProductFlag: true }, { isCombo: true }],
    },
    orderBy: { productName: "asc" },
  });

  // Fetch transactions in UTC range
  const transactions = await prisma.productTransaction.findMany({
    where: {
      timestamp: {
        gte: startUTC,
        lte: endUTC,
      },
    },
  });

  // Build totals map
  const totalsMap = {};
  for (const txn of transactions) {
    if (!totalsMap[txn.productId]) {
      totalsMap[txn.productId] = {
        SALE: 0,
        MANUAL_SALE: 0,
        RETURN: 0,
        DAMAGE: 0,
      };
    }
    totalsMap[txn.productId][txn.type] += txn.quantity;
  }

  const productsWithTotals = products.map((product) => ({
    ...product,
    fulfilled: {
      sells: totalsMap[product.productId]?.SALE || 0,
      manualSells: totalsMap[product.productId]?.MANUAL_SALE || 0,
      return: totalsMap[product.productId]?.RETURN || 0,
      damage: totalsMap[product.productId]?.DAMAGE || 0,
    },
    unfulfilled: {
      sells: 0,
      manualSells: 0,
      return: 0,
      damage: 0,
    },
  }));

  return {
    products: productsWithTotals,
    yesterdayLocalDate: yesterdayLocalDate.toISOString(),
    todayLocalDate: todayLocalDate.toISOString(),
  };
}

export default function TodaysInventory() {
  const { products, todayLocalDate, yesterdayLocalDate } = useLoaderData();
  const fetcher = useFetcher();
  const [search, setSearch] = useState("");

  const today = new Date(todayLocalDate);
  const yesterday = new Date(yesterdayLocalDate);

  const formattedToday = today.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const formattedYesterday = yesterday.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const handleSync = () => {
    alert("Sync not implemented yet.");
  };

  // Filter products by search term
  const filteredProducts = products.filter((p) =>
    p.productName.toLowerCase().includes(search.toLowerCase())
  );

  // Calculate overall totals across filtered products
  const totals = filteredProducts.reduce(
    (acc, product) => {
      acc.fulfilled.sells += product.fulfilled.sells;
      acc.fulfilled.manualSells += product.fulfilled.manualSells;
      acc.fulfilled.return += product.fulfilled.return;
      acc.fulfilled.damage += product.fulfilled.damage;

      acc.unfulfilled.sells += product.unfulfilled.sells;
      acc.unfulfilled.manualSells += product.unfulfilled.manualSells;
      acc.unfulfilled.return += product.unfulfilled.return;
      acc.unfulfilled.damage += product.unfulfilled.damage;

      return acc;
    },
    {
      fulfilled: { sells: 0, manualSells: 0, return: 0, damage: 0 },
      unfulfilled: { sells: 0, manualSells: 0, return: 0, damage: 0 },
    }
  );

  return (
    <s-page heading="Today's Inventory" inlineSize="large">
      <s-section padding="base">
        <s-stack gap="base">
          {/* Date info */}
          <s-text type="subdued">
            Today: {formattedToday} | Showing fulfilled data for yesterday ({formattedYesterday})
          </s-text>

          {/* Top bar: search + sync button */}
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

          {/* Info banner */}
          <s-banner tone="info">
            ⚠️ Unfulfilled data is pending implementation. It will show quantities from open orders soon.
          </s-banner>

          {/* Table with two‑header row */}
          <s-table variant="auto">
            {/* First header row: main columns with colspan */}
            <s-table-header-row>
              <s-table-header listSlot="primary" rowspan="2">
                Product
              </s-table-header>
              <s-table-header rowspan="2">
                Type
              </s-table-header>
              <s-table-header colspan="4">
                Fulfilled (yesterday)
              </s-table-header>
              <s-table-header colspan="4">
                Unfulfilled
              </s-table-header>
            </s-table-header-row>

            {/* Second header row: subcolumns */}
            <s-table-header-row>
              {/* These two cells are omitted because they are covered by rowspan */}
              {/* Fulfilled subcolumns */}
              <s-table-header>Sells</s-table-header>
              <s-table-header>Manual sells</s-table-header>
              <s-table-header>Return</s-table-header>
              <s-table-header>Damage</s-table-header>
              {/* Unfulfilled subcolumns */}
              <s-table-header>Sells</s-table-header>
              <s-table-header>Manual sells</s-table-header>
              <s-table-header>Return</s-table-header>
              <s-table-header>Damage</s-table-header>
            </s-table-header-row>

            {/* Table body */}
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

              {/* Grand totals row */}
              <s-table-row>
                <s-table-cell>
                  <s-text weight="bold">Total</s-text>
                </s-table-cell>
                <s-table-cell /> {/* empty Type cell */}

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