// app/routes/app.inventory.check-inventory.jsx
import { useFetcher, useLoaderData } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  syncFulfilledOrdersForRange,
  processFulfilledOrdersWithRange,
} from "../services/inventory.server";

// Loader to fetch products (raw or combo)
export async function loader() {
  const products = await prisma.product.findMany({
    where: {
      OR: [{ rawProductFlag: true }, { isCombo: true }],
    },
    orderBy: { productName: "asc" },
  });
  return { products };
}

// Helper: format the selected local range for display
function formatLocalRange(fromDate, fromTime, toDate, toTime) {
  if (!fromDate || !toDate) return null;

  const from = new Date(`${fromDate}T${fromTime || "00:00"}`);
  const to = new Date(`${toDate}T${toTime || "23:59"}`);

  const options = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  };

  return {
    fromFormatted: from.toLocaleString(undefined, options),
    toFormatted: to.toLocaleString(undefined, options),
  };
}

// Action: sync + process orders for the given date range
export async function action({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const from = formData.get("from");
  const to = formData.get("to");

  if (!from || !to) {
    // you can keep this as 400 or change to JSON as discussed earlier
    return new Response("Missing date range", { status: 400 });
  }

  const requestedFrom = new Date(from);
  const requestedTo = new Date(to);

  await syncFulfilledOrdersForRange(session, admin, requestedFrom, requestedTo);
  const result = await processFulfilledOrdersWithRange(
    requestedFrom,
    requestedTo,
    session.shop
  );

  return { success: true, ...result };
}

export default function CheckInventory() {
  const { products } = useLoaderData();
  const fetcher = useFetcher();

  // Global date range state
  const [fromDate, setFromDate] = useState("");
  const [fromTime, setFromTime] = useState("00:00");
  const [toDate, setToDate] = useState("");
  const [toTime, setToTime] = useState("23:59");

  // Client-side validation error
  const [rangeError, setRangeError] = useState("");

  // Per‑product rows
  const [productRows, setProductRows] = useState(
    products.map((product) => ({
      id: product.id,
      name: product.productName,
      fromDate: "",
      fromTime: "",
      toDate: "",
      toTime: "",
    }))
  );

  const isSubmitting = fetcher.state === "submitting";
  const selection = formatLocalRange(fromDate, fromTime, toDate, toTime);

  const handleProcessAll = () => {
    console.log("DEBUG handleProcessAll state:", {
      fromDate,
      fromTime,
      toDate,
      toTime,
    });

    // Client-side validation
    if (!fromDate || !toDate) {
      setRangeError(
        "Please select both a From date and a To date before processing orders."
      );
      return;
    }

    const from = new Date(`${fromDate}T${fromTime || "00:00"}`);
    const to = new Date(`${toDate}T${toTime || "23:59"}`);
    if (from > to) {
      setRangeError("The From date must be before or equal to the To date.");
      return;
    }

    setRangeError("");

    const formData = new FormData();
    formData.set("from", `${fromDate}T${fromTime || "00:00"}`);
    formData.set("to", `${toDate}T${toTime || "23:59"}`);

    fetcher.submit(formData, { method: "post" });
  };

  const handleProductSearch = (
    productId,
    fromDate,
    fromTime,
    toDate,
    toTime
  ) => {
    const fromStr = fromDate ? `${fromDate}T${fromTime || "00:00"}` : null;
    const toStr = toDate ? `${toDate}T${toTime || "23:59"}` : null;
    console.log(`Search product ${productId} from ${fromStr} to ${toStr}`);
    alert(
      `Per‑product search not yet implemented. Selected range: ${fromStr} – ${toStr}`
    );
  };

  const handleProductFieldChange = (id, field, value) => {
    setProductRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  return (
    <s-page heading="Check inventory" inlineSize="large">
      <s-section padding="base">
        <s-stack gap="base">
          {/* Informational banner */}
          <s-banner tone="info">
            Select a date range and click "Process orders" to sync fulfillment
            data and create product transactions.
          </s-banner>

          {/* Global date range controls */}
          <s-stack gap="small">
            <s-heading>Overall date range</s-heading>

            {/* Client-side error */}
            {rangeError && <s-banner tone="critical">{rangeError}</s-banner>}

            <s-stack direction="inline" gap="small" alignItems="center">
              {/* From */}
              <s-stack gap="small">
                <s-text type="strong">From</s-text>
                <s-stack direction="inline" gap="small" alignItems="center">
                  <s-date-field
                    label="Date"
                    value={fromDate}
                    onInput={(event) => {
                      // Web component may send value via detail.value or target.value
                      const value =
                        event.detail?.value ??
                        event.target?.value ??
                        event.currentTarget?.value ??
                        "";
                      console.log("DEBUG fromDate onInput:", value);
                      setFromDate(value);
                      setRangeError("");
                    }}
                  />
                  <s-text-field
                    label="Time (HH:MM)"
                    placeholder="00:00"
                    value={fromTime}
                    onInput={(event) => {
                      const value =
                        event.target?.value ??
                        event.currentTarget?.value ??
                        "";
                      console.log("DEBUG fromTime onInput:", value);
                      setFromTime(value);
                      setRangeError("");
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
                    onInput={(event) => {
                      const value =
                        event.detail?.value ??
                        event.target?.value ??
                        event.currentTarget?.value ??
                        "";
                      console.log("DEBUG toDate onInput:", value);
                      setToDate(value);
                      setRangeError("");
                    }}
                  />
                  <s-text-field
                    label="Time (HH:MM)"
                    placeholder="23:59"
                    value={toTime}
                    onInput={(event) => {
                      const value =
                        event.target?.value ??
                        event.currentTarget?.value ??
                        "";
                      console.log("DEBUG toTime onInput:", value);
                      setToTime(value);
                      setRangeError("");
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

            {/* Show current selection if both dates are chosen */}
            {selection && (
              <s-text tone="subdued">
                Selected range: {selection.fromFormatted} –{" "}
                {selection.toFormatted}
              </s-text>
            )}
          </s-stack>

          {/* Success banner with detailed range info */}
          {fetcher.data?.success && fetcher.data.range && (
            <s-banner tone="success">
              <s-stack gap="small">
                <s-text>✅ Successfully processed orders!</s-text>
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

          {/* Error banner from server (only if you change action to return JSON errors) */}
          {fetcher.data?.error && (
            <s-banner tone="critical">{fetcher.data.error}</s-banner>
          )}

          {/* Per‑product table */}
          <s-section padding="base">
            <s-stack gap="small">
              <s-heading>Per‑product ranges</s-heading>

              {/* Search filter (placeholder) */}
              <s-stack direction="inline" gap="small" alignItems="center">
                <s-search-field
                  label="Search products"
                  placeholder="Search by title"
                  onInput={() => {}}
                />
              </s-stack>

              <s-table variant="auto">
                <s-table-header-row>
                  <s-table-header listSlot="primary">Product</s-table-header>
                  <s-table-header>From date</s-table-header>
                  <s-table-header>From time</s-table-header>
                  <s-table-header>To date</s-table-header>
                  <s-table-header>To time</s-table-header>
                  <s-table-header listSlot="inline">Search</s-table-header>
                </s-table-header-row>

                <s-table-body>
                  {productRows.map((row) => (
                    <s-table-row key={row.id}>
                      <s-table-cell>
                        <s-text type="strong">{row.name}</s-text>
                      </s-table-cell>

                      <s-table-cell>
                        <s-date-field
                          label=""
                          value={row.fromDate}
                          onInput={(event) => {
                            const value =
                              event.detail?.value ??
                              event.target?.value ??
                              event.currentTarget?.value ??
                              "";
                            handleProductFieldChange(row.id, "fromDate", value);
                          }}
                        />
                      </s-table-cell>

                      <s-table-cell>
                        <s-text-field
                          label=""
                          placeholder="00:00"
                          value={row.fromTime}
                          onInput={(event) => {
                            const value =
                              event.target?.value ??
                              event.currentTarget?.value ??
                              "";
                            handleProductFieldChange(row.id, "fromTime", value);
                          }}
                        />
                      </s-table-cell>

                      <s-table-cell>
                        <s-date-field
                          label=""
                          value={row.toDate}
                          onInput={(event) => {
                            const value =
                              event.detail?.value ??
                              event.target?.value ??
                              event.currentTarget?.value ??
                              "";
                            handleProductFieldChange(row.id, "toDate", value);
                          }}
                        />
                      </s-table-cell>

                      <s-table-cell>
                        <s-text-field
                          label=""
                          placeholder="23:59"
                          value={row.toTime}
                          onInput={(event) => {
                            const value =
                              event.target?.value ??
                              event.currentTarget?.value ??
                              "";
                            handleProductFieldChange(row.id, "toTime", value);
                          }}
                        />
                      </s-table-cell>

                      <s-table-cell>
                        <s-button
                          variant="secondary"
                          onClick={() =>
                            handleProductSearch(
                              row.id,
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