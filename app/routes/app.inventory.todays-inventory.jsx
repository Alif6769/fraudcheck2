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
  console.log("========== DATE DEBUG START ==========");
  console.log("1. tzOffset from client:", tzOffset);

  // Current server time (UTC)
  const serverNow = new Date();
  console.log("2. serverNow (UTC):", serverNow.toISOString());

  // Calculate client's local time using offset: local = UTC - offset
  const clientLocalTimestamp = serverNow.getTime() - tzOffset * 60000;
  const clientNow = new Date(clientLocalTimestamp);
  console.log("3. clientNow (local timestamp, in UTC representation):", clientNow.toISOString());
  console.log("   clientNow local components (from UTC methods):", {
    year: clientNow.getUTCFullYear(),
    month: clientNow.getUTCMonth() + 1,
    day: clientNow.getUTCDate(),
    hour: clientNow.getUTCHours(),
    minute: clientNow.getUTCMinutes()
  });

  const year = clientNow.getUTCFullYear();
  const month = clientNow.getUTCMonth(); // 0-11
  const day = clientNow.getUTCDate();

  // Create yesterday's date using local date constructor (handles rollover)
  const yesterdayLocal = new Date(year, month, day - 1);
  console.log("4. yesterdayLocal (via new Date(year, month, day-1)):", yesterdayLocal.toString());
  const yesterdayYear = yesterdayLocal.getFullYear();
  const yesterdayMonth = yesterdayLocal.getMonth() + 1; // 1-12
  const yesterdayDay = yesterdayLocal.getDate();
  console.log("   yesterdayLocal components:", { yesterdayYear, yesterdayMonth, yesterdayDay });

  const yesterdayDateStr = `${yesterdayYear}-${String(yesterdayMonth).padStart(2, '0')}-${String(yesterdayDay).padStart(2, '0')}`;
  console.log("5. yesterdayDateStr (for parsing):", yesterdayDateStr);

  // Convert local yesterday start/end to UTC using offset
  const startUTC = parseLocalToUTC(yesterdayDateStr, "00:00", tzOffset);
  const endUTC   = parseLocalToUTC(yesterdayDateStr, "23:59", tzOffset);
  console.log("6. startUTC (database query):", startUTC.toISOString());
  console.log("6. endUTC   (database query):", endUTC.toISOString());

  // For display in UI (as ISO strings)
  const todayISO   = clientNow.toISOString();
  const yesterdayISO = new Date(clientLocalTimestamp - 86400000).toISOString();
  console.log("7. todayISO (for display):", todayISO);
  console.log("7. yesterdayISO (for display):", yesterdayISO);
  console.log("========== DATE DEBUG END ==========");

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

  // Build map of productId -> transaction sums
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

  // Attach sums to each product
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

  // Compute overall totals
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
    unfulfilled: { sells: 0, manualSells: 0, return: 0, damage: 0 },
  };

  return {
    products: productsWithTotals,
    totals: overallTotals,
    debug: {
      tzOffset,
      serverNow: serverNow.toISOString(),
      clientNow: clientNow.toISOString(),
      clientLocalComponents: {
        year: clientNow.getUTCFullYear(),
        month: clientNow.getUTCMonth() + 1,
        day: clientNow.getUTCDate(),
        hour: clientNow.getUTCHours(),
        minute: clientNow.getUTCMinutes(),
      },
      yesterdayLocal: yesterdayLocal.toString(),
      yesterdayDateStr,
      startUTC: startUTC.toISOString(),
      endUTC: endUTC.toISOString(),
      todayISO,
      yesterdayISO,
    },
  };
}

export default function TodaysInventory() {
  const { products, totals, debug } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [showDebug, setShowDebug] = useState(false);

  // If no tzOffset in URL, redirect with current offset
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("tzOffset")) {
      const offset = new Date().getTimezoneOffset();
      url.searchParams.set("tzOffset", offset);
      navigate(url.pathname + url.search, { replace: true });
    }
  }, [navigate]);

  const today = new Date(debug.todayISO);
  const yesterday = new Date(debug.yesterdayISO);

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

  return (
    <s-page heading="Today's Inventory" inlineSize="large">
      <s-section padding="base">
        <s-stack gap="base">
          {/* Date info */}
          <s-text type="subdued">
            Today: {formattedToday} | Showing fulfilled data for yesterday ({formattedYesterday})
          </s-text>

          {/* Top bar: search + sync button + debug toggle */}
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
            <s-button variant="tertiary" onClick={() => setShowDebug(!showDebug)}>
              {showDebug ? "Hide Debug" : "Show Debug"}
            </s-button>
          </s-stack>

          {/* Debug Banner */}
          {showDebug && (
            <s-banner tone="warning">
              <s-stack gap="small">
                <s-text weight="bold">🔍 Debug Info</s-text>
                <s-text>tzOffset: {debug.tzOffset}</s-text>
                <s-text>serverNow (UTC): {debug.serverNow}</s-text>
                <s-text>clientNow (local as UTC string): {debug.clientNow}</s-text>
                <s-text>client local components: year={debug.clientLocalComponents.year}, month={debug.clientLocalComponents.month}, day={debug.clientLocalComponents.day}, hour={debug.clientLocalComponents.hour}, min={debug.clientLocalComponents.minute}</s-text>
                <s-text>yesterdayLocal (Date.toString): {debug.yesterdayLocal}</s-text>
                <s-text>yesterdayDateStr: {debug.yesterdayDateStr}</s-text>
                <s-text>startUTC: {debug.startUTC}</s-text>
                <s-text>endUTC: {debug.endUTC}</s-text>
                <s-text>todayISO: {debug.todayISO}</s-text>
                <s-text>yesterdayISO: {debug.yesterdayISO}</s-text>
                <s-text>today valid? {isNaN(today.getTime()) ? "❌ Invalid" : "✅ Valid"}</s-text>
                <s-text>yesterday valid? {isNaN(yesterday.getTime()) ? "❌ Invalid" : "✅ Valid"}</s-text>
              </s-stack>
            </s-banner>
          )}

          {/* Info banner about unfulfilled data */}
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

            <s-table-body>
              {filteredProducts.map((product) => (
                <s-table-row key={product.id}>
                  <s-table-cell><s-text type="strong">{product.productName}</s-text></s-table-cell>
                  <s-table-cell>{product.isCombo ? "Combo" : "Raw"}</s-table-cell>
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
                <s-table-cell><s-text weight="bold">Totals</s-text></s-table-cell>
                <s-table-cell />
                {/* Fulfilled totals */}
                <s-table-cell><s-text weight="bold">{totals.fulfilled.sells}</s-text></s-table-cell>
                <s-table-cell><s-text weight="bold">{totals.fulfilled.manualSells}</s-text></s-table-cell>
                <s-table-cell><s-text weight="bold">{totals.fulfilled.return}</s-text></s-table-cell>
                <s-table-cell><s-text weight="bold">{totals.fulfilled.damage}</s-text></s-table-cell>
                {/* Unfulfilled totals */}
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