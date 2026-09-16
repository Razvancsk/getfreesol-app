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
  process.env.FEES_WALLET || "GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT",
);
export const REOWN_PROJECT_ID = process.env.REOWN_PROJECT_ID || process.env.VITE_REOWN_PROJECT_ID || "30247a4ea78906563498c2736129d21f";
if (!REOWN_PROJECT_ID) console.warn("[config] REOWN_PROJECT_ID is not set - wallet connection disabled");
export const FEE_BPS = Number(process.env.FEE_BPS ?? 1000);
export const PRIORITY_MICROLAMPORTS = Number(process.env.PRIORITY_MICROLAMPORTS ?? 20000);

const jupiterKey = process.env.JUPITER_API_KEY || process.env.Jupiter_key || process.env.JUP_API_KEY || "";
const JUPITER_PRICE_URL = jupiterKey ? "https://api.jup.ag/price/v3" : "https://lite-api.jup.ag/price/v3";

/** USD price per token from Jupiter, keyed by mint. Mints Jupiter doesn't price are absent. */
export async function jupiterPrices(mints: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  const unique = Array.from(new Set(mints));
  for (let i = 0; i < unique.length; i += 50) {
    try {
      const res = await fetch(`${JUPITER_PRICE_URL}?ids=${unique.slice(i, i + 50).join(",")}`, {
        headers: jupiterKey ? { "x-api-key": jupiterKey } : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Record<string, { usdPrice?: number } | null> = await res.json();
      for (const [mint, info] of Object.entries(data)) {
        if (info?.usdPrice != null) prices.set(mint, info.usdPrice);
      }
    } catch (e) {
      console.warn("[prices] Jupiter lookup failed:", (e as Error).message);
    }
  }
  return prices;
}

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
