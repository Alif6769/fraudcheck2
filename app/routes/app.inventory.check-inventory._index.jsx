import { useFetcher, useLoaderData } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { syncFulfilledOrdersForRange, processFulfilledOrdersWithRange } from "../services/inventory.server";

// Loader to fetch products (raw or combo)
export async function loader() {
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { rawProductFlag: true },
        { isCombo: true },
        // Alternatively, filter by inventoryCategory:
        // { inventoryCategory: { in: ["rawProducts", "comboProducts"] } }
      ],
    },
    orderBy: { productName: "asc" },
  });
  return { products };
}

// Helper: Convert local datetime string to UTC Date
function localToUTC(localDateTimeString) {
  // Create a Date object from the local string (browser interprets it as local time)
  const localDate = new Date(localDateTimeString);
  // Get the UTC timestamp directly
  return new Date(localDate.toISOString());
}

// Helper: Format UTC date for display in local timezone
function formatForDisplay(utcDate, timeZone = 'Asia/Dhaka') {
  return utcDate.toLocaleString('en-US', { 
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export async function action({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const from = formData.get("from");
  const to = formData.get("to");

  if (!from || !to) {
    return new Response("Missing date range", { status: 400 });
  }

  const requestedFrom = new Date(from);
  const requestedTo = new Date(to);
  // requestedTo.setHours(23, 59, 59, 999);
  // const requestedFrom = localToUTC(from);
  // const requestedTo = localToUTC(to);

  // 1. Sync fulfillment data from Shopify for the requested range
  await syncFulfilledOrdersForRange(session, admin, requestedFrom, requestedTo);

  // 2. Process transactions using the effective range logic (now with updated orders)
  const result = await processFulfilledOrdersWithRange(requestedFrom, requestedTo, session.shop);

  return { success: true, ...result };
}

export default function CheckInventory() {
  const { products } = useLoaderData();
  const fetcher = useFetcher();

  // Top-level date range
  const [fromDate, setFromDate] = useState("");
  const [fromTime, setFromTime] = useState("00:00");
  const [toDate, setToDate] = useState("");
  const [toTime, setToTime] = useState("23:59");

  // Per‑product rows – initialised from loader products
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

  const handleProcessAll = () => {
    const formData = new FormData();
    if (fromDate) {
      formData.set("from", `${fromDate}T${fromTime || "00:00"}`);
    }
    if (toDate) {
      formData.set("to", `${toDate}T${toTime || "23:59"}`);
    }
    console.log("Submitting from:", `${fromDate}T${fromTime}`, "to:", `${toDate}T${toTime}`);
    fetcher.submit(formData, { method: "post" });
  };

  const isSubmitting = fetcher.state === "submitting";

  const handleProductSearch = (productId, fromDate, fromTime, toDate, toTime) => {
    const fromStr = fromDate ? `${fromDate}T${fromTime || "00:00"}` : null;
    const toStr = toDate ? `${toDate}T${toTime || "23:59"}` : null;
    console.log(`Search product ${productId} from ${fromStr} to ${toStr}`);
    alert(`Per‑product search not yet implemented. Selected range: ${fromStr} – ${toStr}`);
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
            Select a date range and click "Process orders" to sync fulfillment data and create product transactions.
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
                    onInput={(event) =>
                      setFromDate(event.currentTarget.value || "")
                    }
                  />
                  <s-text-field
                    label="Time (HH:MM)"
                    placeholder="00:00"
                    value={fromTime}
                    onInput={(event) =>
                      setFromTime(event.currentTarget.value || "")
                    }
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
                    onInput={(event) =>
                      setToDate(event.currentTarget.value || "")
                    }
                  />
                  <s-text-field
                    label="Time (HH:MM)"
                    placeholder="23:59"
                    value={toTime}
                    onInput={(event) =>
                      setToTime(event.currentTarget.value || "")
                    }
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
                Selected range: {selection.fromFormatted} – {selection.toFormatted}
              </s-text>
            )}
          </s-stack>

          {/* Success banner with detailed range info */}
          {fetcher.data?.success && fetcher.data.range && (
            <s-banner tone="success">
              <s-stack gap="small">
                <s-text>✅ Successfully processed orders!</s-text>
                <s-text>
                  Date range: {new Date(fetcher.data.range.fromDateTime).toLocaleString()} – {new Date(fetcher.data.range.toDateTime).toLocaleString()}
                </s-text>
                <s-text>Orders processed: {fetcher.data.processedOrders}</s-text>
                {fetcher.data.range.processedOrderNameFrom && fetcher.data.range.processedOrderNameTo && (
                  <s-text>
                    Order range: {fetcher.data.range.processedOrderNameFrom} – {fetcher.data.range.processedOrderNameTo}
                  </s-text>
                )}
                <s-text>Transactions created: {fetcher.data.transactionsCreated}</s-text>
              </s-stack>
            </s-banner>
          )}

          {/* Error banner */}
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
                          onInput={(event) =>
                            handleProductFieldChange(
                              row.id,
                              "fromDate",
                              event.currentTarget.value || ""
                            )
                          }
                        />
                      </s-table-cell>

                      <s-table-cell>
                        <s-text-field
                          label=""
                          placeholder="00:00"
                          value={row.fromTime}
                          onInput={(event) =>
                            handleProductFieldChange(
                              row.id,
                              "fromTime",
                              event.currentTarget.value || ""
                            )
                          }
                        />
                      </s-table-cell>

                      <s-table-cell>
                        <s-date-field
                          label=""
                          value={row.toDate}
                          onInput={(event) =>
                            handleProductFieldChange(
                              row.id,
                              "toDate",
                              event.currentTarget.value || ""
                            )
                          }
                        />
                      </s-table-cell>

                      <s-table-cell>
                        <s-text-field
                          label=""
                          placeholder="23:59"
                          value={row.toTime}
                          onInput={(event) =>
                            handleProductFieldChange(
                              row.id,
                              "toTime",
                              event.currentTarget.value || ""
                            )
                          }
                        />
                      </s-table-cell>

                      <s-table-cell>
                        <s-button
                          variant="secondary"
                          onClick={() => handleProductSearch(row.id, row.fromDate, row.fromTime, row.toDate, row.toTime)}
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