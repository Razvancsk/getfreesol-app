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

export interface RewardInfo {
  id: string;
  label: string;
  description: string;
  lamports: number;
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
  /** Set when a batched run stopped early (e.g. user cancelled) after some batches succeeded */
  stoppedReason?: string;
}

async function waitForConfirmation(signature: string, timeoutMs = 90_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const { statuses } = await api<{ statuses: { confirmed: boolean; failed: boolean }[] }>("/api/status", {
      signatures: [signature],
    });
    if (statuses[0]?.confirmed) return true;
    if (statuses[0]?.failed) return false;
  }
  return false;
}

/**
 * Processes ids in chunks: for each chunk build a fresh transaction on the server,
 * ask the wallet to sign it, send it and wait for confirmation before the next one.
 */
export async function runInBatches(
  ids: string[],
  batchSize: number,
  build: (chunk: string[]) => Promise<{ transactions: BuiltTx[] }>,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
  onProgress: (msg: string) => void,
): Promise<RunResult> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += batchSize) chunks.push(ids.slice(i, i + batchSize));

  const result: RunResult = { confirmedIds: [], reclaimedLamports: 0, failed: 0 };
  let step = 0;
  try {
    for (const chunk of chunks) {
      step++;
      const label = chunks.length > 1 ? `Batch ${step}/${chunks.length}: ` : "";
      onProgress(`${label}Preparing…`);
      const { transactions } = await build(chunk);
      for (const built of transactions) {
        onProgress(`${label}Approve in your wallet (${built.ids.length} accounts)…`);
        const signed = await signTransaction(Transaction.from(Buffer.from(built.transaction, "base64")));
        onProgress(`${label}Sending…`);
        const { signatures, errors } = await api<{ signatures: (string | null)[]; errors: string[] }>("/api/send", {
          transactions: [signed.serialize().toString("base64")],
        });
        const sig = signatures[0];
        if (!sig) throw new Error(errors[0] || "Transaction was rejected by the network");
        onProgress(`${label}Confirming…`);
        if (await waitForConfirmation(sig)) {
          result.confirmedIds.push(...built.ids);
          result.reclaimedLamports += built.reclaimLamports - built.feeLamports;
        } else {
          result.failed++;
        }
      }
    }
  } catch (e) {
    if (result.confirmedIds.length === 0) throw e;
    result.stoppedReason = e instanceof Error ? e.message : String(e);
  }
  return result;
}

/**
 * Processes ids in chunks: for each chunk build fresh transactions on the server and sign
 * the whole chunk in one wallet prompt. Small chunks keep wallets from choking on a long
 * list of transactions, and every chunk gets a fresh blockhash.
 */
export async function runInBatchesSignAll(
  ids: string[],
  batchSize: number,
  build: (chunk: string[]) => Promise<{ transactions: BuiltTx[] }>,
  signAllTransactions: SignAll,
  onProgress: (msg: string) => void,
): Promise<RunResult> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += batchSize) chunks.push(ids.slice(i, i + batchSize));

  const result: RunResult = { confirmedIds: [], reclaimedLamports: 0, failed: 0 };
  let step = 0;
  try {
    for (const chunk of chunks) {
      step++;
      const label = chunks.length > 1 ? `Batch ${step}/${chunks.length}: ` : "";
      onProgress(`${label}Preparing…`);
      const { transactions } = await build(chunk);
      if (!transactions.length) continue;
      const batch = await signSendConfirm(transactions, signAllTransactions, (msg) => onProgress(label + msg));
      result.confirmedIds.push(...batch.confirmedIds);
      result.reclaimedLamports += batch.reclaimedLamports;
      result.failed += batch.failed;
    }
  } catch (e) {
    if (result.confirmedIds.length === 0) throw e;
    result.stoppedReason = e instanceof Error ? e.message : String(e);
  }
  return result;
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
