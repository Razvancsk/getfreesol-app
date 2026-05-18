/**
 * Phoenix Perpetuals — Rise SDK streams + HTTP client
 * https://perp-api.phoenix.trade  |  @ellipsis-labs/rise
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWalletAdapter } from '@/hooks/useWalletAdapter';
import { Transaction } from '@solana/web3.js';
import {
  Side, Direction, StopLossOrderKind, MarginType,
  createPhoenixClient, PhoenixHttpClient, priceUsdToTicksWithMarketParams,
} from '@ellipsis-labs/rise';
import { Link } from 'wouter';
import {
  ArrowLeft, Activity, TrendingUp, TrendingDown,
  RefreshCw, Key, User, ChevronDown, Search, X,
} from 'lucide-react';

const logoImage       = '/logo.png';
const PHOENIX_API_URL = 'https://perp-api.phoenix.trade';
const BUILDER_AUTHORITY = 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT';

const TIMEFRAMES = [
  { label: '1m',  s: '60',    ws: '1m',  tv: '1'   },
  { label: '5m',  s: '300',   ws: '5m',  tv: '5'   },
  { label: '15m', s: '900',   ws: '15m', tv: '15'  },
  { label: '1H',  s: '3600',  ws: '1h',  tv: '60'  },
  { label: '4H',  s: '14400', ws: '4h',  tv: '240' },
  { label: '1D',  s: '86400', ws: '1d',  tv: 'D'   },
] as const;

const TV_SYMBOLS: Record<string, string> = {
  SOL: 'PYTH:SOLUSD', BTC: 'PYTH:BTCUSD', ETH: 'PYTH:ETHUSD',
  XRP: 'PYTH:XRPUSD', DOGE: 'PYTH:DOGEUSD', SUI: 'PYTH:SUIUSD',
  AVAX: 'PYTH:AVAXUSD', LINK: 'PYTH:LINKUSD', HYPE: 'BINANCE:HYPEUSDT',
  TRUMP: 'BINANCE:TRUMPUSDT', WIF: 'BINANCE:WIFUSDT', JUP: 'BINANCE:JUPUSDT',
  GOLD: 'OANDA:XAUUSD', SILVER: 'OANDA:XAGUSD', WTIOIL: 'TVC:USOIL',
  BRENT: 'TVC:UKOIL', FARTCOIN: 'BINANCE:FARTCOINUSDT',
};

// TradingView candlestick chart — exact same widget Phoenix uses
function TVChart({ symbol, interval }: { symbol: string; interval: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tvSym = TV_SYMBOLS[symbol] ?? `BINANCE:${symbol}USDT`;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = '';
    const id = `tv_${symbol}_${Date.now()}`;
    const inner = document.createElement('div');
    inner.id = id;
    inner.style.cssText = 'height:100%;width:100%';
    el.appendChild(inner);

    const create = () => {
      if (!(window as any).TradingView?.widget) return;
      new (window as any).TradingView.widget({
        container_id: id,
        autosize: true,
        symbol: tvSym,
        interval,
        timezone: 'exchange',
        theme: 'dark',
        style: '1',
        locale: 'en',
        backgroundColor: 'rgba(19,23,34,1)',
        gridColor: 'rgba(42,45,62,0.4)',
        toolbar_bg: '#131722',
        enable_publishing: false,
        hide_top_toolbar: false,
        hide_side_toolbar: false,
        allow_symbol_change: false,
        save_image: false,
        withdateranges: true,
      });
    };

    if ((window as any).TradingView?.widget) {
      create();
    } else {
      const existing = document.getElementById('tv-script');
      if (!existing) {
        const s = document.createElement('script');
        s.id = 'tv-script';
        s.src = 'https://s3.tradingview.com/tv.js';
        s.onload = create;
        document.head.appendChild(s);
      } else {
        existing.addEventListener('load', create, { once: true });
        // If already loaded but widget not ready yet, poll briefly
        let tries = 0;
        const poll = setInterval(() => {
          if ((window as any).TradingView?.widget) { clearInterval(poll); create(); }
          if (++tries > 20) clearInterval(poll);
        }, 200);
      }
    }
    return () => { el.innerHTML = ''; };
  }, [tvSym, interval]);

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />;
}

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

    // Market stats — SDK delivers { symbol, stats: { markPrice, oraclePrice, prevDayMarkPrice, dayVolumeUsd, openInterest, currentFundingRate } }
    consume(
      () => s.marketStats?.(symbol),
      (u: any) => {
        const d = u.stats ?? u; // nested under .stats
        setStats({
          markPx:       toNum(d.markPrice),
          midPx:        toNum(d.midPrice  ?? d.midPx),
          oraclePx:     toNum(d.oraclePrice),
          prevDayPx:    toNum(d.prevDayMarkPrice),
          dayNtlVlm:    toNum(d.dayVolumeUsd),
          openInterest: toNum(d.openInterest),
          funding:      toNum(d.currentFundingRate),
        });
      },
    );

    // Fills / recent trades
    consume(() => s.fills?.(symbol), (u: any) => {
      const arr: any[] = Array.isArray(u) ? u : [u];
      setTrades(prev => [...arr, ...prev].slice(0, 60));
    });

    // Funding rate — SDK delivers { symbol, funding: number }
    consume(() => s.fundingRate?.(symbol), (u: any) => {
      setFundingRate({
        rate:     toNum(u.funding),
        nextRate: null,
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
  const [orderSide,    setOrderSide]    = useState<'buy' | 'sell'>('buy');
  const [orderType,    setOrderType]    = useState<'market' | 'limit'>('market');
  const [orderPrice,   setOrderPrice]   = useState('');
  const [orderSize,    setOrderSize]    = useState('');
  const [txSig,        setTxSig]        = useState<string | null>(null);
  const [bottomTab,    setBottomTab]    = useState<'positions' | 'orders' | 'trades'>('positions');
  const [tpslEnabled,      setTpslEnabled]      = useState(false);
  const [stopLossPrice,    setStopLossPrice]    = useState('');
  const [takeProfitPrice,  setTakeProfitPrice]  = useState('');
  const [mktPanel,         setMktPanel]         = useState(false);
  const [mktSearch,        setMktSearch]        = useState('');
  const [mktCat,           setMktCat]           = useState<'all' | 'crypto' | 'commodities'>('all');
  const statsBarRef = useRef<HTMLDivElement>(null);
  const [sortCol,          setSortCol]          = useState<'market' | 'price' | 'change' | 'volume' | 'oi' | 'funding'>('market');
  const [sortDir,          setSortDir]          = useState<'asc' | 'desc'>('asc');
  const [fundingCountdown, setFundingCountdown] = useState('');

  const wsTimeframe = TIMEFRAMES.find(t => t.s === tf)?.ws ?? '1h';
  const wsAuthority = publicKey?.toString();

  // Activate Phoenix referral for every connected wallet (silent — errors ignored)
  useEffect(() => {
    if (!publicKey) return;
    fetch('https://perp-api.phoenix.trade/v1/invite/activate-with-referral', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authority: publicKey.toString(), referral_code: '20HSXQYV' }),
    }).catch(() => {});
  }, [publicKey?.toString()]);

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

  // 24h candles — always 1h timeframe, 25 bars to cover full day; derives change + volume
  const { data: candles24hRaw } = useQuery<any>({
    queryKey: ['/api/perps/candles24h', market],
    queryFn: () => fetch(`/api/perps/candles/${encodeURIComponent(market)}?timeframe=3600&limit=25`).then(r => r.json()),
    refetchInterval: 60_000,
    staleTime: 50_000,
  });

  // Phoenix /v1/market/{symbol}/stats — polls every 10s; used to seed stats before WS fires
  const { data: tickerRaw } = useQuery<any>({
    queryKey: ['/api/perps/ticker', market],
    queryFn: () => fetch(`/api/perps/ticker/${encodeURIComponent(market)}`).then(r => r.json()),
    refetchInterval: 10_000,
    staleTime: 8_000,
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
    queryKey: ['/api/perps/exchange', market],
    queryFn: async () => {
      // Use SDK's correct path: api.exchangeClient (createPhoenixClient)
      if (riseClient?.api?.exchangeClient) {
        try { return await riseClient.api.exchangeClient.getMarket(stripPerp(market)); } catch {}
      }
      return (await fetch('/api/perps/exchange')).json();
    },
    staleTime: 300_000,
  });

  const { data: traderRaw, refetch: refetchTrader } = useQuery<unknown>({
    queryKey: ['/api/perps/trader', publicKey?.toString()],
    queryFn: async () => {
      // Use SDK's correct path: api.tradersClient (createPhoenixClient)
      if (riseClient?.api?.tradersClient) {
        try {
          return await riseClient.api.tradersClient.getTraderStateSnapshot(
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
      if (!publicKey || !riseClient) throw new Error('Not ready');
      const authority = publicKey.toString();

      // Step 1: ensure referral is activated (idempotent — safe to call again)
      await fetch(`${PHOENIX_API_URL}/v1/invite/activate-with-referral`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authority, referral_code: '20HSXQYV' }),
      }).catch(() => {});

      // Step 2: create on-chain Phoenix trader account (Cross margin)
      const ix = await riseClient.ixs.buildRegisterTrader({
        authority,
        marginType: MarginType.Cross,
      });
      return signAndSend(ix);
    },
    onSuccess: () => refetchTrader(),
  });

  // Helper: sign & send a single instruction
  async function signAndSend(ix: any): Promise<string> {
    const tx = new Transaction().add(ix);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = publicKey!;
    const signedTx = await signTransaction(tx);
    const sig = await connection.sendRawTransaction((signedTx as Transaction).serialize());
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
    return sig;
  }

  const placeMut = useMutation({
    mutationFn: async ({ side }: { side: 'buy' | 'sell' }) => {
      if (!publicKey || !riseClient) throw new Error('Not ready');
      const authority = publicKey.toString();
      const sym = market;
      const riseSide = side === 'buy' ? Side.Bid : Side.Ask;
      let ix: any;

      if (orderType === 'limit') {
        if (!orderPrice) throw new Error('Enter a price');
        // placeLimitOrder is Flight-aware (per SDK docs)
        const pkt = await riseClient.orderPackets.buildLimitOrderPacket({
          symbol: sym, side: riseSide, priceUsd: orderPrice, baseUnits: orderSize,
        });
        ix = await riseClient.ixs.placeLimitOrder({ authority, symbol: sym, orderPacket: pkt });
      } else {
        const limit = markPrice
          ? (side === 'buy' ? (markPrice * 1.05).toFixed(4) : (markPrice * 0.95).toFixed(4))
          : (side === 'buy' ? '999999' : '0.01');
        // placeMarketOrder is Flight-aware (per SDK docs)
        const pkt = await riseClient.orderPackets.buildMarketOrderPacket({
          symbol: sym, side: riseSide, baseUnits: orderSize, priceLimitUsd: limit,
        });
        ix = await riseClient.ixs.placeMarketOrder({ authority, symbol: sym, orderPacket: pkt });
      }

      const sig = await signAndSend(ix);

      // Place stop loss if enabled (POST /v1/invite/... handled by SDK)
      const mktCfg: any = exchangeRaw;
      if (tpslEnabled && stopLossPrice && mktCfg?.tickSize) {
        try {
          const triggerPrice = priceUsdToTicksWithMarketParams(stopLossPrice, mktCfg);
          const slIx = await riseClient.ixs.buildPlaceStopLoss({
            authority,
            symbol: sym,
            tradeSide: riseSide,
            executionDirection: side === 'buy' ? Direction.LessThan : Direction.GreaterThan,
            orderKind: StopLossOrderKind.IOC,
            triggerPrice,
          });
          await signAndSend(slIx);
        } catch { /* stop loss is optional — don't fail the main order */ }
      }

      return sig;
    },
    onSuccess: (sig) => {
      setTxSig(sig as string);
      setTimeout(() => setTxSig(null), 8000);
      refetchTrader();
    },
  });

  // Cancel all open orders for current market
  const cancelAllMut = useMutation({
    mutationFn: async () => {
      if (!publicKey || !riseClient) throw new Error('Not ready');
      const ix = await riseClient.ixs.buildCancelAll({
        authority: publicKey.toString(), symbol: market,
      });
      return signAndSend(ix);
    },
    onSuccess: (sig) => { setTxSig(sig as string); setTimeout(() => setTxSig(null), 8000); refetchTrader(); },
  });

  // Cancel a specific order by price + sequence number
  const cancelByIdMut = useMutation({
    mutationFn: async ({ price, orderSequenceNumber }: { price: bigint; orderSequenceNumber: string }) => {
      if (!publicKey || !riseClient) throw new Error('Not ready');
      const ix = await riseClient.ixs.buildCancelOrdersById({
        authority: publicKey.toString(), symbol: market,
        orders: [{ price, orderSequenceNumber }],
      });
      return signAndSend(ix);
    },
    onSuccess: (sig) => { setTxSig(sig as string); setTimeout(() => setTxSig(null), 8000); refetchTrader(); },
  });

  // ── Derived state ─────────────────────────────────────────────────────────

  const rawMarkets: any[] = Array.isArray(marketsRaw)
    ? marketsRaw
    : (marketsRaw as any)?.markets ?? [];
  const displayMarkets = rawMarkets.length > 0
    ? rawMarkets
    : [{ symbol: 'SOL-PERP' }, { symbol: 'BTC-PERP' }, { symbol: 'ETH-PERP' }];

  const restPrice    = restPriceRaw ? pf(restPriceRaw.close ?? restPriceRaw.c) : null;

  // Derive 24h stats from candles (guaranteed to work — same source as chart)
  const c24arr: any[] = Array.isArray(candles24hRaw) ? candles24hRaw
    : (candles24hRaw?.candles ?? candles24hRaw?.data ?? []);
  const c24open   = c24arr.length ? pf(c24arr[0].open ?? c24arr[0].o) : null;
  const c24volume = c24arr.length
    ? c24arr.reduce((sum: number, c: any) => sum + pf(c.volume ?? c.v ?? 0), 0)
    : null;

  // Ticker REST (Phoenix /v1/market/{symbol}/stats) — optional enrichment
  const tk = tickerRaw && !tickerRaw.error ? tickerRaw : null;
  const tkIndex  = tk ? pf(tk.oraclePrice ?? tk.oracle_price ?? tk.indexPrice ?? tk.spot_price) : null;
  const tkOI     = tk ? pf(tk.openInterest ?? tk.open_interest) : null;
  const tkFund   = tk ? pf(tk.currentFundingRate ?? tk.current_funding_rate ?? tk.fundingRate) : null;

  const indexPrice   = stats?.oraclePx   ?? tkIndex  ?? null;
  const fundingRate  = wsFunding?.rate   ?? stats?.funding  ?? tkFund   ?? null;
  const nextFunding  = wsFunding?.nextRate ?? null;
  const openInterest = stats?.openInterest ?? tkOI   ?? null;

  // markPrice derivation must come before priceChange / midPrice
  const marketBase      = stripPerp(market);
  const liveMidSelected = allMids[marketBase] ?? allMids[market] ?? null;
  const markPrice       = stats?.markPx ?? liveMidSelected ?? restPrice ?? null;

  // 24h volume: from WebSocket stats, or sum of 1h candles volumes
  const dayNtlVlm = stats?.dayNtlVlm ?? (c24volume && c24volume > 0 ? c24volume : null);

  // 24h change: from WebSocket stats prevDayPx, or from first 1h candle open
  const prevDayPx = stats?.prevDayPx ?? c24open ?? null;
  const priceChange = (markPrice && prevDayPx && prevDayPx > 0)
    ? (markPrice - prevDayPx) / prevDayPx : null;
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
    <div className="h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white flex flex-col overflow-hidden">

      {/* ── Nav bar ──────────────────────────────────────────────────────── */}
      <nav className="h-[52px] flex items-center justify-between px-4 md:px-6 border-b border-purple-500/20 bg-black/20 backdrop-blur-sm shrink-0">

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
              <div className="absolute right-0 top-full mt-1 z-50 bg-purple-900/40 border border-purple-500/20 rounded-md shadow-lg overflow-hidden min-w-[120px]">
                <div onClick={() => { disconnectWallet(); setWalletMenuOpen(false); }}
                  className="px-3 py-2 text-white hover:bg-white/10 cursor-pointer text-sm text-center">
                  Disconnect
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ── Content area ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex p-3 gap-3 min-h-0 overflow-hidden">

        {/* ── Left column ─────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col gap-3 min-h-0 relative">

        {/* ── Stats bar card ──────────────────────────────────────────────── */}
        <div ref={statsBarRef} className="shrink-0 bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 px-4 py-2.5 flex items-center gap-5 overflow-x-auto scrollbar-none flex-nowrap">
          <button onClick={() => setMktPanel(true)} className="flex items-center gap-2 shrink-0 hover:opacity-80 transition">
            <TokenAvatar symbol={marketBase} size={20} />
            <span className="text-sm font-bold text-white">{marketBase}/USD</span>
            <ChevronDown className="w-3.5 h-3.5 text-white/40" />
          </button>
          <div className="w-px h-6 bg-purple-500/30 shrink-0" />
          <div className="flex flex-col gap-0.5 shrink-0">
            <span className="text-[10px] text-[#F37B28] whitespace-nowrap">Mark</span>
            <span className="text-sm font-mono text-white whitespace-nowrap">{markPrice != null ? fp(markPrice) : '—'}</span>
          </div>
          <div className="flex flex-col gap-0.5 shrink-0">
            <span className="text-[10px] text-[#F37B28] whitespace-nowrap">Index</span>
            <span className="text-sm font-mono text-white/70 whitespace-nowrap">{indexPrice != null ? fp(indexPrice) : '—'}</span>
          </div>
          <div className="flex flex-col gap-0.5 shrink-0">
            <span className="text-[10px] text-[#F37B28] whitespace-nowrap">24h Change</span>
            <span className={`text-sm font-mono whitespace-nowrap ${priceChange == null ? 'text-white/50' : isUp ? 'text-green-400' : 'text-red-400'}`}>
              {priceChange == null ? '—' : `${isUp ? '+' : ''}${(priceChange * 100).toFixed(2)}%`}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 shrink-0">
            <span className="text-[10px] text-[#F37B28] whitespace-nowrap">24h Volume</span>
            <span className="text-sm font-mono text-white/70 whitespace-nowrap">{dayNtlVlm != null ? fUSD(dayNtlVlm) : '—'}</span>
          </div>
          <div className="flex flex-col gap-0.5 shrink-0">
            <span className="text-[10px] text-[#F37B28] whitespace-nowrap">Open Interest</span>
            <span className="text-sm font-mono text-white/70 whitespace-nowrap">{openInterest != null ? fUSD(openInterest) : '—'}</span>
          </div>
          <div className="flex flex-col gap-0.5 shrink-0">
            <span className="text-[10px] text-[#F37B28] whitespace-nowrap">1h Funding</span>
            <span className={`text-sm font-mono whitespace-nowrap ${fundingRate == null ? 'text-white/50' : fundingRate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {fundingRate == null ? '—' : `${fundingRate >= 0 ? '+' : ''}${(fundingRate * 100).toFixed(4)}%`}
            </span>
          </div>
        </div>

        {/* ── Market list panel overlay ─────────────────────────────────── */}
        {mktPanel && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-50 bg-black/60" onClick={() => setMktPanel(false)} />
            {/* Floating panel — starts at left edge of stats bar, below it */}
            <div className="fixed z-50 bg-gradient-to-br from-purple-900 via-purple-800 to-purple-900 rounded-xl shadow-2xl overflow-hidden flex flex-col"
                 style={{
                   top: statsBarRef.current
                     ? `${statsBarRef.current.getBoundingClientRect().bottom + 12}px`
                     : '140px',
                   left: '12px',
                   width: '800px',
                   height: '560px'
                 }}>
              {/* Header + Search */}
              <div className="p-4 border-b border-purple-500/30">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-semibold text-lg">Search Markets</h3>
                  <button onClick={() => setMktPanel(false)} className="text-purple-200 hover:text-white transition">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-300" />
                  <input
                    autoFocus
                    value={mktSearch}
                    onChange={e => setMktSearch(e.target.value)}
                    placeholder="Search markets"
                    className="w-full pl-11 pr-4 h-12 rounded-lg bg-purple-950/50 border border-purple-500/30 text-white placeholder:text-purple-300/50 outline-none text-sm"
                  />
                </div>
              </div>

              {/* Category tabs */}
              <div className="flex gap-1 px-3 py-2 border-b border-purple-500/30">
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
              <div className="grid gap-x-2 border-l-2 border-l-transparent text-white/30 px-5 py-2 text-[11px] mr-[11px] grid-cols-[minmax(140px,1.4fr)_repeat(5,1fr)] border-b border-purple-500/30">
                {(['market', 'price', 'change', 'volume', 'oi', 'funding'] as const).map(col => {
                  const labels: Record<string, string> = {
                    market: 'Market', price: 'Price', change: '24h Change',
                    volume: '24h Volume', oi: 'Open Interest', funding: '1h Funding',
                  };
                  const active = sortCol === col;
                  return (
                    <button key={col}
                      onClick={() => {
                        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                        else { setSortCol(col as any); setSortDir('asc'); }
                      }}
                      className={`group flex w-full items-center gap-1 cursor-pointer select-none hover:underline transition-colors ${
                        col === 'market' ? '' : 'flex-row-reverse'
                      } ${active ? 'text-[#F37B28]' : ''}`}>
                      {labels[col]}
                      {active && (
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform duration-200 ${sortDir === 'desc' ? 'rotate-180' : ''}`} aria-hidden="true">
                          <path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>
                        </svg>
                      )}
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
                      className={`w-full grid grid-cols-[minmax(140px,1.4fr)_repeat(5,1fr)] items-center px-3 py-2.5 text-xs transition hover:bg-purple-700/30 rounded-lg border-l-2 ${
                        isSel ? 'border-[#F37B28] bg-[#F37B28]/[0.06]' : 'border-transparent'
                      }`}>
                      {/* Market col */}
                      <div className="flex items-center gap-2">
                        <TokenAvatar symbol={base} />
                        <span className={`font-semibold ${isSel ? 'text-white' : 'text-white/75'}`}>{base}</span>
                        {mLev != null && (
                          <span className="text-[9px] bg-purple-900/40 text-white/40 border border-purple-500/20 rounded px-1 py-0.5 leading-none">
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
          </>
        )}

        {/* ── Chart card ───────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 overflow-hidden">

          {/* Timeframe tabs */}
          <div className="flex items-center gap-0.5 px-3 py-2 border-b border-purple-500/20 shrink-0">
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
          </div>

          {/* TradingView candlestick chart */}
          <div className="flex-1 min-h-0">
            <TVChart symbol={marketBase} interval={TIMEFRAMES.find(t => t.s === tf)?.tv ?? '60'} />
          </div>
        </div>

        {/* ── Bottom card: positions / orders / trade history ─────────────── */}
        <div className="h-[200px] shrink-0 flex bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 overflow-hidden">

        {/* Positions / Orders / Trade History */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex items-center border-b border-purple-500/20 shrink-0 overflow-x-auto scrollbar-none">
            {(['positions', 'orders', 'trades'] as const).map(tab => (
              <button key={tab} onClick={() => setBottomTab(tab)}
                className={`px-4 py-2.5 text-[11px] font-medium transition border-b-2 -mb-px whitespace-nowrap ${bottomTab === tab ? 'border-[#F37B28] text-white' : 'border-transparent text-white/40 hover:text-white/70'}`}>
                {tab === 'positions' ? `Positions (${traderPositions.length})` : tab === 'orders' ? `Open Orders (${traderOrders.length})` : 'Trade History'}
              </button>
            ))}
            {publicKey && (
              <div className="ml-auto pr-3 flex items-center gap-2">
                {bottomTab === 'orders' && traderOrders.length > 0 && (
                  <button onClick={() => cancelAllMut.mutate()} disabled={cancelAllMut.isPending}
                    className="text-[10px] text-red-400/70 hover:text-red-400 transition disabled:opacity-40 border border-red-400/20 hover:border-red-400/40 rounded px-2 py-0.5">
                    {cancelAllMut.isPending ? '…' : 'Cancel All'}
                  </button>
                )}
                <button onClick={() => refetchTrader()} className="text-white/20 hover:text-white/50 transition"><RefreshCw className="h-3 w-3" /></button>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {bottomTab === 'positions' && (
              !isRegistered ? (
                <div className="flex flex-col items-center justify-center h-full text-white/20 text-xs gap-3">
                  <span className="text-3xl opacity-20">✕</span>
                  <a className="text-[#F37B28]/60 hover:text-[#F37B28] transition cursor-pointer">Connect a wallet to view open positions</a>
                </div>
              ) : traderPositions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-white/20 text-xs gap-3">
                  <span className="text-3xl opacity-20">✕</span>
                  <span>No open positions</span>
                </div>
              ) : (
                <div className="px-3 py-2">
                  <div className="grid grid-cols-5 text-[10px] text-white/25 pb-1.5 border-b border-white/5 mb-1">
                    <span>Market</span><span>Side</span><span className="text-right">Size</span><span className="text-right">Entry</span><span className="text-right">PnL</span>
                  </div>
                  {traderPositions.map((p: any, i: number) => {
                    const pnl = pf(p.unrealizedPnl); const size = pf(p.positionSize); const side = size >= 0 ? 'LONG' : 'SHORT';
                    return (
                      <div key={i} className="grid grid-cols-5 py-1.5 text-xs border-b border-white/[0.04] last:border-0">
                        <span className="text-white/70">{stripPerp(p.symbol ?? market)}</span>
                        <span className={side === 'LONG' ? 'text-green-400' : 'text-red-400'}>{side}</span>
                        <span className="text-right font-mono text-white/60">{Math.abs(size).toFixed(3)}</span>
                        <span className="text-right font-mono text-white/60">{fp(pf(p.entryPrice))}</span>
                        <span className={`text-right font-semibold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{pnl >= 0 ? '+' : ''}{fUSD(pnl)}</span>
                      </div>
                    );
                  })}
                </div>
              )
            )}
            {bottomTab === 'orders' && (
              traderOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-white/20 text-xs gap-3">
                  <span className="text-3xl opacity-20">✕</span><span>No open orders</span>
                </div>
              ) : (
                <div className="px-3 py-2">
                  <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] text-[10px] text-white/25 pb-1.5 border-b border-white/5 mb-1 gap-2">
                    <span>Side</span><span className="text-right">Price</span><span className="text-right">Size</span><span className="text-right">Remaining</span><span />
                  </div>
                  {traderOrders.slice(0, 20).map((o: any, i: number) => (
                    <div key={i} className="grid grid-cols-[auto_1fr_1fr_1fr_auto] py-1.5 text-xs border-b border-white/[0.04] last:border-0 gap-2 items-center">
                      <span className={o.side === 'bid' ? 'text-green-400' : 'text-red-400'}>{o.side === 'bid' ? 'BUY' : 'SELL'}</span>
                      <span className="text-right font-mono text-white/60">{fp(pf(o.price))}</span>
                      <span className="text-right font-mono text-white/60">{pf(o.tradeSize).toFixed(3)}</span>
                      <span className="text-right font-mono text-white/40">{pf(o.tradeSizeRemaining).toFixed(3)}</span>
                      <button
                        onClick={() => cancelByIdMut.mutate({ price: BigInt(o.priceInTicks ?? Math.round(pf(o.price) * 100)), orderSequenceNumber: String(o.orderSequenceNumber ?? o.seqNum ?? i) })}
                        disabled={cancelByIdMut.isPending}
                        className="text-[9px] text-red-400/50 hover:text-red-400 transition disabled:opacity-30 px-1">
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )
            )}
            {bottomTab === 'trades' && (
              <div className="px-3 py-2">
                {trades.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-white/20 text-xs py-6">{connected ? 'Waiting for trades…' : 'Connecting…'}</div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 text-[10px] text-white/25 pb-1.5 border-b border-white/5 mb-1">
                      <span>Price</span><span className="text-right">Size</span><span className="text-right">Time</span>
                    </div>
                    {trades.slice(0, 30).map((f: any, i: number) => {
                      const price = pf(f.price ?? f.px ?? f.p); const size = pf(f.baseLots ?? f.size ?? f.qty ?? f.q);
                      const isBuy = f.side === 'buy' || f.side === 'bid' || f.isBuy === true;
                      const ts = f.timestamp ? new Date(f.timestamp).toLocaleTimeString('en-US', {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}) : '—';
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
        </div>{/* end bottom card */}

        </div>{/* end left col */}

        {/* ── Order form card ─────────────────────────────────────────────── */}
        <div className="w-[360px] shrink-0 flex flex-col overflow-hidden bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20">

          {/* Cross button — top of form card */}
          <div className="px-3 pt-3 pb-0 shrink-0">
            <button className="w-full flex items-center justify-between bg-purple-900/40 border border-purple-500/30 rounded-lg px-4 py-2 text-sm font-semibold text-white hover:bg-purple-800/50 transition max-h-[30px]">
              Cross <ChevronDown className="w-4 h-4 text-white/40" />
            </button>
          </div>
            {!publicKey ? (
              <div className="flex flex-col items-center justify-center gap-3 p-6 h-full">
                <User className="h-8 w-8 text-white/10" />
                <p className="text-sm text-white/30">Connect wallet to trade</p>
              </div>
            ) : !isRegistered ? (
              <div className="p-4 flex flex-col gap-3 items-center justify-center h-full">
                <div className="w-12 h-12 rounded-xl bg-[#F37B28]/10 border border-[#F37B28]/20 flex items-center justify-center">
                  <Key className="h-5 w-5 text-[#F37B28]/70" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-white/80 mb-1">Create Phoenix Account</p>
                  <p className="text-[10px] text-white/30 leading-relaxed">
                    Register your on-chain Phoenix perpetuals account to start trading.
                  </p>
                </div>
                <button
                  onClick={() => registerMut.mutate()}
                  disabled={registerMut.isPending || !riseReady}
                  className="w-full py-2.5 bg-[#F37B28] hover:bg-[#e06b1a] rounded-lg text-sm font-semibold text-black transition disabled:opacity-40"
                >
                  {registerMut.isPending ? 'Creating Account…' : !riseReady ? 'Initializing…' : 'Create Account'}
                </button>
                {registerMut.isError && (
                  <p className="text-red-400 text-[10px] text-center">{(registerMut.error as any)?.message ?? 'Failed — please try again.'}</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 px-3 pt-2 pb-3 flex-1 overflow-y-auto">

                {/* Long/Buy — Short/Sell sliding toggle */}
                <div className="relative grid rounded-lg bg-purple-900/40 select-none" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute inset-y-0 left-0 transition-transform duration-200" style={{ width: '50%', transform: orderSide === 'buy' ? 'translateX(0)' : 'translateX(100%)' }}>
                      <div className={`absolute inset-0 rounded-lg ${orderSide === 'buy' ? 'bg-[#22c55e]' : 'bg-[#ef4444]'}`} />
                    </div>
                  </div>
                  <button type="button" onClick={() => setOrderSide('buy')}
                    className={`relative z-10 px-2.5 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 ${orderSide === 'buy' ? 'text-black' : 'text-white/40 hover:text-white/70'}`}>
                    Long/Buy
                  </button>
                  <button type="button" onClick={() => setOrderSide('sell')}
                    className={`relative z-10 px-2.5 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 ${orderSide === 'sell' ? 'text-white' : 'text-white/40 hover:text-white/70'}`}>
                    Short/Sell
                  </button>
                </div>

                {/* Market/Limit + Price input */}
                <div className="grid grid-cols-2 gap-2">
                  {/* Market/Limit toggle */}
                  <div className="relative grid rounded-lg bg-purple-900/40 select-none" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                    <div className="pointer-events-none absolute inset-0">
                      <div className="absolute inset-y-0 left-0 transition-transform duration-200" style={{ width: '50%', transform: orderType === 'market' ? 'translateX(0)' : 'translateX(100%)' }}>
                        <div className={`absolute inset-0.5 rounded-md border ${orderSide === 'buy' ? 'border-[#22c55e] bg-[#22c55e]/10' : 'border-[#ef4444] bg-[#ef4444]/10'}`} />
                      </div>
                    </div>
                    <button type="button" onClick={() => setOrderType('market')}
                      className={`relative z-10 px-2.5 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 ${orderType === 'market' ? (orderSide === 'buy' ? 'text-[#22c55e]' : 'text-[#ef4444]') : 'text-white/40 hover:text-white/70'}`}>
                      Market
                    </button>
                    <button type="button" onClick={() => setOrderType('limit')}
                      className={`relative z-10 px-2.5 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 ${orderType === 'limit' ? (orderSide === 'buy' ? 'text-[#22c55e]' : 'text-[#ef4444]') : 'text-white/40 hover:text-white/70'}`}>
                      Limit
                    </button>
                  </div>
                  {/* Price input */}
                  <div className={`flex items-center bg-purple-900/40 rounded-lg px-3 py-1.5 gap-1.5 min-h-[36px] ${orderType === 'market' ? 'opacity-50' : ''}`}>
                    <span className="text-white/40 text-xs shrink-0">$</span>
                    <input
                      type="number"
                      disabled={orderType === 'market'}
                      value={orderType === 'market' ? (markPrice?.toFixed(2) ?? '') : orderPrice}
                      onChange={e => setOrderPrice(e.target.value)}
                      placeholder="0"
                      className="flex-1 bg-transparent text-sm font-mono tabular-nums text-white outline-none min-w-0"
                    />
                    <button className="shrink-0 bg-purple-950/60 rounded px-1.5 py-1 text-[11px] text-white/50 font-medium">MID</button>
                  </div>
                </div>

                {/* Available / Position */}
                <div className="flex flex-col gap-1.5">
                  <div className="px-0 flex justify-between items-center">
                    <span className="text-white/40 text-xs leading-none">Available to Trade</span>
                    <span className="text-white text-xs font-semibold leading-none">{fUSD(pf(td?.collateralBalance))}</span>
                  </div>
                  <div className="px-0 flex justify-between items-center">
                    <span className="text-white/40 text-xs leading-none">Position</span>
                    <span className="text-white/40 text-xs font-semibold leading-none">-</span>
                  </div>
                </div>

                {/* Order Size input */}
                <div className="bg-purple-900/40 rounded-lg p-2.5 grid grid-cols-[auto_1fr] items-start gap-2">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-white/40 leading-none">Order Size</label>
                    <button className="bg-purple-950/60 rounded px-2 py-1.5 text-xs text-white/60 font-medium flex items-center gap-1">
                      {marketBase}
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>
                    </button>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <input
                      type="number"
                      value={orderSize}
                      onChange={e => setOrderSize(e.target.value)}
                      placeholder="0"
                      className="bg-transparent text-2xl font-semibold tabular-nums text-white text-right outline-none w-full leading-none"
                    />
                    <div className="text-xs text-white/40 leading-none">
                      {markPrice && orderSize ? fUSD(pf(orderSize) * markPrice) : '$0.00'}
                    </div>
                  </div>
                </div>

                {/* Order Leverage */}
                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg border border-purple-500/20">
                  <div className="flex items-center gap-1.5 text-xs text-white/40">Order Leverage</div>
                  <span className="text-base text-right font-semibold text-white/40 leading-none">-</span>
                </div>

                {/* Checkboxes */}
                <div className="grid grid-cols-2 gap-4 px-3">
                  <label className="flex items-center gap-2 text-xs text-white/40 cursor-not-allowed opacity-50 select-none">
                    <span className="w-4 h-4 shrink-0 rounded-sm border border-white/30 bg-purple-900/40 inline-block" />
                    Reduce Only
                  </label>
                  <label className="flex items-center gap-2 text-xs text-white/40 cursor-not-allowed opacity-50 select-none">
                    <span className="w-4 h-4 shrink-0 rounded-sm border border-white/30 bg-purple-900/40 inline-block" />
                    Post Only
                  </label>
                  <div className="col-span-2">
                    <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer select-none" onClick={() => setTpslEnabled(v => !v)}>
                      <span className={`w-4 h-4 shrink-0 rounded-sm border inline-flex items-center justify-center transition ${tpslEnabled ? 'border-[#F37B28] bg-[#F37B28]' : 'border-white/30 bg-purple-900/40'}`}>
                        {tpslEnabled && <svg className="w-2.5 h-2.5 text-black" viewBox="0 0 10 10" fill="currentColor"><path d="M1.5 5L4 7.5 8.5 2.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>}
                      </span>
                      Take Profit / Stop Loss
                    </label>
                  </div>
                </div>

                {/* TP/SL inputs — shown when checkbox is ticked */}
                {tpslEnabled && (
                  <div className="flex flex-col gap-2 px-1">
                    <div className="flex items-center bg-purple-900/40 rounded-lg px-3 py-1.5 gap-2">
                      <span className="text-[10px] text-green-400/70 shrink-0 w-16">Take Profit</span>
                      <span className="text-white/30 text-xs">$</span>
                      <input
                        type="number"
                        value={takeProfitPrice}
                        onChange={e => setTakeProfitPrice(e.target.value)}
                        placeholder="0.00"
                        className="flex-1 bg-transparent text-sm font-mono text-white outline-none min-w-0"
                      />
                    </div>
                    <div className="flex items-center bg-purple-900/40 rounded-lg px-3 py-1.5 gap-2">
                      <span className="text-[10px] text-red-400/70 shrink-0 w-16">Stop Loss</span>
                      <span className="text-white/30 text-xs">$</span>
                      <input
                        type="number"
                        value={stopLossPrice}
                        onChange={e => setStopLossPrice(e.target.value)}
                        placeholder="0.00"
                        className="flex-1 bg-transparent text-sm font-mono text-white outline-none min-w-0"
                      />
                    </div>
                  </div>
                )}

                {/* Place order / Deposit */}
                {placeMut.isError && <p className="text-red-400 text-[10px] break-all px-1">{(placeMut.error as any)?.message ?? 'Order failed'}</p>}
                {txSig && (
                  <a href={`https://solscan.io/tx/${txSig}`} target="_blank" rel="noopener noreferrer" className="text-green-400 text-[10px] truncate hover:underline px-1">
                    ✓ {txSig.slice(0, 22)}… ↗
                  </a>
                )}
                <button
                  onClick={() => placeMut.mutate({ side: orderSide })}
                  disabled={placeMut.isPending || !riseReady}
                  className={`w-full py-2 rounded-lg text-base font-semibold transition disabled:opacity-40 ${
                    orderSide === 'buy'
                      ? 'bg-[#22c55e] hover:bg-[#16a34a] text-black'
                      : 'bg-[#ef4444] hover:bg-[#dc2626] text-white'
                  }`}
                >
                  {placeMut.isPending ? '…' : !riseReady ? 'Initializing…' : orderSide === 'buy' ? 'Long/Buy' : 'Short/Sell'}
                </button>

                {/* Summary */}
                <div className="bg-purple-950/50 rounded-[10px] p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/40 leading-none">Expected Price</span>
                    <span className="text-white font-medium leading-none">{markPrice ? fp(markPrice) : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/40 leading-none">Est. Liquidation Price</span>
                    <span className="text-white/40 font-medium leading-none">—</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/40 leading-none">Order Value</span>
                    <span className="text-white font-medium leading-none">{markPrice && orderSize ? fUSD(pf(orderSize) * markPrice) : '$0.00'}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/40 leading-none">Margin Required</span>
                    <span className="text-white font-medium leading-none">$0.00</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/40 leading-none">Slippage</span>
                    <span className="text-white font-medium leading-none">Est: - / Max: 1%</span>
                  </div>
                  {takerFee != null && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/40 leading-none">Fees</span>
                      <span className="flex items-center gap-1.5">
                        <span className="text-white/40 line-through">{(takerFee * 100).toFixed(3)}%</span>
                        <span className="text-white font-medium">{(takerFee * 100 * 0.9).toFixed(4)}%</span>
                      </span>
                    </div>
                  )}
                </div>

              </div>
            )}
        </div>

      </div>{/* end content area */}
    </div>
  );
}
