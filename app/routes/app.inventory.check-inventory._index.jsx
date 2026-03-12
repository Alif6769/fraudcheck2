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

// Action: sync + process orders for the given date range
export async function action({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const from = formData.get("from");
  const to = formData.get("to");

  console.log("DEBUG action formData:", { from, to });

  if (!from || !to) {
    console.log("DEBUG action: missing from/to, returning 400");
    return new Response("Missing date range", { status: 400 });
  }

  const requestedFrom = new Date(from);
  const requestedTo = new Date(to);

  console.log("DEBUG action parsed dates:", {
    requestedFrom: requestedFrom.toISOString(),
    requestedTo: requestedTo.toISOString(),
  });

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

  const handleProcessAll = () => {
    console.log("DEBUG handleProcessAll state (before submit):", {
      fromDate,
      fromTime,
      toDate,
      toTime,
    });

    const formData = new FormData();
    formData.set("from", `${fromDate}T${fromTime || "00:00"}`);
    formData.set("to", `${toDate}T${toTime || "23:59"}`);

    console.log("DEBUG handleProcessAll sending formData:", {
      from: `${fromDate}T${fromTime || "00:00"}`,
      to: `${toDate}T${toTime || "23:59"}`,
    });

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
    console.log(`DEBUG product search`, {
      productId,
      fromDate,
      fromTime,
      toDate,
      toTime,
      fromStr,
      toStr,
    });
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
            DEBUG MODE: watch the console for date/time state and form data.
            Select a date range and click "Process orders".
          </s-banner>

          {/* DEBUG: show raw state values */}
          <s-banner tone="info">
            <s-text type="strong">DEBUG current state:</s-text>
            <s-text>fromDate: "{fromDate}"</s-text>
            <s-text>fromTime: "{fromTime}"</s-text>
            <s-text>toDate: "{toDate}"</s-text>
            <s-text>toTime: "{toTime}"</s-text>
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
                    onInput={(event) => {
                      const value =
                        event.detail?.value ??
                        event.target?.value ??
                        event.currentTarget?.value ??
                        "";
                      console.log("DEBUG fromDate onInput:", {
                        rawEvent: event,
                        extractedValue: value,
                      });
                      setFromDate(value);
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
                      console.log("DEBUG fromTime onInput:", {
                        rawEvent: event,
                        extractedValue: value,
                      });
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
                    onInput={(event) => {
                      const value =
                        event.detail?.value ??
                        event.target?.value ??
                        event.currentTarget?.value ??
                        "";
                      console.log("DEBUG toDate onInput:", {
                        rawEvent: event,
                        extractedValue: value,
                      });
                      setToDate(value);
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
                      console.log("DEBUG toTime onInput:", {
                        rawEvent: event,
                        extractedValue: value,
                      });
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

          {/* Per‑product table (unchanged except debug logging) */}
          <s-section padding="base">
            <s-stack gap="small">
              <s-heading>Per‑product ranges (DEBUG logs on change)</s-heading>

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
                            console.log("DEBUG row.fromDate onInput:", {
                              productId: row.id,
                              rawEvent: event,
                              extractedValue: value,
                            });
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
                            console.log("DEBUG row.fromTime onInput:", {
                              productId: row.id,
                              rawEvent: event,
                              extractedValue: value,
                            });
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
                            console.log("DEBUG row.toDate onInput:", {
                              productId: row.id,
                              rawEvent: event,
                              extractedValue: value,
                            });
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
                            console.log("DEBUG row.toTime onInput:", {
                              productId: row.id,
                              rawEvent: event,
                              extractedValue: value,
                            });
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