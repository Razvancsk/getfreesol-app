import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Coins, Wallet, Search, CheckCircle, ExternalLink, AlertTriangle, RefreshCw, Flame, Image, Trash2 } from "lucide-react";
import WalletMultiButton from "@/components/WalletMultiButton";
import { useWallet } from "@/providers/WalletProvider";

// Extend window interface for multiple wallet detection
declare global {
  interface Window {
    solflare?: any;
    trustwallet?: any;
    coinbaseSolana?: any;
    magicEden?: any;
    ave?: any;
  }
}

interface EmptyTokenAccount {
  tokenAccount: string;
  mint: string;
  balance: number;
  rentEpoch: number | null;
  executable: boolean;
  owner: string;
  lamports: number;
}

interface ScanResult {
  success: boolean;
  emptyAccounts: number;
  totalReclaimable: string;
  accounts: EmptyTokenAccount[];
  scannedAt: string;
}

interface TokenScanResult {
  success: boolean;
  totalTokens: number;
  burnableTokens: any[];
  estimatedValue: number;
}

interface NftScanResult {
  success: boolean;
  totalNfts: number;
  burnableNfts: any[];
  estimatedValue: number;
}

interface TransactionRecord {
  signature: string;
  solRecovered: number;
  accountsClosed: number;
  processedAt: string;
}

interface RefundStats {
  success: boolean;
  totalSolRecovered: number;
  totalAccountsClaimed: number;
  recentTransactions: TransactionRecord[];
}

export default function SolRefund() {
  const { toast } = useToast();
  const { publicKey: walletPublicKey, connected: walletConnected } = useWallet();
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [activeTab, setActiveTab] = useState<'reclaim' | 'burn'>('reclaim');
  const [tokenScanResult, setTokenScanResult] = useState<TokenScanResult | null>(null);
  const [nftScanResult, setNftScanResult] = useState<NftScanResult | null>(null);
  const [burnActiveTab, setBurnActiveTab] = useState<'tokens' | 'nfts'>('tokens');
  const queryClient = useQueryClient();

  // Convert wallet adapter values to our state format
  const publicKey = walletPublicKey?.toString() || null;
  const isConnected = walletConnected;

  // Clear scan results when wallet disconnects
  useEffect(() => {
    if (!isConnected) {
      setScanResult(null);
      setTokenScanResult(null);
      setNftScanResult(null);
    }
  }, [isConnected]);

  // Fetch SOL refund stats
  const { data: stats, isLoading: statsLoading } = useQuery<RefundStats>({
    queryKey: ['/api/sol-refund/stats'],
    enabled: true,
  });

  // Scan wallet mutation
  const scanMutation = useMutation({
    mutationFn: async () => {
      if (!publicKey) throw new Error('Wallet not connected');
      
      const response = await fetch('/api/sol-refund/scan-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: publicKey }),
      });
      
      if (!response.ok) throw new Error('Failed to scan wallet');
      return response.json();
    },
    onSuccess: (data) => {
      setScanResult(data);
      toast({
        title: "Scan Complete",
        description: `Found ${data.emptyAccounts} empty token accounts with ${data.totalReclaimable} SOL reclaimable`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Scan Failed",
        description: error.message || "Failed to scan wallet",
        variant: "destructive",
      });
    },
  });

  // Scan tokens mutation
  const scanTokensMutation = useMutation({
    mutationFn: async () => {
      if (!publicKey) throw new Error('Wallet not connected');
      
      const response = await fetch('/api/tokens/scan-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: publicKey }),
      });
      
      if (!response.ok) throw new Error('Failed to scan tokens');
      return response.json();
    },
    onSuccess: (data) => {
      setTokenScanResult(data);
      toast({
        title: "Token Scan Complete",
        description: `Found ${data.totalTokens} tokens, ${data.burnableTokens.length} can be burned`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Token Scan Failed",
        description: error.message || "Failed to scan wallet tokens",
        variant: "destructive",
      });
    },
  });

  // Scan NFTs mutation
  const scanNftsMutation = useMutation({
    mutationFn: async () => {
      if (!publicKey) throw new Error('Wallet not connected');
      
      const response = await fetch('/api/nfts/scan-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: publicKey }),
      });
      
      if (!response.ok) throw new Error('Failed to scan NFTs');
      return response.json();
    },
    onSuccess: (data) => {
      setNftScanResult(data);
      toast({
        title: "NFT Scan Complete", 
        description: `Found ${data.totalNfts} NFTs, ${data.burnableNfts.length} can be burned`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "NFT Scan Failed",
        description: error.message || "Failed to scan wallet NFTs",
        variant: "destructive",
      });
    },
  });

  // Claim SOL mutation
  const claimMutation = useMutation({
    mutationFn: async () => {
      if (!publicKey || !scanResult) throw new Error('No scan results available');
      
      const response = await fetch('/api/sol-refund/prepare-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: publicKey,
          accounts: scanResult.accounts.map(acc => acc.tokenAccount),
        }),
      });
      
      if (!response.ok) throw new Error('Failed to prepare transactions');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success!",
        description: "SOL has been successfully reclaimed from empty token accounts",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/sol-refund/stats'] });
      setScanResult(null);
    },
    onError: (error: any) => {
      toast({
        title: "Claim Failed",
        description: error.message || "Failed to claim SOL",
        variant: "destructive",
      });
    },
  });

  // Burn token mutation
  const burnTokenMutation = useMutation({
    mutationFn: async (tokenMint: string) => {
      if (!publicKey) throw new Error('Wallet not connected');
      
      const response = await fetch('/api/tokens/burn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: publicKey,
          tokenMint,
        }),
      });
      
      if (!response.ok) throw new Error('Failed to burn token');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Token Burned",
        description: "Token has been successfully burned",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Burn Failed",
        description: error.message || "Failed to burn token",
        variant: "destructive",
      });
    },
  });

  const handleBurnToken = (tokenMint: string) => {
    if (!publicKey) {
      toast({
        title: "Error",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }
    burnTokenMutation.mutate(tokenMint);
  };

  const handleBurnNFT = (nftMint: string) => {
    if (!publicKey) {
      toast({
        title: "Error", 
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }
    burnTokenMutation.mutate(nftMint);
  };

  const calculateRefund = () => {
    if (!scanResult) return { total: 0, donation: 0, net: 0 };
    
    const total = parseFloat(scanResult.totalReclaimable);
    const donation = total * 0.15; // 15% service fee
    const net = total - donation; // 85% to user
    
    return { total, donation, net };
  };

  const refundCalc = calculateRefund();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="space-y-6">
          {/* Header with Wallet Connection */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-3">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">Get Your Sol</h1>
            </div>
            
            {/* Multi-Wallet Connection */}
            <WalletMultiButton />
          </div>

          {/* Description */}
          <div className="text-center space-y-4 py-4">
            <p className="text-white max-w-2xl mx-auto text-lg">
              Reclaim your SOL rent from empty token accounts and burn unwanted tokens.
            </p>
          </div>

          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card className="bg-gradient-to-br from-slate-800/60 to-purple-800/60 border-purple-500/20 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-white">Total SOL Recovered</CardTitle>
                <Coins className="h-4 w-4 text-purple-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">
                  {statsLoading ? '...' : `${stats?.totalSolRecovered?.toFixed(4) || 0} SOL`}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-slate-800/60 to-purple-800/60 border-purple-500/20 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-white">Accounts Claimed</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">
                  {statsLoading ? '...' : `${stats?.totalAccountsClaimed || 0}`}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-slate-800/60 to-purple-800/60 border-purple-500/20 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-white">Recent Claims</CardTitle>
                <RefreshCw className="h-4 w-4 text-blue-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">
                  {statsLoading ? '...' : `${stats?.recentTransactions?.length || 0}`}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Tabs */}
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'reclaim' | 'burn')} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-slate-800/50 border border-purple-500/20">
              <TabsTrigger value="reclaim" className="data-[state=active]:bg-purple-600/60 text-white">
                <Coins className="h-4 w-4 mr-2" />
                Reclaim SOL
              </TabsTrigger>
              <TabsTrigger value="burn" className="data-[state=active]:bg-purple-600/60 text-white">
                <Flame className="h-4 w-4 mr-2" />
                Burn Tokens & NFTs
              </TabsTrigger>
            </TabsList>

            <TabsContent value="reclaim" className="space-y-6 mt-6">
              {!isConnected ? (
                <Card className="bg-gradient-to-br from-slate-800/60 to-purple-800/60 border-purple-500/20 backdrop-blur-sm">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Wallet className="h-16 w-16 text-purple-400 mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">Connect Your Wallet</h3>
                    <p className="text-gray-300 text-center mb-6">
                      Connect your Solana wallet to scan for empty token accounts and reclaim your SOL.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-6">
                  {/* Scan Section */}
                  <Card className="bg-gradient-to-br from-slate-800/60 to-purple-800/60 border-purple-500/20 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center">
                        <Search className="h-5 w-5 mr-2 text-purple-400" />
                        Scan Your Wallet
                      </CardTitle>
                      <CardDescription className="text-gray-300">
                        Find empty token accounts that can be closed to reclaim SOL rent deposits.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Button
                        onClick={() => scanMutation.mutate()}
                        disabled={scanMutation.isPending}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                        size="lg"
                      >
                        {scanMutation.isPending ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            Scanning Wallet...
                          </>
                        ) : (
                          <>
                            <Search className="h-4 w-4 mr-2" />
                            Scan Wallet for Empty Accounts
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Scan Results */}
                  {scanResult && (
                    <Card className="bg-gradient-to-br from-slate-800/60 to-purple-800/60 border-purple-500/20 backdrop-blur-sm">
                      <CardHeader>
                        <CardTitle className="text-white flex items-center justify-between">
                          <span className="flex items-center">
                            <CheckCircle className="h-5 w-5 mr-2 text-green-400" />
                            Scan Results
                          </span>
                          <Badge variant="secondary" className="bg-purple-600/60 text-white">
                            {scanResult.emptyAccounts} accounts found
                          </Badge>
                        </CardTitle>
                        <CardDescription className="text-gray-300">
                          Empty token accounts that can be closed to recover SOL rent deposits.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {/* Refund Breakdown */}
                        <div className="bg-slate-700/50 rounded-lg p-4 space-y-3">
                          <div className="flex justify-between text-white">
                            <span>Total Reclaimable:</span>
                            <span className="font-bold">{refundCalc.total.toFixed(4)} SOL</span>
                          </div>
                          <div className="flex justify-between text-gray-300">
                            <span>Service Fee (15%):</span>
                            <span>-{refundCalc.donation.toFixed(4)} SOL</span>
                          </div>
                          <Separator className="bg-purple-500/20" />
                          <div className="flex justify-between text-white font-bold text-lg">
                            <span>You'll Receive:</span>
                            <span className="text-green-400">{refundCalc.net.toFixed(4)} SOL</span>
                          </div>
                        </div>

                        {/* Claim Button */}
                        <Button
                          onClick={() => claimMutation.mutate()}
                          disabled={claimMutation.isPending || scanResult.emptyAccounts === 0}
                          className="w-full bg-green-600 hover:bg-green-700 text-white"
                          size="lg"
                        >
                          {claimMutation.isPending ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              Processing Claim...
                            </>
                          ) : (
                            <>
                              <Coins className="h-4 w-4 mr-2" />
                              Claim {refundCalc.net.toFixed(4)} SOL
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="burn" className="space-y-6 mt-6">
              {!isConnected ? (
                <Card className="bg-gradient-to-br from-slate-800/60 to-purple-800/60 border-purple-500/20 backdrop-blur-sm">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Wallet className="h-16 w-16 text-purple-400 mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">Connect Your Wallet</h3>
                    <p className="text-gray-300 text-center mb-6">
                      Connect your Solana wallet to scan and burn unwanted tokens and NFTs.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-6">
                  {/* Burn Type Tabs */}
                  <Tabs value={burnActiveTab} onValueChange={(value) => setBurnActiveTab(value as 'tokens' | 'nfts')} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 bg-slate-700/50">
                      <TabsTrigger value="tokens" className="data-[state=active]:bg-purple-600/60 text-white">
                        <Coins className="h-4 w-4 mr-2" />
                        Tokens
                      </TabsTrigger>
                      <TabsTrigger value="nfts" className="data-[state=active]:bg-purple-600/60 text-white">
                        <Image className="h-4 w-4 mr-2" />
                        NFTs
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="tokens" className="space-y-4">
                      {/* Token Scan */}
                      <Card className="bg-gradient-to-br from-slate-800/60 to-purple-800/60 border-purple-500/20 backdrop-blur-sm">
                        <CardHeader>
                          <CardTitle className="text-white">Scan for Tokens</CardTitle>
                          <CardDescription className="text-gray-300">
                            Find tokens in your wallet that can be burned.
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <Button
                            onClick={() => scanTokensMutation.mutate()}
                            disabled={scanTokensMutation.isPending}
                            className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                          >
                            {scanTokensMutation.isPending ? (
                              <>
                                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                Scanning Tokens...
                              </>
                            ) : (
                              <>
                                <Search className="h-4 w-4 mr-2" />
                                Scan for Tokens
                              </>
                            )}
                          </Button>
                        </CardContent>
                      </Card>

                      {/* Token Results */}
                      {tokenScanResult && tokenScanResult.burnableTokens.length > 0 && (
                        <Card className="bg-gradient-to-br from-slate-800/60 to-purple-800/60 border-purple-500/20 backdrop-blur-sm">
                          <CardHeader>
                            <CardTitle className="text-white">Burnable Tokens</CardTitle>
                            <CardDescription className="text-gray-300">
                              {tokenScanResult.burnableTokens.length} tokens found
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-3">
                              {tokenScanResult.burnableTokens.map((token: any, index: number) => (
                                <div key={index} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                                  <div className="flex items-center space-x-3">
                                    <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center">
                                      <Coins className="h-5 w-5 text-white" />
                                    </div>
                                    <div>
                                      <p className="text-white font-medium">{token.name || 'Unknown Token'}</p>
                                      <p className="text-gray-400 text-sm">{token.balance} tokens</p>
                                    </div>
                                  </div>
                                  <Button
                                    onClick={() => handleBurnToken(token.mint)}
                                    disabled={burnTokenMutation.isPending}
                                    variant="destructive"
                                    size="sm"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Burn
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </TabsContent>

                    <TabsContent value="nfts" className="space-y-4">
                      {/* NFT Scan */}
                      <Card className="bg-gradient-to-br from-slate-800/60 to-purple-800/60 border-purple-500/20 backdrop-blur-sm">
                        <CardHeader>
                          <CardTitle className="text-white">Scan for NFTs</CardTitle>
                          <CardDescription className="text-gray-300">
                            Find NFTs in your wallet that can be burned.
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <Button
                            onClick={() => scanNftsMutation.mutate()}
                            disabled={scanNftsMutation.isPending}
                            className="w-full bg-red-600 hover:bg-red-700 text-white"
                          >
                            {scanNftsMutation.isPending ? (
                              <>
                                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                Scanning NFTs...
                              </>
                            ) : (
                              <>
                                <Search className="h-4 w-4 mr-2" />
                                Scan for NFTs
                              </>
                            )}
                          </Button>
                        </CardContent>
                      </Card>

                      {/* NFT Results */}
                      {nftScanResult && nftScanResult.burnableNfts.length > 0 && (
                        <Card className="bg-gradient-to-br from-slate-800/60 to-purple-800/60 border-purple-500/20 backdrop-blur-sm">
                          <CardHeader>
                            <CardTitle className="text-white">Burnable NFTs</CardTitle>
                            <CardDescription className="text-gray-300">
                              {nftScanResult.burnableNfts.length} NFTs found
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                              {nftScanResult.burnableNfts.map((nft: any, index: number) => (
                                <div key={index} className="bg-slate-700/50 rounded-lg p-3 space-y-3">
                                  <div className="aspect-square bg-gradient-to-br from-pink-400 to-purple-500 rounded-lg flex items-center justify-center">
                                    <Image className="h-8 w-8 text-white" />
                                  </div>
                                  <div>
                                    <p className="text-white text-sm font-medium truncate">{nft.name || 'Unknown NFT'}</p>
                                    <p className="text-gray-400 text-xs truncate">{nft.collection || 'No Collection'}</p>
                                  </div>
                                  <Button
                                    onClick={() => handleBurnNFT(nft.mint)}
                                    disabled={burnTokenMutation.isPending}
                                    variant="destructive"
                                    size="sm"
                                    className="w-full"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Burn NFT
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}