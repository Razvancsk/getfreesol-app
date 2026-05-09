const WSOL = 'So11111111111111111111111111111111111111112';
const HELIUS_KEY = process.env.HELIUS_API_KEY;

type Lot = { qty: number; costSol: number };
type CacheEntry = {
  ts: number;
  lots: Record<string, Lot[]>;
  realizedSol: number;
  totalBoughtSol: Record<string, number>;
  totalSoldSol: Record<string, number>;
  realizedByMint: Record<string, number>;
  txCount: number;
  reachedLimit: boolean;
  untrackedSells: number;
};

const CACHE = new Map<string, CacheEntry>();
const INFLIGHT = new Map<string, Promise<CacheEntry>>();
const TTL_MS = 5 * 60 * 1000;
const MAX_CACHE = 500;
const MAX_TX = 1500;
const PAGE_LIMIT = 100;

function cachePut(wallet: string, entry: CacheEntry) {
  CACHE.delete(wallet);
  CACHE.set(wallet, entry);
  while (CACHE.size > MAX_CACHE) {
    const k = CACHE.keys().next().value;
    if (k === undefined) break;
    CACHE.delete(k);
  }
}

async function fetchSwapPage(wallet: string, before?: string): Promise<any[]> {
  const url = new URL(`https://api.helius.xyz/v0/addresses/${wallet}/transactions`);
  url.searchParams.set('api-key', HELIUS_KEY!);
  url.searchParams.set('type', 'SWAP');
  url.searchParams.set('limit', String(PAGE_LIMIT));
  if (before) url.searchParams.set('before', before);
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`Helius ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

function netDeltasForWallet(tx: any, wallet: string): Record<string, number> {
  const deltas: Record<string, number> = {};
  for (const t of tx.tokenTransfers || []) {
    const amt = Number(t.tokenAmount || 0);
    if (!amt) continue;
    if (t.toUserAccount === wallet) deltas[t.mint] = (deltas[t.mint] || 0) + amt;
    if (t.fromUserAccount === wallet) deltas[t.mint] = (deltas[t.mint] || 0) - amt;
  }
  let nativeDelta = 0;
  for (const n of tx.nativeTransfers || []) {
    const lam = Number(n.amount || 0);
    if (n.toUserAccount === wallet) nativeDelta += lam;
    if (n.fromUserAccount === wallet) nativeDelta -= lam;
  }
  if (nativeDelta !== 0) {
    deltas[WSOL] = (deltas[WSOL] || 0) + nativeDelta / 1e9;
  }
  return deltas;
}

function processSwap(
  tx: any,
  wallet: string,
  state: { lots: Record<string, Lot[]>; realizedSol: number; bought: Record<string, number>; sold: Record<string, number>; realizedByMint: Record<string, number>; untrackedSells: number }
) {
  const deltas = netDeltasForWallet(tx, wallet);
  const solDelta = deltas[WSOL] || 0;
  if (Math.abs(solDelta) < 1e-9) return; // SPL→SPL not supported (no SOL leg)

  // Net "in" and "out" non-SOL tokens
  let inMint: string | null = null, inAbs = 0;
  let outMint: string | null = null, outAbs = 0;
  for (const [m, d] of Object.entries(deltas)) {
    if (m === WSOL) continue;
    if (d > inAbs) { inAbs = d; inMint = m; }
    if (-d > outAbs) { outAbs = -d; outMint = m; }
  }

  if (solDelta < 0 && inMint && inAbs > 1e-9) {
    // BUY: spent SOL → received inMint
    const costSol = -solDelta;
    state.lots[inMint] = state.lots[inMint] || [];
    state.lots[inMint].push({ qty: inAbs, costSol });
    state.bought[inMint] = (state.bought[inMint] || 0) + costSol;
  } else if (solDelta > 0 && outMint && outAbs > 1e-9) {
    // SELL: gave outMint → received SOL
    const proceedsSol = solDelta;
    let qtyToSell = outAbs;
    let costBasisConsumed = 0;
    const lots = state.lots[outMint] || [];
    while (qtyToSell > 1e-12 && lots.length > 0) {
      const lot = lots[0];
      const take = Math.min(lot.qty, qtyToSell);
      const portion = take / lot.qty;
      const cost = lot.costSol * portion;
      costBasisConsumed += cost;
      lot.qty -= take;
      lot.costSol -= cost;
      qtyToSell -= take;
      if (lot.qty < 1e-12) lots.shift();
    }
    if (qtyToSell > 1e-9) {
      // Sold more than we have lots for (untracked acquisition: transfer-in or older swap)
      state.untrackedSells += 1;
    }
    const tradeRealized = proceedsSol - costBasisConsumed;
    state.realizedSol += tradeRealized;
    state.realizedByMint[outMint] = (state.realizedByMint[outMint] || 0) + tradeRealized;
    state.sold[outMint] = (state.sold[outMint] || 0) + proceedsSol;
  }
}

export type PnlResult = {
  lots: Record<string, Lot[]>;
  realizedSol: number;
  totalBoughtSol: Record<string, number>;
  totalSoldSol: Record<string, number>;
  txCount: number;
  reachedLimit: boolean;
  untrackedSells: number;
  cached: boolean;
};

async function computeFresh(wallet: string): Promise<CacheEntry> {
  const all: any[] = [];
  let before: string | undefined;
  let reachedLimit = false;
  while (all.length < MAX_TX) {
    const page = await fetchSwapPage(wallet, before);
    if (page.length === 0) break;
    all.push(...page);
    if (page.length < PAGE_LIMIT) break;
    before = page[page.length - 1].signature;
  }
  if (all.length >= MAX_TX) reachedLimit = true;

  all.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  const state = {
    lots: {} as Record<string, Lot[]>,
    realizedSol: 0,
    bought: {} as Record<string, number>,
    sold: {} as Record<string, number>,
    realizedByMint: {} as Record<string, number>,
    untrackedSells: 0,
  };
  for (const tx of all) processSwap(tx, wallet, state);

  return {
    ts: Date.now(),
    lots: state.lots,
    realizedSol: state.realizedSol,
    totalBoughtSol: state.bought,
    totalSoldSol: state.sold,
    realizedByMint: state.realizedByMint,
    txCount: all.length,
    reachedLimit,
    untrackedSells: state.untrackedSells,
  };
}

export async function computeWalletPnl(wallet: string): Promise<PnlResult> {
  if (!HELIUS_KEY) throw new Error('HELIUS_API_KEY missing');

  const cached = CACHE.get(wallet);
  if (cached && Date.now() - cached.ts < TTL_MS) {
    return { ...cached, cached: true } as any;
  }

  let inflight = INFLIGHT.get(wallet);
  if (!inflight) {
    inflight = computeFresh(wallet)
      .then((entry) => { cachePut(wallet, entry); return entry; })
      .finally(() => { INFLIGHT.delete(wallet); });
    INFLIGHT.set(wallet, inflight);
  }
  const entry = await inflight;
  return { ...entry, cached: false } as any;
}

export function remainingCostSol(lots: Lot[] | undefined): number {
  if (!lots) return 0;
  return lots.reduce((a, l) => a + l.costSol, 0);
}

export function remainingQty(lots: Lot[] | undefined): number {
  if (!lots) return 0;
  return lots.reduce((a, l) => a + l.qty, 0);
}
