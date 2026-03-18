// app/routes/app.courier.pathao.jsx
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {elements} from '@shopify/polaris-app-home';

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
    window.location.reload();
  };
  const {
     Page,
     Section,
     Stack,
     Heading,
     Text,
     Box,
     Button,
     Table,
     TableHeaderRow,
     TableHeader,
     TableBody,
     TableRow,
     TableCell,
   } = elements;

  return (
       <Page heading="Pathao Courier – Unfulfilled Orders">
         <Section>
           <Stack gap="base">
             <Text>Shop: {shopDomain}</Text>

             <Stack direction="inline" gap="small">
               <Button onClick={handleSync}>Sync Orders</Button>
             </Stack>

             <Box background="base" border="base" borderRadius="base" padding="base">
               <Heading>Unfulfilled Orders</Heading>

               <Table variant="auto">
                 <TableHeaderRow>
                   <TableHeader listSlot="primary">Order Name</TableHeader>
                   <TableHeader format="currency">Total Price</TableHeader>
                   <TableHeader listSlot="secondary">Customer Name</TableHeader>
                   <TableHeader>Shipping Phone</TableHeader>
                   <TableHeader>Shipping Address</TableHeader>
                 </TableHeaderRow>
                 <TableBody>
                   {unfulfilledOrders.length === 0 ? (
                     <TableRow>
                       <TableCell>No unfulfilled orders found.</TableCell>
                       <TableCell />
                       <TableCell />
                       <TableCell />
                       <TableCell />
                     </TableRow>
                   ) : (
                     unfulfilledOrders.map((order) => (
                       <TableRow key={order.orderName}>
                         <TableCell>{order.orderName}</TableCell>
                         <TableCell>
                           {parseFloat(order.totalPrice).toFixed(2)}
                         </TableCell>
                         <TableCell>
                           {order.firstName} {order.lastName}
                         </TableCell>
                         <TableCell>
                           {order.shippingPhone || order.contactPhone}
                         </TableCell>
                         <TableCell>
                           {order.shippingAddress || '-'}</TableCell>
                       </TableRow>
                     ))
                   )}
                 </TableBody>
               </Table>
             </Box>
           </Stack>
         </Section>
       </Page>
     );
   }