export async function getCustomerStats(admin, customerId) {
  const response = await admin.graphql(`
    query getCustomer($id: ID!) {
      customer(id: $id) {
        numberOfOrders
        orders(first: 50) {
          nodes {
            fulfillmentStatus
          }
        }
      }
    }
  `, {
    variables: {
      id: `gid://shopify/Customer/${customerId}`,
    },
  });

  const data = await response.json();

  const orders = data.data.customer.orders.nodes;

  const fulfilledOrders =
    orders.filter(o => o.fulfillmentStatus === "FULFILLED").length;

  return {
    totalOrders: data.data.customer.numberOfOrders,
    fulfilledOrders,
  };
}