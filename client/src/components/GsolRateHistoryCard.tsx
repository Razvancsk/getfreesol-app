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
}

interface RateHistory {
  epochs: { epoch: number; rate: number; date: string }[];
  currentRate: number;
}

function formatTvl(tvlLamports: number | null): string {
  if (tvlLamports === null) return '—';
  const sol = tvlLamports / 1e9;
  if (sol >= 1000) return `${(sol / 1000).toFixed(2)}K SOL`;
  return `${sol.toFixed(3)} SOL`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function GsolRateHistoryCard({ tvl, holders, solValue, gsolBalance = 0, gsolApy = null, connected = false }: Props) {
  const [view, setView] = useState<'overview' | 'position'>('overview');
  const [period, setPeriod] = useState<'30d' | 'all'>('30d');

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
  const minRate = last25.length ? Math.min(...last25.map(e => e.rate)) : 1;
  const maxRate = last25.length ? Math.max(...last25.map(e => e.rate)) : currentRate;
  const midRate = (minRate + maxRate) / 2;

  const apyApprox = (() => {
    if (last25.length < 2) return null;
    const first = last25[0];
    const last = last25[last25.length - 1];
    const days = (new Date(last.date).getTime() - new Date(first.date).getTime()) / (1000 * 60 * 60 * 24);
    if (days <= 0) return null;
    const ratio = last.rate / first.rate;
    if (ratio <= 1) return null;
    return (Math.pow(ratio, 365.25 / days) - 1) * 100;
  })();

  const displayApy = gsolApy ?? apyApprox;
  const solEquivalent = gsolBalance * currentRate;
  const yearlyEarnings = displayApy && gsolBalance > 0 ? (solEquivalent * displayApy) / 100 : 0;

  return (
    <div className="w-full rounded-2xl bg-purple-900/20 border border-white/20 backdrop-blur-sm overflow-hidden mt-6">
      <div className="p-5">
        <div className="flex items-start justify-between mb-4 gap-3">
          <div>
            <h2 className="font-black text-3xl" style={{ color: '#14F195' }}>
              {displayApy !== null ? `${displayApy.toFixed(2)}%` : '—'}
            </h2>
            {view === 'overview' && (
              <p className="text-sm mt-0.5 text-white">
                Last Epoch's APY
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 bg-purple-900/30 rounded-lg p-1 border border-white/20 shrink-0">
            <button
              onClick={() => setView('overview')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                view === 'overview' ? 'bg-purple-600 text-white' : 'text-white hover:text-white'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setView('position')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
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
            <div className="h-[200px] w-full">
              {isLoading ? (
                <div className="h-full flex items-center justify-center text-white text-sm">Loading chart…</div>
              ) : last25.length === 0 ? (
                <div className="h-full flex items-center justify-center text-white text-sm">No data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={last25} margin={{ top: 10, right: 10, left: 0, bottom: 25 }}>
                    <YAxis
                      type="number"
                      domain={[minRate * 0.999, maxRate * 1.001]}
                      ticks={[minRate, midRate, maxRate]}
                      tickFormatter={(v) => v.toFixed(4)}
                      tick={{ fill: '#ffffff', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={55}
                    />
                    <XAxis
                      dataKey="epoch"
                      tick={({ x, y, payload, index }: any) => {
                        const step = Math.max(1, Math.ceil(last25.length / 6));
                        if (index % step !== 0 && index !== last25.length - 1) return <g />;
                        const ep = last25[index];
                        return (
                          <g transform={`translate(${x},${y})`}>
                            <text x={0} y={0} dy={12} textAnchor="middle" fill="#ffffff" fontSize={11} fontWeight="bold">
                              Ep {payload.value}
                            </text>
                            <text x={0} y={0} dy={26} textAnchor="middle" fill="#ffffff" fontSize={10}>
                              {formatDate(ep.date)}
                            </text>
                          </g>
                        );
                      }}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      contentStyle={{
                        backgroundColor: 'rgba(20,5,40,0.95)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '12px',
                      }}
                      formatter={(v: any) => [`${Number(v).toFixed(6)} SOL`, '1 GSOL']}
                      labelFormatter={(label: any, payload: any) => {
                        const item = payload?.[0]?.payload;
                        return `Epoch ${label}${item ? ` · ${formatDate(item.date)}` : ''}`;
                      }}
                    />
                    <Bar dataKey="rate" radius={[3, 3, 0, 0]} fill="#14F195" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 mt-3">
              <div className="bg-purple-900/20 border border-white/20 rounded-xl p-3">
                <div className="text-white text-xs">Total Staked</div>
                <div className="text-white font-bold text-base mt-1">{formatTvl(tvl)}</div>
              </div>
              <div className="bg-purple-900/20 border border-white/20 rounded-xl p-3">
                <div className="text-white text-xs">Holders</div>
                <div className="text-white font-bold text-base mt-1">
                  {holders !== null ? holders.toLocaleString() : '—'}
                </div>
              </div>
              <div className="bg-purple-900/20 border border-white/20 rounded-xl p-3">
                <div className="text-white text-xs">1 GSOL =</div>
                <div className="text-white font-bold text-base mt-1">{currentRate.toFixed(6)} SOL</div>
              </div>
            </div>

            <p className="text-center text-white text-xs mt-3">
              Data refreshed once per Solana epoch (~2 days) · {epochs.length} epochs recorded
            </p>
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
                    <div className="text-white font-bold text-2xl mt-1">{gsolBalance.toFixed(4)}</div>
                    <div className="text-white text-xs mt-0.5">GSOL</div>
                  </div>
                  <div className="bg-purple-900/20 border border-white/20 rounded-xl p-4">
                    <div className="text-white text-sm">SOL Value</div>
                    <div className="text-white font-bold text-2xl mt-1">{solEquivalent.toFixed(4)}</div>
                    <div className="text-white text-xs mt-0.5">SOL</div>
                  </div>
                </div>
                <div className="bg-purple-900/20 border border-white/20 rounded-xl p-4">
                  <div className="text-white text-sm">Estimated Yearly Earnings</div>
                  <div className="font-black text-2xl mt-1" style={{ color: '#14F195' }}>
                    +{yearlyEarnings.toFixed(4)} SOL
                  </div>
                  <div className="text-white text-xs mt-1">
                    At current {displayApy !== null ? displayApy.toFixed(1) : '—'}% APY
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
