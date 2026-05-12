// GMGN Service — direct REST calls to https://openapi.gmgn.ai
// Auth: X-APIKEY header + timestamp & client_id query params (no signature needed for market/token routes)
import { randomUUID } from 'crypto';

const GMGN_HOST = 'https://openapi.gmgn.ai';

// SOL launchpad platforms (from gmgn-cli source)
const SOL_PLATFORMS = [
  'Pump.fun', 'pump_mayhem', 'pump_mayhem_agent', 'pump_agent',
  'letsbonk', 'bonkers', 'bags', 'memoo', 'liquid', 'bankr', 'zora',
  'surge', 'anoncoin', 'moonshot_app', 'wendotdev', 'heaven', 'sugar',
  'token_mill', 'believe', 'trendsfun', 'trends_fun', 'jup_studio',
  'Moonshot', 'boop', 'ray_launchpad', 'meteora_virtual_curve', 'xstocks',
];
const SOL_QUOTE_TYPES = [4, 5, 3, 1, 13, 0];

export interface GmgnToken {
  mint: string;
  name?: string;
  symbol?: string;
  imageUri?: string;
  priceUsd?: number;
  pctChange?: number;
  marketCapUsd?: number;
  liquidityUsd?: number;
  volumeUsd?: number;
  buys?: number;
  sells?: number;
  createdAt?: number;
  bondingPct?: number;
  migrated?: boolean;
  launchpad?: string;
  smartDegens?: number;
  renownedCount?: number;
  rugRatio?: number;
  ratTraderRate?: number;
  bundlerRate?: number;
}

interface FeedCache {
  new: GmgnToken[];
  bonding: GmgnToken[];
  migrated: GmgnToken[];
  trending: GmgnToken[];
}

const cache: FeedCache = { new: [], bonding: [], migrated: [], trending: [] };
let solUsdPrice = 0;
let connected = false;
let lastUpdate = 0;
let pollInterval: ReturnType<typeof setInterval> | null = null;

function getHeaders(): Record<string, string> {
  return {
    'X-APIKEY': process.env.GMGN_API_KEY || '',
    'Content-Type': 'application/json',
  };
}

function buildUrl(path: string, query: Record<string, any> = {}): string {
  const params = new URLSearchParams();
  params.set('timestamp', String(Math.floor(Date.now() / 1000)));
  params.set('client_id', randomUUID());
  for (const [k, v] of Object.entries(query)) {
    if (Array.isArray(v)) {
      for (const item of v) params.append(k, String(item));
    } else {
      params.set(k, String(v));
    }
  }
  return `${GMGN_HOST}${path}?${params}`;
}

async function gmgnGet(path: string, query: Record<string, any> = {}): Promise<any> {
  const url = buildUrl(path, query);
  const res = await fetch(url, {
    headers: getHeaders(),
    signal: AbortSignal.timeout(10000),
  });
  const json: any = await res.json();
  if (!res.ok || json?.code !== 0) {
    throw new Error(`GMGN ${res.status} ${path}: ${json?.message || json?.error || 'error'}`);
  }
  return json.data;
}

async function gmgnPost(path: string, query: Record<string, any> = {}, body: any): Promise<any> {
  const url = buildUrl(path, query);
  const res = await fetch(url, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const json: any = await res.json();
  if (!res.ok || json?.code !== 0) {
    throw new Error(`GMGN ${res.status} ${path}: ${json?.message || json?.error || 'error'}`);
  }
  return json.data;
}

function buildTrenchesBody(types: string[]): any {
  const section = {
    filters: ['offchain', 'onchain'],
    launchpad_platform: SOL_PLATFORMS,
    quote_address_type: SOL_QUOTE_TYPES,
    launchpad_platform_v2: true,
    limit: 50,
  };
  const body: any = { version: 'v2' };
  for (const type of types) {
    body[type] = { ...section };
  }
  return body;
}

function mapToken(t: any): GmgnToken {
  const mcap = Number(t.usd_market_cap ?? t.market_cap) || undefined;
  const vol = Number(t.volume_1h ?? t.volume ?? t.volume_24h) || undefined;
  return {
    mint: t.address || '',
    name: t.name || '',
    symbol: t.symbol || '',
    imageUri: t.logo || '',
    priceUsd: Number(t.price) || undefined,
    pctChange: t.price_change_percent != null ? Number(t.price_change_percent)
             : (t.price_change_percent1h != null ? Number(t.price_change_percent1h) : undefined),
    marketCapUsd: mcap,
    liquidityUsd: Number(t.liquidity) || undefined,
    volumeUsd: vol,
    buys: Number(t.buys_24h ?? t.buys) || 0,
    sells: Number(t.sells_24h ?? t.sells) || 0,
    createdAt: t.created_timestamp ? Number(t.created_timestamp) * 1000 : undefined,
    bondingPct: t.progress != null ? Number(t.progress) : undefined,
    migrated: !!(t.complete_timestamp && t.complete_timestamp > 0) || !!(t.open_timestamp && t.open_timestamp > 0),
    launchpad: t.launchpad_platform || t.launchpad || t.exchange || 'pump.fun',
    smartDegens: Number(t.smart_degen_count) || 0,
    renownedCount: Number(t.renowned_count) || 0,
    rugRatio: t.rug_ratio != null ? Number(t.rug_ratio) : undefined,
    ratTraderRate: t.rat_trader_amount_rate != null ? Number(t.rat_trader_amount_rate) : undefined,
    bundlerRate: t.bundler_trader_amount_rate != null ? Number(t.bundler_trader_amount_rate)
               : (t.bundler_rate != null ? Number(t.bundler_rate) : undefined),
  };
}

async function poll() {
  try {
    // Trenches: POST /v1/trenches — returns { new_creation, pump, completed }
    try {
      const data = await gmgnPost('/v1/trenches', { chain: 'sol' },
        buildTrenchesBody(['new_creation', 'near_completion', 'completed'])
      );
      const newArr: any[] = data?.new_creation || [];
      const bondArr: any[] = data?.pump || data?.near_completion || [];
      const migArr: any[] = data?.completed || [];
      if (newArr.length) cache.new = newArr.map(mapToken).filter(t => t.mint);
      if (bondArr.length) cache.bonding = bondArr.map(mapToken).filter(t => t.mint);
      if (migArr.length) cache.migrated = migArr.map(mapToken).filter(t => t.mint);
      console.log(`[gmgn] trenches: new=${newArr.length} bonding=${bondArr.length} migrated=${migArr.length}`);
    } catch (e: any) {
      console.error('[gmgn] trenches fetch failed:', e.message);
    }

    // Trending: GET /v1/market/rank — returns { rank: [...] }
    try {
      const data = await gmgnGet('/v1/market/rank', { chain: 'sol', interval: '1h', orderby: 'volume', direction: 'desc', limit: 50 });
      const arr: any[] = data?.rank || [];
      if (arr.length) cache.trending = arr.map(mapToken).filter(t => t.mint);
      console.log(`[gmgn] trending: ${arr.length} tokens`);
    } catch (e: any) {
      console.error('[gmgn] trending fetch failed:', e.message);
    }

    // SOL price from Jupiter
    try {
      const r = await fetch('https://price.jup.ag/v6/price?ids=SOL', { signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        const j: any = await r.json();
        if (j?.data?.SOL?.price) solUsdPrice = Number(j.data.SOL.price);
      }
    } catch {}

    connected = true;
    lastUpdate = Date.now();
  } catch (e: any) {
    console.error('[gmgn] poll error:', e.message);
    connected = false;
  }
}

export function startGmgnService() {
  if (pollInterval) return;
  if (!process.env.GMGN_API_KEY) {
    console.warn('[gmgn] GMGN_API_KEY not set — terminal feed will be empty');
  }
  console.log('[gmgn] Starting GMGN service (direct REST)...');
  poll();
  pollInterval = setInterval(poll, 30000);
}

export function getFeed(type: 'new' | 'bonding' | 'migrated', limit: number): GmgnToken[] {
  return cache[type].slice(0, limit);
}

export function getTrending(limit: number): GmgnToken[] {
  return cache.trending.slice(0, limit);
}

export function getStreamStatus() {
  return { connected, source: 'gmgn', lastUpdate };
}

export function getSolUsd(): number {
  return solUsdPrice;
}

export async function getTokenInfo(mint: string): Promise<any> {
  // GET /v1/token/info — returns token info object
  const t = await gmgnGet('/v1/token/info', { chain: 'sol', address: mint });
  if (!t) throw new Error('not found');
  const mcap = t.price && t.circulating_supply
    ? Number(t.price) * Number(t.circulating_supply) : undefined;
  return {
    id: mint,
    mint,
    name: t.name || '',
    symbol: t.symbol || '',
    icon: t.logo || '',
    usdPrice: Number(t.price) || undefined,
    mcap,
    fdv: Number(t.fdv) || mcap || undefined,
    liquidity: Number(t.liquidity) || undefined,
    holderCount: Number(t.holder_count) || undefined,
    twitter: t.link?.twitter_username ? `https://x.com/${t.link.twitter_username}` : (t.link?.twitter || ''),
    website: t.link?.website || '',
    telegram: t.link?.telegram || '',
    launchpad: t.launchpad_platform || '',
    bondingProgress: Number(t.launchpad_progress) || undefined,
    smartDegens: Number(t.wallet_tags_stat?.smart_wallets) || 0,
    renownedWallets: Number(t.wallet_tags_stat?.renowned_wallets) || 0,
    rugRatio: Number(t.stat?.rug_ratio) || undefined,
    ratTraderRate: Number(t.stat?.top_rat_trader_percentage) || undefined,
    bundlerRate: Number(t.stat?.top_bundler_trader_percentage) || undefined,
    stats24h: { priceChange: 0, numBuys: 0, numSells: 0, volume: 0 },
  };
}

export async function getTokenSecurity(mint: string): Promise<any> {
  return gmgnGet('/v1/token/security', { chain: 'sol', address: mint });
}

export async function getTokenLive(mint: string): Promise<any> {
  const t = await gmgnGet('/v1/token/info', { chain: 'sol', address: mint });
  if (!t) return null;
  const mcap = t.price && t.circulating_supply
    ? Number(t.price) * Number(t.circulating_supply) : undefined;
  return {
    mint,
    name: t.name || '',
    symbol: t.symbol || '',
    priceUsd: Number(t.price) || undefined,
    marketCapUsd: mcap,
    liquidityUsd: Number(t.liquidity) || undefined,
    buys: 0,
    sells: 0,
    solUsd: solUsdPrice || undefined,
  };
}

export async function getTopTraders(mint: string): Promise<any[]> {
  try {
    const data = await gmgnGet('/v1/market/token_top_traders', {
      chain: 'sol', address: mint, limit: 10, orderby: 'profit', direction: 'desc',
    });
    const arr: any[] = data?.list || (Array.isArray(data) ? data : []);
    return arr.map((h: any) => ({
      address: h.address || '',
      amount: Number(h.amount_cur || h.balance || 0),
      uiAmount: Number(h.amount_cur || h.balance || 0),
      label: Array.isArray(h.tags) ? h.tags.join(',') : (h.tags || ''),
      profit: Number(h.profit) || 0,
    }));
  } catch { return []; }
}

export async function getTopHolders(mint: string): Promise<any[]> {
  try {
    const data = await gmgnGet('/v1/market/token_top_holders', {
      chain: 'sol', address: mint, limit: 10, orderby: 'amount_percentage', direction: 'desc',
    });
    const arr: any[] = data?.list || (Array.isArray(data) ? data : []);
    return arr.map((h: any) => ({
      address: h.address || '',
      amount: Number(h.amount_cur || h.balance || 0),
      uiAmount: Number(h.amount_cur || h.balance || 0),
      pct: Number(h.amount_percentage || 0),
      label: Array.isArray(h.tags) ? h.tags.join(',') : (h.tags || ''),
      profit: Number(h.profit) || 0,
    }));
  } catch { return []; }
}
