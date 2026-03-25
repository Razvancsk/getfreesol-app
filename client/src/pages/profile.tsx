import { useState } from 'react';
import { useWalletAdapter } from '@/hooks/useWalletAdapter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { ArrowLeft, Copy, Wallet, Trophy, Flame, Star } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import logoImage from '@assets/image_1757882056840.png';

interface UserStats {
  totalSolClaimed: number;
  totalAccountsClosed: number;
  totalTokensBurned: number;
  totalNftsBurned: number;
  totalPoints: number;
  referralCode: string;
  referralEarnings: number;
}

interface LeaderboardEntry {
  rank: number;
  walletAddress: string;
  totalSolRecovered: string;
}

export default function ProfilePage() {
  const { publicKey } = useWalletAdapter();
  const { toast } = useToast();
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<'weekly' | 'all'>('all');

  const { data: stats, isLoading } = useQuery<UserStats>({
    queryKey: ['/api/user/stats', publicKey?.toString()],
    queryFn: async () => {
      const response = await fetch(`/api/user/stats/${publicKey?.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    },
    enabled: !!publicKey,
  });

  const { data: leaderboardData, isLoading: isLoadingLeaderboard } = useQuery<{ success: boolean; leaderboard: LeaderboardEntry[] }>({
    queryKey: ['/api/statistics/leaderboard', leaderboardPeriod],
    queryFn: async () => {
      const period = leaderboardPeriod === 'weekly' ? 'weekly' : 'all';
      const response = await fetch(`/api/statistics/leaderboard?period=${period}&limit=10`);
      if (!response.ok) throw new Error('Failed to fetch leaderboard');
      return response.json();
    },
  });

  const truncateWallet = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const formatXP = (n: number): string => {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return n.toString();
  };

  if (!publicKey) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <Card className="bg-slate-800/50 border-purple-500/30 max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Wallet className="h-16 w-16 text-purple-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Connect Your Wallet</h2>
            <p className="text-purple-300 mb-4">Please connect your wallet to view your profile</p>
            <Link href="/">
              <Button className="bg-purple-600 hover:bg-purple-700">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Go Back
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <Link href="/">
            <Button variant="ghost" className="text-purple-300 hover:text-white hover:bg-purple-800/30">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <img src={logoImage} alt="Logo" className="h-8 w-8" />
            <span className="text-white font-bold text-lg">Get Free Sol</span>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-800/80 border border-purple-500/30 rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-300 text-sm">SOL Claimed</p>
                  <p className="text-2xl font-bold text-white" data-testid="text-sol-claimed">
                    {isLoading ? '...' : parseFloat(String(stats?.totalSolClaimed || 0)).toFixed(4)}
                  </p>
                </div>
                <svg className="h-8 w-8" viewBox="0 0 397.7 311.7" style={{ fill: '#00FFA3' }}>
                  <path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"/>
                  <path d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1L333.1,73.8c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"/>
                  <path d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z"/>
                </svg>
              </div>
            </div>

            <div className="bg-slate-800/80 border border-purple-500/30 rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-300 text-sm">Accounts Closed</p>
                  <p className="text-2xl font-bold text-white" data-testid="text-accounts-closed">
                    {isLoading ? '...' : (stats?.totalAccountsClosed || 0)}
                  </p>
                </div>
                <Wallet className="h-8 w-8 text-green-400" />
              </div>
            </div>

            <div className="bg-slate-800/80 border border-purple-500/30 rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-300 text-sm">Tokens Burned</p>
                  <p className="text-2xl font-bold text-white" data-testid="text-tokens-burned">
                    {isLoading ? '...' : (stats?.totalTokensBurned || 0)}
                  </p>
                </div>
                <Flame className="h-8 w-8 text-orange-400" />
              </div>
            </div>

            <div className="bg-slate-800/80 border border-yellow-500/30 rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-yellow-300 text-sm">XP Points</p>
                  <p className="text-2xl font-bold text-yellow-300" data-testid="text-xp-points">
                    {isLoading ? '...' : formatXP(stats?.totalPoints || 0)}
                  </p>
                </div>
                <Star className="h-8 w-8 text-yellow-400" />
              </div>
            </div>

          </div>

          {stats?.referralCode && (
            <div className="bg-slate-800/80 border border-purple-500/30 rounded-xl p-6">
              <h3 className="text-white font-semibold text-lg flex items-center gap-2 mb-1">
                <Trophy className="h-5 w-5 text-purple-400" />
                Your Referral Information
              </h3>
              <p className="text-purple-300 text-sm mb-4">Earn 50% of the fees from referred users!</p>
              <div className="space-y-4">
                <div>
                  <p className="text-purple-300 text-sm mb-2">Referral Link</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-900/50 px-4 py-2 rounded overflow-hidden">
                      <span className="text-white font-mono text-sm break-all" data-testid="text-referral-link">
                        {`${window.location.origin}/${stats.referralCode}`}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/${stats.referralCode}`);
                        toast({
                          title: 'Copied!',
                          description: 'Referral link copied to clipboard',
                        });
                      }}
                      className="text-purple-400 hover:text-white p-2"
                      data-testid="button-copy-referral"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="text-purple-300 text-sm mb-1">Referral Earnings</p>
                  <p className="text-2xl font-bold text-white" data-testid="text-referral-earnings">
                    {parseFloat(String(stats.referralEarnings || 0)).toFixed(4)} SOL
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Leaderboard */}
          <div className="bg-slate-800/80 border border-purple-500/30 rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-white font-semibold text-lg flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-400" />
                Top 10 Leaders
              </h3>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className={leaderboardPeriod === 'weekly' ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-transparent border border-purple-500 text-purple-200 hover:bg-purple-700/50'}
                  onClick={() => setLeaderboardPeriod('weekly')}
                >
                  7 Days
                </Button>
                <Button
                  size="sm"
                  className={leaderboardPeriod === 'all' ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-transparent border border-purple-500 text-purple-200 hover:bg-purple-700/50'}
                  onClick={() => setLeaderboardPeriod('all')}
                >
                  All Time
                </Button>
              </div>
            </div>
            <p className="text-purple-300 text-sm mb-4">
              {leaderboardPeriod === 'weekly' ? 'Top SOL claimers in the last 7 days' : 'Top 10 users with the most SOL recovered'}
            </p>
            
            {isLoadingLeaderboard ? (
              <div className="text-center py-8 text-purple-300">Loading leaderboard...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-purple-500/30">
                      <th className="text-left py-3 px-2 text-purple-300 text-sm font-medium">Rank</th>
                      <th className="text-left py-3 px-2 text-purple-300 text-sm font-medium">Wallet</th>
                      <th className="text-right py-3 px-2 text-purple-300 text-sm font-medium">SOL Recovered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboardData?.leaderboard?.map((entry, index) => {
                      const rank = index + 1;
                      return (
                        <tr 
                          key={entry.walletAddress} 
                          className="border-b border-purple-500/20 hover:bg-purple-900/20"
                        >
                          <td className="py-3 px-2">
                            <span className={`inline-flex items-center justify-center w-8 h-6 rounded text-xs font-bold ${
                              rank === 1 ? 'bg-yellow-500 text-black' :
                              rank === 2 ? 'bg-gray-300 text-black' :
                              rank === 3 ? 'bg-amber-600 text-white' :
                              'bg-purple-700 text-white'
                            }`}>
                              #{rank}
                            </span>
                          </td>
                          <td className="py-3 px-2">
                            <span className="text-white font-mono text-sm hidden sm:inline">
                              {entry.walletAddress}
                            </span>
                            <span className="text-white font-mono text-sm sm:hidden">
                              {truncateWallet(entry.walletAddress)}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-right">
                            <span className="text-green-400 font-medium">
                              {parseFloat(entry.totalSolRecovered || '0').toFixed(4)} SOL
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
