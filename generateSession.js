// generateSession.js
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js"; // ✅ fixed import
import input from "input"; // npm install input

const apiId = 35644061; // Your API ID
const apiHash = "dd92e4d28a16471b7bf8a1ec7cbdea70"; // Your API hash
const stringSession = new StringSession(""); // Empty string for first login

(async () => {
  console.log("Creating Telegram session...");
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });
  
  await client.start({
    phoneNumber: async () => await input.text("Enter your phone number: "),
    password: async () => await input.text("Enter your 2FA password (if any): "),
    phoneCode: async () => await input.text("Enter the code you received: "),
    onError: (err) => console.log(err),
  });
  
  console.log("✅ Successfully connected!");
  
  // This is your session string - save it securely!
  const sessionString = client.session.save();
  console.log("\n📋 YOUR SESSION STRING (save this):\n");
  console.log(sessionString);
  console.log("\n⚠️  Keep this secret - it grants access to your Telegram account!");
  
  await client.disconnect();
})();