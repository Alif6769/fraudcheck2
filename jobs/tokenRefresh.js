const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const { refreshAllExpiringTokens } = require('../services/pathao');

const prisma = new PrismaClient();

// Run every hour at minute 0
cron.schedule('0 * * * *', async () => {
  console.log('Running token refresh job...');
  try {
    await refreshAllExpiringTokens(prisma);
  } catch (error) {
    console.error('Token refresh job failed:', error);
  }
});

// For testing, you can also export a function to run manually
module.exports = { startTokenRefreshJob: () => cron.start() };