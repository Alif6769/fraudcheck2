// app/routes/app.courier.pathao.jsx
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { Page, Layout, Card, Text, Button, IndexTable } from "@shopify/polaris";


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
       window.location.reload();
     };

     const resourceName = {
       singular: "order",
       plural: "orders",
     };

     const rowMarkup = unfulfilledOrders.length === 0
       ? null
       : unfulfilledOrders.map((order, index) => (
           <IndexTable.Row
             id={order.orderName}
             key={order.orderName}
             position={index}
           >
             <IndexTable.Cell>{order.orderName}</IndexTable.Cell>
             <IndexTable.Cell>
               ${parseFloat(order.totalPrice).toFixed(2)}
             </IndexTable.Cell>
             <IndexTable.Cell>
               {order.firstName} {order.lastName}
             </IndexTable.Cell>
             <IndexTable.Cell>
               {order.shippingPhone || order.contactPhone}
             </IndexTable.Cell>
             <IndexTable.Cell>
               {order.shippingAddress || "-"}
             </IndexTable.Cell>
           </IndexTable.Row>
         ));

     return (
       <Page title="Pathao Courier – Unfulfilled Orders">
         <Layout>
           <Layout.Section>
             <Card>
               <Card.Header
                 title="Pathao Courier – Unfulfilled Orders"
                 actions={[
                   {
                     content: "Sync Orders",
                     onAction: handleSync,
                   },
                 ]}
               />
               <Card.Section>
                 <Text as="p" variant="bodyMd">
                   Shop: {shopDomain}
                 </Text>
               </Card.Section>

               <Card.Section>
                 <IndexTable
                   resourceName={resourceName}
                   itemCount={unfulfilledOrders.length}
                   headings={[
                     { title: "Order Name" },
                     { title: "Total Price" },
                     { title: "Customer Name" },
                     { title: "Shipping Phone" },
                     { title: "Shipping Address" },
                   ]}
                   selectable={false}
                 >
                   {unfulfilledOrders.length === 0 ? (
                     <IndexTable.Row id="empty" position={0}>
                       <IndexTable.Cell colSpan={5}>
                         <Text as="p" alignment="center">
                           No unfulfilled orders found.
                         </Text>
                       </IndexTable.Cell>
                     </IndexTable.Row>
                   ) : (
                     rowMarkup
                   )}
                 </IndexTable>
               </Card.Section>
             </Card>
           </Layout.Section>
         </Layout>
       </Page>
     );
   }