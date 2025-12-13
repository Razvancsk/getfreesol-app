import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Coins, TrendingUp, ArrowLeft, RefreshCw, Wallet, ExternalLink, Percent, DollarSign, PiggyBank } from "lucide-react";
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import logoImage from '@assets/image_1765419958982.png';

interface MarginFiBank {
  bankAddress: string;
  tokenSymbol: string;
  tokenMint: string;
  tokenName: string;
  tokenLogoUri?: string;
  depositApy: number;
  borrowApy: number;
  totalDeposits: number;
  totalBorrows: number;
  utilizationRate: number;
  decimals: number;
}

export default function EarnPage() {
  const { toast } = useToast();
  const wallet = useWallet();
  const { publicKey } = wallet;
  const { connection } = useConnection();
  const [selectedBank, setSelectedBank] = useState<MarginFiBank | null>(null);

  const { data: markets, isLoading, refetch } = useQuery<{ success: boolean; banks: MarginFiBank[] }>({
    queryKey: ['/api/marginfi/markets'],
    queryFn: async () => {
      const response = await fetch('/api/marginfi/markets');
      if (!response.ok) throw new Error('Failed to fetch markets');
      return response.json();
    },
    staleTime: 60000,
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-900 via-purple-800 to-indigo-900">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm" className="text-purple-200 hover:text-white hover:bg-purple-700/50" data-testid="button-back-home">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <img src={logoImage} alt="Logo" className="w-10 h-10 rounded-full" />
              <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                  <PiggyBank className="w-6 h-6 text-green-400" />
                  Earn
                </h1>
                <p className="text-purple-300 text-sm">Powered by MarginFi</p>
              </div>
            </div>
          </div>
          <WalletMultiButton />
        </div>

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
                      <th className="text-right py-3 px-4 text-purple-300 font-medium">Deposit APY</th>
                      <th className="text-right py-3 px-4 text-purple-300 font-medium">Borrow APY</th>
                      <th className="text-right py-3 px-4 text-purple-300 font-medium hidden md:table-cell">Total Deposits</th>
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
                        <td className="py-4 px-4 text-right">
                          <span className="text-green-400 font-semibold">{formatApy(bank.depositApy)}</span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <span className="text-orange-400 font-semibold">{formatApy(bank.borrowApy)}</span>
                        </td>
                        <td className="py-4 px-4 text-right hidden md:table-cell">
                          <span className="text-purple-200">{formatUsd(bank.totalDeposits)}</span>
                        </td>
                        <td className="py-4 px-4 text-right hidden md:table-cell">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-purple-900 rounded-full h-2">
                              <div 
                                className="bg-purple-400 h-2 rounded-full" 
                                style={{ width: `${Math.min(bank.utilizationRate * 100, 100)}%` }}
                              />
                            </div>
                            <span className="text-purple-300 text-sm">{(bank.utilizationRate * 100).toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => {
                              if (!publicKey) {
                                toast({
                                  title: "Wallet Required",
                                  description: "Please connect your wallet to deposit",
                                  variant: "destructive",
                                });
                                return;
                              }
                              window.open(`https://app.marginfi.com/?token=${bank.tokenSymbol}`, '_blank');
                            }}
                            data-testid={`button-deposit-${bank.tokenSymbol}`}
                          >
                            <ExternalLink className="w-4 h-4 mr-1" />
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

        <Card className="bg-purple-800/30 border-purple-600/50">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge className="bg-purple-600 text-white">MarginFi</Badge>
                <span className="text-purple-300 text-sm">Decentralized lending protocol on Solana</span>
              </div>
              <a 
                href="https://app.marginfi.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-purple-300 hover:text-white flex items-center gap-1 text-sm"
              >
                Visit MarginFi <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
