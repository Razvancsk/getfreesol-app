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

let trendingTick = 0;

async function poll() {
  try {
    const c = getClient();

    // Trenches — poll every cycle (every 3s) for near-live new tokens
    try {
      const data: any = await c.getTrenches('sol', ['new_creation', 'near_completion', 'completed']);
      const newArr: any[] = data?.new_creation || [];
      const bondArr: any[] = data?.pump || [];
      const migArr: any[] = data?.completed || [];
      if (newArr.length) cache.new = newArr.map(mapToken).filter(t => t.mint);
      if (bondArr.length) cache.bonding = bondArr.map(mapToken).filter(t => t.mint);
      if (migArr.length) cache.migrated = migArr.map(mapToken).filter(t => t.mint);
    } catch (e: any) {
      console.error('[gmgn] trenches fetch failed:', e.message);
    }

    // Trending + SOL price — only every 10th cycle (~30s) since it changes slowly
    trendingTick++;
    if (trendingTick % 10 === 1) {
      try {
        const data: any = await c.getTrendingSwaps('sol', '1h', { orderby: 'volume', direction: 'desc', limit: 50 });
        const arr: any[] = data?.rank || (Array.isArray(data) ? data : []);
        if (arr.length) cache.trending = arr.map(mapToken).filter(t => t.mint);
        console.log(`[gmgn] trending: ${arr.length} tokens`);
      } catch (e: any) {
        console.error('[gmgn] trending fetch failed:', e.message);
      }

      try {
        const r = await fetch('https://price.jup.ag/v6/price?ids=SOL', { signal: AbortSignal.timeout(5000) });
        if (r.ok) {
          const j: any = await r.json();
          if (j?.data?.SOL?.price) solUsdPrice = Number(j.data.SOL.price);
        }
      } catch {}
    }

    connected = true;
    lastUpdate = Date.now();
    notifySse();
  } catch (e: any) {
    console.error('[gmgn] poll error:', e.message);
    connected = false;
  }
}

// SSE subscribers for push updates
const sseClients = new Set<(data: string) => void>();

export function addSseClient(send: (data: string) => void) {
  sseClients.add(send);
  return () => sseClients.delete(send);
}

function notifySse() {
  if (sseClients.size === 0) return;
  const payload = JSON.stringify({
    new: cache.new.slice(0, 50),
    bonding: cache.bonding.slice(0, 50),
    migrated: cache.migrated.slice(0, 50),
    trending: cache.trending.slice(0, 50),
    status: { connected, lastUpdate },
  });
  for (const send of sseClients) {
    try { send(payload); } catch { sseClients.delete(send); }
  }
}

export function startGmgnService() {
  if (pollInterval) return;
  if (!process.env.GMGN_API_KEY) {
    console.warn('[gmgn] GMGN_API_KEY not set — terminal feed will be empty');
  }
  console.log('[gmgn] Starting GMGN service (cooperation API via OpenApiClient)...');
  poll();
  pollInterval = setInterval(poll, 10000);
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

const SIGNAL_LABEL: Record<number, string> = {
  6: 'Price Spike', 7: 'New ATH', 8: 'Key Level', 11: 'CTO', 12: 'SM Buy', 13: 'Platform Call',
};

export async function getSignals(): Promise<any[]> {
  try {
    const data: any = await getClient().getTokenSignalV2('sol', [
      { signal_type: [12, 13, 6, 7, 11] },
    ]);
    const arr: any[] = Array.isArray(data) ? data : (data?.list || []);
    return arr.slice(0, 50).map((s: any) => ({
      mint: s.token_address || '',
      signalType: Number(s.signal_type),
      label: SIGNAL_LABEL[Number(s.signal_type)] || `Signal ${s.signal_type}`,
      triggerAt: s.trigger_at ? Number(s.trigger_at) * 1000 : Date.now(),
      triggerMcap: Number(s.trigger_mc) || 0,
      currentMcap: Number(s.market_cap) || 0,
      ath: Number(s.ath) || 0,
      times: Number(s.signal_times) || 1,
      liquidity: Number(s.cur_data?.liquidity) || 0,
      holderCount: Number(s.cur_data?.holder_count) || 0,
      name: (s.data as any)?.name || '',
      symbol: (s.data as any)?.symbol || '',
      imageUri: (s.data as any)?.logo || '',
    }));
  } catch (e: any) {
    console.error('[gmgn] signals fetch failed:', e.message);
    return [];
  }
}

export async function getSmartMoneyWallets(limit = 20): Promise<any[]> {
  try {
    const data: any = await getClient().getSmartMoney('sol', limit);
    const arr: any[] = Array.isArray(data) ? data : (data?.list || data?.wallets || []);
    return arr.map((w: any) => ({
      address: w.address || w.wallet_address || '',
      name: w.name || w.twitter_name || '',
      twitter: w.twitter_username ? `https://x.com/${w.twitter_username}` : '',
      avatar: w.avatar || '',
      tags: Array.isArray(w.tags) ? w.tags : [],
      profit7d: Number(w.realized_profit_7d) || 0,
      profit30d: Number(w.realized_profit_30d) || 0,
      winRate: Number(w.win_rate) || 0,
      txCount: Number(w.buy_30d || w.tx_count) || 0,
    }));
  } catch (e: any) {
    console.error('[gmgn] smart money fetch failed:', e.message);
    return [];
  }
}

export async function getKolWallets(limit = 20): Promise<any[]> {
  try {
    const data: any = await getClient().getKol('sol', limit);
    const arr: any[] = Array.isArray(data) ? data : (data?.list || data?.wallets || []);
    return arr.map((w: any) => ({
      address: w.address || w.wallet_address || '',
      name: w.name || w.twitter_name || '',
      twitter: w.twitter_username ? `https://x.com/${w.twitter_username}` : '',
      avatar: w.avatar || '',
      tags: Array.isArray(w.tags) ? w.tags : [],
      profit7d: Number(w.realized_profit_7d) || 0,
      followerCount: Number(w.follower_count) || 0,
    }));
  } catch (e: any) {
    console.error('[gmgn] kol fetch failed:', e.message);
    return [];
  }
}

export async function getWalletHoldings(address: string): Promise<any[]> {
  try {
    const data: any = await getClient().getWalletHoldings('sol', address, { limit: 50 });
    const arr: any[] = data?.holdings || (Array.isArray(data) ? data : []);
    return arr.map((h: any) => ({
      mint: h.token?.address || h.address || '',
      name: h.token?.name || '',
      symbol: h.token?.symbol || '',
      imageUri: h.token?.logo || '',
      balance: Number(h.balance) || 0,
      usdValue: Number(h.usd_value) || 0,
      priceUsd: Number(h.token?.price) || 0,
      profit: Number(h.realized_profit) || 0,
      unrealizedProfit: Number(h.unrealized_profit) || 0,
      avgCost: Number(h.avg_cost) || 0,
    }));
  } catch (e: any) {
    console.error('[gmgn] wallet holdings fetch failed:', e.message);
    return [];
  }
}

export async function getWalletStats(address: string): Promise<any> {
  try {
    const data: any = await getClient().getWalletStats('sol', [address], '30d');
    const s = Array.isArray(data) ? data[0] : (data?.stats || data);
    if (!s) return null;
    return {
      address,
      profit1d: Number(s.realized_profit_1d) || 0,
      profit7d: Number(s.realized_profit_7d) || 0,
      profit30d: Number(s.realized_profit_30d) || 0,
      winRate: Number(s.win_rate) || 0,
      totalBuys: Number(s.buy_30d) || 0,
      totalSells: Number(s.sell_30d) || 0,
    };
  } catch (e: any) {
    console.error('[gmgn] wallet stats fetch failed:', e.message);
    return null;
  }
}

export async function getWalletActivity(address: string): Promise<any[]> {
  try {
    const data: any = await getClient().getWalletActivity('sol', address, { limit: 20 });
    const arr: any[] = data?.activities || (Array.isArray(data) ? data : []);
    return arr.map((a: any) => ({
      signature: a.tx_hash || '',
      type: a.event_type || '',
      mint: a.token?.address || '',
      symbol: a.token?.symbol || '',
      imageUri: a.token?.logo || '',
      amount: Number(a.token_amount) || 0,
      usdValue: Number(a.cost_usd) || 0,
      timestamp: a.timestamp ? Number(a.timestamp) * 1000 : 0,
    }));
  } catch (e: any) {
    console.error('[gmgn] wallet activity fetch failed:', e.message);
    return [];
  }
}
