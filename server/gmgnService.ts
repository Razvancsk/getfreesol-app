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
  txns?: number;
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

function n(v: any): number | undefined {
  const x = Number(v);
  return Number.isFinite(x) ? x : undefined;
}

function mapToken(t: any): GmgnToken {
  // GMGN trenches uses string-encoded numbers for some fields
  const mcap = n(t.usd_market_cap ?? t.market_cap ?? t.fdv);
  const vol = n(t.volume_1h ?? t.volume_24h ?? t.volume ?? t.swaps_1h);
  const liq = n(t.liquidity ?? t.pool_liquidity);
  // GMGN trenches has no direct price field — compute from market_cap / total_supply
  const rawMcap = n(t.usd_market_cap ?? t.market_cap);
  const supply = n(t.total_supply);
  const price = (rawMcap && rawMcap > 0 && supply && supply > 0) ? rawMcap / supply : undefined;
  const buys = n(t.buys_1h ?? t.swaps_1h ?? t.buys_24h ?? t.buys) ?? 0;
  const sells = n(t.sells_1h ?? t.sells_24h ?? t.sells) ?? 0;
  const txns = n(t.swaps_1h ?? t.swaps_24h ?? t.swaps);
  const pctChange = n(t.price_change_percent ?? t.price_change_percent1h ?? t.price_change_percent24h);
  return {
    mint: t.address || t.mint || '',
    name: t.name || '',
    symbol: t.symbol || '',
    imageUri: t.logo || t.image || t.icon || '',
    priceUsd: price,
    pctChange,
    marketCapUsd: mcap,
    liquidityUsd: liq,
    volumeUsd: vol,
    buys: Number(buys) || 0,
    sells: Number(sells) || 0,
    txns: txns ?? undefined,
    createdAt: t.created_timestamp ? Number(t.created_timestamp) * 1000
             : (t.open_timestamp ? Number(t.open_timestamp) * 1000 : undefined),
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

    // Trenches — poll every cycle for near-live new tokens
    try {
      const data: any = await c.getTrenches('sol', ['new_creation', 'near_completion', 'completed']);
      const newArr: any[] = data?.new_creation || [];
      const bondArr: any[] = data?.near_completion || data?.pump || [];
      const migArr: any[] = data?.completed || [];
      if (newArr.length) { cache.new = newArr.map(mapToken).filter(t => t.mint); }
      if (bondArr.length) { cache.bonding = bondArr.map(mapToken).filter(t => t.mint); }
      if (migArr.length) { cache.migrated = migArr.map(mapToken).filter(t => t.mint); }
      console.log(`[gmgn] trenches: new=${newArr.length} bonding=${bondArr.length} migrated=${migArr.length}`);
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
  // Fetch info and security in parallel — rug_ratio, rat/bundler rates live in the security endpoint
  const [t, sec] = await Promise.all([
    getClient().getTokenInfo('sol', mint) as Promise<any>,
    getClient().getTokenSecurity('sol', mint).catch(() => null) as Promise<any>,
  ]);
  if (!t) throw new Error('not found');
  const mcap = t.price && t.circulating_supply
    ? Number(t.price) * Number(t.circulating_supply) : undefined;
  const n = (v: any) => (v != null ? Number(v) : undefined);
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
    bondingProgress: t.launchpad_progress != null ? Number(t.launchpad_progress) : undefined,
    smartDegens: Number(t.wallet_tags_stat?.smart_wallets) || 0,
    renownedWallets: Number(t.wallet_tags_stat?.renowned_wallets) || 0,
    // rug_ratio is top-level in security response, not in stat object of info response
    rugRatio: sec?.rug_ratio != null ? n(sec.rug_ratio) : n(t.stat?.rug_ratio),
    ratTraderRate: sec?.rat_trader_amount_rate != null ? n(sec.rat_trader_amount_rate) : n(t.stat?.top_rat_trader_percentage),
    bundlerRate: sec?.bundler_trader_amount_rate != null ? n(sec.bundler_trader_amount_rate) : n(t.stat?.top_bundler_trader_percentage),
    renouncedMint: sec?.renounced_mint,
    renouncedFreeze: sec?.renounced_freeze_account,
    top10HolderRate: sec?.top_10_holder_rate != null ? n(sec.top_10_holder_rate) : n(t.stat?.top_10_holder_rate),
    devAddress: t.dev?.creator_address || '',
    poolAddress: t.biggest_pool_address || t.pool?.pool_address || '',
    poolLiquidity: Number(t.pool?.liquidity || t.liquidity) || undefined,
    poolDex: t.pool?.exchange || '',
    stats24h: { priceChange: 0, numBuys: 0, numSells: 0, volume: 0 },
  };
}

export async function getTokenSecurity(mint: string): Promise<any> {
  return getClient().getTokenSecurity('sol', mint);
}

export async function getTokenKlineData(mint: string, resolution: string, limit: number): Promise<any[]> {
  try {
    const resMs: Record<string, number> = { '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000, '4h': 14400000, '1d': 86400000 };
    const ms = resMs[resolution] || 900000;
    const to = Date.now();
    const from = to - ms * limit;
    const data: any = await getClient().getTokenKline('sol', mint, resolution, from, to);
    const list: any[] = Array.isArray(data) ? data : (data?.list || []);
    return list.map((c: any) => ({
      t: Number(c.time || c.t) * 1000,
      o: Number(c.open || c.o) || 0,
      h: Number(c.high || c.h) || 0,
      l: Number(c.low || c.l) || 0,
      c: Number(c.close || c.c) || 0,
      v: Number(c.volume || c.v) || 0,
    }));
  } catch { return []; }
}

export async function getTokenLive(mint: string): Promise<any> {
  const now = Date.now();
  const from24h = now - 86400000;
  const [t, klines] = await Promise.all([
    getClient().getTokenInfo('sol', mint) as Promise<any>,
    getClient().getTokenKline('sol', mint, '1h', from24h, now).catch(() => null) as Promise<any>,
  ]);
  if (!t) return null;
  const mcap = t.price && t.circulating_supply
    ? Number(t.price) * Number(t.circulating_supply) : undefined;
  // Kline response: array of candles or { list: [...] }, each candle has { volume (USD), amount (tokens) }
  const klineArr: any[] = Array.isArray(klines) ? klines : (klines?.list || []);
  const volume24h = klineArr.length > 0
    ? klineArr.reduce((s: number, c: any) => s + (Number(c.volume) || 0), 0) || undefined
    : undefined;
  const buys24h = klineArr.length > 0
    ? klineArr.reduce((s: number, c: any) => s + (Number(c.buy_count) || Number(c.buys) || 0), 0)
    : 0;
  const sells24h = klineArr.length > 0
    ? klineArr.reduce((s: number, c: any) => s + (Number(c.sell_count) || Number(c.sells) || 0), 0)
    : 0;
  return {
    mint,
    name: t.name || '',
    symbol: t.symbol || '',
    priceUsd: Number(t.price) || undefined,
    marketCapUsd: mcap,
    liquidityUsd: Number(t.liquidity) || undefined,
    volumeUsd: volume24h,
    buys: buys24h,
    sells: sells24h,
    solUsd: solUsdPrice || undefined,
  };
}

export async function getTopTraders(mint: string): Promise<any[]> {
  try {
    const data: any = await getClient().getTokenTopTraders('sol', mint, { limit: 20, orderby: 'last_active_timestamp', direction: 'desc' });
    const arr: any[] = data?.list || (Array.isArray(data) ? data : []);
    return arr.map((h: any) => ({
      address: h.address || '',
      name: h.name || h.twitter_name || '',
      avatar: h.avatar || '',
      twitter: h.twitter_username || '',
      tags: Array.isArray(h.tags) ? h.tags : (h.tags ? [h.tags] : []),
      makerTags: Array.isArray(h.maker_token_tags) ? h.maker_token_tags : [],
      rank: h.wallet_tag_v2 || '',
      nativeBalance: Number(h.native_balance) || 0,
      lastActive: h.last_active_timestamp ? Number(h.last_active_timestamp) : null,
      // Current holdings
      balance: Number(h.amount_cur || h.balance || 0),
      usdValue: Number(h.usd_value) || 0,
      pct: Number(h.amount_percentage || 0),
      // Buy side
      buyVolume: Number(h.buy_volume_cur) || 0,
      buyCount: Number(h.buy_tx_count_cur) || 0,
      buyAmount: Number(h.buy_amount_cur) || 0,
      avgCost: Number(h.avg_cost) || 0,
      // Sell side
      sellVolume: Number(h.sell_volume_cur) || 0,
      sellCount: Number(h.sell_tx_count_cur) || 0,
      sellAmount: Number(h.sell_amount_cur) || 0,
      avgSold: Number(h.avg_sold) || 0,
      // P&L
      profit: Number(h.profit) || 0,
      realizedProfit: Number(h.realized_profit) || 0,
      unrealizedProfit: Number(h.unrealized_profit) || 0,
      profitChange: Number(h.profit_change) || 0,
      // Status
      startHolding: h.start_holding_at ? Number(h.start_holding_at) : null,
      endHolding: h.end_holding_at ? Number(h.end_holding_at) : null,
      sellRatio: Number(h.sell_amount_percentage) || 0,
      // Last trade: type from token_transfer, fallback inferred from sellRatio
      lastTradeType: h.token_transfer?.type || (h.end_holding_at ? 'sell' : (h.sell_amount_percentage >= 0.99 ? 'sell' : 'buy')),
      lastTradeUsd: Number(h.token_transfer?.cost_usd || h.token_transfer?.usd_value || 0),
      lastTradeTokenAmount: Number(h.token_transfer?.token_amount || h.token_transfer?.amount || 0),
      lastTradePrice: Number(h.token_transfer?.price || 0),
    }));
  } catch { return []; }
}

export async function getTopHolders(mint: string): Promise<any[]> {
  try {
    const data: any = await getClient().getTokenTopHolders('sol', mint, { limit: 20, orderby: 'amount_percentage', direction: 'desc' });
    const arr: any[] = data?.list || (Array.isArray(data) ? data : []);
    return arr.map((h: any) => ({
      address: h.address || '',
      name: h.name || '',
      amount: Number(h.amount_cur || h.balance || 0),
      uiAmount: Number(h.amount_cur || h.balance || 0),
      usdValue: Number(h.usd_value) || 0,
      pct: Number(h.amount_percentage || 0),
      tags: Array.isArray(h.tags) ? h.tags : (h.tags ? [h.tags] : []),
      makerTags: Array.isArray(h.maker_token_tags) ? h.maker_token_tags : [],
      label: Array.isArray(h.tags) ? h.tags.join(',') : (h.tags || ''),
      addrType: Number(h.addr_type) || 0,  // 0=wallet, 2=pool/exchange
      exchange: h.exchange || '',
      rank: h.wallet_tag_v2 || '',
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

function mapWallet(w: any, type: 'sm' | 'kol'): any {
  const address = w.address || w.wallet_address || w.wallet || w.addr || '';
  const name = w.name || w.nick_name || w.nickname || w.display_name || w.twitter_name || w.twitter_username || '';
  const twitter = w.twitter_username || w.twitter || '';
  return {
    address,
    name,
    twitter: twitter ? (twitter.startsWith('http') ? twitter : `https://x.com/${twitter}`) : '',
    avatar: w.avatar || w.icon || w.profile_image || '',
    tags: Array.isArray(w.tags) ? w.tags : [],
    profit7d: Number(w.realized_profit_7d) || 0,
    profit30d: Number(w.realized_profit_30d) || 0,
    winRate: Number(w.win_rate) || 0,
    txCount: Number(w.buy_30d || w.tx_count) || 0,
    followerCount: Number(w.follower_count) || 0,
  };
}

export async function getSmartMoneyWallets(limit = 20): Promise<any[]> {
  try {
    const data: any = await getClient().getSmartMoney('sol', limit);
    const arr: any[] = Array.isArray(data) ? data : (data?.list || data?.rank || data?.wallets || []);
    const mapped = arr.map((w: any) => mapWallet(w, 'sm')).filter((w: any) => w.address);
    console.log(`[gmgn] smart money: ${mapped.length} wallets`);
    return mapped;
  } catch (e: any) {
    console.error('[gmgn] smart money fetch failed:', e.message);
    return [];
  }
}

export async function getKolWallets(limit = 20): Promise<any[]> {
  try {
    const data: any = await getClient().getKol('sol', limit);
    const arr: any[] = Array.isArray(data) ? data : (data?.list || data?.rank || data?.wallets || []);
    const mapped = arr.map((w: any) => mapWallet(w, 'kol')).filter((w: any) => w.address);
    console.log(`[gmgn] kol: ${mapped.length} wallets`);
    return mapped;
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
