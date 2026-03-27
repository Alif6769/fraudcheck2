import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { useState, useEffect } from "react";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  initializeDailySnapshot,
  syncUnfulfilled,
  syncCancelled,
  syncFulfilled,
  syncFulfilledOrdersForRange,
} from "../services/inventory.server";

// Helper: Convert a local date (YYYY-MM-DD) + time + offset to UTC Date
function parseLocalToUTC(dateStr, timeStr, offsetMinutes) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  utcDate.setMinutes(utcDate.getMinutes() + offsetMinutes);
  return utcDate;
}

// Helper: Get today's local start/end as ISO strings (for default values)
function getTodayLocalRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const start = new Date(year, month, day, 0, 0, 0, 0);
  const end = new Date(year, month, day, 23, 59, 59, 999);
  return {
    startLocal: start.toISOString().slice(0, 16),
    endLocal: end.toISOString().slice(0, 16),
  };
}

// Helper: Get UTC start and end for yesterday's full local day
function getYesterdayUTCRange(tzOffset) {
  const serverNow = new Date();
  const clientNow = new Date(serverNow.getTime() - tzOffset * 60000);
  const year = clientNow.getUTCFullYear();
  const month = clientNow.getUTCMonth();
  const day = clientNow.getUTCDate();

  // Yesterday's local date
  const yesterdayLocal = new Date(year, month, day - 1);
  const yYear = yesterdayLocal.getFullYear();
  const yMonth = yesterdayLocal.getMonth() + 1;
  const yDay = yesterdayLocal.getDate();

  const startStr = `${yYear}-${String(yMonth).padStart(2,'0')}-${String(yDay).padStart(2,'0')}T00:00`;
  const endStr   = `${yYear}-${String(yMonth).padStart(2,'0')}-${String(yDay).padStart(2,'0')}T23:59`;

  const startUTC = parseLocalToUTC(startStr.split('T')[0], startStr.split('T')[1], tzOffset);
  const endUTC   = parseLocalToUTC(endStr.split('T')[0], endStr.split('T')[1], tzOffset);
  return { startUTC, endUTC };
}

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const tzOffset = parseInt(url.searchParams.get("tzOffset") || "0");
  const cancelledFrom = url.searchParams.get("cancelledFrom") || "";
  const cancelledTo = url.searchParams.get("cancelledTo") || "";

  // Compute client's current local date using offset
  const serverNow = new Date();
  const clientNow = new Date(serverNow.getTime() - tzOffset * 60000);
  const year = clientNow.getUTCFullYear();
  const month = clientNow.getUTCMonth();
  const day = clientNow.getUTCDate();

  // Default range for cancelled inputs: today's local start and end
  const defaultStart = new Date(year, month, day, 0, 0, 0, 0);
  const defaultEnd   = new Date(year, month, day, 23, 59, 59, 999);
  const defaultStartLocal = defaultStart.toISOString().slice(0, 16);
  const defaultEndLocal   = defaultEnd.toISOString().slice(0, 16);

  // Today's display date
  const todayLocalStr = clientNow.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  // Fetch snapshot for raw products
  const snapshot = await prisma.dailyInventorySnapshot.findMany({
    where: {
      shop,
      rawProductFlag: true,
    },
  });
  const snapshotMap = new Map(snapshot.map(row => [row.productId, row]));

  // Build product list directly from snapshot – cancelledSales already aggregated
  const products = Array.from(snapshotMap.values()).map(row => ({
    productId: row.productId,
    productName: row.productName,
    price: row.price || 0,
    inventoryBefore: row.quantity || 0,
    unfulfilledSells: row.unfulfilledSales || 0,
    unfulfilledManual: row.unfulfilledManual || 0,
    unfulfilledReturn: row.unfulfilledReturn || 0,
    unfulfilledDamage: row.unfulfilledDamage || 0,
    fulfilledSells: row.fulfilledSales || 0,
    fulfilledManual: row.fulfilledManual || 0,
    fulfilledReturn: row.fulfilledReturn || 0,
    fulfilledDamage: row.fulfilledDamage || 0,
    cancelledSells: row.cancelledSales || 0,
  }));

  // Compute final sells
  products.forEach(p => {
    p.unfulfilledFinal = p.unfulfilledSells + p.unfulfilledManual - p.unfulfilledReturn;
    p.fulfilledFinal   = p.fulfilledSells   + p.fulfilledManual   - p.fulfilledReturn;
    p.cancelledFinal   = p.cancelledSells;
  });

  const totals = {
    unfulfilledFinal: products.reduce((acc, p) => acc + p.unfulfilledFinal, 0),
    fulfilledFinal:   products.reduce((acc, p) => acc + p.fulfilledFinal, 0),
    cancelledFinal:   products.reduce((acc, p) => acc + p.cancelledFinal, 0),
  };

  return {
    products,
    totals,
    todayLocalStr,
    cancelledFrom: cancelledFrom || defaultStartLocal,
    cancelledTo: cancelledTo || defaultEndLocal,
    tzOffset,
  };
}

export async function action({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "sync-all") {
    const shop = session.shop;
    const tzOffset = parseInt(formData.get("tzOffset") || "0");
    const cancelledFrom = formData.get("cancelledFrom");
    const cancelledTo = formData.get("cancelledTo");

    // Step 1: Initialize snapshot (raw/combo products)
    await initializeDailySnapshot(shop);
    
    const { startUTC, endUTC } = getYesterdayUTCRange(tzOffset);
    console.log('🟢 getYesterdayUTCRange – startUTC:', startUTC.toISOString());
    console.log('🟢 getYesterdayUTCRange – endUTC:', endUTC.toISOString());
    // await processFulfilledOrdersWithRange(startUTC, endUTC, shop);
    await syncFulfilledOrdersForRange(session, admin, startUTC, endUTC)
    await processFulfilledOrdersWithRange(startUTC, endUTC, session.shop)

    // Step 2: Sync unfulfilled orders
    await syncUnfulfilled(shop, session, admin);

    // Step 3: Sync fulfilled orders (yesterday)
    await syncFulfilled(shop, tzOffset);

    // Step 4: Sync cancelled orders for the user‑selected range
    if (cancelledFrom && cancelledTo) {
      const fromUTC = parseLocalToUTC(cancelledFrom.split('T')[0], cancelledFrom.split('T')[1], tzOffset);
      const toUTC   = parseLocalToUTC(cancelledTo.split('T')[0],   cancelledTo.split('T')[1],   tzOffset);
      await syncCancelled(shop, session, admin, fromUTC, toUTC);
    }

    return { success: true, message: "Inventory synced successfully." };
  }

  return new Response("Invalid intent", { status: 400 });
}

export default function TodaysInventory() {
  const { products, totals, todayLocalStr, cancelledFrom, cancelledTo, tzOffset } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [cancelFrom, setCancelFrom] = useState(cancelledFrom);
  const [cancelTo, setCancelTo] = useState(cancelledTo);

  // If no tzOffset in URL, redirect with current offset
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("tzOffset")) {
      const offset = new Date().getTimezoneOffset();
      url.searchParams.set("tzOffset", offset);
      navigate(url.pathname + url.search, { replace: true });
    }
  }, [navigate]);

  const filteredProducts = products.filter((p) =>
    p.productName.toLowerCase().includes(search.toLowerCase())
  );

  const handleSync = () => {
    const formData = new FormData();
    formData.set("intent", "sync-all");
    formData.set("cancelledFrom", cancelFrom);
    formData.set("cancelledTo", cancelTo);
    formData.set("tzOffset", tzOffset);
    fetcher.submit(formData, { method: "post" });
  };

  const handleApplyRange = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("cancelledFrom", cancelFrom);
    url.searchParams.set("cancelledTo", cancelTo);
    navigate(url.pathname + url.search, { replace: true });
  };

  const isSyncing = fetcher.state === "submitting";

  // Helper to format currency
  const formatCurrency = (value) => `$${value.toFixed(2)}`;

  return (
    <s-page heading="Today's Inventory" inlineSize="large">
      <s-section padding="base">
        <s-stack gap="base">
          {/* Today's date */}
          <s-text type="subdued">📅 Today: {todayLocalStr}</s-text>

          {/* Top bar: search + cancelled range inputs + buttons */}
          <s-stack direction="inline" gap="small" alignItems="center" wrap={false}>
            <s-search-field
              label="Search products"
              placeholder="Search by name"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <s-text-field
              type="datetime-local"
              label="Cancelled from"
              value={cancelFrom}
              onChange={(e) => setCancelFrom(e.currentTarget.value)}
            />
            <s-text-field
              type="datetime-local"
              label="Cancelled to"
              value={cancelTo}
              onChange={(e) => setCancelTo(e.currentTarget.value)}
            />
            <s-button variant="secondary" onClick={handleApplyRange}>
              Apply Range
            </s-button>
            <s-button
              variant="primary"
              onClick={handleSync}
              loading={isSyncing}
            >
              {isSyncing ? "Syncing..." : "Sync"}
            </s-button>
          </s-stack>

          {/* Success message */}
          {fetcher.data?.success && (
            <s-banner tone="success">{fetcher.data.message}</s-banner>
          )}

          {/* Unfulfilled Table */}
          <s-heading level={2}>Unfulfilled Orders (current)</s-heading>
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header>Product</s-table-header>
              <s-table-header>Sells</s-table-header>
              <s-table-header>Manual</s-table-header>
              <s-table-header>Return</s-table-header>
              <s-table-header>Damage</s-table-header>
              <s-table-header>Final Sells</s-table-header>
              <s-table-header>Inventory Before</s-table-header>
              <s-table-header>Inventory After</s-table-header>
              <s-table-header>Revenue</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {filteredProducts.map((p) => (
                <s-table-row key={p.productId}>
                  <s-table-cell>{p.productName}</s-table-cell>
                  <s-table-cell>{p.unfulfilledSells}</s-table-cell>
                  <s-table-cell>{p.unfulfilledManual}</s-table-cell>
                  <s-table-cell>{p.unfulfilledReturn}</s-table-cell>
                  <s-table-cell>{p.unfulfilledDamage}</s-table-cell>
                  <s-table-cell><s-text weight="bold">{p.unfulfilledFinal}</s-text></s-table-cell>
                  <s-table-cell>{p.inventoryBefore}</s-table-cell>
                  <s-table-cell>{p.inventoryBefore - p.unfulfilledFinal}</s-table-cell>
                  <s-table-cell>{formatCurrency(p.price * p.unfulfilledFinal)}</s-table-cell>
                </s-table-row>
              ))}
              {/* Totals row */}
              <s-table-row tone="strong">
                <s-table-cell>Totals</s-table-cell>
                <s-table-cell />
                <s-table-cell />
                <s-table-cell />
                <s-table-cell />
                <s-table-cell>{totals.unfulfilledFinal}</s-table-cell>
                <s-table-cell />
                <s-table-cell />
                <s-table-cell>
                  {formatCurrency(products.reduce((acc, p) => acc + p.price * p.unfulfilledFinal, 0))}
                </s-table-cell>
              </s-table-row>
            </s-table-body>
          </s-table>

          {/* Fulfilled Table (yesterday) */}
          <s-heading level={2}>Fulfilled Orders (yesterday)</s-heading>
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header>Product</s-table-header>
              <s-table-header>Sells</s-table-header>
              <s-table-header>Manual</s-table-header>
              <s-table-header>Return</s-table-header>
              <s-table-header>Damage</s-table-header>
              <s-table-header>Final Sells</s-table-header>
              <s-table-header>Inventory Before</s-table-header>
              <s-table-header>Inventory After</s-table-header>
              <s-table-header>Revenue</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {filteredProducts.map((p) => (
                <s-table-row key={p.productId}>
                  <s-table-cell>{p.productName}</s-table-cell>
                  <s-table-cell>{p.fulfilledSells}</s-table-cell>
                  <s-table-cell>{p.fulfilledManual}</s-table-cell>
                  <s-table-cell>{p.fulfilledReturn}</s-table-cell>
                  <s-table-cell>{p.fulfilledDamage}</s-table-cell>
                  <s-table-cell><s-text weight="bold">{p.fulfilledFinal}</s-text></s-table-cell>
                  <s-table-cell>{p.inventoryBefore}</s-table-cell>
                  <s-table-cell>{p.inventoryBefore - p.fulfilledFinal}</s-table-cell>
                  <s-table-cell>{formatCurrency(p.price * p.fulfilledFinal)}</s-table-cell>
                </s-table-row>
              ))}
              <s-table-row tone="strong">
                <s-table-cell>Totals</s-table-cell>
                <s-table-cell />
                <s-table-cell />
                <s-table-cell />
                <s-table-cell />
                <s-table-cell>{totals.fulfilledFinal}</s-table-cell>
                <s-table-cell />
                <s-table-cell />
                <s-table-cell>
                  {formatCurrency(products.reduce((acc, p) => acc + p.price * p.fulfilledFinal, 0))}
                </s-table-cell>
              </s-table-row>
            </s-table-body>
          </s-table>

          {/* Cancelled Table (selected range) */}
          <s-heading level={2}>Cancelled Orders (selected range)</s-heading>
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header>Product</s-table-header>
              <s-table-header>Sells</s-table-header>
              <s-table-header>Lost Revenue</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {filteredProducts.filter(p => p.cancelledSells > 0).map((p) => (
                <s-table-row key={p.productId}>
                  <s-table-cell>{p.productName}</s-table-cell>
                  <s-table-cell>{p.cancelledSells}</s-table-cell>
                  <s-table-cell>{formatCurrency(p.price * p.cancelledSells)}</s-table-cell>
                </s-table-row>
              ))}
              <s-table-row tone="strong">
                <s-table-cell>Totals</s-table-cell>
                <s-table-cell>{totals.cancelledFinal}</s-table-cell>
                <s-table-cell>
                  {formatCurrency(products.reduce((acc, p) => acc + p.price * p.cancelledSells, 0))}
                </s-table-cell>
              </s-table-row>
            </s-table-body>
          </s-table>
        </s-stack>
      </s-section>
    </s-page>
  );
}