import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { useState, useEffect } from "react";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

// Helper: Convert a local date (YYYY-MM-DD) + time + offset to UTC Date
function parseLocalToUTC(dateStr, timeStr, offsetMinutes) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  utcDate.setMinutes(utcDate.getMinutes() + offsetMinutes);
  return utcDate;
}

export async function loader({ request }) {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const tzOffset = parseInt(url.searchParams.get("tzOffset") || "0");

  // Get client's current local date using offset
  const now = new Date();
  const clientNow = new Date(now.getTime() + tzOffset * 60000);
  const year = clientNow.getUTCFullYear();
  const month = clientNow.getUTCMonth();
  const day = clientNow.getUTCDate();

  // Yesterday's date in client's local time
  const yesterdayDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day - 1).padStart(2, '0')}`;

  // Convert yesterday's start/end to UTC for database queries
  const startUTC = parseLocalToUTC(yesterdayDateStr, "00:00", tzOffset);
  const endUTC   = parseLocalToUTC(yesterdayDateStr, "23:59", tzOffset);

  // For display, get ISO strings of today and yesterday (client local)
  const todayISO   = clientNow.toISOString();
  const yesterdayISO = new Date(clientNow.getTime() - 86400000).toISOString();

  // Fetch products (raw or combo)
  const products = await prisma.product.findMany({
    where: { OR: [{ rawProductFlag: true }, { isCombo: true }] },
    orderBy: { productName: "asc" },
  });

  // Fetch transactions in UTC range
  const transactions = await prisma.productTransaction.findMany({
    where: {
      timestamp: { gte: startUTC, lte: endUTC },
    },
  });

  // Aggregate totals per product
  const totalsMap = {};
  for (const txn of transactions) {
    if (!totalsMap[txn.productId]) {
      totalsMap[txn.productId] = { SALE: 0, MANUAL_SALE: 0, RETURN: 0, DAMAGE: 0 };
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
    unfulfilled: { sells: 0, manualSells: 0, return: 0, damage: 0 },
  }));

  return {
    products: productsWithTotals,
    todayISO,
    yesterdayISO,
  };
}

export default function TodaysInventory() {
  const { products, todayISO, yesterdayISO } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  // If no timezone offset in URL, redirect with client's offset
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("tzOffset")) {
      const offset = new Date().getTimezoneOffset();
      url.searchParams.set("tzOffset", offset);
      navigate(url.pathname + url.search, { replace: true });
    }
  }, [navigate]);

  const today = new Date(todayISO);
  const yesterday = new Date(yesterdayISO);

  const formattedToday = today.toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
  const formattedYesterday = yesterday.toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });

  const handleSync = () => alert("Sync not implemented yet.");

  const filteredProducts = products.filter((p) =>
    p.productName.toLowerCase().includes(search.toLowerCase())
  );

  const totals = filteredProducts.reduce(
    (acc, p) => {
      acc.fulfilled.sells += p.fulfilled.sells;
      acc.fulfilled.manualSells += p.fulfilled.manualSells;
      acc.fulfilled.return += p.fulfilled.return;
      acc.fulfilled.damage += p.fulfilled.damage;
      acc.unfulfilled.sells += p.unfulfilled.sells;
      acc.unfulfilled.manualSells += p.unfulfilled.manualSells;
      acc.unfulfilled.return += p.unfulfilled.return;
      acc.unfulfilled.damage += p.unfulfilled.damage;
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
            {/* First header row */}
            <s-table-header-row>
              <s-table-header listSlot="primary" rowspan="2">Product</s-table-header>
              <s-table-header rowspan="2">Type</s-table-header>
              <s-table-header colspan="4">Fulfilled (yesterday)</s-table-header>
              <s-table-header colspan="4">Unfulfilled</s-table-header>
            </s-table-header-row>

            {/* Second header row (sub‑columns) */}
            <s-table-header-row>
              <s-table-header>Sells</s-table-header>
              <s-table-header>Manual sells</s-table-header>
              <s-table-header>Return</s-table-header>
              <s-table-header>Damage</s-table-header>
              <s-table-header>Sells</s-table-header>
              <s-table-header>Manual sells</s-table-header>
              <s-table-header>Return</s-table-header>
              <s-table-header>Damage</s-table-header>
            </s-table-header-row>

            {/* Table body */}
            <s-table-body>
              {filteredProducts.map((product) => (
                <s-table-row key={product.id}>
                  <s-table-cell><s-text type="strong">{product.productName}</s-text></s-table-cell>
                  <s-table-cell>{product.isCombo ? "Combo" : "Raw"}</s-table-cell>
                  <s-table-cell>{product.fulfilled.sells}</s-table-cell>
                  <s-table-cell>{product.fulfilled.manualSells}</s-table-cell>
                  <s-table-cell>{product.fulfilled.return}</s-table-cell>
                  <s-table-cell>{product.fulfilled.damage}</s-table-cell>
                  <s-table-cell>{product.unfulfilled.sells}</s-table-cell>
                  <s-table-cell>{product.unfulfilled.manualSells}</s-table-cell>
                  <s-table-cell>{product.unfulfilled.return}</s-table-cell>
                  <s-table-cell>{product.unfulfilled.damage}</s-table-cell>
                </s-table-row>
              ))}

              {/* Grand totals row */}
              <s-table-row>
                <s-table-cell><s-text weight="bold">Total</s-text></s-table-cell>
                <s-table-cell /> {/* empty Type cell */}
                <s-table-cell><s-text weight="bold">{totals.fulfilled.sells}</s-text></s-table-cell>
                <s-table-cell><s-text weight="bold">{totals.fulfilled.manualSells}</s-text></s-table-cell>
                <s-table-cell><s-text weight="bold">{totals.fulfilled.return}</s-text></s-table-cell>
                <s-table-cell><s-text weight="bold">{totals.fulfilled.damage}</s-text></s-table-cell>
                <s-table-cell><s-text weight="bold">{totals.unfulfilled.sells}</s-text></s-table-cell>
                <s-table-cell><s-text weight="bold">{totals.unfulfilled.manualSells}</s-text></s-table-cell>
                <s-table-cell><s-text weight="bold">{totals.unfulfilled.return}</s-text></s-table-cell>
                <s-table-cell><s-text weight="bold">{totals.unfulfilled.damage}</s-text></s-table-cell>
              </s-table-row>
            </s-table-body>
          </s-table>
        </s-stack>
      </s-section>
    </s-page>
  );
}