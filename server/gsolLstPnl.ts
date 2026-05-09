import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';

const WSOL = 'So11111111111111111111111111111111111111112';
const GSOL_MINT = 'GSoLRcWKQE5nbWTYFr83Ei3HGjnp9YzQNAFK6VAATg3';
const HELIUS_KEY = process.env.HELIUS_API_KEY;
const SANCTUM_KEY = process.env.SANCTUM_API_KEY;
const PAGE_LIMIT = 100;
const MAX_TX = 5000; // ATA-scoped, so each tx is GSOL-related
const TTL_MS = 5 * 60 * 1000;

type RatePoint = { ts: number; rate: number };
type Lot = { qty: number; rateAtAcq: number };
type Result = {
  qty: number;
  avgCostRate: number | null;
  currentRate: number;
  costSol: number;
  currentValueSol: number;
  unrealizedSol: number;
  realizedSol: number;
  totalSol: number;
  txCount: number;
  movements: number;
  reachedLimit: boolean;
  cached: boolean;
};

let _rateHistory: RatePoint[] = [];
let _rateHistoryAt = 0;
const RATE_TTL = 60 * 60 * 1000;
const CACHE = new Map<string, { ts: number; data: Result }>();
const INFLIGHT = new Map<string, Promise<Result>>();
const MAX_CACHE = 500;

async function fetchRateHistory(): Promise<RatePoint[]> {
  if (_rateHistory.length && Date.now() - _rateHistoryAt < RATE_TTL) return _rateHistory;
  if (!SANCTUM_KEY) return [];
  const r = await fetch(`https://sanctum-api.ironforge.network/lsts/${GSOL_MINT}/apys?apiKey=${SANCTUM_KEY}&limit=500`);
  if (!r.ok) return _rateHistory;
  const j: any = await r.json();
  const rows: any[] = (j?.data ?? []).map((x: any) => ({
    epoch: x.epoch,
    epochEndTs: x.epochEndTs,
    apy: !Number.isFinite(x.apy) || x.apy > 1 || x.apy < 0 ? 0 : x.apy,
  })).sort((a: any, b: any) => a.epoch - b.epoch);
  let compound = 1.0;
  const out: RatePoint[] = [];
  if (rows.length) out.push({ ts: rows[0].epochEndTs - 2 * 86400000, rate: 1.0 });
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const prevTs = i > 0 ? rows[i - 1].epochEndTs : row.epochEndTs - 2 * 86400000;
    const days = Math.max(0, (row.epochEndTs - prevTs) / 86400000);
    if (row.apy > 0 && days > 0) compound *= Math.pow(1 + row.apy, days / 365);
    out.push({ ts: row.epochEndTs, rate: compound });
  }
  _rateHistory = out;
  _rateHistoryAt = Date.now();
  return out;
}

function rateAt(history: RatePoint[], ts: number): number {
  if (!history.length) return 1.0;
  if (ts <= history[0].ts) return history[0].rate;
  if (ts >= history[history.length - 1].ts) return history[history.length - 1].rate;
  let lo = 0, hi = history.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (history[mid].ts <= ts) lo = mid; else hi = mid;
  }
  const a = history[lo], b = history[hi];
  const span = b.ts - a.ts;
  if (span <= 0) return a.rate;
  const t = (ts - a.ts) / span;
  return a.rate + (b.rate - a.rate) * t;
}

async function fetchTxPage(wallet: string, before?: string): Promise<any[]> {
  const url = new URL(`https://api.helius.xyz/v0/addresses/${wallet}/transactions`);
  url.searchParams.set('api-key', HELIUS_KEY!);
  url.searchParams.set('limit', String(PAGE_LIMIT));
  if (before) url.searchParams.set('before', before);
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`Helius ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

function gsolDelta(tx: any, wallet: string): number {
  let d = 0;
  for (const t of tx.tokenTransfers || []) {
    if (t.mint !== GSOL_MINT) continue;
    const amt = Number(t.tokenAmount || 0);
    if (!amt) continue;
    if (t.toUserAccount === wallet) d += amt;
    if (t.fromUserAccount === wallet) d -= amt;
  }
  return d;
}

async function compute(wallet: string, currentRate: number, solPriceUsd: number): Promise<Result> {
  const history = await fetchRateHistory();

  // Derive the user's GSOL associated token account — its tx history is
  // GSOL-only, so we get full lifetime history in far fewer calls than
  // scanning the wallet itself.
  let scanAddress = wallet;
  try {
    const ata = getAssociatedTokenAddressSync(new PublicKey(GSOL_MINT), new PublicKey(wallet));
    scanAddress = ata.toBase58();
  } catch {}

  const all: any[] = [];
  let before: string | undefined;
  let reachedLimit = false;
  while (all.length < MAX_TX) {
    const page = await fetchTxPage(scanAddress, before);
    if (page.length === 0) break;
    all.push(...page);
    if (page.length < PAGE_LIMIT) break;
    before = page[page.length - 1].signature;
  }
  if (all.length >= MAX_TX) reachedLimit = true;

  // Keep only txs where wallet's GSOL balance changes
  const movements: { ts: number; delta: number }[] = [];
  for (const tx of all) {
    const d = gsolDelta(tx, wallet);
    if (Math.abs(d) > 1e-12) movements.push({ ts: (tx.timestamp || 0) * 1000, delta: d });
  }
  movements.sort((a, b) => a.ts - b.ts);

  const lots: Lot[] = [];
  let realizedSol = 0;
  for (const m of movements) {
    const r = rateAt(history, m.ts);
    if (m.delta > 0) {
      lots.push({ qty: m.delta, rateAtAcq: r });
    } else {
      let qty = -m.delta;
      while (qty > 1e-12 && lots.length > 0) {
        const lot = lots[0];
        const take = Math.min(lot.qty, qty);
        // Realized in SOL = take × (saleRate - acqRate)
        realizedSol += take * (r - lot.rateAtAcq);
        lot.qty -= take;
        qty -= take;
        if (lot.qty < 1e-12) lots.shift();
      }
      // If qty leftover (untracked acquisition), realized over-counts; ignore extra.
    }
  }

  const remainingQty = lots.reduce((a, l) => a + l.qty, 0);
  const costSolRemaining = lots.reduce((a, l) => a + l.qty * l.rateAtAcq, 0);
  const avgCostRate = remainingQty > 0 ? costSolRemaining / remainingQty : null;
  const currentValueSol = remainingQty * currentRate;
  const unrealizedSol = currentValueSol - costSolRemaining;
  const totalSol = unrealizedSol + realizedSol;

  return {
    qty: remainingQty,
    avgCostRate,
    currentRate,
    costSol: costSolRemaining,
    currentValueSol,
    unrealizedSol,
    realizedSol,
    totalSol,
    txCount: all.length,
    movements: movements.length,
    reachedLimit,
    cached: false,
  };
}

export async function computeGsolLstPnl(wallet: string, currentRate: number, solPriceUsd: number): Promise<Result> {
  if (!HELIUS_KEY) throw new Error('HELIUS_API_KEY missing');
  const cacheKey = wallet;
  const c = CACHE.get(cacheKey);
  if (c && Date.now() - c.ts < TTL_MS) return { ...c.data, currentRate, currentValueSol: c.data.qty * currentRate, unrealizedSol: c.data.qty * currentRate - c.data.costSol, totalSol: (c.data.qty * currentRate - c.data.costSol) + c.data.realizedSol, cached: true };

  let inflight = INFLIGHT.get(cacheKey);
  if (!inflight) {
    inflight = compute(wallet, currentRate, solPriceUsd)
      .then((data) => {
        CACHE.delete(cacheKey);
        CACHE.set(cacheKey, { ts: Date.now(), data });
        while (CACHE.size > MAX_CACHE) {
          const k = CACHE.keys().next().value;
          if (k === undefined) break;
          CACHE.delete(k);
        }
        return data;
      })
      .finally(() => { INFLIGHT.delete(cacheKey); });
    INFLIGHT.set(cacheKey, inflight);
  }
  return inflight;
}
