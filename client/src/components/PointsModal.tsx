import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Trophy, Star, Award } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

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

interface PointsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PointsModal({ open, onOpenChange }: PointsModalProps) {
  const { publicKey } = useWallet();
  const walletAddress = publicKey?.toBase58();

  const { data: userPoints, isLoading: userLoading } = useQuery<UserPoints>({
    queryKey: ['/api/points', walletAddress],
    queryFn: async () => {
      if (!walletAddress) throw new Error('Wallet address required');
      const response = await fetch(`/api/points/${walletAddress}`);
      if (!response.ok) throw new Error('Failed to fetch user points');
      return response.json();
    },
    enabled: !!walletAddress && open,
  });

  const { data: leaderboard, isLoading: leaderboardLoading } = useQuery<LeaderboardResponse>({
    queryKey: ['/api/points/leaderboard'],
    queryFn: async () => {
      const response = await fetch('/api/points/leaderboard?limit=100');
      if (!response.ok) throw new Error('Failed to fetch leaderboard');
      return response.json();
    },
    enabled: open,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 border-purple-600 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Trophy className="w-6 h-6 text-yellow-400" />
            Points & Leaderboard
          </DialogTitle>
          <p className="text-purple-200 text-sm">Earn 20 points for every account you close</p>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-8rem)] pr-4">
          <div className="space-y-6">
            {/* User Stats */}
            {walletAddress && (
              <div className="bg-purple-800/50 border border-purple-600 rounded-lg p-4 backdrop-blur">
                <div className="flex items-center gap-2 mb-3">
                  <Star className="w-5 h-5 text-yellow-400" />
                  <h3 className="text-lg font-semibold">Your Points</h3>
                </div>
                {userLoading ? (
                  <div className="text-center py-4 text-purple-300">Loading your points...</div>
                ) : (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-xs text-purple-300 mb-1">Total Points</div>
                      <div className="text-3xl font-bold text-yellow-400" data-testid="text-user-points">
                        {userPoints?.points || 0}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-purple-300 mb-1">Accounts Closed</div>
                      <div className="text-3xl font-bold text-white" data-testid="text-user-accounts">
                        {userPoints?.accountsClosed || 0}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-purple-300 mb-1">Your Rank</div>
                      <div className="text-3xl font-bold text-purple-300" data-testid="text-user-rank">
                        {getUserRank() ? `#${getUserRank()}` : '-'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Leaderboard */}
            <div className="bg-purple-800/50 border border-purple-600 rounded-lg p-4 backdrop-blur">
              <div className="flex items-center gap-2 mb-3">
                <Award className="w-5 h-5 text-purple-300" />
                <h3 className="text-lg font-semibold">Top Performers</h3>
              </div>
              <p className="text-purple-200 text-sm mb-4">All-time leaderboard</p>

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
                        <TableHead className="text-purple-200 text-right">Accounts</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leaderboard.leaderboard.slice(0, 20).map((entry) => (
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
            </div>

            <div className="text-center text-purple-200 text-xs">
              <p>💡 Earn points by closing empty token accounts, burning tokens, or burning NFTs</p>
              <p className="mt-1">Each account closed = 20 points</p>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
