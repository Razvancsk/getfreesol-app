import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Users, DollarSign, Trophy, TrendingUp } from "lucide-react";

type TimePeriod = '24h' | 'weekly' | 'all';

interface StatisticsOverview {
  totalUsers: number;
  totalSolRecovered: string;
}

interface LeaderboardEntry {
  walletAddress: string;
  totalSolRecovered: string;
}

export default function Statistics() {
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('24h');

  // Fetch overview statistics
  const { data: overviewData, isLoading: overviewLoading } = useQuery<{ success: boolean; period: string; stats: StatisticsOverview }>({
    queryKey: ['/api/statistics/overview', selectedPeriod],
    queryFn: async () => {
      const response = await fetch(`/api/statistics/overview?period=${selectedPeriod}`);
      if (!response.ok) throw new Error('Failed to fetch statistics');
      return response.json();
    }
  });

  // Fetch leaderboard
  const { data: leaderboardData, isLoading: leaderboardLoading } = useQuery<{ success: boolean; period: string; leaderboard: LeaderboardEntry[] }>({
    queryKey: ['/api/statistics/leaderboard', selectedPeriod],
    queryFn: async () => {
      const response = await fetch(`/api/statistics/leaderboard?period=${selectedPeriod}&limit=10`);
      if (!response.ok) throw new Error('Failed to fetch leaderboard');
      return response.json();
    }
  });

  const formatSol = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return num.toFixed(4);
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const getPeriodLabel = (period: TimePeriod) => {
    switch (period) {
      case '24h': return 'Last 24 Hours';
      case 'weekly': return 'Last 7 Days';
      case 'all': return 'All Time';
      default: return 'Last 24 Hours';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 text-white">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2 flex items-center justify-center gap-2">
            <TrendingUp className="w-8 h-8" />
            Platform Statistics
          </h1>
          <p className="text-purple-200">Track rent recovery metrics and top performers</p>
        </div>

        {/* Time Period Filter */}
        <div className="flex justify-center gap-2 mb-8">
          <Button
            data-testid="filter-24h"
            variant={selectedPeriod === '24h' ? 'default' : 'outline'}
            onClick={() => setSelectedPeriod('24h')}
            className={selectedPeriod === '24h' ? 'bg-purple-600 hover:bg-purple-700' : 'border-purple-400 text-white hover:bg-purple-800'}
          >
            24 Hours
          </Button>
          <Button
            data-testid="filter-weekly"
            variant={selectedPeriod === 'weekly' ? 'default' : 'outline'}
            onClick={() => setSelectedPeriod('weekly')}
            className={selectedPeriod === 'weekly' ? 'bg-purple-600 hover:bg-purple-700' : 'border-purple-400 text-white hover:bg-purple-800'}
          >
            Weekly
          </Button>
          <Button
            data-testid="filter-all-time"
            variant={selectedPeriod === 'all' ? 'default' : 'outline'}
            onClick={() => setSelectedPeriod('all')}
            className={selectedPeriod === 'all' ? 'bg-purple-600 hover:bg-purple-700' : 'border-purple-400 text-white hover:bg-purple-800'}
          >
            All Time
          </Button>
        </div>

        {/* Overview Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Total Users */}
          <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Users className="w-5 h-5 text-purple-300" />
                Total Users
              </CardTitle>
              <CardDescription className="text-purple-200">
                Unique wallets that reclaimed rent
              </CardDescription>
            </CardHeader>
            <CardContent>
              {overviewLoading ? (
                <div className="text-3xl font-bold text-purple-300">Loading...</div>
              ) : (
                <div data-testid="stat-total-users" className="text-4xl font-bold text-white">
                  {overviewData?.stats.totalUsers.toLocaleString() || '0'}
                </div>
              )}
              <p className="text-sm text-purple-300 mt-2">{getPeriodLabel(selectedPeriod)}</p>
            </CardContent>
          </Card>

          {/* Total SOL Recovered */}
          <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <DollarSign className="w-5 h-5 text-green-400" />
                Total SOL Recovered
              </CardTitle>
              <CardDescription className="text-purple-200">
                Rent reclaimed across all users
              </CardDescription>
            </CardHeader>
            <CardContent>
              {overviewLoading ? (
                <div className="text-3xl font-bold text-green-400">Loading...</div>
              ) : (
                <div data-testid="stat-total-sol" className="text-4xl font-bold text-green-400">
                  {formatSol(overviewData?.stats.totalSolRecovered || '0')} SOL
                </div>
              )}
              <p className="text-sm text-purple-300 mt-2">{getPeriodLabel(selectedPeriod)}</p>
            </CardContent>
          </Card>
        </div>

        <Separator className="bg-purple-600 mb-8" />

        {/* Leaderboard */}
        <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Trophy className="w-6 h-6 text-yellow-400" />
              Top Addresses Leaderboard
            </CardTitle>
            <CardDescription className="text-purple-200">
              Addresses that recovered the most rent {getPeriodLabel(selectedPeriod).toLowerCase()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {leaderboardLoading ? (
              <div className="text-center py-8 text-purple-300">Loading leaderboard...</div>
            ) : leaderboardData && leaderboardData.leaderboard.length > 0 ? (
              <div className="flex flex-col gap-4">
                {leaderboardData.leaderboard.map((entry, index) => {
                  // Medal configuration for top 3
                  const getMedalBadge = (rank: number) => {
                    if (rank === 0) {
                      return {
                        emoji: '🥇',
                        label: '1st',
                        className: 'bg-yellow-500 text-black hover:bg-yellow-600'
                      };
                    } else if (rank === 1) {
                      return {
                        emoji: '🥈',
                        label: '2nd',
                        className: 'bg-gray-400 text-black hover:bg-gray-500'
                      };
                    } else if (rank === 2) {
                      return {
                        emoji: '🥉',
                        label: '3rd',
                        className: 'bg-orange-600 text-white hover:bg-orange-700'
                      };
                    } else {
                      return {
                        emoji: '',
                        label: `${rank + 1}th`,
                        className: 'bg-purple-600/50 text-white hover:bg-purple-600/70'
                      };
                    }
                  };

                  const medal = getMedalBadge(index);

                  return (
                    <div
                      key={entry.walletAddress}
                      className="flex items-center justify-between gap-4 p-4 bg-gradient-to-r from-purple-800/80 to-indigo-800/80 backdrop-blur border border-purple-600/60 rounded-xl hover:from-purple-700/80 hover:to-indigo-700/80 transition-all"
                      data-testid={`card-leaderboard-row-${index}`}
                    >
                      {/* Medal Badge */}
                      <Badge 
                        className={`${medal.className} px-3 py-1 text-sm font-semibold`}
                        data-testid={`badge-rank-${index}`}
                      >
                        {medal.emoji && <span className="mr-1">{medal.emoji}</span>}
                        {medal.label}
                      </Badge>

                      {/* Wallet Address Link */}
                      <a
                        href={`https://solscan.io/account/${entry.walletAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-purple-300 hover:text-purple-100 hover:underline font-mono text-sm"
                        data-testid={`link-address-${index}`}
                      >
                        {truncateAddress(entry.walletAddress)}
                      </a>

                      {/* SOL Amount */}
                      <div 
                        className="text-green-400 font-bold text-lg"
                        data-testid={`text-amount-${index}`}
                      >
                        {formatSol(entry.totalSolRecovered)} SOL
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-purple-300">
                No data available for this time period
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
