import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface Props {
  tvl: number | null;
  holders: number | null;
  solValue: number;
  gsolBalance?: number;
  gsolApy?: number | null;
  connected?: boolean;
  jupPortfolio?: any;
  jupPortfolioLoading?: boolean;
  walletAddress?: string | null;
}

const GSOL_MINT_ADDR = 'GSoLRcWKQE5nbWTYFr83Ei3HGjnp9YzQNAFK6VAATg3';

interface RateHistory {
  epochs: { epoch: number; rate: number; apy: number; date: string }[];
  currentRate: number;
  latestApy?: number | null;
}

function formatTvl(tvlLamports: number | null): string {
  if (tvlLamports === null) return '—';
  const sol = tvlLamports / 1e9;
  if (sol >= 1000) return `${(sol / 1000).toFixed(2)}K SOL`;
  return `${sol.toFixed(3)} SOL`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function GsolRateHistoryCard({ tvl, holders, solValue, gsolBalance = 0, gsolApy = null, connected = false, jupPortfolio, jupPortfolioLoading = false, walletAddress = null }: Props) {
  const [view, setView] = useState<'overview' | 'position'>('overview');
  const [period, setPeriod] = useState<'30d' | 'all'>('30d');
  const [hovered, setHovered] = useState<{ epoch: number; apy: number; date: string } | null>(null);

  const { data, isLoading } = useQuery<RateHistory>({
    queryKey: ['/api/staking/rate-history'],
    refetchInterval: 60 * 60 * 1000,
    staleTime: 30 * 60 * 1000,
  });

  const epochs = data?.epochs ?? [];
  const nowMs = Date.now();
  const periodMs = period === '30d' ? 30 * 86400000 : Infinity;
  const filtered = period === 'all'
    ? epochs
    : epochs.filter(e => nowMs - new Date(e.date).getTime() <= periodMs);
  const last25 = filtered.length > 0 ? filtered : epochs.slice(-1);
  const currentRate = data?.currentRate ?? solValue ?? 1;
  const apyValues = last25.map(e => (e.apy ?? 0) * 100).filter(v => v > 0);
  const maxApy = apyValues.length ? Math.max(...apyValues) : 6;
  const yMax = Math.ceil(maxApy * 1.2);
  const sanctumLatestApy = data?.latestApy ? data.latestApy * 100 : null;
  const lastEpochApy = last25.length ? (last25[last25.length - 1].apy ?? 0) * 100 : 0;
  const lastEpochObj = last25.length ? last25[last25.length - 1] : null;
  const defaultApy = sanctumLatestApy ?? (lastEpochApy > 0 ? lastEpochApy : (gsolApy ?? null));
  const displayApy = hovered ? hovered.apy : defaultApy;
  const solEquivalent = gsolBalance * currentRate;
  const yearlyEarnings = displayApy && gsolBalance > 0 ? (solEquivalent * displayApy) / 100 : 0;

  return (
    <div className="w-full rounded-2xl bg-purple-900/20 border border-white/20 backdrop-blur-sm overflow-hidden mt-6">
      <div className="px-0 pt-4 pb-0 relative">
        <div className="flex items-start justify-between mb-4 gap-3">
          <div>
            <h2 className="text-green-400 font-black text-3xl">
              {displayApy !== null ? `${displayApy.toFixed(2)}%` : '—'}
            </h2>
            {view === 'overview' && (
              <p className="text-base font-bold mt-1 text-white">
                {hovered
                  ? `${formatDate(hovered.date)}, Epoch ${hovered.epoch}`
                  : "Last Epoch's APY"}
              </p>
            )}
          </div>
          <div className="absolute top-0 right-0 flex items-center gap-1 bg-purple-900/30 rounded-bl-lg p-1 border border-t-0 border-r-0 border-white/20 shrink-0">
            <button
              onClick={() => setView('overview')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                view === 'overview' ? 'bg-purple-600 text-white' : 'text-white hover:text-white'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setView('position')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                view === 'position' ? 'bg-purple-600 text-white' : 'text-white hover:text-white'
              }`}
            >
              My Position
            </button>
          </div>
        </div>

        {view === 'overview' ? (
          <>
            <div className="flex items-center gap-1 mb-3 bg-purple-900/30 rounded-lg p-1 border border-white/20 w-fit">
              {(['30d', 'all'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                    period === p ? 'bg-purple-600 text-white' : 'text-white hover:text-white'
                  }`}
                >
                  {p === '30d' ? 'Last 30 days' : 'All time'}
                </button>
              ))}
            </div>
            <div className="h-[260px] w-full relative">
              <div className="absolute top-0 right-10 text-xs font-bold text-white z-10 pointer-events-none">
                Display limit: 25% APY
              </div>
              {isLoading ? (
                <div className="h-full flex items-center justify-center text-white text-sm">Loading chart…</div>
              ) : last25.length === 0 ? (
                <div className="h-full flex items-center justify-center text-white text-sm">No data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={last25.map(e => ({ ...e, apyPct: (e.apy ?? 0) * 100 }))}
                    margin={{ top: 10, right: 4, left: 0, bottom: 0 }}
                    barCategoryGap="15%"
                    onMouseMove={(state: any) => {
                      const p = state?.activePayload?.[0]?.payload;
                      if (p) setHovered({ epoch: p.epoch, apy: p.apyPct, date: p.date });
                    }}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <YAxis
                      type="number"
                      orientation="right"
                      domain={[0, 25]}
                      ticks={[0, 4, 8, 12, 16, 20, 24]}
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fill: '#ffffff', fontSize: 11, fontWeight: 700 }}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                    />
                    <XAxis
                      dataKey="epoch"
                      type="category"
                      tick={{ fill: '#ffffff', fontSize: 11, fontWeight: 700 }}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      ticks={
                        last25.length > 15
                          ? last25.filter(e => e.epoch % 2 === 1).map(e => e.epoch)
                          : last25.map(e => e.epoch)
                      }
                    />
                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.08)' }} content={() => null} />
                    <Bar dataKey="apyPct" radius={[3, 3, 0, 0]} fill="#16a34a" maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

          </>
        ) : (
          <div className="space-y-3">
            {!connected ? (
              <div className="bg-purple-900/20 border border-white/20 rounded-xl p-6 text-center text-white text-sm">
                Connect your wallet to view your position
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-purple-900/20 border border-white/20 rounded-xl p-4">
                    <div className="text-white text-sm">Your GSOL Balance</div>
                    <div className="text-white font-bold text-2xl mt-1">{gsolBalance.toFixed(4)} GSOL</div>
                  </div>
                  <div className="bg-purple-900/20 border border-white/20 rounded-xl p-4">
                    <div className="text-white text-sm">SOL Value</div>
                    <div className="text-white font-bold text-2xl mt-1">{solEquivalent.toFixed(4)} SOL</div>
                  </div>
                </div>
                {(() => {
                  const fmtUsd = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(Math.abs(n) >= 100 ? 2 : 4)}`;
                  const totalValue = Number(jupPortfolio?.currentValue ?? 0);
                  const positions: any[] = Array.isArray(jupPortfolio?.positions) ? jupPortfolio.positions : [];

                  return (
                    <div className="bg-purple-900/20 border border-white/20 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-white text-sm font-semibold">Holdings</div>
                        <div className="flex items-center gap-3">
                          <div className="text-white font-bold text-base">{fmtUsd(totalValue)}</div>
                          {walletAddress && (
                            <a
                              href={`https://jup.ag/portfolio/${walletAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-purple-200 hover:text-white underline"
                            >
                              PnL on Jupiter ↗
                            </a>
                          )}
                        </div>
                      </div>
                      {jupPortfolioLoading ? (
                        <div className="text-white/70 text-sm">Loading holdings…</div>
                      ) : positions.length === 0 ? (
                        <div className="text-white/70 text-xs">No tokens held.</div>
                      ) : (
                        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                          {positions.map((p: any) => {
                            const qty = Number(p.qty);
                            const val = Number(p.currentValue);
                            const px = Number(p.currentPrice);
                            const sym = p.symbol || `${String(p.mint).slice(0, 4)}…${String(p.mint).slice(-4)}`;
                            const qtyStr = qty >= 1 ? qty.toLocaleString(undefined, { maximumFractionDigits: 4 }) : qty.toFixed(6);
                            return (
                              <div key={p.mint} className="flex items-center justify-between text-xs bg-black/20 rounded-lg px-3 py-2">
                                <div className="min-w-0">
                                  <div className="text-white font-semibold truncate">{sym}</div>
                                  <div className="text-white/50 text-[10px]">{qtyStr} @ {fmtUsd(px)}</div>
                                </div>
                                <div className="text-right shrink-0 ml-2">
                                  <div className="text-white font-bold">{fmtUsd(val)}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="text-white/40 text-[10px] mt-3 leading-snug">
                        For accurate PnL with cost basis, view on Jupiter →
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
