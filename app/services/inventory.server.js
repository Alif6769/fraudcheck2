// app/services/inventory.server.js
import prisma from "../db.server";

// ---------- Helper: Decompose order line items to raw product quantities ----------
async function decomposeOrder(order, tx = prisma) {
  const quantities = new Map();
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
    } catch {}
  }
  if (!lineItems.length && order.products) {
    const parsed = Array.isArray(order.products)
      ? order.products
      : JSON.parse(order.products);
    if (Array.isArray(parsed)) {
      lineItems = parsed.map((p) => ({
        productId: null,
        quantity: p.quantity,
        title: p.title,
      }));
    }
  }

  for (const item of lineItems) {
    let product = null;
    if (item.productId) {
      product = await tx.product.findUnique({
        where: { productId: item.productId },
      });
    }
    if (!product && item.title) {
      product = await tx.product.findFirst({
        where: { productName: { equals: item.title, mode: "insensitive" } },
      });
    }
    if (!product) continue;

    if (product.rawProductFlag) {
      quantities.set(product.productId, (quantities.get(product.productId) || 0) + item.quantity);
    } else if (product.isDuplicate && product.rootProductId) {
      // Use root product
      quantities.set(product.rootProductId, (quantities.get(product.rootProductId) || 0) + item.quantity);
    } else if (product.isCombo && product.comboReference) {
      // Add the combo itself
      quantities.set(product.productId, (quantities.get(product.productId) || 0) + item.quantity);
      // Decompose components
      let components = [];
      try {
        components = JSON.parse(product.comboReference);
      } catch {}
      for (const comp of components) {
        const raw = await tx.product.findUnique({
          where: { productId: comp.productId },
        });
        if (raw) {
          quantities.set(raw.productId, (quantities.get(raw.productId) || 0) + comp.quantity * item.quantity);
        }
      }
    }
  }
  return quantities;
}

// ---------- Helper: Convert local date+time+offset to UTC Date ----------
function parseLocalToUTC(dateStr, timeStr, offsetMinutes) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  utcDate.setMinutes(utcDate.getMinutes() + offsetMinutes);
  return utcDate;
}

// ---------- 1. Initialize Daily Inventory Snapshot ----------
export async function initializeDailySnapshot(shop) {
  // Fetch only raw and combo products with defined inventoryCategory
  const products = await prisma.product.findMany({
    where: {
      OR: [{ rawProductFlag: true }, { isCombo: true }],
      inventoryCategory: { not: null },
    },
  });

  // Prepare upsert operations
  const operations = products.map((product) =>
    prisma.dailyInventorySnapshot.upsert({
      where: { productId: product.productId },
      update: {
        // Keep existing counters, but update product fields (in case they changed)
        productName: product.productName,
        price: product.price,
        quantity: product.quantity,
        description: product.description,
        inventoryCategory: product.inventoryCategory,
        productCategory: product.productCategory,
        isCombo: product.isCombo,
        rawProductFlag: product.rawProductFlag,
        isDuplicate: product.isDuplicate,
        rootProductId: product.rootProductId,
        comboReference: product.comboReference,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        // todayDateTime can be set to now (optional)
        todayDateTime: new Date(),
      },
      create: {
        productId: product.productId,
        productName: product.productName,
        price: product.price,
        quantity: product.quantity,
        description: product.description,
        inventoryCategory: product.inventoryCategory,
        productCategory: product.productCategory,
        isCombo: product.isCombo,
        rawProductFlag: product.rawProductFlag,
        isDuplicate: product.isDuplicate,
        rootProductId: product.rootProductId,
        comboReference: product.comboReference,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        todayDateTime: new Date(),
        // counters default to 0
      },
    })
  );

  await prisma.$transaction(operations);
  console.log(`✅ Initialized DailyInventorySnapshot for ${products.length} products (shop: ${shop})`);
}

/**
 * Replaces the UnfulfilledOrder table for a shop with new order data.
 * @param {string} shop - The shop domain.
 * @param {Array} ordersData - Array of order nodes from Shopify GraphQL (each contains id, name, lineItems, etc.)
 */
export async function updateUnfulfilledOrders(shop, ordersData) {
  // Delete all existing UnfulfilledOrder records for this shop
  await prisma.unfulfilledOrder.deleteMany({
    where: { shop },
  });

  // Insert each order into UnfulfilledOrder
  for (const node of ordersData) {
    const productIds = (node.lineItems?.edges || []).map(item => ({
      productId: item.node.product?.id,
      quantity: item.node.quantity,
      title: item.node.title,
    }));

    await prisma.unfulfilledOrder.create({
      data: {
        orderId: node.id,
        orderName: node.name,
        shop,
        orderTime: new Date(node.createdAt),
        updatedAt: node.updatedAt,
        cancelledAt: node.cancelledAt,
        fulfillmentStatus: node.displayFulfillmentStatus,
        customerId: node.customer?.id,
        firstName: node.customer?.firstName,
        lastName: node.customer?.lastName,
        contactPhone: node.customer?.defaultPhoneNumber?.phoneNumber,
        shippingPhone: node.shippingAddress?.phone,
        shippingAddress: node.shippingAddress ? JSON.stringify(node.shippingAddress) : null,
        totalPrice: node.totalPriceSet?.shopMoney?.amount ?? "0",
        shippingFee: node.shippingLines?.edges?.[0]?.node?.originalPriceSet?.shopMoney?.amount ?? "0",
        products: JSON.stringify(node.lineItems?.edges.map(i => ({ title: i.node.title, quantity: i.node.quantity }))),
        productIds: JSON.stringify(productIds),
        source: node.sourceName,
      },
    });
  }
}

/**
 * Sync unfulfilled orders from Shopify:
 * - Resets unfulfilledSales in DailyInventorySnapshot.
 * - Fetches all unfulfilled orders (paginated).
 * - Updates UnfulfilledOrder table via updateUnfulfilledOrders.
 * - Aggregates raw product quantities and updates snapshot.
 */
export async function syncUnfulfilled(shop, session, admin) {
  // 1. Reset unfulfilledSales for this shop in DailyInventorySnapshot
  await prisma.dailyInventorySnapshot.updateMany({
    where: { shop },
    data: { unfulfilledSales: 0 },
  });

  // 2. Fetch all unfulfilled orders from Shopify
  const queryString = 'fulfillment_status:unfulfilled AND NOT cancelled_at:*';
  const GET_UNFULFILLED = `
    query getUnfulfilledOrders($first: Int!, $after: String, $query: String!) {
      orders(first: $first, after: $after, query: $query) {
        edges {
          cursor
          node {
            id
            name
            createdAt
            updatedAt
            cancelledAt
            displayFulfillmentStatus
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
            lineItems(first: 50) {
              edges {
                node {
                  id
                  product { id }
                  variant { id }
                  title
                  quantity
                }
              }
            }
          }
        }
        pageInfo { hasNextPage }
      }
    }
  `;

  let hasNextPage = true;
  let cursor = null;
  const allOrders = []; // collect all order nodes

  while (hasNextPage) {
    const response = await admin.graphql(GET_UNFULFILLED, {
      variables: { first: 50, after: cursor, query: queryString },
    });
    const { data, errors } = await response.json();
    if (errors) throw new Error('GraphQL error: ' + JSON.stringify(errors));

    const orders = data?.orders?.edges || [];
    allOrders.push(...orders.map(e => e.node));

    hasNextPage = data?.orders?.pageInfo?.hasNextPage || false;
    cursor = orders.length ? orders[orders.length - 1].cursor : null;
  }

  // 3. Update UnfulfilledOrder table using the reusable function
  await updateUnfulfilledOrders(shop, allOrders);

  // 4. Aggregate product totals for snapshot
  const productTotals = new Map();
  for (const node of allOrders) {
    const productIds = (node.lineItems?.edges || []).map(item => ({
      productId: item.node.product?.id,
      quantity: item.node.quantity,
      title: item.node.title,
    }));
    const orderObj = { productIds };
    const quantities = await decomposeOrder(orderObj, prisma);
    for (const [pid, qty] of quantities) {
      productTotals.set(pid, (productTotals.get(pid) || 0) + qty);
    }
  }

  // 5. Update DailyInventorySnapshot with new totals
  for (const [productId, totalQty] of productTotals) {
    // Fetch product details to populate required fields
    const product = await prisma.product.findUnique({
      where: { productId },
    });
    if (!product) {
      console.warn(`⚠️ Product ${productId} not found, skipping unfulfilled update`);
      continue;
    }

    await prisma.dailyInventorySnapshot.upsert({
      where: { productId },
      update: { unfulfilledSales: totalQty },
      create: {
        productId,
        shop,
        unfulfilledSales: totalQty,
        // Copy all product fields
        productName: product.productName,
        price: product.price,
        quantity: product.quantity,
        description: product.description,
        inventoryCategory: product.inventoryCategory,
        productCategory: product.productCategory,
        isCombo: product.isCombo,
        rawProductFlag: product.rawProductFlag,
        isDuplicate: product.isDuplicate,
        rootProductId: product.rootProductId,
        comboReference: product.comboReference,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        todayDateTime: new Date(),
        // other counters default to 0
      },
    });
  }

  console.log(`✅ Synced unfulfilled orders for shop ${shop}, stored ${productTotals.size} product totals`);
}

// ---------- 3. Sync Fulfilled Orders (yesterday) using transactions ----------
export async function syncFulfilled(shop, tzOffset) {
  // Compute UTC range for yesterday's local date
  const serverNow = new Date();
  const clientLocalTimestamp = serverNow.getTime() - tzOffset * 60000;
  const clientNow = new Date(clientLocalTimestamp);
  const year = clientNow.getUTCFullYear();
  const month = clientNow.getUTCMonth();
  const day = clientNow.getUTCDate();

  const yesterdayLocal = new Date(year, month, day - 1);
  const yesterdayYear = yesterdayLocal.getFullYear();
  const yesterdayMonth = yesterdayLocal.getMonth() + 1;
  const yesterdayDay = yesterdayLocal.getDate();

  const yesterdayDateStr = `${yesterdayYear}-${String(yesterdayMonth).padStart(2, '0')}-${String(yesterdayDay).padStart(2, '0')}`;
  const startUTC = parseLocalToUTC(yesterdayDateStr, "00:00", tzOffset);
  const endUTC   = parseLocalToUTC(yesterdayDateStr, "23:59", tzOffset);

  // Fetch transactions in that UTC range
  const transactions = await prisma.productTransaction.findMany({
    where: {
      timestamp: {
        gte: startUTC,
        lte: endUTC,
      },
    },
  });

  // Aggregate per product per type
  const sales = new Map();   // productId -> quantity (SALE)
  const manual = new Map();  // productId -> quantity (MANUAL_SALE)
  const returns = new Map(); // productId -> quantity (RETURN)
  const damage = new Map();  // productId -> quantity (DAMAGE)

  for (const txn of transactions) {
    switch (txn.type) {
      case 'SALE':
        sales.set(txn.productId, (sales.get(txn.productId) || 0) + txn.quantity);
        break;
      case 'MANUAL_SALE':
        manual.set(txn.productId, (manual.get(txn.productId) || 0) + txn.quantity);
        break;
      case 'RETURN':
        returns.set(txn.productId, (returns.get(txn.productId) || 0) + txn.quantity);
        break;
      case 'DAMAGE':
        damage.set(txn.productId, (damage.get(txn.productId) || 0) + txn.quantity);
        break;
    }
  }

  // Update snapshot for each product that appears
  const allProductIds = new Set([...sales.keys(), ...manual.keys(), ...returns.keys(), ...damage.keys()]);
  for (const productId of allProductIds) {
    // Fetch product details in case we need to create a new record
    const product = await prisma.product.findUnique({
      where: { productId },
    });
    if (!product) {
      console.warn(`⚠️ Product ${productId} not found, skipping fulfilled update`);
      continue;
    }

    await prisma.dailyInventorySnapshot.upsert({
      where: { productId },
      update: {
        fulfilledSales: sales.get(productId) || 0,
        fulfilledManual: manual.get(productId) || 0,
        fulfilledReturn: returns.get(productId) || 0,
        fulfilledDamage: damage.get(productId) || 0,
      },
      create: {
        productId,
        shop,
        fulfilledSales: sales.get(productId) || 0,
        fulfilledManual: manual.get(productId) || 0,
        fulfilledReturn: returns.get(productId) || 0,
        fulfilledDamage: damage.get(productId) || 0,
        // Copy all required product fields
        productName: product.productName,
        price: product.price,
        quantity: product.quantity,
        description: product.description,
        inventoryCategory: product.inventoryCategory,
        productCategory: product.productCategory,
        isCombo: product.isCombo,
        rawProductFlag: product.rawProductFlag,
        isDuplicate: product.isDuplicate,
        rootProductId: product.rootProductId,
        comboReference: product.comboReference,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        todayDateTime: new Date(),
        // other counters default to 0
      },
    });
  }

  console.log(`✅ Synced fulfilled (yesterday) for shop ${shop}, updated ${allProductIds.size} products`);
}

/**
 * Replaces the CancelledOrder table for a shop within a date range with new order data.
 * @param {string} shop
 * @param {Array} ordersData - Array of order nodes from Shopify GraphQL (must include cancelledAt)
 * @param {Date} fromDate
 * @param {Date} toDate
 */
export async function updateCancelledOrders(shop, ordersData, fromDate, toDate) {
  // Delete existing cancelled orders in this range
  await prisma.cancelledOrder.deleteMany({
    where: {
      shop,
      cancelledAt: {
        gte: fromDate,
        lte: toDate,
      },
    },
  });

  // Insert new orders
  for (const node of ordersData) {
    const productIds = (node.lineItems?.edges || []).map(item => ({
      productId: item.node.product?.id,
      quantity: item.node.quantity,
      title: item.node.title,
    }));

    await prisma.cancelledOrder.create({
      data: {
        orderId: node.id,
        orderName: node.name,
        shop,
        orderTime: new Date(node.createdAt),
        updatedAt: node.updatedAt,
        cancelledAt: node.cancelledAt,
        customerId: node.customer?.id,
        firstName: node.customer?.firstName,
        lastName: node.customer?.lastName,
        contactPhone: node.customer?.defaultPhoneNumber?.phoneNumber,
        shippingPhone: node.shippingAddress?.phone,
        shippingAddress: node.shippingAddress ? JSON.stringify(node.shippingAddress) : null,
        totalPrice: node.totalPriceSet?.shopMoney?.amount ?? "0",
        shippingFee: node.shippingLines?.edges?.[0]?.node?.originalPriceSet?.shopMoney?.amount ?? "0",
        products: JSON.stringify(node.lineItems?.edges.map(i => ({ title: i.node.title, quantity: i.node.quantity }))),
        productIds: JSON.stringify(productIds),
        source: node.sourceName,
      },
    });
  }
}

/**
 * Sync cancelled orders from Shopify within a date range.
 * Fetches orders, updates CancelledOrder table, and refreshes daily snapshot.
 * @param {string} shop
 * @param {object} session - Shopify session (for shop domain)
 * @param {object} admin - Shopify admin GraphQL client
 * @param {Date} fromDate - Start of range (inclusive)
 * @param {Date} toDate - End of range (inclusive)
 */
export async function syncCancelled(shop, session, admin, fromDate, toDate) {
  // Reset cancelledSales for this shop in the snapshot
  await prisma.dailyInventorySnapshot.updateMany({
    where: { shop },
    data: { cancelledSales: 0 },
  });

  // Build Shopify query
  const fromStr = fromDate.toISOString();
  const toStr = toDate.toISOString();
  const queryString = `cancelled_at:>=${fromStr} cancelled_at:<=${toStr}`;

  const GET_CANCELLED = `
    query getCancelledOrders($first: Int!, $after: String, $query: String!) {
      orders(first: $first, after: $after, query: $query) {
        edges {
          cursor
          node {
            id
            name
            createdAt
            updatedAt
            cancelledAt
            displayFulfillmentStatus
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
            lineItems(first: 50) {
              edges {
                node {
                  id
                  product { id }
                  variant { id }
                  title
                  quantity
                }
              }
            }
          }
        }
        pageInfo { hasNextPage }
      }
    }
  `;

  let hasNextPage = true;
  let cursor = null;
  const allOrders = [];

  while (hasNextPage) {
    const response = await admin.graphql(GET_CANCELLED, {
      variables: { first: 50, after: cursor, query: queryString },
    });
    const { data, errors } = await response.json();
    if (errors) throw new Error('GraphQL error: ' + JSON.stringify(errors));

    const orders = data?.orders?.edges || [];
    allOrders.push(...orders.map(e => e.node));

    hasNextPage = data?.orders?.pageInfo?.hasNextPage || false;
    cursor = orders.length ? orders[orders.length - 1].cursor : null;
  }

  // Update CancelledOrder table
  await updateCancelledOrders(shop, allOrders, fromDate, toDate);

  // Aggregate product totals
  const productTotals = new Map();
  for (const node of allOrders) {
    const productIds = (node.lineItems?.edges || []).map(item => ({
      productId: item.node.product?.id,
      quantity: item.node.quantity,
      title: item.node.title,
    }));
    const orderObj = { productIds };
    const quantities = await decomposeOrder(orderObj, prisma);
    for (const [pid, qty] of quantities) {
      productTotals.set(pid, (productTotals.get(pid) || 0) + qty);
    }
  }

  // Update snapshot
  for (const [productId, totalQty] of productTotals) {
    await prisma.dailyInventorySnapshot.upsert({
      where: { productId },
      update: { cancelledSales: totalQty },
      create: {
        productId,
        shop,
        cancelledSales: totalQty,
        ...(await getProductFields(productId)), // populate required product fields
      },
    });
  }

  console.log(`✅ Synced cancelled orders for shop ${shop}, updated ${productTotals.size} products`);
}

// Helper to extract numeric part from order name "#Mehwish3125"
function extractOrderNumber(orderName) {
  const match = orderName.match(/\d+$/); // matches digits at the end
  return match ? parseInt(match[0], 10) : null;
}


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

  // If the requested window is both outside the already-processed window 
  if (requestedFrom <= dbFrom && requestedTo >= dbTo) {
    return {
      effectiveFrom: requestedFrom,
      effectiveTo: requestedTo,
      newFromForRange: requestedFrom,
      newToForRange: requestedTo,
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

  // All other overlapping weird cases – treat as nothing extra to do for now.
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
  console.log(
    `🔄 Syncing fulfilled orders from Shopify for shop=${session.shop} from ${fromDate.toISOString()} to ${toDate.toISOString()}`
  );

  let hasNextPage = true;
  let cursor = null;
  let syncedCount = 0;

  // ✅ FIXED: fulfillments is a simple list, not a connection with edges
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
              id
              status
              createdAt
              updatedAt
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

    const { data, errors } = await response.json();

    if (errors) {
      console.error("❌ Shopify Admin GraphQL errors in getFulfilledOrders:", errors);
      throw new Error("Failed to fetch orders from Shopify Admin API");
    }

    const orders = data?.orders?.edges || [];
    const pageInfo = data?.orders?.pageInfo;

    for (const { node } of orders) {
      // ✅ FIXED: fulfillments is now a flat array, not edges
      const fulfillments = node.fulfillments || [];
      let fulfilledAt = null;

      if (fulfillments.length > 0) {
        // Take the most recent fulfillment date
        fulfilledAt = new Date(
          fulfillments
            .map((f) => new Date(f.createdAt))
            .reduce((a, b) => (a > b ? a : b))
        );
      } else {
        // Fallback to updatedAt
        fulfilledAt = new Date(node.updatedAt);
      }

      const fulfillmentStatus = node.displayFulfillmentStatus; // e.g., "FULFILLED"

      // Build productIds array from lineItems edges
      const productIds = (node.lineItems?.edges || []).map((item) => ({
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
        shippingAddress: node.shippingAddress
          ? JSON.stringify(node.shippingAddress)
          : null,
        totalPrice: String(node.totalPriceSet?.shopMoney?.amount ?? "0"),
        shippingFee: String(
          node.shippingLines?.edges?.[0]?.node?.originalPriceSet?.shopMoney
            ?.amount ?? "0"
        ),
        products: JSON.stringify(productIds), // keep for backward compatibility
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
 * Process a single order's line items and create product transactions.
 * @param {Object} order - The order object from the database (must contain productIds or products, fulfilledAt, etc.)
 * @param {Prisma.TransactionClient} tx - Prisma transaction client
 * @returns {Promise<number>} Number of transactions created
 */
export async function processOrderTransactions(order, tx) {
  let transactionsCreated = 0;

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
      lineItems = [];
    }
  }

  if (!lineItems.length && order.products) {
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

  if (!Array.isArray(lineItems) || !lineItems.length) return 0;

  const timestamp = order.fulfilledAt || order.orderTime || new Date();

  for (const item of lineItems) {
    const { title, quantity, productId } = item;

    let product = null;

    if (productId) {
      product = await tx.product.findUnique({
        where: { productId: productId },
      });
    }

    if (!product && title) {
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

    if (product.rawProductFlag) {
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
      await tx.productTransaction.create({
        data: {
          productId: product.productId,
          type: "SALE",
          quantity: quantity,
          timestamp,
        },
      });
      transactionsCreated++;

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
          console.warn(`⚠️ Raw product not found for component: ${comp.productId}`);
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
      console.warn(`⚠️ Product "${product.productName}" has no type flags – skipping`);
    }
  }

  return transactionsCreated;
}

/**
 * Process fulfilled orders within a date range for a specific shop.
 *
 * Steps:
 * 1. Determine effective [from, to] range based on previously-processed range.
 * 2. Fetch orders with fulfillmentStatus="fulfilled" and fulfilledAt within the effective window.
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
 *   effectiveTo: Date | null,
 *   range: any
 * }>}
 */
export async function processFulfilledOrdersWithRange(fromDate, toDate, shop) {
  console.log(
    `🔄 Requested processing for shop=${shop} from ${fromDate.toISOString()} to ${toDate.toISOString()}`
  );

  // Increase timeout to 2 minutes (adjust as needed)
  return await prisma.$transaction(
    async (tx) => {
      // 1) Load existing processed range
      const existingRange = await tx.processedOrderRange.findFirst({
        where: { shop },
        orderBy: { id: "desc" },
      });

      const { effectiveFrom, effectiveTo, newFromForRange, newToForRange } =
        computeEffectiveRange(fromDate, toDate, existingRange);

      if (!effectiveFrom || !effectiveTo) {
        console.log(`ℹ️ No new time window to process for shop=${shop}`);
        return {
          processedOrders: 0,
          transactionsCreated: 0,
          effectiveFrom: null,
          effectiveTo: null,
          range: existingRange ?? null,
        };
      }

      console.log(
        `⏱ Effective processing window: ${effectiveFrom.toISOString()} → ${effectiveTo.toISOString()}`
      );

      // 2) Fetch orders in that window
      const orders = await tx.order.findMany({
        where: {
          shop,
          fulfillmentStatus: "FULFILLED",
          fulfilledAt: { gte: effectiveFrom, lte: effectiveTo },
        },
        orderBy: { orderTime: "asc" },
      });

      console.log(`📦 Found ${orders.length} fulfilled orders`);

      let transactionsCreated = 0;

      for (const order of orders) {
        // Process each order sequentially to avoid overwhelming the transaction
        const created = await processOrderTransactions(order, tx);
        transactionsCreated += created;
      }

      // 3) Compute order name range
      const processedOrders = orders.length;
      let orderNameFrom = null,
        orderNameTo = null;
      if (processedOrders > 0) {
        const sortedByName = [...orders].sort((a, b) =>
          a.orderName.localeCompare(b.orderName)
        );
        orderNameFrom = sortedByName[0].orderName;
        orderNameTo = sortedByName[sortedByName.length - 1].orderName;
      }

      // 4) Update ProcessedOrderRange
      if (!existingRange) {
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
        // Determine new min and max order names
        let newFromName = existingRange.processedOrderNameFrom;
        let newToName = existingRange.processedOrderNameTo;

        if (orderNameFrom) {
            const currentNum = extractOrderNumber(existingRange.processedOrderNameFrom);
            const newNum = extractOrderNumber(orderNameFrom);
            if (currentNum === null || (newNum !== null && newNum < currentNum)) {
            newFromName = orderNameFrom;
            }
        }

        if (orderNameTo) {
            const currentNum = extractOrderNumber(existingRange.processedOrderNameTo);
            const newNum = extractOrderNumber(orderNameTo);
            if (currentNum === null || (newNum !== null && newNum > currentNum)) {
            newToName = orderNameTo;
            }
        }
      // Update the record
        await tx.processedOrderRange.update({
            where: { id: existingRange.id },
            data: {
            fromDateTime: newFromForRange,
            toDateTime: newToForRange,
            processedOrdersCount: existingRange.processedOrdersCount + processedOrders,
            processedOrderNameFrom: newFromName,
            processedOrderNameTo: newToName,
            },
        });
    }

    console.log(
      `✅ Created ${transactionsCreated} transactions for ${processedOrders} orders in window ${effectiveFrom.toISOString()} → ${effectiveTo.toISOString()} for shop=${shop}`
    );

    const finalRange = await tx.processedOrderRange.findFirst({
        where: { shop },
        orderBy: { id: "desc" },
      });

      console.log(
        `✅ Created ${transactionsCreated} transactions for ${processedOrders} orders`
      );

      return {
        processedOrders,
        transactionsCreated,
        effectiveFrom,
        effectiveTo,
        range: finalRange,
      };
    },
    { timeout: 120000 } // 2 minutes timeout
  );
}