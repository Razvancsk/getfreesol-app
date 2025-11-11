import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Users, DollarSign, Trophy, TrendingUp } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TimePeriod = '24h' | 'weekly' | 'monthly';

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
      case 'monthly': return 'Last 30 Days';
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
            data-testid="filter-monthly"
            variant={selectedPeriod === 'monthly' ? 'default' : 'outline'}
            onClick={() => setSelectedPeriod('monthly')}
            className={selectedPeriod === 'monthly' ? 'bg-purple-600 hover:bg-purple-700' : 'border-purple-400 text-white hover:bg-purple-800'}
          >
            Monthly
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
        <Card className="!bg-gradient-to-br !from-purple-800/50 !to-purple-900/40 border-purple-500/30 backdrop-blur-sm shadow-xl">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-white text-2xl">
              <TrendingUp className="w-7 h-7 text-yellow-400" />
              Top Addresses Leaderboard
            </CardTitle>
            <CardDescription className="text-purple-200 text-base mt-2">
              Addresses that recovered the most rent (all time)
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {/* Filter Buttons */}
            <div className="flex items-center gap-3 p-4 bg-purple-900/40 rounded-lg border border-purple-500/20">
              <span className="text-purple-200 font-medium text-sm">Filter by:</span>
              <div className="flex gap-2">
                <Button
                  onClick={() => setSelectedPeriod('24h')}
                  variant={selectedPeriod === '24h' ? 'default' : 'outline'}
                  size="sm"
                  className={`transition-all ${
                    selectedPeriod === '24h' 
                      ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-md' 
                      : 'border-purple-400/50 text-purple-200 hover:bg-purple-700/50 hover:border-purple-400'
                  }`}
                  data-testid="filter-daily"
                >
                  📅 Daily
                </Button>
                <Button
                  onClick={() => setSelectedPeriod('weekly')}
                  variant={selectedPeriod === 'weekly' ? 'default' : 'outline'}
                  size="sm"
                  className={`transition-all ${
                    selectedPeriod === 'weekly' 
                      ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-md' 
                      : 'border-purple-400/50 text-purple-200 hover:bg-purple-700/50 hover:border-purple-400'
                  }`}
                  data-testid="filter-weekly"
                >
                  📊 Weekly
                </Button>
                <Button
                  onClick={() => setSelectedPeriod('monthly')}
                  variant={selectedPeriod === 'monthly' ? 'default' : 'outline'}
                  size="sm"
                  className={`transition-all ${
                    selectedPeriod === 'monthly' 
                      ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-md' 
                      : 'border-purple-400/50 text-purple-200 hover:bg-purple-700/50 hover:border-purple-400'
                  }`}
                  data-testid="filter-monthly"
                >
                  📈 Monthly
                </Button>
              </div>
              <div className="ml-auto text-sm text-purple-300 font-medium">
                {selectedPeriod === '24h' ? 'Last 24 hours' : selectedPeriod === 'weekly' ? 'Last 7 days' : 'Last 30 days'}
              </div>
            </div>

            {/* Leaderboard List */}
            {leaderboardLoading ? (
              <div className="text-center py-12 text-purple-300">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400 mb-3"></div>
                <div>Loading leaderboard...</div>
              </div>
            ) : leaderboardData && leaderboardData.leaderboard.length > 0 ? (
              <div className="space-y-2">
                {leaderboardData.leaderboard.map((entry, index) => (
                  <div 
                    key={entry.walletAddress} 
                    className="flex items-center justify-between p-4 bg-purple-900/30 border border-purple-500/20 rounded-lg hover:bg-purple-700/30 transition-all hover:border-purple-400/40"
                    data-testid={`leaderboard-row-${index}`}
                  >
                    <div className="flex items-center gap-4">
                      {index === 0 && (
                        <Badge className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-black hover:from-yellow-500 hover:to-yellow-600 shadow-md px-3 py-1.5">
                          🥇 1st
                        </Badge>
                      )}
                      {index === 1 && (
                        <Badge className="bg-gradient-to-r from-gray-300 to-gray-400 text-black hover:from-gray-400 hover:to-gray-500 shadow-md px-3 py-1.5">
                          🥈 2nd
                        </Badge>
                      )}
                      {index === 2 && (
                        <Badge className="bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700 shadow-md px-3 py-1.5">
                          🥉 3rd
                        </Badge>
                      )}
                      {index > 2 && (
                        <span className="text-purple-200 font-semibold ml-2 text-base">#{index + 1}</span>
                      )}
                      <a
                        href={`https://solscan.io/account/${entry.walletAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-300 hover:text-purple-100 underline font-mono text-sm transition-colors"
                        data-testid={`address-${index}`}
                      >
                        {truncateAddress(entry.walletAddress)}
                      </a>
                    </div>
                    <div className="text-right font-bold text-green-400 text-base" data-testid={`amount-${index}`}>
                      {formatSol(entry.totalSolRecovered)} SOL
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-purple-300 bg-purple-900/20 rounded-lg border border-purple-500/20">
                <Trophy className="w-16 h-16 text-purple-400/50 mx-auto mb-3" />
                <div className="text-lg">No data available for this time period</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
