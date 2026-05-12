// GMGN Service — uses gmgn-cli subprocess for all data
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const execAsync = promisify(exec);

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

async function runGmgn(args: string): Promise<any> {
  const env = {
    ...process.env,
    PATH: `${process.cwd()}/node_modules/.bin:${process.env.PATH || ''}`,
  };
  const { stdout } = await execAsync(`gmgn-cli ${args}`, { timeout: 30000, env });
  const text = stdout.trim();
  if (!text) throw new Error('empty response from gmgn-cli');
  return JSON.parse(text);
}

function mapToken(t: any): GmgnToken {
  return {
    mint: t.address || '',
    name: t.name || '',
    symbol: t.symbol || '',
    imageUri: t.logo || '',
    priceUsd: Number(t.price) || undefined,
    pctChange: Number(t.price_change_percent ?? t.price_change_percent1h) || undefined,
    marketCapUsd: Number(t.usd_market_cap ?? t.market_cap) || undefined,
    liquidityUsd: Number(t.liquidity) || undefined,
    volumeUsd: Number(t.volume_1h ?? t.volume) || undefined,
    buys: Number(t.buys_24h ?? t.buys) || 0,
    sells: Number(t.sells_24h ?? t.sells) || 0,
    createdAt: t.created_timestamp ? Number(t.created_timestamp) * 1000 : undefined,
    migrated: !!(t.complete_timestamp || t.open_timestamp),
    launchpad: t.launchpad_platform || t.exchange || 'pump.fun',
    smartDegens: Number(t.smart_degen_count) || 0,
    renownedCount: Number(t.renowned_count) || 0,
    rugRatio: t.rug_ratio != null ? Number(t.rug_ratio) : undefined,
    ratTraderRate: t.rat_trader_amount_rate != null ? Number(t.rat_trader_amount_rate) : undefined,
    bundlerRate: t.bundler_trader_amount_rate != null ? Number(t.bundler_trader_amount_rate) : (t.bundler_rate != null ? Number(t.bundler_rate) : undefined),
  };
}

function setupConfig() {
  const apiKey = process.env.GMGN_API_KEY;
  if (!apiKey) {
    console.warn('[gmgn] GMGN_API_KEY not set — skipping config write');
    return;
  }
  try {
    const configDir = join(homedir(), '.config', 'gmgn');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, '.env'), `GMGN_API_KEY=${apiKey}\n`, { mode: 0o600 });
    console.log('[gmgn] Config written to ~/.config/gmgn/.env');
  } catch (e: any) {
    console.error('[gmgn] Failed to write config:', e.message);
  }
}

async function poll() {
  try {
    // All trenches categories in one call
    try {
      const j = await runGmgn(
        'market trenches --chain sol --type new_creation --type near_completion --type completed --limit 50 --raw'
      );
      const newArr: any[] = j?.data?.new_creation || [];
      const bondArr: any[] = j?.data?.pump || j?.data?.near_completion || [];
      const migArr: any[] = j?.data?.completed || [];
      if (newArr.length) cache.new = newArr.map(mapToken).filter(t => t.mint);
      if (bondArr.length) cache.bonding = bondArr.map(mapToken).filter(t => t.mint);
      if (migArr.length) cache.migrated = migArr.map(mapToken).filter(t => t.mint);
    } catch (e: any) {
      console.error('[gmgn] trenches fetch failed:', e.message);
    }

    // Trending
    try {
      const j = await runGmgn(
        'market trending --chain sol --interval 1h --order-by volume --limit 50 --raw'
      );
      const arr: any[] = j?.data?.rank || [];
      if (arr.length) cache.trending = arr.map(mapToken).filter(t => t.mint);
    } catch (e: any) {
      console.error('[gmgn] trending fetch failed:', e.message);
    }

    // SOL price from trending (first item with price, or keep last known)
    if (cache.trending.length === 0 && cache.migrated.length > 0) {
      // fallback: try to get SOL price from a simple fetch
      try {
        const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
          signal: AbortSignal.timeout(5000),
        });
        if (r.ok) {
          const cg: any = await r.json();
          if (cg?.solana?.usd) solUsdPrice = Number(cg.solana.usd);
        }
      } catch {}
    }

    connected = true;
    lastUpdate = Date.now();
    console.log(`[gmgn] Polled: new=${cache.new.length} bonding=${cache.bonding.length} migrated=${cache.migrated.length} trending=${cache.trending.length}`);
  } catch (e: any) {
    console.error('[gmgn] poll error:', e.message);
    connected = false;
  }
}

export function startGmgnService() {
  if (pollInterval) return;
  setupConfig();
  console.log('[gmgn] Starting GMGN service...');
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
  const j = await runGmgn(`token info --chain sol --address ${mint} --raw`);
  const t = j?.data || j;
  if (!t) throw new Error('not found');
  const mcap =
    t.price && t.circulating_supply
      ? Number(t.price) * Number(t.circulating_supply)
      : undefined;
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
    stats24h: {
      priceChange: 0,
      numBuys: 0,
      numSells: 0,
      volume: 0,
    },
  };
}

export async function getTokenSecurity(mint: string): Promise<any> {
  const j = await runGmgn(`token security --chain sol --address ${mint} --raw`);
  return j?.data || j;
}

export async function getTokenLive(mint: string): Promise<any> {
  const j = await runGmgn(`token info --chain sol --address ${mint} --raw`);
  const t = j?.data || j;
  if (!t) return null;
  const mcap =
    t.price && t.circulating_supply
      ? Number(t.price) * Number(t.circulating_supply)
      : undefined;
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
    const j = await runGmgn(
      `token traders --chain sol --address ${mint} --limit 10 --order-by profit --direction desc --raw`
    );
    const arr: any[] = j?.data?.list || j?.list || [];
    return arr.map((h: any) => ({
      address: h.address || '',
      amount: Number(h.amount_cur || h.balance || 0),
      uiAmount: Number(h.amount_cur || h.balance || 0),
      label: Array.isArray(h.tags) ? h.tags.join(',') : (h.tags || ''),
      profit: Number(h.profit) || 0,
    }));
  } catch {
    return [];
  }
}

export async function getTopHolders(mint: string): Promise<any[]> {
  try {
    const j = await runGmgn(
      `token holders --chain sol --address ${mint} --limit 10 --order-by amount_percentage --direction desc --raw`
    );
    const arr: any[] = j?.data?.list || j?.list || [];
    return arr.map((h: any) => ({
      address: h.address || '',
      amount: Number(h.amount_cur || h.balance || 0),
      uiAmount: Number(h.amount_cur || h.balance || 0),
      pct: Number(h.amount_percentage || 0),
      label: Array.isArray(h.tags) ? h.tags.join(',') : (h.tags || ''),
      profit: Number(h.profit) || 0,
    }));
  } catch {
    return [];
  }
}
