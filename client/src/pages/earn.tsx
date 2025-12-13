import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Coins, RefreshCw, Wallet, Loader2, ChevronDown, TrendingUp, Shield, Database, Eye, Minus } from "lucide-react";
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Transaction } from '@solana/web3.js';

interface MarginFiBank {
  bankAddress: string;
  tokenSymbol: string;
  tokenMint: string;
  tokenName: string;
  tokenLogoUri?: string;
  price: number;
  depositApy: number;
  borrowApy: number;
  weight: number;
  totalDeposits: number;
  totalBorrows: number;
  globalLimit: number;
  utilizationRate: number;
  decimals: number;
}

interface UserPosition {
  bankAddress: string;
  tokenMint: string;
  tokenSymbol: string;
  tokenName: string;
  tokenLogoUri: string;
  decimals: number;
  depositAmount: number;
  borrowAmount: number;
  depositApy: number;
  borrowApy: number;
}

export default function EarnPage() {
  return <EarnContent />;
}

export function EarnContent() {
  const { toast } = useToast();
  const wallet = useWallet();
  const { publicKey, signTransaction } = wallet;
  const { connection } = useConnection();
  
  const [selectedTokenMint, setSelectedTokenMint] = useState<string>('');
  const [amount, setAmount] = useState("");
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [isWithdrawDialogOpen, setIsWithdrawDialogOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<UserPosition | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const { data: markets, isLoading, refetch } = useQuery<{ 
    success: boolean; 
    banks: MarginFiBank[];
    source?: 'live' | 'cached' | 'fallback';
    cachedAt?: number;
  }>({
    queryKey: ['/api/marginfi/markets'],
    queryFn: async () => {
      const response = await fetch('/api/marginfi/markets');
      if (!response.ok) throw new Error('Failed to fetch markets');
      return response.json();
    },
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const { data: userPositions, refetch: refetchPositions } = useQuery<{ 
    success: boolean; 
    positions: UserPosition[]; 
    hasAccount: boolean;
    accountAddress?: string;
  }>({
    queryKey: ['/api/marginfi/user-positions', publicKey?.toBase58()],
    queryFn: async () => {
      if (!publicKey) return { success: true, positions: [], hasAccount: false };
      const response = await fetch(`/api/marginfi/user-positions?wallet=${publicKey.toBase58()}`);
      if (!response.ok) throw new Error('Failed to fetch positions');
      return response.json();
    },
    enabled: !!publicKey,
    staleTime: 30000,
  });

  const selectedBank = markets?.banks?.find(b => b.tokenMint === selectedTokenMint);

  useEffect(() => {
    if (markets?.banks && markets.banks.length > 0 && !selectedTokenMint) {
      setSelectedTokenMint(markets.banks[0].tokenMint);
    }
  }, [markets?.banks, selectedTokenMint]);

  useEffect(() => {
    if (!publicKey) return;

    const fetchBalances = async () => {
      setIsLoadingBalances(true);
      console.log('Fetching balances for wallet:', publicKey.toString());
      const newBalances: Record<string, number> = {};
      
      try {
        const holdingsResponse = await fetch(`/api/wallet/all-tokens?address=${publicKey.toString()}`);
        
        if (!holdingsResponse.ok) {
          throw new Error('Failed to fetch holdings');
        }
        
        const holdingsData = await holdingsResponse.json();
        
        if (holdingsData.success && holdingsData.tokens) {
          for (const token of holdingsData.tokens) {
            newBalances[token.address] = token.balance;
          }
        }
      } catch (error: any) {
        console.error('Error fetching holdings:', error?.message || error);
      }
      
      setBalances(newBalances);
      setIsLoadingBalances(false);
      console.log('Balances fetched:', newBalances);
    };

    fetchBalances();
  }, [publicKey]);

  const formatApy = (apy: number) => `${(apy * 100).toFixed(2)}%`;

  const formatUsd = (value: number) => {
    if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  const userPosition = userPositions?.positions?.find(p => p.tokenMint === selectedTokenMint);
  const totalDeposited = userPosition?.depositAmount || 0;
  const depositedUsdValue = totalDeposited * (selectedBank?.price || 0);
  const walletBalance = selectedBank ? (balances[selectedBank.tokenMint] || 0) : 0;

  const handleSupply = async () => {
    if (!publicKey || !signTransaction || !selectedBank || !amount) {
      toast({
        title: "Error",
        description: "Please connect wallet and enter an amount",
        variant: "destructive",
      });
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    setIsDepositing(true);
    try {
      const response = await fetch('/api/marginfi/build-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey.toBase58(),
          bankAddress: selectedBank.bankAddress,
          amount: amountNum,
          tokenMint: selectedBank.tokenMint,
        }),
      });

      const data = await response.json();

      if (!data.success || !data.transaction) {
        throw new Error(data.error || 'Failed to build deposit transaction');
      }

      const txBuffer = Buffer.from(data.transaction, 'base64');
      const transaction = Transaction.from(txBuffer);
      
      const signedTx = await signTransaction(transaction);
      const txId = await connection.sendRawTransaction(signedTx.serialize());
      
      await connection.confirmTransaction(txId, 'confirmed');

      toast({
        title: data.isNewAccount ? "Account Created & Deposit Successful!" : "Deposit Successful!",
        description: `Deposited ${amountNum} ${selectedBank.tokenSymbol} to MarginFi`,
      });

      setAmount("");
      refetchPositions();
    } catch (error: any) {
      console.error('Deposit error:', error);
      toast({
        title: "Deposit Failed",
        description: error.message || "Transaction failed",
        variant: "destructive",
      });
    } finally {
      setIsDepositing(false);
    }
  };

  const handleWithdraw = async (withdrawAll: boolean = false) => {
    if (!publicKey || !signTransaction || !selectedPosition) {
      toast({
        title: "Error",
        description: "Please connect wallet and select a position",
        variant: "destructive",
      });
      return;
    }

    const amountNum = withdrawAll ? selectedPosition.depositAmount : parseFloat(withdrawAmount);
    if (!withdrawAll && (isNaN(amountNum) || amountNum <= 0)) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid withdrawal amount",
        variant: "destructive",
      });
      return;
    }

    setIsWithdrawing(true);
    try {
      const response = await fetch('/api/marginfi/build-withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey.toBase58(),
          bankAddress: selectedPosition.bankAddress,
          amount: withdrawAll ? undefined : amountNum,
          withdrawAll,
        }),
      });

      const data = await response.json();

      if (!data.success || !data.transaction) {
        throw new Error(data.error || 'Failed to build withdraw transaction');
      }

      const txBuffer = Buffer.from(data.transaction, 'base64');
      const transaction = Transaction.from(txBuffer);
      
      const signedTx = await signTransaction(transaction);
      const txId = await connection.sendRawTransaction(signedTx.serialize());
      
      await connection.confirmTransaction(txId, 'confirmed');

      toast({
        title: "Withdrawal Successful!",
        description: withdrawAll 
          ? `Withdrew all ${selectedPosition.tokenSymbol} from MarginFi`
          : `Withdrew ${amountNum} ${selectedPosition.tokenSymbol} from MarginFi`,
      });

      setIsWithdrawDialogOpen(false);
      setWithdrawAmount("");
      refetchPositions();
    } catch (error: any) {
      console.error('Withdraw error:', error);
      toast({
        title: "Withdrawal Failed",
        description: error.message || "Transaction failed",
        variant: "destructive",
      });
    } finally {
      setIsWithdrawing(false);
    }
  };

  const openWithdrawDialog = (position: UserPosition) => {
    setSelectedPosition(position);
    setWithdrawAmount("");
    setIsWithdrawDialogOpen(true);
  };

  const handleWithdrawAllDirect = async (bankAddress: string, tokenSymbol: string) => {
    if (!publicKey || !signTransaction) {
      toast({
        title: "Error",
        description: "Please connect wallet first",
        variant: "destructive",
      });
      return;
    }

    setIsWithdrawing(true);
    try {
      const response = await fetch('/api/marginfi/build-withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey.toBase58(),
          bankAddress: bankAddress,
          withdrawAll: true,
        }),
      });

      const data = await response.json();

      if (!data.success || !data.transaction) {
        throw new Error(data.error || 'Failed to build withdraw transaction');
      }

      const txBuffer = Buffer.from(data.transaction, 'base64');
      const transaction = Transaction.from(txBuffer);
      
      const signedTx = await signTransaction(transaction);
      const txId = await connection.sendRawTransaction(signedTx.serialize());
      
      await connection.confirmTransaction(txId, 'confirmed');

      toast({
        title: "Withdrawal Successful!",
        description: `Withdrew all ${tokenSymbol} + interest from MarginFi`,
      });

      refetchPositions();
    } catch (error: any) {
      console.error('Withdraw error:', error);
      toast({
        title: "Withdrawal Failed",
        description: error.message || "Transaction failed",
        variant: "destructive",
      });
    } finally {
      setIsWithdrawing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
        <span className="ml-3 text-purple-200">Loading markets...</span>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <Card className="bg-purple-900/80 border-purple-600 backdrop-blur overflow-hidden">
        <CardContent className="p-5 space-y-5">
            {markets?.source && markets.source !== 'live' && (
              <div className="p-2 bg-yellow-900/30 border border-yellow-600/50 rounded-lg flex items-center gap-2">
                <RefreshCw className="w-3 h-3 text-yellow-400" />
                <span className="text-yellow-300 text-xs">Cached data</span>
              </div>
            )}

            <Select value={selectedTokenMint} onValueChange={setSelectedTokenMint}>
              <SelectTrigger 
                className="w-full bg-purple-800/50 border-purple-600 text-white h-14 focus:ring-purple-500 focus:ring-offset-purple-900"
                data-testid="select-token"
              >
                <SelectValue>
                  {selectedBank && (
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-3">
                        {selectedBank.tokenLogoUri ? (
                          <img src={selectedBank.tokenLogoUri} alt={selectedBank.tokenSymbol} className="w-8 h-8 rounded-full" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
                            <Coins className="w-4 h-4 text-white" />
                          </div>
                        )}
                        <span className="font-medium">{selectedBank.tokenSymbol}</span>
                      </div>
                      <span className="text-green-400 font-semibold">
                        {formatApy(selectedBank.depositApy)} APY
                      </span>
                    </div>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-purple-900 border-purple-600">
                {markets?.banks?.map((bank) => (
                  <SelectItem 
                    key={bank.tokenMint} 
                    value={bank.tokenMint}
                    className="text-white hover:bg-purple-700 focus:bg-purple-700"
                  >
                    <div className="flex items-center justify-between w-full gap-8">
                      <div className="flex items-center gap-2">
                        {bank.tokenLogoUri ? (
                          <img src={bank.tokenLogoUri} alt={bank.tokenSymbol} className="w-6 h-6 rounded-full" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center">
                            <Coins className="w-3 h-3 text-white" />
                          </div>
                        )}
                        <span>{bank.tokenSymbol}</span>
                      </div>
                      <span className="text-green-400 text-sm">
                        {formatApy(bank.depositApy)}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-purple-300 text-sm">Amount</span>
                <div className="flex items-center gap-2">
                  <Wallet className="w-3 h-3 text-purple-400" />
                  <span className="text-purple-300 text-sm">
                    {walletBalance.toFixed(4)} {selectedBank?.tokenSymbol || ''}
                  </span>
                  <Button
                    variant="link"
                    size="sm"
                    className="text-purple-400 hover:text-purple-200 p-0 h-auto text-sm"
                    onClick={() => setAmount(walletBalance.toString())}
                    data-testid="button-max"
                  >
                    MAX
                  </Button>
                </div>
              </div>
              <Input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="bg-purple-800/50 border-purple-600 text-white text-lg h-12"
                data-testid="input-amount"
              />
            </div>

            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white h-12 text-base font-medium"
              onClick={handleSupply}
              disabled={isDepositing || !amount || !publicKey}
              data-testid="button-supply"
            >
              {isDepositing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                'Supply'
              )}
            </Button>

            {!publicKey && (
              <p className="text-center text-purple-400 text-sm">
                Connect your wallet to supply assets
              </p>
            )}

            {selectedBank && (
              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-purple-700">
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-purple-400 text-xs">
                    <Coins className="w-3 h-3" />
                    Total Deposited
                  </div>
                  <p className="text-white font-medium">{totalDeposited.toFixed(4)} {selectedBank.tokenSymbol}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-purple-400 text-xs">
                    <TrendingUp className="w-3 h-3" />
                    USD Value
                  </div>
                  <p className="text-white font-medium">{formatUsd(depositedUsdValue)}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-purple-400 text-xs">
                    <TrendingUp className="w-3 h-3" />
                    Lending Rate
                  </div>
                  <p className="text-green-400 font-medium">{formatApy(selectedBank.depositApy)}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-purple-400 text-xs">
                    <Shield className="w-3 h-3" />
                    Weight
                  </div>
                  <p className="text-white font-medium">{(selectedBank.weight * 100).toFixed(0)}%</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-purple-400 text-xs">
                    <Database className="w-3 h-3" />
                    Pool Size
                  </div>
                  <p className="text-white font-medium">{formatUsd(selectedBank.totalDeposits)}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-purple-400 text-xs">
                    <Eye className="w-3 h-3" />
                    Utilization
                  </div>
                  <p className="text-white font-medium">{(selectedBank.utilizationRate * 100).toFixed(1)}%</p>
                </div>
              </div>
            )}

            {userPosition && totalDeposited > 0 && (
              <Button
                className="w-full bg-orange-600 hover:bg-orange-700 text-white h-12 text-base font-medium mt-4"
                onClick={() => handleWithdrawAllDirect(userPosition.bankAddress, userPosition.tokenSymbol)}
                disabled={isWithdrawing || !publicKey}
                data-testid="button-withdraw-all-inline"
              >
                {isWithdrawing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Withdrawing...
                  </>
                ) : (
                  <>
                    <Minus className="w-4 h-4 mr-2" />
                    Withdraw All ({totalDeposited.toFixed(4)} {selectedBank?.tokenSymbol})
                  </>
                )}
              </Button>
            )}
        </CardContent>
      </Card>

      <div className="text-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          className="text-purple-400 hover:text-purple-200"
          data-testid="button-refresh"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh Rates
        </Button>
      </div>

      <Dialog open={isWithdrawDialogOpen} onOpenChange={setIsWithdrawDialogOpen}>
        <DialogContent className="bg-purple-900 border-purple-600 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Minus className="w-5 h-5 text-orange-400" />
              Withdraw {selectedPosition?.tokenSymbol}
            </DialogTitle>
            <DialogDescription className="text-purple-300">
              Available: {selectedPosition?.depositAmount.toFixed(4)} {selectedPosition?.tokenSymbol}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3 p-3 bg-purple-800/50 rounded-lg">
              {selectedPosition?.tokenLogoUri ? (
                <img src={selectedPosition.tokenLogoUri} alt={selectedPosition.tokenSymbol} className="w-10 h-10 rounded-full" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center">
                  <Coins className="w-5 h-5 text-white" />
                </div>
              )}
              <div>
                <p className="font-medium">{selectedPosition?.tokenSymbol}</p>
                <p className="text-sm text-green-400">
                  Earning {selectedPosition ? formatApy(selectedPosition.depositApy) : '0%'} APY
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-purple-300 text-sm">Amount</span>
                <Button
                  variant="link"
                  size="sm"
                  className="text-purple-300 p-0 h-auto"
                  onClick={() => setWithdrawAmount(selectedPosition?.depositAmount.toString() || "")}
                >
                  MAX
                </Button>
              </div>
              <Input
                type="number"
                placeholder="0.00"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="bg-purple-800/50 border-purple-600 text-white"
                data-testid="input-withdraw-amount"
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={() => setIsWithdrawDialogOpen(false)}
              className="border-purple-500 text-purple-200"
            >
              Cancel
            </Button>
            <Button 
              variant="outline"
              onClick={() => handleWithdraw(true)}
              disabled={isWithdrawing}
              className="border-orange-500 text-orange-200 hover:bg-orange-700"
              data-testid="button-withdraw-all"
            >
              {isWithdrawing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Withdraw All"}
            </Button>
            <Button 
              onClick={() => handleWithdraw(false)}
              disabled={isWithdrawing || !withdrawAmount}
              className="bg-orange-600 hover:bg-orange-700"
              data-testid="button-confirm-withdraw"
            >
              {isWithdrawing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Withdraw"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
