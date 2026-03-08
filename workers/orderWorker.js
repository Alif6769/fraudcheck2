// workers/orderWorker.js
import { Worker } from "bullmq";
import IORedis from "ioredis";
import prisma from "../app/db.server.js";
import { fetchFraudReport } from "../app/services/fraudspy.service.js";
import { fetchSteadfastReport } from "../app/services/steadfast.service.js";
import { fetchTelegramNames } from "../app/services/telegram.service.js";
import { ORDER_QUEUE_NAME } from "../app/queues/orderQueue.server.js";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const worker = new Worker(
  ORDER_QUEUE_NAME,
  async (job) => {
    const {
      orderName,
      orderId,
      shippingPhone,
      source,
      fraudspyEnabled,
      steadfastEnabled,
      telegramEnabled,
      allSources,
    } = job.data;

    console.log(`👷 Processing job for order ${orderName}`);
    console.log(`Job data:`, job.data);
    const updateData = { source };

    // Determine if reports should be attempted
    const shouldRunReports = (allSources || source === 'web') && shippingPhone;

    if (shouldRunReports) {
      const tasks = [];

      if (fraudspyEnabled) {
        tasks.push(
          fetchFraudReport(shippingPhone)
            .then(result => ({ type: 'fraud', result }))
            .catch(error => ({ type: 'fraud', error: error.message }))
        );
      }
      if (steadfastEnabled) {
        tasks.push(
          fetchSteadfastReport(shippingPhone)
            .then(result => ({ type: 'steadfast', result }))
            .catch(error => ({ type: 'steadfast', error: error.message }))
        );
      }
    //   if (telegramEnabled) {
    //     tasks.push(
    //       fetchTelegramNames(shippingPhone)
    //         .then(result => ({ type: 'telegram', result }))
    //         .catch(error => ({ type: 'telegram', error: error.message }))
    //     );
    //   }

      const results = await Promise.allSettled(tasks);

      for (const res of results) {
        if (res.status === 'fulfilled') {
          const { type, result } = res.value;
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
        } else {
          console.error(`❌ A service failed:`, res.reason?.message);
        }
      }
    } else {
      console.log(`⏭️ Skipping reports for ${orderName}`);
    }

    console.log(`Final updateData for ${orderName}:`, updateData);

    // Always update the order (at least the source)
    await prisma.order.update({
      where: { orderName },
      data: updateData,
    });

    console.log(`✅ Job for ${orderName} completed`);
  },
  { connection }
);

console.log("🚀 Worker started, waiting for jobs...");