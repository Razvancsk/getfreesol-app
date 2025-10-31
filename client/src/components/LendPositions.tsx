import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronRight, RefreshCw, Clock } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { queryClient } from '@/lib/queryClient';

interface LendPositionsProps {
  publicKey: any;
  onVaultClick: (reserve: any) => Promise<void>;
  userPositions: any;
}

export function LendPositions({ publicKey, onVaultClick, userPositions }: LendPositionsProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Query for Jupiter Lend earn pools
  const { data: jupiterLendData, isLoading: loadingMarket } = useQuery<{ success: boolean; programId: string; reserves: any[] }>({
    queryKey: ['/api/jupiter-lend/earn-pools'],
    retry: false,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['/api/jupiter-lend/earn-pools'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/jupiter-lend/user-positions', publicKey?.toBase58()] }),
    ]);
    setIsRefreshing(false);
  };
  
  // Use only Jupiter reserves
  const allReserves = (jupiterLendData?.reserves || []).map((r: any) => ({ 
    ...r, 
    platform: 'Jupiter', 
    capabilities: { canDeposit: true, canWithdraw: true, comingSoon: false } 
  }));

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
      // Format with token-specific decimals for very small amounts
      const tokenDisplay = value < 0.01 
        ? `${value.toFixed(decimals)} ${symbol}` 
        : `${value.toFixed(2)} ${symbol}`;
      
      return {
        token: tokenDisplay,
        usd: usdValue < 0.01 ? `$${usdValue.toFixed(10)}` : formatUSDValue(usdValue)
      };
    }
    return `${value.toFixed(6)} ${symbol}`;
  };

  const getAPYColor = (apy: number, symbol: string) => {
    // Return green color based on APY ranges
    if (apy >= 8) return 'text-emerald-400';
    if (apy >= 5) return 'text-green-400';
    return 'text-green-400';
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

  if (allReserves.length === 0) {
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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-white">
              💰 Lending Vaults
            </CardTitle>
            <CardDescription className="text-purple-200">
              Earn passive income by lending your assets - Powered by Jupiter Lend & Kamino Finance
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing || loadingMarket}
            className="text-purple-300 hover:text-white hover:bg-purple-700/50"
            data-testid="button-refresh-earn"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Desktop Table View - lg and above */}
        <div className="hidden lg:block">
          <Table>
            <TableHeader>
              <TableRow className="border-purple-500/20 hover:bg-transparent">
                <TableHead className="text-purple-300 font-semibold">Vault</TableHead>
                <TableHead className="text-purple-300 font-semibold">Platform</TableHead>
                <TableHead className="text-purple-300 font-semibold">APY</TableHead>
                <TableHead className="text-purple-300 font-semibold">Deposited</TableHead>
                <TableHead className="text-purple-300 font-semibold">Earnings</TableHead>
                <TableHead className="text-purple-300 font-semibold text-right">TVL</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allReserves.map((reserve: any) => {
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
                    key={`${reserve.platform}-${reserve.address || reserve.mint}`}
                    className={`border-purple-500/10 transition-colors ${reserve.capabilities?.comingSoon ? 'opacity-75' : 'hover:bg-purple-900/20 cursor-pointer'}`}
                    onClick={() => !reserve.capabilities?.comingSoon && onVaultClick(reserve)}
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
                    
                    {/* Platform Column */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={reserve.platform === 'Jupiter' ? 'default' : 'secondary'} className={reserve.platform === 'Jupiter' ? 'bg-purple-600 text-white' : 'bg-orange-600 text-white'}>
                          {reserve.platform}
                        </Badge>
                        {reserve.capabilities?.comingSoon && (
                          <Badge variant="outline" className="border-yellow-500/50 text-yellow-300 gap-1">
                            <Clock className="w-3 h-3" />
                            Coming Soon
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* APY Column */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${reserve.depositAPY >= 8 ? 'bg-emerald-400' : reserve.depositAPY >= 5 ? 'bg-green-400' : 'bg-green-400'}`}></div>
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
          {/* Mobile Header */}
          <div className="grid grid-cols-3 gap-3 px-4 py-3 bg-purple-900/30 border-b border-purple-500/20">
            <div className="text-purple-300 font-semibold text-xs uppercase">Vault</div>
            <div className="text-purple-300 font-semibold text-xs uppercase text-center">APY</div>
            <div className="text-purple-300 font-semibold text-xs uppercase text-right">TVL</div>
          </div>
          
          {allReserves.map((reserve: any) => {
            const userPosition = userPositions?.deposits?.find(
              (dep: any) => dep.asset === reserve.mint
            );
            const displaySymbol = reserve.symbol === 'WSOL' ? 'SOL' : reserve.symbol;
            const tvl = parseFloat(reserve.tvl);

            return (
              <div
                key={`${reserve.platform}-${reserve.address || reserve.mint}`}
                className={`px-4 py-4 border-b border-purple-500/10 transition-colors ${reserve.capabilities?.comingSoon ? 'opacity-75' : 'hover:bg-purple-900/20 cursor-pointer'}`}
                onClick={() => !reserve.capabilities?.comingSoon && onVaultClick(reserve)}
                data-testid={`vault-mobile-${reserve.symbol}`}
              >
                {/* Top Row: Token, APY, TVL */}
                <div className="grid grid-cols-3 gap-3 mb-3">
                  {/* Token Column with Platform Badge */}
                  <div className="flex flex-col gap-1.5">
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
                    <div className="flex items-center gap-1.5 pl-10">
                      <Badge variant={reserve.platform === 'Jupiter' ? 'default' : 'secondary'} className={`text-xs ${reserve.platform === 'Jupiter' ? 'bg-purple-600 text-white' : 'bg-orange-600 text-white'}`}>
                        {reserve.platform}
                      </Badge>
                      {reserve.capabilities?.comingSoon && (
                        <Badge variant="outline" className="border-yellow-500/50 text-yellow-300 text-xs gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          Soon
                        </Badge>
                      )}
                    </div>
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
