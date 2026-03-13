// workers/orderWorker.js
import { Worker } from "bullmq";
import IORedis from "ioredis";
import prisma from "../app/db.server.js";
import { fetchFraudReport } from "../app/services/fraudspy.service.js";
import { fetchSteadfastReport } from "../app/services/steadfast.service.js";
import { fetchTelegramNames } from '../app/services/telegramMicroservice.service.js';
import { ORDER_QUEUE_NAME } from "../app/queues/orderQueue.server.js";
// import for sheet
import { sheetQueue, SHEET_QUEUE_NAME } from '../app/queues/sheetQueue.server.js';
import { appendOrderToSheet } from '../app/services/sheets.service.js';
import { clearSheet } from '../app/services/sheets.service.js';

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

// for sheet worker update
// for sheet worker update
const sheetWorker = new Worker(
  SHEET_QUEUE_NAME,
  async (job) => {
    const { type, orderName, shop } = job.data;

    if (type === 'clear-sheet') {
      // Clear all data rows (keep header)
      await clearSheet();
      console.log(`✅ Sheet cleared for shop ${shop}.`);
    }
    else if (type === 'export-today') {
      // Dynamic start: yesterday at 18:00 local (+6) = yesterday 12:00 UTC
      const now = new Date();
      const todayUTCStart = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0, 0, 0, 0
      );
      const yesterdayUTCStart = new Date(todayUTCStart - 24 * 60 * 60 * 1000);
      const startDate = new Date(yesterdayUTCStart);
      startDate.setUTCHours(12, 0, 0, 0); // 12:00 UTC = 18:00 +6

      const orders = await prisma.order.findMany({
        where: {
          shop,
          orderTime: { gte: startDate },
        },
        orderBy: { orderTime: 'asc' },
      });
      for (const order of orders) {
        await appendOrderToSheet(order);
      }
      console.log(`✅ Exported ${orders.length} orders (since ${startDate.toISOString()}) to sheet for shop ${shop}.`);
    }
    else if (type === 'export-single') {
      const order = await prisma.order.findFirst({
        where: { orderName, shop },
      });
      if (order) {
        await appendOrderToSheet(order);
      }
    }
  },
  { connection }
);

console.log("🚀 Sheet worker started");

const worker = new Worker(
  ORDER_QUEUE_NAME,
  async (job) => {
    if (job.name === "process-fulfillment") {
      // Handle fulfillment: create product transactions
      const { orderName } = job.data;
      console.log(`📦 Processing fulfillment for order ${orderName}`);
      const order = await prisma.order.findUnique({ where: { orderName } });
      if (!order) {
        console.error(`❌ Order ${orderName} not found`);
        return;
      }
      const transactionsCreated = await processOrderTransactions(order, prisma);
      console.log(`✅ Created ${transactionsCreated} transactions for order ${orderName}`);
      return;
    }
    
    const {
      orderName,
      shippingPhone,
      source,
      fraudspyEnabled,
      steadfastEnabled,
    } = job.data;

    console.log(`👷 Processing job for order ${orderName}`);
    console.log(`Job data:`, job.data);

    // Always update source, we'll add other fields conditionally
    const updateData = { source };

    // If no shipping phone, nothing to do except update source
    if (!shippingPhone) {
      console.log(`⏭️ No shipping phone for ${orderName}, skipping reports.`);
      await prisma.order.update({
        where: { orderName },
        data: updateData,
      });
      console.log(`✅ Job for ${orderName} completed (source only).`);
      return;
    }

    // Fetch current order to check existing reports
    const currentOrder = await prisma.order.findUnique({
      where: { orderName },
      select: { fraudReport: true, steadFastReport: true, realName1: true, realName2: true },
    });

    const tasks = [];

    // Helper to add a task only if report is missing
    const addTaskIfMissing = (serviceName, isEnabled, fetchFn, fieldName) => {
      if (!isEnabled) return;

      let alreadyHas = false;
      if (serviceName === 'telegram') {
        // For telegram, we need both names
        alreadyHas = !!(currentOrder?.realName1 && currentOrder?.realName2);
      } else {
        alreadyHas = !!currentOrder?.[fieldName];
      }

      if (alreadyHas) {
        console.log(`⏭️ ${serviceName} report already exists for ${orderName}, skipping.`);
        return;
      }

      tasks.push(
        fetchFn(shippingPhone)
          .then(result => ({ type: serviceName, result }))
          .catch(error => ({ type: serviceName, error: error.message }))
      );
    };

    // Add tasks if missing
    addTaskIfMissing('fraud', fraudspyEnabled, fetchFraudReport, 'fraudReport');
    addTaskIfMissing('steadfast', steadfastEnabled, fetchSteadfastReport, 'steadFastReport');
    addTaskIfMissing('telegram', true, fetchTelegramNames, null); // fieldName not needed for telegram

    if (tasks.length > 0) {
      console.log(`📡 Running ${tasks.length} report tasks for ${orderName}...`);
      const results = await Promise.allSettled(tasks);

      for (const res of results) {
        if (res.status === 'fulfilled') {
          const { type, result, error } = res.value;
          if (error) {
            console.error(`❌ ${type} failed for ${orderName}:`, error);
          } else {
            if (type === 'fraud') {
              updateData.fraudReport = result;
              console.log(`✅ FraudSpy done for ${orderName}`);
            } else if (type === 'steadfast') {
              updateData.steadFastReport = result;
              console.log(`✅ Steadfast done for ${orderName}`);
            } else if (type === 'telegram') {
              updateData.realName1 = result.name1;
              updateData.realName2 = result.name2;
              console.log(`✅ Telegram done for ${orderName}: ${result.name1} / ${result.name2}`);
            }
          }
        } else {
          console.error(`Unexpected rejection:`, res.reason);
        }
      }
    } else {
      console.log(`⏭️ No reports needed for ${orderName} (all exist or disabled).`);
    }

    // Update the order with whatever we collected
    await prisma.order.update({
      where: { orderName },
      data: updateData,
    });

    console.log(`✅ Job for ${orderName} completed.`);
  },
  { connection }
);

console.log("🚀 Worker started, waiting for jobs...");