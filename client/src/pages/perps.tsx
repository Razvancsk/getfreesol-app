/**
 * Phoenix Perpetuals page — powered by Vulcan CLI
 * https://github.com/Ellipsis-Labs/vulcan-cli
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ArrowLeft, ExternalLink, Activity, TrendingUp, TrendingDown, Zap } from 'lucide-react';
import {
  ComposedChart, Area, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import logoImage from '@/assets/logo.png';

// ── Helpers ──────────────────────────────────────────────────────────────────

const TIMEFRAMES = [
  { label: '1m',  s: '60',    i: '1m'  },
  { label: '5m',  s: '300',   i: '5m'  },
  { label: '15m', s: '900',   i: '15m' },
  { label: '1H',  s: '3600',  i: '1h'  },
  { label: '4H',  s: '14400', i: '4h'  },
  { label: '1D',  s: '86400', i: '1d'  },
] as const;

function fmtP(p: number | null | undefined): string {
  if (p == null || !isFinite(p)) return '—';
  const d = p >= 10000 ? 1 : p >= 100 ? 2 : 4;
  return '$' + p.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtN(p: number | null | undefined): string {
  if (p == null || !isFinite(p)) return '—';
  const d = p >= 10000 ? 1 : p >= 100 ? 2 : 4;
  return p.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtTime(ts: number, tfSecs: string): string {
  const d = new Date(ts * 1000);
  return Number(tfSecs) >= 86400
    ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function fmtUSD(n: unknown): string {
  const v = typeof n === 'number' ? n : parseFloat(String(n ?? ''));
  if (!isFinite(v)) return '—';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + v.toFixed(2);
}

function StatBox({ label, value, cls = '' }: { label: string; value: React.ReactNode; cls?: string }) {
  return (
    <div className="shrink-0">
      <div className="text-[10px] text-white/35 uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-sm font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PerpsPage() {
  const qc = useQueryClient();
  const [market, setMarket] = useState('SOL-PERP');
  const [tf, setTf]         = useState('3600');
  const [amount, setAmount] = useState('100');

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: marketsRaw } = useQuery<unknown>({
    queryKey: ['/api/perps/markets'],
    queryFn: async () => { const r = await fetch('/api/perps/markets'); return r.json(); },
    staleTime: 60_000,
  });

  // Vulcan market ticker: mark_price, funding_rate, volume_24h, change_24h
  const { data: tickerRaw } = useQuery<unknown>({
    queryKey: ['/api/perps/ticker', market],
    queryFn: async () => {
      const r = await fetch(`/api/perps/ticker/${encodeURIComponent(market)}`);
      return r.json();
    },
    refetchInterval: 5_000,
    staleTime: 3_000,
  });

  const { data: ob } = useQuery<unknown>({
    queryKey: ['/api/perps/orderbook', market],
    queryFn: async () => {
      const r = await fetch(`/api/perps/orderbook/${encodeURIComponent(market)}`);
      return r.json();
    },
    refetchInterval: 3_000,
    staleTime: 1_000,
  });

  const { data: candlesRaw } = useQuery<unknown>({
    queryKey: ['/api/perps/candles', market, tf],
    queryFn: async () => {
      const r = await fetch(`/api/perps/candles/${encodeURIComponent(market)}?timeframe=${tf}&limit=120`);
      return r.json();
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const { data: taRaw } = useQuery<unknown>({
    queryKey: ['/api/perps/ta', market],
    queryFn: async () => {
      const r = await fetch(`/api/perps/ta/${encodeURIComponent(market)}?timeframe=1h`);
      return r.json();
    },
    refetchInterval: 60_000,
    staleTime: 50_000,
  });

  const { data: tradesRaw } = useQuery<unknown>({
    queryKey: ['/api/perps/trades', market],
    queryFn: async () => {
      const r = await fetch(`/api/perps/trades/${encodeURIComponent(market)}?limit=25`);
      return r.json();
    },
    refetchInterval: 5_000,
    staleTime: 3_000,
  });

  // ── Paper trading queries ──────────────────────────────────────────────

  const { data: paperStatusRaw, refetch: refetchPaper } = useQuery<unknown>({
    queryKey: ['/api/perps/paper/status'],
    queryFn: async () => {
      const r = await fetch('/api/perps/paper/status');
      return r.json();
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
    retry: false,
  });

  const { data: paperPositionsRaw } = useQuery<unknown>({
    queryKey: ['/api/perps/paper/positions'],
    queryFn: async () => {
      const r = await fetch('/api/perps/paper/positions');
      return r.json();
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
    retry: false,
  });

  const initMut = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/perps/paper/init', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ balance: 10000 }) });
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/perps/paper/status'] }); },
  });

  const tradeMut = useMutation({
    mutationFn: async ({ side }: { side: 'buy' | 'sell' }) => {
      const r = await fetch('/api/perps/paper/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  const rawMarkets: any[] = (marketsRaw as any) && Array.isArray(marketsRaw)
    ? marketsRaw
    : ((marketsRaw as any)?.markets ?? []);
  const displayMarkets = rawMarkets.length > 0
    ? rawMarkets.slice(0, 10)
    : [{ symbol: 'SOL-PERP' }, { symbol: 'BTC-PERP' }, { symbol: 'ETH-PERP' }];

  // Vulcan ticker fields (snake_case from CLI)
  const ticker: any = tickerRaw ?? {};
  const markPrice: number | null     = ticker.mark_price ?? ticker.markPrice ?? null;
  const indexPrice: number | null    = ticker.index_price ?? ticker.indexPrice ?? null;
  const fundingRate: number | null   = ticker.funding_rate ?? ticker.fundingRate ?? null;
  const priceChange: number | null   = ticker.change_24h ?? ticker.priceChange24h ?? null;
  const openInterest: unknown        = ticker.open_interest ?? ticker.openInterest ?? null;
  const volume24h: unknown           = ticker.volume_24h ?? ticker.volume24h ?? null;
  const isUp = priceChange == null ? true : priceChange >= 0;

  const obData: any   = ob ?? {};
  const midPrice: number | null = obData.mid ?? markPrice;
  const bids: [number, number][] = obData.bids ?? [];
  const asks: [number, number][] = obData.asks ?? [];
  const displayAsks  = [...asks].slice(0, 12).reverse();
  const displayBids  = bids.slice(0, 12);

  const rawCandles: any[] = Array.isArray(candlesRaw)
    ? candlesRaw
    : ((candlesRaw as any)?.candles ?? []);
  const chartData = rawCandles.slice(-100).map((c: any) => ({
    time: c.time, price: c.close, volume: c.volume ?? 0,
  }));
  const prices = chartData.map((c: any) => c.price as number).filter(Boolean);
  const minP = prices.length ? Math.min(...prices) * 0.9995 : 'auto';
  const maxP = prices.length ? Math.max(...prices) * 1.0005 : 'auto';

  const fills: any[] = (tradesRaw as any)?.fills ?? [];

  // TA data
  const ta: any = taRaw ?? {};
  const rsi = ta.rsi?.value ?? ta.rsi;
  const macdHist = ta.macd?.histogram ?? ta.macd?.hist;
  const adx = ta.adx?.value ?? ta.adx;

  // Paper trading
  const paperStatus: any = paperStatusRaw;
  const paperInitialized = paperStatus && !paperStatus.error;
  const paperBalance: number | null = paperStatus?.collateral ?? paperStatus?.balance ?? null;
  const paperPnl: number | null     = paperStatus?.unrealized_pnl ?? paperStatus?.pnl ?? null;
  const paperPositions: any[]       = Array.isArray(paperPositionsRaw) ? paperPositionsRaw : [];

  // Normalize market symbol for display (ensure -PERP suffix)
  function displaySym(s: string) {
    return s.endsWith('-PERP') ? s : s + '-PERP';
  }

  return (
    <div className="min-h-screen bg-[#0d0d14] text-white flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/"><a className="text-white/50 hover:text-white transition"><ArrowLeft className="h-5 w-5" /></a></Link>
          <img src={logoImage} alt="logo" className="h-7 w-auto" />
          <span className="font-bold text-purple-300 tracking-tight">Perps</span>
          <span className="text-[10px] text-white/25 border border-white/10 rounded px-1.5 py-0.5">Vulcan</span>
        </div>
        <a href="https://phoenix.trade" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 border border-purple-500/30 hover:border-purple-400/50 rounded-lg px-3 py-1.5 transition">
          Phoenix <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Market tabs */}
      <div className="flex overflow-x-auto border-b border-white/10 shrink-0 scrollbar-none">
        {displayMarkets.map((m: any) => {
          const sym = displaySym(m.symbol ?? m);
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

      {/* Stats bar */}
      <div className="flex gap-6 overflow-x-auto px-4 py-2.5 border-b border-white/10 bg-white/[0.02] shrink-0 scrollbar-none">
        <StatBox label="Mark Price" value={<span className="text-base font-bold">{fmtP(markPrice)}</span>} />
        <StatBox
          label="24h Change"
          value={priceChange != null ? (priceChange >= 0 ? '+' : '') + (priceChange * 100).toFixed(2) + '%' : '—'}
          cls={isUp ? 'text-green-400' : 'text-red-400'}
        />
        {indexPrice != null && <StatBox label="Index" value={fmtP(indexPrice)} />}
        {fundingRate != null && (
          <StatBox label="Funding (1h)"
            value={(fundingRate >= 0 ? '+' : '') + (fundingRate * 100).toFixed(4) + '%'}
            cls={fundingRate >= 0 ? 'text-green-400' : 'text-red-400'}
          />
        )}
        {openInterest != null && <StatBox label="Open Interest" value={fmtUSD(openInterest)} />}
        {volume24h != null && <StatBox label="24h Volume" value={fmtUSD(volume24h)} />}
        {/* TA quick indicators */}
        {rsi != null && (
          <StatBox label="RSI(14)"
            value={Number(rsi).toFixed(1)}
            cls={Number(rsi) < 30 ? 'text-green-400' : Number(rsi) > 70 ? 'text-red-400' : 'text-white/70'}
          />
        )}
        {macdHist != null && (
          <StatBox label="MACD Hist"
            value={Number(macdHist) >= 0 ? '+' + Number(macdHist).toFixed(2) : Number(macdHist).toFixed(2)}
            cls={Number(macdHist) >= 0 ? 'text-green-400' : 'text-red-400'}
          />
        )}
        {adx != null && <StatBox label="ADX" value={Number(adx).toFixed(1)} />}
      </div>

      {/* Main grid */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* Left: Chart + Trades */}
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
                    <XAxis dataKey="time" tickFormatter={v => fmtTime(Number(v), tf)}
                      tick={{ fill: 'rgba(255,255,255,0.28)', fontSize: 10 }}
                      tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} minTickGap={60} />
                    <YAxis yAxisId="p" domain={[minP, maxP]}
                      tick={{ fill: 'rgba(255,255,255,0.28)', fontSize: 10 }}
                      tickLine={false} axisLine={false} tickFormatter={fmtN} width={60} />
                    <YAxis yAxisId="v" orientation="right" hide />
                    <Tooltip
                      contentStyle={{ background: '#1a1228', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 8, fontSize: 11 }}
                      labelFormatter={v => fmtTime(Number(v), tf)}
                      formatter={(v: unknown, name: string) => name === 'price' ? [fmtP(Number(v)), 'Price'] : [Number(v).toFixed(2), 'Volume']}
                    />
                    <Bar yAxisId="v" dataKey="volume" fill="rgba(168,85,247,0.12)" radius={[1,1,0,0]} maxBarSize={8} />
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
            <div className="px-4 py-2 text-[10px] font-semibold text-white/35 uppercase tracking-wider border-b border-white/5">
              Recent Trades
            </div>
            <div className="px-4 py-1">
              <div className="grid grid-cols-3 text-[10px] text-white/22 pb-1.5">
                <span>Price</span><span className="text-right">Size</span><span className="text-right">Time</span>
              </div>
              <div className="overflow-y-auto max-h-52">
                {fills.length > 0 ? fills.slice(0, 25).map((f: any, i: number) => {
                  const price = parseFloat(f.price ?? '0');
                  const lots  = parseFloat(f.baseLots ?? '0');
                  const ts    = new Date(f.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                  const isBuy = f.liquidity !== 'maker';
                  return (
                    <div key={i} className="grid grid-cols-3 py-[3px] text-xs">
                      <span className={isBuy ? 'text-green-400' : 'text-red-400'}>{fmtP(price)}</span>
                      <span className="text-right text-white/55 font-mono">{lots.toFixed(3)}</span>
                      <span className="text-right text-white/28">{ts}</span>
                    </div>
                  );
                }) : <div className="text-white/20 text-xs py-6 text-center">No recent trades</div>}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Orderbook + Paper Trading */}
        <div className="w-full lg:w-[280px] flex flex-col shrink-0 border-t lg:border-t-0 border-white/10">

          {/* Orderbook */}
          <div className="px-4 py-2 text-[10px] font-semibold text-white/35 uppercase tracking-wider border-b border-white/10">
            Order Book
          </div>
          <div className="grid grid-cols-2 px-4 py-1 text-[10px] text-white/22 border-b border-white/5">
            <span>Price</span><span className="text-right">Size</span>
          </div>

          {/* Asks */}
          <div className="overflow-hidden">
            {displayAsks.length > 0 ? displayAsks.map(([price, size]: [number, number], i: number) => {
              const maxS = Math.max(...displayAsks.map(([, s]: [number, number]) => s));
              const pct  = maxS > 0 ? (size / maxS) * 55 : 0;
              return (
                <div key={i} className="relative grid grid-cols-2 px-4 py-[3px] text-xs hover:bg-white/[0.03]">
                  <div className="absolute inset-y-0 right-0 bg-red-500/[0.08]" style={{ width: `${pct}%` }} />
                  <span className="text-red-400 relative z-10 font-mono">{fmtN(price)}</span>
                  <span className="text-right text-white/55 relative z-10 font-mono">{size.toFixed(3)}</span>
                </div>
              );
            }) : <div className="px-4 py-4 text-xs text-white/20 text-center">Loading…</div>}
          </div>

          {/* Mid */}
          <div className="px-4 py-2 border-y border-white/10 bg-white/[0.025] flex items-center justify-between">
            <span className={`text-sm font-bold font-mono ${isUp ? 'text-green-400' : 'text-red-400'}`}>{fmtP(midPrice)}</span>
            <span className="text-[10px] text-white/22">spread</span>
          </div>

          {/* Bids */}
          <div className="overflow-hidden">
            {displayBids.length > 0 ? displayBids.map(([price, size]: [number, number], i: number) => {
              const maxS = Math.max(...displayBids.map(([, s]: [number, number]) => s));
              const pct  = maxS > 0 ? (size / maxS) * 55 : 0;
              return (
                <div key={i} className="relative grid grid-cols-2 px-4 py-[3px] text-xs hover:bg-white/[0.03]">
                  <div className="absolute inset-y-0 right-0 bg-green-500/[0.08]" style={{ width: `${pct}%` }} />
                  <span className="text-green-400 relative z-10 font-mono">{fmtN(price)}</span>
                  <span className="text-right text-white/55 relative z-10 font-mono">{size.toFixed(3)}</span>
                </div>
              );
            }) : <div className="px-4 py-4 text-xs text-white/20 text-center">Loading…</div>}
          </div>

          {/* Paper Trading Panel */}
          <div className="mt-auto border-t border-white/10 p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-xs font-semibold text-white/70">Paper Trading</span>
              <span className="text-[9px] text-white/25 ml-auto">No wallet needed</span>
            </div>

            {!paperInitialized ? (
              <button
                onClick={() => initMut.mutate()}
                disabled={initMut.isPending}
                className="w-full py-2 bg-purple-700/50 hover:bg-purple-600/60 border border-purple-500/30 rounded-lg text-xs font-medium text-white/80 transition disabled:opacity-50"
              >
                {initMut.isPending ? 'Initializing…' : 'Start Paper Account ($10k)'}
              </button>
            ) : (
              <>
                {/* Balance */}
                <div className="flex items-center justify-between text-xs bg-white/5 rounded-lg px-3 py-2">
                  <span className="text-white/40">Balance</span>
                  <span className="font-semibold">{fmtUSD(paperBalance)}</span>
                </div>
                {paperPnl != null && (
                  <div className="flex items-center justify-between text-xs bg-white/5 rounded-lg px-3 py-2">
                    <span className="text-white/40">Unrealized PnL</span>
                    <span className={`font-semibold ${Number(paperPnl) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {Number(paperPnl) >= 0 ? '+' : ''}{fmtUSD(paperPnl)}
                    </span>
                  </div>
                )}

                {/* Amount input */}
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                  <span className="text-white/30 text-xs">$</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-white outline-none w-0 min-w-0"
                    placeholder="100"
                    min="1"
                  />
                  <span className="text-white/30 text-xs">USDC</span>
                </div>

                {/* Long / Short buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => tradeMut.mutate({ side: 'buy' })}
                    disabled={tradeMut.isPending}
                    className="flex items-center justify-center gap-1 py-2.5 bg-green-600/80 hover:bg-green-500/80 rounded-lg text-xs font-semibold transition disabled:opacity-50"
                  >
                    <TrendingUp className="h-3.5 w-3.5" /> Long
                  </button>
                  <button
                    onClick={() => tradeMut.mutate({ side: 'sell' })}
                    disabled={tradeMut.isPending}
                    className="flex items-center justify-center gap-1 py-2.5 bg-red-600/80 hover:bg-red-500/80 rounded-lg text-xs font-semibold transition disabled:opacity-50"
                  >
                    <TrendingDown className="h-3.5 w-3.5" /> Short
                  </button>
                </div>

                {tradeMut.isError && (
                  <p className="text-red-400 text-[10px]">{(tradeMut.error as any)?.message ?? 'Trade failed'}</p>
                )}

                {/* Positions */}
                {paperPositions.length > 0 && (
                  <div>
                    <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Positions</div>
                    {paperPositions.map((p: any, i: number) => {
                      const pnl = p.unrealized_pnl ?? p.pnl ?? 0;
                      return (
                        <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-white/5 last:border-0">
                          <span className={p.side === 'long' ? 'text-green-400' : 'text-red-400'}>
                            {p.symbol ?? market} {p.side}
                          </span>
                          <span className={Number(pnl) >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {Number(pnl) >= 0 ? '+' : ''}{fmtUSD(pnl)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* Vulcan attribution */}
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
        </div>
      </div>
    </div>
  );
}
