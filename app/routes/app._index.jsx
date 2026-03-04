// import { useEffect } from "react";
// import { useFetcher } from "react-router";
// import { useAppBridge } from "@shopify/app-bridge-react";
// import { boundary } from "@shopify/shopify-app-react-router/server";
// import { authenticate } from "../shopify.server";

// export const loader = async ({ request }) => {
//   await authenticate.admin(request);

//   return null;
// };

// export const action = async ({ request }) => {
//   const { admin } = await authenticate.admin(request);
//   const color = ["Red", "Orange", "Yellow", "Green"][
//     Math.floor(Math.random() * 4)
//   ];
//   const response = await admin.graphql(
//     `#graphql
//       mutation populateProduct($product: ProductCreateInput!) {
//         productCreate(product: $product) {
//           product {
//             id
//             title
//             handle
//             status
//             variants(first: 10) {
//               edges {
//                 node {
//                   id
//                   price
//                   barcode
//                   createdAt
//                 }
//               }
//             }
//             demoInfo: metafield(namespace: "$app", key: "demo_info") {
//               jsonValue
//             }
//           }
//         }
//       }`,
//     {
//       variables: {
//         product: {
//           title: `${color} Snowboard`,
//           metafields: [
//             {
//               namespace: "$app",
//               key: "demo_info",
//               value: "Created by React Router Template",
//             },
//           ],
//         },
//       },
//     },
//   );
//   const responseJson = await response.json();
//   const product = responseJson.data.productCreate.product;
//   const variantId = product.variants.edges[0].node.id;
//   const variantResponse = await admin.graphql(
//     `#graphql
//     mutation shopifyReactRouterTemplateUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
//       productVariantsBulkUpdate(productId: $productId, variants: $variants) {
//         productVariants {
//           id
//           price
//           barcode
//           createdAt
//         }
//       }
//     }`,
//     {
//       variables: {
//         productId: product.id,
//         variants: [{ id: variantId, price: "100.00" }],
//       },
//     },
//   );
//   const variantResponseJson = await variantResponse.json();
//   const metaobjectResponse = await admin.graphql(
//     `#graphql
//     mutation shopifyReactRouterTemplateUpsertMetaobject($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
//       metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
//         metaobject {
//           id
//           handle
//           title: field(key: "title") {
//             jsonValue
//           }
//           description: field(key: "description") {
//             jsonValue
//           }
//         }
//         userErrors {
//           field
//           message
//         }
//       }
//     }`,
//     {
//       variables: {
//         handle: {
//           type: "$app:example",
//           handle: "demo-entry",
//         },
//         metaobject: {
//           fields: [
//             { key: "title", value: "Demo Entry" },
//             {
//               key: "description",
//               value:
//                 "This metaobject was created by the Shopify app template to demonstrate the metaobject API.",
//             },
//           ],
//         },
//       },
//     },
//   );
//   const metaobjectResponseJson = await metaobjectResponse.json();

//   return {
//     product: responseJson.data.productCreate.product,
//     variant: variantResponseJson.data.productVariantsBulkUpdate.productVariants,
//     metaobject: metaobjectResponseJson.data.metaobjectUpsert.metaobject,
//   };
// };

// export default function Index() {
//   const fetcher = useFetcher();
//   const shopify = useAppBridge();
//   const isLoading =
//     ["loading", "submitting"].includes(fetcher.state) &&
//     fetcher.formMethod === "POST";

//   useEffect(() => {
//     if (fetcher.data?.product?.id) {
//       shopify.toast.show("Product created");
//     }
//   }, [fetcher.data?.product?.id, shopify]);
//   const generateProduct = () => fetcher.submit({}, { method: "POST" });

//   return (
//     <s-page heading="Shopify app template">
//       <s-button slot="primary-action" onClick={generateProduct}>
//         Generate a product
//       </s-button>

//       <s-section heading="Congrats on creating a new Shopify app 🎉">
//         <s-paragraph>
//           This embedded app template uses{" "}
//           <s-link
//             href="https://shopify.dev/docs/apps/tools/app-bridge"
//             target="_blank"
//           >
//             App Bridge
//           </s-link>{" "}
//           interface examples like an{" "}
//           <s-link href="/app/additional">additional page in the app nav</s-link>
//           , as well as an{" "}
//           <s-link
//             href="https://shopify.dev/docs/api/admin-graphql"
//             target="_blank"
//           >
//             Admin GraphQL
//           </s-link>{" "}
//           mutation demo, to provide a starting point for app development.
//         </s-paragraph>
//       </s-section>
//       <s-section heading="Get started with products">
//         <s-paragraph>
//           Generate a product with GraphQL and get the JSON output for that
//           product. Learn more about the{" "}
//           <s-link
//             href="https://shopify.dev/docs/api/admin-graphql/latest/mutations/productCreate"
//             target="_blank"
//           >
//             productCreate
//           </s-link>{" "}
//           mutation in our API references. Includes a product{" "}
//           <s-link
//             href="https://shopify.dev/docs/apps/build/custom-data/metafields"
//             target="_blank"
//           >
//             metafield
//           </s-link>{" "}
//           and{" "}
//           <s-link
//             href="https://shopify.dev/docs/apps/build/custom-data/metaobjects"
//             target="_blank"
//           >
//             metaobject
//           </s-link>
//           .
//         </s-paragraph>
//         <s-stack direction="inline" gap="base">
//           <s-button
//             onClick={generateProduct}
//             {...(isLoading ? { loading: true } : {})}
//           >
//             Generate a product
//           </s-button>
//           {fetcher.data?.product && (
//             <s-button
//               onClick={() => {
//                 shopify.intents.invoke?.("edit:shopify/Product", {
//                   value: fetcher.data?.product?.id,
//                 });
//               }}
//               target="_blank"
//               variant="tertiary"
//             >
//               Edit product
//             </s-button>
//           )}
//         </s-stack>
//         {fetcher.data?.product && (
//           <s-section heading="productCreate mutation">
//             <s-stack direction="block" gap="base">
//               <s-box
//                 padding="base"
//                 borderWidth="base"
//                 borderRadius="base"
//                 background="subdued"
//               >
//                 <pre style={{ margin: 0 }}>
//                   <code>{JSON.stringify(fetcher.data.product, null, 2)}</code>
//                 </pre>
//               </s-box>

//               <s-heading>productVariantsBulkUpdate mutation</s-heading>
//               <s-box
//                 padding="base"
//                 borderWidth="base"
//                 borderRadius="base"
//                 background="subdued"
//               >
//                 <pre style={{ margin: 0 }}>
//                   <code>{JSON.stringify(fetcher.data.variant, null, 2)}</code>
//                 </pre>
//               </s-box>

//               <s-heading>metaobjectUpsert mutation</s-heading>
//               <s-box
//                 padding="base"
//                 borderWidth="base"
//                 borderRadius="base"
//                 background="subdued"
//               >
//                 <pre style={{ margin: 0 }}>
//                   <code>
//                     {JSON.stringify(fetcher.data.metaobject, null, 2)}
//                   </code>
//                 </pre>
//               </s-box>
//             </s-stack>
//           </s-section>
//         )}
//       </s-section>

//       <s-section slot="aside" heading="App template specs">
//         <s-paragraph>
//           <s-text>Framework: </s-text>
//           <s-link href="https://reactrouter.com/" target="_blank">
//             React Router
//           </s-link>
//         </s-paragraph>
//         <s-paragraph>
//           <s-text>Interface: </s-text>
//           <s-link
//             href="https://shopify.dev/docs/api/app-home/using-polaris-components"
//             target="_blank"
//           >
//             Polaris web components
//           </s-link>
//         </s-paragraph>
//         <s-paragraph>
//           <s-text>API: </s-text>
//           <s-link
//             href="https://shopify.dev/docs/api/admin-graphql"
//             target="_blank"
//           >
//             GraphQL
//           </s-link>
//         </s-paragraph>
//         <s-paragraph>
//           <s-text>Custom data: </s-text>
//           <s-link
//             href="https://shopify.dev/docs/apps/build/custom-data"
//             target="_blank"
//           >
//             Metafields &amp; metaobjects
//           </s-link>
//         </s-paragraph>
//         <s-paragraph>
//           <s-text>Database: </s-text>
//           <s-link href="https://www.prisma.io/" target="_blank">
//             Prisma
//           </s-link>
//         </s-paragraph>
//       </s-section>

//       <s-section slot="aside" heading="Next steps">
//         <s-unordered-list>
//           <s-list-item>
//             Build an{" "}
//             <s-link
//               href="https://shopify.dev/docs/apps/getting-started/build-app-example"
//               target="_blank"
//             >
//               example app
//             </s-link>
//           </s-list-item>
//           <s-list-item>
//             Explore Shopify&apos;s API with{" "}
//             <s-link
//               href="https://shopify.dev/docs/apps/tools/graphiql-admin-api"
//               target="_blank"
//             >
//               GraphiQL
//             </s-link>
//           </s-list-item>
//         </s-unordered-list>
//       </s-section>
//     </s-page>
//   );
// }

// export const headers = (headersArgs) => {
//   return boundary.headers(headersArgs);
// };


import { json } from "react-router";
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

    return json({ success: true, synced: count });
  } catch (error) {
    console.error("❌ Sync orders failed:", error);
    return json(
      { success: false, error: error.message },
      { status: 500 }
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
                  <th style={thStyle}>Order ID</th>
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
                  <tr key={order.id}>
                    <td style={tdStyle}>
                      {order.orderId || "-"}
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
                      {order.shippingAddress || "-"}
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