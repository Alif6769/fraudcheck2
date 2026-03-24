import axios from 'axios';
import { getCredentials } from './credentials.service.js'; // adjust the path as needed

/**
 * Send an order summary to Telegram using stored credentials
 * @param {string} shop - The Shopify domain of the shop
 * @param {Object} order - The order object (from your database)
 * @param {string} customText - Optional additional message
 * @returns {Promise<Object>} Telegram API response
 */
export async function sendOrderToTelegram(shop, order, customText = '') {
  // Retrieve stored Telegram credentials for this shop
  const telegramCreds = await getCredentials(shop, 'telegram');
  if (!telegramCreds || !telegramCreds.botToken || !telegramCreds.chatId) {
    console.warn(`Telegram credentials not configured for shop ${shop}`);
    return;
  }

  const { botToken, chatId } = telegramCreds;

  const productsList = Array.isArray(order.products) && order.products.length
    ? order.products.map(p => `• ${p.title} × ${p.quantity}`).join('\n')
    : 'No products listed';

  const message = `
📦 *Order Name:* ${order.orderName}
👤 *Customer:* ${order.firstName} ${order.lastName}
📞 *Phone:* ${order.shippingPhone || order.contactPhone || '-'}
🏠 *Address:* ${order.shippingAddress || '-'}
💰 *Total:* ৳${order.totalPrice}
🚚 *Shipping Fee:* ৳${order.shippingFee || 0}

🛒 *Products:*
${productsList}

${customText ? `📝 *Note:* ${customText}` : ''}
  `.trim();

  const payload = {
    chat_id: chatId,
    text: message,
    parse_mode: 'Markdown',
  };

  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      payload
    );
    console.log(`✅ Telegram message sent for order ${order.orderName}`);
    return response.data;
  } catch (error) {
    console.error(`❌ Failed to send Telegram message for order ${order.orderName}:`, error.response?.data || error.message);
    throw error;
  }
}