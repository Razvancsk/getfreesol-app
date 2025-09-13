import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
  Wallet, 
  ArrowLeftRight, 
  Flame, 
  Users, 
  Settings,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Copy,
  ExternalLink,
  DollarSign,
  TrendingUp,
  Gift
} from 'lucide-react';

interface TokenAccount {
  address: string;
  mint: string;
  balance: number;
  decimals: number;
  symbol?: string;
  name?: string;
  logo?: string;
}

interface ScanResult {
  message: string;
  success: boolean;
  accountsData?: TokenAccount[];
  totalSolToReclaim?: number;
}

export default function ClaimSolPage() {
  const { connected: isConnected, publicKey, connect, disconnect } = useWallet();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const donationPercentage = 0; // Fees temporarily disabled - users get 100% back
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'referrals' | 'reclaim' | 'burnTokens'>('reclaim');
  const [selectedTokenMint, setSelectedTokenMint] = useState<string>('So11111111111111111111111111111111111111112'); // Default to SOL
  const [tokenList, setTokenList] = useState<any[]>([]);
  const [referralCode, setReferralCode] = useState<string>('');
  const [userReferralCode, setUserReferralCode] = useState<string | null>(null);
  
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const [currentTime, setCurrentTime] = useState(new Date());

  // Add real-time clock
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Load more transactions when user scrolls
  const [hasMoreTransactions, setHasMoreTransactions] = useState(true);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000) {
        if (hasMoreTransactions && !isLoadingTransactions) {
          // Could trigger loading more transactions here
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [hasMoreTransactions, isLoadingTransactions]);

  // Clean up selected tokens when switching tabs or when token list changes
  useEffect(() => {
    if (activeTab !== 'burnTokens') {
      setSelectedTokens(new Set());
    }
  }, [activeTab]);

  // Clean up stale selections when token list changes
  useEffect(() => {
    setSelectedTokens(prev => {
      const validTokens = new Set();
      prev.forEach(tokenId => {
        if (tokenList.some(token => token.id === tokenId)) {
          validTokens.add(tokenId);
        }
      });
      return validTokens;
    });
  }, [tokenList]);

  // Clear scan results when wallet disconnects
  useEffect(() => {
    if (!isConnected || !publicKey) {
      setScanResult(null);
    }
  }, [isConnected, publicKey]);

  // Wallet connection functions using wallet adapter
  const handleConnectWallet = async () => {
    try {
      await connect();
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    }
  };

  const disconnectWallet = async () => {
    try {
      await disconnect();
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  };

  // Scan wallet for empty token accounts
  const scanMutation = useMutation({
    mutationFn: async (address: string) => {
      const response = await fetch(`/api/sol-refund/scan/${address}`);
      if (!response.ok) {
        throw new Error('Failed to scan wallet');
      }
      return response.json();
    },
    onSuccess: (data: ScanResult) => {
      setScanResult(data);
      // Removed scan completion notification per user request
    },
    onError: (error: any) => {
      toast({
        title: "Scan Failed",
        description: error.message || "Failed to scan wallet for empty accounts",
        variant: "destructive",
      });
    },
  });

  // Scan tokens for burning
  const scanTokensMutation = useMutation({
    mutationFn: async (address: string) => {
      const response = await fetch(`/api/tokens/scan/${address}`);
      if (!response.ok) {
        throw new Error('Failed to scan tokens');
      }
      return response.json();
    },
    onSuccess: (data: any[]) => {
      setTokenList(data);
      // Removed scan completion notification per user request
    },
    onError: (error: any) => {
      toast({
        title: "Token Scan Failed",
        description: error.message || "Failed to scan tokens",
        variant: "destructive",
      });
    },
  });

  // Claim SOL from empty token accounts
  const claimMutation = useMutation({
    mutationFn: async (accounts: TokenAccount[]) => {
      const response = await fetch('/api/sol-refund/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts, walletAddress: publicKey?.toString() }),
      });
      if (!response.ok) {
        throw new Error('Failed to claim SOL');
      }
      return response.json();
    },
    onSuccess: (data) => {
      setScanResult(null); // Clear scan results after successful claim
      toast({
        title: "Claim Successful!",
        description: `Successfully claimed ${data.totalClaimed} SOL from ${data.accountsClaimed} accounts`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Claim Failed",
        description: error.message || "Failed to claim SOL",
        variant: "destructive",
      });
    },
  });

  // Burn tokens mutation
  const burnTokensMutation = useMutation({
    mutationFn: async (tokenIds: string[]) => {
      const response = await fetch('/api/tokens/burn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenIds, walletAddress: publicKey?.toString() }),
      });
      if (!response.ok) {
        throw new Error('Failed to burn tokens');
      }
      return response.json();
    },
    onSuccess: (data) => {
      setSelectedTokens(new Set()); // Clear selections
      toast({
        title: "Burn Successful!",
        description: `Successfully burned ${data.tokensBurned} tokens and recovered ${data.solRecovered} SOL`,
      });
      // Refresh token list
      if (publicKey) {
        scanTokensMutation.mutate(publicKey.toString());
      }
    },
    onError: (error: any) => {
      toast({
        title: "Burn Failed",
        description: error.message || "Failed to burn tokens",
        variant: "destructive",
      });
    },
  });

  // Bulk burn selected tokens
  const bulkBurnTokensMutation = useMutation({
    mutationFn: async (tokenIds: string[]) => {
      const response = await fetch('/api/tokens/bulk-burn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenIds, walletAddress: publicKey?.toString() }),
      });
      if (!response.ok) {
        throw new Error('Failed to burn tokens');
      }
      return response.json();
    },
    onSuccess: (data) => {
      setSelectedTokens(new Set()); // Clear selections
      toast({
        title: "Bulk Burn Successful!",
        description: `Successfully burned ${data.tokensBurned} tokens and recovered ${data.solRecovered} SOL`,
      });
      // Refresh token list
      if (publicKey) {
        scanTokensMutation.mutate(publicKey.toString());
      }
    },
    onError: (error: any) => {
      toast({
        title: "Bulk Burn Failed",
        description: error.message || "Failed to burn tokens",
        variant: "destructive",
      });
    },
  });

  // Generate referral code mutation
  const generateReferralMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/referrals/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: publicKey?.toString() }),
      });
      if (!response.ok) {
        throw new Error('Failed to generate referral code');
      }
      return response.json();
    },
    onSuccess: (data) => {
      setUserReferralCode(data.referralCode);
      toast({
        title: "Referral Code Generated!",
        description: "Your unique referral code has been created",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate referral code",
        variant: "destructive",
      });
    },
  });

  // Submit referral code mutation
  const submitReferralMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await fetch('/api/referrals/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          referralCode: code, 
          walletAddress: publicKey?.toString() 
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to submit referral code');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Referral Submitted!",
        description: `You'll earn ${data.bonusPercentage}% bonus on your next claim`,
      });
      setReferralCode('');
    },
    onError: (error: any) => {
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit referral code",
        variant: "destructive",
      });
    },
  });

  // Fetch user's referral stats
  const { data: referralStats } = useQuery({
    queryKey: ['referralStats', publicKey?.toString()],
    queryFn: async () => {
      if (!publicKey) return null;
      const response = await fetch(`/api/referrals/stats/${publicKey.toString()}`);
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!publicKey,
  });

  const handleScan = () => {
    if (!publicKey) return;
    
    if (activeTab === 'reclaim') {
      scanMutation.mutate(publicKey.toString());
    } else if (activeTab === 'burnTokens') {
      scanTokensMutation.mutate(publicKey.toString());
    }
  };

  const handleClaim = () => {
    if (!scanResult?.accountsData) return;
    claimMutation.mutate(scanResult.accountsData);
  };

  const handleTokenSelection = (tokenId: string, checked: boolean) => {
    setSelectedTokens(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(tokenId);
      } else {
        newSet.delete(tokenId);
      }
      return newSet;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedTokens(new Set(tokenList.map(token => token.id)));
    } else {
      setSelectedTokens(new Set());
    }
  };

  const handleCopyReferralCode = () => {
    if (userReferralCode) {
      navigator.clipboard.writeText(userReferralCode);
      toast({
        title: "Copied!",
        description: "Referral code copied to clipboard",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-blue-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
            Get Your SOL Back!
          </h1>
          <p className="text-purple-200 text-lg md:text-xl max-w-2xl mx-auto">
            Reclaim SOL from empty token accounts and burn worthless tokens to recover rent deposits
          </p>
        </div>

        {/* Wallet Connection */}
        <div className="max-w-4xl mx-auto">
          {!isConnected ? (
            <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-8 text-center">
              <Wallet className="h-16 w-16 text-purple-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-4">Connect Your Wallet</h2>
              <p className="text-purple-200 mb-6">
                Connect your Solana wallet to start reclaiming your SOL
              </p>
              <Button
                onClick={handleConnectWallet}
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-8 py-3 text-lg font-semibold rounded-lg transition-all duration-200 shadow-lg"
                data-testid="button-connect-wallet"
              >
                <Wallet className="h-5 w-5 mr-2" />
                Connect Wallet
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Connected Wallet Info */}
              <div className="bg-gradient-to-br from-green-800/20 to-green-900/30 backdrop-blur-sm rounded-xl border border-green-500/20 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <CheckCircle2 className="h-6 w-6 text-green-400" />
                    <div>
                      <p className="text-green-300 font-medium">Wallet Connected</p>
                      <p className="text-green-200 text-sm font-mono">
                        {publicKey?.toString().slice(0, 8)}...{publicKey?.toString().slice(-8)}
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={disconnectWallet}
                    variant="outline"
                    className="border-green-500/30 text-green-300 hover:bg-green-600/20"
                    data-testid="button-disconnect-wallet"
                  >
                    Disconnect
                  </Button>
                </div>
              </div>

              {/* Tab Navigation */}
              <div className="flex items-center justify-center">
                <div className="flex items-center space-x-2 bg-black/20 backdrop-blur-sm border border-purple-500/30 rounded-lg p-1">
                  <Button
                    onClick={() => setActiveTab('reclaim')}
                    className={`px-4 py-2 text-sm font-medium rounded transition-all ${
                      activeTab === 'reclaim' 
                        ? 'bg-purple-600 text-white' 
                        : 'bg-transparent text-purple-300 hover:bg-purple-600/20'
                    }`}
                    data-testid="button-reclaim-sol"
                  >
                    <ArrowLeftRight className="h-4 w-4 mr-2" />
                    Reclaim SOL
                  </Button>
                  <Button
                    onClick={() => setActiveTab('burnTokens')}
                    className={`px-4 py-2 text-sm font-medium rounded transition-all ${
                      activeTab === 'burnTokens' 
                        ? 'bg-purple-600 text-white' 
                        : 'bg-transparent text-purple-300 hover:bg-purple-600/20'
                    }`}
                    data-testid="button-burn-tokens"
                  >
                    <Flame className="h-4 w-4 mr-2" />
                    Burn Tokens
                  </Button>
                  <Button
                    onClick={() => setActiveTab('referrals')}
                    className={`px-4 py-2 text-sm font-medium rounded transition-all ${
                      activeTab === 'referrals' 
                        ? 'bg-purple-600 text-white' 
                        : 'bg-transparent text-purple-300 hover:bg-purple-600/20'
                    }`}
                    data-testid="button-referrals"
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Referrals
                  </Button>
                </div>
              </div>

              {/* Reclaim SOL Tab Content */}
              {activeTab === 'reclaim' && (
                <div className="space-y-6">
                  {/* Scan Section */}
                  <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
                    <div className="text-center space-y-4">
                      <ArrowLeftRight className="h-12 w-12 text-purple-400 mx-auto" />
                      <h3 className="text-xl font-semibold text-white">Scan for Empty Token Accounts</h3>
                      <p className="text-purple-200">
                        Find empty token accounts in your wallet and reclaim the rent deposits
                      </p>
                      <Button
                        onClick={handleScan}
                        disabled={scanMutation.isPending}
                        className="bg-gradient-to-br from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white px-8 py-3 text-lg font-semibold rounded-lg transition-all duration-200 shadow-lg"
                        data-testid="button-scan-wallet"
                      >
                        {scanMutation.isPending ? (
                          <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                        ) : (
                          <ArrowLeftRight className="h-5 w-5 mr-2" />
                        )}
                        {scanMutation.isPending ? 'Scanning...' : 'Scan Wallet'}
                      </Button>
                    </div>
                  </div>

                  {/* Scan Results */}
                  {scanResult && (
                    <div className="bg-gradient-to-br from-blue-800/20 to-blue-900/30 backdrop-blur-sm rounded-xl border border-blue-500/20 p-6">
                      <h3 className="text-lg font-semibold text-white mb-4">Scan Results</h3>
                      
                      {scanResult.success && scanResult.accountsData && scanResult.accountsData.length > 0 ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <p className="text-blue-200">
                              Found {scanResult.accountsData.length} empty token accounts
                            </p>
                            <p className="text-xl font-bold text-white">
                              {scanResult.totalSolToReclaim?.toFixed(6)} SOL to reclaim
                            </p>
                          </div>
                          
                          <div className="space-y-2 max-h-40 overflow-y-auto">
                            {scanResult.accountsData.map((account, index) => (
                              <div 
                                key={index} 
                                className="bg-blue-800/30 rounded-lg p-3 flex items-center justify-between"
                                data-testid={`account-${index}`}
                              >
                                <div>
                                  <p className="text-white font-mono text-sm">
                                    {account.address.slice(0, 8)}...{account.address.slice(-8)}
                                  </p>
                                  <p className="text-blue-300 text-xs">{account.symbol || 'Unknown Token'}</p>
                                </div>
                                <p className="text-blue-200 text-sm">
                                  ~0.002 SOL
                                </p>
                              </div>
                            ))}
                          </div>

                          <Button
                            onClick={handleClaim}
                            disabled={claimMutation.isPending}
                            className="w-full bg-gradient-to-br from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white py-3 text-lg font-semibold rounded-lg transition-all duration-200 shadow-lg"
                            data-testid="button-claim-sol"
                          >
                            {claimMutation.isPending ? (
                              <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-5 w-5 mr-2" />
                            )}
                            {claimMutation.isPending ? 'Claiming...' : `Claim ${scanResult.totalSolToReclaim?.toFixed(6)} SOL`}
                          </Button>
                        </div>
                      ) : (
                        <div className="text-center text-blue-300">
                          <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-4" />
                          <p>No empty token accounts found. Your wallet is optimized!</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Burn Tokens Tab Content */}
              {activeTab === 'burnTokens' && (
                <div className="space-y-6">
                  {/* Scan Section */}
                  <div className="bg-gradient-to-br from-orange-800/20 to-orange-900/30 backdrop-blur-sm rounded-xl border border-orange-500/20 p-6">
                    <div className="text-center space-y-4">
                      <Flame className="h-12 w-12 text-orange-400 mx-auto" />
                      <h3 className="text-xl font-semibold text-white">Scan for Tokens to Burn</h3>
                      <p className="text-orange-200">
                        Find worthless tokens in your wallet and burn them to recover rent deposits
                      </p>
                      <Button
                        onClick={handleScan}
                        disabled={scanTokensMutation.isPending}
                        className="bg-gradient-to-br from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white px-8 py-3 text-lg font-semibold rounded-lg transition-all duration-200 shadow-lg"
                        data-testid="button-scan-tokens"
                      >
                        {scanTokensMutation.isPending ? (
                          <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                        ) : (
                          <Flame className="h-5 w-5 mr-2" />
                        )}
                        {scanTokensMutation.isPending ? 'Scanning...' : 'Scan for Tokens'}
                      </Button>
                    </div>
                  </div>

                  {/* Token List */}
                  {tokenList.length > 0 && (
                    <div className="bg-gradient-to-br from-red-800/20 to-red-900/30 backdrop-blur-sm rounded-xl border border-red-500/20 p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-white">Tokens Available for Burning</h3>
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="selectAll"
                            checked={selectedTokens.size === tokenList.length && tokenList.length > 0}
                            onChange={(e) => handleSelectAll(e.target.checked)}
                            className="rounded border-red-500/30"
                            data-testid="checkbox-select-all"
                          />
                          <label htmlFor="selectAll" className="text-red-200 text-sm">
                            Select All ({tokenList.length})
                          </label>
                        </div>
                      </div>
                      
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {tokenList.map((token, index) => (
                          <div 
                            key={token.id || index} 
                            className="bg-red-800/30 rounded-lg p-3 flex items-center justify-between"
                            data-testid={`token-${index}`}
                          >
                            <div className="flex items-center space-x-3">
                              <input
                                type="checkbox"
                                checked={selectedTokens.has(token.id)}
                                onChange={(e) => handleTokenSelection(token.id, e.target.checked)}
                                className="rounded border-red-500/30"
                                data-testid={`checkbox-token-${index}`}
                              />
                              <div>
                                <p className="text-white font-medium">{token.symbol || 'Unknown Token'}</p>
                                <p className="text-red-300 text-sm font-mono">
                                  {token.mint.slice(0, 8)}...{token.mint.slice(-8)}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-red-200">{token.balance.toLocaleString()}</p>
                              <p className="text-red-300 text-xs">~0.002 SOL recoverable</p>
                            </div>
                          </div>
                        ))}
                      </div>

              {/* Burn Button at Bottom */}
              {selectedTokens.size > 0 && (
                <div className="mt-6">
                  <Button
                    onClick={() => bulkBurnTokensMutation.mutate(Array.from(selectedTokens))}
                    disabled={selectedTokens.size === 0 || bulkBurnTokensMutation.isPending}
                    className="w-full bg-gradient-to-br from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white py-4 text-lg font-semibold rounded-lg transition-all duration-200 shadow-lg"
                  >
                    {bulkBurnTokensMutation.isPending ? (
                      <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                    ) : (
                      <Flame className="h-5 w-5 mr-2" />
                    )}
                    BURN
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Empty State Messages */}
          {activeTab === 'burnTokens' && tokenList.length === 0 && (
            <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
              <div className="text-center space-y-4">
                <Flame className="h-12 w-12 text-purple-400 mx-auto" />
                <h3 className="text-lg font-semibold text-white">No Tokens Found</h3>
                <p className="text-purple-200">Scan your wallet to find tokens available for burning.</p>
              </div>
            </div>
          )}

          {/* Referrals Tab Content */}
          {activeTab === 'referrals' && (
            <div className="space-y-8">
              {/* How It Works */}
              <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    How It Works
                  </h3>
                </div>
                <div className="space-y-4">
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="text-center space-y-2">
                      <div className="w-12 h-12 bg-blue-500/20 border border-blue-500/30 rounded-full flex items-center justify-center mx-auto">
                        <Wallet className="w-6 h-6 text-blue-400" />
                      </div>
                      <h3 className="font-semibold text-white">Connect Wallet</h3>
                      <p className="text-sm text-purple-200">
                        Connect your wallet to automatically generate your referral link
                      </p>
                    </div>
                    <div className="text-center space-y-2">
                      <div className="w-12 h-12 bg-green-500/20 border border-green-500/30 rounded-full flex items-center justify-center mx-auto">
                        <Users className="w-6 h-6 text-green-400" />
                      </div>
                      <h3 className="font-semibold text-white">Share & Earn</h3>
                      <p className="text-sm text-purple-200">
                        Share your link and earn 10% of what your referrals claim
                      </p>
                    </div>
                    <div className="text-center space-y-2">
                      <div className="w-12 h-12 bg-purple-500/20 border border-purple-500/30 rounded-full flex items-center justify-center mx-auto">
                        <DollarSign className="w-6 h-6 text-purple-400" />
                      </div>
                      <h3 className="font-semibold text-white">Get Paid</h3>
                      <p className="text-sm text-purple-200">
                        Referral rewards are automatically sent to your wallet
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Your Referral Code */}
              <div className="bg-gradient-to-br from-green-800/20 to-green-900/30 backdrop-blur-sm rounded-xl border border-green-500/20 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Your Referral Code</h3>
                
                {userReferralCode ? (
                  <div className="space-y-4">
                    <div className="bg-green-800/30 rounded-lg p-4 flex items-center justify-between">
                      <div>
                        <p className="text-green-300 text-sm">Your Referral Code</p>
                        <p className="text-white font-mono text-lg">{userReferralCode}</p>
                      </div>
                      <Button
                        onClick={handleCopyReferralCode}
                        variant="outline"
                        className="border-green-500/30 text-green-300 hover:bg-green-600/20"
                        data-testid="button-copy-referral"
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy
                      </Button>
                    </div>
                    
                    <div className="bg-green-800/20 rounded-lg p-4">
                      <p className="text-green-200 text-sm">
                        Share this code with friends! When they use it, you'll earn 10% of their claimed SOL.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center space-y-4">
                    <Users className="h-12 w-12 text-green-400 mx-auto" />
                    <p className="text-green-200">Generate your unique referral code to start earning</p>
                    <Button
                      onClick={() => generateReferralMutation.mutate()}
                      disabled={generateReferralMutation.isPending}
                      className="bg-green-600 hover:bg-green-700 text-white"
                      data-testid="button-generate-referral"
                    >
                      {generateReferralMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Gift className="h-4 w-4 mr-2" />
                      )}
                      Generate Referral Code
                    </Button>
                  </div>
                )}
              </div>

              {/* Enter Referral Code */}
              <div className="bg-gradient-to-br from-blue-800/20 to-blue-900/30 backdrop-blur-sm rounded-xl border border-blue-500/20 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Enter a Referral Code</h3>
                <p className="text-blue-200 text-sm mb-4">
                  Have a referral code? Enter it below to give your referrer a bonus!
                </p>
                
                <div className="flex space-x-3">
                  <Input
                    type="text"
                    placeholder="Enter referral code"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value)}
                    className="bg-slate-800/50 border-slate-600 text-white"
                    data-testid="input-referral-code"
                  />
                  <Button
                    onClick={() => submitReferralMutation.mutate(referralCode)}
                    disabled={!referralCode || submitReferralMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    data-testid="button-submit-referral"
                  >
                    {submitReferralMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      'Submit'
                    )}
                  </Button>
                </div>
              </div>

              {/* Referral Stats */}
              {referralStats && (
                <div className="bg-gradient-to-br from-yellow-800/20 to-yellow-900/30 backdrop-blur-sm rounded-xl border border-yellow-500/20 p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Your Referral Stats</h3>
                  
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-white">{referralStats.totalReferrals || 0}</p>
                      <p className="text-yellow-300 text-sm">Total Referrals</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-white">{referralStats.totalEarned || 0} SOL</p>
                      <p className="text-yellow-300 text-sm">Total Earned</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-white">{referralStats.activeReferrals || 0}</p>
                      <p className="text-yellow-300 text-sm">Active This Month</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}