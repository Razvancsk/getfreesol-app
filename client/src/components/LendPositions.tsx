import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronRight } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface LendPositionsProps {
  publicKey: any;
  onVaultClick: (reserve: any) => Promise<void>;
  userPositions: any;
}

export function LendPositions({ publicKey, onVaultClick, userPositions }: LendPositionsProps) {
  // Query for Jupiter Lend earn pools
  const { data: jupiterLendData, isLoading: loadingMarket } = useQuery<{ success: boolean; programId: string; reserves: any[] }>({
    queryKey: ['/api/jupiter-lend/earn-pools'],
    retry: false,
  });

  const formatTVL = (value: number, symbol: string) => {
    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1)}M ${symbol}`;
    } else if (value >= 1_000) {
      return `${(value / 1_000).toFixed(1)}K ${symbol}`;
    } else {
      return `${value.toFixed(2)} ${symbol}`;
    }
  };

  const formatUSDValue = (value: number) => {
    if (value >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(1)}M`;
    } else if (value >= 1_000) {
      return `$${(value / 1_000).toFixed(1)}K`;
    } else {
      return `$${value.toFixed(2)}`;
    }
  };

  const formatAmount = (amount: string | number, decimals: number, symbol: string, showUSD?: boolean, price?: number) => {
    if (!amount || amount === '0' || amount === 0) {
      return showUSD ? { token: `0.00 ${symbol}`, usd: '$0.00' } : '-';
    }
    const value = parseFloat(amount.toString()) / Math.pow(10, decimals);
    if (showUSD && price) {
      const usdValue = value * price;
      // Format with more decimals for very small amounts
      const tokenDisplay = value < 0.01 
        ? `${value.toFixed(8)} ${symbol}` 
        : `${value.toFixed(2)} ${symbol}`;
      
      return {
        token: tokenDisplay,
        usd: formatUSDValue(usdValue)
      };
    }
    return `${value.toFixed(6)} ${symbol}`;
  };

  const getAPYColor = (apy: number, symbol: string) => {
    // Return color based on APY ranges
    if (symbol === 'USDC') return 'text-blue-400';
    if (symbol === 'SOL') return 'text-green-400';
    if (apy >= 8) return 'text-emerald-400';
    if (apy >= 5) return 'text-green-400';
    return 'text-blue-400';
  };

  if (loadingMarket) {
    return (
      <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
        <CardContent className="p-12">
          <div className="text-center">
            <div className="text-4xl mb-4">⏳</div>
            <p className="text-purple-200">Loading lending pools...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!jupiterLendData?.reserves || jupiterLendData.reserves.length === 0) {
    return (
      <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
        <CardContent className="p-12">
          <div className="text-center">
            <p className="text-purple-200">No lending pools available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
      <CardHeader className="hidden lg:block">
        <CardTitle className="flex items-center gap-2 text-white">
          💰 Lending Vaults
        </CardTitle>
        <CardDescription className="text-purple-200">
          Earn passive income by lending your assets - Powered by Jupiter Lend
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {/* Desktop Table View - lg and above */}
        <div className="hidden lg:block">
          <Table>
            <TableHeader>
              <TableRow className="border-purple-500/20 hover:bg-transparent">
                <TableHead className="text-purple-300 font-semibold">Vault</TableHead>
                <TableHead className="text-purple-300 font-semibold">APY</TableHead>
                <TableHead className="text-purple-300 font-semibold">Deposited</TableHead>
                <TableHead className="text-purple-300 font-semibold">Earnings</TableHead>
                <TableHead className="text-purple-300 font-semibold text-right">TVL</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jupiterLendData.reserves.map((reserve: any) => {
                const userPosition = userPositions?.deposits?.find(
                  (dep: any) => dep.asset === reserve.mint
                );
                const displaySymbol = reserve.symbol === 'WSOL' ? 'SOL' : reserve.symbol;
                const tvl = parseFloat(reserve.tvl);
                const tvlUSD = tvl * parseFloat(reserve.price || '0');
                
                // Debug logging
                if (userPosition && userPosition.earnings) {
                  console.log(`💰 ${displaySymbol} - Earnings: ${userPosition.earnings}, Amount: ${userPosition.amount}, Decimals: ${reserve.decimals}`);
                }

                return (
                  <TableRow
                    key={reserve.address}
                    className="border-purple-500/10 hover:bg-purple-900/20 cursor-pointer transition-colors"
                    onClick={() => onVaultClick(reserve)}
                    data-testid={`vault-${reserve.symbol}`}
                  >
                    {/* Vault Column */}
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        {reserve.logoUrl ? (
                          <img 
                            src={reserve.logoUrl} 
                            alt={displaySymbol}
                            className="w-8 h-8 rounded-full flex-shrink-0"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                              if (fallback) fallback.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${reserve.logoUrl ? 'hidden' : ''}`}>
                          {displaySymbol.substring(0, 1)}
                        </div>
                        <span className="text-white font-semibold">{displaySymbol}</span>
                      </div>
                    </TableCell>

                    {/* APY Column */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${reserve.depositAPY >= 8 ? 'bg-emerald-400' : reserve.depositAPY >= 5 ? 'bg-green-400' : 'bg-blue-400'}`}></div>
                        <span className={`font-semibold ${getAPYColor(reserve.depositAPY, displaySymbol)}`}>
                          {reserve.depositAPY.toFixed(2)}%
                        </span>
                      </div>
                    </TableCell>

                    {/* Deposited Column */}
                    <TableCell>
                      {(() => {
                        if (!userPosition) {
                          return (
                            <>
                              <div className="text-purple-300">0.00 {displaySymbol}</div>
                              <div className="text-purple-300 text-sm">$0.00</div>
                            </>
                          );
                        }
                        const formatted = formatAmount(userPosition.amount, reserve.decimals || 6, displaySymbol, true, parseFloat(reserve.price || '0')) as any;
                        return (
                          <>
                            <div className="text-white font-medium">{formatted.token}</div>
                            <div className="text-purple-300 text-sm">{formatted.usd}</div>
                          </>
                        );
                      })()}
                    </TableCell>

                    {/* Earnings Column */}
                    <TableCell>
                      {(() => {
                        if (!userPosition) {
                          return (
                            <>
                              <div className="text-purple-300">0.00 {displaySymbol}</div>
                              <div className="text-purple-300 text-sm">$0.00</div>
                            </>
                          );
                        }
                        const formatted = formatAmount(userPosition.earnings || '0', reserve.decimals || 6, displaySymbol, true, parseFloat(reserve.price || '0')) as any;
                        return (
                          <>
                            <div className="text-white font-medium">{formatted.token}</div>
                            <div className="text-purple-300 text-sm">{formatted.usd}</div>
                          </>
                        );
                      })()}
                    </TableCell>

                    {/* TVL Column */}
                    <TableCell className="text-right">
                      <div className="text-white font-semibold">{formatTVL(tvl, displaySymbol)}</div>
                      <div className="text-purple-300 text-sm">{formatUSDValue(tvlUSD)}</div>
                    </TableCell>

                    {/* Action Column */}
                    <TableCell>
                      <ChevronRight className="w-5 h-5 text-purple-400" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Card View - base to md */}
        <div className="lg:hidden space-y-0">
          {jupiterLendData.reserves.map((reserve: any) => {
            const userPosition = userPositions?.deposits?.find(
              (dep: any) => dep.asset === reserve.mint
            );
            const displaySymbol = reserve.symbol === 'WSOL' ? 'SOL' : reserve.symbol;
            const tvl = parseFloat(reserve.tvl);

            return (
              <div
                key={reserve.address}
                className="px-4 py-4 border-b border-purple-500/10 hover:bg-purple-900/20 transition-colors cursor-pointer"
                onClick={() => onVaultClick(reserve)}
                data-testid={`vault-mobile-${reserve.symbol}`}
              >
                {/* Top Row: Token, APY, TVL */}
                <div className="grid grid-cols-3 gap-3 mb-3">
                  {/* Token Column */}
                  <div className="flex items-center gap-2">
                    {reserve.logoUrl ? (
                      <img 
                        src={reserve.logoUrl} 
                        alt={displaySymbol}
                        className="w-8 h-8 rounded-full flex-shrink-0"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                          if (fallback) fallback.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div className={`w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${reserve.logoUrl ? 'hidden' : ''}`}>
                      {displaySymbol.substring(0, 1)}
                    </div>
                    <div className="text-white font-medium text-sm">{displaySymbol}</div>
                  </div>
                  
                  {/* APY Column */}
                  <div className="flex items-center justify-center">
                    <span className={`font-semibold text-sm ${getAPYColor(reserve.depositAPY, displaySymbol)}`}>
                      {reserve.depositAPY.toFixed(1)}%
                    </span>
                  </div>
                  
                  {/* TVL Column */}
                  <div className="flex items-center justify-end">
                    <div className="text-white font-medium text-sm">{formatTVL(tvl, displaySymbol)}</div>
                  </div>
                </div>
                
                {/* Bottom Row: Deposited, Earnings */}
                <div className="grid grid-cols-2 gap-3 pl-10">
                  {/* Deposited */}
                  <div>
                    <div className="text-xs text-purple-300 mb-0.5">Deposited</div>
                    {(() => {
                      if (!userPosition) {
                        return <div className="text-purple-300 text-sm">0.00 {displaySymbol}</div>;
                      }
                      const formatted = formatAmount(userPosition.amount, reserve.decimals || 6, displaySymbol, true, parseFloat(reserve.price || '0')) as any;
                      return (
                        <>
                          <div className="text-white text-sm font-medium">{formatted.token}</div>
                          <div className="text-purple-300 text-xs">{formatted.usd}</div>
                        </>
                      );
                    })()}
                  </div>
                  
                  {/* Earnings */}
                  <div>
                    <div className="text-xs text-purple-300 mb-0.5">Earnings</div>
                    {(() => {
                      if (!userPosition) {
                        return <div className="text-purple-300 text-sm">0.00 {displaySymbol}</div>;
                      }
                      const formatted = formatAmount(userPosition.earnings || '0', reserve.decimals || 6, displaySymbol, true, parseFloat(reserve.price || '0')) as any;
                      return (
                        <>
                          <div className="text-white text-sm font-medium">{formatted.token}</div>
                          <div className="text-purple-300 text-xs">{formatted.usd}</div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
