import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js"; // adjust if needed

const apiId = Number(process.env.TELEGRAM_API_ID) || 35644061;
const apiHash = process.env.TELEGRAM_API_HASH || "dd92e4d28a16471b7bf8a1ec7cbdea70";
const sessionString = process.env.TELEGRAM_SESSION || "";
const TRUECALLER_BOT = process.env.TELEGRAM_BOT || "";

let client = null;
let connected = false;
let initPromise = null;

/**
 * Ensure Telegram client is connected (singleton)
 */
async function ensureClient() {
  if (connected) return client;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const stringSession = new StringSession(sessionString);
      client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
      });
      await client.connect();
      connected = true;
      console.log("✅ Telegram client connected");
      return client;
    } catch (error) {
      console.error("❌ Failed to connect Telegram client:", error);
      throw error;
    } finally {
      initPromise = null;
    }
  })();
  return initPromise;
}

/**
 * Normalize phone number to format expected by the bot (+880...)
 * Mimics the Python script's normalize_phone()
 */
function normalizePhone(raw) {
  if (!raw) return null;
  const phone = String(raw).trim().replace(/\s+/g, '');
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.length === 10) {
    return "+880" + digits;
  } else if (digits.length === 11) {
    return "+88" + digits;
  } else if (digits.length === 13 && digits.startsWith('880')) {
    return "+" + digits;
  } else if (phone.startsWith('+')) {
    // already has +, ensure digits only (keep as is)
    return phone;
  }
  return null;
}

/**
 * Extract names from the bot's response text using regex.
 */
function extractNames(text) {
  const nameRegex = /\*\*Name:\*\*\s*`([^`]+)`/g;
  const names = [];
  let match;
  while ((match = nameRegex.exec(text)) !== null) {
    names.push(match[1]);
  }
  return {
    name1: names[0] || '',
    name2: names[1] || ''
  };
}

/**
 * Public function: fetch names for a phone number via Telegram.
 * @param {string} phone - raw phone number
 * @returns {Promise<{name1: string, name2: string}>}
 */
export async function fetchTelegramNames(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    throw new Error(`Invalid phone number: ${phone}`);
  }

  await ensureClient();

  const bot = await client.getEntity(TRUECALLER_BOT);
  console.log(`📤 Sending phone ${normalized} to bot ${bot.id}`);
  await client.sendMessage(bot, { message: normalized });

  return new Promise((resolve, reject) => {
    // Set a timeout
    const timeout = setTimeout(() => {
      client.removeEventHandler(handler);
      reject(new Error('Telegram bot response timeout (60s)'));
    }, 60000);

    // Define the handler
    const handler = (msg) => {
      // Only process messages from our target bot
      if (msg.senderId?.toString() !== bot.id.toString()) return;

      // Log full message for debugging
      console.log(`📨 Bot message (edited: ${msg.edited ? 'yes' : 'no'}):`, msg.message);

      // Check if this message contains a name (i.e., not just "searching")
      if (msg.message.includes('**Name:**')) {
        clearTimeout(timeout);
        client.removeEventHandler(handler);
        try {
          const names = extractNames(msg.message);
          resolve(names);
        } catch (e) {
          reject(e);
        }
      } else {
        console.log(`⏳ Bot message does not contain name yet, still waiting...`);
      }
    };

    // Attach the handler
    client.addEventHandler(handler);
  });
}

/**
 * Optional: raw response if you need the full text
 */
export async function fetchTelegramRaw(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error(`Invalid phone: ${phone}`);
  await ensureClient();
  const bot = await client.getEntity(TRUECALLER_BOT);
  await client.sendMessage(bot, { message: normalized });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.removeEventHandler(handler);
      reject(new Error('Timeout'));
    }, 30000);
    const handler = (msg) => {
      if (msg.senderId?.toString() === bot.id.toString()) {
        clearTimeout(timeout);
        client.removeEventHandler(handler);
        resolve(msg.message);
      }
    };
    client.addEventHandler(handler);
  });
}