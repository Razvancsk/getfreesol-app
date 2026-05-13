// GMGN Service — uses OpenApiClient from gmgn-cli (cooperation API, no IP whitelist required)
import { OpenApiClient } from 'gmgn-cli/dist/client/OpenApiClient.js';

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
let client: OpenApiClient | null = null;

function getClient(): OpenApiClient {
  if (!client) {
    client = new OpenApiClient({
      apiKey: process.env.GMGN_API_KEY || '',
      host: 'https://openapi.gmgn.ai',
    });
  }
  return client;
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
    const c = getClient();

    // Trenches
    try {
      const data: any = await c.getTrenches('sol', ['new_creation', 'near_completion', 'completed']);
      const newArr: any[] = data?.new_creation || [];
      const bondArr: any[] = data?.pump || [];
      const migArr: any[] = data?.completed || [];
      if (newArr.length) cache.new = newArr.map(mapToken).filter(t => t.mint);
      if (bondArr.length) cache.bonding = bondArr.map(mapToken).filter(t => t.mint);
      if (migArr.length) cache.migrated = migArr.map(mapToken).filter(t => t.mint);
      console.log(`[gmgn] trenches: new=${newArr.length} bonding=${bondArr.length} migrated=${migArr.length}`);
    } catch (e: any) {
      console.error('[gmgn] trenches fetch failed:', e.message);
    }

    // Trending
    try {
      const data: any = await c.getTrendingSwaps('sol', '1h', { orderby: 'volume', direction: 'desc', limit: 50 });
      const arr: any[] = data?.rank || (Array.isArray(data) ? data : []);
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
  console.log('[gmgn] Starting GMGN service (cooperation API via OpenApiClient)...');
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
  const t: any = await getClient().getTokenInfo('sol', mint);
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
  return getClient().getTokenSecurity('sol', mint);
}

export async function getTokenLive(mint: string): Promise<any> {
  const t: any = await getClient().getTokenInfo('sol', mint);
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
    const data: any = await getClient().getTokenTopTraders('sol', mint, { limit: 10, orderby: 'profit', direction: 'desc' });
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
    const data: any = await getClient().getTokenTopHolders('sol', mint, { limit: 10, orderby: 'amount_percentage', direction: 'desc' });
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
