import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";

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

  const { data: leaderboard, isLoading: leaderboardLoading } = useQuery<LeaderboardResponse>({
    queryKey: ['/api/points/leaderboard'],
    queryFn: async () => {
      const response = await fetch('/api/points/leaderboard?limit=100');
      if (!response.ok) throw new Error('Failed to fetch leaderboard');
      return response.json();
    }
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
    if (rank === 1) return <span className="text-2xl">🥇</span>;
    if (rank === 2) return <span className="text-2xl">🥈</span>;
    if (rank === 3) return <span className="text-2xl">🥉</span>;
    return <span className="text-gray-300 font-medium">{rank}</span>;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a1035] via-[#2d1f5e] to-[#1a1035] text-white">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        
        {/* YOUR STATS Section */}
        {walletAddress && (
          <div className="mb-10">
            <h2 className="text-white font-bold text-lg tracking-wide mb-4">YOUR STATS</h2>
            <div 
              className="rounded-lg p-6"
              style={{
                background: 'linear-gradient(135deg, rgba(88, 60, 140, 0.4) 0%, rgba(45, 31, 94, 0.6) 100%)',
                border: '1px solid rgba(139, 92, 246, 0.3)'
              }}
            >
              {userLoading ? (
                <div className="text-center py-4 text-purple-300">Loading your stats...</div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div>
                    <div className="text-xs text-purple-300 uppercase tracking-wider mb-2">Account Address</div>
                    <div className="text-xl font-semibold text-white" data-testid="text-user-address">
                      {truncateAddress(walletAddress)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-purple-300 uppercase tracking-wider mb-2">Total Points</div>
                    <div className="text-xl font-semibold text-white" data-testid="text-user-points">
                      {(userPoints?.points || 0).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-purple-300 uppercase tracking-wider mb-2">7-Days Points</div>
                    <div className="text-xl font-semibold text-white" data-testid="text-user-7day-points">
                      0
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-purple-300 uppercase tracking-wider mb-2">Accounts Closed</div>
                    <div className="text-xl font-semibold text-white" data-testid="text-user-accounts">
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
          <div className="mb-10">
            <h2 className="text-white font-bold text-lg tracking-wide mb-4">YOUR STATS</h2>
            <div 
              className="rounded-lg p-6 text-center"
              style={{
                background: 'linear-gradient(135deg, rgba(88, 60, 140, 0.4) 0%, rgba(45, 31, 94, 0.6) 100%)',
                border: '1px solid rgba(139, 92, 246, 0.3)'
              }}
            >
              <p className="text-purple-300">Connect your wallet to view your stats</p>
            </div>
          </div>
        )}

        {/* Weekly Leaderboard Section */}
        <div>
          <h2 className="text-white font-bold text-lg tracking-wide mb-4">Weekly Leaderboard</h2>
          
          {leaderboardLoading ? (
            <div className="text-center py-8 text-purple-300">Loading leaderboard...</div>
          ) : leaderboard?.leaderboard && leaderboard.leaderboard.length > 0 ? (
            <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid rgba(139, 92, 246, 0.2)' }}>
              <table className="w-full">
                <thead>
                  <tr 
                    style={{ 
                      background: 'linear-gradient(90deg, rgba(88, 60, 140, 0.8) 0%, rgba(60, 40, 100, 0.8) 100%)'
                    }}
                  >
                    <th className="text-left py-4 px-6 text-xs text-purple-200 uppercase tracking-wider font-medium">Ranking</th>
                    <th className="text-left py-4 px-6 text-xs text-purple-200 uppercase tracking-wider font-medium">Wallet</th>
                    <th className="text-left py-4 px-6 text-xs text-purple-200 uppercase tracking-wider font-medium">Total Points</th>
                    <th className="text-left py-4 px-6 text-xs text-purple-200 uppercase tracking-wider font-medium">7-Days Points</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.leaderboard.map((entry, index) => (
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
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          {getRankDisplay(entry.rank)}
                          {entry.walletAddress === walletAddress && (
                            <span className="text-xs bg-green-600 px-2 py-0.5 rounded text-white">You</span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6 font-mono text-purple-100" data-testid={`text-wallet-${entry.rank}`}>
                        {truncateAddress(entry.walletAddress)}
                      </td>
                      <td className="py-4 px-6 text-purple-100" data-testid={`text-points-${entry.rank}`}>
                        {entry.points.toLocaleString()}
                      </td>
                      <td className="py-4 px-6 text-purple-100" data-testid={`text-7day-${entry.rank}`}>
                        0
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div 
              className="rounded-lg p-8 text-center"
              style={{
                background: 'linear-gradient(135deg, rgba(88, 60, 140, 0.4) 0%, rgba(45, 31, 94, 0.6) 100%)',
                border: '1px solid rgba(139, 92, 246, 0.3)'
              }}
            >
              <p className="text-purple-300">No leaderboard data available yet. Be the first to earn points!</p>
            </div>
          )}
        </div>

        {/* Points Info */}
        <div className="mt-8 text-center text-purple-300 text-sm">
          <p>Earn points by closing empty token accounts, burning tokens, or burning NFTs</p>
          <p className="mt-1 text-purple-400">Each account closed = 20 points</p>
        </div>
      </div>
    </div>
  );
}
