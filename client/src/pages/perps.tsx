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
  ArrowLeft, ExternalLink, Activity, TrendingUp, TrendingDown,
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

function TokenAvatar({ symbol }: { symbol: string }) {
  const COLOR_MAP: Record<string, string> = {
    BTC: '#f7931a', SOL: '#9945ff', ETH: '#627eea', HYPE: '#6366f1',
    GOLD: '#d4af37', SILVER: '#9ca3af', WTIOIL: '#2b5f48', XRP: '#346aa9',
    FARTCOIN: '#22c55e', JUP: '#a3e635', VVV: '#8b5cf6', DOGE: '#c2952e',
    ZEC: '#e8b86d', SUI: '#4da2ff', AVAX: '#e84142', LINK: '#2a5ada',
    ONDO: '#3b82f6', PENGU: '#60a5fa', TRUMP: '#ef4444', WIF: '#f59e0b',
  };
  const bg = COLOR_MAP[symbol] ?? '#6b7280';
  return (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold shrink-0 border border-white/10"
      style={{ background: bg, fontSize: symbol.length > 3 ? '7px' : '8px' }}
    >
      {symbol.slice(0, 3)}
    </div>
  );
}

// ── Rise SDK client — ws: eager mode enables client.streams ──────────────────

function useRiseClient() {
  const [client, setClient] = useState<any>(null);
  const [ready,  setReady]  = useState(false);

  useEffect(() => {
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY}`;
    let cancelled = false;
    let c: any;
    try {
      c = createPhoenixClient({
        apiUrl: PHOENIX_API_URL,
        rpcUrl,
        ws: { connectMode: 'eager' },     // enables client.streams.*
        flight: {
          builderAuthority: BUILDER_AUTHORITY,
          builderPdaIndex: 0,
          builderSubaccountIndex: 0,
        },
      } as any);
    } catch { return; }

    if (!cancelled) setClient(c);

    // exchange.ready() loads market metadata needed for order building
    // timeout after 8s so streams start even if metadata fetch is slow
    const timer = setTimeout(() => { if (!cancelled) setReady(true); }, 8000);
    c.exchange?.ready?.()
      ?.then(() => { clearTimeout(timer); if (!cancelled) setReady(true); })
      ?.catch(() => { clearTimeout(timer); if (!cancelled) setReady(true); });

    return () => { cancelled = true; clearTimeout(timer); };
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
  const { publicKey, signTransaction, connection } = useWalletAdapter();
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

  const markPrice    = stats?.markPx ?? null;
  const indexPrice   = stats?.oraclePx ?? null;
  // Prefer dedicated fundingRate WS channel; fall back to market stats
  const fundingRate  = wsFunding?.rate ?? stats?.funding ?? null;
  const nextFunding  = wsFunding?.nextRate ?? null;
  const dayNtlVlm    = stats?.dayNtlVlm ?? null;
  const openInterest = stats?.openInterest ?? null;
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

  const marketBase = stripPerp(market);
  const liveMidSelected = allMids[marketBase] ?? allMids[market] ?? null;

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
    <div className="h-screen bg-[#0b0b12] text-white flex flex-col overflow-hidden">

      {/* ── Nav bar ──────────────────────────────────────────────────────── */}
      <nav className="flex items-center justify-between px-4 md:px-6 py-3 gap-8 border-b border-white/[0.07] bg-[#0e0e18] shrink-0">

        {/* Logo */}
        <Link href="/"><a className="shrink-0">
          <img src={logoImage} alt="logo" className="h-5 w-auto" />
        </a></Link>

        {/* Nav links */}
        <div className="hidden md:flex flex-1 items-center justify-start gap-0.5">
          <span className="flex items-center gap-1.5 px-2 py-2.5 text-sm font-semibold text-white">
            Trade
          </span>
          <span className="flex items-center gap-1.5 px-2 py-2.5 text-sm font-semibold text-white/30 opacity-50 cursor-not-allowed select-none">
            Portfolio
          </span>
          <span className="flex items-center gap-1.5 px-2 py-2.5 text-sm font-semibold text-white/30 opacity-50 cursor-not-allowed select-none">
            Rewards
          </span>
        </div>

        {/* Right: wallet + bell + phoenix link */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Wallet pill */}
          <div className="hidden md:flex items-center gap-2 bg-white/[0.06] border border-white/[0.09] rounded-lg px-3 py-2 text-xs font-semibold text-white/75">
            <div className="w-1.5 h-1.5 rounded-full bg-purple-400/80" />
            {publicKey?.toString().slice(0, 4)}…{publicKey?.toString().slice(-4)}
          </div>
          {/* Bell */}
          <button className="flex items-center justify-center w-8 h-8 rounded-full bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.07] transition text-white/40 hover:text-white/70">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.268 21a2 2 0 0 0 3.464 0"/>
              <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>
            </svg>
          </button>
          {/* Phoenix external link */}
          <a href="https://phoenix.trade" target="_blank" rel="noopener noreferrer"
            className="hidden md:flex items-center gap-1 text-[11px] text-white/25 hover:text-white/55 transition">
            Phoenix <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </nav>

      {/* ── Market card ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-white/[0.07] shrink-0 bg-[#0b0b12] overflow-x-auto scrollbar-none">

        {/* Market selector — Phoenix combobox style */}
        <button
          onClick={() => { setMktPanel(v => !v); setMktSearch(''); }}
          className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition shrink-0 ${
            mktPanel ? 'bg-white/[0.07]' : 'bg-white/[0.04] hover:bg-white/[0.07]'
          }`}
        >
          <TokenAvatar symbol={marketBase} />
          <span className="text-xl font-medium text-white flex items-center gap-2">
            {marketBase}
            {maxLev && (
              <span className="inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium bg-white/[0.07] text-white/55">
                {maxLev}×
              </span>
            )}
            <ChevronDown className={`w-4 h-4 text-white/40 transition-transform duration-200 ${mktPanel ? 'rotate-180' : ''}`} />
          </span>
        </button>

        {/* Stats row */}
        <div className="flex items-center gap-4 md:gap-8 font-medium overflow-x-auto scrollbar-none">

          {/* Mark */}
          <div className="flex flex-col gap-1 shrink-0">
            <span className="text-xs text-white/40 whitespace-nowrap">Mark</span>
            <span className="text-xs whitespace-nowrap tabular-nums text-white">
              {markPrice != null ? fp(markPrice) : '—'}
            </span>
          </div>

          {/* Index */}
          {indexPrice != null && (
            <div className="flex flex-col gap-1 shrink-0">
              <span className="text-xs text-white/40 whitespace-nowrap">Index</span>
              <span className="text-xs whitespace-nowrap tabular-nums text-white/75">{fp(indexPrice)}</span>
            </div>
          )}

          {/* 24h Change */}
          {markPrice != null && stats?.prevDayPx != null && stats.prevDayPx > 0 && (
            <div className="flex flex-col gap-1 shrink-0">
              <span className="text-xs text-white/40 whitespace-nowrap">24h Change</span>
              <span className={`text-xs whitespace-nowrap tabular-nums flex items-center gap-1 ${isUp ? 'text-green-400' : 'text-red-400'}`}>
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

          {/* 24h Volume */}
          {dayNtlVlm != null && dayNtlVlm > 0 && (
            <div className="flex flex-col gap-1 shrink-0">
              <span className="text-xs text-white/40 whitespace-nowrap">24h Volume</span>
              <span className="text-xs whitespace-nowrap tabular-nums text-white/75">{fUSD(dayNtlVlm)}</span>
            </div>
          )}

          {/* Open Interest */}
          {openInterest != null && openInterest > 0 && (
            <div className="flex flex-col gap-1 shrink-0">
              <span className="text-xs text-white/40 whitespace-nowrap">Open Interest</span>
              <span className="text-xs whitespace-nowrap tabular-nums text-white/75">{fUSD(openInterest)}</span>
            </div>
          )}

          {/* 1h Funding */}
          {fundingRate != null && (
            <div className="flex flex-col gap-1 shrink-0">
              <span className="text-xs text-white/40 whitespace-nowrap">1h Funding</span>
              <span className="text-xs whitespace-nowrap tabular-nums flex gap-2">
                <span className={fundingRate >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {fundingRate >= 0 ? '+' : ''}{(fundingRate * 100).toFixed(4)}%
                </span>
                {fundingCountdown && <span className="text-white/45">{fundingCountdown}</span>}
              </span>
            </div>
          )}

          {/* Live badge */}
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
            <div className="w-[560px] bg-[#0e0e18] border-r border-white/[0.1] flex flex-col shadow-2xl overflow-hidden">
              {/* Search */}
              <div className="p-3 border-b border-white/[0.07]">
                <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2">
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
              <div className="flex gap-1 px-3 py-2 border-b border-white/[0.07]">
                {(['all', 'crypto', 'commodities'] as const).map(cat => (
                  <button key={cat} onClick={() => setMktCat(cat)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                      mktCat === cat
                        ? 'bg-purple-600/30 text-purple-300'
                        : 'text-white/35 hover:text-white/60'
                    }`}>
                    {cat === 'all' ? 'All' : cat === 'crypto' ? 'Crypto' : 'Commodities'}
                  </button>
                ))}
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[minmax(140px,1.4fr)_repeat(5,1fr)] px-3 py-2 border-b border-white/[0.07]">
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
                      } ${active ? 'text-white/60' : 'text-white/30 hover:text-white/55'}`}>
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
                        isSel ? 'border-purple-500 bg-purple-500/[0.06]' : 'border-transparent'
                      }`}>
                      {/* Market col */}
                      <div className="flex items-center gap-2">
                        <TokenAvatar symbol={base} />
                        <span className={`font-semibold ${isSel ? 'text-white' : 'text-white/75'}`}>{base}</span>
                        {mLev != null && (
                          <span className="text-[9px] bg-white/[0.06] text-white/40 border border-white/[0.08] rounded px-1 py-0.5 leading-none">
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
        <div className="flex-1 flex flex-col min-w-0 border-r border-white/[0.07] overflow-hidden">

          {/* Chart */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Timeframe tabs */}
            <div className="flex items-center gap-0.5 px-3 py-2 border-b border-white/[0.07] shrink-0">
              {TIMEFRAMES.map(t => (
                <button key={t.s} onClick={() => setTf(t.s)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                    tf === t.s
                      ? 'bg-purple-600/80 text-white'
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
                        <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
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
                      contentStyle={{ background: '#16121f', border: '1px solid rgba(168,85,247,0.25)', borderRadius: 8, fontSize: 11 }}
                      labelFormatter={v => fTime(Number(v), tf)}
                      formatter={(v: unknown, name: string) =>
                        name === 'price' ? [fp(Number(v)), 'Price'] : [Number(v).toFixed(2), 'Volume']
                      }
                    />
                    <Bar  yAxisId="v" dataKey="volume" fill="rgba(168,85,247,0.1)" radius={[1,1,0,0]} maxBarSize={6} />
                    <Area yAxisId="p" type="monotone" dataKey="price" stroke="#a855f7" strokeWidth={1.5}
                      fill="url(#perpG)" dot={false} activeDot={{ r: 3, fill: '#a855f7', strokeWidth: 0 }} />
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
          <div className="border-t border-white/[0.07] shrink-0 flex flex-col" style={{ height: '180px' }}>
            {/* Tab headers */}
            <div className="flex items-center border-b border-white/[0.07] shrink-0">
              {(['positions', 'orders', 'trades'] as const).map(tab => (
                <button key={tab} onClick={() => setBottomTab(tab)}
                  className={`px-4 py-2.5 text-[11px] font-medium transition border-b-2 -mb-px ${
                    bottomTab === tab
                      ? 'border-purple-500 text-white'
                      : 'border-transparent text-white/35 hover:text-white/60'
                  }`}>
                  {tab === 'positions' ? `Positions${traderPositions.length ? ` (${traderPositions.length})` : ''}` :
                   tab === 'orders'    ? `Open Orders${traderOrders.length ? ` (${traderOrders.length})` : ''}` :
                   'Recent Trades'}
                </button>
              ))}
              {connected && bottomTab === 'trades' && (
                <span className="ml-auto pr-3 text-[9px] text-green-400/40">● live</span>
              )}
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

        {/* ── Right column: 350px orderbook + order form ────────────────── */}
        <div className="w-[350px] shrink-0 flex flex-col overflow-hidden">

          {/* Orderbook header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.07] shrink-0">
            <span className="text-[10px] font-semibold text-white/35 uppercase tracking-wider">Order Book</span>
            <div className="flex items-center gap-2">
              {connected && <span className="text-[9px] text-green-400/40">● live</span>}
            </div>
          </div>

          {/* Orderbook col headers */}
          <div className="flex items-center justify-between px-3 py-1 border-b border-white/[0.04] shrink-0">
            <span className="text-[10px] text-white/22">Price</span>
            <span className="text-[10px] text-white/22">Size</span>
          </div>

          {/* Asks */}
          <div className="flex flex-col overflow-hidden" style={{ flex: '1 1 0', minHeight: 0 }}>
            <div className="flex-1 overflow-y-auto flex flex-col justify-end">
              {displayAsks.length > 0
                ? <OBSide rows={displayAsks} side="ask" />
                : <div className="text-center text-white/15 text-xs py-3">{connected ? 'Waiting…' : '…'}</div>
              }
            </div>

            {/* Mid price */}
            <div className="flex items-center justify-between px-3 py-2 bg-white/[0.03] border-y border-white/[0.08] shrink-0">
              <span className={`text-sm font-bold font-mono ${isUp ? 'text-green-400' : 'text-red-400'}`}>
                {fp(midPrice)}
              </span>
              <span className="text-[10px] text-white/20">
                {isUp ? '▲' : '▼'} mid
              </span>
            </div>

            {/* Bids */}
            <div className="flex-1 overflow-y-auto">
              {displayBids.length > 0
                ? <OBSide rows={displayBids} side="bid" />
                : <div className="text-center text-white/15 text-xs py-3">{connected ? 'Waiting…' : '…'}</div>
              }
            </div>
          </div>

          {/* ── Order form ─────────────────────────────────────────────── */}
          <div className="border-t border-white/[0.07] p-4 flex flex-col gap-3 overflow-y-auto shrink-0">

            {!publicKey ? (
              <div className="text-center py-4 flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-white/[0.04] flex items-center justify-center">
                  <User className="h-5 w-5 text-white/20" />
                </div>
                <p className="text-xs text-white/30">Connect wallet to trade</p>
              </div>

            ) : !isRegistered ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5 text-purple-400/70" />
                  <span className="text-xs font-semibold text-white/60">Activate Phoenix Account</span>
                </div>
                <p className="text-[10px] text-white/25 leading-relaxed">
                  Enter your Phoenix invite code to trade perps on-chain.
                </p>
                <input value={inviteCode} onChange={e => setInviteCode(e.target.value)}
                  placeholder="Invite code…"
                  className="bg-white/[0.04] border border-white/[0.09] rounded-lg px-3 py-2 text-xs text-white placeholder-white/20 outline-none focus:border-purple-500/40 transition" />
                <button onClick={() => registerMut.mutate()}
                  disabled={!inviteCode.trim() || registerMut.isPending}
                  className="w-full py-2 bg-purple-700/50 hover:bg-purple-600/60 border border-purple-500/25 rounded-lg text-xs font-medium text-white/80 transition disabled:opacity-40">
                  {registerMut.isPending ? 'Activating…' : 'Activate Account'}
                </button>
                {registerMut.isError   && <p className="text-red-400   text-[10px]">Failed — check your code.</p>}
                {registerMut.isSuccess && <p className="text-green-400 text-[10px]">Activated! Refreshing…</p>}
              </div>

            ) : (
              <>
                {/* Account summary */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/[0.04] rounded-lg px-3 py-2 border border-white/[0.06]">
                    <div className="text-[9px] text-white/25 uppercase tracking-wider mb-0.5">Collateral</div>
                    <div className="text-xs font-semibold">{fUSD(pf(td?.collateralBalance))}</div>
                  </div>
                  <div className="bg-white/[0.04] rounded-lg px-3 py-2 border border-white/[0.06]">
                    <div className="text-[9px] text-white/25 uppercase tracking-wider mb-0.5">Unreal PnL</div>
                    <div className={`text-xs font-semibold ${pf(td?.unrealizedPnl) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {pf(td?.unrealizedPnl) >= 0 ? '+' : ''}{fUSD(pf(td?.unrealizedPnl))}
                    </div>
                  </div>
                </div>

                {/* Order type tabs */}
                <div className="flex bg-white/[0.04] rounded-lg p-0.5 border border-white/[0.06]">
                  {(['market', 'limit'] as const).map(t => (
                    <button key={t} onClick={() => setOrderType(t)}
                      className={`flex-1 py-1.5 rounded-md text-[11px] font-medium transition ${
                        orderType === t ? 'bg-purple-600/90 text-white shadow-sm' : 'text-white/35 hover:text-white/60'
                      }`}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Price input (limit only) */}
                {orderType === 'limit' && (
                  <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.09] rounded-lg px-3 py-2">
                    <span className="text-[10px] text-white/30 shrink-0">Price $</span>
                    <input type="number" value={orderPrice} onChange={e => setOrderPrice(e.target.value)}
                      placeholder={markPrice ? markPrice.toFixed(2) : '0.00'}
                      className="flex-1 bg-transparent text-xs text-white outline-none min-w-0" />
                  </div>
                )}

                {/* Size input */}
                <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.09] rounded-lg px-3 py-2">
                  <span className="text-[10px] text-white/30 shrink-0">Size</span>
                  <input type="number" value={orderSize} onChange={e => setOrderSize(e.target.value)}
                    placeholder="0.1"
                    className="flex-1 bg-transparent text-xs text-white outline-none min-w-0" />
                  <span className="text-[10px] text-white/20 shrink-0">{marketBase}</span>
                </div>

                {orderType === 'market' && markPrice && (
                  <p className="text-[10px] text-white/20">
                    ≈ {fUSD(pf(orderSize) * markPrice)} · 5% slippage
                  </p>
                )}

                {/* Long / Short buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => placeMut.mutate({ side: 'buy' })}
                    disabled={placeMut.isPending || !riseReady}
                    className="flex items-center justify-center gap-1.5 py-3 bg-green-600/80 hover:bg-green-500/80 active:bg-green-700 rounded-xl text-sm font-bold transition disabled:opacity-40 shadow-sm">
                    <TrendingUp className="h-4 w-4" />
                    {placeMut.isPending ? '…' : 'Long'}
                  </button>
                  <button onClick={() => placeMut.mutate({ side: 'sell' })}
                    disabled={placeMut.isPending || !riseReady}
                    className="flex items-center justify-center gap-1.5 py-3 bg-red-600/80 hover:bg-red-500/80 active:bg-red-700 rounded-xl text-sm font-bold transition disabled:opacity-40 shadow-sm">
                    <TrendingDown className="h-4 w-4" />
                    {placeMut.isPending ? '…' : 'Short'}
                  </button>
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

                <div className="text-[9px] text-white/12 text-center pt-0.5">
                  Flight fee routing · {BUILDER_AUTHORITY.slice(0, 8)}…
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
