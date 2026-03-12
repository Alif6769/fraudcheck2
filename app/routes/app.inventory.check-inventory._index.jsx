import { useFetcher } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";

// Optional: existing server-side logic, left mostly unchanged
export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const from = formData.get("from");
  const to = formData.get("to");

  if (!from || !to) {
    return new Response("Missing date range", { status: 400 });
  }

  // NOTE: The client-side UI now collects separate date + time pieces.
  // You will likely want to parse and combine them here into Date objects
  // in your shop's timezone (for example, Asia/Dhaka for BD time).
  // The current implementation still assumes full ISO strings in `from`/`to`.

  const fromDate = new Date(from.toString());
  const toDate = new Date(to.toString());
  toDate.setHours(23, 59, 59, 999);

  // const result = await processFulfilledOrders(fromDate, toDate);

  // Placeholder result until you wire up real logic
  const result = {
    processedOrders: 0,
    transactionsCreated: 0,
  };

  return { success: true, ...result };
}

// --- UI component ---------------------------------------------------------

const INITIAL_PRODUCT_ROWS = [
  {
    id: "1",
    name: "Sample product A",
    fromDate: "",
    fromTime: "",
    toDate: "",
    toTime: "",
  },
  {
    id: "2",
    name: "Sample product B",
    fromDate: "",
    fromTime: "",
    toDate: "",
    toTime: "",
  },
];

export default function CheckInventory() {
  const fetcher = useFetcher();

  // Top-level date range (for all products)
  const [fromDate, setFromDate] = useState("");
  const [fromTime, setFromTime] = useState("00:00");
  const [toDate, setToDate] = useState("");
  const [toTime, setToTime] = useState("23:59");

  // Per-product ranges for the table
  const [productRows, setProductRows] = useState(INITIAL_PRODUCT_ROWS);

  const handleProcessAll = () => {
    // NOTE: This is intentionally light on business logic.
    // Right now we just submit the raw combined strings.
    const formData = new FormData();

    if (fromDate) {
      formData.set("from", `${fromDate}T${fromTime || "00:00"}`);
    }
    if (toDate) {
      formData.set("to", `${toDate}T${toTime || "23:59"}`);
    }

    fetcher.submit(formData, { method: "post" });
  };

  const isSubmitting = fetcher.state === "submitting";

  const handleProductFieldChange = (id, field, value) => {
    setProductRows((rows) =>
      rows.map((row) =>
        row.id === id
          ? {
              ...row,
              [field]: value,
            }
          : row
      )
    );
  };

  return (
    <s-page heading="Check inventory" inlineSize="large">
      <s-section padding="base">
        <s-stack gap="base">
          {/* Warning that this UI is not fully wired yet */}
          <s-banner tone="warning">
            This screen only provides the UI for selecting date and time ranges.
            The server-side logic to combine dates, times, and handle time
            zones (for example, BD time vs the shop's timezone) still needs to
            be implemented.
          </s-banner>

          {/* Global date range controls */}
          <s-stack gap="small">
            <s-heading>Overall date range</s-heading>

            <s-stack direction="inline" gap="small" alignItems="center">
              {/* From date + time */}
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

              {/* To date + time */}
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
          </s-stack>

          {/* Success / error banners from the fetcher */}
          {fetcher.data?.success && (
            <s-banner tone="success">
              Processed {fetcher.data.processedOrders} orders, created{" "}
              {fetcher.data.transactionsCreated} transactions.
            </s-banner>
          )}

          {fetcher.data?.error && (
            <s-banner tone="critical">{fetcher.data.error}</s-banner>
          )}

          {/* Per-product table with its own per-row date ranges */}
          <s-section padding="base">
            <s-stack gap="small">
              <s-heading>Per-product ranges</s-heading>

              {/* Search/filter above the table (logic to be implemented later) */}
              <s-stack direction="inline" gap="small" alignItems="center">
                <s-search-field
                  label="Search products"
                  placeholder="Search by title or SKU"
                  // Wire this up to real filtering when you implement the logic
                  onInput={() => {
                    // no-op for now
                  }}
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
                          onClick={() => {
                            // Row-level search / processing logic to be implemented later
                          }}
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