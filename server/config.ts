import { Connection, PublicKey } from "@solana/web3.js";

const heliusKey = process.env.Helius_key || process.env.HELIUS_API_KEY || "";
if (!heliusKey) {
  console.warn("[config] Helius_key is not set - scanning will fail");
}

export const RPC_URL = heliusKey
  ? `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`
  : process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
export const connection = new Connection(RPC_URL, "confirmed");

// GetFreeSol on-chain program (close / burn token accounts)
export const GFS_PROGRAM_ID = new PublicKey("5o8wsyECKtCwT72BNQJRxm1U5xDeVL5bD69WGxAFZSKB");

export const FEES_WALLET = new PublicKey(
  process.env.FEES_WALLET || "C6mQjeAXyjGCycG12A5FrNP3NM22mBbXxTSASMGFrggv",
);
export const REOWN_PROJECT_ID = process.env.REOWN_PROJECT_ID || process.env.VITE_REOWN_PROJECT_ID || "";
if (!REOWN_PROJECT_ID) console.warn("[config] REOWN_PROJECT_ID is not set - wallet connection disabled");
export const FEE_BPS = Number(process.env.FEE_BPS ?? 730);
export const PRIORITY_MICROLAMPORTS = Number(process.env.PRIORITY_MICROLAMPORTS ?? 20000);

export async function heliusRpc<T = any>(method: string, params: unknown): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "gfs", method, params }),
  });
  if (!res.ok) throw new Error(`Helius ${method} failed: ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`Helius ${method}: ${json.error.message}`);
  return json.result as T;
}

export function parseOwner(value: unknown): PublicKey {
  if (typeof value !== "string") throw new Error("Invalid wallet address");
  return new PublicKey(value);
}
