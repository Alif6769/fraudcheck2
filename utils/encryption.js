const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM recommended IV length
const TAG_LENGTH = 16;
const KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex'); // ensure key is 32 bytes

if (KEY.length !== 32) {
  throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
}

/**
 * Encrypt a string
 * @param {string} plaintext - Data to encrypt
 * @returns {string} - Encrypted data in format: iv:tag:encrypted (all base64)
 */
function encrypt(plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'binary');
  encrypted += cipher.final('binary');
  const tag = cipher.getAuthTag();
  // Encode all parts as base64 for safe storage
  const ivBase64 = iv.toString('base64');
  const tagBase64 = tag.toString('base64');
  const encryptedBase64 = Buffer.from(encrypted, 'binary').toString('base64');
  return `${ivBase64}:${tagBase64}:${encryptedBase64}`;
}

/**
 * Decrypt a string
 * @param {string} ciphertext - Data in format: iv:tag:encrypted (all base64)
 * @returns {string} - Decrypted plaintext
 */
function decrypt(ciphertext) {
  const [ivBase64, tagBase64, encryptedBase64] = ciphertext.split(':');
  const iv = Buffer.from(ivBase64, 'base64');
  const tag = Buffer.from(tagBase64, 'base64');
  const encrypted = Buffer.from(encryptedBase64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'binary', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = { encrypt, decrypt };