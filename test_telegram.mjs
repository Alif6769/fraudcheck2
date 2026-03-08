import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

// Verify env is loaded
console.log('TELEGRAM_BOT:', process.env.TELEGRAM_BOT);

import { fetchTelegramNames } from './app/services/telegram.service.js';

async function test() {
  try {
    const phone = '01404139939'; // replace with a real number
    console.log(`Testing lookup for ${phone}...`);
    const result = await fetchTelegramNames(phone);
    console.log('✅ Result:', result);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

test();