import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Encryption configuration
const ENCRYPTION_ALGORITHM = "aes-256-gcm";

// Get encryption key (optional during development, required for production)
const ENCRYPTION_KEY = process.env.FEE_ACCOUNT_ENCRYPTION_KEY;

if (ENCRYPTION_KEY) {
  // Validate key length if provided (should be 64 hex characters = 32 bytes)
  if (ENCRYPTION_KEY.length !== 64 || !/^[0-9a-fA-F]+$/.test(ENCRYPTION_KEY)) {
    throw new Error("CRITICAL: FEE_ACCOUNT_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes)");
  }
}

/**
 * Checks if encryption key is configured
 */
function requireEncryptionKey(): string {
  if (!ENCRYPTION_KEY) {
    throw new Error("FEE_ACCOUNT_ENCRYPTION_KEY environment variable must be set to create fee accounts");
  }
  if (ENCRYPTION_KEY.length !== 64 || !/^[0-9a-fA-F]+$/.test(ENCRYPTION_KEY)) {
    throw new Error("FEE_ACCOUNT_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes)");
  }
  return ENCRYPTION_KEY;
}

/**
 * Encrypts a private key for secure database storage
 */
export function encryptPrivateKey(privateKeyBytes: Uint8Array): string {
  const encryptionKey = requireEncryptionKey(); // Validate key is set
  const iv = randomBytes(16);
  const key = Buffer.from(encryptionKey, "hex");
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(privateKeyBytes)),
    cipher.final()
  ]);
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:encrypted (all base64)
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

/**
 * Decrypts a private key from database storage
 */
export function decryptPrivateKey(encryptedData: string): Uint8Array {
  const encryptionKey = requireEncryptionKey(); // Validate key is set
  const [ivB64, authTagB64, encryptedB64] = encryptedData.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const encrypted = Buffer.from(encryptedB64, "base64");
  const key = Buffer.from(encryptionKey, "hex");
  
  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);
  
  return new Uint8Array(decrypted);
}

/**
 * Generates a random Solana keypair instantly
 */
export function generateRandomKeypair(): {
  publicKey: string;
  encryptedPrivateKey: string;
  keypair: Keypair;
} {
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toBase58();
  const encryptedPrivateKey = encryptPrivateKey(keypair.secretKey);
  
  return {
    publicKey,
    encryptedPrivateKey,
    keypair
  };
}

/**
 * Checks if a public key starts with the desired prefix (case-sensitive)
 */
function matchesPrefix(publicKey: string, prefix: string): boolean {
  // Solana addresses are case-sensitive base58, so do exact prefix match
  return publicKey.startsWith(prefix);
}

/**
 * Generates a vanity Solana address with the specified prefix
 * WARNING: This can be CPU-intensive for longer prefixes and will block the event loop
 * Consider using worker threads or async job queue for production
 */
export async function generateVanityKeypair(
  prefix: string,
  maxAttempts: number = 1000000,
  onProgress?: (attempts: number) => void
): Promise<{
  publicKey: string;
  encryptedPrivateKey: string;
  attempts: number;
  keypair: Keypair;
} | null> {
  // Validate prefix (Solana base58 alphabet - case sensitive!)
  const validChars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  
  for (const char of prefix) {
    if (!validChars.includes(char)) {
      throw new Error(`Invalid character in prefix: ${char}. Must be valid base58.`);
    }
  }
  
  let attempts = 0;
  const progressInterval = 10000; // Report progress every 10k attempts
  const yieldInterval = 1000; // Yield to event loop every 1k attempts
  
  while (attempts < maxAttempts) {
    attempts++;
    
    const keypair = Keypair.generate();
    const publicKey = keypair.publicKey.toBase58();
    
    if (matchesPrefix(publicKey, prefix)) {
      const encryptedPrivateKey = encryptPrivateKey(keypair.secretKey);
      
      return {
        publicKey,
        encryptedPrivateKey,
        attempts,
        keypair
      };
    }
    
    // Progress callback
    if (onProgress && attempts % progressInterval === 0) {
      onProgress(attempts);
    }
    
    // Yield to event loop periodically to prevent blocking
    if (attempts % yieldInterval === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }
  
  return null; // No match found within max attempts
}

/**
 * Estimates difficulty (average attempts needed) for a given prefix length
 */
export function estimateVanityDifficulty(prefixLength: number): number {
  // Solana uses base58 encoding (58 possible characters)
  // For a prefix of length N, average attempts = 58^N
  return Math.pow(58, prefixLength);
}

/**
 * Reconstructs a Keypair from an encrypted private key
 */
export function keypairFromEncrypted(encryptedPrivateKey: string): Keypair {
  const secretKey = decryptPrivateKey(encryptedPrivateKey);
  return Keypair.fromSecretKey(secretKey);
}
