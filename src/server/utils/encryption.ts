/**
 * Encryption Utility
 *
 * Provides secure encryption/decryption for sensitive data like banking credentials.
 * Uses AES-256-GCM with a unique IV for each encryption.
 *
 * The master key is derived from:
 * 1. ENCRYPTION_KEY environment variable (if set)
 * 2. Or a generated key stored in the data directory (created on first run)
 */

import * as crypto from 'crypto';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits

const DATA_DIR = join(__dirname, '../../data');
const KEY_FILE = join(DATA_DIR, '.encryption-key');

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Get or create the master encryption key
 */
function getMasterKey(): Buffer {
  // First, check environment variable
  const envKey = process.env['ENCRYPTION_KEY'];
  if (envKey) {
    // Derive a proper key from the env variable
    return crypto.scryptSync(envKey, 'personal-finance-salt', KEY_LENGTH);
  }

  // Check if we have a stored key
  if (existsSync(KEY_FILE)) {
    const storedKey = readFileSync(KEY_FILE, 'utf8').trim();
    return Buffer.from(storedKey, 'hex');
  }

  // Generate a new key
  console.log('[Encryption] Generating new encryption key...');
  const newKey = crypto.randomBytes(KEY_LENGTH);
  writeFileSync(KEY_FILE, newKey.toString('hex'), { mode: 0o600 }); // Read/write only for owner
  console.log('[Encryption] Encryption key saved to', KEY_FILE);

  return newKey;
}

const MASTER_KEY = getMasterKey();

/**
 * Encrypt a string value
 * Returns: base64 encoded string containing IV + AuthTag + CipherText
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, MASTER_KEY, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Combine IV + AuthTag + CipherText
  const combined = Buffer.concat([
    iv,
    authTag,
    Buffer.from(encrypted, 'hex')
  ]);

  return combined.toString('base64');
}

/**
 * Decrypt a base64 encoded encrypted string
 */
export function decrypt(encryptedBase64: string): string {
  const combined = Buffer.from(encryptedBase64, 'base64');

  // Extract IV, AuthTag, and CipherText
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, MASTER_KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext.toString('hex'), 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Encrypt an object (credentials)
 */
export function encryptCredentials(credentials: Record<string, string>): string {
  return encrypt(JSON.stringify(credentials));
}

/**
 * Decrypt credentials object
 */
export function decryptCredentials(encryptedCredentials: string): Record<string, string> {
  const decrypted = decrypt(encryptedCredentials);
  return JSON.parse(decrypted);
}

/**
 * Check if encryption is working
 */
export function testEncryption(): boolean {
  try {
    const testData = 'test-encryption-' + Date.now();
    const encrypted = encrypt(testData);
    const decrypted = decrypt(encrypted);
    return decrypted === testData;
  } catch (error) {
    console.error('[Encryption] Test failed:', error);
    return false;
  }
}

// Test encryption on module load
if (!testEncryption()) {
  console.error('[Encryption] WARNING: Encryption test failed! Credentials will not be stored securely.');
}
