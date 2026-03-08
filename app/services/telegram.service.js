import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

const apiId = Number(process.env.TELEGRAM_API_ID) || 35644061;
const apiHash = process.env.TELEGRAM_API_HASH || "dd92e4d28a16471b7bf8a1ec7cbdea70";
const sessionString = process.env.TELEGRAM_SESSION || "1BQANOTEuMTA4LjU2LjEzMQG7KRCm6zpyrZjOsOMTQM4Ga8ErTryGUYrm+Ga/Muxs/EDtGY646uUZjtAhwaZET1mtFDGGCNpvpM7TlpeaZf4emkOxcX8zOTOIQ19csJe2BMRc1ktlcVRW1uV9DCANP6yKCO60FWl8esMGzHa9wstcf18sM8MJKwPL31Yxxr+YBMBy+BkqiOtYOmmOfhr3pTDK0bTgLGCmghpmP0vyACMAKYpSV2XoBBnB3FLaP37juWsmUUHTFU2ct4SZThKV1XAzJJZzEa+W1lGJafmHIriCrTovoxBan5ZqbG5uuG3UudrplVb6fw+JRAxuyqkl4lHUOdhPFMLzCl+fdS83ga4o+w=="
const TRUECALLER_BOT = process.env.TELEGRAM_BOT || "TrueCalleRobot";

let client = null;
let connected = false;
let initPromise = null;
let runPromise = null; // to keep the run loop alive

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

      // Start the update loop – this is CRITICAL to receive messages
      if (typeof client.run === 'function') {
        client.run().catch(err => console.error('❌ run loop error:', err));
      } else if (typeof client.start === 'function') {
        client.start().catch(err => console.error('❌ start error:', err));
      } else {
        console.warn('⚠️ No update loop method found. Please update GramJS.');
      }

      connected = true;
      console.log("✅ Telegram client connected and update loop started");
      return client;
    } catch (error) {
      console.error("❌ Failed to connect:", error);
      throw error;
    } finally {
      initPromise = null;
    }
  })();
  return initPromise;
}


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
    return phone;
  }
  return null;
}

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

export async function fetchTelegramNames(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error(`Invalid phone number: ${phone}`);

  await ensureClient();
  const bot = await client.getEntity(TRUECALLER_BOT);

  const responsePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.removeEventHandler(handler);
      reject(new Error('Telegram bot response timeout (60s)'));
    }, 60000);

    const handler = (msg) => {
      if (msg.senderId?.toString() !== bot.id.toString()) return;
      console.log(`📨 Bot message: ${msg.message}`);
      if (msg.message.includes('**Name:**')) {
        clearTimeout(timeout);
        client.removeEventHandler(handler);
        try {
          resolve(extractNames(msg.message));
        } catch (e) {
          reject(e);
        }
      } else {
        console.log(`⏳ Bot message does not contain name yet, waiting...`);
      }
    };
    client.addEventHandler(handler);
  });

  console.log(`📤 Sending phone ${normalized} to bot ${bot.id}`);
  await client.sendMessage(bot, { message: normalized });

  return responsePromise;
}