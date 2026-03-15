import { useFetcher, useLoaderData } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  syncFulfilledOrdersForRange,
  processFulfilledOrdersWithRange,
} from "../services/inventory.server";

// Helper to get today's date in YYYY-MM-DD format
function getTodayDate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Convert a local "YYYY-MM-DDTHH:MM" string + tz offset (in minutes)
// into a UTC Date object.
function parseLocalToUTC(dateTimeStr, offsetMinutes) {
  const [datePart, timePart] = dateTimeStr.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  // offsetMinutes is from JS getTimezoneOffset() (minutes behind UTC),
  // so we add it to convert local -> UTC.
  utcDate.setMinutes(utcDate.getMinutes() + offsetMinutes);
  return utcDate;
}

// Loader: fetch products AND last processed range for this shop
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const products = await prisma.product.findMany({
    where: {
      OR: [{ rawProductFlag: true }, { isCombo: true }],
    },
    orderBy: { productName: "asc" },
  });

  // Get the most recent processed range for this shop
  const processedRange = await prisma.processedOrderRange.findFirst({
    where: { shop },
    orderBy: { toDateTime: "desc" }, // latest run
  });

  return { products, processedRange };
}

// Action: sync + process orders for the given date range
export async function action({ request }) {
  try {
    const { session, admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent") || "process-orders";
    const from = formData.get("from");
    const to = formData.get("to");
    const tzOffset = parseInt(formData.get("tzOffset") || "0", 10);

    if (!from || !to) {
      return new Response("Missing date range", { status: 400 });
    }

    const requestedFrom = parseLocalToUTC(from, tzOffset);
    const requestedTo = parseLocalToUTC(to, tzOffset);

    if (intent === "product-search") {
      const productId = formData.get("productId");
      if (!productId) {
        return new Response("Missing productId", { status: 400 });
      }

      const product = await prisma.product.findUnique({
        where: { productId },
        select: { productName: true },
      });

      if (!product) {
        return new Response("Product not found", { status: 404 });
      }

      const transactions = await prisma.productTransaction.groupBy({
        by: ["type"],
        where: {
          productId,
          timestamp: {
            gte: requestedFrom,
            lte: requestedTo,
          },
        },
        _sum: { quantity: true },
      });

      const totals = { SALE: 0, RETURN: 0, DAMAGE: 0, MANUAL_SALE: 0 };
      transactions.forEach((t) => {
        totals[t.type] = t._sum.quantity || 0;
      });

      return {
        success: true,
        productId,
        productName: product.productName,
        totals,
        from,
        to,
      };
    }

    // Process fulfilled orders over range
    await syncFulfilledOrdersForRange(session, admin, requestedFrom, requestedTo);

    const result = await processFulfilledOrdersWithRange(
      requestedFrom,
      requestedTo,
      session.shop
    );

    // Optionally: if processFulfilledOrdersWithRange is not already writing
    // ProcessedOrderRange, you could upsert it here. Assuming it does already.

    return { success: true, ...result };
  } catch (error) {
    console.error("❌ Action error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export default function CheckInventory() {
  const { products, processedRange } = useLoaderData();
  const fetcher = useFetcher();
  const productFetcher = useFetcher();

  const today = getTodayDate();

  // Global date range state with default to today
  const [fromDate, setFromDate] = useState(today);
  const [fromTime, setFromTime] = useState("00:00");
  const [toDate, setToDate] = useState(today);
  const [toTime, setToTime] = useState("23:59");

  // Per‑product rows
  const [productRows, setProductRows] = useState(
    products.map((product) => ({
      productId: product.productId,
      name: product.productName,
      fromDate: "",
      fromTime: "",
      toDate: "",
      toTime: "",
    }))
  );

  const isSubmitting = fetcher.state === "submitting";

  const handleProcessAll = () => {
    const formData = new FormData();
    formData.set("from", `${fromDate}T${fromTime || "00:00"}`);
    formData.set("to", `${toDate}T${toTime || "23:59"}`);
    const tzOffset = new Date().getTimezoneOffset();
    formData.set("tzOffset", tzOffset);
    fetcher.submit(formData, { method: "post" });
  };

  const handleProductSearch = (
    productId,
    fromDateValue,
    fromTimeValue,
    toDateValue,
    toTimeValue
  ) => {
    const fromStr = fromDateValue
      ? `${fromDateValue}T${fromTimeValue || "00:00"}`
      : null;
    const toStr = toDateValue
      ? `${toDateValue}T${toTimeValue || "23:59"}`
      : null;
    if (!fromStr || !toStr) {
      alert("Please select both from and to dates/times");
      return;
    }
    const formData = new FormData();
    formData.set("intent", "product-search");
    formData.set("productId", productId);
    formData.set("from", fromStr);
    formData.set("to", toStr);
    formData.set("tzOffset", new Date().getTimezoneOffset());
    productFetcher.submit(formData, { method: "post" });
  };

  const handleProductFieldChange = (productId, field, value) => {
    setProductRows((rows) =>
      rows.map((row) =>
        row.productId === productId ? { ...row, [field]: value } : row
      )
    );
  };

  return (
    <s-page heading="Check inventory" inlineSize="large">
      <s-section padding="base">
        <s-stack gap="base">
          {/* Top banner: show already-processed range for this shop, or prompt to process first */}
          <s-banner tone="info">
            {processedRange && processedRange.processedOrdersCount > 0 ? (
              <s-stack gap="small">
                <s-text type="strong">
                  Processed order history for this shop
                </s-text>
                <s-text>
                  Already processed orders from{" "}
                  {new Date(
                    processedRange.fromDateTime
                  ).toLocaleString()}{" "}
                  to{" "}
                  {new Date(
                    processedRange.toDateTime
                  ).toLocaleString()}
                  .
                </s-text>
                {processedRange.processedOrderNameFrom &&
                  processedRange.processedOrderNameTo && (
                    <s-text>
                      Order name range:{" "}
                      {processedRange.processedOrderNameFrom} –{" "}
                      {processedRange.processedOrderNameTo}
                    </s-text>
                  )}
                <s-text>
                  If you need to check or sync orders <s-text type="strong">outside</s-text> this
                  processed range, select the desired date/time range below and click{" "}
                  <s-text type="strong">Process orders</s-text> first. After processing,
                  you can run product-specific searches within that range using the
                  per-product table.
                </s-text>
              </s-stack>
            ) : (
              <s-stack gap="small">
                <s-text type="strong">
                  No processed order history found yet.
                </s-text>
                <s-text>
                  Select a date/time range below and click{" "}
                  <s-text type="strong">Process orders</s-text> to fetch and process
                  fulfilled orders. Once processing is complete, this banner will show
                  the processed date range and order name range, and you can then use
                  per-product searches within that processed window.
                </s-text>
              </s-stack>
            )}
          </s-banner>

          {/* Global date range controls */}
          <s-stack gap="small">
            <s-heading>Overall date range</s-heading>

            <s-stack direction="inline" gap="small" alignItems="center">
              {/* From */}
              <s-stack gap="small">
                <s-text type="strong">From</s-text>
                <s-stack direction="inline" gap="small" alignItems="center">
                  <s-date-field
                    label="Date"
                    value={fromDate}
                    onChange={(event) => {
                      const value =
                        event.detail?.value ??
                        event.target?.value ??
                        event.currentTarget?.value ??
                        "";
                      setFromDate(value);
                    }}
                  />
                  <s-text-field
                    label="Time (HH:MM)"
                    placeholder="00:00"
                    value={fromTime}
                    onChange={(event) => {
                      const value =
                        event.target?.value ??
                        event.currentTarget?.value ??
                        "";
                      setFromTime(value);
                    }}
                  />
                </s-stack>
              </s-stack>

              {/* To */}
              <s-stack gap="small">
                <s-text type="strong">To</s-text>
                <s-stack direction="inline" gap="small" alignItems="center">
                  <s-date-field
                    label="Date"
                    value={toDate}
                    onChange={(event) => {
                      const value =
                        event.detail?.value ??
                        event.target?.value ??
                        event.currentTarget?.value ??
                        "";
                      setToDate(value);
                    }}
                  />
                  <s-text-field
                    label="Time (HH:MM)"
                    placeholder="23:59"
                    value={toTime}
                    onChange={(event) => {
                      const value =
                        event.target?.value ??
                        event.currentTarget?.value ??
                        "";
                      setToTime(value);
                    }}
                  />
                </s-stack>
              </s-stack>

              <s-button
                variant="primary"
                loading={isSubmitting}
                onClick={handleProcessAll}
              >
                Process orders
              </s-button>
            </s-stack>
          </s-stack>

          {/* Success banner with detailed range info from action */}
          {fetcher.data?.success && fetcher.data.range && (
            <s-banner tone="success">
              <s-stack gap="small">
                <s-text>Successfully processed orders.</s-text>
                <s-text>
                  Date range:{" "}
                  {new Date(
                    fetcher.data.range.fromDateTime
                  ).toLocaleString()}{" "}
                  –{" "}
                  {new Date(
                    fetcher.data.range.toDateTime
                  ).toLocaleString()}
                </s-text>
                <s-text>
                  Orders processed: {fetcher.data.processedOrders}
                </s-text>
                {fetcher.data.range.processedOrderNameFrom &&
                  fetcher.data.range.processedOrderNameTo && (
                    <s-text>
                      Order range:{" "}
                      {fetcher.data.range.processedOrderNameFrom} –{" "}
                      {fetcher.data.range.processedOrderNameTo}
                    </s-text>
                  )}
                <s-text>
                  Transactions created: {fetcher.data.transactionsCreated}
                </s-text>
              </s-stack>
            </s-banner>
          )}

          {/* Per‑product search results banner */}
          {productFetcher.data?.success && productFetcher.data.productId && (
            <s-banner tone="info">
              <s-stack gap="small">
                <s-text>Product transaction summary</s-text>
                <s-text>Product: {productFetcher.data.productName}</s-text>
                <s-text>
                  From {productFetcher.data.from} to {productFetcher.data.to}
                </s-text>
                <s-text>
                  Sales: {productFetcher.data.totals.SALE}
                </s-text>
                <s-text>
                  Returns: {productFetcher.data.totals.RETURN}
                </s-text>
                <s-text>
                  Damages: {productFetcher.data.totals.DAMAGE}
                </s-text>
                <s-text>
                  Manual Sales: {productFetcher.data.totals.MANUAL_SALE}
                </s-text>
              </s-stack>
            </s-banner>
          )}

          {/* Per‑product table */}
          <s-section padding="base">
            <s-stack gap="small">
              <s-heading>Per‑product ranges</s-heading>

              <s-stack direction="inline" gap="small" alignItems="center">
                <s-search-field
                  label="Search products"
                  placeholder="Search by title"
                  onInput={() => {}}
                />
              </s-stack>

              <s-table variant="auto">
                <s-table-header-row>
                  <s-table-header listSlot="primary">
                    Product
                  </s-table-header>
                  <s-table-header>From date</s-table-header>
                  <s-table-header>From time</s-table-header>
                  <s-table-header>To date</s-table-header>
                  <s-table-header>To time</s-table-header>
                  <s-table-header listSlot="inline">
                    Search
                  </s-table-header>
                </s-table-header-row>

                <s-table-body>
                  {productRows.map((row) => (
                    <s-table-row key={row.productId}>
                      <s-table-cell>
                        <s-text type="strong">{row.name}</s-text>
                      </s-table-cell>

                      <s-table-cell>
                        <s-date-field
                          label=""
                          value={row.fromDate}
                          onChange={(event) => {
                            const value =
                              event.detail?.value ??
                              event.target?.value ??
                              event.currentTarget?.value ??
                              "";
                            handleProductFieldChange(
                              row.productId,
                              "fromDate",
                              value
                            );
                          }}
                        />
                      </s-table-cell>

                      <s-table-cell>
                        <s-text-field
                          label=""
                          placeholder="00:00"
                          value={row.fromTime}
                          onChange={(event) => {
                            const value =
                              event.target?.value ??
                              event.currentTarget?.value ??
                              "";
                            handleProductFieldChange(
                              row.productId,
                              "fromTime",
                              value
                            );
                          }}
                        />
                      </s-table-cell>

                      <s-table-cell>
                        <s-date-field
                          label=""
                          value={row.toDate}
                          onChange={(event) => {
                            const value =
                              event.detail?.value ??
                              event.target?.value ??
                              event.currentTarget?.value ??
                              "";
                            handleProductFieldChange(
                              row.productId,
                              "toDate",
                              value
                            );
                          }}
                        />
                      </s-table-cell>

                      <s-table-cell>
                        <s-text-field
                          label=""
                          placeholder="23:59"
                          value={row.toTime}
                          onChange={(event) => {
                            const value =
                              event.target?.value ??
                              event.currentTarget?.value ??
                              "";
                            handleProductFieldChange(
                              row.productId,
                              "toTime",
                              value
                            );
                          }}
                        />
                      </s-table-cell>

                      <s-table-cell>
                        <s-button
                          variant="secondary"
                          onClick={() =>
                            handleProductSearch(
                              row.productId,
                              row.fromDate,
                              row.fromTime,
                              row.toDate,
                              row.toTime
                            )
                          }
                        >
                          Search
                        </s-button>
                      </s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            </s-stack>
          </s-section>
        </s-stack>
      </s-section>
    </s-page>
  );
}