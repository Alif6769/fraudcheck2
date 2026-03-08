import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

const apiId = Number(process.env.TELEGRAM_API_ID) || 30429077;
const apiHash = process.env.TELEGRAM_API_HASH || "cef0470acf4ed7232cafd6ba9db1139b";
const sessionString = process.env.TELEGRAM_SESSION || "1BQANOTEuMTA4LjU2LjEzMQG7wLsxp+llR5v4J6qs1g7IA/JDiPMvxFRAbxOslwu1hVWdKM/f3r3lM+lKTUe4W8HP4/n4jidsXnOxiPZBe/qoHCCTu8uIKTEXessH/riof4WywzqwdnNRRKpIMNi9VEheJkSSxARaMQOK0cXaGBZwsTPxkB/GZSc/n2AQcdvLdoAH8gLV4y1Tb0MmBaonPrkNt47Q1xx7nYfwtGwhitboVlgWG0/6icl7ZBVWLmNRbehYwuxM5rEc5OIFMchxgFNruoe3DL/LQA7AyzAy1WLND1Tp1QKw5mFCWH8ZoJxEF1nNI11UTbXApW0Vm04gGuxo2rU5udk3rZeVES//4J4TyA==";
const TRUECALLER_BOT = process.env.TELEGRAM_BOT || "TrueCalleRobot";

let client = null;
let connected = false;
let initPromise = null;
let runPromise = null; // to keep the run loop alive

async function ensureClient() {
  if (connected && client) return client;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const stringSession = new StringSession(sessionString);
      client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
      });

      // Connect once; no client.run() needed
      await client.connect();

      connected = true;
      console.log("✅ Telegram client connected");
      return client;
    } catch (error) {
      console.error("❌ Failed to connect Telegram client:", error);
      // make sure next call can retry
      connected = false;
      client = null;
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