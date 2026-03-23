import prisma from "../db.server";
import { encrypt, decrypt } from "../../utils/encryption.js";

/**
 * Save encrypted credentials for a shop and service type.
 * @param {string} shop - Shopify domain
 * @param {string} type - e.g., "fraudspy", "telegram"
 * @param {object} data - Plain object containing all fields
 */
export async function saveCredentials(shop, type, data) {
  const encrypted = encrypt(JSON.stringify(data));
  await prisma.shopCredential.upsert({
    where: { shop_type: { shop, type } },
    update: { encryptedData: encrypted },
    create: { shop, type, encryptedData: encrypted },
  });
}

/**
 * Retrieve decrypted credentials for a shop and service type.
 * @param {string} shop - Shopify domain
 * @param {string} type - e.g., "fraudspy", "telegram"
 * @returns {object|null} Decrypted data or null if not found
 */
export async function getCredentials(shop, type) {
  const record = await prisma.shopCredential.findUnique({
    where: { shop_type: { shop, type } },
  });
  if (!record) return null;
  return JSON.parse(decrypt(record.encryptedData));
}