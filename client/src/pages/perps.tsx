/**
 * Phoenix Perpetuals — real-time data via Phoenix WS + Rise SDK trading
 * https://perp-api.phoenix.trade  |  https://github.com/Ellipsis-Labs/vulcan-cli
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Transaction } from '@solana/web3.js';
import { Side, createPhoenixClient } from '@ellipsis-labs/rise';
import { Link } from 'wouter';
import {
  ArrowLeft, ExternalLink, Activity, TrendingUp, TrendingDown,
  RefreshCw, Key, User,
} from 'lucide-react';
import {
  ComposedChart, Area, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';

const logoImage = '/logo.png';
const PHOENIX_WS    = 'wss://perp-api.phoenix.trade/v1/ws';
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

function StatBox({ label, value, cls = '' }: { label: string; value: React.ReactNode; cls?: string }) {
  return (
    <div className="shrink-0">
      <div className="text-[10px] text-white/35 uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-sm font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

// ── Phoenix WebSocket (market stats + orderbook + trades + candles + allMids) ─

interface MarketStats {
  markPx: number; midPx: number; oraclePx: number;
  prevDayPx: number; dayNtlVlm: number; openInterest: number; funding: number;
}
interface OB { bids: [number, number][]; asks: [number, number][]; mid: number | null; }

function toOBRow(r: any): [number, number] {
  if (Array.isArray(r)) return [toNum(r[0]), toNum(r[1])];
  return [toNum(r.price ?? r.px), toNum(r.size ?? r.qty)];
}

function usePhoenixWS(symbol: string, wsTimeframe: string) {
  const [connected,   setConnected]   = useState(false);
  const [stats,       setStats]       = useState<MarketStats | null>(null);
  const [ob,          setOb]          = useState<OB>({ bids: [], asks: [], mid: null });
  const [trades,      setTrades]      = useState<any[]>([]);
  const [liveCandle,  setLiveCandle]  = useState<any>(null);
  const [allMids,     setAllMids]     = useState<Record<string, number>>({});
  const wsRef  = useRef<WebSocket | null>(null);
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
        [
          { channel: 'allMids' },
          { channel: 'market',    symbol: sym },
          { channel: 'orderbook', symbol: sym },
          { channel: 'trades',    symbol: sym },
          { channel: 'candles',   symbol: sym, timeframe: wsTimeframe },
        ].forEach(sub => ws.send(JSON.stringify({ type: 'subscribe', subscription: sub })));
      };

      ws.onmessage = ({ data: raw }) => {
        try {
          const msg = JSON.parse(raw as string);
          const ch = msg.channel ?? msg.type;
          const d  = msg.data;
          if (!d) return;
          if (ch === 'allMids') {
            // { SOL: "135.87", BTC: "65000", ... }
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
          }
        } catch { /* ignore malformed */ }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!deadRef.current) setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
    }

    connect();
    return () => {
      deadRef.current = true;
      wsRef.current?.close();
    };
  }, [sym, wsTimeframe]);

  return { connected, stats, ob, trades, liveCandle, allMids };
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PerpsPage() {
  const qc = useQueryClient();
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { client: riseClient, ready: riseReady } = useRiseClient();

  const [market,     setMarket]     = useState('SOL-PERP');
  const [tf,         setTf]         = useState('3600');
  const [inviteCode, setInviteCode] = useState('');
  const [orderType,  setOrderType]  = useState<'market' | 'limit'>('market');
  const [orderPrice, setOrderPrice] = useState('');
  const [orderSize,  setOrderSize]  = useState('0.1');
  const [txSig,      setTxSig]      = useState<string | null>(null);

  const wsTimeframe = TIMEFRAMES.find(t => t.s === tf)?.ws ?? '1h';
  const { connected, stats, ob, trades, liveCandle, allMids } = usePhoenixWS(market, wsTimeframe);

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
  const fundingRate  = stats?.funding ?? null;
  const dayNtlVlm    = stats?.dayNtlVlm ?? null;
  const openInterest = stats?.openInterest ?? null;
  const priceChange  = (markPrice && stats?.prevDayPx && stats.prevDayPx > 0)
    ? (markPrice - stats.prevDayPx) / stats.prevDayPx : null;
  const isUp = priceChange == null ? true : priceChange >= 0;

  const midPrice    = ob.mid ?? markPrice;
  const displayAsks = [...ob.asks].slice(0, 14).reverse();
  const displayBids = ob.bids.slice(0, 14);

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

  const ta: any    = taRaw ?? {};
  const rsi        = ta.rsi?.value ?? ta.rsi;
  const macdHist   = ta.macd?.histogram ?? ta.macd?.hist;
  const adx        = ta.adx?.value ?? ta.adx;

  const mktCfg    = ((exchangeRaw as any)?.markets ?? []).find(
    (m: any) => m.symbol === market || m.symbol === stripPerp(market));
  const maxLev    = mktCfg?.leverageTiers?.[0]?.maxLeverage ?? null;
  const takerFee  = mktCfg?.takerFee ?? null;
  const makerFee  = mktCfg?.makerFee ?? null;

  const trader: any    = traderRaw;
  const traderArr      = trader?.traders ?? (trader && !trader.error ? [trader] : []);
  const td: any        = traderArr[0];
  const isRegistered   = !!td && td.state !== 'uninitialized' && !trader?.error;
  const traderPositions: any[] = td?.positions ?? [];
  const traderOrders: any[]    = Object.values(td?.limitOrders ?? {}).flat() as any[];

  return (
    <div className="min-h-screen bg-[#0d0d14] text-white flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/"><a className="text-white/50 hover:text-white transition"><ArrowLeft className="h-5 w-5" /></a></Link>
          <img src={logoImage} alt="logo" className="h-7 w-auto" />
          <span className="font-bold text-purple-300 tracking-tight">Perps</span>
          <span className={`text-[9px] border rounded px-1.5 py-0.5 font-mono ${
            connected ? 'text-green-400/80 border-green-500/30' : 'text-white/25 border-white/10'
          }`}>
            {connected ? '● LIVE' : '○ connecting'}
          </span>
        </div>
        <a href="https://phoenix.trade" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 border border-purple-500/30 rounded-lg px-3 py-1.5 transition">
          Phoenix <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* ── Market tabs — all markets with live prices ──────────────────── */}
      <div className="flex overflow-x-auto border-b border-white/10 shrink-0 scrollbar-none bg-white/[0.01]">
        {displayMarkets.map((m: any) => {
          const sym    = addPerp(m.symbol ?? m);
          const base   = stripPerp(sym);
          const liveMid = allMids[base] ?? allMids[sym] ?? null;
          const isSelected = market === sym;
          return (
            <button key={sym} onClick={() => setMarket(sym)}
              className={`flex flex-col items-start px-4 py-2 shrink-0 border-b-2 transition-all ${
                isSelected
                  ? 'border-purple-500 bg-purple-500/8'
                  : 'border-transparent hover:bg-white/5'
              }`}>
              <span className={`text-xs font-semibold ${isSelected ? 'text-white' : 'text-white/50'}`}>
                {sym}
              </span>
              {liveMid ? (
                <span className="text-[10px] text-white/40 font-mono">{fp(liveMid)}</span>
              ) : (
                <span className="text-[10px] text-white/15">—</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Stats bar ──────────────────────────────────────────────────── */}
      <div className="flex gap-6 overflow-x-auto px-4 py-2.5 border-b border-white/10 bg-white/[0.02] shrink-0 scrollbar-none">
        <StatBox label="Mark" value={<span className={`text-base font-bold ${isUp ? 'text-green-400' : 'text-red-400'}`}>{fp(markPrice)}</span>} />
        <StatBox
          label="24h Change"
          value={priceChange != null ? (priceChange >= 0 ? '+' : '') + (priceChange * 100).toFixed(2) + '%' : '—'}
          cls={isUp ? 'text-green-400' : 'text-red-400'}
        />
        {indexPrice  != null && <StatBox label="Oracle"  value={fp(indexPrice)} />}
        {fundingRate != null && (
          <StatBox label="Funding /1h"
            value={(fundingRate >= 0 ? '+' : '') + (fundingRate * 100).toFixed(4) + '%'}
            cls={fundingRate >= 0 ? 'text-green-400' : 'text-red-400'} />
        )}
        {openInterest != null && openInterest > 0 && <StatBox label="OI"        value={fUSD(openInterest)} />}
        {dayNtlVlm    != null && dayNtlVlm    > 0 && <StatBox label="24h Vol"   value={fUSD(dayNtlVlm)} />}
        {maxLev  != null && <StatBox label="Max Lev"   value={`${maxLev}×`} />}
        {takerFee!= null && <StatBox label="Taker"     value={(takerFee * 100).toFixed(3) + '%'} />}
        {makerFee!= null && <StatBox label="Maker"     value={(makerFee * 100).toFixed(3) + '%'} />}
        {rsi     != null && (
          <StatBox label="RSI(14)" value={Number(rsi).toFixed(1)}
            cls={Number(rsi) < 30 ? 'text-green-400' : Number(rsi) > 70 ? 'text-red-400' : 'text-white/70'} />
        )}
        {macdHist != null && (
          <StatBox label="MACD"
            value={(Number(macdHist) >= 0 ? '+' : '') + Number(macdHist).toFixed(2)}
            cls={Number(macdHist) >= 0 ? 'text-green-400' : 'text-red-400'} />
        )}
        {adx != null && <StatBox label="ADX" value={Number(adx).toFixed(1)} />}
      </div>

      {/* ── Main grid ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* Left — Chart + Trades */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-white/10">

          {/* Chart */}
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center gap-1 mb-3">
              {TIMEFRAMES.map(t => (
                <button key={t.s} onClick={() => setTf(t.s)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                    tf === t.s ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="h-60 md:h-80">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="perpG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.22} />
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="time" tickFormatter={v => fTime(Number(v), tf)}
                      tick={{ fill: 'rgba(255,255,255,0.28)', fontSize: 10 }}
                      tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} minTickGap={60} />
                    <YAxis yAxisId="p" domain={[minP, maxP]}
                      tick={{ fill: 'rgba(255,255,255,0.28)', fontSize: 10 }}
                      tickLine={false} axisLine={false} tickFormatter={fn} width={60} />
                    <YAxis yAxisId="v" orientation="right" hide />
                    <Tooltip
                      contentStyle={{ background: '#1a1228', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 8, fontSize: 11 }}
                      labelFormatter={v => fTime(Number(v), tf)}
                      formatter={(v: unknown, name: string) =>
                        name === 'price' ? [fp(Number(v)), 'Price'] : [Number(v).toFixed(2), 'Volume']
                      }
                    />
                    <Bar  yAxisId="v" dataKey="volume" fill="rgba(168,85,247,0.12)" radius={[1,1,0,0]} maxBarSize={8} />
                    <Area yAxisId="p" type="monotone" dataKey="price" stroke="#a855f7" strokeWidth={1.5}
                      fill="url(#perpG)" dot={false} activeDot={{ r: 3, fill: '#a855f7', strokeWidth: 0 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-white/20 gap-2">
                  <Activity className="h-7 w-7" />
                  <span className="text-sm">Loading chart…</span>
                </div>
              )}
            </div>
          </div>

          {/* Recent Trades */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <div className="px-4 py-2 text-[10px] font-semibold text-white/35 uppercase tracking-wider border-b border-white/5 flex items-center gap-2">
              Recent Trades
              {connected && <span className="text-green-400/50">● live</span>}
            </div>
            <div className="px-4 py-1">
              <div className="grid grid-cols-3 text-[10px] text-white/22 pb-1.5">
                <span>Price</span><span className="text-right">Size</span><span className="text-right">Time</span>
              </div>
              <div className="overflow-y-auto max-h-52">
                {trades.length > 0 ? trades.slice(0, 30).map((f: any, i: number) => {
                  const price = pf(f.price ?? f.px ?? f.p);
                  const size  = pf(f.baseLots ?? f.size ?? f.qty ?? f.q);
                  const isBuy = f.side === 'buy' || f.side === 'bid' || f.isBuy === true;
                  const ts    = f.timestamp
                    ? new Date(f.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
                    : '—';
                  return (
                    <div key={i} className="grid grid-cols-3 py-[3px] text-xs">
                      <span className={isBuy ? 'text-green-400' : 'text-red-400'}>{fp(price)}</span>
                      <span className="text-right text-white/55 font-mono">{size.toFixed(3)}</span>
                      <span className="text-right text-white/28">{ts}</span>
                    </div>
                  );
                }) : (
                  <div className="text-white/20 text-xs py-6 text-center">
                    {connected ? 'Waiting for trades…' : 'Connecting…'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right — Orderbook + Trading */}
        <div className="w-full lg:w-[300px] flex flex-col shrink-0 border-t lg:border-t-0 border-white/10">

          {/* Orderbook */}
          <div className="px-4 py-2 text-[10px] font-semibold text-white/35 uppercase tracking-wider border-b border-white/10 flex items-center justify-between">
            <span>Order Book</span>
            {connected && <span className="text-green-400/40 text-[9px]">● live</span>}
          </div>
          <div className="grid grid-cols-2 px-4 py-1 text-[10px] text-white/22 border-b border-white/5">
            <span>Price</span><span className="text-right">Size</span>
          </div>
          <div className="overflow-hidden">
            {displayAsks.length > 0 ? displayAsks.map(([price, size], i) => {
              const maxS = Math.max(...displayAsks.map(([, s]) => s));
              const pct  = maxS > 0 ? (size / maxS) * 55 : 0;
              return (
                <div key={i} className="relative grid grid-cols-2 px-4 py-[3px] text-xs hover:bg-white/[0.03]">
                  <div className="absolute inset-y-0 right-0 bg-red-500/[0.08]" style={{ width: `${pct}%` }} />
                  <span className="text-red-400 relative z-10 font-mono">{fn(price)}</span>
                  <span className="text-right text-white/55 relative z-10 font-mono">{size.toFixed(3)}</span>
                </div>
              );
            }) : <div className="px-4 py-3 text-xs text-white/20 text-center">{connected ? 'Waiting…' : 'Connecting…'}</div>}
          </div>
          <div className="px-4 py-2 border-y border-white/10 bg-white/[0.025] flex items-center justify-between">
            <span className={`text-sm font-bold font-mono ${isUp ? 'text-green-400' : 'text-red-400'}`}>{fp(midPrice)}</span>
            <span className="text-[10px] text-white/22">mid</span>
          </div>
          <div className="overflow-hidden">
            {displayBids.length > 0 ? displayBids.map(([price, size], i) => {
              const maxS = Math.max(...displayBids.map(([, s]) => s));
              const pct  = maxS > 0 ? (size / maxS) * 55 : 0;
              return (
                <div key={i} className="relative grid grid-cols-2 px-4 py-[3px] text-xs hover:bg-white/[0.03]">
                  <div className="absolute inset-y-0 right-0 bg-green-500/[0.08]" style={{ width: `${pct}%` }} />
                  <span className="text-green-400 relative z-10 font-mono">{fn(price)}</span>
                  <span className="text-right text-white/55 relative z-10 font-mono">{size.toFixed(3)}</span>
                </div>
              );
            }) : <div className="px-4 py-3 text-xs text-white/20 text-center">{connected ? 'Waiting…' : 'Connecting…'}</div>}
          </div>

          {/* Trading panel */}
          <div className="mt-auto border-t border-white/10 p-4 flex flex-col gap-3 overflow-y-auto">
            {!publicKey ? (
              <div className="text-center py-6 flex flex-col items-center gap-2">
                <User className="h-8 w-8 text-white/15" />
                <p className="text-xs text-white/40">Connect your wallet to trade</p>
              </div>
            ) : !isRegistered ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Key className="h-3.5 w-3.5 text-purple-400" />
                  <span className="text-xs font-semibold text-white/70">Activate Phoenix Account</span>
                </div>
                <p className="text-[10px] text-white/30 leading-relaxed">
                  Enter your Phoenix invite code to start trading perps on-chain.
                </p>
                <input value={inviteCode} onChange={e => setInviteCode(e.target.value)}
                  placeholder="Invite code…"
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/20 outline-none focus:border-purple-500/50 transition" />
                <button onClick={() => registerMut.mutate()}
                  disabled={!inviteCode.trim() || registerMut.isPending}
                  className="w-full py-2 bg-purple-700/50 hover:bg-purple-600/60 border border-purple-500/30 rounded-lg text-xs font-medium text-white/80 transition disabled:opacity-40">
                  {registerMut.isPending ? 'Activating…' : 'Activate Account'}
                </button>
                {registerMut.isError   && <p className="text-red-400   text-[10px]">Failed — check your code.</p>}
                {registerMut.isSuccess && <p className="text-green-400 text-[10px]">Activated! Refreshing…</p>}
              </div>
            ) : (
              <>
                {/* Account summary */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white/5 rounded-lg px-3 py-2">
                    <div className="text-[10px] text-white/30 mb-0.5">Collateral</div>
                    <div className="font-semibold">{fUSD(pf(td?.collateralBalance))}</div>
                  </div>
                  <div className="bg-white/5 rounded-lg px-3 py-2">
                    <div className="text-[10px] text-white/30 mb-0.5">Unreal PnL</div>
                    <div className={`font-semibold ${pf(td?.unrealizedPnl) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {pf(td?.unrealizedPnl) >= 0 ? '+' : ''}{fUSD(pf(td?.unrealizedPnl))}
                    </div>
                  </div>
                </div>

                {/* Positions */}
                {traderPositions.length > 0 && (
                  <div>
                    <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">Positions</div>
                    {traderPositions.map((p: any, i: number) => {
                      const pnl  = pf(p.unrealizedPnl);
                      const size = pf(p.positionSize);
                      const side = size >= 0 ? 'LONG' : 'SHORT';
                      return (
                        <div key={i} className="bg-white/[0.03] rounded-lg px-3 py-2 mb-1.5 border border-white/5">
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-xs font-semibold ${side === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>
                              {p.symbol} {side}
                            </span>
                            <span className={`text-xs font-semibold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {pnl >= 0 ? '+' : ''}{fUSD(pnl)}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-2 text-[10px] text-white/30">
                            <span>Entry {fp(pf(p.entryPrice))}</span>
                            <span>Liq {fp(pf(p.liquidationPrice))}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Open orders */}
                {traderOrders.length > 0 && (
                  <div>
                    <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Open Orders</div>
                    {traderOrders.slice(0, 5).map((o: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-white/5 last:border-0">
                        <span className={o.side === 'bid' ? 'text-green-400' : 'text-red-400'}>
                          {o.side === 'bid' ? 'BUY' : 'SELL'} @ {fp(pf(o.price))}
                        </span>
                        <span className="text-white/35 font-mono">{pf(o.tradeSizeRemaining).toFixed(3)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Order form */}
                <div className="border-t border-white/10 pt-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/35 uppercase tracking-wider">Place Order</span>
                    <div className="flex bg-white/5 rounded-md p-0.5">
                      {(['market', 'limit'] as const).map(t => (
                        <button key={t} onClick={() => setOrderType(t)}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                            orderType === t ? 'bg-purple-600 text-white' : 'text-white/35 hover:text-white/60'
                          }`}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {orderType === 'limit' && (
                    <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                      <span className="text-white/30 text-[10px]">Price $</span>
                      <input type="number" value={orderPrice} onChange={e => setOrderPrice(e.target.value)}
                        placeholder={markPrice ? markPrice.toFixed(2) : '0.00'}
                        className="flex-1 bg-transparent text-xs text-white outline-none w-0 min-w-0" />
                    </div>
                  )}

                  <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                    <span className="text-white/30 text-[10px]">Size</span>
                    <input type="number" value={orderSize} onChange={e => setOrderSize(e.target.value)}
                      placeholder="0.1"
                      className="flex-1 bg-transparent text-xs text-white outline-none w-0 min-w-0" />
                    <span className="text-white/25 text-[10px]">{stripPerp(market)}</span>
                  </div>

                  {orderType === 'market' && markPrice && (
                    <p className="text-[10px] text-white/20">
                      ≈ {fUSD(pf(orderSize) * markPrice)} · 5% slippage tolerance
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => placeMut.mutate({ side: 'buy' })}
                      disabled={placeMut.isPending || !riseReady}
                      className="flex items-center justify-center gap-1 py-2.5 bg-green-600/80 hover:bg-green-500/80 rounded-lg text-xs font-semibold transition disabled:opacity-40">
                      <TrendingUp className="h-3.5 w-3.5" />
                      {placeMut.isPending ? '…' : 'Long'}
                    </button>
                    <button onClick={() => placeMut.mutate({ side: 'sell' })}
                      disabled={placeMut.isPending || !riseReady}
                      className="flex items-center justify-center gap-1 py-2.5 bg-red-600/80 hover:bg-red-500/80 rounded-lg text-xs font-semibold transition disabled:opacity-40">
                      <TrendingDown className="h-3.5 w-3.5" />
                      {placeMut.isPending ? '…' : 'Short'}
                    </button>
                  </div>

                  {!riseReady && <p className="text-[10px] text-white/25 text-center">Initializing engine…</p>}
                  {placeMut.isError && (
                    <p className="text-red-400 text-[10px] break-all">
                      {(placeMut.error as any)?.message ?? 'Order failed'}
                    </p>
                  )}
                  {txSig && (
                    <a href={`https://solscan.io/tx/${txSig}`} target="_blank" rel="noopener noreferrer"
                      className="text-green-400 text-[10px] truncate hover:underline">
                      ✓ {txSig.slice(0, 20)}… ↗
                    </a>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-white/15 pt-1 border-t border-white/5">
                    <span>Flight fee routing · {BUILDER_AUTHORITY.slice(0, 8)}…</span>
                    <button onClick={() => refetchTrader()} className="hover:text-white/40 transition">
                      <RefreshCw className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
