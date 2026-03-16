const axios = require('axios');
const { encrypt, decrypt } = require('../utils/encryption');

const BASE_URL = process.env.PATHAO_BASE_URL; // sandbox or production

/**
 * Refresh Pathao access token using refresh token
 * @param {Object} credentials - Decrypted credentials object containing client_id, client_secret, etc.
 * @param {string} refreshToken - Current refresh token (encrypted)
 * @returns {Object} New token data { access_token, refresh_token, expires_in }
 */
async function refreshPathaoToken(credentials, refreshToken) {
  const decryptedRefreshToken = decrypt(refreshToken);
  const response = await axios.post(`${BASE_URL}/aladdin/api/v1/issue-token`, {
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
    grant_type: 'refresh_token',
    refresh_token: decryptedRefreshToken,
  });
  return response.data; // { access_token, refresh_token, expires_in }
}

/**
 * Refresh all expiring tokens (called by cron job)
 */
async function refreshAllExpiringTokens(prisma) {
  // Find credentials that need refresh (expires within next 1 hour)
  const expiringSoon = await prisma.shopCourierCredentials.findMany({
    where: {
      courierService: {
        name: 'pathao', // Only OAuth couriers
      },
      tokenExpiresAt: {
        lte: new Date(Date.now() + 60 * 60 * 1000), // within next hour
      },
      refreshToken: { not: null },
    },
    include: {
      courierService: true,
    },
  });

  for (const cred of expiringSoon) {
    try {
      // Decrypt the credentials JSON
      const decryptedCreds = JSON.parse(decrypt(cred.credentials));
      const newTokenData = await refreshPathaoToken(decryptedCreds, cred.refreshToken);

      // Encrypt new tokens
      const newAccessToken = encrypt(newTokenData.access_token);
      const newRefreshToken = encrypt(newTokenData.refresh_token);
      const expiresAt = new Date(Date.now() + newTokenData.expires_in * 1000);

      // Update the record
      await prisma.shopCourierCredentials.update({
        where: { id: cred.id },
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          tokenExpiresAt: expiresAt,
        },
      });

      console.log(`Refreshed token for shop_courier_credentials id ${cred.id}`);
    } catch (error) {
      console.error(`Failed to refresh token for id ${cred.id}:`, error.message);
      // Optionally mark as inactive or notify the merchant
    }
  }
}

module.exports = { refreshAllExpiringTokens };