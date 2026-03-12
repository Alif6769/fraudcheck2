import { useFetcher } from "react-router";
import { useState } from "react";
import { authenticate } from "../../../shopify.server";          // adjusted
// import { processFulfilledOrders } from "../../../services/inventory.server"; // adjusted

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const from = formData.get("from");
  const to = formData.get("to");

  if (!from || !to) {
    return new Response("Missing date range", { status: 400 });
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

//   const result = await processFulfilledOrders(fromDate, toDate);
  return { success: true, ...result };
}

export default function CheckInventory() {
  const fetcher = useFetcher();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const handleSubmit = () => {
    const formData = new FormData();
    formData.set("from", from);
    formData.set("to", to);
    fetcher.submit(formData, { method: "post" });
  };

  const isSubmitting = fetcher.state === "submitting";

  return (
    <s-page heading="Check Inventory" inlineSize="large">
      <s-section padding="base">
        <s-stack gap="base">
          <s-stack direction="inline" gap="small" alignItems="center">
            <s-text-field
              label="From"
              type="datetime-local"
              value={from}
              onInput={(e) => setFrom(e.currentTarget.value)}
            />
            <s-text-field
              label="To"
              type="datetime-local"
              value={to}
              onInput={(e) => setTo(e.currentTarget.value)}
            />
            <s-button
              variant="primary"
              loading={isSubmitting}
              onClick={handleSubmit}
            >
              Process Orders
            </s-button>
          </s-stack>

          {fetcher.data?.success && (
            <s-banner tone="success">
              ✅ Processed {fetcher.data.processedOrders} orders, created {fetcher.data.transactionsCreated} transactions.
            </s-banner>
          )}

          {fetcher.data?.error && (
            <s-banner tone="critical">
              ❌ {fetcher.data.error}
            </s-banner>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}