export async function getCustomerStats(admin, customerId) {
  const response = await admin.graphql(`
    query getCustomer($id: ID!) {
      customer(id: $id) {
        numberOfOrders
      }
    }
  `, {
    variables: {
      id: `gid://shopify/Customer/${customerId}`,
    },
  });

  const data = await response.json();
  return {
    totalOrders: data.data.customer?.numberOfOrders || 0,
    fulfilledOrders: 0, // temporarily set to 0
  };
}