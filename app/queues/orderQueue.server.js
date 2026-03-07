// app/queues/orderQueue.server.js
import { Queue } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null, // BullMQ recommendation
});

export const ORDER_QUEUE_NAME = "order-processing";

export const orderQueue = new Queue(ORDER_QUEUE_NAME, { connection });