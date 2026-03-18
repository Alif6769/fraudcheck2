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

  const handleSync = () => {
    window.location.reload(); // simple sync – reloads the page
  };

  return (
    <s-stack gap="base">
      <s-heading level="2">Pathao Courier – Unfulfilled Orders</s-heading>
      <s-text>Shop: {shopDomain}</s-text>

      {/* Sync button */}
      <s-stack direction="inline" gap="small">
        <s-button onClick={handleSync}>Sync Orders</s-button>
      </s-stack>

      {/* Orders table */}
      <s-box background="base" border="base" borderRadius="base" padding="base">
        <s-heading level="3">Unfulfilled Orders</s-heading>
        <s-table>
          <thead>
            <tr>
              <th>Order Name</th>
              <th>Total Price</th>
              <th>Customer Name</th>
              <th>Shipping Phone</th>
              <th>Shipping Address</th>
            </tr>
          </thead>
          <tbody>
            {unfulfilledOrders.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: "center" }}>
                  No unfulfilled orders found.
                </td>
              </tr>
            ) : (
              unfulfilledOrders.map((order) => (
                <tr key={order.orderName}>
                  <td>{order.orderName}</td>
                  <td>${parseFloat(order.totalPrice).toFixed(2)}</td>
                  <td>{order.firstName} {order.lastName}</td>
                  <td>{order.shippingPhone || order.contactPhone}</td>
                  <td>{order.shippingAddress || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </s-table>
      </s-box>
    </s-stack>
  );
}