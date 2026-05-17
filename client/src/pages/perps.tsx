import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ArrowLeft, ExternalLink, Activity } from 'lucide-react';
import {
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import logoImage from '@/assets/logo.png';

// ── Helpers ──────────────────────────────────────────────

const TIMEFRAMES = [
  { label: '1m',  s: '60' },
  { label: '5m',  s: '300' },
  { label: '15m', s: '900' },
  { label: '1H',  s: '3600' },
  { label: '4H',  s: '14400' },
  { label: '1D',  s: '86400' },
] as const;

function fmtP(p: number | null | undefined): string {
  if (p == null || isNaN(p)) return '—';
  const d = p >= 10000 ? 1 : p >= 100 ? 2 : 4;
  return '$' + p.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtN(p: number | null | undefined): string {
  if (p == null || isNaN(p)) return '—';
  const d = p >= 10000 ? 1 : p >= 100 ? 2 : 4;
  return p.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtTime(ts: number, tfSecs: string): string {
  const d = new Date(ts * 1000);
  return Number(tfSecs) >= 86400
    ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function fmtOI(oi: unknown): string {
  const n = typeof oi === 'number' ? oi : parseFloat(String(oi ?? ''));
  if (!isFinite(n)) return '—';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(2);
}

function StatBox({ label, value, cls = '' }: { label: string; value: React.ReactNode; cls?: string }) {
  return (
    <div className="shrink-0">
      <div className="text-[10px] text-white/35 uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-sm font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────

export default function PerpsPage() {
  const [market, setMarket] = useState('SOL-PERP');
  const [tf, setTf] = useState('3600');

  const { data: marketsRaw } = useQuery<unknown>({
    queryKey: ['/api/perps/markets'],
    queryFn: async () => { const r = await fetch('/api/perps/markets'); return r.json(); },
    staleTime: 60_000,
  });

  const { data: snapshot } = useQuery<unknown>({
    queryKey: ['/api/perps/snapshot'],
    queryFn: async () => { const r = await fetch('/api/perps/snapshot'); return r.json(); },
    refetchInterval: 8_000,
    staleTime: 5_000,
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

  const { data: tradesRaw } = useQuery<unknown>({
    queryKey: ['/api/perps/trades', market],
    queryFn: async () => {
      const r = await fetch(`/api/perps/trades/${encodeURIComponent(market)}?limit=30`);
      return r.json();
    },
    refetchInterval: 5_000,
    staleTime: 3_000,
  });

  const { data: fundingRaw } = useQuery<unknown>({
    queryKey: ['/api/perps/funding', market],
    queryFn: async () => {
      const r = await fetch(`/api/perps/funding/${encodeURIComponent(market)}?limit=1`);
      return r.json();
    },
    refetchInterval: 60_000,
    staleTime: 50_000,
  });

  // ── Derived ──────────────────────────────────────────

  const rawMarkets: any[] = marketsRaw && Array.isArray(marketsRaw)
    ? marketsRaw
    : ((marketsRaw as any)?.markets ?? []);
  const displayMarkets = rawMarkets.length > 0
    ? rawMarkets.slice(0, 10)
    : [{ symbol: 'SOL-PERP' }, { symbol: 'BTC-PERP' }, { symbol: 'ETH-PERP' }];

  const snap = snapshot as any;
  const marketViews: any[] = snap?.markets ?? snap?.marketViews ?? snap?.data?.markets ?? [];
  const mSnap = marketViews.find((m: any) => m.symbol === market) ?? null;

  const obData = ob as any;
  const mid: number | null = obData?.mid ?? null;

  const markPrice: number | null =
    mSnap?.markPrice?.price ?? (typeof mSnap?.markPrice === 'number' ? mSnap.markPrice : null) ?? mid ?? null;
  const indexPrice: number | null =
    mSnap?.spotPrice?.price ?? (typeof mSnap?.spotPrice === 'number' ? mSnap.spotPrice : null) ?? null;
  const openInterest = mSnap?.openInterest?.amount ?? mSnap?.openInterest ?? null;

  const rawCandles: any[] = Array.isArray(candlesRaw)
    ? candlesRaw
    : ((candlesRaw as any)?.candles ?? (candlesRaw as any)?.data ?? []);

  const priceChange = rawCandles.length >= 2
    ? (rawCandles[rawCandles.length - 1].close - rawCandles[0].open) / rawCandles[0].open
    : null;
  const isUp = priceChange == null ? true : priceChange >= 0;

  const fundingRates: any[] = (fundingRaw as any)?.fundingRates ?? [];
  const latestFunding = fundingRates[fundingRates.length - 1];
  const fundingRate: number | null = latestFunding?.hourlyRate ?? mSnap?.fundingRate ?? null;

  const bids: [number, number][] = obData?.bids ?? [];
  const asks: [number, number][] = obData?.asks ?? [];
  const displayAsks = [...asks].slice(0, 12).reverse();
  const displayBids = bids.slice(0, 12);
  const midPrice: number | null = obData?.mid ?? markPrice;

  const chartData = rawCandles.slice(-100).map((c: any) => ({
    time: c.time,
    price: c.close,
    volume: c.volume ?? 0,
  }));

  const prices = chartData.map((c: any) => c.price as number).filter(Boolean);
  const minP = prices.length ? Math.min(...prices) * 0.9995 : 'auto';
  const maxP = prices.length ? Math.max(...prices) * 1.0005 : 'auto';

  const fills: any[] = (tradesRaw as any)?.fills ?? [];

  return (
    <div className="min-h-screen bg-[#0d0d14] text-white flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/">
            <a className="text-white/50 hover:text-white transition"><ArrowLeft className="h-5 w-5" /></a>
          </Link>
          <img src={logoImage} alt="logo" className="h-7 w-auto" />
          <span className="font-bold text-purple-300 tracking-tight">Perps</span>
        </div>
        <a
          href="https://phoenix.trade"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 border border-purple-500/30 hover:border-purple-400/50 rounded-lg px-3 py-1.5 transition"
        >
          Trade on Phoenix <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Market tabs */}
      <div className="flex overflow-x-auto border-b border-white/10 shrink-0 scrollbar-none">
        {displayMarkets.map((m: any) => (
          <button
            key={m.symbol}
            onClick={() => setMarket(m.symbol)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
              market === m.symbol
                ? 'border-purple-500 text-white bg-purple-500/8'
                : 'border-transparent text-white/40 hover:text-white/70'
            }`}
          >
            {m.symbol}
          </button>
        ))}
      </div>

      {/* Stats bar */}
      <div className="flex gap-6 overflow-x-auto px-4 py-2.5 border-b border-white/10 bg-white/[0.02] shrink-0 scrollbar-none">
        <StatBox
          label="Mark Price"
          value={<span className="text-base font-bold">{fmtP(markPrice)}</span>}
        />
        <StatBox
          label="24h Change"
          value={priceChange != null ? (priceChange >= 0 ? '+' : '') + (priceChange * 100).toFixed(2) + '%' : '—'}
          cls={isUp ? 'text-green-400' : 'text-red-400'}
        />
        {indexPrice != null && <StatBox label="Index Price" value={fmtP(indexPrice)} />}
        {fundingRate != null && (
          <StatBox
            label="Funding (1h)"
            value={(fundingRate >= 0 ? '+' : '') + (fundingRate * 100).toFixed(4) + '%'}
            cls={fundingRate >= 0 ? 'text-green-400' : 'text-red-400'}
          />
        )}
        {openInterest != null && <StatBox label="Open Interest" value={fmtOI(openInterest)} />}
      </div>

      {/* Main grid */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* Left: Chart + Trades */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-white/10">

          {/* Chart */}
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center gap-1 mb-3">
              {TIMEFRAMES.map(t => (
                <button
                  key={t.s}
                  onClick={() => setTf(t.s)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                    tf === t.s
                      ? 'bg-purple-600 text-white'
                      : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="h-56 md:h-72">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="perpGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.22} />
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
                    <XAxis
                      dataKey="time"
                      tickFormatter={v => fmtTime(Number(v), tf)}
                      tick={{ fill: 'rgba(255,255,255,0.28)', fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                      minTickGap={60}
                    />
                    <YAxis
                      yAxisId="p"
                      domain={[minP, maxP]}
                      tick={{ fill: 'rgba(255,255,255,0.28)', fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={v => fmtN(v)}
                      width={60}
                    />
                    <YAxis yAxisId="v" orientation="right" hide />
                    <Tooltip
                      contentStyle={{
                        background: '#1a1228',
                        border: '1px solid rgba(168,85,247,0.3)',
                        borderRadius: 8,
                        fontSize: 11,
                      }}
                      labelFormatter={v => fmtTime(Number(v), tf)}
                      formatter={(v: unknown, name: string) => {
                        if (name === 'price') return [fmtP(Number(v)), 'Price'];
                        if (name === 'volume') return [Number(v).toFixed(2), 'Volume'];
                        return [v, name];
                      }}
                    />
                    <Bar
                      yAxisId="v"
                      dataKey="volume"
                      fill="rgba(168,85,247,0.12)"
                      radius={[1, 1, 0, 0]}
                      maxBarSize={8}
                    />
                    <Area
                      yAxisId="p"
                      type="monotone"
                      dataKey="price"
                      stroke="#a855f7"
                      strokeWidth={1.5}
                      fill="url(#perpGrad)"
                      dot={false}
                      activeDot={{ r: 3, fill: '#a855f7', strokeWidth: 0 }}
                    />
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
                <span>Price (USD)</span>
                <span className="text-right">Size</span>
                <span className="text-right">Time</span>
              </div>
              <div className="overflow-y-auto max-h-52">
                {fills.length > 0 ? (
                  fills.slice(0, 25).map((f: any, i: number) => {
                    const price = parseFloat(f.price ?? '0');
                    const lots  = parseFloat(f.baseLots ?? '0');
                    const ts    = new Date(f.timestamp).toLocaleTimeString('en-US', {
                      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
                    });
                    const isBuy = f.liquidity !== 'maker';
                    return (
                      <div key={i} className="grid grid-cols-3 py-[3px] text-xs">
                        <span className={isBuy ? 'text-green-400' : 'text-red-400'}>{fmtP(price)}</span>
                        <span className="text-right text-white/55 font-mono">{lots.toFixed(3)}</span>
                        <span className="text-right text-white/28">{ts}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-white/20 text-xs py-6 text-center">No recent trades</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Orderbook + CTA */}
        <div className="w-full lg:w-[268px] flex flex-col shrink-0 border-t lg:border-t-0 border-white/10">
          <div className="px-4 py-2 text-[10px] font-semibold text-white/35 uppercase tracking-wider border-b border-white/10">
            Order Book
          </div>
          <div className="grid grid-cols-2 px-4 py-1 text-[10px] text-white/22 border-b border-white/5">
            <span>Price (USD)</span>
            <span className="text-right">Size</span>
          </div>

          {/* Asks (red) */}
          <div className="overflow-hidden">
            {displayAsks.length > 0 ? (
              displayAsks.map(([price, size]: [number, number], i: number) => {
                const maxS = Math.max(...displayAsks.map(([, s]: [number, number]) => s));
                const pct  = maxS > 0 ? (size / maxS) * 55 : 0;
                return (
                  <div key={i} className="relative grid grid-cols-2 px-4 py-[3px] text-xs hover:bg-white/[0.03]">
                    <div className="absolute inset-y-0 right-0 bg-red-500/[0.08]" style={{ width: `${pct}%` }} />
                    <span className="text-red-400 relative z-10 font-mono">{fmtN(price)}</span>
                    <span className="text-right text-white/55 relative z-10 font-mono">{size.toFixed(3)}</span>
                  </div>
                );
              })
            ) : (
              <div className="px-4 py-4 text-xs text-white/20 text-center">Loading…</div>
            )}
          </div>

          {/* Mid price */}
          <div className="px-4 py-2 border-y border-white/10 bg-white/[0.025] flex items-center justify-between">
            <span className={`text-sm font-bold font-mono ${isUp ? 'text-green-400' : 'text-red-400'}`}>
              {fmtP(midPrice)}
            </span>
            <span className="text-[10px] text-white/22">spread</span>
          </div>

          {/* Bids (green) */}
          <div className="overflow-hidden">
            {displayBids.length > 0 ? (
              displayBids.map(([price, size]: [number, number], i: number) => {
                const maxS = Math.max(...displayBids.map(([, s]: [number, number]) => s));
                const pct  = maxS > 0 ? (size / maxS) * 55 : 0;
                return (
                  <div key={i} className="relative grid grid-cols-2 px-4 py-[3px] text-xs hover:bg-white/[0.03]">
                    <div className="absolute inset-y-0 right-0 bg-green-500/[0.08]" style={{ width: `${pct}%` }} />
                    <span className="text-green-400 relative z-10 font-mono">{fmtN(price)}</span>
                    <span className="text-right text-white/55 relative z-10 font-mono">{size.toFixed(3)}</span>
                  </div>
                );
              })
            ) : (
              <div className="px-4 py-4 text-xs text-white/20 text-center">Loading…</div>
            )}
          </div>

          {/* CTA */}
          <div className="mt-auto p-4 border-t border-white/10">
            <a
              href="https://phoenix.trade"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 bg-purple-600 hover:bg-purple-500 rounded-xl font-semibold text-sm transition"
            >
              Trade on Phoenix
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <p className="text-center text-[10px] text-white/22 mt-2">Perpetuals powered by Phoenix DEX</p>
          </div>
        </div>
      </div>
    </div>
  );
}
