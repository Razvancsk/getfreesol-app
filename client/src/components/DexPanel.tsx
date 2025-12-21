import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, Flame, Clock, BarChart3, ExternalLink, ArrowRightLeft, Droplets, Activity } from 'lucide-react';

interface TokenData {
  address: string;
  symbol: string;
  name: string;
  logoURI?: string;
  decimals: number;
  daily_volume?: number;
  price?: number;
  market_cap?: number;
  liquidity?: number;
  num_transactions?: number;
  price_change?: number;
  price_change_24h?: number;
  created_at?: string;
  organic_score?: number;
}

interface TokenListResponse {
  tokens: TokenData[];
}

const formatNumber = (num: number | undefined) => {
  if (num === undefined || num === null) return '-';
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
};

const formatPrice = (price: number | undefined) => {
  if (!price) return '-';
  if (price < 0.000001) return `$${price.toExponential(2)}`;
  if (price < 0.01) return `$${price.toFixed(6)}`;
  if (price < 1) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(2)}`;
};

const formatAge = (createdAt: string | undefined) => {
  if (!createdAt) return '-';
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSecs < 60) return `${diffSecs}s`;
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 30) return `${diffDays}d`;
  return `${Math.floor(diffDays / 30)}mo`;
};

const formatPriceChange = (change: number | undefined) => {
  if (change === undefined || change === null) return null;
  const isPositive = change >= 0;
  return {
    text: `${isPositive ? '+' : ''}${change.toFixed(2)}%`,
    color: isPositive ? 'text-green-400' : 'text-red-400'
  };
};

const formatTransactions = (num: number | undefined) => {
  if (num === undefined || num === null) return '-';
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toString();
};

function TokenCard({ token, onSwap }: { token: TokenData; onSwap: (token: TokenData) => void }) {
  const priceChange = formatPriceChange(token.price_change ?? token.price_change_24h);
  const age = formatAge(token.created_at);
  
  return (
    <div className="bg-slate-800/60 rounded-xl p-4 hover:bg-slate-700/60 transition-colors border border-slate-700/50">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0">
            {token.logoURI ? (
              <img src={token.logoURI} alt={token.symbol} className="w-12 h-12 rounded-full" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            ) : (
              <span className="text-lg font-bold text-slate-400">{token.symbol?.charAt(0)}</span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-lg">{token.symbol}</span>
              <a 
                href={`https://solscan.io/token/${token.address}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-slate-400 hover:text-white"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400 truncate max-w-[120px]">{token.name}</span>
              {age !== '-' && (
                <span className="text-xs text-purple-400 font-medium">{age}</span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-white">{formatPrice(token.price)}</div>
          {priceChange && (
            <div className={`text-sm font-medium ${priceChange.color}`}>{priceChange.text}</div>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-slate-900/50 rounded-lg p-2">
          <div className="flex items-center gap-1 text-slate-400 text-xs mb-1">
            <TrendingUp className="h-3 w-3" />
            Market Cap
          </div>
          <div className="text-white font-semibold text-sm">{formatNumber(token.market_cap)}</div>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-2">
          <div className="flex items-center gap-1 text-slate-400 text-xs mb-1">
            <BarChart3 className="h-3 w-3" />
            Volume
          </div>
          <div className="text-white font-semibold text-sm">{formatNumber(token.daily_volume)}</div>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-2">
          <div className="flex items-center gap-1 text-slate-400 text-xs mb-1">
            <Droplets className="h-3 w-3" />
            Liquidity
          </div>
          <div className="text-white font-semibold text-sm">{formatNumber(token.liquidity)}</div>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-2">
          <div className="flex items-center gap-1 text-slate-400 text-xs mb-1">
            <Activity className="h-3 w-3" />
            Transactions
          </div>
          <div className="text-white font-semibold text-sm">{formatTransactions(token.num_transactions)}</div>
        </div>
      </div>
      
      <Button
        size="sm"
        className="w-full bg-purple-600 hover:bg-purple-700 text-white"
        onClick={() => onSwap(token)}
        data-testid={`button-swap-token-${token.address}`}
      >
        <ArrowRightLeft className="h-4 w-4 mr-2" />
        Swap on Jupiter
      </Button>
    </div>
  );
}

function TokenListSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <Skeleton className="w-12 h-12 rounded-full" />
              <div>
                <Skeleton className="w-20 h-5 mb-1" />
                <Skeleton className="w-28 h-4" />
              </div>
            </div>
            <div>
              <Skeleton className="w-16 h-5 mb-1" />
              <Skeleton className="w-12 h-4" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            {[...Array(4)].map((_, j) => (
              <Skeleton key={j} className="h-14 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-9 w-full rounded" />
        </div>
      ))}
    </div>
  );
}

export function DexPanel() {
  const [interval, setInterval] = useState<'5m' | '1h' | '6h' | '24h'>('1h');
  const [activeTab, setActiveTab] = useState<'trending' | 'top' | 'recent'>('trending');

  const { data: trendingData, isLoading: trendingLoading } = useQuery<TokenListResponse>({
    queryKey: ['/api/tokens/category', 'toptrending', interval],
    queryFn: async () => {
      const res = await fetch(`/api/tokens/category/toptrending/${interval}?limit=50`);
      if (!res.ok) throw new Error('Failed to fetch tokens');
      return res.json();
    },
    enabled: activeTab === 'trending',
    refetchInterval: 30000,
  });

  const { data: topData, isLoading: topLoading } = useQuery<TokenListResponse>({
    queryKey: ['/api/tokens/category', 'toptraded', interval],
    queryFn: async () => {
      const res = await fetch(`/api/tokens/category/toptraded/${interval}?limit=50`);
      if (!res.ok) throw new Error('Failed to fetch tokens');
      return res.json();
    },
    enabled: activeTab === 'top',
    refetchInterval: 30000,
  });

  const { data: recentData, isLoading: recentLoading } = useQuery<TokenListResponse>({
    queryKey: ['/api/tokens/recent'],
    queryFn: async () => {
      const res = await fetch('/api/tokens/recent');
      if (!res.ok) throw new Error('Failed to fetch tokens');
      return res.json();
    },
    enabled: activeTab === 'recent',
    refetchInterval: 10000, // Refresh every 10 seconds for live updates
    staleTime: 5000, // Consider data stale after 5 seconds
  });

  const handleSwap = (token: TokenData) => {
    const solMint = 'So11111111111111111111111111111111111111112';
    window.open(`https://jup.ag/swap/${solMint}-${token.address}`, '_blank');
  };

  return (
    <Card className="bg-slate-900/80 border-slate-700">
      <CardContent className="p-4">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'trending' | 'top' | 'recent')}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <TabsList className="bg-slate-800 w-fit">
              <TabsTrigger value="trending" className="data-[state=active]:bg-purple-600">
                <Flame className="h-4 w-4 mr-2 text-orange-400" />
                Trending
              </TabsTrigger>
              <TabsTrigger value="top" className="data-[state=active]:bg-purple-600">
                <BarChart3 className="h-4 w-4 mr-2 text-green-400" />
                Top
              </TabsTrigger>
              <TabsTrigger value="recent" className="data-[state=active]:bg-purple-600">
                <Clock className="h-4 w-4 mr-2" />
                New
              </TabsTrigger>
            </TabsList>
            
            {(activeTab === 'trending' || activeTab === 'top') && (
              <Select value={interval} onValueChange={(v) => setInterval(v as typeof interval)}>
                <SelectTrigger className="w-[80px] bg-slate-800 border-slate-600" data-testid="select-interval">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5m">5m</SelectItem>
                  <SelectItem value="1h">1h</SelectItem>
                  <SelectItem value="6h">6h</SelectItem>
                  <SelectItem value="24h">24h</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          <TabsContent value="trending" className="mt-0">
            <div className="max-h-[600px] overflow-y-auto pr-1">
              {trendingLoading ? (
                <TokenListSkeleton />
              ) : trendingData?.tokens?.length ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {trendingData.tokens.map((token) => (
                    <TokenCard key={token.address} token={token} onSwap={handleSwap} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400">
                  No trending tokens found
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="top" className="mt-0">
            <div className="max-h-[600px] overflow-y-auto pr-1">
              {topLoading ? (
                <TokenListSkeleton />
              ) : topData?.tokens?.length ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {topData.tokens.map((token) => (
                    <TokenCard key={token.address} token={token} onSwap={handleSwap} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400">
                  No top traded tokens found
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="recent" className="mt-0">
            <div className="mb-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <p className="text-yellow-300 text-sm flex items-center gap-2">
                <Clock className="h-4 w-4" />
                New tokens with recently created pools. High risk - DYOR!
              </p>
            </div>
            <div className="max-h-[550px] overflow-y-auto pr-1">
              {recentLoading ? (
                <TokenListSkeleton />
              ) : recentData?.tokens?.length ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {recentData.tokens.map((token) => (
                    <TokenCard key={token.address} token={token} onSwap={handleSwap} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400">
                  No recent tokens found
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
