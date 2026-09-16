import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { connection, FEE_BPS, FEES_WALLET, PRIORITY_MICROLAMPORTS } from "./config";

export interface IxGroup {
  id: string;
  instructions: TransactionInstruction[];
  /** Lamports returned to the owner by this group; null = measure by simulation */
  reclaimLamports: number | null;
  computeUnits: number;
}

export interface BuiltTx {
  transaction: string; // base64, unsigned
  ids: string[];
  reclaimLamports: number;
  feeLamports: number;
}

const MAX_TX_BYTES = 1232;

/** compact = skip compute-budget instructions to make room for more accounts (e.g. 20 closes). */
function buildTx(owner: PublicKey, blockhash: string, groups: IxGroup[], feeLamports: number, compact = false) {
  const units = Math.min(1_400_000, 20_000 + groups.reduce((s, g) => s + g.computeUnits, 0));
  const tx = new Transaction({ feePayer: owner, recentBlockhash: blockhash });
  if (!compact) {
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units }));
    if (PRIORITY_MICROLAMPORTS > 0) {
      tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICROLAMPORTS }));
    }
  }
  for (const g of groups) tx.add(...g.instructions);
  if (feeLamports > 0) {
    tx.add(SystemProgram.transfer({ fromPubkey: owner, toPubkey: FEES_WALLET, lamports: feeLamports }));
  }
  return tx;
}

function fits(tx: Transaction): boolean {
  try {
    return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).length <= MAX_TX_BYTES;
  } catch {
    return false;
  }
}

/** Reclaimed lamports measured by simulating the tx (used for NFTs, where several accounts close). */
async function simulateReclaim(owner: PublicKey, tx: Transaction): Promise<number> {
  const before = await connection.getBalance(owner, "confirmed");
  const sim = await connection.simulateTransaction(tx, undefined, [owner]);
  if (sim.value.err) {
    throw new Error(`Simulation failed: ${JSON.stringify(sim.value.err)} ${(sim.value.logs || []).slice(-3).join(" | ")}`);
  }
  const after = sim.value.accounts?.[0]?.lamports;
  if (after == null) return 0;
  const networkFee = (await connection.getFeeForMessage(tx.compileMessage(), "confirmed")).value ?? 5000;
  return Math.max(0, after - before + networkFee);
}

/** Packs instruction groups into as few transactions as fit, each ending with the platform fee transfer. */
export async function packTransactions(owner: PublicKey, groups: IxGroup[], maxGroupsPerTx = 20): Promise<BuiltTx[]> {
  if (groups.length === 0) return [];
  const balance = await connection.getBalance(owner, "confirmed");
  if (balance < 15_000) {
    throw new Error("You need a tiny bit of SOL (about 0.0001) in your wallet to pay the network fee");
  }
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const batches: IxGroup[][] = [];
  let current: IxGroup[] = [];
  // Measure with a placeholder fee so the real fee transfer always fits.
  const fitsAny = (gs: IxGroup[]) => fits(buildTx(owner, blockhash, gs, 1)) || fits(buildTx(owner, blockhash, gs, 1, true));

  for (const g of groups) {
    const candidate = [...current, g];
    if (candidate.length <= maxGroupsPerTx && fitsAny(candidate)) {
      current = candidate;
    } else {
      if (current.length) batches.push(current);
      if (!fitsAny([g])) {
        console.warn(`[pack] ${g.id} does not fit in a single transaction, skipped`);
        current = [];
        continue;
      }
      current = [g];
    }
  }
  if (current.length) batches.push(current);

  const built: BuiltTx[] = [];
  let lastError: Error | null = null;
  for (const batch of batches) {
    let reclaim = batch.reduce((s, g) => s + (g.reclaimLamports ?? 0), 0);
    if (batch.some((g) => g.reclaimLamports === null)) {
      try {
        reclaim = await simulateReclaim(owner, buildTx(owner, blockhash, batch, 0));
      } catch (e) {
        lastError = e as Error;
        console.warn(`[pack] skipped ${batch.map((g) => g.id).join(",")}: ${lastError.message}`);
        continue;
      }
    }
    const fee = Math.floor((reclaim * FEE_BPS) / 10_000);
    let tx = buildTx(owner, blockhash, batch, fee);
    if (!fits(tx)) tx = buildTx(owner, blockhash, batch, fee, true);
    built.push({
      transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
      ids: batch.map((g) => g.id),
      reclaimLamports: reclaim,
      feeLamports: fee,
    });
  }
  if (built.length === 0 && lastError) throw lastError;
  return built;
}
