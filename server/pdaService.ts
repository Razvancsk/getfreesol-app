import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";

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
