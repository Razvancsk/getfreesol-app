/**
 * Phoenix Perpetuals — real-time via Phoenix WebSocket API
 * REST + WS: https://perp-api.phoenix.trade
 * Paper trading: Vulcan CLI  https://github.com/Ellipsis-Labs/vulcan-cli
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@solana/wallet-adapter-react';
import { Link } from 'wouter';
import {
  ArrowLeft, ExternalLink, Activity, TrendingUp, TrendingDown,
  Zap, User, Key, RefreshCw,
} from 'lucide-react';
import {
  ComposedChart, Area, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import logoImage from '@/assets/logo.png';

// ── Constants ─────────────────────────────────────────────────────────────────

const PHOENIX_WS = 'wss://perp-api.phoenix.trade/v1/ws';

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
  const v = typeof n === 'number' ? n : parseFloat(String(n ?? ''));
  if (!isFinite(v)) return '—';
  if (Math.abs(v) >= 1e9) return (v < 0 ? '-' : '') + '$' + (Math.abs(v) / 1e9).toFixed(2) + 'B';
  if (Math.abs(v) >= 1e6) return (v < 0 ? '-' : '') + '$' + (Math.abs(v) / 1e6).toFixed(2) + 'M';
  if (Math.abs(v) >= 1e3) return (v < 0 ? '-' : '') + '$' + (Math.abs(v) / 1e3).toFixed(1) + 'K';
  return (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(2);
}
function fTime(ts: number, tfSecs: string): string {
  const d = new Date(ts * 1000);
  return Number(tfSecs) >= 86400
    ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}
function pf(n: unknown): number { return parseFloat(String(n ?? '0')) || 0; }

function StatBox({ label, value, cls = '' }: { label: string; value: React.ReactNode; cls?: string }) {
  return (
    <div className="shrink-0">
      <div className="text-[10px] text-white/35 uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-sm font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

// ── Phoenix WebSocket hook ────────────────────────────────────────────────────

interface MarketStats {
  markPx: number; midPx: number; oraclePx: number;
  prevDayPx: number; dayNtlVlm: number; openInterest: number; funding: number;
}
interface OB { bids: [number, number][]; asks: [number, number][]; mid: number | null; }

function toNum(v: unknown): number { return parseFloat(String(v ?? '0')) || 0; }
function toOBRow(r: any): [number, number] {
  if (Array.isArray(r)) return [toNum(r[0]), toNum(r[1])];
  return [toNum(r.price ?? r.px), toNum(r.size ?? r.qty)];
}

function usePhoenixWS(symbol: string, wsTimeframe: string) {
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState<MarketStats | null>(null);
  const [ob, setOb]       = useState<OB>({ bids: [], asks: [], mid: null });
  const [trades, setTrades] = useState<any[]>([]);
  const [liveCandle, setLiveCandle] = useState<any>(null);
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
          if (ch === 'market') {
            setStats({
              markPx:      toNum(d.markPx ?? d.mark_px),
              midPx:       toNum(d.midPx  ?? d.mid_px),
              oraclePx:    toNum(d.oraclePx ?? d.oracle_px),
              prevDayPx:   toNum(d.prevDayPx ?? d.prev_day_px),
              dayNtlVlm:   toNum(d.dayNtlVlm ?? d.day_ntl_vlm),
              openInterest: toNum(d.openInterest ?? d.open_interest),
              funding:     toNum(d.funding),
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

  return { connected, stats, ob, trades, liveCandle };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PerpsPage() {
  const qc = useQueryClient();
  const { publicKey } = useWallet();
  const [market,     setMarket]     = useState('SOL-PERP');
  const [tf,         setTf]         = useState('3600');
  const [amount,     setAmount]     = useState('100');
  const [inviteCode, setInviteCode] = useState('');
  const [tab,        setTab]        = useState<'account' | 'paper'>('account');

  const wsTimeframe = TIMEFRAMES.find(t => t.s === tf)?.ws ?? '1h';
  const { connected, stats, ob, trades, liveCandle } = usePhoenixWS(market, wsTimeframe);

  // ── REST queries ──────────────────────────────────────────────────────────

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
    queryFn: async () =>
      (await fetch(`/api/perps/trader/${publicKey!.toString()}`)).json(),
    enabled: !!publicKey,
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: false,
  });

  const { data: paperStatusRaw } = useQuery<unknown>({
    queryKey: ['/api/perps/paper/status'],
    queryFn: async () => (await fetch('/api/perps/paper/status')).json(),
    refetchInterval: 10_000,
    staleTime: 5_000,
    retry: false,
  });

  const { data: paperPositionsRaw } = useQuery<unknown>({
    queryKey: ['/api/perps/paper/positions'],
    queryFn: async () => (await fetch('/api/perps/paper/positions')).json(),
    refetchInterval: 10_000,
    staleTime: 5_000,
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
    onSuccess: () => { refetchTrader(); },
  });

  const initMut = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/perps/paper/init', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balance: 10000 }),
      });
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/perps/paper/status'] }); },
  });

  const tradeMut = useMutation({
    mutationFn: async ({ side }: { side: 'buy' | 'sell' }) => {
      const r = await fetch('/api/perps/paper/trade', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: market, side, notionalUsdc: Number(amount) }),
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/perps/paper/status'] });
      qc.invalidateQueries({ queryKey: ['/api/perps/paper/positions'] });
    },
  });

  // ── Derived state ─────────────────────────────────────────────────────────

  // Markets list
  const rawMarkets: any[] = Array.isArray(marketsRaw)
    ? marketsRaw
    : (marketsRaw as any)?.markets ?? [];
  const displayMarkets = rawMarkets.length > 0
    ? rawMarkets.slice(0, 10)
    : [{ symbol: 'SOL-PERP' }, { symbol: 'BTC-PERP' }, { symbol: 'ETH-PERP' }];

  // Market stats from WS
  const markPrice    = stats?.markPx ?? null;
  const indexPrice   = stats?.oraclePx ?? null;
  const fundingRate  = stats?.funding ?? null;
  const dayNtlVlm    = stats?.dayNtlVlm ?? null;
  const openInterest = stats?.openInterest ?? null;
  const priceChange  = (markPrice && stats?.prevDayPx)
    ? (markPrice - stats.prevDayPx) / stats.prevDayPx
    : null;
  const isUp = priceChange == null ? true : priceChange >= 0;

  // Orderbook from WS
  const midPrice    = ob.mid ?? markPrice;
  const displayAsks = [...ob.asks].slice(0, 12).reverse();
  const displayBids = ob.bids.slice(0, 12);

  // Chart data: REST history patched with WS live candle
  const rawCandles: any[] = Array.isArray(candlesRaw)
    ? candlesRaw
    : (candlesRaw as any)?.candles ?? [];
  const chartData = useMemo(() => {
    let candles = rawCandles.slice(-100).map((c: any) => ({
      time: c.time ?? c.t,
      price: pf(c.close ?? c.c),
      volume: pf(c.volume ?? c.v),
    }));
    if (liveCandle) {
      const t = liveCandle.time ?? liveCandle.t;
      const p = pf(liveCandle.close ?? liveCandle.c);
      const v = pf(liveCandle.volume ?? liveCandle.v);
      const idx = candles.findIndex(c => c.time === t);
      if (idx >= 0) { candles = [...candles]; candles[idx] = { time: t, price: p, volume: v }; }
      else candles = [...candles, { time: t, price: p, volume: v }].slice(-100);
    }
    return candles;
  }, [rawCandles, liveCandle]);
  const prices = chartData.map(c => c.price).filter(Boolean);
  const minP = prices.length ? Math.min(...prices) * 0.9995 : ('auto' as const);
  const maxP = prices.length ? Math.max(...prices) * 1.0005 : ('auto' as const);

  // TA indicators
  const ta: any   = taRaw ?? {};
  const rsi       = ta.rsi?.value ?? ta.rsi;
  const macdHist  = ta.macd?.histogram ?? ta.macd?.hist;
  const adx       = ta.adx?.value ?? ta.adx;

  // Exchange config for this market
  const mktCfg = ((exchangeRaw as any)?.markets ?? []).find(
    (m: any) => m.symbol === market || m.symbol === stripPerp(market)
  );
  const maxLev  = mktCfg?.leverageTiers?.[0]?.maxLeverage ?? null;
  const takerFee = mktCfg?.takerFee ?? null;
  const makerFee = mktCfg?.makerFee ?? null;

  // Trader state
  const trader: any      = traderRaw;
  const traderArr: any[] = trader?.traders ?? (trader && !trader.error ? [trader] : []);
  const td               = traderArr[0];
  const isRegistered     = !!td && td.state !== 'uninitialized' && !trader?.error;
  const traderPositions: any[] = td?.positions ?? [];
  const traderOrders: any[]    = Object.values(td?.limitOrders ?? {}).flat() as any[];
  const traderCollateral = pf(td?.collateralBalance);
  const traderPnl        = pf(td?.unrealizedPnl);
  const riskState: string | null = td?.riskState ?? null;

  // Paper trading
  const paperStatus: any    = paperStatusRaw;
  const paperOk             = paperStatus && !paperStatus.error;
  const paperBalance        = pf(paperStatus?.collateral ?? paperStatus?.balance);
  const paperPnl            = pf(paperStatus?.unrealized_pnl ?? paperStatus?.pnl);
  const paperPositions: any[] = Array.isArray(paperPositionsRaw) ? paperPositionsRaw : [];

  const showAccount = !!publicKey && tab === 'account';
  const showPaper   = !publicKey || tab === 'paper';

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
            {connected ? '● LIVE' : '○ WS'}
          </span>
        </div>
        <a href="https://phoenix.trade" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 border border-purple-500/30 hover:border-purple-400/50 rounded-lg px-3 py-1.5 transition">
          Phoenix <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* ── Market tabs ────────────────────────────────────────────────── */}
      <div className="flex overflow-x-auto border-b border-white/10 shrink-0 scrollbar-none">
        {displayMarkets.map((m: any) => {
          const sym = addPerp(m.symbol ?? m);
          return (
            <button key={sym} onClick={() => setMarket(sym)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
                market === sym
                  ? 'border-purple-500 text-white bg-purple-500/8'
                  : 'border-transparent text-white/40 hover:text-white/70'
              }`}>
              {sym}
            </button>
          );
        })}
      </div>

      {/* ── Stats bar ──────────────────────────────────────────────────── */}
      <div className="flex gap-6 overflow-x-auto px-4 py-2.5 border-b border-white/10 bg-white/[0.02] shrink-0 scrollbar-none">
        <StatBox label="Mark Price" value={<span className="text-base font-bold">{fp(markPrice)}</span>} />
        <StatBox
          label="24h Change"
          value={priceChange != null ? (priceChange >= 0 ? '+' : '') + (priceChange * 100).toFixed(2) + '%' : '—'}
          cls={isUp ? 'text-green-400' : 'text-red-400'}
        />
        {indexPrice != null && <StatBox label="Oracle" value={fp(indexPrice)} />}
        {fundingRate != null && (
          <StatBox label="Funding /1h"
            value={(fundingRate >= 0 ? '+' : '') + (fundingRate * 100).toFixed(4) + '%'}
            cls={fundingRate >= 0 ? 'text-green-400' : 'text-red-400'}
          />
        )}
        {openInterest != null && openInterest > 0 && <StatBox label="Open Interest" value={fUSD(openInterest)} />}
        {dayNtlVlm    != null && dayNtlVlm    > 0 && <StatBox label="24h Volume"    value={fUSD(dayNtlVlm)} />}
        {maxLev   != null && <StatBox label="Max Lev"   value={`${maxLev}×`} />}
        {takerFee != null && <StatBox label="Taker Fee" value={(takerFee * 100).toFixed(3) + '%'} />}
        {makerFee != null && <StatBox label="Maker Fee" value={(makerFee * 100).toFixed(3) + '%'} />}
        {rsi      != null && (
          <StatBox label="RSI(14)" value={Number(rsi).toFixed(1)}
            cls={Number(rsi) < 30 ? 'text-green-400' : Number(rsi) > 70 ? 'text-red-400' : 'text-white/70'} />
        )}
        {macdHist != null && (
          <StatBox label="MACD Hist"
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
            <div className="h-56 md:h-72">
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
                {trades.length > 0 ? trades.slice(0, 25).map((f: any, i: number) => {
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
                    {connected ? 'Waiting for trades…' : 'No recent trades'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right — Orderbook + Trading Panel */}
        <div className="w-full lg:w-[300px] flex flex-col shrink-0 border-t lg:border-t-0 border-white/10">

          {/* Orderbook header */}
          <div className="px-4 py-2 text-[10px] font-semibold text-white/35 uppercase tracking-wider border-b border-white/10 flex items-center justify-between">
            <span>Order Book</span>
            {connected && <span className="text-green-400/40 text-[9px]">● live</span>}
          </div>
          <div className="grid grid-cols-2 px-4 py-1 text-[10px] text-white/22 border-b border-white/5">
            <span>Price</span><span className="text-right">Size</span>
          </div>

          {/* Asks */}
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
            }) : <div className="px-4 py-4 text-xs text-white/20 text-center">{connected ? 'Waiting…' : 'Loading…'}</div>}
          </div>

          {/* Mid price */}
          <div className="px-4 py-2 border-y border-white/10 bg-white/[0.025] flex items-center justify-between">
            <span className={`text-sm font-bold font-mono ${isUp ? 'text-green-400' : 'text-red-400'}`}>{fp(midPrice)}</span>
            <span className="text-[10px] text-white/22">spread</span>
          </div>

          {/* Bids */}
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
            }) : <div className="px-4 py-4 text-xs text-white/20 text-center">{connected ? 'Waiting…' : 'Loading…'}</div>}
          </div>

          {/* Trading Panel */}
          <div className="mt-auto border-t border-white/10">

            {/* Tab bar (only when wallet connected) */}
            {publicKey && (
              <div className="flex border-b border-white/10">
                {(['account', 'paper'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`flex-1 py-2 text-xs font-medium transition flex items-center justify-center gap-1.5 ${
                      tab === t ? 'text-purple-300 border-b-2 border-purple-500 bg-purple-500/5' : 'text-white/35 hover:text-white/60'
                    }`}>
                    {t === 'account' ? <><User className="h-3 w-3" />My Account</> : <><Zap className="h-3 w-3" />Paper</>}
                  </button>
                ))}
              </div>
            )}

            {/* ── Account panel ─────────────────────────────────────────── */}
            {showAccount && (
              <div className="p-4 flex flex-col gap-3 overflow-y-auto max-h-[420px]">
                {!isRegistered ? (
                  /* Registration */
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <Key className="h-3.5 w-3.5 text-purple-400" />
                      <span className="text-xs font-semibold text-white/70">Activate Phoenix Account</span>
                    </div>
                    <p className="text-[10px] text-white/35 leading-relaxed">
                      Enter your invite code to register on Phoenix Perpetuals and start trading.
                    </p>
                    <input
                      value={inviteCode}
                      onChange={e => setInviteCode(e.target.value)}
                      placeholder="Invite code…"
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/20 outline-none focus:border-purple-500/50 transition"
                    />
                    <button
                      onClick={() => registerMut.mutate()}
                      disabled={!inviteCode.trim() || registerMut.isPending}
                      className="w-full py-2 bg-purple-700/50 hover:bg-purple-600/60 border border-purple-500/30 rounded-lg text-xs font-medium text-white/80 transition disabled:opacity-40"
                    >
                      {registerMut.isPending ? 'Activating…' : 'Activate Account'}
                    </button>
                    {registerMut.isError   && <p className="text-red-400   text-[10px]">Activation failed — check your code.</p>}
                    {registerMut.isSuccess && <p className="text-green-400 text-[10px]">Account activated! Refreshing…</p>}
                    <div className="pt-1 border-t border-white/5 text-[10px] text-white/25">
                      Don't have an invite? <a href="https://phoenix.trade" target="_blank" rel="noopener noreferrer" className="text-purple-400/60 hover:text-purple-400">phoenix.trade ↗</a>
                    </div>
                  </div>
                ) : (
                  /* Account overview */
                  <>
                    {/* Summary */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white/5 rounded-lg px-3 py-2">
                        <div className="text-[10px] text-white/35 mb-0.5">Collateral</div>
                        <div className="text-xs font-semibold">{fUSD(traderCollateral)}</div>
                      </div>
                      <div className="bg-white/5 rounded-lg px-3 py-2">
                        <div className="text-[10px] text-white/35 mb-0.5">Unreal. PnL</div>
                        <div className={`text-xs font-semibold ${traderPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {traderPnl >= 0 ? '+' : ''}{fUSD(traderPnl)}
                        </div>
                      </div>
                    </div>
                    {riskState && (
                      <div className="flex items-center justify-between text-xs bg-white/5 rounded-lg px-3 py-1.5">
                        <span className="text-white/40">Risk State</span>
                        <span className={`font-medium ${
                          riskState === 'healthy' ? 'text-green-400' :
                          riskState === 'unhealthy' ? 'text-yellow-400' : 'text-red-400'
                        }`}>{riskState}</span>
                      </div>
                    )}

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
                              <div className="flex items-center justify-between mb-1.5">
                                <span className={`text-xs font-semibold ${side === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>
                                  {p.symbol} {side}
                                </span>
                                <span className={`text-xs font-semibold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {pnl >= 0 ? '+' : ''}{fUSD(pnl)}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-x-2 text-[10px] text-white/35">
                                <span>Entry {fp(pf(p.entryPrice))}</span>
                                <span>Liq {fp(pf(p.liquidationPrice))}</span>
                                {p.stopLossPrice   && <span>SL {fp(pf(p.stopLossPrice))}</span>}
                                {p.takeProfitPrice && <span>TP {fp(pf(p.takeProfitPrice))}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Open limit orders */}
                    {traderOrders.length > 0 && (
                      <div>
                        <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">Open Orders</div>
                        {traderOrders.slice(0, 6).map((o: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-white/5 last:border-0">
                            <span className={o.side === 'bid' ? 'text-green-400' : 'text-red-400'}>
                              {o.side === 'bid' ? 'BUY' : 'SELL'} @ {fp(pf(o.price))}
                            </span>
                            <span className="text-white/40 font-mono">{pf(o.tradeSizeRemaining).toFixed(3)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {traderPositions.length === 0 && traderOrders.length === 0 && (
                      <p className="text-[10px] text-white/25 text-center py-2">No open positions or orders</p>
                    )}

                    <div className="flex items-center gap-2">
                      <a href="https://phoenix.trade" target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1 py-2 bg-purple-700/40 hover:bg-purple-600/50 border border-purple-500/30 rounded-lg text-xs font-medium text-white/70 transition">
                        Trade on Phoenix <ExternalLink className="h-3 w-3" />
                      </a>
                      <button onClick={() => refetchTrader()}
                        className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition text-white/40 hover:text-white/70">
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Paper Trading panel ───────────────────────────────────── */}
            {showPaper && (
              <div className="p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-purple-400" />
                  <span className="text-xs font-semibold text-white/70">Paper Trading</span>
                  <span className="text-[9px] text-white/25 ml-auto">No wallet needed</span>
                </div>

                {!paperOk ? (
                  <button onClick={() => initMut.mutate()} disabled={initMut.isPending}
                    className="w-full py-2 bg-purple-700/50 hover:bg-purple-600/60 border border-purple-500/30 rounded-lg text-xs font-medium text-white/80 transition disabled:opacity-50">
                    {initMut.isPending ? 'Initializing…' : 'Start Paper Account ($10k)'}
                  </button>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white/5 rounded-lg px-3 py-2">
                        <div className="text-[10px] text-white/35 mb-0.5">Balance</div>
                        <div className="text-xs font-semibold">{fUSD(paperBalance)}</div>
                      </div>
                      <div className="bg-white/5 rounded-lg px-3 py-2">
                        <div className="text-[10px] text-white/35 mb-0.5">PnL</div>
                        <div className={`text-xs font-semibold ${paperPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {paperPnl >= 0 ? '+' : ''}{fUSD(paperPnl)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                      <span className="text-white/30 text-xs">$</span>
                      <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                        className="flex-1 bg-transparent text-sm text-white outline-none w-0 min-w-0"
                        placeholder="100" min="1" />
                      <span className="text-white/30 text-xs">USDC</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => tradeMut.mutate({ side: 'buy' })} disabled={tradeMut.isPending}
                        className="flex items-center justify-center gap-1 py-2.5 bg-green-600/80 hover:bg-green-500/80 rounded-lg text-xs font-semibold transition disabled:opacity-50">
                        <TrendingUp className="h-3.5 w-3.5" /> Long
                      </button>
                      <button onClick={() => tradeMut.mutate({ side: 'sell' })} disabled={tradeMut.isPending}
                        className="flex items-center justify-center gap-1 py-2.5 bg-red-600/80 hover:bg-red-500/80 rounded-lg text-xs font-semibold transition disabled:opacity-50">
                        <TrendingDown className="h-3.5 w-3.5" /> Short
                      </button>
                    </div>
                    {tradeMut.isError && (
                      <p className="text-red-400 text-[10px]">{(tradeMut.error as any)?.message ?? 'Trade failed'}</p>
                    )}
                    {paperPositions.length > 0 && (
                      <div>
                        <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Positions</div>
                        {paperPositions.map((p: any, i: number) => {
                          const pnl = pf(p.unrealized_pnl ?? p.pnl);
                          return (
                            <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-white/5 last:border-0">
                              <span className={p.side === 'long' ? 'text-green-400' : 'text-red-400'}>
                                {p.symbol ?? market} {p.side}
                              </span>
                              <span className={pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                                {pnl >= 0 ? '+' : ''}{fUSD(pnl)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}

                <div className="flex items-center justify-between pt-1 border-t border-white/5">
                  <a href="https://github.com/Ellipsis-Labs/vulcan-cli" target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-white/20 hover:text-white/40 transition">
                    Powered by Vulcan CLI ↗
                  </a>
                  <a href="https://phoenix.trade" target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] text-purple-400/60 hover:text-purple-400 transition">
                    Trade live <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
