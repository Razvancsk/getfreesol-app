import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { VersionedTransaction } from '@solana/web3.js';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, Flame, Clock, BarChart3, ExternalLink, Droplets, Activity, RefreshCw, Loader2, Zap, ChevronDown, Search, X, ArrowDownUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const SOL_LOGO = 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png';

interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

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

function DexTokenSelector({ 
  token, 
  onSelect, 
  balances,
  ownedTokens
}: { 
  token: TokenInfo; 
  onSelect: (token: TokenInfo) => void; 
  balances: Record<string, number>;
  ownedTokens: TokenInfo[];
}) {
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: searchData, isLoading: isSearching } = useQuery({
    queryKey: ['jupiter-search-dex', searchQuery.trim()],
    queryFn: async () => {
      const query = searchQuery.trim();
      const response = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(query)}`);
      const data = await response.json();
      
      const tokens = Array.isArray(data) ? data.map((t: any) => ({
        address: t.id,
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        logoURI: t.icon
      })) : [];
      
      return { tokens };
    },
    enabled: showSearchModal && searchQuery.trim().length > 0,
  });

  const getTokenList = () => {
    if (searchQuery.trim().length > 0 && searchData?.tokens) {
      return searchData.tokens;
    }
    return ownedTokens || [];
  };

  const tokenList = getTokenList();

  return (
    <>
      <button
        onClick={() => setShowSearchModal(true)}
        className="flex items-center gap-2 bg-purple-900/60 hover:bg-purple-800/60 border border-purple-500/40 rounded-lg px-3 py-2 transition-colors"
        data-testid="button-dex-token-selector"
      >
        {token.logoURI && <img src={token.logoURI} alt={token.symbol} className="w-5 h-5 rounded-full" />}
        <span className="text-white font-medium">{token.symbol}</span>
        <ChevronDown className="w-4 h-4 text-purple-300" />
      </button>

      {showSearchModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowSearchModal(false)} />
          <div className="relative bg-gradient-to-br from-purple-900 via-purple-800 to-purple-900 w-full max-w-md mx-4 rounded-xl border border-purple-500/40 shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-purple-500/30">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold text-lg">Search Tokens</h3>
                <button onClick={() => setShowSearchModal(false)} className="text-purple-200 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-300" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tokens"
                  className="w-full bg-purple-800/50 border border-purple-500/30 rounded-lg py-3 pl-10 pr-4 text-white placeholder-purple-300/60 outline-none focus:border-purple-400"
                  autoFocus
                  data-testid="input-dex-token-search"
                />
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto p-2">
              {isSearching ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-300" />
                </div>
              ) : tokenList.length === 0 ? (
                <div className="text-center py-8 text-purple-300/60">
                  {searchQuery ? 'No tokens found' : 'Your holdings will appear here'}
                </div>
              ) : (
                tokenList.map((t: TokenInfo) => (
                  <button
                    key={t.address}
                    onClick={() => {
                      onSelect(t);
                      setShowSearchModal(false);
                      setSearchQuery('');
                    }}
                    className="w-full flex items-center justify-between p-3 hover:bg-purple-800/40 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {t.logoURI ? (
                        <img src={t.logoURI} alt={t.symbol} className="w-10 h-10 rounded-full bg-purple-900" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-purple-700 flex items-center justify-center text-white font-bold">
                          {t.symbol?.charAt(0)}
                        </div>
                      )}
                      <div className="text-left">
                        <p className="text-white font-medium">{t.symbol}</p>
                        <p className="text-purple-300/60 text-sm">{t.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {balances[t.address] !== undefined && (
                        <>
                          <p className="text-white font-medium">{balances[t.address].toFixed(4)}</p>
                          <p className="text-purple-300/60 text-xs truncate max-w-[100px]">
                            {t.address.slice(0, 6)}...{t.address.slice(-6)}
                          </p>
                        </>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function TokenCard({ token, isRecent, now, onSwap, isSwapping }: { 
  token: TokenData; 
  isRecent?: boolean; 
  now: Date;
  onSwap?: (token: TokenData) => void;
  isSwapping?: boolean;
}) {
  const priceChange = formatPriceChange(token.price_change ?? token.price_change_24h);
  const age = useMemo(() => formatAge(token.created_at, now), [token.created_at, now]);
  
  const handleClick = () => {
    if (onSwap) {
      onSwap(token);
    } else {
      window.open(`https://jup.ag/swap/SOL-${token.address}`, '_blank');
    }
  };
  
  return (
    <div 
      onClick={handleClick}
      className={`bg-[#2a1f4e]/60 backdrop-blur-sm rounded-2xl p-6 hover:bg-[#3a2f5e]/70 transition-all border border-purple-400/40 cursor-pointer ${isSwapping ? 'opacity-50 pointer-events-none' : ''}`}
    >
      {/* Header with logo, name, price */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[#1a1035] border-2 border-purple-400/40 flex items-center justify-center overflow-hidden flex-shrink-0">
            {token.logoURI ? (
              <img src={token.logoURI} alt={token.symbol} className="w-16 h-16 rounded-full" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            ) : (
              <span className="text-2xl font-bold text-purple-300">{token.symbol?.charAt(0)}</span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-xl">{token.symbol}</span>
              <a 
                href={`https://solscan.io/token/${token.address}`} 
                target="_blank" 
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-blue-400 hover:text-white"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
            <div className="text-sm text-purple-300/70">{token.name}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-bold text-white text-2xl">{formatPrice(token.price)}</div>
          {priceChange && (
            <div className={`text-base font-medium ${priceChange.color}`}>{priceChange.text}</div>
          )}
        </div>
      </div>
      
      {/* Stats - 2x2 grid like reference */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-purple-300/70 text-sm flex items-center gap-2 mb-1">
            <span className="text-yellow-500">💰</span>
            Market Cap
          </div>
          <div className="text-white font-bold text-lg">{formatNumber(token.market_cap)}</div>
        </div>
        <div>
          <div className="text-purple-300/70 text-sm flex items-center gap-2 mb-1">
            <BarChart3 className="h-4 w-4 text-purple-400" />
            Volume 24h
          </div>
          <div className="text-white font-bold text-lg">{formatNumber(token.daily_volume)}</div>
        </div>
        <div>
          <div className="text-purple-300/70 text-sm flex items-center gap-2 mb-1">
            <Droplets className="h-4 w-4 text-blue-400" />
            Liquidity
          </div>
          <div className="text-white font-bold text-lg">{formatNumber(token.liquidity)}</div>
        </div>
        <div>
          <div className="text-purple-300/70 text-sm flex items-center gap-2 mb-1">
            <Activity className="h-4 w-4 text-green-400" />
            Transactions
          </div>
          <div className="text-white font-bold text-lg">{formatTransactions(token.num_transactions)}</div>
        </div>
      </div>
      
      {isRecent && (
        <div className="flex items-center gap-3 mt-5 pt-5 border-t border-purple-500/10">
          <span className="text-xs font-semibold px-3 py-1 rounded bg-green-500/20 text-green-400 border border-green-500/30">NEW</span>
          <span className="text-xs font-semibold px-3 py-1 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">UNKNOWN</span>
          <span className="text-xs font-semibold px-3 py-1 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">TRADABLE</span>
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
  const [solAmount, setSolAmount] = useState<string>('0.1');
  const [isSwapping, setIsSwapping] = useState(false);
  const [swappingToken, setSwappingToken] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<TokenData | null>(null);
  const [swapMode, setSwapMode] = useState<'buy' | 'sell'>('buy');
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [ownedTokens, setOwnedTokens] = useState<TokenInfo[]>([]);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [quoteAmount, setQuoteAmount] = useState<string>('0.00');
  const [isQuoting, setIsQuoting] = useState(false);
  const [inputToken, setInputToken] = useState<TokenInfo>({
    address: SOL_MINT,
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
    logoURI: SOL_LOGO
  });
  const now = useLiveNow(1000); // Update every second for live age
  
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { toast } = useToast();

  useEffect(() => {
    if (!publicKey) return;
    fetchBalances();
  }, [publicKey]);

  const fetchBalances = async () => {
    if (!publicKey) return;
    
    setIsLoadingBalances(true);
    const newBalances: Record<string, number> = {};
    const tokensWithMetadata: TokenInfo[] = [];
    
    try {
      const holdingsResponse = await fetch(`/api/wallet/all-tokens?address=${publicKey.toString()}`);
      
      if (!holdingsResponse.ok) {
        throw new Error('Failed to fetch holdings');
      }
      
      const holdingsData = await holdingsResponse.json();
      
      if (holdingsData.success && holdingsData.tokens) {
        for (const token of holdingsData.tokens) {
          newBalances[token.address] = token.balance;
          tokensWithMetadata.push({
            address: token.address,
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            logoURI: token.logoURI
          });
        }
      }
      
      setOwnedTokens(tokensWithMetadata);
    } catch (error: any) {
      console.error('Error fetching holdings:', error?.message || error);
    }
    
    setBalances(newBalances);
    setIsLoadingBalances(false);
  };

  const handleSelectToken = (token: TokenData) => {
    setSelectedToken(token);
    setQuoteAmount('0.00');
  };

  const handleSelectInputToken = (token: TokenInfo) => {
    setInputToken(token);
    setQuoteAmount('0.00');
  };

  // Fetch quote when amount or tokens change
  useEffect(() => {
    const fetchQuote = async () => {
      if (!selectedToken || !solAmount || solAmount === '0' || solAmount === '') {
        setQuoteAmount('0.00');
        return;
      }

      const amount = parseFloat(solAmount);
      if (isNaN(amount) || amount <= 0) {
        setQuoteAmount('0.00');
        return;
      }

      setIsQuoting(true);
      try {
        const inputAmount = Math.floor(amount * Math.pow(10, inputToken.decimals || 9));
        const quoteUrl = `https://api.jup.ag/quote/v1?inputMint=${inputToken.address}&outputMint=${selectedToken.address}&amount=${inputAmount}&slippageBps=300`;
        
        const response = await fetch(quoteUrl);
        if (response.ok) {
          const data = await response.json();
          if (data.outAmount) {
            const outAmount = parseFloat(data.outAmount) / Math.pow(10, selectedToken.decimals || 6);
            setQuoteAmount(outAmount.toFixed(6));
          }
        }
      } catch (error) {
        console.error('Quote error:', error);
      } finally {
        setIsQuoting(false);
      }
    };

    const debounce = setTimeout(fetchQuote, 500);
    return () => clearTimeout(debounce);
  }, [solAmount, inputToken.address, selectedToken?.address]);

  const setAmountPercent = (percent: number) => {
    if (percent === 100) {
      setSolAmount('MAX');
    } else {
      const baseAmount = 1; // 1 SOL base
      setSolAmount((baseAmount * percent / 100).toString());
    }
  };

  const executeSwap = async () => {
    if (!selectedToken) return;
    
    if (!publicKey || !signTransaction) {
      toast({
        title: 'Wallet Not Connected',
        description: 'Please connect your wallet to swap tokens',
        variant: 'destructive',
      });
      return;
    }

    const amount = solAmount === 'MAX' ? 1 : parseFloat(solAmount) || 0.1;
    if (amount <= 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid amount',
        variant: 'destructive',
      });
      return;
    }

    setIsSwapping(true);
    setSwappingToken(selectedToken.address);
    const token = selectedToken;

    try {
      const inputAmount = Math.floor(amount * 1e9);
      
      const orderUrl = `/api/jupiter/ultra/order?inputMint=${inputToken.address}&outputMint=${token.address}&amount=${inputAmount}&taker=${publicKey.toString()}`;
      console.log('Fetching swap quote:', orderUrl);
      
      const response = await fetch(orderUrl);
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorMsg = 'Unable to get swap quote';
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.includes?.('Failed to get quotes')) {
            errorMsg = 'No swap route available. Try a different token.';
          } else {
            errorMsg = errorData.error || errorMsg;
          }
        } catch {
          errorMsg = errorText || response.statusText;
        }
        throw new Error(errorMsg);
      }
      
      const quote = await response.json();
      
      if (!quote || !quote.outAmount) {
        throw new Error('No swap route available');
      }
      
      if (!quote.transaction || !quote.requestId) {
        throw new Error('Invalid order: missing transaction');
      }

      console.log('Signing swap transaction...');
      
      const transactionBuf = Buffer.from(quote.transaction, 'base64');
      const transaction = VersionedTransaction.deserialize(transactionBuf);
      const signedTransaction = await signTransaction(transaction);
      const signedBase64 = Buffer.from(signedTransaction.serialize()).toString('base64');

      console.log('Executing swap...');
      
      const executeResponse = await fetch('/api/jupiter/ultra/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signedTransaction: signedBase64,
          requestId: quote.requestId
        })
      });

      if (!executeResponse.ok) {
        let errorMessage = 'Failed to execute swap';
        try {
          const errorData = await executeResponse.json();
          errorMessage = errorData.error || errorData.details || errorMessage;
        } catch {
          errorMessage = await executeResponse.text();
        }
        throw new Error(errorMessage);
      }

      const executeData = await executeResponse.json();
      
      if (executeData.status === "Success") {
        const signature = executeData.signature;
        const outAmount = parseFloat(quote.outAmount) / Math.pow(10, token.decimals || 9);
        
        toast({
          title: 'Swap Successful!',
          description: (
            <div className="space-y-1">
              <p>Bought {outAmount.toFixed(4)} {token.symbol} for {solAmount} SOL</p>
              <a 
                href={`https://solscan.io/tx/${signature}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-white hover:text-green-100 underline"
              >
                View Transaction
              </a>
            </div>
          ),
          className: 'bg-green-600 text-white border-green-500',
        });
      } else {
        throw new Error(executeData.error || 'Swap failed on-chain');
      }
    } catch (error: any) {
      console.error('Swap error:', error);
      toast({
        title: 'Swap Failed',
        description: error.message || 'Failed to complete swap',
        variant: 'destructive',
      });
    } finally {
      setIsSwapping(false);
      setSwappingToken(null);
    }
  };

  const { data: trendingData, isLoading: trendingLoading } = useQuery<TokenListResponse>({
    queryKey: ['/api/tokens/category', 'toptrending', interval],
    queryFn: async () => {
      const res = await fetch(`/api/tokens/category/toptrending/${interval}?limit=100`);
      if (!res.ok) throw new Error('Failed to fetch tokens');
      return res.json();
    },
    enabled: activeTab === 'trending',
    refetchInterval: 30000,
  });

  const { data: topData, isLoading: topLoading } = useQuery<TokenListResponse>({
    queryKey: ['/api/tokens/category', 'toptraded', interval],
    queryFn: async () => {
      const res = await fetch(`/api/tokens/category/toptraded/${interval}?limit=100`);
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
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  // Search query for tokens
  const { data: searchData, isLoading: searchLoading } = useQuery<{ tokens: TokenData[] }>({
    queryKey: ['token-search', searchQuery],
    queryFn: async () => {
      const response = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      const tokens = Array.isArray(data) ? data.map((t: any) => ({
        address: t.id,
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        logoURI: t.icon,
        price: 0,
        price_change_24h: 0,
        market_cap: 0,
        daily_volume: 0,
        liquidity: 0,
        num_transactions: 0,
      })) : [];
      return { tokens };
    },
    enabled: searchQuery.trim().length > 1,
  });

  const getTokenCount = () => {
    if (activeTab === 'trending') return trendingData?.tokens?.length || 0;
    if (activeTab === 'top') return topData?.tokens?.length || 0;
    return recentData?.tokens?.length || 0;
  };

  return (
    <div>
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'trending' | 'top' | 'recent')} className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
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
          </div>
          
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

        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-300" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tokens by name or address..."
            className="w-full bg-[#2a1f4e]/60 border border-purple-400/40 rounded-lg py-3 pl-11 pr-4 text-white placeholder-purple-300/60 outline-none focus:border-purple-400"
            data-testid="input-token-search"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-300 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Search Results */}
        {searchQuery.trim().length > 1 && (
          <div className="mb-4">
            <p className="text-purple-300/60 text-sm mb-2">
              {searchLoading ? 'Searching...' : `Found ${searchData?.tokens?.length || 0} tokens`}
            </p>
            {searchLoading ? (
              <TokenListSkeleton />
            ) : searchData?.tokens?.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {searchData.tokens.map((token) => (
                  <TokenCard key={token.address} token={token} now={now} onSwap={handleSelectToken} isSwapping={swappingToken === token.address} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-purple-300/60">
                No tokens found for "{searchQuery}"
              </div>
            )}
          </div>
        )}

        {/* Only show tabs content when not searching */}
        {searchQuery.trim().length <= 1 && (
          <>
            {activeTab !== 'recent' && (
              <p className="text-purple-300/60 text-sm mb-2">
                Showing {getTokenCount()} {activeTab === 'trending' ? 'trending' : 'top traded'} tokens
              </p>
            )}

            <TabsContent value="trending" className="mt-0 w-full">
          <div>
            {trendingLoading ? (
              <TokenListSkeleton />
            ) : trendingData?.tokens?.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {trendingData.tokens.map((token) => (
                  <TokenCard key={token.address} token={token} now={now} onSwap={handleSelectToken} isSwapping={swappingToken === token.address} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-purple-300/60">
                No trending tokens found
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="top" className="mt-0 w-full">
          <div>
            {topLoading ? (
              <TokenListSkeleton />
            ) : topData?.tokens?.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {topData.tokens.map((token) => (
                  <TokenCard key={token.address} token={token} now={now} onSwap={handleSelectToken} isSwapping={swappingToken === token.address} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-purple-300/60">
                No top traded tokens found
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="recent" className="mt-0 w-full">
          <div>
            {recentLoading ? (
              <TokenListSkeleton />
            ) : recentData?.tokens?.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recentData.tokens.map((token) => (
                  <TokenCard key={token.address} token={token} now={now} isRecent onSwap={handleSelectToken} isSwapping={swappingToken === token.address} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-purple-300/60">
                No recent tokens found
              </div>
            )}
          </div>
        </TabsContent>
          </>
        )}
      </Tabs>

      {/* Fixed Floating Swap Panel - Bottom Right - Exact copy of SwapPanel design */}
      {selectedToken && (
        <div className="fixed bottom-4 right-4 z-50 w-[340px] bg-gradient-to-br from-purple-800/30 to-purple-900/50 backdrop-blur-sm rounded-xl border border-purple-500/30 p-4 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-white">Swap</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedToken(null)}
              className="p-1 text-purple-300 hover:text-white hover:bg-purple-800/30 h-6 w-6"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-3">
            {/* Pay Section */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-purple-300">Pay:</label>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-purple-400">
                    ≈ {(balances[inputToken.address] || 0).toFixed(4)} {inputToken.symbol}
                  </span>
                  <button 
                    onClick={() => {
                      const balance = balances[inputToken.address] || 0;
                      setSolAmount((balance / 2).toFixed(6));
                    }}
                    className="px-2 py-0.5 bg-purple-800/50 hover:bg-purple-700/50 text-purple-200 hover:text-white rounded text-[10px] font-medium transition-colors"
                  >
                    HALF
                  </button>
                  <button 
                    onClick={() => {
                      const balance = balances[inputToken.address] || 0;
                      const isSol = inputToken.address === 'So11111111111111111111111111111111111111112';
                      const feeReserve = 0.01;
                      const maxAmount = isSol ? Math.max(0, balance - feeReserve) : balance;
                      setSolAmount(maxAmount.toFixed(6));
                    }}
                    className="px-2 py-0.5 bg-purple-800/50 hover:bg-purple-700/50 text-purple-200 hover:text-white rounded text-[10px] font-medium transition-colors"
                  >
                    MAX
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-purple-900/30 border border-purple-500/30 rounded-lg p-2">
                <DexTokenSelector
                  token={inputToken}
                  onSelect={handleSelectInputToken}
                  balances={balances}
                  ownedTokens={ownedTokens}
                />
                <div className="flex-1 min-w-0">
                  <input
                    type="number"
                    placeholder="0.00"
                    value={solAmount}
                    onChange={(e) => setSolAmount(e.target.value)}
                    className="w-full bg-transparent border-none text-right text-white text-lg font-medium focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none"
                    data-testid="input-swap-pay-amount"
                  />
                </div>
              </div>
            </div>

            {/* Swap Direction Button */}
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSwapMode(swapMode === 'buy' ? 'sell' : 'buy')}
                className="text-purple-300 hover:text-white hover:bg-purple-800/30 rounded-full"
              >
                <ArrowDownUp className="h-5 w-5" />
              </Button>
            </div>

            {/* Receive Section */}
            <div className="space-y-1">
              <label className="text-xs text-purple-300">Receive:</label>
              <div className="flex items-center gap-2 bg-purple-900/30 border border-purple-500/30 rounded-lg p-2">
                <button className="flex items-center gap-1.5 bg-purple-900/40 hover:bg-purple-800/40 border border-purple-500/30 rounded-lg px-2 py-1.5 transition-colors text-sm">
                  {selectedToken.logoURI && (
                    <img src={selectedToken.logoURI} alt={selectedToken.symbol} className="w-5 h-5 rounded-full" />
                  )}
                  <span className="text-white font-medium">{selectedToken.symbol}</span>
                  <ChevronDown className="w-3 h-3 text-purple-300" />
                </button>
                <div className="flex-1 min-w-0">
                  {isQuoting ? (
                    <div className="text-right text-purple-300 text-lg">
                      <Loader2 className="w-4 h-4 animate-spin inline" />
                    </div>
                  ) : (
                    <input
                      type="text"
                      placeholder="0.00"
                      value={quoteAmount}
                      readOnly
                      className="w-full bg-transparent border-none text-right text-white text-lg font-medium focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none"
                      data-testid="input-swap-receive-amount"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Swap Button */}
            <Button
              onClick={executeSwap}
              disabled={!publicKey || isSwapping}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold h-9 text-sm rounded-lg"
              data-testid="button-execute-swap"
            >
              {isSwapping ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Swapping...
                </>
              ) : (
                'Swap'
              )}
            </Button>

            {!publicKey && (
              <p className="text-sm text-center text-purple-300">
                Connect your wallet to swap
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
