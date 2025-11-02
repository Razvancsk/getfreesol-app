import { PublicKey, Keypair } from "@solana/web3.js";
import { Buffer } from "buffer";
import crypto from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

// Simulated program ID for our referral system
// In a real deployment, this would be an actual Solana program
export const REFERRAL_PROGRAM_ID = new PublicKey("REFERGySQB9N7J4kiQDT2ix5fMh44r2z7WPugQDz9Sq");

/**
 * Derives a PDA for the project account
 * Seeds: ["project", base_key]
 */
export function deriveProjectPDA(baseKey: PublicKey): [PublicKey, number] {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("project"), baseKey.toBuffer()],
    REFERRAL_PROGRAM_ID
  );
  return [pda, bump];
}

/**
 * Derives a PDA for a referral account
 * Seeds: [project_pda, partner_wallet]
 */
export function deriveReferralPDA(
  projectPDA: PublicKey,
  partnerWallet: PublicKey
): [PublicKey, number] {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [projectPDA.toBuffer(), partnerWallet.toBuffer()],
    REFERRAL_PROGRAM_ID
  );
  return [pda, bump];
}

/**
 * Gets the token account address for a specific mint and owner
 * This is a standard ATA (Associated Token Account)
 */
export async function getTokenAccountAddress(
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
  return getAssociatedTokenAddressSync(mint, owner, true);
}

// Common token mints on Solana
export const COMMON_MINTS = {
  SOL: new PublicKey("So11111111111111111111111111111111111111112"), // Wrapped SOL
  USDC: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
  USDT: new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"),
  BONK: new PublicKey("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"),
  JUP: new PublicKey("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"),
} as const;

export const COMMON_TOKENS = [
  { mint: COMMON_MINTS.SOL.toBase58(), symbol: "SOL", name: "Wrapped SOL", decimals: 9 },
  { mint: COMMON_MINTS.USDC.toBase58(), symbol: "USDC", name: "USD Coin", decimals: 6 },
  { mint: COMMON_MINTS.USDT.toBase58(), symbol: "USDT", name: "Tether USD", decimals: 6 },
  { mint: COMMON_MINTS.BONK.toBase58(), symbol: "BONK", name: "Bonk", decimals: 5 },
  { mint: COMMON_MINTS.JUP.toBase58(), symbol: "JUP", name: "Jupiter", decimals: 6 },
];

// Encryption key management (shared with vanity address service)
const KEY_FILE_PATH = join(process.cwd(), ".fee_encryption_key");

let ENCRYPTION_KEY_CACHE: string | null = null;

/**
 * Get encryption key from environment or file
 */
function getEncryptionKey(): Buffer {
  // Return cached key if available
  if (ENCRYPTION_KEY_CACHE) {
    return Buffer.from(ENCRYPTION_KEY_CACHE, 'hex');
  }

  // Try environment variable first
  let key = process.env.FEE_ACCOUNT_ENCRYPTION_KEY;

  // Try loading from file if not in env
  if (!key && existsSync(KEY_FILE_PATH)) {
    try {
      key = readFileSync(KEY_FILE_PATH, "utf-8").trim();
    } catch (error) {
      console.error("Failed to read encryption key file:", error);
    }
  }

  // Auto-generate if still not found
  if (!key) {
    key = crypto.randomBytes(32).toString("hex");
    try {
      writeFileSync(KEY_FILE_PATH, key, { mode: 0o600 });
      console.log("🔑 Auto-generated encryption key and saved to .fee_encryption_key");
    } catch (error) {
      console.error("Failed to save encryption key:", error);
    }
  }

  // Validate key
  if (key.length !== 64 || !/^[0-9a-fA-F]+$/.test(key)) {
    throw new Error("Encryption key must be 64 hex characters (32 bytes)");
  }

  ENCRYPTION_KEY_CACHE = key;
  return Buffer.from(key, 'hex');
}

/**
 * Encrypt a private key using AES-256-GCM
 */
export function encryptPrivateKey(secretKey: Uint8Array): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(secretKey)),
    cipher.final()
  ]);
  
  const authTag = cipher.getAuthTag();
  
  // Combine IV + AuthTag + Encrypted data
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64');
}

/**
 * Decrypt a private key using AES-256-GCM
 */
export function decryptPrivateKey(encryptedData: string): Uint8Array {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedData, 'base64');
  
  // Extract IV, AuthTag, and encrypted data
  const iv = combined.subarray(0, 16);
  const authTag = combined.subarray(16, 32);
  const encrypted = combined.subarray(32);
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);
  
  return new Uint8Array(decrypted);
}

/**
 * Generate a new Solana keypair for referral account
 * Returns the public key and encrypted private key
 */
export function generateReferralKeypair(): {
  publicKey: string;
  encryptedPrivateKey: string;
} {
  const keypair = Keypair.generate();
  const encryptedPrivateKey = encryptPrivateKey(keypair.secretKey);
  
  return {
    publicKey: keypair.publicKey.toBase58(),
    encryptedPrivateKey
  };
}
