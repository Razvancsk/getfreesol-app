import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, Flame, Clock, BarChart3, ExternalLink, Droplets, Activity, RefreshCw } from 'lucide-react';

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

const formatAge = (createdAt: string | undefined, now: Date) => {
  if (!createdAt) return '-';
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

function useLiveNow(intervalMs: number = 1000) {
  const [now, setNow] = useState(() => new Date());
  
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  
  return now;
}

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

function TokenCard({ token, isRecent, now }: { token: TokenData; isRecent?: boolean; now: Date }) {
  const priceChange = formatPriceChange(token.price_change ?? token.price_change_24h);
  const age = useMemo(() => formatAge(token.created_at, now), [token.created_at, now]);
  
  const handleClick = () => {
    window.open(`https://jup.ag/swap/SOL-${token.address}`, '_blank');
  };
  
  return (
    <div 
      onClick={handleClick}
      className="bg-[#2a1f4e]/60 backdrop-blur-sm rounded-xl p-4 hover:bg-[#3a2f5e]/70 transition-all border border-purple-400/40 cursor-pointer"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#1a1035] border border-purple-400/30 flex items-center justify-center overflow-hidden flex-shrink-0">
            {token.logoURI ? (
              <img src={token.logoURI} alt={token.symbol} className="w-10 h-10 rounded-full" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            ) : (
              <span className="text-sm font-bold text-purple-300">{token.symbol?.charAt(0)}</span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1">
              <span className="font-bold text-white">{token.symbol}</span>
              <a 
                href={`https://solscan.io/token/${token.address}`} 
                target="_blank" 
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-purple-400 hover:text-white"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-purple-300/70 truncate max-w-[80px]">{token.name}</span>
              {age !== '-' && (
                <span className="text-xs text-purple-400 font-medium">{age}</span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-bold text-white">{formatPrice(token.price)}</div>
          {priceChange && (
            <div className={`text-sm font-medium ${priceChange.color}`}>{priceChange.text}</div>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <div className="text-purple-300/60 text-xs flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Market Cap
          </div>
          <div className="text-white font-medium">{formatNumber(token.market_cap)}</div>
        </div>
        <div>
          <div className="text-purple-300/60 text-xs flex items-center gap-1">
            <BarChart3 className="h-3 w-3" />
            Volume 24h
          </div>
          <div className="text-white font-medium">{formatNumber(token.daily_volume)}</div>
        </div>
        <div>
          <div className="text-purple-300/60 text-xs flex items-center gap-1">
            <Droplets className="h-3 w-3" />
            Liquidity
          </div>
          <div className="text-white font-medium">{formatNumber(token.liquidity)}</div>
        </div>
        <div>
          <div className="text-purple-300/60 text-xs flex items-center gap-1">
            <Activity className="h-3 w-3" />
            Transactions
          </div>
          <div className="text-white font-medium">{formatTransactions(token.num_transactions)}</div>
        </div>
      </div>
      
      {isRecent && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-purple-500/10">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30">NEW</span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">UNKNOWN</span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">TRADABLE</span>
        </div>
      )}
    </div>
  );
}

function TokenListSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="bg-[#2a1f4e]/60 rounded-xl p-4 border border-purple-400/40">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-full" />
              <div>
                <Skeleton className="w-16 h-4 mb-1" />
                <Skeleton className="w-20 h-3" />
              </div>
            </div>
            <div>
              <Skeleton className="w-16 h-4 mb-1" />
              <Skeleton className="w-12 h-3" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[...Array(4)].map((_, j) => (
              <div key={j}>
                <Skeleton className="w-16 h-3 mb-1" />
                <Skeleton className="w-12 h-4" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DexPanel() {
  const [interval, setInterval] = useState<'5m' | '1h' | '6h' | '24h'>('1h');
  const [activeTab, setActiveTab] = useState<'trending' | 'top' | 'recent'>('trending');
  const now = useLiveNow(1000); // Update every second for live age

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

  const { data: recentData, isLoading: recentLoading, refetch: refetchRecent } = useQuery<TokenListResponse>({
    queryKey: ['/api/tokens/recent'],
    queryFn: async () => {
      const res = await fetch('/api/tokens/recent', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!res.ok) throw new Error('Failed to fetch tokens');
      return res.json();
    },
    enabled: activeTab === 'recent',
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });

  const getTokenCount = () => {
    if (activeTab === 'trending') return trendingData?.tokens?.length || 0;
    if (activeTab === 'top') return topData?.tokens?.length || 0;
    return recentData?.tokens?.length || 0;
  };

  return (
    <div>
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'trending' | 'top' | 'recent')}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <TabsList className="bg-[#2a1f4e]/60 border border-purple-400/40 w-fit">
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
          
          <div className="flex items-center gap-2">
            {activeTab === 'recent' && (
              <Button
                size="sm"
                variant="outline"
                className="border-purple-400/40 hover:bg-purple-500/20 text-purple-300 bg-[#2a1f4e]/60"
                onClick={() => refetchRecent()}
                disabled={recentLoading}
                data-testid="button-refresh-recent"
              >
                <RefreshCw className={`h-4 w-4 ${recentLoading ? 'animate-spin' : ''}`} />
              </Button>
            )}
            {(activeTab === 'trending' || activeTab === 'top') && (
              <Select value={interval} onValueChange={(v) => setInterval(v as typeof interval)}>
                <SelectTrigger className="w-[80px] bg-[#2a1f4e]/60 border-purple-400/40" data-testid="select-interval">
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
        </div>

        <p className="text-purple-300/60 text-sm mb-4">
          Showing {getTokenCount()} {activeTab === 'trending' ? 'trending' : activeTab === 'top' ? 'top traded' : 'new'} tokens
        </p>

        <TabsContent value="trending" className="mt-0">
          <div className="max-h-[600px] overflow-y-auto pr-1">
            {trendingLoading ? (
              <TokenListSkeleton />
            ) : trendingData?.tokens?.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {trendingData.tokens.map((token) => (
                  <TokenCard key={token.address} token={token} now={now} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-purple-300/60">
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {topData.tokens.map((token) => (
                  <TokenCard key={token.address} token={token} now={now} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-purple-300/60">
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recentData.tokens.map((token) => (
                  <TokenCard key={token.address} token={token} now={now} isRecent />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-purple-300/60">
                No recent tokens found
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
