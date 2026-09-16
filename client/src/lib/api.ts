import { Transaction } from "@solana/web3.js";
import { Buffer } from "buffer";

export interface TokenAccountInfo {
  address: string;
  mint: string;
  program: "spl" | "token2022";
  amount: string;
  decimals: number;
  uiAmount: number;
  lamports: number;
  name: string;
  symbol: string;
  image: string | null;
  usdValue: number | null;
}

export interface NftInfo {
  id: string;
  name: string;
  image: string | null;
  collection: string | null;
  kind: "nft" | "pnft" | "core";
}

export interface BuiltTx {
  transaction: string;
  ids: string[];
  reclaimLamports: number;
  feeLamports: number;
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json as T;
}

export const lamportsToSol = (l: number) => l / 1e9;
export const fmtSol = (l: number, digits = 4) => lamportsToSol(l).toFixed(digits);

type SignAll = (txs: Transaction[]) => Promise<Transaction[]>;

export interface RunResult {
  confirmedIds: string[];
  reclaimedLamports: number;
  failed: number;
}

/** Sign every built transaction with the wallet, send them, and wait for confirmations. */
export async function signSendConfirm(
  built: BuiltTx[],
  signAllTransactions: SignAll,
  onProgress: (msg: string) => void,
): Promise<RunResult> {
  const txs = built.map((b) => Transaction.from(Buffer.from(b.transaction, "base64")));
  onProgress(`Approve ${txs.length} transaction${txs.length > 1 ? "s" : ""} in your wallet…`);
  const signed = await signAllTransactions(txs);

  onProgress("Sending…");
  const { signatures } = await api<{ signatures: (string | null)[] }>("/api/send", {
    transactions: signed.map((t) => t.serialize().toString("base64")),
  });

  const pending = new Map<number, string>();
  signatures.forEach((s, i) => s && pending.set(i, s));
  const done = new Set<number>();
  let failed = signatures.filter((s) => !s).length;

  const deadline = Date.now() + 90_000;
  while (pending.size && Date.now() < deadline) {
    onProgress(`Confirming ${done.size}/${signatures.length}…`);
    await new Promise((r) => setTimeout(r, 2000));
    const entries = Array.from(pending.entries());
    const { statuses } = await api<{ statuses: { confirmed: boolean; failed: boolean }[] }>("/api/status", {
      signatures: entries.map(([, s]) => s),
    });
    statuses.forEach((st, k) => {
      const idx = entries[k][0];
      if (st.confirmed) {
        done.add(idx);
        pending.delete(idx);
      } else if (st.failed) {
        failed++;
        pending.delete(idx);
      }
    });
  }
  failed += pending.size;

  const ok = Array.from(done).map((i) => built[i]);
  return {
    confirmedIds: ok.flatMap((b) => b.ids),
    reclaimedLamports: ok.reduce((s, b) => s + b.reclaimLamports - b.feeLamports, 0),
    failed,
  };
}
