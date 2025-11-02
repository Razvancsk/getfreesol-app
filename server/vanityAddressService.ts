import { Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import bs58 from "bs58";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

// Wrapped SOL mint address
export const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

// Encryption configuration
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const KEY_FILE_PATH = join(process.cwd(), ".fee_encryption_key");

// Get or auto-generate encryption key
let ENCRYPTION_KEY = process.env.FEE_ACCOUNT_ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  // Try to load from file
  if (existsSync(KEY_FILE_PATH)) {
    try {
      ENCRYPTION_KEY = readFileSync(KEY_FILE_PATH, "utf-8").trim();
      console.log("🔐 Loaded encryption key from .fee_encryption_key file");
    } catch (error) {
      console.error("Failed to read encryption key file:", error);
    }
  }
  
  // If still no key, auto-generate one
  if (!ENCRYPTION_KEY) {
    ENCRYPTION_KEY = randomBytes(32).toString("hex");
    try {
      writeFileSync(KEY_FILE_PATH, ENCRYPTION_KEY, { mode: 0o600 });
      console.log("🔑 Auto-generated encryption key and saved to .fee_encryption_key");
      console.log("⚠️  IMPORTANT: Keep this file secure and backed up!");
    } catch (error) {
      console.error("Failed to save encryption key:", error);
    }
  }
}

// Validate key length
if (ENCRYPTION_KEY.length !== 64 || !/^[0-9a-fA-F]+$/.test(ENCRYPTION_KEY)) {
  throw new Error("CRITICAL: Encryption key must be exactly 64 hexadecimal characters (32 bytes)");
}

/**
 * Checks if encryption key is configured
 */
function requireEncryptionKey(): string {
  if (!ENCRYPTION_KEY) {
    throw new Error("Failed to initialize encryption key");
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
 * Generates a random Solana keypair instantly with WSOL ATA
 */
export function generateRandomKeypair(): {
  publicKey: string;
  encryptedPrivateKey: string;
  keypair: Keypair;
  wsolAta: string;
} {
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toBase58();
  const encryptedPrivateKey = encryptPrivateKey(keypair.secretKey);
  
  // Calculate the WSOL ATA address for this keypair
  const wsolAta = getAssociatedTokenAddressSync(
    WSOL_MINT,
    keypair.publicKey,
    true // Allow owner off curve
  );
  
  return {
    publicKey,
    encryptedPrivateKey,
    keypair,
    wsolAta: wsolAta.toBase58()
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
  maxAttempts: number = 500000, // Reduced max attempts
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
  const yieldInterval = 5000; // Yield to event loop every 5k attempts (optimized)
  const startTime = Date.now();
  const maxTimeMs = 30000; // Maximum 30 seconds
  
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
    
    // Check timeout every 10k attempts
    if (attempts % 10000 === 0) {
      const elapsed = Date.now() - startTime;
      if (elapsed > maxTimeMs) {
        console.log(`⏱️ Vanity generation timeout after ${elapsed}ms and ${attempts} attempts`);
        return null; // Timeout - suggest trying different prefix
      }
    }
    
    // Progress callback
    if (onProgress && attempts % progressInterval === 0) {
      onProgress(attempts);
    }
    
    // Yield to event loop periodically to prevent blocking (optimized to every 5k)
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
