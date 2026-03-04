
import {
  useLoaderData,
  useFetcher,
  useRevalidator,
} from "react-router";
import { useEffect } from "react";

import { authenticate, syncOrders } from "../shopify.server";
import prisma from "../db.server";

/* =========================
   ACTION (Sync Orders)
========================= */

export const action = async ({ request }) => {
  try {
    const { session, admin } = await authenticate.admin(request);

    const count = await syncOrders(session, admin);

    return new Response(
      JSON.stringify({ success: true, synced: count }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ Sync orders failed:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

/* =========================
   LOADER (Load Orders)
========================= */

export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);

    const orders = await prisma.order.findMany({
      where: { shop: session.shop },
      orderBy: { orderTime: "desc" },
    });

    return { orders, shop: session.shop };
  } catch (error) {
    console.error("❌ Loader error:", error);
    throw new Response("Failed to load orders", { status: 500 });
  }
};

/* =========================
   HELPERS
========================= */

function formatDate(date) {
  if (!date) return "-";
  return new Date(date).toLocaleString();
}

function formatCustomerName(first, last) {
  return [first, last].filter(Boolean).join(" ") || "-";
}

const thStyle = {
  borderBottom: "1px solid #ddd",
  padding: "8px",
  textAlign: "left",
  background: "#f4f6f8",
};

const tdStyle = {
  borderBottom: "1px solid #eee",
  padding: "8px",
};

// NEW HELPER: Determine if shipping address is inside Dhaka
function getDhakaStatus(shippingAddressStr) {
  if (!shippingAddressStr) return "-";
  try {
    const address = JSON.parse(shippingAddressStr);
    const city = address.city || "";
    // Case‑insensitive check for "dhaka"
    if (city.toLowerCase().includes("dhaka")) {
      return "Inside Dhaka";
    } else {
      return "Outside Dhaka";
    }
  } catch (e) {
    return "-";
  }
}

/* =========================
   COMPONENT
========================= */

export default function Index() {
  const { orders = [], shop = "" } = useLoaderData() || {};
  const fetcher = useFetcher();
  const revalidator = useRevalidator();

  // ✅ Auto refresh table after successful sync
  useEffect(() => {
    if (fetcher.data?.success) {
      revalidator.revalidate();
    }
  }, [fetcher.data]);

  return (
    <s-page heading="Orders Dashboard">
      <s-section>

        {/* Sync Button */}
        <button
          onClick={() => fetcher.submit({}, { method: "post" })}
          disabled={fetcher.state === "submitting"}
          style={{
            padding: "8px 16px",
            marginBottom: "15px",
            cursor: "pointer",
            background: "#008060",
            color: "white",
            border: "none",
            borderRadius: "6px",
          }}
        >
          {fetcher.state === "submitting"
            ? "Syncing..."
            : "Sync Orders"}
        </button>

        {/* Success Message */}
        {fetcher.data?.success && (
          <div
            style={{
              marginBottom: "10px",
              color: "green",
              fontWeight: "500",
            }}
          >
            ✅ {fetcher.data.synced} orders synced successfully
          </div>
        )}

        {/* Error Message */}
        {fetcher.data?.error && (
          <div
            style={{
              marginBottom: "10px",
              color: "red",
              fontWeight: "500",
            }}
          >
            ❌ {fetcher.data.error}
          </div>
        )}

        <s-paragraph>
          Showing orders for: <strong>{shop}</strong>
        </s-paragraph>

        {orders.length === 0 ? (
          <s-paragraph>No orders found.</s-paragraph>
        ) : (
          <div style={{ overflowX: "auto", marginTop: "20px" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "14px",
              }}
            >
              <thead>
                <tr>
                  <th style={thStyle}>Order Name</th>
                  <th style={thStyle}>Order Time</th>
                  <th style={thStyle}>Customer Name</th>
                  <th style={thStyle}>Shipping Phone</th>
                  <th style={thStyle}>Shipping Address</th>
                  <th style={thStyle}>Total Price</th>
                  <th style={thStyle}>Shipping Fee</th>
                  <th style={thStyle}>Products</th>
                </tr>
              </thead>

              <tbody>
                {orders.map((order) => (
                  <tr key={order.orderName}>
                    <td style={tdStyle}>
                      {order.orderName || "-"}
                    </td>

                    <td style={tdStyle}>
                      {formatDate(order.orderTime)}
                    </td>

                    <td style={tdStyle}>
                      {formatCustomerName(
                        order.firstName,
                        order.lastName
                      )}
                    </td>

                    <td style={tdStyle}>
                      {order.shippingPhone || "-"}
                    </td>

                    <td style={tdStyle}>
                      {getDhakaStatus(order.shippingAddress)}
                    </td>

                    <td style={tdStyle}>
                      {order.totalPrice || "0"}
                    </td>

                    <td style={tdStyle}>
                      {order.shippingFee || "0"}
                    </td>

                    <td style={tdStyle}>
                      {Array.isArray(order.products) &&
                      order.products.length > 0 ? (
                        order.products.map((product, index) => (
                          <div key={index}>
                            {product.title || "Product"} ×{" "}
                            {product.quantity || 1}
                          </div>
                        ))
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </s-section>
    </s-page>
  );
}

/* =========================
   HEADERS
========================= */

export const headers = () => {
  return {};
};