import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
    return `${address.slice(0, 6)}.${address.slice(-3)}`;
  };

  const getUserRank = () => {
    if (!walletAddress || !leaderboard?.leaderboard) return null;
    const entry = leaderboard.leaderboard.find(e => e.walletAddress === walletAddress);
    return entry?.rank || null;
  };

  const getRankDisplay = (rank: number) => {
    if (rank === 1) return <span className="text-xl">🥇</span>;
    if (rank === 2) return <span className="text-xl">🥈</span>;
    if (rank === 3) return <span className="text-xl">🥉</span>;
    return <span className="text-gray-300 font-medium">{rank}</span>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-4xl max-h-[85vh] border-purple-600/30 text-white p-0 overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #1a1035 0%, #2d1f5e 50%, #1a1035 100%)'
        }}
      >
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-xl font-bold text-white">
            Points & Leaderboard
          </DialogTitle>
          <p className="text-purple-300 text-sm">Earn 20 points for every account you close</p>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-6rem)]">
          <div className="p-6 pt-4 space-y-6">
            
            {/* YOUR STATS Section */}
            {walletAddress && (
              <div>
                <h2 className="text-white font-bold text-sm tracking-wide mb-3">YOUR STATS</h2>
                <div 
                  className="rounded-lg p-4"
                  style={{
                    background: 'linear-gradient(135deg, rgba(88, 60, 140, 0.4) 0%, rgba(45, 31, 94, 0.6) 100%)',
                    border: '1px solid rgba(139, 92, 246, 0.3)'
                  }}
                >
                  {userLoading ? (
                    <div className="text-center py-4 text-purple-300">Loading your stats...</div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <div className="text-[10px] text-purple-300 uppercase tracking-wider mb-1">Rank</div>
                        <div className="text-base font-semibold text-white" data-testid="text-user-rank">
                          {getUserRank() ? `#${getUserRank()}` : '-'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-purple-300 uppercase tracking-wider mb-1">Total Points</div>
                        <div className="text-base font-semibold text-white" data-testid="text-user-points">
                          {(userPoints?.points || 0).toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-purple-300 uppercase tracking-wider mb-1">7-Days Points</div>
                        <div className="text-base font-semibold text-white">0</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-purple-300 uppercase tracking-wider mb-1">Accounts Closed</div>
                        <div className="text-base font-semibold text-white" data-testid="text-user-accounts">
                          {(userPoints?.accountsClosed || 0).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Not connected message */}
            {!walletAddress && (
              <div>
                <h2 className="text-white font-bold text-sm tracking-wide mb-3">YOUR STATS</h2>
                <div 
                  className="rounded-lg p-4 text-center"
                  style={{
                    background: 'linear-gradient(135deg, rgba(88, 60, 140, 0.4) 0%, rgba(45, 31, 94, 0.6) 100%)',
                    border: '1px solid rgba(139, 92, 246, 0.3)'
                  }}
                >
                  <p className="text-purple-300 text-sm">Connect your wallet to view your stats</p>
                </div>
              </div>
            )}

            {/* Weekly Leaderboard */}
            <div>
              <h2 className="text-white font-bold text-sm tracking-wide mb-3">Weekly Leaderboard</h2>
              
              {leaderboardLoading ? (
                <div className="text-center py-6 text-purple-300">Loading leaderboard...</div>
              ) : leaderboard?.leaderboard && leaderboard.leaderboard.length > 0 ? (
                <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr 
                        style={{ 
                          background: 'linear-gradient(90deg, rgba(88, 60, 140, 0.8) 0%, rgba(60, 40, 100, 0.8) 100%)'
                        }}
                      >
                        <th className="text-left py-3 px-4 text-[10px] text-purple-200 uppercase tracking-wider font-medium">Ranking</th>
                        <th className="text-left py-3 px-4 text-[10px] text-purple-200 uppercase tracking-wider font-medium">Wallet</th>
                        <th className="text-left py-3 px-4 text-[10px] text-purple-200 uppercase tracking-wider font-medium">Total Points</th>
                        <th className="text-left py-3 px-4 text-[10px] text-purple-200 uppercase tracking-wider font-medium">7-Days Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.leaderboard.slice(0, 20).map((entry, index) => (
                        <tr 
                          key={entry.walletAddress}
                          className={`border-b border-purple-800/30 transition-colors ${
                            entry.walletAddress === walletAddress 
                              ? 'bg-purple-700/40' 
                              : index % 2 === 0 
                                ? 'bg-purple-900/20' 
                                : 'bg-transparent'
                          } hover:bg-purple-700/30`}
                          data-testid={`row-leaderboard-${entry.rank}`}
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              {getRankDisplay(entry.rank)}
                              {entry.walletAddress === walletAddress && (
                                <span className="text-[10px] bg-green-600 px-1.5 py-0.5 rounded text-white">You</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono text-purple-100">
                            {truncateAddress(entry.walletAddress)}
                          </td>
                          <td className="py-3 px-4 text-purple-100">
                            {entry.points.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-purple-100">
                            0
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div 
                  className="rounded-lg p-6 text-center"
                  style={{
                    background: 'linear-gradient(135deg, rgba(88, 60, 140, 0.4) 0%, rgba(45, 31, 94, 0.6) 100%)',
                    border: '1px solid rgba(139, 92, 246, 0.3)'
                  }}
                >
                  <p className="text-purple-300 text-sm">No leaderboard data available yet. Be the first to earn points!</p>
                </div>
              )}
            </div>

            {/* Points Info */}
            <div className="text-center text-purple-300 text-xs">
              <p>Earn points by closing empty token accounts, burning tokens, or burning NFTs</p>
              <p className="mt-1 text-purple-400">Each account closed = 20 points</p>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
