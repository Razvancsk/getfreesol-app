import WebSocket from 'ws';

type Event = {
  txType?: string;
  pool?: string;
  mint?: string;
  name?: string;
  symbol?: string;
  uri?: string;
  imageUri?: string;
  user?: string;
  traderPublicKey?: string;
  initialBuy?: number;
  vSolInBondingCurve?: number;
  vTokensInBondingCurve?: number;
  marketCapSol?: number;
  signature?: string;
  timestamp?: number;
  [k: string]: any;
};

type Token = {
  mint: string;
  name?: string;
  symbol?: string;
  imageUri?: string;
  pool?: string;
  vSolInBondingCurve?: number;
  vTokensInBondingCurve?: number;
  marketCapSol?: number;
  bondingPct?: number;
  createdAt?: number;
  lastSeen: number;
  buys: number;
  sells: number;
  migrated?: boolean;
  migratedAt?: number;
};

const MAX_NEW = 200;
const MAX_MIGRATED = 200;
const MAX_TRACKED = 5000;
const PUMP_BOND_SOL = 85; // pump.fun bonds at ~85 virtual SOL
const ALMOST_BOND_THRESHOLD = 0.6; // 60%+ progress

const tokens = new Map<string, Token>();
const newOrder: string[] = [];
const migratedOrder: string[] = [];

let ws: WebSocket | null = null;
let connected = false;
let reconnectTimer: NodeJS.Timeout | null = null;
let lastEventAt = 0;

function bondingPctFor(pool: string | undefined, vSol: number | undefined): number | undefined {
  if (!vSol || !pool) return undefined;
  if (pool === 'pump') return Math.min(1, vSol / PUMP_BOND_SOL);
  return undefined;
}

function upsert(mint: string, patch: Partial<Token>): Token {
  let t = tokens.get(mint);
  if (!t) {
    t = { mint, lastSeen: Date.now(), buys: 0, sells: 0 };
    tokens.set(mint, t);
  } else {
    // Map insertion-order is iteration-order; re-insert to mark as MRU.
    tokens.delete(mint);
    tokens.set(mint, t);
  }
  Object.assign(t, patch);
  t.lastSeen = Date.now();
  return t;
}

// Periodic batched eviction — much cheaper than sorting every event.
function evictIfNeeded() {
  if (tokens.size <= MAX_TRACKED) return;
  const toRemove = tokens.size - MAX_TRACKED + Math.floor(MAX_TRACKED * 0.05);
  let i = 0;
  for (const k of tokens.keys()) {
    if (i++ >= toRemove) break;
    tokens.delete(k); // oldest first since Map preserves insertion order
  }
}

function handleEvent(ev: Event) {
  if (!ev || !ev.mint) return;
  lastEventAt = Date.now();
  const ts = (ev.timestamp ? Number(ev.timestamp) : 0) || Date.now();

  if (ev.txType === 'create') {
    upsert(ev.mint, {
      name: ev.name,
      symbol: ev.symbol,
      imageUri: ev.imageUri || ev.uri,
      pool: ev.pool,
      vSolInBondingCurve: ev.vSolInBondingCurve,
      vTokensInBondingCurve: ev.vTokensInBondingCurve,
      marketCapSol: ev.marketCapSol,
      bondingPct: bondingPctFor(ev.pool, ev.vSolInBondingCurve),
      createdAt: ts,
    });
    // Only surface pump.fun mints in the "New" tab (this is a pump.fun screener)
    if (ev.pool === 'pump') {
      newOrder.unshift(ev.mint);
      while (newOrder.length > MAX_NEW) newOrder.pop();
    }
    return;
  }

  // Migration signals:
  // - `migrate` action lands → migration initiated
  // - `createPool` with poolCreatedBy='pump' (pool='pump-amm') → migration completed on PumpSwap
  const isMigrate = ev.txType === 'migrate';
  const isPumpAmmCreatePool =
    ev.txType === 'createPool' &&
    (ev.pool === 'pump-amm' || ev.poolCreatedBy === 'pump');
  if (isMigrate || isPumpAmmCreatePool) {
    upsert(ev.mint, {
      migrated: true,
      migratedAt: ts,
      pool: ev.pool || 'pump-amm',
      bondingPct: 1,
    });
    if (!migratedOrder.includes(ev.mint)) {
      migratedOrder.unshift(ev.mint);
      while (migratedOrder.length > MAX_MIGRATED) migratedOrder.pop();
    }
    return;
  }

  if (ev.txType === 'buy' || ev.txType === 'sell') {
    const patch: Partial<Token> = {
      pool: ev.pool ?? undefined,
      vSolInBondingCurve: ev.vSolInBondingCurve ?? undefined,
      vTokensInBondingCurve: ev.vTokensInBondingCurve ?? undefined,
      marketCapSol: ev.marketCapSol ?? undefined,
      bondingPct: bondingPctFor(ev.pool, ev.vSolInBondingCurve),
    };
    const t = upsert(ev.mint, patch);
    if (ev.txType === 'buy') t.buys++; else t.sells++;
  }
}

function connect() {
  if (ws || reconnectTimer) return; // guard against duplicate connections / pending reconnect
  console.log('[pumpStream] connecting…');
  const sock = new WebSocket('wss://stream.pumpapi.io/');
  ws = sock;
  sock.on('open', () => { connected = true; console.log('[pumpStream] connected'); });
  sock.on('message', (data) => {
    try {
      const text = typeof data === 'string' ? data : data.toString('utf8');
      const ev = JSON.parse(text);
      if (Array.isArray(ev)) ev.forEach(handleEvent); else handleEvent(ev);
    } catch (e) { /* ignore parse errors */ }
  });
  const reset = () => {
    if (ws !== sock) return; // already replaced
    try { sock.removeAllListeners(); sock.terminate(); } catch {}
    ws = null; connected = false;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, 3000);
  };
  sock.on('close', () => reset());
  sock.on('error', (e) => { console.error('[pumpStream] error', (e as Error).message); reset(); });
}

let started = false;
let watchdogTimer: NodeJS.Timeout | null = null;
let evictTimer: NodeJS.Timeout | null = null;
export function startPumpStream() {
  if (started) return;
  started = true;
  connect();
  // watchdog: if no events for 60s, force reconnect
  if (watchdogTimer) clearInterval(watchdogTimer);
  watchdogTimer = setInterval(() => {
    if (connected && lastEventAt && Date.now() - lastEventAt > 60_000) {
      console.warn('[pumpStream] stale, reconnecting');
      const old = ws;
      ws = null; connected = false;
      try { old?.removeAllListeners(); old?.terminate(); } catch {}
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      connect();
    }
  }, 30_000);
  // periodic batched LRU eviction (cheap)
  if (evictTimer) clearInterval(evictTimer);
  evictTimer = setInterval(evictIfNeeded, 10_000);
}

function serialize(t: Token) {
  return {
    mint: t.mint,
    name: t.name,
    symbol: t.symbol,
    imageUri: t.imageUri,
    pool: t.pool,
    vSolInBondingCurve: t.vSolInBondingCurve,
    marketCapSol: t.marketCapSol,
    bondingPct: t.bondingPct,
    createdAt: t.createdAt,
    lastSeen: t.lastSeen,
    buys: t.buys,
    sells: t.sells,
    migrated: !!t.migrated,
    migratedAt: t.migratedAt,
  };
}

export function getFeed(type: 'new' | 'bonding' | 'migrated', limit = 50) {
  if (type === 'new') {
    return newOrder.slice(0, limit).map((m) => tokens.get(m)).filter((t): t is Token => !!t).map(serialize);
  }
  if (type === 'migrated') {
    return migratedOrder.slice(0, limit).map((m) => tokens.get(m)).filter((t): t is Token => !!t).map(serialize);
  }
  // bonding: pump pool, not migrated, bondingPct >= threshold, sorted by pct desc
  const arr = [...tokens.values()]
    .filter((t) => !t.migrated && t.pool === 'pump' && (t.bondingPct ?? 0) >= ALMOST_BOND_THRESHOLD)
    .sort((a, b) => (b.bondingPct ?? 0) - (a.bondingPct ?? 0))
    .slice(0, limit)
    .map(serialize);
  return arr;
}

export function getStreamStatus() {
  return {
    connected,
    tracked: tokens.size,
    newCount: newOrder.length,
    migratedCount: migratedOrder.length,
    lastEventAgeMs: lastEventAt ? Date.now() - lastEventAt : null,
  };
}

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export function validateTradeInput(opts: {
  publicKey: any; action: any; mint: any; amount: any;
  slippage?: any; priorityFee?: any;
}): { ok: true } | { ok: false; error: string } {
  if (typeof opts.publicKey !== 'string' || !BASE58_RE.test(opts.publicKey))
    return { ok: false, error: 'invalid publicKey' };
  if (typeof opts.mint !== 'string' || !BASE58_RE.test(opts.mint))
    return { ok: false, error: 'invalid mint' };
  if (opts.action !== 'buy' && opts.action !== 'sell')
    return { ok: false, error: 'action must be buy or sell' };
  // amount: number > 0, OR (sell only) "100%"
  if (typeof opts.amount === 'string') {
    if (!(opts.action === 'sell' && /^\d{1,3}(\.\d+)?%$/.test(opts.amount)))
      return { ok: false, error: 'invalid amount string' };
  } else {
    const n = Number(opts.amount);
    if (!Number.isFinite(n) || n <= 0 || n > 10_000)
      return { ok: false, error: 'amount must be > 0 and <= 10000' };
  }
  if (opts.slippage !== undefined) {
    const s = Number(opts.slippage);
    if (!Number.isFinite(s) || s < 0 || s > 100)
      return { ok: false, error: 'slippage must be 0–100' };
  }
  if (opts.priorityFee !== undefined) {
    const p = Number(opts.priorityFee);
    if (!Number.isFinite(p) || p < 0 || p > 1)
      return { ok: false, error: 'priorityFee out of range' };
  }
  return { ok: true };
}

// Build an unsigned buy/sell tx via pumpapi local-transaction mode.
// Response is raw transaction bytes; we return them base64-encoded.
export async function buildTradeTx(opts: {
  publicKey: string;
  action: 'buy' | 'sell';
  mint: string;
  amount: number | string;
  denominatedInQuote: boolean;
  slippage?: number;
  priorityFee?: number;
  partnerAddress?: string;
  partnerFeeRatio?: number;
}): Promise<string> {
  const body: any = {
    publicKey: opts.publicKey,
    action: opts.action,
    mint: opts.mint,
    amount: opts.amount,
    denominatedInQuote: opts.denominatedInQuote ? 'true' : 'false',
    slippage: opts.slippage ?? 20,
  };
  if (opts.priorityFee !== undefined) body.priorityFee = opts.priorityFee;
  if (opts.partnerAddress) body.partnerAddress = opts.partnerAddress;
  if (opts.partnerFeeRatio !== undefined) body.partnerFeeRatio = opts.partnerFeeRatio;

  const r = await fetch('https://api.pumpapi.io', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`pumpapi ${r.status}: ${txt.slice(0, 200)}`);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  // Single-tx branch returns raw bytes; bundle returns JSON array. We expect single tx.
  // Detect JSON: starts with '[' (0x5b) or '{'
  if (buf.length > 0 && (buf[0] === 0x5b || buf[0] === 0x7b)) {
    try {
      const j = JSON.parse(buf.toString('utf8'));
      if (Array.isArray(j) && j.length > 0 && typeof j[0] === 'string') return j[0];
      if (j && typeof j === 'object' && j.error) throw new Error(String(j.error));
    } catch (e) {
      throw new Error('Unexpected pumpapi response');
    }
  }
  return buf.toString('base64');
}
