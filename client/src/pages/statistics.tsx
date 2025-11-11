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
        <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
          <CardHeader>
            <div className="flex items-center justify-between mb-2">
              <CardTitle className="flex items-center gap-2 text-white">
                <Trophy className="w-6 h-6 text-yellow-400" />
                Top Addresses Leaderboard
              </CardTitle>
              {/* Filter buttons inside card */}
              <div className="flex gap-2">
                <Button
                  data-testid="leaderboard-filter-24h"
                  size="sm"
                  variant={selectedPeriod === '24h' ? 'default' : 'outline'}
                  onClick={() => setSelectedPeriod('24h')}
                  className={selectedPeriod === '24h' ? 'bg-purple-600 hover:bg-purple-700' : 'border-purple-400 text-white hover:bg-purple-800'}
                >
                  Daily
                </Button>
                <Button
                  data-testid="leaderboard-filter-weekly"
                  size="sm"
                  variant={selectedPeriod === 'weekly' ? 'default' : 'outline'}
                  onClick={() => setSelectedPeriod('weekly')}
                  className={selectedPeriod === 'weekly' ? 'bg-purple-600 hover:bg-purple-700' : 'border-purple-400 text-white hover:bg-purple-800'}
                >
                  Weekly
                </Button>
                <Button
                  data-testid="leaderboard-filter-monthly"
                  size="sm"
                  variant={selectedPeriod === 'monthly' ? 'default' : 'outline'}
                  onClick={() => setSelectedPeriod('monthly')}
                  className={selectedPeriod === 'monthly' ? 'bg-purple-600 hover:bg-purple-700' : 'border-purple-400 text-white hover:bg-purple-800'}
                >
                  Monthly
                </Button>
              </div>
            </div>
            <CardDescription className="text-purple-200">
              Addresses that recovered the most rent {getPeriodLabel(selectedPeriod).toLowerCase()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {leaderboardLoading ? (
              <div className="text-center py-8 text-purple-300">Loading leaderboard...</div>
            ) : leaderboardData && leaderboardData.leaderboard.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow className="border-purple-600 hover:bg-purple-700/30">
                    <TableHead className="text-purple-200 font-semibold w-[80px]">Rank</TableHead>
                    <TableHead className="text-purple-200 font-semibold">Wallet Address</TableHead>
                    <TableHead className="text-purple-200 font-semibold text-right">SOL Recovered</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaderboardData.leaderboard.map((entry, index) => (
                    <TableRow 
                      key={entry.walletAddress} 
                      className="border-purple-600 hover:bg-purple-700/30"
                      data-testid={`leaderboard-row-${index}`}
                    >
                      <TableCell className="font-medium">
                        {index === 0 && (
                          <Badge className="bg-yellow-500 text-black hover:bg-yellow-600">
                            🥇 1st
                          </Badge>
                        )}
                        {index === 1 && (
                          <Badge className="bg-gray-400 text-black hover:bg-gray-500">
                            🥈 2nd
                          </Badge>
                        )}
                        {index === 2 && (
                          <Badge className="bg-orange-600 text-white hover:bg-orange-700">
                            🥉 3rd
                          </Badge>
                        )}
                        {index > 2 && (
                          <span className="text-purple-200 ml-2">#{index + 1}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <a
                          href={`https://solscan.io/account/${entry.walletAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-300 hover:text-purple-100 underline font-mono"
                          data-testid={`address-${index}`}
                        >
                          {truncateAddress(entry.walletAddress)}
                        </a>
                      </TableCell>
                      <TableCell className="text-right font-bold text-green-400" data-testid={`amount-${index}`}>
                        {formatSol(entry.totalSolRecovered)} SOL
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
