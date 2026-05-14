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
  tags?: string[];
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
// Persistent image cache so we don't re-fetch for tokens we already know
const imageCache = new Map<string, string>();
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

// Infer launchpad from Jupiter token — top-level launchpad field, then tags array, then mint suffix
function inferLaunchpad(t: any): string {
  if (t.launchpad) return t.launchpad;
  if (Array.isArray(t.tags) && t.tags.length > 0) return String(t.tags[0]);
  const mint: string = t.id || '';
  if (mint.endsWith('pump')) return 'pump.fun';
  return '';
}

// Map any Jupiter token response format to GmgnToken
function mapJupiterToken(t: any, overrideMigrated?: boolean): GmgnToken {
  const s1h = t.stats1h || {};
  const s24h = t.stats24h || {};
  const createdAt = t.firstPool?.createdAt ? new Date(t.firstPool.createdAt).getTime()
    : t.createdAt ? new Date(t.createdAt).getTime() : undefined;
  const buys = Number(s1h.numBuys ?? s24h.numBuys ?? 0);
  const sells = Number(s1h.numSells ?? s24h.numSells ?? 0);
  const volume = (Number(s24h.buyVolume ?? 0) + Number(s24h.sellVolume ?? 0))
    || (Number(s1h.buyVolume ?? 0) + Number(s1h.sellVolume ?? 0)) || undefined;
  return {
    mint: t.id || '',
    name: t.name || '',
    symbol: t.symbol || '',
    imageUri: t.icon || '',
    priceUsd: t.usdPrice ? Number(t.usdPrice) : undefined,
    pctChange: s1h.priceChange ?? s24h.priceChange ?? undefined,
    marketCapUsd: t.mcap ?? t.fdv ?? undefined,
    liquidityUsd: t.liquidity ?? undefined,
    volumeUsd: volume,
    buys,
    sells,
    txns: (buys + sells) || undefined,
    createdAt,
    bondingPct: undefined,
    migrated: overrideMigrated ?? !!(t.graduatedPool),
    launchpad: inferLaunchpad(t),
    tags: Array.isArray(t.tags) ? t.tags.map(String) : [],
    smartDegens: 0,
    renownedCount: 0,
  };
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
    bondingPct: t.launchpad_progress != null ? Number(t.launchpad_progress)
             : t.progress != null ? Number(t.progress) : undefined,
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

// Apply already-known images from cache, and store any new images we see
function applyImageCache(tokens: GmgnToken[]): GmgnToken[] {
  return tokens.map(t => {
    if (t.imageUri) { imageCache.set(t.mint, t.imageUri); return t; }
    if (imageCache.has(t.mint)) return { ...t, imageUri: imageCache.get(t.mint)! };
    return t;
  });
}


let trendingTick = 0;
let gmgnBackoff = 0;

function dedupeByMint(tokens: GmgnToken[]): GmgnToken[] {
  const seen = new Set<string>();
  return tokens.filter(t => { if (seen.has(t.mint)) return false; seen.add(t.mint); return true; });
}

// Batch-fetch Jupiter metadata for a list of mints; returns map mint→token
async function jupiterBatch(mints: string[], headers: Record<string, string>): Promise<Record<string, any>> {
  if (!mints.length) return {};
  const r = await fetch(
    `https://api.jup.ag/tokens/v2/search?query=${encodeURIComponent(mints.join(','))}`,
    { headers, signal: AbortSignal.timeout(10000) }
  );
  if (!r.ok) return {};
  const arr: any[] = await r.json();
  const out: Record<string, any> = {};
  for (const t of arr) if (t.id) out[t.id] = t;
  return out;
}

async function poll() {
  if (sseClients.size === 0 && cache.new.length > 0) return;

  const jupKey = process.env.JUPITER_API_KEY || '';
  const jupHeaders: Record<string, string> = { 'Accept': 'application/json' };
  if (jupKey) jupHeaders['x-api-key'] = jupKey;

  let anySuccess = false;

  // New tokens — Jupiter /tokens/v2/recent (newest, has launchpad tag)
  try {
    const r = await fetch('https://api.jup.ag/tokens/v2/recent', {
      headers: jupHeaders,
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const tokens: any[] = await r.json();
      const mapped = dedupeByMint(tokens.map(t => mapJupiterToken(t)).filter(t => t.mint));
      if (mapped.length) { cache.new = mapped; anySuccess = true; }
      console.log(`[jup] recent: ${mapped.length}`);
    }
  } catch (e: any) {
    console.error('[jup] recent failed:', e?.message);
  }

  // Bonding + Migrated: GMGN gives mint list + bondingPct, Jupiter provides all display data
  if (gmgnBackoff > 0) {
    gmgnBackoff -= 5000;
  } else {
    try {
      const c = getClient();
      const data: any = await c.getTrenches('sol', ['near_completion', 'completed']);
      const bondArr: any[] = data?.near_completion || data?.pump || [];
      const migArr: any[] = data?.completed || [];

      // Extract only what GMGN is used for: mint address + bondingPct + launchpad name
      const bondMints = bondArr
        .map((t: any) => ({
          mint: t.address || '',
          bondingPct: t.launchpad_progress != null ? Number(t.launchpad_progress)
            : t.progress != null ? Number(t.progress) : undefined,
          launchpad: t.launchpad_platform || t.launchpad || 'pump.fun',
        }))
        .filter(b => b.mint);

      const migMints = migArr
        .map((t: any) => ({ mint: t.address || '', launchpad: t.launchpad_platform || t.launchpad || 'pump.fun' }))
        .filter(m => m.mint);

      // Jupiter batch — .catch so a network error never kills the bonding cache
      const [bondJup, migJup] = await Promise.all([
        jupiterBatch(bondMints.map(b => b.mint), jupHeaders).catch(() => ({} as Record<string, any>)),
        jupiterBatch(migMints.map(m => m.mint), jupHeaders).catch(() => ({} as Record<string, any>)),
      ]);

      if (bondMints.length) {
        cache.bonding = dedupeByMint(bondMints.map(b => {
          const jt = bondJup[b.mint];
          const base: GmgnToken = jt
            ? mapJupiterToken(jt)
            : { mint: b.mint, launchpad: b.launchpad } as GmgnToken;
          return { ...base, bondingPct: b.bondingPct, migrated: false, launchpad: base.launchpad || b.launchpad };
        }));
        anySuccess = true;
        console.log(`[gmgn+jup] bonding: ${cache.bonding.length} (jup: ${Object.keys(bondJup).length})`);
      }

      if (migMints.length) {
        cache.migrated = dedupeByMint(migMints.map(m => {
          const jt = migJup[m.mint];
          const base: GmgnToken = jt
            ? mapJupiterToken(jt)
            : { mint: m.mint, launchpad: m.launchpad } as GmgnToken;
          return { ...base, migrated: true, launchpad: base.launchpad || m.launchpad };
        }));
        anySuccess = true;
        console.log(`[gmgn+jup] migrated: ${cache.migrated.length} (jup: ${Object.keys(migJup).length})`);
      }
    } catch (e: any) {
      const msg = e?.apiError || e?.message || '';
      if (msg.includes('RATE_LIMIT')) {
        gmgnBackoff = 30000;
        console.warn('[gmgn] rate limited — backing off 30s');
      } else {
        console.error('[gmgn] trenches failed:', msg);
      }
    }
  }

  // SOL price from Jupiter — every 10th cycle (~50s)
  trendingTick++;
  if (trendingTick % 10 === 1) {
    try {
      const pr = await fetch(
        'https://api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112',
        { headers: jupHeaders, signal: AbortSignal.timeout(5000) }
      );
      if (pr.ok) {
        const pd: any = await pr.json();
        const p = Number(pd?.data?.['So11111111111111111111111111111111111111112']?.price || 0);
        if (p > 0) solUsdPrice = p;
      }
    } catch {}
  }

  if (anySuccess) {
    connected = true;
    lastUpdate = Date.now();
    notifySse();
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
  pollInterval = setInterval(poll, 5000);
}

export function getFeed(type: 'new' | 'bonding' | 'migrated', limit: number): GmgnToken[] {
  return cache[type].slice(0, limit);
}

export interface TrenchFilters {
  minLiquidity?: number; maxLiquidity?: number;
  minVolume?: number; maxVolume?: number;
  minBuys?: number; maxBuys?: number;
  minSells?: number; maxSells?: number;
  minTxns?: number; maxTxns?: number;
  minSmartMoney?: number; maxSmartMoney?: number;
  minKols?: number; maxKols?: number;
  minHolders?: number; maxHolders?: number;
  minRugRatio?: number; maxRugRatio?: number;
}

export async function fetchFilteredTrenches(
  type: 'new' | 'bonding' | 'migrated',
  filters: TrenchFilters,
  limit = 80
): Promise<GmgnToken[]> {
  const c = getClient();
  const gmgnType = type === 'new' ? 'new_creation' : type === 'bonding' ? 'near_completion' : 'completed';
  const params: Record<string, number> = {};
  if (filters.minLiquidity != null) params.min_liquidity = filters.minLiquidity;
  if (filters.maxLiquidity != null) params.max_liquidity = filters.maxLiquidity;
  if (filters.minVolume != null) params.min_volume_24h = filters.minVolume;
  if (filters.maxVolume != null) params.max_volume_24h = filters.maxVolume;
  if (filters.minBuys != null) params.min_buys_24h = filters.minBuys;
  if (filters.maxBuys != null) params.max_buys_24h = filters.maxBuys;
  if (filters.minSells != null) params.min_sells_24h = filters.minSells;
  if (filters.maxSells != null) params.max_sells_24h = filters.maxSells;
  if (filters.minTxns != null) params.min_swaps_24h = filters.minTxns;
  if (filters.maxTxns != null) params.max_swaps_24h = filters.maxTxns;
  if (filters.minSmartMoney != null) params.min_smart_degen_count = filters.minSmartMoney;
  if (filters.maxSmartMoney != null) params.max_smart_degen_count = filters.maxSmartMoney;
  if (filters.minKols != null) params.min_renowned_count = filters.minKols;
  if (filters.maxKols != null) params.max_renowned_count = filters.maxKols;
  if (filters.minHolders != null) params.min_holder_count = filters.minHolders;
  if (filters.maxHolders != null) params.max_holder_count = filters.maxHolders;
  if (filters.minRugRatio != null) params.min_rug_ratio = filters.minRugRatio / 100;
  if (filters.maxRugRatio != null) params.max_rug_ratio = filters.maxRugRatio / 100;
  const data: any = await c.getTrenches('sol', [gmgnType], [], limit, params);
  const raw: any[] = data?.[gmgnType] || [];
  return applyImageCache(raw.map(mapToken).filter(t => t.mint));
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
  const [t, sec] = await Promise.all([
    getClient().getTokenInfo('sol', mint) as Promise<any>,
    getClient().getTokenSecurity('sol', mint).catch(() => null) as Promise<any>,
  ]);
  if (!t) throw new Error('not found');
  const n = (v: any) => (v != null ? Number(v) : undefined);
  // t.price is an object { price, price_24h, buys_24h, ... } not a scalar
  const priceObj = (t.price && typeof t.price === 'object') ? t.price : {};
  const priceNum = Number(priceObj.price) || undefined;
  const circulatingSupply = Number(t.circulating_supply) || 0;
  const mcap = priceNum && circulatingSupply ? priceNum * circulatingSupply : undefined;
  const price24h = Number(priceObj.price_24h) || 0;
  const priceChange24h = (price24h > 0 && priceNum) ? ((priceNum - price24h) / price24h) * 100 : 0;
  const twitterRaw = t.link?.twitter_username || '';
  const twitter = twitterRaw
    ? (twitterRaw.startsWith('http') ? twitterRaw : `https://x.com/${twitterRaw}`)
    : (t.link?.twitter || '');
  return {
    id: mint,
    mint,
    name: t.name || '',
    symbol: t.symbol || '',
    icon: t.logo || '',
    usdPrice: priceNum,
    mcap,
    fdv: mcap || undefined,
    liquidity: Number(t.liquidity) || undefined,
    holderCount: Number(t.holder_count) || undefined,
    twitter,
    website: t.link?.website || '',
    telegram: t.link?.telegram || '',
    launchpad: t.launchpad_platform || '',
    bondingProgress: t.launchpad_progress != null ? Number(t.launchpad_progress) : undefined,
    smartDegens: Number(t.wallet_tags_stat?.smart_wallets) || 0,
    renownedWallets: Number(t.wallet_tags_stat?.renowned_wallets) || 0,
    rugRatio: undefined,
    ratTraderRate: n(t.stat?.top_rat_trader_percentage),
    bundlerRate: n(t.stat?.top_bundler_trader_percentage),
    renouncedMint: sec?.renounced_mint,
    renouncedFreeze: sec?.renounced_freeze_account,
    top10HolderRate: sec?.top_10_holder_rate != null ? n(sec.top_10_holder_rate) : n(t.stat?.top_10_holder_rate),
    devAddress: t.dev?.creator_address || '',
    poolAddress: t.biggest_pool_address || t.pool?.pool_address || '',
    poolLiquidity: Number(t.pool?.liquidity || t.liquidity) || undefined,
    poolDex: t.pool?.exchange || '',
    audit: {
      mintAuthorityDisabled: sec?.renounced_mint ?? false,
      freezeAuthorityDisabled: sec?.renounced_freeze_account ?? false,
      topHoldersPercentage: sec?.top_10_holder_rate != null ? Number(sec.top_10_holder_rate) * 100 : null,
      devBalancePercentage: Number(t.stat?.creator_hold_rate || t.stat?.dev_team_hold_rate || 0) * 100,
    },
    stats24h: {
      priceChange: priceChange24h,
      numBuys: Number(priceObj.buys_24h) || 0,
      numSells: Number(priceObj.sells_24h) || 0,
      volume: Number(priceObj.volume_24h) || 0,
    },
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
  const priceObj = (t.price && typeof t.price === 'object') ? t.price : {};
  const priceNum = Number(priceObj.price) || undefined;
  const circulatingSupply = Number(t.circulating_supply) || 0;
  const mcap = priceNum && circulatingSupply ? priceNum * circulatingSupply : undefined;
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
    priceUsd: priceNum,
    marketCapUsd: mcap,
    liquidityUsd: Number(t.liquidity) || undefined,
    volumeUsd: volume24h,
    buys: buys24h,
    sells: sells24h,
    solUsd: solUsdPrice || undefined,
    bondingPct: t.launchpad_progress != null ? Number(t.launchpad_progress)
              : t.progress != null ? Number(t.progress) : undefined,
    migrated: !!(t.complete_timestamp && t.complete_timestamp > 0) || !!(t.open_timestamp && t.open_timestamp > 0),
    imageUri: t.logo || t.image || t.icon || undefined,
  };
}

export async function getTopTraders(mint: string): Promise<any[]> {
  try {
    const data: any = await getClient().getTokenTopTraders('sol', mint, { limit: 20, orderby: 'last_active_timestamp', direction: 'desc' });
    const arr: any[] = data?.list || (Array.isArray(data) ? data : []);
    return arr.map((h: any) => {
      // Sold everything = net seller; still holds = net buyer
      const soldAll = !!(h.end_holding_at && Number(h.end_holding_at) > 0)
        || Number(h.sell_amount_percentage ?? h.sell_ratio ?? 0) >= 0.99;
      const ttType: string = h.token_transfer?.event_type || h.token_transfer?.type || '';
      const lastType = ttType.includes('sell') ? 'sell' : ttType.includes('buy') ? 'buy' : (soldAll ? 'sell' : 'buy');

      // Try multiple field name variants GMGN uses across API versions
      const buyVol = Number(h.buy_volume_cur ?? h.buy_volume_usd ?? h.buy_volume ?? h.total_buy_usd ?? 0);
      const buyCnt = Number(h.buy_tx_count_cur ?? h.buy_count ?? h.buy_tx_count ?? 0);
      const buyAmt = Number(h.buy_amount_cur ?? h.buy_amount ?? h.buy_token_amount ?? 0);
      const sellVol = Number(h.sell_volume_cur ?? h.sell_volume_usd ?? h.sell_volume ?? h.total_sell_usd ?? 0);
      const sellCnt = Number(h.sell_tx_count_cur ?? h.sell_count ?? h.sell_tx_count ?? 0);
      const sellAmt = Number(h.sell_amount_cur ?? h.sell_amount ?? h.sell_token_amount ?? 0);

      return {
        address: h.address || '',
        name: h.name || h.twitter_name || '',
        avatar: h.avatar || '',
        twitter: h.twitter_username || '',
        tags: Array.isArray(h.tags) ? h.tags : (h.tags ? [h.tags] : []),
        makerTags: Array.isArray(h.maker_token_tags) ? h.maker_token_tags : [],
        rank: h.wallet_tag_v2 || '',
        nativeBalance: Number(h.native_balance) || 0,
        lastActive: h.last_active_timestamp ? Number(h.last_active_timestamp) : (h.start_holding_at ? Number(h.start_holding_at) : null),
        balance: Number(h.amount_cur ?? h.balance ?? 0),
        usdValue: Number(h.usd_value) || 0,
        pct: Number(h.amount_percentage ?? 0),
        buyVolume: buyVol,
        buyCount: buyCnt,
        buyAmount: buyAmt,
        avgCost: Number(h.avg_cost ?? 0),
        sellVolume: sellVol,
        sellCount: sellCnt,
        sellAmount: sellAmt,
        avgSold: Number(h.avg_sold ?? 0),
        profit: Number(h.profit) || 0,
        realizedProfit: Number(h.realized_profit) || 0,
        unrealizedProfit: Number(h.unrealized_profit) || 0,
        profitChange: Number(h.profit_change) || 0,
        startHolding: h.start_holding_at ? Number(h.start_holding_at) : null,
        endHolding: h.end_holding_at ? Number(h.end_holding_at) : null,
        sellRatio: Number(h.sell_amount_percentage ?? h.sell_ratio ?? 0),
        lastTradeType: lastType,
        lastTradeUsd: Number(h.token_transfer?.cost_usd ?? h.token_transfer?.usd_value ?? 0),
        lastTradeTokenAmount: Number(h.token_transfer?.token_amount ?? h.token_transfer?.amount ?? 0),
        lastTradePrice: Number(h.token_transfer?.price ?? 0),
      };
    });
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

function mapWalletFromTx(tx: any, _type: 'sm' | 'kol'): any {
  // API returns transactions; wallet address is in `maker`, profile in `maker_info`
  const address = tx.maker || tx.address || tx.wallet_address || '';
  const info = tx.maker_info || {};
  const name = info.name || info.nick_name || info.twitter_name || info.twitter_username || '';
  const twitter = info.twitter_username || info.twitter || '';
  return {
    address,
    name,
    twitter: twitter ? (twitter.startsWith('http') ? twitter : `https://x.com/${twitter}`) : '',
    avatar: info.avatar || info.icon || info.profile_image || '',
    tags: Array.isArray(info.tags) ? info.tags : [],
    profit7d: Number(info.realized_profit_7d) || 0,
    profit30d: Number(info.realized_profit_30d) || 0,
    winRate: Number(info.win_rate) || 0,
    txCount: Number(info.buy_30d || info.tx_count) || 0,
    followerCount: Number(info.follower_count) || 0,
  };
}

function dedupeWallets(wallets: any[]): any[] {
  const seen = new Set<string>();
  return wallets.filter(w => {
    if (!w.address || seen.has(w.address)) return false;
    seen.add(w.address);
    return true;
  });
}

async function enrichWithStats(wallets: any[]): Promise<any[]> {
  const results = await Promise.allSettled(
    wallets.map(async (w) => {
      try {
        const stats: any = await getClient().getWalletStats('sol', w.address, '7d');
        return {
          ...w,
          profit7d: Number(stats?.realized_profit) || 0,
          winRate: Number(stats?.pnl_stat?.winrate) || 0,
          txCount: (Number(stats?.buy) || 0) + (Number(stats?.sell) || 0),
          name: w.name || stats?.common?.name || stats?.common?.nick_name || '',
          avatar: w.avatar || stats?.common?.avatar || '',
          tags: w.tags?.length ? w.tags : (stats?.common?.tags || []),
        };
      } catch {
        return w;
      }
    })
  );
  return results.map((r) => (r.status === 'fulfilled' ? r.value : null)).filter(Boolean);
}

export async function getSmartMoneyWallets(limit = 20): Promise<any[]> {
  try {
    const data: any = await getClient().getSmartMoney('sol', limit);
    const arr: any[] = Array.isArray(data) ? data : (data?.list || data?.rank || data?.wallets || []);
    const mapped = dedupeWallets(arr.map((w: any) => mapWalletFromTx(w, 'sm')).filter((w: any) => w.address));
    const enriched = await enrichWithStats(mapped.slice(0, 20));
    console.log(`[gmgn] smart money: ${enriched.length} wallets`);
    return enriched;
  } catch (e: any) {
    console.error('[gmgn] smart money fetch failed:', e.message);
    return [];
  }
}

export async function getKolWallets(limit = 20): Promise<any[]> {
  try {
    const data: any = await getClient().getKol('sol', limit);
    const arr: any[] = Array.isArray(data) ? data : (data?.list || data?.rank || data?.wallets || []);
    const mapped = dedupeWallets(arr.map((w: any) => mapWalletFromTx(w, 'kol')).filter((w: any) => w.address));
    const enriched = await enrichWithStats(mapped.slice(0, 20));
    console.log(`[gmgn] kol: ${enriched.length} wallets`);
    return enriched;
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

// Returns traders sorted by last_active_timestamp — each entry's token_transfer is their most recent trade.
// Client polls this every 3s and detects new/updated entries to build a live trade feed.
export async function getTokenRecentTrades(mint: string): Promise<any[]> {
  try {
    const data: any = await getClient().getTokenTopTraders('sol', mint, {
      limit: 30, orderby: 'last_active_timestamp', direction: 'desc',
    });
    const arr: any[] = data?.list || (Array.isArray(data) ? data : []);
    return arr
      .filter((h: any) => h.token_transfer && (Number(h.token_transfer.cost_usd ?? h.token_transfer.usd_value ?? 0) > 0 || Number(h.token_transfer.token_amount ?? h.token_transfer.amount ?? 0) > 0))
      .map((h: any) => {
        const tt = h.token_transfer;
        const rawType: string = (tt.event_type || tt.type || tt.side || '').toString().toLowerCase();
        const type = rawType.includes('sell') || rawType.includes('transfer_out') || rawType === 'out' || rawType === 's' || rawType === '2' ? 'sell' : 'buy';
        const lastActiveTs = h.last_active_timestamp ? Number(h.last_active_timestamp) * 1000 : 0;
        return {
          walletAddress: h.address || '',
          walletName: h.name || h.twitter_name || '',
          tags: Array.isArray(h.tags) ? h.tags : (h.tags ? [h.tags] : []),
          type,
          usdValue: Number(tt.cost_usd ?? tt.usd_value ?? 0),
          price: Number(tt.price ?? 0),
          tokenAmount: Number(tt.token_amount ?? tt.amount ?? 0),
          timestamp: lastActiveTs,
          signature: tt.tx_hash || tt.hash || tt.signature || tt.txid || tt.transaction_hash || '',
        };
      });
  } catch (e: any) {
    console.error('[gmgn] token recent trades failed:', e.message);
    return [];
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

export async function getTokenPoolInfo(mint: string): Promise<any> {
  try {
    const data: any = await getClient().getTokenPoolInfo('sol', mint);
    if (!data) return null;
    return {
      poolAddress: data.pool_address || data.address || '',
      dex: data.exchange || data.dex || '',
      liquidity: Number(data.liquidity) || 0,
      price: Number(data.price) || 0,
      volume24h: Number(data.volume_24h) || 0,
      priceChange24h: Number(data.price_change_percent24h) || 0,
      baseReserve: Number(data.base_reserve) || 0,
      quoteReserve: Number(data.quote_reserve) || 0,
      createdAt: data.created_at ? Number(data.created_at) * 1000 : 0,
    };
  } catch (e: any) {
    console.error('[gmgn] token pool fetch failed:', e.message);
    return null;
  }
}

export async function getWalletTokenBalance(walletAddress: string, tokenAddress: string): Promise<any> {
  try {
    const data: any = await getClient().getWalletTokenBalance('sol', walletAddress, tokenAddress);
    if (!data) return null;
    return {
      balance: Number(data.balance) || 0,
      usdValue: Number(data.usd_value) || 0,
      price: Number(data.price) || 0,
      profit: Number(data.realized_profit) || 0,
      unrealizedProfit: Number(data.unrealized_profit) || 0,
      avgCost: Number(data.avg_cost) || 0,
    };
  } catch (e: any) {
    console.error('[gmgn] wallet token balance fetch failed:', e.message);
    return null;
  }
}

export async function getCreatedTokens(walletAddress: string): Promise<any[]> {
  try {
    const data: any = await getClient().getCreatedTokens('sol', walletAddress, { limit: 20, orderby: 'created_timestamp', direction: 'desc' });
    const arr: any[] = data?.tokens || (Array.isArray(data) ? data : []);
    return arr.map((t: any) => ({
      mint: t.address || t.mint || '',
      name: t.name || '',
      symbol: t.symbol || '',
      imageUri: t.logo || '',
      priceUsd: Number(t.price) || 0,
      marketCapUsd: Number(t.market_cap) || 0,
      athMarketCap: Number(t.ath_market_cap) || 0,
      createdAt: t.created_timestamp ? Number(t.created_timestamp) * 1000 : 0,
      migrated: !!t.complete_timestamp,
    }));
  } catch (e: any) {
    console.error('[gmgn] created tokens fetch failed:', e.message);
    return [];
  }
}

export async function getUserInfo(): Promise<any> {
  try {
    const data: any = await getClient().getUserInfo();
    if (!data) return null;
    return {
      userId: data.user_id || '',
      wallets: Array.isArray(data.wallets) ? data.wallets.map((w: any) => ({
        address: w.address || '',
        chain: w.chain || 'sol',
        balance: Number(w.balance) || 0,
      })) : [],
    };
  } catch (e: any) {
    console.error('[gmgn] user info fetch failed:', e.message);
    return null;
  }
}

export async function getFollowWalletActivity(limit = 20): Promise<any[]> {
  try {
    const data: any = await getClient().getFollowWallet('sol', { limit });
    const arr: any[] = Array.isArray(data) ? data : (data?.list || data?.activities || []);
    return arr.map((tx: any) => ({
      maker: tx.maker || '',
      makerName: tx.maker_info?.name || tx.maker_info?.nick_name || '',
      makerAvatar: tx.maker_info?.avatar || '',
      makerTags: Array.isArray(tx.maker_info?.tags) ? tx.maker_info.tags : [],
      mint: tx.base_address || '',
      tokenSymbol: tx.base_token?.symbol || '',
      tokenLogo: tx.base_token?.logo || '',
      side: tx.side || '',
      amountUsd: Number(tx.amount_usd) || 0,
      tokenAmount: Number(tx.token_amount || tx.base_amount) || 0,
      price: Number(tx.price_usd) || 0,
      timestamp: tx.timestamp ? Number(tx.timestamp) * 1000 : 0,
      signature: tx.transaction_hash || '',
    }));
  } catch (e: any) {
    console.error('[gmgn] follow wallet fetch failed:', e.message);
    return [];
  }
}
