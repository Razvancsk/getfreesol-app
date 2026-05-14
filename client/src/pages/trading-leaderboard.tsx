import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Trophy, ArrowLeft } from 'lucide-react';
import logoImage from '@assets/image_1757882056840.png';

type LeaderboardEntry = {
  rank: number;
  walletAddress: string;
  totalVolumeUsd: number;
  tradeCount: number;
  lastTrade: string;
};

function fmtUsd(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function rankColor(rank: number) {
  if (rank === 1) return '#FFD700';
  if (rank === 2) return '#C0C0C0';
  if (rank === 3) return '#CD7F32';
  return 'rgba(255,255,255,0.4)';
}

export default function TradingLeaderboard() {
  const { data, isFetching } = useQuery<{ success: boolean; leaderboard: LeaderboardEntry[] }>({
    queryKey: ['/api/statistics/trading-leaderboard'],
    queryFn: async () => {
      const r = await fetch('/api/statistics/trading-leaderboard?period=all&limit=50');
      if (!r.ok) throw new Error('failed');
      return r.json();
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  const leaderboard = data?.leaderboard ?? [];
  const totalVolume = leaderboard.reduce((s, e) => s + e.totalVolumeUsd, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      <div className="container mx-auto max-w-2xl px-4 pt-6 pb-12">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/terminal">
            <a className="text-white/50 hover:text-white transition">
              <ArrowLeft className="h-5 w-5" />
            </a>
          </Link>
          <img src={logoImage} alt="logo" className="h-8 w-auto" />
          <div>
            <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-400" />
              Trading Leaderboard
            </h1>
            <p className="text-white/40 text-xs">Top traders by all-time swap volume on our platform</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-purple-900/30 border border-purple-500/20 rounded-xl p-3 text-center">
            <div className="text-white/50 text-[11px] uppercase tracking-wider mb-1">Total Volume</div>
            <div className="text-white font-bold text-lg">{fmtUsd(totalVolume)}</div>
          </div>
          <div className="bg-purple-900/30 border border-purple-500/20 rounded-xl p-3 text-center">
            <div className="text-white/50 text-[11px] uppercase tracking-wider mb-1">Traders</div>
            <div className="text-white font-bold text-lg">{leaderboard.length}</div>
          </div>
        </div>

        <div className="space-y-2">
          {isFetching && leaderboard.length === 0 && (
            <div className="text-center py-16 text-white/40">Loading…</div>
          )}
          {!isFetching && leaderboard.length === 0 && (
            <div className="text-center py-16 text-white/40">No trades recorded yet.</div>
          )}
          {leaderboard.map((entry) => (
            <div
              key={entry.walletAddress}
              className="flex items-center gap-3 bg-purple-900/20 border border-purple-500/15 rounded-xl px-4 py-3 hover:border-purple-500/30 transition"
            >
              <div className="w-8 text-center shrink-0">
                <span className="font-black text-sm" style={{ color: rankColor(entry.rank) }}>
                  #{entry.rank}
                </span>
              </div>
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: `hsl(${(parseInt(entry.walletAddress.slice(0, 4), 16) % 360)}, 60%, 35%)` }}
              >
                {entry.walletAddress.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-sm text-white font-semibold">
                  {shortAddr(entry.walletAddress)}
                </div>
                <div className="text-white/40 text-[11px]">
                  {entry.tradeCount.toLocaleString()} trade{entry.tradeCount !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-bold text-sm text-emerald-400">{fmtUsd(entry.totalVolumeUsd)}</div>
                <div className="text-white/30 text-[10px]">volume</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
