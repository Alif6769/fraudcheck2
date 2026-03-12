// app/services/inventory.server.js
import prisma from "../db.server";

/**
 * Compute the effective [from, to] to process based on existing processed range.
 *
 * @param {Date} requestedFrom
 * @param {Date} requestedTo
 * @param {{ fromDateTime: Date, toDateTime: Date } | null} existingRange
 * @returns {{
 *   effectiveFrom: Date | null,
 *   effectiveTo: Date | null,
 *   newFromForRange: Date | null,
 *   newToForRange: Date | null
 * }}
 *
 * - If no existingRange: return requestedFrom/requestedTo and indicate to set both in DB.
 * - If requestedFrom < existing.from: process [requestedFrom, existing.from] and update DB.from to requestedFrom.
 * - If requestedTo > existing.to: process [existing.to, requestedTo] and update DB.to to requestedTo.
 * - If fully inside existing range: nothing to process => effectiveFrom/effectiveTo = null.
 */
function computeEffectiveRange(requestedFrom, requestedTo, existingRange) {
  if (!existingRange) {
    return {
      effectiveFrom: requestedFrom,
      effectiveTo: requestedTo,
      newFromForRange: requestedFrom,
      newToForRange: requestedTo,
    };
  }

  const dbFrom = existingRange.fromDateTime;
  const dbTo = existingRange.toDateTime;

  // If the requested window is fully inside the already-processed window → skip
  if (requestedFrom >= dbFrom && requestedTo <= dbTo) {
    return {
      effectiveFrom: null,
      effectiveTo: null,
      newFromForRange: null,
      newToForRange: null,
    };
  }

  // Case 1: extend earlier (requestedFrom before dbFrom)
  if (requestedFrom < dbFrom) {
    // Process [requestedFrom, dbFrom)
    return {
      effectiveFrom: requestedFrom,
      effectiveTo: dbFrom,
      // DB.from becomes requestedFrom, DB.to stays same
      newFromForRange: requestedFrom,
      newToForRange: dbTo,
    };
  }

  // Case 2: extend later (requestedTo after dbTo)
  if (requestedTo > dbTo) {
    // Process (dbTo, requestedTo]
    return {
      effectiveFrom: dbTo,
      effectiveTo: requestedTo,
      // DB.to becomes requestedTo, DB.from stays same
      newFromForRange: dbFrom,
      newToForRange: requestedTo,
    };
  }

  // All other overlapping weird cases (e.g. partial overlap) -
  // You can refine this if needed; for now treat as nothing extra to do.
  return {
    effectiveFrom: null,
    effectiveTo: null,
    newFromForRange: null,
    newToForRange: null,
  };
}

/**
 * Fetch fulfilled orders from Shopify within a date range and upsert them into the database.
 * For existing orders, only update `fulfilledAt`, `fulfillmentStatus`, and `productIds`.
 * For new orders, create with all available data.
 *
 * @param {object} session - Shopify session object (from authenticate.admin)
 * @param {object} admin - Shopify admin GraphQL client
 * @param {Date} fromDate - start of range (inclusive)
 * @param {Date} toDate - end of range (inclusive)
 * @returns {Promise<number>} number of orders synced
 */
export async function syncFulfilledOrdersForRange(session, admin, fromDate, toDate) {
  console.log(`🔄 Syncing fulfilled orders from Shopify for shop=${session.shop} from ${fromDate.toISOString()} to ${toDate.toISOString()}`);

  let hasNextPage = true;
  let cursor = null;
  let syncedCount = 0;

  const QUERY = `
    query getFulfilledOrders($first: Int!, $after: String, $query: String!) {
      orders(first: $first, after: $after, query: $query) {
        edges {
          cursor
          node {
            id
            name
            createdAt
            updatedAt
            processedAt
            cancelledAt
            displayFulfillmentStatus
            fulfillments(first: 10) {
              edges {
                node {
                  id
                  status
                  createdAt
                  updatedAt
                }
              }
            }
            lineItems(first: 50) {
              edges {
                node {
                  id
                  product { id }
                  variant { id }
                  name
                  title
                  quantity
                }
              }
            }
            customer {
              id
              firstName
              lastName
              defaultPhoneNumber { phoneNumber }
            }
            shippingAddress {
              address1
              city
              country
              phone
            }
            totalPriceSet { shopMoney { amount } }
            shippingLines(first: 10) {
              edges {
                node {
                  originalPriceSet { shopMoney { amount } }
                }
              }
            }
          }
        }
        pageInfo { hasNextPage }
      }
    }
  `;

  // Shopify query syntax: orders with fulfillment status "fulfilled" and updated within range
  const queryString = `fulfillment_status:fulfilled updated_at:>=${fromDate.toISOString()} updated_at:<=${toDate.toISOString()}`;

  while (hasNextPage) {
    const response = await admin.graphql(QUERY, {
      variables: { first: 50, after: cursor, query: queryString },
    });
    const { data } = await response.json();
    const orders = data?.orders?.edges || [];
    const pageInfo = data?.orders?.pageInfo;

    for (const { node } of orders) {
      // Determine fulfillment time: use the latest fulfillment's createdAt if available
      const fulfillments = node.fulfillments?.edges || [];
      let fulfilledAt = null;
      if (fulfillments.length > 0) {
        // Take the most recent fulfillment date
        fulfilledAt = new Date(
          fulfillments
            .map(f => new Date(f.node.createdAt))
            .reduce((a, b) => (a > b ? a : b))
        );
      } else {
        // Fallback to updatedAt
        fulfilledAt = new Date(node.updatedAt);
      }

      const fulfillmentStatus = node.displayFulfillmentStatus; // e.g., "FULFILLED"

      // Build productIds array
      const productIds = (node.lineItems?.edges || []).map(item => ({
        productId: item.node.product?.id || null,
        variantId: item.node.variant?.id || null,
        title: item.node.title,
        quantity: item.node.quantity,
      }));

      // Build order data object (only used for creation)
      const orderData = {
        orderId: node.id,
        orderName: node.name,
        orderTime: new Date(node.createdAt),
        updatedAt: new Date(node.updatedAt),
        cancelledAt: node.cancelledAt ? new Date(node.cancelledAt) : null,
        fulfilledAt,
        fulfillmentStatus,
        customerId: node.customer?.id || null,
        firstName: node.customer?.firstName || null,
        lastName: node.customer?.lastName || null,
        contactPhone: node.customer?.defaultPhoneNumber?.phoneNumber || null,
        shippingPhone: node.shippingAddress?.phone || null,
        shippingAddress: node.shippingAddress ? JSON.stringify(node.shippingAddress) : null,
        totalPrice: String(node.totalPriceSet?.shopMoney?.amount ?? "0"),
        shippingFee: String(
          node.shippingLines?.edges?.[0]?.node?.originalPriceSet?.shopMoney?.amount ?? "0"
        ),
        products: JSON.stringify(productIds),   // keep for backward compatibility
        productIds: JSON.stringify(productIds), // new field
        shop: session.shop,
      };

      // Upsert: only update fulfillment fields if order exists
      const existingOrder = await prisma.order.findUnique({
        where: { orderName: orderData.orderName },
      });

      if (existingOrder) {
        await prisma.order.update({
          where: { orderName: orderData.orderName },
          data: {
            fulfilledAt,
            fulfillmentStatus,
            productIds: orderData.productIds,
          },
        });
      } else {
        await prisma.order.create({ data: orderData });
      }
      syncedCount++;
    }

    hasNextPage = pageInfo?.hasNextPage || false;
    cursor = orders.length > 0 ? orders[orders.length - 1].cursor : null;
  }

  console.log(`✅ Synced ${syncedCount} orders for shop=${session.shop}`);
  return syncedCount;
}

/**
 * Process fulfilled orders within a date range for a specific shop.
 *
 * Steps:
 * 1. Determine effective [from, to] range based on previously-processed range.
 * 2. Update orders in that range: set fulfilledAt & fulfillmentStatus.
 * 3. Create product transactions:
 *    - Prefer order.productIds (if present), otherwise fall back to products JSON by title.
 *    - Handle raw products, duplicates, combos as before.
 * 4. Update / create ProcessedOrderRange record for this shop.
 *
 * @param {Date} fromDate - requested start of range (inclusive)
 * @param {Date} toDate - requested end of range (inclusive)
 * @param {string} shop - shop domain or identifier (from session)
 *
 * @returns {Promise<{
 *   processedOrders: number,
 *   transactionsCreated: number,
 *   effectiveFrom: Date | null,
 *   effectiveTo: Date | null
 * }>}
 */
export async function processFulfilledOrdersWithRange(fromDate, toDate, shop) {
  console.log(
    `🔄 Requested processing for shop=${shop} from ${fromDate.toISOString()} to ${toDate.toISOString()}`
  );

  // Wrap everything in a transaction to keep things consistent
  return await prisma.$transaction(async (tx) => {
    // 1) Load existing processed range (if any) for this shop
    const existingRange = await tx.processedOrderRange.findFirst({
      where: { shop },
      orderBy: { id: "desc" }, // latest record
    });

    const {
      effectiveFrom,
      effectiveTo,
      newFromForRange,
      newToForRange,
    } = computeEffectiveRange(fromDate, toDate, existingRange);

    // If null, nothing to process (fully inside the already-processed window)
    if (!effectiveFrom || !effectiveTo) {
      console.log(
        `ℹ️ No new time window to process for shop=${shop} (fully inside existing range).`
      );
      return {
        processedOrders: 0,
        transactionsCreated: 0,
        effectiveFrom: null,
        effectiveTo: null,
      };
    }

    console.log(
      `⏱ Effective processing window for shop=${shop}: ` +
        `${effectiveFrom.toISOString()} → ${effectiveTo.toISOString()}`
    );

    // // 2) Update orders in that time window:
    // //    Set fulfillmentStatus="fulfilled" and fulfilledAt = orderTime
    // //    We filter by orderTime in that window and not already fulfilled.
    // const updated = await tx.order.updateMany({
    //   where: {
    //     shop,
    //     orderTime: {
    //       gte: effectiveFrom,
    //       lte: effectiveTo,
    //     },
    //     OR: [
    //       { fulfillmentStatus: null },
    //       { fulfillmentStatus: { not: "fulfilled" } },
    //     ],
    //   },
    //   data: {
    //     fulfillmentStatus: "fulfilled",
    //     // You could also set this to new Date() if you prefer "actual processing time"
    //     fulfilledAt: prisma.$sql`"orderTime"`,
    //   },
    // });

    // console.log(
    //   `✏️ Marked ${updated.count} orders as fulfilled in the window for shop=${shop}`
    // );

    // 3) Now fetch orders that are fulfilled in that window (for product transactions)
    // Now fetch orders that are marked as fulfilled within the effective range
    const orders = await tx.order.findMany({
        where: {
            shop,
            fulfillmentStatus: "fulfilled",
            fulfilledAt: {
            gte: effectiveFrom,
            lte: effectiveTo,
            },
        },
        orderBy: { orderTime: "asc" },
    });

    console.log(`📦 Found ${orders.length} fulfilled orders in the window`);

    let transactionsCreated = 0;

    for (const order of orders) {
      // Prefer productIds if available; fallback to products JSON
      let lineItems = [];

      if (order.productIds) {
        try {
          const parsed = Array.isArray(order.productIds)
            ? order.productIds
            : JSON.parse(order.productIds);

          if (Array.isArray(parsed)) {
            lineItems = parsed.map((p) => ({
              productId: p.productId,
              quantity: p.quantity,
              title: p.title || null,
            }));
          }
        } catch {
          // If JSON parse fails, fallback to products
          lineItems = [];
        }
      }

      if (!lineItems.length && order.products) {
        // Existing behavior: products JSON is array of { title, quantity }
        const parsedProducts = Array.isArray(order.products)
          ? order.products
          : JSON.parse(order.products);

        if (Array.isArray(parsedProducts)) {
          lineItems = parsedProducts.map((p) => ({
            productId: null,
            quantity: p.quantity,
            title: p.title,
          }));
        }
      }

      if (!Array.isArray(lineItems) || !lineItems.length) continue;

      for (const item of lineItems) {
        const { title, quantity, productId } = item;

        let product = null;

        if (productId) {
          // Direct lookup by productId
          product = await tx.product.findUnique({
            where: { productId: productId },
          });
        }

        if (!product && title) {
          // Fallback: find product by name (case-insensitive)
          product = await tx.product.findFirst({
            where: { productName: { equals: title, mode: "insensitive" } },
          });
        }

        if (!product) {
          console.warn(
            `⚠️ Product not found for item: productId="${productId}", title="${title}" – skipping`
          );
          continue;
        }

        const timestamp = order.fulfilledAt || order.orderTime || new Date();

        // Determine product type and create appropriate transactions
        if (product.rawProductFlag) {
          // Raw product: create a SALE transaction
          await tx.productTransaction.create({
            data: {
              productId: product.productId,
              type: "SALE",
              quantity: quantity,
              timestamp,
            },
          });
          transactionsCreated++;
        } else if (product.isDuplicate && product.rootProductId) {
          // Duplicate: transaction goes to root product
          await tx.productTransaction.create({
            data: {
              productId: product.rootProductId,
              type: "SALE",
              quantity: quantity,
              timestamp,
            },
          });
          transactionsCreated++;
        } else if (product.isCombo && product.comboReference) {
          // Combo: create transaction for the combo itself
          await tx.productTransaction.create({
            data: {
              productId: product.productId,
              type: "SALE",
              quantity: quantity,
              timestamp,
            },
          });
          transactionsCreated++;

          // Parse combo components
          let components = [];
          try {
            components = JSON.parse(product.comboReference);
          } catch {
            components = [];
          }

          for (const comp of components) {
            const rawProduct = await tx.product.findUnique({
              where: { productId: comp.productId },
            });
            if (!rawProduct) {
              console.warn(
                `⚠️ Raw product not found for component: ${comp.productId}`
              );
              continue;
            }

            const rawQuantity = comp.quantity * quantity;
            await tx.productTransaction.create({
              data: {
                productId: rawProduct.productId,
                type: "SALE",
                quantity: rawQuantity,
                timestamp,
              },
            });
            transactionsCreated++;
          }
        } else {
          // Unknown type – log and skip
          console.warn(
            `⚠️ Product "${product.productName}" has no type flags – skipping`
          );
        }
      }
    }

    const processedOrders = orders.length;

    // Compute orderNameFrom / orderNameTo (based on processed orders)
    let orderNameFrom = null;
    let orderNameTo = null;
    if (processedOrders > 0) {
      const sortedByName = [...orders].sort((a, b) =>
        a.orderName.localeCompare(b.orderName)
      );
      orderNameFrom = sortedByName[0].orderName;
      orderNameTo = sortedByName[sortedByName.length - 1].orderName;
    }

    // 4) Update or create ProcessedOrderRange record
    if (!existingRange) {
      // First time for this shop
      await tx.processedOrderRange.create({
        data: {
          shop,
          fromDateTime: newFromForRange,
          toDateTime: newToForRange,
          processedOrdersCount: processedOrders,
          processedOrderNameFrom: orderNameFrom,
          processedOrderNameTo: orderNameTo,
        },
      });
    } else {
      await tx.processedOrderRange.update({
        where: { id: existingRange.id },
        data: {
          fromDateTime: newFromForRange,
          toDateTime: newToForRange,
          // You can choose to add or overwrite count. Here we overwrite to represent total.
          processedOrdersCount:
            existingRange.processedOrdersCount + processedOrders,
          processedOrderNameFrom:
            existingRange.processedOrderNameFrom || orderNameFrom,
          processedOrderNameTo:
            existingRange.processedOrderNameTo || orderNameTo,
        },
      });
    }

    console.log(
      `✅ Created ${transactionsCreated} transactions for ${processedOrders} orders ` +
        `in window ${effectiveFrom.toISOString()} → ${effectiveTo.toISOString()} for shop=${shop}`
    );

    const finalRange = await tx.processedOrderRange.findFirst({
        where: { shop },
        orderBy: { id: "desc" },
    });

    return {
      processedOrders,
      transactionsCreated,
      effectiveFrom,
      effectiveTo,
      range: finalRange,
    };
  });
}