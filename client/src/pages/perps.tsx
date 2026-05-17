/**
 * Phoenix Perpetuals — real-time data via Phoenix WS + Rise SDK trading
 * https://perp-api.phoenix.trade  |  @ellipsis-labs/rise
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Transaction } from '@solana/web3.js';
import { Side, createPhoenixClient } from '@ellipsis-labs/rise';
import { Link } from 'wouter';
import {
  ArrowLeft, ExternalLink, Activity, TrendingUp, TrendingDown,
  RefreshCw, Key, User, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  ComposedChart, Area, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';

const logoImage       = '/logo.png';
const PHOENIX_WS      = 'wss://perp-api.phoenix.trade/v1/ws';
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

// ── Phoenix WebSocket ─────────────────────────────────────────────────────────

interface MarketStats {
  markPx: number; midPx: number; oraclePx: number;
  prevDayPx: number; dayNtlVlm: number; openInterest: number; funding: number;
}
interface OB { bids: [number, number][]; asks: [number, number][]; mid: number | null; }

function toOBRow(r: any): [number, number] {
  if (Array.isArray(r)) return [toNum(r[0]), toNum(r[1])];
  return [toNum(r.price ?? r.px), toNum(r.size ?? r.qty)];
}

interface FundingRate { rate: number; nextRate: number | null; }

function usePhoenixWS(symbol: string, wsTimeframe: string, authority?: string) {
  const [connected,    setConnected]    = useState(false);
  const [stats,        setStats]        = useState<MarketStats | null>(null);
  const [ob,           setOb]           = useState<OB>({ bids: [], asks: [], mid: null });
  const [trades,       setTrades]       = useState<any[]>([]);
  const [liveCandle,   setLiveCandle]   = useState<any>(null);
  const [allMids,      setAllMids]      = useState<Record<string, number>>({});
  const [fundingRate,  setFundingRate]  = useState<FundingRate | null>(null);
  const [liveTrader,   setLiveTrader]   = useState<any>(null);
  const wsRef   = useRef<WebSocket | null>(null);
  const deadRef = useRef(false);
  const sym = stripPerp(symbol);

  useEffect(() => {
    deadRef.current = false;

    function connect() {
      if (deadRef.current) return;
      const ws = new WebSocket(PHOENIX_WS);
      wsRef.current = ws;

      ws.onopen = () => {
        if (deadRef.current) { ws.close(); return; }
        setConnected(true);
        const subs: object[] = [
          { channel: 'allMids' },
          { channel: 'market',       symbol: sym },
          { channel: 'orderbook',    symbol: sym },
          { channel: 'trades',       symbol: sym },
          { channel: 'candles',      symbol: sym, timeframe: wsTimeframe },
          { channel: 'fundingRate',  symbol: sym },
        ];
        // Subscribe to real-time trader state if wallet connected
        if (authority) {
          subs.push({ channel: 'traderState', authority, traderPdaIndex: 0 });
        }
        subs.forEach(sub => ws.send(JSON.stringify({ type: 'subscribe', subscription: sub })));
      };

      ws.onmessage = ({ data: raw }) => {
        try {
          const msg = JSON.parse(raw as string);
          const ch = msg.channel ?? msg.type;
          const d  = msg.data;
          if (!d) return;
          if (ch === 'allMids') {
            const parsed: Record<string, number> = {};
            for (const [k, v] of Object.entries(d)) parsed[k] = toNum(v);
            setAllMids(parsed);
          } else if (ch === 'market') {
            setStats({
              markPx:       toNum(d.markPx  ?? d.mark_px),
              midPx:        toNum(d.midPx   ?? d.mid_px),
              oraclePx:     toNum(d.oraclePx ?? d.oracle_px),
              prevDayPx:    toNum(d.prevDayPx ?? d.prev_day_px),
              dayNtlVlm:    toNum(d.dayNtlVlm ?? d.day_ntl_vlm),
              openInterest: toNum(d.openInterest ?? d.open_interest),
              funding:      toNum(d.funding),
            });
          } else if (ch === 'orderbook') {
            setOb({
              bids: (d.bids ?? []).map(toOBRow),
              asks: (d.asks ?? []).map(toOBRow),
              mid:  d.mid != null ? toNum(d.mid) : null,
            });
          } else if (ch === 'trades') {
            const arr: any[] = Array.isArray(d) ? d : [d];
            setTrades(prev => [...arr, ...prev].slice(0, 60));
          } else if (ch === 'candle' || ch === 'candles') {
            setLiveCandle(d);
          } else if (ch === 'fundingRate') {
            setFundingRate({
              rate:     toNum(d.fundingRate ?? d.rate ?? d.current),
              nextRate: d.nextFundingRate != null ? toNum(d.nextFundingRate ?? d.next) : null,
            });
          } else if (ch === 'traderState') {
            // Snapshot: replace; delta: merge
            if (d.type === 'snapshot' || !d.type) {
              setLiveTrader(d.snapshot ?? d);
            } else if (d.type === 'delta') {
              setLiveTrader((prev: any) => prev ? { ...prev, ...d.delta } : d.delta);
            }
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!deadRef.current) setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
    }

    connect();
    return () => { deadRef.current = true; wsRef.current?.close(); };
  }, [sym, wsTimeframe, authority]);

  return { connected, stats, ob, trades, liveCandle, allMids, fundingRate, liveTrader };
}

// ── Rise SDK client ───────────────────────────────────────────────────────────

function useRiseClient() {
  const clientRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY}`;
    let cancelled = false;
    try {
      const c = createPhoenixClient({
        apiUrl: PHOENIX_API_URL,
        rpcUrl,
        exchangeMetadata: { stream: true },
        flight: {
          builderAuthority: BUILDER_AUTHORITY,
          builderPdaIndex: 0,
          builderSubaccountIndex: 0,
        },
      });
      c.exchange.ready().then(() => {
        if (!cancelled) { clientRef.current = c; setReady(true); }
      }).catch(() => {});
    } catch {}
    return () => { cancelled = true; };
  }, []);

  return { client: clientRef.current as any, ready };
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

export default function PerpsPage() {
  const qc = useQueryClient();
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { client: riseClient, ready: riseReady } = useRiseClient();

  // Block anyone except the allowed wallet
  if (!publicKey || publicKey.toString() !== ALLOWED_WALLET) {
    return <AccessGate />;
  }

  const [market,       setMarket]       = useState('SOL-PERP');
  const [tf,           setTf]           = useState('3600');
  const [inviteCode,   setInviteCode]   = useState('');
  const [orderType,    setOrderType]    = useState<'market' | 'limit'>('market');
  const [orderPrice,   setOrderPrice]   = useState('');
  const [orderSize,    setOrderSize]    = useState('0.1');
  const [txSig,        setTxSig]        = useState<string | null>(null);
  const [bottomTab,    setBottomTab]    = useState<'positions' | 'orders' | 'trades'>('positions');
  const [mktDropdown,  setMktDropdown]  = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const wsTimeframe = TIMEFRAMES.find(t => t.s === tf)?.ws ?? '1h';
  const wsAuthority = publicKey?.toString();
  const { connected, stats, ob, trades, liveCandle, allMids, fundingRate: wsFunding, liveTrader } =
    usePhoenixWS(market, wsTimeframe, wsAuthority);

  // Close dropdown on outside click
  useEffect(() => {
    function h(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setMktDropdown(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: marketsRaw } = useQuery<unknown>({
    queryKey: ['/api/perps/markets'],
    queryFn: async () => (await fetch('/api/perps/markets')).json(),
    staleTime: 60_000,
  });

  const { data: candlesRaw } = useQuery<unknown>({
    queryKey: ['/api/perps/candles', market, tf],
    queryFn: async () =>
      (await fetch(`/api/perps/candles/${encodeURIComponent(market)}?timeframe=${tf}&limit=120`)).json(),
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
    queryFn: async () => (await fetch('/api/perps/exchange')).json(),
    staleTime: 300_000,
  });

  const { data: traderRaw, refetch: refetchTrader } = useQuery<unknown>({
    queryKey: ['/api/perps/trader', publicKey?.toString()],
    queryFn: async () => (await fetch(`/api/perps/trader/${publicKey!.toString()}`)).json(),
    enabled: !!publicKey,
    refetchInterval: 10_000,
    staleTime: 8_000,
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
      const sig = await sendTransaction(tx, connection);
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

  return (
    <div className="h-screen bg-[#0b0b12] text-white flex flex-col overflow-hidden">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0 border-b border-white/[0.07] shrink-0 h-12">

        {/* Logo / back */}
        <div className="flex items-center gap-2 px-3 border-r border-white/[0.07] h-full shrink-0">
          <Link href="/"><a className="text-white/40 hover:text-white transition"><ArrowLeft className="h-4 w-4" /></a></Link>
          <img src={logoImage} alt="logo" className="h-6 w-auto" />
        </div>

        {/* Market selector dropdown */}
        <div className="relative border-r border-white/[0.07] h-full shrink-0" ref={dropRef}>
          <button
            onClick={() => setMktDropdown(v => !v)}
            className="flex items-center gap-2 px-4 h-full hover:bg-white/[0.04] transition"
          >
            <span className="font-bold text-white text-sm tracking-tight">{marketBase}</span>
            {maxLev && (
              <span className="text-[10px] font-semibold bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded px-1.5 py-0.5">
                {maxLev}×
              </span>
            )}
            {mktDropdown
              ? <ChevronUp className="h-3.5 w-3.5 text-white/40" />
              : <ChevronDown className="h-3.5 w-3.5 text-white/40" />
            }
          </button>

          {mktDropdown && (
            <div className="absolute top-full left-0 z-50 bg-[#111118] border border-white/10 rounded-xl shadow-2xl w-56 py-1 mt-1 max-h-80 overflow-y-auto">
              {displayMarkets.map((m: any) => {
                const sym     = addPerp(m.symbol ?? m);
                const base    = stripPerp(sym);
                const liveMid = allMids[base] ?? allMids[sym] ?? null;
                const isSel   = market === sym;
                return (
                  <button key={sym}
                    onClick={() => { setMarket(sym); setMktDropdown(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs transition hover:bg-purple-500/10 ${isSel ? 'bg-purple-500/15 text-purple-300' : 'text-white/70'}`}
                  >
                    <span className="font-semibold">{base}</span>
                    <span className={`font-mono text-[11px] ${isSel ? 'text-purple-300' : 'text-white/35'}`}>
                      {liveMid ? fp(liveMid) : '—'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Stats bar — scrollable */}
        <div className="flex items-center gap-5 overflow-x-auto px-4 h-full flex-1 scrollbar-none">
          {/* Mark price prominent */}
          {markPrice != null && (
            <div className="shrink-0 flex items-baseline gap-1.5">
              <span className={`text-base font-bold font-mono ${isUp ? 'text-green-400' : 'text-red-400'}`}>
                {fp(markPrice)}
              </span>
              {priceChange != null && (
                <span className={`text-[11px] font-medium ${isUp ? 'text-green-400/70' : 'text-red-400/70'}`}>
                  {priceChange >= 0 ? '+' : ''}{(priceChange * 100).toFixed(2)}%
                </span>
              )}
            </div>
          )}
          {indexPrice != null && (
            <div className="shrink-0">
              <div className="text-[9px] text-white/30 uppercase tracking-wider">Index</div>
              <div className="text-[11px] font-mono text-white/65">{fp(indexPrice)}</div>
            </div>
          )}
          {dayNtlVlm != null && dayNtlVlm > 0 && (
            <div className="shrink-0">
              <div className="text-[9px] text-white/30 uppercase tracking-wider">24h Vol</div>
              <div className="text-[11px] text-white/65">{fUSD(dayNtlVlm)}</div>
            </div>
          )}
          {openInterest != null && openInterest > 0 && (
            <div className="shrink-0">
              <div className="text-[9px] text-white/30 uppercase tracking-wider">OI</div>
              <div className="text-[11px] text-white/65">{fUSD(openInterest)}</div>
            </div>
          )}
          {fundingRate != null && (
            <div className="shrink-0">
              <div className="text-[9px] text-white/30 uppercase tracking-wider">1h Funding</div>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-[11px] font-mono ${fundingRate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {fundingRate >= 0 ? '+' : ''}{(fundingRate * 100).toFixed(4)}%
                </span>
                {nextFunding != null && (
                  <span className={`text-[9px] font-mono opacity-50 ${nextFunding >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    → {nextFunding >= 0 ? '+' : ''}{(nextFunding * 100).toFixed(4)}%
                  </span>
                )}
              </div>
            </div>
          )}
          {takerFee != null && (
            <div className="shrink-0">
              <div className="text-[9px] text-white/30 uppercase tracking-wider">Taker</div>
              <div className="text-[11px] text-white/65">{(takerFee * 100).toFixed(3)}%</div>
            </div>
          )}
          {makerFee != null && (
            <div className="shrink-0">
              <div className="text-[9px] text-white/30 uppercase tracking-wider">Maker</div>
              <div className="text-[11px] text-white/65">{(makerFee * 100).toFixed(3)}%</div>
            </div>
          )}
          {rsi != null && (
            <div className="shrink-0">
              <div className="text-[9px] text-white/30 uppercase tracking-wider">RSI</div>
              <div className={`text-[11px] ${Number(rsi) < 30 ? 'text-green-400' : Number(rsi) > 70 ? 'text-red-400' : 'text-white/65'}`}>
                {Number(rsi).toFixed(1)}
              </div>
            </div>
          )}
          {adx != null && (
            <div className="shrink-0">
              <div className="text-[9px] text-white/30 uppercase tracking-wider">ADX</div>
              <div className="text-[11px] text-white/65">{Number(adx).toFixed(1)}</div>
            </div>
          )}
        </div>

        {/* Right side of header */}
        <div className="flex items-center gap-2 px-3 shrink-0 border-l border-white/[0.07] h-full">
          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
            connected ? 'text-green-400/70 border-green-500/25 bg-green-500/5' : 'text-white/20 border-white/8'
          }`}>
            {connected ? '● LIVE' : '○ …'}
          </span>
          <a href="https://phoenix.trade" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-white/35 hover:text-white/70 transition">
            Phoenix <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* ── Main grid ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

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
