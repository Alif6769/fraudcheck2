// app/routes/app.courier.pathao.jsx
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// ---------- Loader ----------
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // Fetch unfulfilled orders for this shop
  const unfulfilledOrders = await prisma.unfulfilledOrder.findMany({
    where: { shop: shopDomain },
    orderBy: { orderTime: "desc" },
  });

  console.log(
    `shop domain in pathao ${shopDomain}, total unfulfilled orders ${unfulfilledOrders.length}`
  );

  return { unfulfilledOrders, shopDomain };
}

// ---------- Component ----------
export default function PathaoDashboard() {
  const { unfulfilledOrders, shopDomain } = useLoaderData();
  console.log("Component unfulfilledOrders:", unfulfilledOrders);

  const handleSync = () => {
    // Simple sync: reloads the page and triggers loader again
    window.location.reload();
  };

  return (
    <s-page heading="Pathao Courier – Unfulfilled Orders">
      <s-section>
        <s-stack gap="base">
          {/* Shop info */}
          <s-text>Shop: {shopDomain}</s-text>

          {/* Sync button row */}
          <s-stack direction="inline" gap="small">
            <s-button onClick={handleSync}>Sync Orders</s-button>
          </s-stack>

          {/* Unfulfilled orders card */}
          <s-box
            background="base"
            border="base"
            borderRadius="base"
            padding="base"
          >
            <s-heading accessibilityRole="heading">
              Unfulfilled Orders
            </s-heading>

            <s-table variant="auto">
              <s-table-header-row>
                <s-table-header listSlot="primary">
                  Order Name
                </s-table-header>
                <s-table-header format="currency">
                  Total Price
                </s-table-header>
                <s-table-header listSlot="secondary">
                  Customer Name
                </s-table-header>
                <s-table-header>Shipping Phone</s-table-header>
                <s-table-header>Shipping Address</s-table-header>
              </s-table-header-row>

              <s-table-body>
                {unfulfilledOrders.length === 0 ? (
                  <s-table-row>
                    {/* Message cell */}
                    <s-table-cell>
                      No unfulfilled orders found.
                    </s-table-cell>
                    {/* Empty cells to keep column count consistent */}
                    <s-table-cell />
                    <s-table-cell />
                    <s-table-cell />
                    <s-table-cell />
                  </s-table-row>
                ) : (
                  unfulfilledOrders.map((order) => (
                    <s-table-row key={order.orderName}>
                      <s-table-cell>{order.orderName}</s-table-cell>
                      <s-table-cell>
                        {parseFloat(order.totalPrice).toFixed(2)}
                      </s-table-cell>
                      <s-table-cell>
                        {order.firstName} {order.lastName}
                      </s-table-cell>
                      <s-table-cell>
                        {order.shippingPhone || order.contactPhone}
                      </s-table-cell>
                      <s-table-cell>
                        {order.shippingAddress || "-"}
                      </s-table-cell>
                    </s-table-row>
                  ))
                )}
              </s-table-body>
            </s-table>
          </s-box>
        </s-stack>
      </s-section>
    </s-page>
  );
}