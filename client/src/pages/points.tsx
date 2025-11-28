import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Star, Award, TrendingUp } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface UserPoints {
  success: boolean;
  points: number;
  accountsClosed: number;
  walletAddress: string;
  lastUpdated?: string;
}

interface LeaderboardEntry {
  rank: number;
  walletAddress: string;
  points: number;
  accountsClosed: number;
  lastUpdated: string;
}

interface LeaderboardResponse {
  success: boolean;
  leaderboard: LeaderboardEntry[];
  total: number;
}

export default function Points() {
  const { publicKey } = useWallet();
  const walletAddress = publicKey?.toBase58();

  // Fetch user's points
  const { data: userPoints, isLoading: userLoading } = useQuery<UserPoints>({
    queryKey: ['/api/points', walletAddress],
    queryFn: async () => {
      if (!walletAddress) throw new Error('Wallet address required');
      const response = await fetch(`/api/points/${walletAddress}`);
      if (!response.ok) throw new Error('Failed to fetch user points');
      return response.json();
    },
    enabled: !!walletAddress,
  });

  // Fetch leaderboard
  const { data: leaderboard, isLoading: leaderboardLoading } = useQuery<LeaderboardResponse>({
    queryKey: ['/api/points/leaderboard'],
    queryFn: async () => {
      const response = await fetch('/api/points/leaderboard?limit=100');
      if (!response.ok) throw new Error('Failed to fetch leaderboard');
      return response.json();
    }
  });

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const getRankBadgeColor = (rank: number) => {
    if (rank === 1) return "bg-yellow-500 text-black";
    if (rank === 2) return "bg-gray-300 text-black";
    if (rank === 3) return "bg-orange-600 text-white";
    return "bg-purple-600 text-white";
  };

  const getUserRank = () => {
    if (!walletAddress || !leaderboard?.leaderboard) return null;
    const entry = leaderboard.leaderboard.find(e => e.walletAddress === walletAddress);
    return entry?.rank || null;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 text-white">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2 flex items-center justify-center gap-2">
            <Trophy className="w-8 h-8 text-yellow-400" />
            Points & Leaderboard
          </h1>
          <p className="text-purple-200">Earn 20 points for every account you close</p>
        </div>

        {/* User Stats Card */}
        {walletAddress && (
          <div className="mb-8">
            <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Star className="w-5 h-5 text-yellow-400" />
                  Your Points
                </CardTitle>
                <CardDescription className="text-purple-200">
                  Your current ranking and statistics
                </CardDescription>
              </CardHeader>
              <CardContent>
                {userLoading ? (
                  <div className="text-center py-4 text-purple-300">Loading your points...</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="text-center">
                      <div className="text-sm text-purple-300 mb-1">Total Points</div>
                      <div className="text-4xl font-bold text-yellow-400" data-testid="text-user-points">
                        {userPoints?.points || 0}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm text-purple-300 mb-1">Accounts Closed</div>
                      <div className="text-4xl font-bold text-white" data-testid="text-user-accounts">
                        {userPoints?.accountsClosed || 0}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm text-purple-300 mb-1">Your Rank</div>
                      <div className="text-4xl font-bold text-purple-300" data-testid="text-user-rank">
                        {getUserRank() ? `#${getUserRank()}` : '-'}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Leaderboard */}
        <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Award className="w-5 h-5 text-purple-300" />
              Top Performers
            </CardTitle>
            <CardDescription className="text-purple-200">
              All-time leaderboard of users with the most points
            </CardDescription>
          </CardHeader>
          <CardContent>
            {leaderboardLoading ? (
              <div className="text-center py-8 text-purple-300">Loading leaderboard...</div>
            ) : leaderboard?.leaderboard && leaderboard.leaderboard.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-purple-600 hover:bg-purple-700/50">
                      <TableHead className="text-purple-200">Rank</TableHead>
                      <TableHead className="text-purple-200">Wallet</TableHead>
                      <TableHead className="text-purple-200 text-right">Points</TableHead>
                      <TableHead className="text-purple-200 text-right">Accounts Closed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaderboard.leaderboard.map((entry) => (
                      <TableRow 
                        key={entry.walletAddress}
                        className={`border-purple-600 hover:bg-purple-700/50 ${
                          entry.walletAddress === walletAddress ? 'bg-purple-700/70' : ''
                        }`}
                        data-testid={`row-leaderboard-${entry.rank}`}
                      >
                        <TableCell>
                          <Badge className={getRankBadgeColor(entry.rank)}>
                            #{entry.rank}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-purple-100">
                          {truncateAddress(entry.walletAddress)}
                          {entry.walletAddress === walletAddress && (
                            <Badge className="ml-2 bg-green-600 text-white">You</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-bold text-yellow-400" data-testid={`text-points-${entry.rank}`}>
                          {entry.points.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-purple-100" data-testid={`text-accounts-${entry.rank}`}>
                          {entry.accountsClosed.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-purple-300">
                No leaderboard data available yet. Be the first to earn points!
              </div>
            )}
          </CardContent>
        </Card>

        {/* Points Info */}
        <div className="mt-8 text-center text-purple-200 text-sm">
          <p>💡 Earn points by closing empty token accounts, burning tokens, or burning NFTs</p>
          <p className="mt-2">Each account closed = 20 points</p>
        </div>
      </div>
    </div>
  );
}
