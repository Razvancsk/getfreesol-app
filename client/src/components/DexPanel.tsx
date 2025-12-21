import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, Flame, Clock, BarChart3, ExternalLink, ArrowRightLeft } from 'lucide-react';

interface TokenData {
  address: string;
  symbol: string;
  name: string;
  logoURI?: string;
  decimals: number;
  daily_volume?: number;
  price?: number;
  market_cap?: number;
  created_at?: string;
  organic_score?: number;
}

interface TokenListResponse {
  tokens: TokenData[];
}

const formatNumber = (num: number | undefined) => {
  if (!num) return '-';
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
};

const formatPrice = (price: number | undefined) => {
  if (!price) return '-';
  if (price < 0.00001) return `$${price.toExponential(2)}`;
  if (price < 1) return `$${price.toFixed(6)}`;
  return `$${price.toFixed(2)}`;
};

function TokenRow({ token, index, onSwap }: { token: TokenData; index: number; onSwap: (token: TokenData) => void }) {
  return (
    <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg hover:bg-slate-700/50 transition-colors group">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className="text-slate-500 font-mono w-6 text-sm">{index + 1}</span>
        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0">
          {token.logoURI ? (
            <img src={token.logoURI} alt={token.symbol} className="w-8 h-8 rounded-full" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          ) : (
            <span className="text-xs font-bold text-slate-400">{token.symbol?.charAt(0)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white truncate">{token.symbol}</span>
            <a 
              href={`https://solscan.io/token/${token.address}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <ExternalLink className="h-3 w-3 text-slate-400 hover:text-white" />
            </a>
          </div>
          <span className="text-xs text-slate-400 truncate block">{token.name}</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right hidden sm:block">
          <div className="text-sm font-medium text-white">{formatPrice(token.price)}</div>
          <div className="text-xs text-slate-400">Vol: {formatNumber(token.daily_volume)}</div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-purple-500/50 hover:bg-purple-500/20 text-purple-300"
          onClick={() => onSwap(token)}
          data-testid={`button-swap-token-${token.address}`}
        >
          <ArrowRightLeft className="h-3 w-3 mr-1" />
          Swap
        </Button>
      </div>
    </div>
  );
}

function TokenListSkeleton() {
  return (
    <div className="space-y-2">
      {[...Array(10)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
          <Skeleton className="w-6 h-4" />
          <Skeleton className="w-8 h-8 rounded-full" />
          <div className="flex-1">
            <Skeleton className="w-20 h-4 mb-1" />
            <Skeleton className="w-32 h-3" />
          </div>
          <Skeleton className="w-16 h-8" />
        </div>
      ))}
    </div>
  );
}

export function DexPanel() {
  const [interval, setInterval] = useState<'5m' | '1h' | '6h' | '24h'>('1h');
  const [activeTab, setActiveTab] = useState<'trending' | 'top' | 'recent'>('trending');

  // Trending tokens (toptrending category)
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

  // Top traded tokens (toptraded category)
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

  // Recent tokens (newly created pools)
  const { data: recentData, isLoading: recentLoading } = useQuery<TokenListResponse>({
    queryKey: ['/api/tokens/recent'],
    queryFn: async () => {
      const res = await fetch('/api/tokens/recent');
      if (!res.ok) throw new Error('Failed to fetch tokens');
      return res.json();
    },
    enabled: activeTab === 'recent',
    refetchInterval: 60000,
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
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {trendingLoading ? (
                <TokenListSkeleton />
              ) : trendingData?.tokens?.length ? (
                trendingData.tokens.map((token, index) => (
                  <TokenRow key={token.address} token={token} index={index} onSwap={handleSwap} />
                ))
              ) : (
                <div className="text-center py-8 text-slate-400">
                  No trending tokens found
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="top" className="mt-0">
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {topLoading ? (
                <TokenListSkeleton />
              ) : topData?.tokens?.length ? (
                topData.tokens.map((token, index) => (
                  <TokenRow key={token.address} token={token} index={index} onSwap={handleSwap} />
                ))
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
            <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
              {recentLoading ? (
                <TokenListSkeleton />
              ) : recentData?.tokens?.length ? (
                recentData.tokens.map((token, index) => (
                  <TokenRow key={token.address} token={token} index={index} onSwap={handleSwap} />
                ))
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
