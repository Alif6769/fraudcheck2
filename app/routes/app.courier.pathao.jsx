import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function loader({ request }) {
  console.log("🔍 prisma in loader:", prisma);
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // Try a simple query to see if Prisma works
  const orderCount = await prisma.order.count();
  console.log("Order count:", orderCount);

  return { shopDomain, orderCount };
}

export default function PathaoDashboard() {
  const data = useLoaderData();
  return (
    <div>
      <h1>Pathao Dashboard (minimal test)</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}