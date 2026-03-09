import { Queue } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

export const SHEET_QUEUE_NAME = "sheet-export";
export const sheetQueue = new Queue(SHEET_QUEUE_NAME, { connection });