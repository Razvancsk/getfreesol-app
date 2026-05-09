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
  firstMarketCapSol?: number;
  solVolume?: number;
  bondingPct?: number;
  createdAt?: number;
  firstSeen?: number;
  lastSeen: number;
  buys: number;
  sells: number;
  migrated?: boolean;
  migratedAt?: number;
};

// Standard supply for nearly all launchpad memecoins (1B tokens). Used to
// derive a per-token USD price from marketCapSol × SOL price.
const STANDARD_SUPPLY = 1_000_000_000;

let solUsd = 0;
let solUsdFetchedAt = 0;
async function refreshSolUsd() {
  try {
    const r = await fetch('https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112');
    const j: any = await r.json();
    const p = j?.['So11111111111111111111111111111111111111112']?.usdPrice;
    if (p && Number.isFinite(p)) { solUsd = Number(p); solUsdFetchedAt = Date.now(); }
  } catch { /* keep stale */ }
}

const MAX_NEW = 200;
const MAX_MIGRATED = 200;
const MAX_TRACKED = 5000;
// Bonding-curve launchpads & their target virtual SOL before migration.
// pumpapi.io supports: pump, pump-amm, raydium-launchpad (bonk), raydium-cpmm,
// meteora-launchpad (bags, moonshot), meteora-damm-v1/v2.
// Only the *launchpad* pools have a bonding curve; the *-amm/-damm/-cpmm pools
// are already full AMMs so progress isn't meaningful there.
const BOND_TARGETS: Record<string, number> = {
  'pump': 85,
  'raydium-launchpad': 85,
  'bonk': 85,
  'meteora-launchpad': 85,
  'bags': 85,
  'moonshot': 85,
};
const ALMOST_BOND_THRESHOLD = 0.5; // 50%+ progress, < 100% (not migrated)

const tokens = new Map<string, Token>();
const newOrder: string[] = [];
const migratedOrder: string[] = [];

let ws: WebSocket | null = null;
let connected = false;
let reconnectTimer: NodeJS.Timeout | null = null;
let lastEventAt = 0;

function isBondingPool(pool: string | undefined): boolean {
  return !!pool && pool in BOND_TARGETS;
}

// Pools that only exist AFTER a token has migrated/graduated to a full AMM.
// Detecting these on a buy/sell event lets us mark a token as migrated even
// if we never received an explicit `migrate`/`createPool` event for it.
function isMigratedPool(pool: string | undefined): boolean {
  if (!pool) return false;
  if (pool === 'pump-amm') return true;
  if (pool === 'raydium-cpmm' || pool === 'raydium-clmm' || pool === 'raydium-amm') return true;
  if (pool.startsWith('meteora-damm')) return true;
  if (pool === 'meteora-dlmm' || pool === 'meteora-dyn') return true;
  return false;
}

function bondingPctFor(pool: string | undefined, vSol: number | undefined): number | undefined {
  if (!vSol || !pool) return undefined;
  const target = BOND_TARGETS[pool];
  if (!target) return undefined;
  return Math.min(1, vSol / target);
}

function launchpadLabel(pool: string | undefined): string {
  if (!pool) return 'Unknown';
  if (pool === 'pump') return 'Pump.fun';
  if (pool === 'pump-amm') return 'PumpSwap';
  if (pool === 'raydium-launchpad' || pool === 'bonk') return 'LetsBonk';
  if (pool === 'raydium-cpmm') return 'Raydium';
  if (pool === 'meteora-launchpad') return 'Meteora';
  if (pool === 'bags') return 'Bags';
  if (pool === 'moonshot') return 'Moonshot';
  if (pool.startsWith('meteora')) return 'Meteora';
  if (pool.startsWith('raydium')) return 'Raydium';
  return pool;
}

function upsert(mint: string, patch: Partial<Token>): Token {
  let t = tokens.get(mint);
  if (!t) {
    const now = Date.now();
    t = { mint, lastSeen: now, firstSeen: now, buys: 0, sells: 0 };
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

// Resolve a token-metadata URI (typically IPFS JSON) into a direct image URL.
// pumpapi only provides `uri` pointing to the metadata JSON for most tokens, so
// we fetch it once and cache the result. Failed lookups are negative-cached.
const metaCache = new Map<string, string | null>();
const metaInflight = new Map<string, Promise<void>>();
function ipfsToHttp(u: string): string {
  if (u.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${u.slice(7)}`;
  return u;
}
function looksLikeImage(u: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(u);
}
async function resolveImageFromUri(mint: string, uri: string) {
  if (metaCache.has(uri)) {
    const img = metaCache.get(uri);
    if (img) {
      const t = tokens.get(mint);
      if (t) t.imageUri = img;
    }
    return;
  }
  if (metaInflight.has(uri)) return;
  const p = (async () => {
    try {
      const url = ipfsToHttp(uri);
      if (looksLikeImage(url)) {
        metaCache.set(uri, url);
        const t = tokens.get(mint);
        if (t) t.imageUri = url;
        return;
      }
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 5000);
      const r = await fetch(url, { signal: ctl.signal });
      clearTimeout(to);
      if (!r.ok) { metaCache.set(uri, null); return; }
      const j: any = await r.json().catch(() => null);
      const img = j && (j.image || j.image_url || j.imageUrl || j.imageUri);
      if (typeof img === 'string' && img) {
        const resolved = ipfsToHttp(img);
        metaCache.set(uri, resolved);
        const t = tokens.get(mint);
        if (t) t.imageUri = resolved;
      } else {
        metaCache.set(uri, null);
      }
    } catch {
      metaCache.set(uri, null);
    } finally {
      metaInflight.delete(uri);
    }
  })();
  metaInflight.set(uri, p);
}

function handleEvent(ev: Event) {
  if (!ev || !ev.mint) return;
  lastEventAt = Date.now();
  const ts = (ev.timestamp ? Number(ev.timestamp) : 0) || Date.now();

  if (ev.txType === 'create') {
    const directImg = ev.imageUri && looksLikeImage(ev.imageUri) ? ipfsToHttp(ev.imageUri) : ev.imageUri;
    upsert(ev.mint, {
      name: ev.name,
      symbol: ev.symbol,
      imageUri: directImg,
      pool: ev.pool,
      vSolInBondingCurve: ev.vSolInBondingCurve,
      vTokensInBondingCurve: ev.vTokensInBondingCurve,
      marketCapSol: ev.marketCapSol,
      bondingPct: bondingPctFor(ev.pool, ev.vSolInBondingCurve),
      createdAt: ts,
    });
    // If we only have a metadata URI (or no image at all), resolve it in the
    // background so the UI gets a real image once the JSON is fetched.
    const metaUri = ev.uri || (!directImg ? ev.imageUri : undefined);
    if (metaUri && (!directImg || !looksLikeImage(directImg))) {
      resolveImageFromUri(ev.mint, metaUri).catch(() => {});
    }
    // Surface ALL launchpad mints in "New" — pump.fun, LetsBonk, Meteora, Bags,
    // Moonshot, etc. (the pumpapi.io stream covers every supported launchpad).
    newOrder.unshift(ev.mint);
    while (newOrder.length > MAX_NEW) newOrder.pop();
    return;
  }

  // Migration / graduation signals across all supported launchpads:
  // - `migrate` action lands → migration initiated (any launchpad)
  // - `createPool` event → a token graduated to a full AMM
  //   (pump→pump-amm, raydium-launchpad→raydium-cpmm, meteora-launchpad→damm, …)
  const isMigrate = ev.txType === 'migrate';
  const isCreatePool = ev.txType === 'createPool';
  if (isMigrate || isCreatePool) {
    const directImg = ev.imageUri && looksLikeImage(ev.imageUri) ? ipfsToHttp(ev.imageUri) : ev.imageUri;
    const existing = tokens.get(ev.mint);
    const patch: Partial<Token> = {
      migrated: true,
      migratedAt: ts,
      pool: ev.pool || undefined,
      bondingPct: 1,
    };
    if (ev.name && !existing?.name) patch.name = ev.name;
    if (ev.symbol && !existing?.symbol) patch.symbol = ev.symbol;
    if (directImg && !existing?.imageUri) patch.imageUri = directImg;
    const t = upsert(ev.mint, patch);
    const metaUri = ev.uri || (!directImg ? ev.imageUri : undefined);
    if (metaUri && (!t.imageUri || !looksLikeImage(t.imageUri))) {
      resolveImageFromUri(ev.mint, metaUri).catch(() => {});
    }
    if (!migratedOrder.includes(ev.mint)) {
      migratedOrder.unshift(ev.mint);
      while (migratedOrder.length > MAX_MIGRATED) migratedOrder.pop();
    }
    return;
  }

  if (ev.txType === 'buy' || ev.txType === 'sell') {
    const directImg = ev.imageUri && looksLikeImage(ev.imageUri) ? ipfsToHttp(ev.imageUri) : ev.imageUri;
    const patch: Partial<Token> = {
      pool: ev.pool ?? undefined,
      vSolInBondingCurve: ev.vSolInBondingCurve ?? undefined,
      vTokensInBondingCurve: ev.vTokensInBondingCurve ?? undefined,
      marketCapSol: ev.marketCapSol ?? undefined,
      bondingPct: bondingPctFor(ev.pool, ev.vSolInBondingCurve),
    };
    // pumpapi ships name/symbol/uri/imageUri on most buy/sell events too — use them
    // so tokens we discover mid-stream (no `create` seen) still have full metadata.
    const existing = tokens.get(ev.mint);
    if (ev.name && !existing?.name) patch.name = ev.name;
    if (ev.symbol && !existing?.symbol) patch.symbol = ev.symbol;
    if (directImg && !existing?.imageUri) patch.imageUri = directImg;
    const t = upsert(ev.mint, patch);
    const metaUri = ev.uri || (!directImg ? ev.imageUri : undefined);
    if (metaUri && (!t.imageUri || !looksLikeImage(t.imageUri))) {
      resolveImageFromUri(ev.mint, metaUri).catch(() => {});
    }
    if (typeof ev.marketCapSol === 'number' && t.firstMarketCapSol == null) {
      t.firstMarketCapSol = ev.marketCapSol;
    }
    // If we see this token trading on a post-graduation AMM pool, mark migrated
    // even when we never received an explicit `migrate`/`createPool` event.
    if (!t.migrated && isMigratedPool(ev.pool)) {
      t.migrated = true;
      t.migratedAt = ts;
      t.bondingPct = 1;
      if (!migratedOrder.includes(ev.mint)) {
        migratedOrder.unshift(ev.mint);
        while (migratedOrder.length > MAX_MIGRATED) migratedOrder.pop();
      }
    }
    const solSize = typeof ev.solAmount === 'number' ? ev.solAmount
      : typeof ev.sol === 'number' ? ev.sol : 0;
    if (solSize > 0) t.solVolume = (t.solVolume ?? 0) + solSize;
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
  // SOL/USD price refresh
  refreshSolUsd();
  setInterval(refreshSolUsd, 60_000);
}

function serialize(t: Token) {
  let mcSol = t.marketCapSol;
  // Fallback: derive market cap from bonding curve reserves if pumpapi didn't
  // ship marketCapSol on the event. price/token = vSol/vTokens; MC = price × 1B.
  if ((!mcSol || mcSol <= 0) && t.vSolInBondingCurve && t.vTokensInBondingCurve) {
    mcSol = (t.vSolInBondingCurve / t.vTokensInBondingCurve) * STANDARD_SUPPLY;
  }
  const mcUsd = mcSol && solUsd ? mcSol * solUsd : undefined;
  const priceUsd = mcUsd ? mcUsd / STANDARD_SUPPLY : undefined;
  const liqSol = t.vSolInBondingCurve;
  const liqUsd = liqSol && solUsd ? liqSol * solUsd : undefined;
  const volSol = t.solVolume;
  const volUsd = volSol && solUsd ? volSol * solUsd : undefined;
  let pctChange: number | undefined;
  if (mcSol && t.firstMarketCapSol && t.firstMarketCapSol > 0) {
    pctChange = ((mcSol - t.firstMarketCapSol) / t.firstMarketCapSol) * 100;
  }
  return {
    mint: t.mint,
    name: t.name,
    symbol: t.symbol,
    imageUri: t.imageUri,
    pool: t.pool,
    launchpad: launchpadLabel(t.pool),
    vSolInBondingCurve: t.vSolInBondingCurve,
    marketCapSol: t.marketCapSol,
    marketCapUsd: mcUsd,
    priceUsd,
    pctChange,
    liquidityUsd: liqUsd,
    volumeUsd: volUsd,
    bondingPct: t.bondingPct,
    createdAt: t.createdAt ?? t.firstSeen,
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
  // bonding: any bonding-curve launchpad, not migrated, ≥ threshold, sorted desc
  return [...tokens.values()]
    .filter((t) => !t.migrated && isBondingPool(t.pool) && (t.bondingPct ?? 0) >= ALMOST_BOND_THRESHOLD && (t.bondingPct ?? 0) < 1)
    .sort((a, b) => (b.bondingPct ?? 0) - (a.bondingPct ?? 0))
    .slice(0, limit)
    .map(serialize);
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
