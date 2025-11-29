import { useWallet } from '@solana/wallet-adapter-react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { ArrowLeft, Copy, Wallet, Trophy, Flame, Coins } from 'lucide-react';
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

export default function ProfilePage() {
  const { publicKey } = useWallet();
  const { toast } = useToast();

  const { data: stats, isLoading } = useQuery<UserStats>({
    queryKey: ['/api/user/stats', publicKey?.toString()],
    queryFn: async () => {
      const response = await fetch(`/api/user/stats/${publicKey?.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    },
    enabled: !!publicKey,
  });

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
                <Coins className="h-8 w-8 text-yellow-400" />
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

            <div className="bg-slate-800/80 border border-purple-500/30 rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-300 text-sm">Total Points</p>
                  <p className="text-2xl font-bold text-white" data-testid="text-total-points">
                    {isLoading ? '...' : (stats?.totalPoints || 0)}
                  </p>
                </div>
                <Trophy className="h-8 w-8 text-purple-400" />
              </div>
            </div>
          </div>

          {stats?.referralCode && (
            <div className="bg-gradient-to-br from-green-900/50 to-slate-800/80 border border-green-500/30 rounded-xl p-6">
              <h3 className="text-white font-semibold text-lg flex items-center gap-2 mb-4">
                <Trophy className="h-5 w-5 text-green-400" />
                Referral Program
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-green-300 text-sm mb-1">Your Referral Code</p>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-mono text-lg bg-slate-900/50 px-3 py-1 rounded" data-testid="text-referral-code">
                      {stats.referralCode}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(stats.referralCode);
                        toast({
                          title: 'Copied!',
                          description: 'Referral code copied to clipboard',
                        });
                      }}
                      className="text-green-400 hover:text-white p-1"
                      data-testid="button-copy-referral"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="text-green-300 text-sm mb-1">Referral Earnings</p>
                  <p className="text-2xl font-bold text-white" data-testid="text-referral-earnings">
                    {parseFloat(String(stats.referralEarnings || 0)).toFixed(4)} SOL
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
