/**
 * Phoenix Perpetuals — Rise SDK streams + HTTP client
 * https://perp-api.phoenix.trade  |  @ellipsis-labs/rise
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWalletAdapter } from '@/hooks/useWalletAdapter';
import { Transaction } from '@solana/web3.js';
import { Side, createPhoenixClient } from '@ellipsis-labs/rise';
import { Link } from 'wouter';
import {
  ArrowLeft, Activity, TrendingUp, TrendingDown,
  RefreshCw, Key, User, ChevronDown, Search, X,
} from 'lucide-react';
import {
  ComposedChart, Area, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';

const logoImage       = '/logo.png';
const PHOENIX_API_URL = 'https://perp-api.phoenix.trade';
const BUILDER_AUTHORITY = 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT';

const TIMEFRAMES = [
  { label: '1m',  s: '60',    ws: '1m'  },
  { label: '5m',  s: '300',   ws: '5m'  },
  { label: '15m', s: '900',   ws: '15m' },
  { label: '1H',  s: '3600',  ws: '1h'  },
  { label: '4H',  s: '14400', ws: '4h'  },
  { label: '1D',  s: '86400', ws: '1d'  },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripPerp(s: string) { return s.replace(/-PERP$/i, ''); }
function addPerp(s: string)   { return s.endsWith('-PERP') ? s : s + '-PERP'; }
function toNum(v: unknown): number { return parseFloat(String(v ?? '0')) || 0; }
function pf(n: unknown): number    { return parseFloat(String(n ?? '0')) || 0; }

function fp(p: number | null | undefined): string {
  if (p == null || !isFinite(p)) return '—';
  const d = p >= 10000 ? 1 : p >= 100 ? 2 : 4;
  return '$' + p.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fn(p: number | null | undefined): string {
  if (p == null || !isFinite(p)) return '—';
  const d = p >= 10000 ? 1 : p >= 100 ? 2 : 4;
  return p.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fUSD(n: unknown): string {
  const v = typeof n === 'number' ? n : pf(n);
  if (!isFinite(v)) return '—';
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 1e9) return sign + '$' + (a / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return sign + '$' + (a / 1e3).toFixed(1) + 'K';
  return (v < 0 ? '-$' : '$') + a.toFixed(2);
}
function fTime(ts: number, tfSecs: string): string {
  const d = new Date(ts * 1000);
  return Number(tfSecs) >= 86400
    ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface MarketStats {
  markPx: number; midPx: number; oraclePx: number;
  prevDayPx: number; dayNtlVlm: number; openInterest: number; funding: number;
}
interface OB { bids: [number, number][]; asks: [number, number][]; mid: number | null; }
interface FundingRate { rate: number; nextRate: number | null; }

function toOBRow(r: any): [number, number] {
  if (Array.isArray(r)) return [toNum(r[0]), toNum(r[1])];
  return [toNum(r.price ?? r.px), toNum(r.size ?? r.qty)];
}

// ── Market list helpers ───────────────────────────────────────────────────────

const COMMODITY_SYMS = new Set(['GOLD', 'SILVER', 'WTIOIL', 'BRENT', 'NG', 'COPPER']);

function TokenAvatar({ symbol, size = 24 }: { symbol: string; size?: number }) {
  // Inline SVGs for main Phoenix perps tokens
  if (symbol === 'SOL') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0 rounded-full">
      <path d="M18.4126 7.90343C18.3001 8.00469 18.1539 8.06656 18.002 8.06656H3.57988C3.06801 8.06656 2.80928 7.48159 3.16364 7.13847L5.5317 4.85478C5.6442 4.7479 5.79045 4.68604 5.94231 4.68604H20.4207C20.9382 4.68604 21.1913 5.27664 20.8313 5.61975L18.4126 7.90343Z" fill="url(#solG0)"/>
      <path d="M18.4126 19.1565C18.3001 19.2576 18.1539 19.314 18.002 19.314H3.57988C3.06801 19.314 2.80928 18.7345 3.16364 18.3914L5.5317 16.102C5.6442 15.9952 5.79045 15.939 5.94231 15.939H20.4207C20.9382 15.939 21.1913 16.5239 20.8313 16.8671L18.4126 19.1565Z" fill="url(#solG1)"/>
      <path d="M18.4126 10.4715C18.3001 10.3703 18.1539 10.314 18.002 10.314H3.57988C3.06801 10.314 2.80928 10.8933 3.16364 11.2365L5.5317 13.5259C5.6442 13.627 5.79045 13.6889 5.94231 13.6889H20.4207C20.9382 13.6889 21.1913 13.1039 20.8313 12.7608L18.4126 10.4715Z" fill="url(#solG2)"/>
      <defs>
        <linearGradient id="solG0" x1="3" y1="16.3" x2="21.4" y2="15.6" gradientUnits="userSpaceOnUse"><stop stopColor="#599DB0"/><stop offset="1" stopColor="#47F8C3"/></linearGradient>
        <linearGradient id="solG1" x1="3" y1="17" x2="21.3" y2="16.4" gradientUnits="userSpaceOnUse"><stop stopColor="#C44FE2"/><stop offset="1" stopColor="#73B0D0"/></linearGradient>
        <linearGradient id="solG2" x1="4" y1="12" x2="20.3" y2="12" gradientUnits="userSpaceOnUse"><stop stopColor="#778CBF"/><stop offset="1" stopColor="#5DCDC9"/></linearGradient>
      </defs>
    </svg>
  );
  if (symbol === 'BTC') return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="shrink-0 rounded-full">
      <circle cx="12" cy="12" r="12" fill="#f7931a"/>
      <text x="12" y="16" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold" fontFamily="sans-serif">₿</text>
    </svg>
  );
  if (symbol === 'ETH') return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="shrink-0 rounded-full">
      <circle cx="12" cy="12" r="12" fill="#627eea"/>
      <polygon points="12,5 7,12 12,14.5 17,12" fill="white" opacity="0.9"/>
      <polygon points="12,14.5 7,12 12,19" fill="white" opacity="0.6"/>
    </svg>
  );
  // Fallback: colored circle with symbol text
  const COLOR_MAP: Record<string, string> = {
    HYPE: '#6366f1', GOLD: '#d4af37', SILVER: '#9ca3af', WTIOIL: '#2b5f48',
    XRP: '#346aa9', FARTCOIN: '#22c55e', JUP: '#a3e635', VVV: '#8b5cf6',
    DOGE: '#c2952e', ZEC: '#e8b86d', SUI: '#4da2ff', AVAX: '#e84142',
    LINK: '#2a5ada', ONDO: '#3b82f6', PENGU: '#60a5fa', TRUMP: '#ef4444', WIF: '#f59e0b',
  };
  const bg = COLOR_MAP[symbol] ?? '#6b7280';
  return (
    <div className="shrink-0 rounded-full flex items-center justify-center text-white font-bold border border-white/10"
      style={{ width: size, height: size, background: bg, fontSize: symbol.length > 3 ? '7px' : '8px' }}>
      {symbol.slice(0, 3)}
    </div>
  );
}

// ── Rise SDK client — ws: eager mode enables client.streams ──────────────────

function useRiseClient() {
  const [client, setClient] = useState<any>(null);
  const [ready,  setReady]  = useState(false);

  useEffect(() => {
    let cancelled = false;

    function initClient(rpcUrl: string) {
      let c: any;
      try {
        c = createPhoenixClient({
          apiUrl: PHOENIX_API_URL,
          rpcUrl,
          ws: { connectMode: 'eager' },
          flight: {
            builderAuthority: BUILDER_AUTHORITY,
            builderPdaIndex: 0,
            builderSubaccountIndex: 0,
          },
        } as any);
      } catch { return; }
      if (!cancelled) setClient(c);
      const timer = setTimeout(() => { if (!cancelled) setReady(true); }, 8000);
      c.exchange?.ready?.()
        ?.then(() => { clearTimeout(timer); if (!cancelled) setReady(true); })
        ?.catch(() => { clearTimeout(timer); if (!cancelled) setReady(true); });
    }

    // Fetch RPC URL from server (same pattern as useReownWallet) — avoids
    // embedding VITE_HELIUS_API_KEY client-side which may be unset on Render.
    fetch('/api/client-config')
      .then(r => r.json())
      .then(d => { if (!cancelled) initClient(d.rpcUrl ?? 'https://api.mainnet-beta.solana.com'); })
      .catch(() => { if (!cancelled) initClient('https://api.mainnet-beta.solana.com'); });

    return () => { cancelled = true; };
  }, []);

  return { client, ready };
}

// ── Rise SDK streams — replaces manual WebSocket ──────────────────────────────
// Uses client.streams.* async iterators (typed, auto-reconnect, correct symbol format)
// https://ellipsislabs.mintlify.app/sdk/rise

function useRiseStreams(
  client: any,
  symbol: string,   // full e.g. "SOL-PERP"
  wsTimeframe: string,
  authority?: string,
) {
  const [connected,    setConnected]    = useState(false);
  const [stats,        setStats]        = useState<MarketStats | null>(null);
  const [ob,           setOb]           = useState<OB>({ bids: [], asks: [], mid: null });
  const [trades,       setTrades]       = useState<any[]>([]);
  const [liveCandle,   setLiveCandle]   = useState<any>(null);
  const [allMids,      setAllMids]      = useState<Record<string, number>>({});
  const [fundingRate,  setFundingRate]  = useState<FundingRate | null>(null);
  const [liveTrader,   setLiveTrader]   = useState<any>(null);

  useEffect(() => {
    if (!client) return;
    let dead = false;
    setStats(null); setOb({ bids: [], asks: [], mid: null });
    setTrades([]); setLiveCandle(null); setFundingRate(null); setConnected(false);

    const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

    // Generic async-iterator consumer with auto-retry
    async function consume<T>(
      gen: () => AsyncIterable<T> | undefined | null,
      fn: (v: T) => void,
    ) {
      while (!dead) {
        try {
          const iter = gen();
          if (!iter || typeof (iter as any)[Symbol.asyncIterator] !== 'function') break;
          for await (const v of iter) {
            if (dead) return;
            fn(v);
          }
        } catch { if (!dead) await sleep(3000); }
      }
    }

    const s = client.streams;
    if (!s) return; // streams not available — client not ws-enabled

    // L2 orderbook (confirmed SDK method from docs)
    consume(() => s.l2Book?.(symbol), (u: any) => {
      setOb({
        bids: (u.bids ?? []).map(toOBRow),
        asks: (u.asks ?? []).map(toOBRow),
        mid:  u.mid != null ? toNum(u.mid) : null,
      });
      setConnected(true);
    });

    // All market mid prices
    consume(() => s.allMids?.(), (u: any) => {
      const src: any = u.mids ?? u;
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(src)) {
        if (typeof v === 'string' || typeof v === 'number') out[k] = toNum(v);
      }
      if (Object.keys(out).length) setAllMids(out);
    });

    // Market stats (try both method names)
    consume(
      () => s.marketStats?.(symbol) ?? s.market?.(symbol),
      (u: any) => {
        setStats({
          markPx:       toNum(u.markPx  ?? u.mark_px  ?? u.markPrice),
          midPx:        toNum(u.midPx   ?? u.mid_px),
          oraclePx:     toNum(u.oraclePx ?? u.oracle_px ?? u.indexPrice),
          prevDayPx:    toNum(u.prevDayPx ?? u.prev_day_px ?? u.open24h),
          dayNtlVlm:    toNum(u.dayNtlVlm ?? u.day_ntl_vlm ?? u.volume24h),
          openInterest: toNum(u.openInterest ?? u.open_interest ?? u.oi),
          funding:      toNum(u.funding ?? u.fundingRate ?? u.funding1h),
        });
      },
    );

    // Fills / recent trades
    consume(() => s.fills?.(symbol), (u: any) => {
      const arr: any[] = Array.isArray(u) ? u : [u];
      setTrades(prev => [...arr, ...prev].slice(0, 60));
    });

    // Funding rate (current + next)
    consume(() => s.fundingRate?.(symbol), (u: any) => {
      setFundingRate({
        rate:     toNum(u.fundingRate ?? u.rate ?? u.current),
        nextRate: u.nextFundingRate != null ? toNum(u.nextFundingRate) : null,
      });
    });

    // Live candle updates
    consume(() => s.candles?.(symbol, wsTimeframe), (u: any) => {
      setLiveCandle(Array.isArray(u) ? u[u.length - 1] : u);
    });

    // Real-time trader state (positions, orders, collateral)
    if (authority) {
      consume(() => s.traderState?.(authority, 0), (u: any) => {
        const payload = u.snapshot ?? u.data ?? u;
        if (u.type === 'delta') {
          setLiveTrader((prev: any) => prev ? { ...prev, ...(u.delta ?? payload) } : payload);
        } else {
          setLiveTrader(payload);
        }
      });
    }

    return () => { dead = true; };
  }, [client, symbol, wsTimeframe, authority]);

  return { connected, stats, ob, trades, liveCandle, allMids, fundingRate, liveTrader };
}

// ── Orderbook side ────────────────────────────────────────────────────────────

function OBSide({ rows, side }: { rows: [number, number][]; side: 'ask' | 'bid' }) {
  const maxS = rows.length ? Math.max(...rows.map(([, s]) => s)) : 1;
  return (
    <>
      {rows.map(([price, size], i) => {
        const pct = maxS > 0 ? (size / maxS) * 60 : 0;
        return (
          <div key={i} className="relative flex items-center justify-between px-3 py-[3px] text-[11px] hover:bg-white/[0.04] cursor-pointer">
            <div
              className={`absolute inset-y-0 right-0 ${side === 'ask' ? 'bg-red-500/[0.1]' : 'bg-green-500/[0.1]'}`}
              style={{ width: `${pct}%` }}
            />
            <span className={`font-mono relative z-10 ${side === 'ask' ? 'text-red-400' : 'text-green-400'}`}>
              {fn(price)}
            </span>
            <span className="font-mono relative z-10 text-white/50">{size.toFixed(3)}</span>
          </div>
        );
      })}
    </>
  );
}

const ALLOWED_WALLET = 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT';

// ── Access gate ───────────────────────────────────────────────────────────────

function AccessGate() {
  return (
    <div className="h-screen bg-[#0b0b12] text-white flex flex-col items-center justify-center gap-6">
      <div className="w-14 h-14 rounded-2xl bg-purple-600/10 border border-purple-500/20 flex items-center justify-center">
        <svg className="h-7 w-7 text-purple-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-white/70 font-semibold text-sm mb-1">Perps is in private beta</p>
        <p className="text-white/25 text-xs">Connect the authorized wallet to access this page.</p>
      </div>
      <Link href="/"><a className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to home
      </a></Link>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

// Wrapper: only calls useWallet so hook count is always stable.
// Waits for autoConnect before showing gate (avoids flash on page load).
export default function PerpsPage() {
  const { publicKey, connecting } = useWalletAdapter();

  // Still reconnecting via autoConnect — show spinner not gate
  if (connecting) {
    return (
      <div className="h-screen bg-[#0b0b12] flex items-center justify-center">
        <span className="text-white/25 text-sm">Connecting wallet…</span>
      </div>
    );
  }

  if (!publicKey || publicKey.toBase58() !== ALLOWED_WALLET) {
    return <AccessGate />;
  }
  return <PerpsInner />;
}

function PerpsInner() {
  const qc = useQueryClient();
  const { publicKey, signTransaction, connection, disconnect } = useWalletAdapter();
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const disconnectWallet = async () => { try { await disconnect(); } catch (e) { console.error(e); } };
  const { client: riseClient, ready: riseReady } = useRiseClient();

  const [market,       setMarket]       = useState('SOL-PERP');
  const [tf,           setTf]           = useState('3600');
  const [inviteCode,   setInviteCode]   = useState('');
  const [orderType,    setOrderType]    = useState<'market' | 'limit'>('market');
  const [orderPrice,   setOrderPrice]   = useState('');
  const [orderSize,    setOrderSize]    = useState('0.1');
  const [txSig,        setTxSig]        = useState<string | null>(null);
  const [bottomTab,    setBottomTab]    = useState<'positions' | 'orders' | 'trades'>('positions');
  const [mktPanel,         setMktPanel]         = useState(false);
  const [mktSearch,        setMktSearch]        = useState('');
  const [mktCat,           setMktCat]           = useState<'all' | 'crypto' | 'commodities'>('all');
  const [sortCol,          setSortCol]          = useState<'market' | 'price' | 'change' | 'volume' | 'oi' | 'funding'>('market');
  const [sortDir,          setSortDir]          = useState<'asc' | 'desc'>('asc');
  const [fundingCountdown, setFundingCountdown] = useState('');

  const wsTimeframe = TIMEFRAMES.find(t => t.s === tf)?.ws ?? '1h';
  const wsAuthority = publicKey?.toString();

  // Funding countdown — ticks every second to next top-of-the-hour
  useEffect(() => {
    function tick() {
      const secsLeft = 3600 - (Date.now() / 1000 % 3600);
      const m = Math.floor(secsLeft / 60);
      const s = Math.floor(secsLeft % 60);
      setFundingCountdown(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // SDK streams — typed async iterators for all live data
  const { connected, stats, ob, trades, liveCandle, allMids, fundingRate: wsFunding, liveTrader } =
    useRiseStreams(riseClient, market, wsTimeframe, wsAuthority);


  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: marketsRaw } = useQuery<unknown>({
    queryKey: ['/api/perps/markets'],
    queryFn: async () => {
      // Prefer SDK HTTP client; fall back to server proxy
      if (riseClient?.api?.markets) {
        try { return await riseClient.api.markets().getMarkets(); } catch {}
      }
      return (await fetch('/api/perps/markets')).json();
    },
    staleTime: 60_000,
  });

  const { data: candlesRaw } = useQuery<unknown>({
    queryKey: ['/api/perps/candles', market, tf],
    queryFn: async () => {
      // Prefer SDK HTTP client for candles
      if (riseClient?.api?.candles) {
        try {
          return await riseClient.api.candles().getCandles(market, { timeframe: wsTimeframe, limit: 120 });
        } catch {}
      }
      return (await fetch(`/api/perps/candles/${encodeURIComponent(market)}?timeframe=${tf}&limit=120`)).json();
    },
    enabled: !!riseClient || true,
    staleTime: 120_000,
    refetchInterval: 120_000,
  });

  // REST price fallback — polls 1-min candles every 10s when streams are down
  const { data: restPriceRaw } = useQuery<any>({
    queryKey: ['/api/perps/rest-price', market],
    queryFn: async () => {
      const r = await fetch(`/api/perps/candles/${encodeURIComponent(market)}?timeframe=60&limit=2`);
      const d = await r.json();
      const arr: any[] = Array.isArray(d) ? d : (d?.candles ?? []);
      return arr.length ? arr[arr.length - 1] : null;
    },
    refetchInterval: 10_000,
    staleTime: 8_000,
  });

  const { data: taRaw } = useQuery<unknown>({
    queryKey: ['/api/perps/ta', market],
    queryFn: async () =>
      (await fetch(`/api/perps/ta/${encodeURIComponent(market)}?timeframe=1h`)).json(),
    refetchInterval: 60_000,
    staleTime: 50_000,
  });

  const { data: exchangeRaw } = useQuery<unknown>({
    queryKey: ['/api/perps/exchange'],
    queryFn: async () => {
      if (riseClient?.exchange) {
        try { return await riseClient.exchange().getMarket(market); } catch {}
      }
      return (await fetch('/api/perps/exchange')).json();
    },
    staleTime: 300_000,
  });

  const { data: traderRaw, refetch: refetchTrader } = useQuery<unknown>({
    queryKey: ['/api/perps/trader', publicKey?.toString()],
    queryFn: async () => {
      // Prefer SDK HTTP client for trader state
      if (riseClient?.traders) {
        try {
          return await riseClient.traders().getTraderStateSnapshot(
            publicKey!.toString(), { traderPdaIndex: 0 },
          );
        } catch {}
      }
      return (await fetch(`/api/perps/trader/${publicKey!.toString()}`)).json();
    },
    enabled: !!publicKey,
    refetchInterval: 15_000,
    staleTime: 12_000,
    retry: false,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const registerMut = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/perps/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authority: publicKey!.toString(), code: inviteCode }),
      });
      return r.json();
    },
    onSuccess: () => refetchTrader(),
  });

  const placeMut = useMutation({
    mutationFn: async ({ side }: { side: 'buy' | 'sell' }) => {
      if (!publicKey || !riseClient) throw new Error('Not ready');
      const authority = publicKey.toString();
      const sym = market;
      const riseSide = side === 'buy' ? Side.Bid : Side.Ask;
      let ix: any;

      if (orderType === 'limit') {
        if (!orderPrice) throw new Error('Enter a price');
        const pkt = await riseClient.orderPackets.buildLimitOrderPacket({
          symbol: sym, side: riseSide, priceUsd: orderPrice, baseUnits: orderSize,
        });
        ix = await riseClient.ixs.buildPlaceLimitOrder({
          authority, symbol: sym, orderPacket: pkt,
          traderPdaIndex: 0, traderSubaccountIndex: 0,
        });
      } else {
        const limit = markPrice
          ? (side === 'buy' ? (markPrice * 1.05).toFixed(4) : (markPrice * 0.95).toFixed(4))
          : (side === 'buy' ? '999999' : '0.01');
        const pkt = await riseClient.orderPackets.buildMarketOrderPacket({
          symbol: sym, side: riseSide, baseUnits: orderSize, priceLimitUsd: limit,
        });
        ix = await riseClient.ixs.buildPlaceMarketOrder({
          authority, symbol: sym, orderPacket: pkt,
          traderPdaIndex: 0, traderSubaccountIndex: 0,
        });
      }

      const tx = new Transaction().add(ix);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      const signedTx = await signTransaction(tx);
      const sig = await connection.sendRawTransaction((signedTx as Transaction).serialize());
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
      return sig;
    },
    onSuccess: (sig) => {
      setTxSig(sig as string);
      setTimeout(() => setTxSig(null), 8000);
      refetchTrader();
    },
  });

  // ── Derived state ─────────────────────────────────────────────────────────

  const rawMarkets: any[] = Array.isArray(marketsRaw)
    ? marketsRaw
    : (marketsRaw as any)?.markets ?? [];
  const displayMarkets = rawMarkets.length > 0
    ? rawMarkets
    : [{ symbol: 'SOL-PERP' }, { symbol: 'BTC-PERP' }, { symbol: 'ETH-PERP' }];

  const restPrice    = restPriceRaw ? pf(restPriceRaw.close ?? restPriceRaw.c) : null;
  const indexPrice   = stats?.oraclePx ?? null;
  // Prefer dedicated fundingRate WS channel; fall back to market stats
  const fundingRate  = wsFunding?.rate ?? stats?.funding ?? null;
  const nextFunding  = wsFunding?.nextRate ?? null;
  const dayNtlVlm    = stats?.dayNtlVlm ?? null;
  const openInterest = stats?.openInterest ?? null;

  // markPrice derivation must come before priceChange / midPrice
  const marketBase      = stripPerp(market);
  const liveMidSelected = allMids[marketBase] ?? allMids[market] ?? null;
  const markPrice       = stats?.markPx ?? liveMidSelected ?? restPrice ?? null;

  const priceChange  = (markPrice && stats?.prevDayPx && stats.prevDayPx > 0)
    ? (markPrice - stats.prevDayPx) / stats.prevDayPx : null;
  const isUp = priceChange == null ? true : priceChange >= 0;

  const midPrice    = ob.mid ?? markPrice;
  const displayAsks = [...ob.asks].slice(0, 12).reverse();
  const displayBids = ob.bids.slice(0, 12);

  const rawCandles: any[] = Array.isArray(candlesRaw)
    ? candlesRaw : (candlesRaw as any)?.candles ?? [];
  const chartData = useMemo(() => {
    let candles = rawCandles.slice(-120).map((c: any) => ({
      time: c.time ?? c.t, price: pf(c.close ?? c.c), volume: pf(c.volume ?? c.v),
    }));
    if (liveCandle) {
      const t = liveCandle.time ?? liveCandle.t;
      const p = pf(liveCandle.close ?? liveCandle.c);
      const v = pf(liveCandle.volume ?? liveCandle.v);
      const idx = candles.findIndex(c => c.time === t);
      if (idx >= 0) { candles = [...candles]; candles[idx] = { time: t, price: p, volume: v }; }
      else candles = [...candles, { time: t, price: p, volume: v }].slice(-120);
    }
    return candles;
  }, [rawCandles, liveCandle]);
  const prices = chartData.map(c => c.price).filter(Boolean);
  const minP = prices.length ? Math.min(...prices) * 0.9995 : ('auto' as const);
  const maxP = prices.length ? Math.max(...prices) * 1.0005 : ('auto' as const);

  const ta: any  = taRaw ?? {};
  const rsi      = ta.rsi?.value ?? ta.rsi;
  const macdHist = ta.macd?.histogram ?? ta.macd?.hist;
  const adx      = ta.adx?.value ?? ta.adx;

  const mktCfg   = ((exchangeRaw as any)?.markets ?? []).find(
    (m: any) => m.symbol === market || m.symbol === stripPerp(market));
  const maxLev   = mktCfg?.leverageTiers?.[0]?.maxLeverage ?? null;
  const takerFee = mktCfg?.takerFee ?? null;
  const makerFee = mktCfg?.makerFee ?? null;

  // Prefer live WS trader state; fall back to REST polling
  const trader: any    = traderRaw;
  const traderArr      = trader?.traders ?? (trader && !trader.error ? [trader] : []);
  const tdRest: any    = traderArr[0];
  const td: any        = liveTrader ?? tdRest;
  const isRegistered   = !!td && td.state !== 'uninitialized' && !trader?.error;
  const traderPositions: any[] = td?.positions ?? [];
  const traderOrders: any[]    = Object.values(td?.limitOrders ?? {}).flat() as any[];

  const sortedMarkets = useMemo(() => {
    const filtered = displayMarkets.filter((m: any) => {
      const base = stripPerp(addPerp(m.symbol ?? m));
      if (mktSearch && !base.toLowerCase().includes(mktSearch.toLowerCase())) return false;
      if (mktCat === 'commodities') return COMMODITY_SYMS.has(base);
      if (mktCat === 'crypto') return !COMMODITY_SYMS.has(base);
      return true;
    });
    return [...filtered].sort((a: any, b: any) => {
      const baseA = stripPerp(addPerp(a.symbol ?? a));
      const baseB = stripPerp(addPerp(b.symbol ?? b));
      if (sortCol === 'price') {
        const pA = allMids[baseA] ?? 0;
        const pB = allMids[baseB] ?? 0;
        return sortDir === 'asc' ? pA - pB : pB - pA;
      }
      return sortDir === 'asc' ? baseA.localeCompare(baseB) : baseB.localeCompare(baseA);
    });
  }, [displayMarkets, mktSearch, mktCat, sortCol, sortDir, allMids]);

  return (
    <div className="h-screen bg-[#131722] text-white flex flex-col overflow-hidden">

      {/* ── Nav bar ──────────────────────────────────────────────────────── */}
      <nav className="h-[52px] flex items-center justify-between px-4 md:px-6 border-b border-[#2a2d3e] bg-[#131722] shrink-0">

        <div className="flex items-center gap-6">
          <Link href="/"><a className="shrink-0">
            <img src={logoImage} alt="logo" className="h-5 w-auto" />
          </a></Link>
          <div className="hidden md:flex items-center gap-0">
            <span className="px-3 py-2 text-sm font-semibold text-white">Trade</span>
            <span className="px-3 py-2 text-sm text-white/35 cursor-not-allowed select-none">Portfolio</span>
            <span className="px-3 py-2 text-sm text-white/35 cursor-not-allowed select-none">Rewards</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setWalletMenuOpen(o => !o)}
              className="bg-[#F37B28] hover:bg-[#e06b1a] text-black font-semibold text-sm px-4 py-2 rounded-lg transition"
            >
              {publicKey?.toBase58().slice(0, 6)}...{publicKey?.toBase58().slice(-6)}
            </button>
            {walletMenuOpen && <div className="fixed inset-0 z-40" onClick={() => setWalletMenuOpen(false)} />}
            {walletMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-[#1e2130] border border-[#2a2d3e] rounded-md shadow-lg overflow-hidden min-w-[120px]">
                <div onClick={() => { disconnectWallet(); setWalletMenuOpen(false); }}
                  className="px-3 py-2 text-white hover:bg-white/10 cursor-pointer text-sm text-center">
                  Disconnect
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ── Market card ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#2a2d3e] bg-[#131722] shrink-0 overflow-x-auto scrollbar-none">

        {/* Market combobox */}
        <button
          onClick={() => { setMktPanel(v => !v); setMktSearch(''); }}
          className="flex items-center gap-2 shrink-0 pr-3 border-r border-[#2a2d3e]"
        >
          <TokenAvatar symbol={marketBase} size={28} />
          <span className="text-xl font-bold text-white leading-none">{marketBase}</span>
          {maxLev && (
            <span className="inline-flex items-center text-xs bg-[#1e2130] border border-[#3a3d4e] text-white/55 rounded px-1.5 py-0.5 font-medium">
              {maxLev}x
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-white/40 transition-transform duration-200 ${mktPanel ? 'rotate-180' : ''}`} />
        </button>

        {/* Stats */}
        <div className="flex items-center gap-6 overflow-x-auto scrollbar-none">

          <div className="flex flex-col gap-0.5 shrink-0">
            <span className="text-[11px] text-[#F37B28] whitespace-nowrap">Mark</span>
            <span className="text-sm font-mono text-white whitespace-nowrap">{markPrice != null ? fp(markPrice) : '—'}</span>
          </div>

          {indexPrice != null && (
            <div className="flex flex-col gap-0.5 shrink-0">
              <span className="text-[11px] text-[#F37B28] whitespace-nowrap">Index</span>
              <span className="text-sm font-mono text-white/70 whitespace-nowrap">{fp(indexPrice)}</span>
            </div>
          )}

          {markPrice != null && stats?.prevDayPx != null && stats.prevDayPx > 0 && (
            <div className="flex flex-col gap-0.5 shrink-0">
              <span className="text-[11px] text-[#F37B28] whitespace-nowrap">24h Change</span>
              <span className={`text-sm font-mono flex items-center gap-1 whitespace-nowrap ${isUp ? 'text-green-400' : 'text-red-400'}`}>
                {isUp ? '+' : ''}{fUSD(markPrice - stats.prevDayPx)} ({isUp ? '+' : ''}{((priceChange ?? 0) * 100).toFixed(2)}%)
                <svg width="12" height="7" viewBox="0 0 12 7" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {isUp
                    ? <path d="M11.47 5.68741L5.73388 0.422607L0 5.69273L1.26021 7L2.17799 6.14435C4.1578 4.29858 7.24693 4.3634 9.14756 6.29061L9.84717 7L11.47 5.68741Z" fill="currentColor"/>
                    : <path d="M11.47 1.31259L5.73388 6.57739L0 1.30727L1.26021 0L2.17799 0.855648C4.1578 2.70142 7.24693 2.6366 9.14756 0.709392L9.84717 0L11.47 1.31259Z" fill="currentColor"/>
                  }
                </svg>
              </span>
            </div>
          )}

          {dayNtlVlm != null && dayNtlVlm > 0 && (
            <div className="flex flex-col gap-0.5 shrink-0">
              <span className="text-[11px] text-[#F37B28] whitespace-nowrap">24h Volume</span>
              <span className="text-sm font-mono text-white/70 whitespace-nowrap">{fUSD(dayNtlVlm)}</span>
            </div>
          )}

          {openInterest != null && openInterest > 0 && (
            <div className="flex flex-col gap-0.5 shrink-0">
              <span className="text-[11px] text-[#F37B28] whitespace-nowrap">Open Interest</span>
              <span className="text-sm font-mono text-white/70 whitespace-nowrap">{fUSD(openInterest)}</span>
            </div>
          )}

          {fundingRate != null && (
            <div className="flex flex-col gap-0.5 shrink-0">
              <span className="text-[11px] text-[#F37B28] whitespace-nowrap">1h Funding</span>
              <span className="text-sm font-mono flex gap-2 whitespace-nowrap">
                <span className={fundingRate >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {fundingRate >= 0 ? '+' : ''}{(fundingRate * 100).toFixed(4)}%
                </span>
                {fundingCountdown && <span className="text-white/45">{fundingCountdown}</span>}
              </span>
            </div>
          )}

          <span className={`shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded border ${
            connected ? 'text-green-400/70 border-green-500/25 bg-green-500/5' : 'text-white/20 border-white/10'
          }`}>
            {connected ? '● LIVE' : '○ …'}
          </span>
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">

        {/* ── Market list panel overlay ─────────────────────────────────── */}
        {mktPanel && (
          <div className="absolute inset-0 z-40 flex">
            {/* Panel */}
            <div className="w-[560px] bg-[#131722] border-r border-[#2a2d3e] flex flex-col shadow-2xl overflow-hidden">
              {/* Search */}
              <div className="p-3 border-b border-[#2a2d3e]">
                <div className="flex items-center gap-2 bg-[#1e2130] border border-[#2a2d3e] rounded-lg px-3 py-2">
                  <Search className="h-3.5 w-3.5 text-white/30 shrink-0" />
                  <input
                    autoFocus
                    value={mktSearch}
                    onChange={e => setMktSearch(e.target.value)}
                    placeholder="Search markets…"
                    className="flex-1 bg-transparent text-xs text-white placeholder-white/25 outline-none"
                  />
                  {mktSearch && (
                    <button onClick={() => setMktSearch('')} className="text-white/30 hover:text-white/60 transition">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Category tabs */}
              <div className="flex gap-1 px-3 py-2 border-b border-[#2a2d3e]">
                {(['all', 'crypto', 'commodities'] as const).map(cat => (
                  <button key={cat} onClick={() => setMktCat(cat)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                      mktCat === cat
                        ? 'bg-[#F37B28]/20 text-[#F37B28]'
                        : 'text-white/35 hover:text-white/60'
                    }`}>
                    {cat === 'all' ? 'All' : cat === 'crypto' ? 'Crypto' : 'Commodities'}
                  </button>
                ))}
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[minmax(140px,1.4fr)_repeat(5,1fr)] px-3 py-2 border-b border-[#2a2d3e]">
                {(['market', 'price', 'change', 'volume', 'oi', 'funding'] as const).map(col => {
                  const labels: Record<string, string> = {
                    market: 'Market', price: 'Price', change: '24h %',
                    volume: '24h Vol', oi: 'Open Int', funding: '1h Fund',
                  };
                  const active = sortCol === col;
                  return (
                    <button key={col}
                      onClick={() => {
                        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                        else { setSortCol(col as any); setSortDir('asc'); }
                      }}
                      className={`flex items-center gap-0.5 text-[10px] transition ${
                        col === 'market' ? '' : 'justify-end'
                      } ${active ? 'text-[#F37B28]' : 'text-white/30 hover:text-white/55'}`}>
                      {labels[col]}
                      <svg className="h-2 w-2 shrink-0" viewBox="0 0 8 8" fill="currentColor" style={{ opacity: active ? 1 : 0.3 }}>
                        {active && sortDir === 'desc'
                          ? <path d="M4 6L1 2h6z"/>
                          : <path d="M4 2L7 6H1z"/>
                        }
                      </svg>
                    </button>
                  );
                })}
              </div>

              {/* Market rows */}
              <div className="flex-1 overflow-y-auto">
                {sortedMarkets.length === 0 && (
                  <div className="flex items-center justify-center py-12 text-white/20 text-xs">
                    No markets found
                  </div>
                )}
                {sortedMarkets.map((m: any) => {
                  const sym    = addPerp(m.symbol ?? m);
                  const base   = stripPerp(sym);
                  const isSel  = market === sym;
                  const price  = allMids[base] ?? allMids[sym] ?? null;
                  const mLev   = m.leverageTiers?.[0]?.maxLeverage ?? null;
                  const isComm = COMMODITY_SYMS.has(base);
                  const mChg   = (isSel && stats && stats.prevDayPx > 0)
                    ? ((stats.markPx - stats.prevDayPx) / stats.prevDayPx) * 100 : null;
                  const mVol   = isSel ? (stats?.dayNtlVlm ?? null) : null;
                  const mOI    = isSel ? (stats?.openInterest ?? null) : null;
                  const mFund  = isSel ? fundingRate : null;
                  return (
                    <button key={sym}
                      onClick={() => { setMarket(sym); setMktPanel(false); }}
                      className={`w-full grid grid-cols-[minmax(140px,1.4fr)_repeat(5,1fr)] items-center px-3 py-2.5 text-xs transition hover:bg-white/[0.04] border-l-2 ${
                        isSel ? 'border-[#F37B28] bg-[#F37B28]/[0.06]' : 'border-transparent'
                      }`}>
                      {/* Market col */}
                      <div className="flex items-center gap-2">
                        <TokenAvatar symbol={base} />
                        <span className={`font-semibold ${isSel ? 'text-white' : 'text-white/75'}`}>{base}</span>
                        {mLev != null && (
                          <span className="text-[9px] bg-[#1e2130] text-white/40 border border-[#2a2d3e] rounded px-1 py-0.5 leading-none">
                            {mLev}×
                          </span>
                        )}
                        {isComm && (
                          <svg className="h-2.5 w-2.5 text-orange-400/50 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.66 11.2c-.23-.3-.51-.56-.77-.82-.67-.6-1.43-1.03-2.07-1.66C13.33 7.26 13 4.85 13.95 3c-.95.23-1.78.75-2.49 1.32-2.59 2.08-3.61 5.75-2.39 8.9.04.1.08.2.08.33 0 .22-.15.42-.35.5-.23.1-.47.04-.66-.12a.58.58 0 01-.14-.17c-1.13-1.43-1.31-3.48-.55-5.12C5.78 10 4.87 12.3 5 14.47c.06.5.12 1 .29 1.5.14.6.41 1.2.71 1.73 1.08 1.73 2.95 2.97 4.96 3.22 2.14.27 4.43-.12 6.07-1.6 1.83-1.66 2.47-4.32 1.53-6.6l-.13-.26c-.21-.46-.77-1.26-.77-1.26m-3.16 6.3c-.28.24-.74.5-1.1.6-1.12.4-2.24-.16-2.9-.82 1.19-.28 1.9-1.16 2.11-2.05.17-.8-.15-1.46-.28-2.23-.12-.74-.1-1.37.17-2.06.19.38.39.76.63 1.06.77 1 1.98 1.44 2.24 2.8.04.14.06.28.06.43.03.82-.32 1.72-.93 2.27z"/>
                          </svg>
                        )}
                      </div>
                      {/* Price */}
                      <span className={`text-right font-mono ${isSel ? 'text-white' : 'text-white/60'}`}>
                        {price != null ? fp(price) : '—'}
                      </span>
                      {/* 24h Change */}
                      <div className={`flex items-center justify-end gap-0.5 font-mono ${
                        mChg == null ? 'text-white/25' : mChg >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {mChg == null ? '—' : (
                          <>
                            <svg className="h-2.5 w-2.5 shrink-0" viewBox="0 0 10 10" fill="currentColor">
                              {mChg >= 0 ? <path d="M5 1L9 7H1z"/> : <path d="M5 9L1 3h8z"/>}
                            </svg>
                            {Math.abs(mChg).toFixed(2)}%
                          </>
                        )}
                      </div>
                      {/* 24h Volume */}
                      <span className={`text-right ${mVol == null ? 'text-white/25' : 'text-white/60'}`}>
                        {mVol != null ? fUSD(mVol) : '—'}
                      </span>
                      {/* Open Interest */}
                      <span className={`text-right ${mOI == null ? 'text-white/25' : 'text-white/60'}`}>
                        {mOI != null ? fUSD(mOI) : '—'}
                      </span>
                      {/* 1h Funding */}
                      <span className={`text-right font-mono text-[11px] ${
                        mFund == null ? 'text-white/25' : mFund >= 0 ? 'text-green-400/80' : 'text-red-400/80'
                      }`}>
                        {mFund == null ? '—' : `${mFund >= 0 ? '+' : ''}${(mFund * 100).toFixed(4)}%`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Backdrop — click to close */}
            <div className="flex-1 bg-black/40 cursor-pointer" onClick={() => setMktPanel(false)} />
          </div>
        )}

        {/* ── Left column: chart + bottom tabs ─────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-[#2a2d3e] overflow-hidden">

          {/* Chart */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Timeframe tabs */}
            <div className="flex items-center gap-0.5 px-3 py-2 border-b border-[#2a2d3e] shrink-0">
              {TIMEFRAMES.map(t => (
                <button key={t.s} onClick={() => setTf(t.s)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                    tf === t.s
                      ? 'text-[#F37B28] bg-[#F37B28]/10'
                      : 'text-white/35 hover:bg-white/5 hover:text-white/70'
                  }`}>
                  {t.label}
                </button>
              ))}
              {macdHist != null && (
                <span className={`ml-auto text-[10px] font-mono px-2 py-0.5 rounded ${Number(macdHist) >= 0 ? 'text-green-400/60' : 'text-red-400/60'}`}>
                  MACD {Number(macdHist) >= 0 ? '+' : ''}{Number(macdHist).toFixed(2)}
                </span>
              )}
            </div>

            {/* Chart area */}
            <div className="flex-1 min-h-0 p-3">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="perpG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#F37B28" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#F37B28" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 6" stroke="rgba(255,255,255,0.03)" />
                    <XAxis dataKey="time" tickFormatter={v => fTime(Number(v), tf)}
                      tick={{ fill: 'rgba(255,255,255,0.22)', fontSize: 10 }}
                      tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.06)' }} minTickGap={60} />
                    <YAxis yAxisId="p" domain={[minP, maxP]}
                      tick={{ fill: 'rgba(255,255,255,0.22)', fontSize: 10 }}
                      tickLine={false} axisLine={false} tickFormatter={fn} width={64} />
                    <YAxis yAxisId="v" orientation="right" hide />
                    <Tooltip
                      contentStyle={{ background: '#1e2130', border: '1px solid #2a2d3e', borderRadius: 8, fontSize: 11 }}
                      labelFormatter={v => fTime(Number(v), tf)}
                      formatter={(v: unknown, name: string) =>
                        name === 'price' ? [fp(Number(v)), 'Price'] : [Number(v).toFixed(2), 'Volume']
                      }
                    />
                    <Bar  yAxisId="v" dataKey="volume" fill="rgba(243,123,40,0.12)" radius={[1,1,0,0]} maxBarSize={6} />
                    <Area yAxisId="p" type="monotone" dataKey="price" stroke="#F37B28" strokeWidth={1.5}
                      fill="url(#perpG)" dot={false} activeDot={{ r: 3, fill: '#F37B28', strokeWidth: 0 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-white/15 gap-2">
                  <Activity className="h-6 w-6" />
                  <span className="text-xs">Loading chart…</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Bottom tabs: Positions / Orders / Trades ───────────────── */}
          <div className="border-t border-[#2a2d3e] shrink-0 flex flex-col" style={{ height: '180px' }}>
            {/* Tab headers */}
            <div className="flex items-center border-b border-[#2a2d3e] shrink-0 overflow-x-auto scrollbar-none">
              {(['positions', 'orders', 'trades'] as const).map(tab => (
                <button key={tab} onClick={() => setBottomTab(tab)}
                  className={`px-4 py-2.5 text-[11px] font-medium transition border-b-2 -mb-px whitespace-nowrap ${
                    bottomTab === tab
                      ? 'border-[#F37B28] text-white'
                      : 'border-transparent text-white/35 hover:text-white/60'
                  }`}>
                  {tab === 'positions' ? `Positions (${traderPositions.length})` :
                   tab === 'orders'    ? `Open Orders (${traderOrders.length})` :
                   'Trade History'}
                </button>
              ))}
              {publicKey && (
                <button onClick={() => refetchTrader()} className="ml-auto pr-3 text-white/20 hover:text-white/50 transition">
                  <RefreshCw className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto">
              {bottomTab === 'positions' && (
                !publicKey ? (
                  <div className="flex items-center justify-center h-full text-white/20 text-xs gap-2">
                    <User className="h-4 w-4" /> Connect wallet to view positions
                  </div>
                ) : !isRegistered ? (
                  <div className="flex items-center justify-center h-full text-white/20 text-xs">
                    Activate Phoenix account to trade
                  </div>
                ) : traderPositions.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-white/20 text-xs">No open positions</div>
                ) : (
                  <div className="px-3 py-2">
                    <div className="grid grid-cols-5 text-[10px] text-white/25 pb-1.5 border-b border-white/5 mb-1">
                      <span>Market</span><span>Side</span><span className="text-right">Size</span>
                      <span className="text-right">Entry</span><span className="text-right">PnL</span>
                    </div>
                    {traderPositions.map((p: any, i: number) => {
                      const pnl  = pf(p.unrealizedPnl);
                      const size = pf(p.positionSize);
                      const side = size >= 0 ? 'LONG' : 'SHORT';
                      return (
                        <div key={i} className="grid grid-cols-5 py-1.5 text-xs border-b border-white/[0.04] last:border-0">
                          <span className="text-white/70">{stripPerp(p.symbol ?? market)}</span>
                          <span className={side === 'LONG' ? 'text-green-400' : 'text-red-400'}>{side}</span>
                          <span className="text-right font-mono text-white/60">{Math.abs(size).toFixed(3)}</span>
                          <span className="text-right font-mono text-white/60">{fp(pf(p.entryPrice))}</span>
                          <span className={`text-right font-semibold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {pnl >= 0 ? '+' : ''}{fUSD(pnl)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {bottomTab === 'orders' && (
                !publicKey ? (
                  <div className="flex items-center justify-center h-full text-white/20 text-xs gap-2">
                    <User className="h-4 w-4" /> Connect wallet to view orders
                  </div>
                ) : traderOrders.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-white/20 text-xs">No open orders</div>
                ) : (
                  <div className="px-3 py-2">
                    <div className="grid grid-cols-4 text-[10px] text-white/25 pb-1.5 border-b border-white/5 mb-1">
                      <span>Side</span><span className="text-right">Price</span>
                      <span className="text-right">Size</span><span className="text-right">Remaining</span>
                    </div>
                    {traderOrders.slice(0, 20).map((o: any, i: number) => (
                      <div key={i} className="grid grid-cols-4 py-1.5 text-xs border-b border-white/[0.04] last:border-0">
                        <span className={o.side === 'bid' ? 'text-green-400' : 'text-red-400'}>
                          {o.side === 'bid' ? 'BUY' : 'SELL'}
                        </span>
                        <span className="text-right font-mono text-white/60">{fp(pf(o.price))}</span>
                        <span className="text-right font-mono text-white/60">{pf(o.tradeSize).toFixed(3)}</span>
                        <span className="text-right font-mono text-white/40">{pf(o.tradeSizeRemaining).toFixed(3)}</span>
                      </div>
                    ))}
                  </div>
                )
              )}

              {bottomTab === 'trades' && (
                <div className="px-3 py-2">
                  {trades.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-white/20 text-xs py-6">
                      {connected ? 'Waiting for trades…' : 'Connecting…'}
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 text-[10px] text-white/25 pb-1.5 border-b border-white/5 mb-1">
                        <span>Price</span><span className="text-right">Size</span><span className="text-right">Time</span>
                      </div>
                      {trades.slice(0, 30).map((f: any, i: number) => {
                        const price = pf(f.price ?? f.px ?? f.p);
                        const size  = pf(f.baseLots ?? f.size ?? f.qty ?? f.q);
                        const isBuy = f.side === 'buy' || f.side === 'bid' || f.isBuy === true;
                        const ts    = f.timestamp
                          ? new Date(f.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
                          : '—';
                        return (
                          <div key={i} className="grid grid-cols-3 py-1 text-[11px]">
                            <span className={isBuy ? 'text-green-400' : 'text-red-400'}>{fp(price)}</span>
                            <span className="text-right text-white/45 font-mono">{size.toFixed(3)}</span>
                            <span className="text-right text-white/25">{ts}</span>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right panel: order form (top) + orderbook (bottom) ───────── */}
        <div className="w-[350px] shrink-0 flex flex-col overflow-hidden bg-[#131722]">

          {/* ── Order form ─────────────────────────────────────────────── */}
          <div className="flex flex-col shrink-0 border-b border-[#2a2d3e]">

            {/* Cross / Isolated toggle */}
            <div className="px-3 py-2 border-b border-[#2a2d3e]">
              <button className="flex items-center gap-1.5 bg-[#1e2130] border border-[#2a2d3e] rounded-md px-3 py-1.5 text-sm text-white/70 hover:bg-[#252840] transition">
                Cross <ChevronDown className="w-3.5 h-3.5 text-white/40" />
              </button>
            </div>

            {!publicKey ? (
              <div className="p-6 flex flex-col items-center gap-3">
                <User className="h-8 w-8 text-white/10" />
                <p className="text-sm text-white/30">Connect wallet to trade</p>
              </div>

            ) : !isRegistered ? (
              <div className="p-4 flex flex-col gap-3">
                <div className="flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5 text-[#F37B28]/70" />
                  <span className="text-xs font-semibold text-white/60">Activate Phoenix Account</span>
                </div>
                <p className="text-[10px] text-white/25 leading-relaxed">
                  Enter your Phoenix invite code to trade perps on-chain.
                </p>
                <input value={inviteCode} onChange={e => setInviteCode(e.target.value)}
                  placeholder="Invite code…"
                  className="bg-[#1e2130] border border-[#2a2d3e] rounded-lg px-3 py-2 text-xs text-white placeholder-white/20 outline-none focus:border-[#F37B28]/40 transition" />
                <button onClick={() => registerMut.mutate()}
                  disabled={!inviteCode.trim() || registerMut.isPending}
                  className="w-full py-2.5 bg-[#F37B28] hover:bg-[#e06b1a] rounded-lg text-sm font-semibold text-black transition disabled:opacity-40">
                  {registerMut.isPending ? 'Activating…' : 'Activate Account'}
                </button>
                {registerMut.isError   && <p className="text-red-400   text-[10px]">Failed — check your code.</p>}
                {registerMut.isSuccess && <p className="text-green-400 text-[10px]">Activated! Refreshing…</p>}
              </div>

            ) : (
              <>
                {/* Long/Buy — Short/Sell */}
                <div className="grid grid-cols-2 p-3 gap-1.5">
                  <button
                    onClick={() => placeMut.mutate({ side: 'buy' })}
                    disabled={placeMut.isPending || !riseReady}
                    className="py-3 rounded-lg text-sm font-bold bg-[#22c55e] hover:bg-[#16a34a] text-black transition disabled:opacity-40 flex items-center justify-center gap-1.5">
                    <TrendingUp className="h-4 w-4" />
                    {placeMut.isPending ? '…' : 'Long/Buy'}
                  </button>
                  <button
                    onClick={() => placeMut.mutate({ side: 'sell' })}
                    disabled={placeMut.isPending || !riseReady}
                    className="py-3 rounded-lg text-sm font-semibold bg-[#1e2130] hover:bg-[#ef4444]/80 text-white/60 hover:text-white transition disabled:opacity-40 flex items-center justify-center gap-1.5">
                    <TrendingDown className="h-4 w-4" />
                    {placeMut.isPending ? '…' : 'Short/Sell'}
                  </button>
                </div>

                {/* Market / Limit tabs */}
                <div className="flex items-center px-3 pb-2 gap-3 border-b border-[#2a2d3e]">
                  {(['market', 'limit'] as const).map(t => (
                    <button key={t} onClick={() => setOrderType(t)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                        orderType === t
                          ? 'bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/30'
                          : 'text-white/40 hover:text-white/60'
                      }`}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                  {markPrice && (
                    <span className="ml-auto text-xs font-mono text-white/35">{fp(markPrice)} MID</span>
                  )}
                </div>

                {/* Form fields */}
                <div className="p-3 flex flex-col gap-3">

                  <div className="flex justify-between text-xs">
                    <span className="text-white/40">Available to Trade</span>
                    <span className="font-mono text-white/70">{fUSD(pf(td?.collateralBalance))}</span>
                  </div>

                  {/* Price input (limit only) */}
                  {orderType === 'limit' && (
                    <div>
                      <div className="text-[10px] text-white/40 mb-1">Price USDC</div>
                      <div className="flex items-center bg-[#1e2130] border border-[#2a2d3e] rounded-lg px-3 py-2">
                        <input type="number" value={orderPrice} onChange={e => setOrderPrice(e.target.value)}
                          placeholder={markPrice ? markPrice.toFixed(4) : '0.00'}
                          className="flex-1 bg-transparent text-sm font-mono text-white outline-none min-w-0" />
                      </div>
                    </div>
                  )}

                  {/* Order size */}
                  <div>
                    <div className="text-[10px] text-white/40 mb-1">Order Size</div>
                    <div className="flex items-center bg-[#1e2130] border border-[#2a2d3e] rounded-lg px-3 py-2 gap-2">
                      <input type="number" value={orderSize} onChange={e => setOrderSize(e.target.value)}
                        placeholder="0"
                        className="flex-1 bg-transparent text-sm font-mono text-white outline-none min-w-0" />
                      <button className="shrink-0 bg-[#131722] border border-[#2a2d3e] rounded px-2 py-0.5 text-xs text-white/60 flex items-center gap-1 hover:bg-[#1e2130] transition">
                        {marketBase} <span className="opacity-40">⇄</span>
                      </button>
                    </div>
                    {orderType === 'market' && markPrice && orderSize && (
                      <div className="text-[10px] text-white/30 mt-1 text-right">{fUSD(pf(orderSize) * markPrice)}</div>
                    )}
                  </div>

                  {!riseReady && (
                    <p className="text-[10px] text-white/20 text-center">Initializing engine…</p>
                  )}
                  {placeMut.isError && (
                    <p className="text-red-400 text-[10px] break-all">
                      {(placeMut.error as any)?.message ?? 'Order failed'}
                    </p>
                  )}
                  {txSig && (
                    <a href={`https://solscan.io/tx/${txSig}`} target="_blank" rel="noopener noreferrer"
                      className="text-green-400 text-[10px] truncate hover:underline">
                      ✓ {txSig.slice(0, 22)}… ↗
                    </a>
                  )}

                  {/* Order details */}
                  <div className="border-t border-[#2a2d3e] pt-3 flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-white/40">Expected Price</span>
                      <span className="font-mono text-white/70">{markPrice ? fp(markPrice) : '—'}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-white/40">Est. Liquidation Price</span>
                      <span className="text-white/40">—</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-white/40">Order Value</span>
                      <span className="font-mono text-white/70">
                        {markPrice && orderSize ? fUSD(pf(orderSize) * markPrice) : '$0.00'}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-white/40">Margin Required</span>
                      <span className="text-white/40">$0.00</span>
                    </div>
                    {takerFee != null && (
                      <div className="flex justify-between text-xs">
                        <span className="text-white/40">Fees</span>
                        <span className="font-mono text-white/70">{(takerFee * 100).toFixed(3)}%</span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── Orderbook ──────────────────────────────────────────────── */}
          <div className="flex flex-col overflow-hidden" style={{ flex: '1 1 0', minHeight: 0 }}>

            {/* Tabs */}
            <div className="flex items-center border-b border-[#2a2d3e] shrink-0">
              <button className="px-4 py-2.5 text-xs font-semibold text-white border-b-2 border-[#F37B28] -mb-px">
                Order Book
              </button>
              <button className="px-4 py-2.5 text-xs text-white/35 hover:text-white/60 transition">
                Trades
              </button>
              {connected && <span className="ml-auto pr-3 text-[9px] text-green-400/40">● live</span>}
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-3 px-3 py-1.5 border-b border-[#2a2d3e] shrink-0">
              <span className="text-[10px] text-white/30">Price USDC</span>
              <span className="text-[10px] text-white/30 text-right">Size USDC</span>
              <span className="text-[10px] text-white/30 text-right">Total USDC</span>
            </div>

            {/* Asks */}
            <div className="flex flex-col overflow-hidden" style={{ flex: '1 1 0', minHeight: 0 }}>
              <div className="flex-1 overflow-y-auto flex flex-col justify-end">
                {displayAsks.length > 0
                  ? <OBSide rows={displayAsks} side="ask" />
                  : <div className="text-center text-white/15 text-xs py-3">{connected ? 'Waiting…' : '…'}</div>
                }
              </div>

              {/* Spread row */}
              <div className="flex items-center justify-between px-3 py-1.5 bg-[#1a1d2e] border-y border-[#2a2d3e] shrink-0">
                {ob.asks.length > 0 && ob.bids.length > 0 ? (
                  <>
                    <span className="text-[10px] font-mono text-white/55">
                      {Math.abs((ob.asks[ob.asks.length - 1]?.[0] ?? 0) - (ob.bids[0]?.[0] ?? 0)).toFixed(5)}
                    </span>
                    <span className="text-[10px] text-white/35">Spread</span>
                    <span className="text-[10px] font-mono text-white/55">
                      {ob.asks[ob.asks.length - 1]?.[0] > 0
                        ? ((Math.abs((ob.asks[ob.asks.length - 1]?.[0] ?? 0) - (ob.bids[0]?.[0] ?? 0)) / (ob.asks[ob.asks.length - 1]?.[0] ?? 1)) * 100).toFixed(3) + '%'
                        : '—'}
                    </span>
                  </>
                ) : (
                  <>
                    <span className={`text-sm font-bold font-mono ${isUp ? 'text-green-400' : 'text-red-400'}`}>
                      {fp(midPrice)}
                    </span>
                    <span className="text-[10px] text-white/30">{isUp ? '▲' : '▼'} mid</span>
                    <span />
                  </>
                )}
              </div>

              {/* Bids */}
              <div className="flex-1 overflow-y-auto">
                {displayBids.length > 0
                  ? <OBSide rows={displayBids} side="bid" />
                  : <div className="text-center text-white/15 text-xs py-3">{connected ? 'Waiting…' : '…'}</div>
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
