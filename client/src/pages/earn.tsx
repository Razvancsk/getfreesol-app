import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Coins, TrendingUp, RefreshCw, Wallet, PiggyBank, Plus, Minus, Loader2 } from "lucide-react";
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

export function EarnContent() {
  const { toast } = useToast();
  const wallet = useWallet();
  const { publicKey, signTransaction } = wallet;
  const { connection } = useConnection();
  
  const [selectedBank, setSelectedBank] = useState<MarginFiBank | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isDepositDialogOpen, setIsDepositDialogOpen] = useState(false);
  const [isWithdrawDialogOpen, setIsWithdrawDialogOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<UserPosition | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

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

  const formatApy = (apy: number) => {
    return `${(apy * 100).toFixed(2)}%`;
  };

  const formatUsd = (value: number) => {
    if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  const handleDeposit = async () => {
    if (!publicKey || !signTransaction || !selectedBank || !depositAmount) {
      toast({
        title: "Error",
        description: "Please connect wallet and enter an amount",
        variant: "destructive",
      });
      return;
    }

    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid deposit amount",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch('/api/marginfi/build-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey.toBase58(),
          bankAddress: selectedBank.bankAddress,
          amount,
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
        description: data.isNewAccount 
          ? `Created MarginFi account and deposited ${amount} ${selectedBank.tokenSymbol}` 
          : `Deposited ${amount} ${selectedBank.tokenSymbol} to MarginFi`,
      });

      setIsDepositDialogOpen(false);
      setDepositAmount("");
      refetchPositions();
    } catch (error: any) {
      console.error('Deposit error:', error);
      toast({
        title: "Deposit Failed",
        description: error.message || "Transaction failed",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
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

    const amount = withdrawAll ? selectedPosition.depositAmount : parseFloat(withdrawAmount);
    if (!withdrawAll && (isNaN(amount) || amount <= 0)) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid withdrawal amount",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch('/api/marginfi/build-withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey.toBase58(),
          bankAddress: selectedPosition.bankAddress,
          amount: withdrawAll ? undefined : amount,
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
          : `Withdrew ${amount} ${selectedPosition.tokenSymbol} from MarginFi`,
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
      setIsProcessing(false);
    }
  };

  const openDepositDialog = (bank: MarginFiBank) => {
    if (!publicKey) {
      toast({
        title: "Wallet Required",
        description: "Please connect your wallet to deposit",
        variant: "destructive",
      });
      return;
    }
    setSelectedBank(bank);
    setDepositAmount("");
    setIsDepositDialogOpen(true);
  };

  const openWithdrawDialog = (position: UserPosition) => {
    setSelectedPosition(position);
    setWithdrawAmount("");
    setIsWithdrawDialogOpen(true);
  };

  return (
    <div className="space-y-6">
        {publicKey && userPositions?.positions && userPositions.positions.length > 0 && (
          <Card className="bg-green-800/30 border-green-600 backdrop-blur mb-6">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Wallet className="w-5 h-5 text-green-400" />
                Your Positions
              </CardTitle>
              <CardDescription className="text-green-200">
                Your active deposits earning yield
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {userPositions.positions.map((position) => (
                  <div 
                    key={position.bankAddress} 
                    className="flex items-center justify-between p-4 bg-green-900/30 rounded-lg border border-green-700/50"
                  >
                    <div className="flex items-center gap-3">
                      {position.tokenLogoUri ? (
                        <img src={position.tokenLogoUri} alt={position.tokenSymbol} className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center">
                          <Coins className="w-4 h-4 text-white" />
                        </div>
                      )}
                      <div>
                        <p className="text-white font-medium">{position.tokenSymbol}</p>
                        <p className="text-green-400 text-sm">
                          {position.depositAmount.toFixed(4)} deposited @ {formatApy(position.depositApy)} APY
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-green-500 text-green-200 hover:bg-green-700"
                      onClick={() => openWithdrawDialog(position)}
                      data-testid={`button-withdraw-${position.tokenSymbol}`}
                    >
                      <Minus className="w-4 h-4 mr-1" />
                      Withdraw
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-purple-800/50 border-purple-600 backdrop-blur mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-400" />
                  Lending Markets
                </CardTitle>
                <CardDescription className="text-purple-200">
                  Deposit assets to earn yield via MarginFi protocol
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="border-purple-500 text-purple-200 hover:bg-purple-700"
                data-testid="button-refresh-markets"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {markets?.source && markets.source !== 'live' && (
              <div className="mb-4 p-3 bg-yellow-900/30 border border-yellow-600/50 rounded-lg flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-yellow-400" />
                <span className="text-yellow-300 text-sm">
                  Showing cached data (live rates temporarily unavailable)
                </span>
              </div>
            )}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
                <span className="ml-3 text-purple-200">Loading markets...</span>
              </div>
            ) : markets?.banks && markets.banks.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-purple-600">
                      <th className="text-left py-3 px-4 text-purple-300 font-medium">Asset</th>
                      <th className="text-right py-3 px-4 text-purple-300 font-medium hidden sm:table-cell">Price</th>
                      <th className="text-right py-3 px-4 text-purple-300 font-medium">APY</th>
                      <th className="text-right py-3 px-4 text-purple-300 font-medium hidden lg:table-cell">Weight</th>
                      <th className="text-right py-3 px-4 text-purple-300 font-medium hidden md:table-cell">Deposits</th>
                      <th className="text-right py-3 px-4 text-purple-300 font-medium hidden lg:table-cell">Global limit</th>
                      <th className="text-right py-3 px-4 text-purple-300 font-medium hidden md:table-cell">Utilization</th>
                      <th className="text-right py-3 px-4 text-purple-300 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {markets.banks.map((bank) => (
                      <tr key={bank.bankAddress} className="border-b border-purple-700/50 hover:bg-purple-700/30 transition-colors">
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            {bank.tokenLogoUri ? (
                              <img src={bank.tokenLogoUri} alt={bank.tokenSymbol} className="w-8 h-8 rounded-full" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
                                <Coins className="w-4 h-4 text-white" />
                              </div>
                            )}
                            <div>
                              <p className="text-white font-medium">{bank.tokenSymbol}</p>
                              <p className="text-purple-400 text-xs">{bank.tokenName}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-right hidden sm:table-cell">
                          <span className="text-white">${bank.price < 0.01 ? bank.price.toFixed(6) : bank.price < 1 ? bank.price.toFixed(4) : bank.price.toFixed(2)}</span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <span className="text-green-400 font-semibold">{formatApy(bank.depositApy)}</span>
                        </td>
                        <td className="py-4 px-4 text-right hidden lg:table-cell">
                          <span className="text-purple-200">{(bank.weight * 100).toFixed(0)}%</span>
                        </td>
                        <td className="py-4 px-4 text-right hidden md:table-cell">
                          <span className="text-purple-200">{formatUsd(bank.totalDeposits)}</span>
                        </td>
                        <td className="py-4 px-4 text-right hidden lg:table-cell">
                          <span className="text-purple-200">{formatUsd(bank.globalLimit)}</span>
                        </td>
                        <td className="py-4 px-4 text-right hidden md:table-cell">
                          <span className="text-purple-300">{(bank.utilizationRate * 100).toFixed(2)}%</span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => openDepositDialog(bank)}
                            data-testid={`button-deposit-${bank.tokenSymbol}`}
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            Deposit
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <PiggyBank className="w-16 h-16 text-purple-400 mx-auto mb-4" />
                <p className="text-purple-200 mb-2">No lending markets available</p>
                <p className="text-purple-400 text-sm">Check back later or refresh</p>
              </div>
            )}
          </CardContent>
        </Card>

      <Dialog open={isDepositDialogOpen} onOpenChange={setIsDepositDialogOpen}>
        <DialogContent className="bg-purple-900 border-purple-600 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-green-400" />
              Deposit {selectedBank?.tokenSymbol}
            </DialogTitle>
            <DialogDescription className="text-purple-300">
              Deposit to MarginFi and earn {selectedBank ? formatApy(selectedBank.depositApy) : '0%'} APY
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3 p-3 bg-purple-800/50 rounded-lg">
              {selectedBank?.tokenLogoUri ? (
                <img src={selectedBank.tokenLogoUri} alt={selectedBank.tokenSymbol} className="w-10 h-10 rounded-full" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center">
                  <Coins className="w-5 h-5 text-white" />
                </div>
              )}
              <div>
                <p className="font-medium">{selectedBank?.tokenSymbol}</p>
                <p className="text-sm text-purple-300">{selectedBank?.tokenName}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="depositAmount">Amount to Deposit</Label>
              <Input
                id="depositAmount"
                type="number"
                placeholder="0.00"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="bg-purple-800/50 border-purple-600 text-white"
                data-testid="input-deposit-amount"
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsDepositDialogOpen(false)}
              className="border-purple-500 text-purple-200"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleDeposit}
              disabled={isProcessing || !depositAmount}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-confirm-deposit"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Deposit
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <Label htmlFor="withdrawAmount">Amount to Withdraw</Label>
              <Input
                id="withdrawAmount"
                type="number"
                placeholder="0.00"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="bg-purple-800/50 border-purple-600 text-white"
                data-testid="input-withdraw-amount"
              />
              <Button
                variant="link"
                size="sm"
                className="text-purple-300 p-0 h-auto"
                onClick={() => setWithdrawAmount(selectedPosition?.depositAmount.toString() || "")}
              >
                Use Max
              </Button>
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
              disabled={isProcessing}
              className="border-orange-500 text-orange-200 hover:bg-orange-700"
              data-testid="button-withdraw-all"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Withdraw All"}
            </Button>
            <Button 
              onClick={() => handleWithdraw(false)}
              disabled={isProcessing || !withdrawAmount}
              className="bg-orange-600 hover:bg-orange-700"
              data-testid="button-confirm-withdraw"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Minus className="w-4 h-4 mr-2" />
                  Withdraw
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function EarnPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-900 via-purple-800 to-indigo-900">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <EarnContent />
      </div>
    </div>
  );
}
