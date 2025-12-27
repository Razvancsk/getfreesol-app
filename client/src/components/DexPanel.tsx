import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
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

// Helper to shorten address-like strings
function shortenAddress(str: string): string {
  if (str && str.length > 20 && /^[A-Za-z0-9]+$/.test(str)) {
    return `${str.slice(0, 6)}...${str.slice(-4)}`;
  }
  return str;
}

// Token card with responsive design - original small on mobile, larger on desktop
function TokenCard({ token, isRecent, now, onSwap, isSwapping }: { 
  token: TokenData; 
  isRecent?: boolean; 
  now: Date;
  onSwap?: (token: TokenData) => void;
  isSwapping?: boolean;
}) {
  const priceChange = formatPriceChange(token.price_change ?? token.price_change_24h);
  const age = useMemo(() => formatAge(token.created_at, now), [token.created_at, now]);
  
  // Shorten symbol/name if they look like addresses
  const displaySymbol = shortenAddress(token.symbol || '');
  const displayName = shortenAddress(token.name || '');
  
  const handleClick = () => {
    if (onSwap) {
      onSwap(token);
    } else {
      window.open(`https://jup.ag/swap/SOL-${token.address}`, '_blank');
    }
  };
  
  return (
    <>
      {/* Mobile Card - Original smaller design */}
      <div 
        onClick={handleClick}
        className={`md:hidden bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl p-4 hover:from-purple-700/30 hover:to-purple-800/40 transition-all border border-purple-500/20 cursor-pointer ${isSwapping ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-purple-900/40 border border-purple-500/30 flex items-center justify-center overflow-hidden flex-shrink-0">
              {token.logoURI ? (
                <img src={token.logoURI} alt={displaySymbol} className="w-12 h-12 rounded-full" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              ) : (
                <span className="text-lg font-bold text-purple-300">{displaySymbol?.charAt(0)}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-white text-base truncate max-w-[140px]">{displayName}</div>
              <div className="text-xs text-white/80">
                {displaySymbol} <span className="text-green-400">{age}</span>
              </div>
              <div className="text-xs text-white/60 font-mono">{token.address.slice(0, 6)}...{token.address.slice(-4)}</div>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="font-bold text-white text-lg">{formatPrice(token.price)}</div>
            {priceChange && (
              <div className={`text-sm font-medium ${priceChange.color}`}>{priceChange.text}</div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-purple-300/60">Volume</span>
            <span className="text-white font-medium">{formatNumber(token.daily_volume)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-purple-300/60">Market Cap</span>
            <span className="text-white font-medium">{formatNumber(token.market_cap)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-purple-300/60">Liquidity</span>
            <span className="text-white font-medium">{formatNumber(token.liquidity)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-purple-300/60">Txns</span>
            <span className="text-white font-medium">{formatTransactions(token.num_transactions)}</span>
          </div>
        </div>
      </div>

      {/* Desktop Card - Larger design */}
      <div 
        onClick={handleClick}
        className={`hidden md:block bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-2xl p-5 hover:from-purple-700/30 hover:to-purple-800/40 transition-all border border-purple-500/20 cursor-pointer shadow-lg ${isSwapping ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-purple-900/40 border border-purple-500/30 flex items-center justify-center overflow-hidden flex-shrink-0">
              {token.logoURI ? (
                <img src={token.logoURI} alt={displaySymbol} className="w-14 h-14 rounded-full" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              ) : (
                <span className="text-xl font-bold text-purple-300">{displaySymbol?.charAt(0)}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-white text-lg truncate max-w-[180px]">{displayName}</div>
              <div className="text-sm text-purple-200">
                {displaySymbol} <span className="text-green-400">{age}</span>
              </div>
              <div className="text-xs text-purple-400/70 font-mono mt-0.5">{token.address.slice(0, 6)}...{token.address.slice(-4)}</div>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="font-bold text-white text-xl">{formatPrice(token.price)}</div>
            {priceChange && (
              <div className={`text-base font-semibold ${priceChange.color}`}>{priceChange.text}</div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-purple-500/20">
          <div>
            <div className="flex items-center gap-1.5 text-purple-300/70 text-xs mb-1">
              <span>💰</span>
              <span>Volume</span>
            </div>
            <div className="text-white font-semibold text-base">{formatNumber(token.daily_volume)}</div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-purple-300/70 text-xs mb-1">
              <span>📊</span>
              <span>Market Cap</span>
            </div>
            <div className="text-white font-semibold text-base">{formatNumber(token.market_cap)}</div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-purple-300/70 text-xs mb-1">
              <span>💧</span>
              <span>Liquidity</span>
            </div>
            <div className="text-white font-semibold text-base">{formatNumber(token.liquidity)}</div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-purple-300/70 text-xs mb-1">
              <span>📈</span>
              <span>Transactions</span>
            </div>
            <div className="text-white font-semibold text-base">{formatTransactions(token.num_transactions)}</div>
          </div>
        </div>
      </div>
    </>
  );
}

function TokenListSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl p-4 border border-purple-500/20">
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
  const [activeTab, setActiveTab] = useState<'trending' | 'top' | 'recent' | 'volume' | 'txns'>('trending');
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
      // Use backend endpoint that fetches holdings with metadata from Jupiter
      const holdingsResponse = await fetch(`/api/wallet/all-tokens?address=${publicKey.toString()}`);
      
      if (!holdingsResponse.ok) {
        throw new Error('Failed to fetch holdings');
      }
      
      const holdingsData = await holdingsResponse.json();
      
      // Backend returns tokens with full metadata
      if (holdingsData.success && holdingsData.tokens) {
        for (const token of holdingsData.tokens) {
          newBalances[token.address] = token.balance || 0;
          tokensWithMetadata.push({
            address: token.address,
            symbol: token.symbol || token.address.slice(0, 4),
            name: token.name || 'Unknown',
            decimals: token.decimals || 9,
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
      if (!selectedToken || !solAmount || solAmount === '0' || solAmount === '' || !publicKey) {
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
        const orderUrl = `/api/jupiter/ultra/order?inputMint=${inputToken.address}&outputMint=${selectedToken.address}&amount=${inputAmount}&taker=${publicKey.toString()}`;
        
        const response = await fetch(orderUrl);
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
  }, [solAmount, inputToken.address, selectedToken?.address, publicKey]);

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
      // Use the correct decimals for the input token
      const inputDecimals = inputToken.decimals || 9;
      const inputAmount = Math.floor(amount * Math.pow(10, inputDecimals));
      
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
      
      // Check if Jupiter returned a transaction
      if (!quote.transaction || !quote.requestId) {
        // hasTransaction: false usually means the amount is too low or no route
        if (quote.hasTransaction === false) {
          throw new Error('Amount too small or no route available for this swap');
        }
        throw new Error('Invalid order: missing transaction');
      }

      console.log('Signing swap transaction...');
      
      const transactionBuf = Buffer.from(quote.transaction, 'base64');
      const transaction = VersionedTransaction.deserialize(transactionBuf);
      const signedTransaction = await signTransaction(transaction);
      const signedBase64 = Buffer.from(signedTransaction.serialize()).toString('base64');

      console.log('Executing swap...');
      
      // Calculate output amount for display
      const outputAmountValue = parseFloat(quote.outAmount) / Math.pow(10, token.decimals || 6);
      
      // Execute via Ultra Swap API (Jupiter handles transaction sending)
      // USD value is calculated server-side using Jupiter Price API for accuracy
      const executeResponse = await fetch('/api/jupiter/ultra/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signedTransaction: signedBase64,
          requestId: quote.requestId,
          // Swap details for recording and points (USD value calculated server-side)
          walletAddress: publicKey.toString(),
          inputMint: inputToken.address,
          outputMint: token.address,
          inputAmount: amount.toString(),
          outputAmount: outputAmountValue.toString(),
          inputSymbol: inputToken.symbol,
          outputSymbol: token.symbol,
          platformFee: quote.platformFee?.amount || "0"
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
        
        // Invalidate user stats and points queries to refresh after swap
        queryClient.invalidateQueries({ queryKey: ['/api/user/stats'] });
        queryClient.invalidateQueries({ queryKey: ['/api/points/leaderboard'] });
        
        // Refresh token holdings after successful swap (with small delay for blockchain sync)
        setTimeout(() => {
          fetchBalances();
        }, 2000);
        
        toast({
          title: 'Swap Successful!',
          description: (
            <div className="space-y-1">
              <p>Transaction confirmed on Solana blockchain</p>
              {executeData.rebatesEnabled && (
                <p className="text-cyan-300 font-semibold">💰 MEV rebates enabled - earning SOL!</p>
              )}
              {executeData.pointsAwarded > 0 && (
                <p className="text-yellow-300 font-semibold">+{executeData.pointsAwarded} points earned!</p>
              )}
              <a 
                href={`https://solscan.io/tx/${signature}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-white hover:text-green-100 underline"
              >
                View Transaction →
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

  // Volume - sort tokens by highest volume
  const { data: volumeData, isLoading: volumeLoading } = useQuery<TokenListResponse>({
    queryKey: ['/api/tokens/category', 'toptraded', interval, 'volume'],
    queryFn: async () => {
      const res = await fetch(`/api/tokens/category/toptraded/${interval}?limit=100`);
      if (!res.ok) throw new Error('Failed to fetch tokens');
      const data = await res.json();
      // Sort by volume descending
      if (data.tokens) {
        data.tokens.sort((a: TokenData, b: TokenData) => (b.daily_volume || 0) - (a.daily_volume || 0));
      }
      return data;
    },
    enabled: activeTab === 'volume',
    refetchInterval: 30000,
  });

  // Txns - sort tokens by highest transactions
  const { data: txnsData, isLoading: txnsLoading } = useQuery<TokenListResponse>({
    queryKey: ['/api/tokens/category', 'toptraded', interval, 'txns'],
    queryFn: async () => {
      const res = await fetch(`/api/tokens/category/toptraded/${interval}?limit=100`);
      if (!res.ok) throw new Error('Failed to fetch tokens');
      const data = await res.json();
      // Sort by transactions descending
      if (data.tokens) {
        data.tokens.sort((a: TokenData, b: TokenData) => (b.num_transactions || 0) - (a.num_transactions || 0));
      }
      return data;
    },
    enabled: activeTab === 'txns',
    refetchInterval: 30000,
  });

  // Search query for tokens - backend returns full stats from Jupiter Ultra Search
  const { data: searchData, isLoading: searchLoading } = useQuery<{ tokens: TokenData[] }>({
    queryKey: ['token-search', searchQuery],
    queryFn: async () => {
      // Backend search endpoint returns all stats from Jupiter Ultra Search API
      const response = await fetch(`/api/tokens/search?q=${encodeURIComponent(searchQuery)}&limit=20`);
      const data = await response.json();
      
      if (!data.tokens || data.tokens.length === 0) {
        return { tokens: [] };
      }

      // Map to our TokenData format - all stats are already included from backend
      const tokens = data.tokens.map((t: any) => ({
        address: t.address,
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        logoURI: t.logoURI,
        price: t.price || 0,
        price_change_24h: t.price_change_24h || 0,
        market_cap: t.market_cap || 0,
        daily_volume: t.daily_volume || 0,
        liquidity: t.liquidity || 0,
        num_transactions: t.num_transactions || 0,
      }));
      return { tokens };
    },
    enabled: searchQuery.trim().length > 1,
  });

  const getTokenCount = () => {
    if (activeTab === 'trending') return trendingData?.tokens?.length || 0;
    if (activeTab === 'top') return topData?.tokens?.length || 0;
    if (activeTab === 'volume') return volumeData?.tokens?.length || 0;
    if (activeTab === 'txns') return txnsData?.tokens?.length || 0;
    return recentData?.tokens?.length || 0;
  };

  return (
    <div>
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'trending' | 'top' | 'recent' | 'volume' | 'txns')} className="w-full">
        {/* Search Bar - Top on mobile like reference */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-300" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, symbol, or address..."
            className="w-full bg-[#2a1f4e]/60 border border-purple-400/40 rounded-full py-2.5 pl-11 pr-4 text-white placeholder-purple-300/60 outline-none focus:border-purple-400 text-sm"
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

        {/* Tabs row - shared for both mobile and desktop */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <TabsList className="bg-transparent border-0 p-0 gap-2 flex flex-wrap">
            <TabsTrigger value="trending" className="bg-purple-600/30 data-[state=active]:bg-purple-600 rounded-full px-4 py-1.5 text-sm font-medium">
              TRENDING
            </TabsTrigger>
            <TabsTrigger value="top" className="bg-purple-600/30 data-[state=active]:bg-purple-600 rounded-full px-4 py-1.5 text-sm font-medium">
              Top
            </TabsTrigger>
            <TabsTrigger value="recent" className="bg-purple-600/30 data-[state=active]:bg-purple-600 rounded-full px-4 py-1.5 text-sm font-medium">
              NEW
            </TabsTrigger>
            <TabsTrigger value="volume" className="bg-purple-600/30 data-[state=active]:bg-purple-600 rounded-full px-4 py-1.5 text-sm font-medium">
              Volume
            </TabsTrigger>
            <TabsTrigger value="txns" className="hidden md:inline-flex bg-purple-600/30 data-[state=active]:bg-purple-600 rounded-full px-4 py-1.5 text-sm font-medium">
              Txns
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Time filter row */}
        <div className="flex items-center gap-2 mb-4">
          {(activeTab === 'trending' || activeTab === 'top' || activeTab === 'volume' || activeTab === 'txns') && (
            <div className="flex items-center gap-1 bg-[#2a1f4e]/60 rounded-full p-1">
              {['5m', '1h', '6h', '24h'].map((t) => (
                <button
                  key={t}
                  onClick={() => setInterval(t as typeof interval)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${interval === t ? 'bg-purple-600 text-white' : 'text-purple-300 hover:text-white'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          {activeTab === 'recent' && (
            <Button
              size="sm"
              variant="ghost"
              className="text-purple-300 hover:text-white"
              onClick={() => refetchRecent()}
              disabled={recentLoading}
              data-testid="button-refresh-recent"
            >
              <RefreshCw className={`h-4 w-4 ${recentLoading ? 'animate-spin' : ''}`} />
            </Button>
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                Showing {getTokenCount()} {activeTab === 'trending' ? 'trending' : activeTab === 'volume' ? 'highest volume' : activeTab === 'txns' ? 'most transacted' : 'top traded'} tokens
              </p>
            )}

            <TabsContent value="trending" className="mt-0 w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {trendingLoading ? (
              <TokenListSkeleton />
            ) : trendingData?.tokens?.length ? (
              trendingData.tokens.map((token) => (
                <TokenCard key={token.address} token={token} now={now} onSwap={handleSelectToken} isSwapping={swappingToken === token.address} />
              ))
            ) : (
              <div className="text-center py-8 text-purple-300/60 col-span-full">
                No trending tokens found
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="top" className="mt-0 w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {topLoading ? (
              <TokenListSkeleton />
            ) : topData?.tokens?.length ? (
              topData.tokens.map((token) => (
                <TokenCard key={token.address} token={token} now={now} onSwap={handleSelectToken} isSwapping={swappingToken === token.address} />
              ))
            ) : (
              <div className="text-center py-8 text-purple-300/60 col-span-full">
                No top traded tokens found
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="recent" className="mt-0 w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentLoading ? (
              <TokenListSkeleton />
            ) : recentData?.tokens?.length ? (
              recentData.tokens.map((token) => (
                <TokenCard key={token.address} token={token} now={now} isRecent onSwap={handleSelectToken} isSwapping={swappingToken === token.address} />
              ))
            ) : (
              <div className="text-center py-8 text-purple-300/60 col-span-full">
                No recent tokens found
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="volume" className="mt-0 w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {volumeLoading ? (
              <TokenListSkeleton />
            ) : volumeData?.tokens?.length ? (
              volumeData.tokens.map((token) => (
                <TokenCard key={token.address} token={token} now={now} onSwap={handleSelectToken} isSwapping={swappingToken === token.address} />
              ))
            ) : (
              <div className="text-center py-8 text-purple-300/60 col-span-full">
                No tokens found
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="txns" className="mt-0 w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {txnsLoading ? (
              <TokenListSkeleton />
            ) : txnsData?.tokens?.length ? (
              txnsData.tokens.map((token) => (
                <TokenCard key={token.address} token={token} now={now} onSwap={handleSelectToken} isSwapping={swappingToken === token.address} />
              ))
            ) : (
              <div className="text-center py-8 text-purple-300/60 col-span-full">
                No tokens found
              </div>
            )}
          </div>
        </TabsContent>
          </>
        )}
      </Tabs>

      {/* Desktop Swap Panel - Fixed bottom-right corner (hidden on mobile) */}
      {selectedToken && (
        <div className="hidden md:block fixed bottom-0 right-0 z-50 w-[340px] bg-gradient-to-br from-purple-800/30 to-purple-900/50 backdrop-blur-sm rounded-tl-xl border border-purple-500/30 p-4 shadow-2xl overflow-hidden">
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
                    data-testid="input-swap-pay-amount-desktop"
                  />
                </div>
              </div>
            </div>

            {/* Swap Direction Button */}
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const newInputToken: TokenInfo = {
                    address: selectedToken.address,
                    symbol: selectedToken.symbol,
                    name: selectedToken.name,
                    decimals: selectedToken.decimals,
                    logoURI: selectedToken.logoURI
                  };
                  const newOutputToken: TokenData = {
                    address: inputToken.address,
                    symbol: inputToken.symbol,
                    name: inputToken.name,
                    decimals: inputToken.decimals,
                    logoURI: inputToken.logoURI,
                    price: 0,
                    market_cap: 0,
                    daily_volume: 0,
                    liquidity: 0,
                    num_transactions: 0
                  };
                  setInputToken(newInputToken);
                  setSelectedToken(newOutputToken);
                  setSolAmount('');
                  setQuoteAmount('0.00');
                }}
                className="text-purple-300 hover:text-white hover:bg-purple-800/30 rounded-full"
              >
                <ArrowDownUp className="h-5 w-5" />
              </Button>
            </div>

            {/* Receive Section */}
            <div className="space-y-1">
              <label className="text-xs text-purple-300">Receive:</label>
              <div className="flex items-center gap-2 bg-purple-900/30 border border-purple-500/30 rounded-lg p-2">
                <DexTokenSelector 
                  token={{
                    address: selectedToken.address,
                    symbol: selectedToken.symbol,
                    name: selectedToken.name,
                    decimals: selectedToken.decimals,
                    logoURI: selectedToken.logoURI
                  }}
                  onSelect={(token) => {
                    if (token.address === inputToken.address) {
                      const newInputToken: TokenInfo = {
                        address: selectedToken.address,
                        symbol: selectedToken.symbol,
                        name: selectedToken.name,
                        decimals: selectedToken.decimals,
                        logoURI: selectedToken.logoURI
                      };
                      setInputToken(newInputToken);
                    }
                    setSelectedToken({
                      address: token.address,
                      symbol: token.symbol,
                      name: token.name,
                      decimals: token.decimals,
                      logoURI: token.logoURI,
                      price: 0,
                      market_cap: 0,
                      daily_volume: 0,
                      liquidity: 0,
                      num_transactions: 0
                    });
                    setSolAmount('');
                    setQuoteAmount('0.00');
                  }}
                  balances={balances}
                  ownedTokens={ownedTokens}
                />
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
                      data-testid="input-swap-receive-amount-desktop"
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
              data-testid="button-execute-swap-desktop"
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

      {/* Mobile Swap Panel - Full-width bottom sheet (hidden on desktop) */}
      {selectedToken && createPortal(
        <div className="md:hidden fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedToken(null)} />
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-b from-purple-900 to-purple-950 rounded-t-3xl p-5 pb-8 animate-in slide-in-from-bottom duration-300">
            {/* Drag handle */}
            <div className="w-12 h-1 bg-purple-400/40 rounded-full mx-auto mb-4" />
            
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Trade {selectedToken.symbol}</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedToken(null)}
                className="p-1 text-purple-300 hover:text-white hover:bg-purple-800/30 h-8 w-8"
              >
                <X className="h-5 w-5" />
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

            {/* Swap Direction Button - swaps Pay and Receive tokens */}
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  // Swap the tokens
                  const newInputToken: TokenInfo = {
                    address: selectedToken.address,
                    symbol: selectedToken.symbol,
                    name: selectedToken.name,
                    decimals: selectedToken.decimals,
                    logoURI: selectedToken.logoURI
                  };
                  const newOutputToken: TokenData = {
                    address: inputToken.address,
                    symbol: inputToken.symbol,
                    name: inputToken.name,
                    decimals: inputToken.decimals,
                    logoURI: inputToken.logoURI,
                    price: 0,
                    market_cap: 0,
                    daily_volume: 0,
                    liquidity: 0,
                    num_transactions: 0
                  };
                  setInputToken(newInputToken);
                  setSelectedToken(newOutputToken);
                  setSolAmount('');
                  setQuoteAmount('0.00');
                }}
                className="text-purple-300 hover:text-white hover:bg-purple-800/30 rounded-full"
              >
                <ArrowDownUp className="h-5 w-5" />
              </Button>
            </div>

            {/* Receive Section */}
            <div className="space-y-1">
              <label className="text-xs text-purple-300">Receive:</label>
              <div className="flex items-center gap-2 bg-purple-900/30 border border-purple-500/30 rounded-lg p-2">
                <DexTokenSelector 
                  token={{
                    address: selectedToken.address,
                    symbol: selectedToken.symbol,
                    name: selectedToken.name,
                    decimals: selectedToken.decimals,
                    logoURI: selectedToken.logoURI
                  }}
                  onSelect={(token) => {
                    if (token.address === inputToken.address) {
                      const newInputToken: TokenInfo = {
                        address: selectedToken.address,
                        symbol: selectedToken.symbol,
                        name: selectedToken.name,
                        decimals: selectedToken.decimals,
                        logoURI: selectedToken.logoURI
                      };
                      setInputToken(newInputToken);
                    }
                    setSelectedToken({
                      address: token.address,
                      symbol: token.symbol,
                      name: token.name,
                      decimals: token.decimals,
                      logoURI: token.logoURI,
                      price: 0,
                      market_cap: 0,
                      daily_volume: 0,
                      liquidity: 0,
                      num_transactions: 0
                    });
                    setSolAmount('');
                    setQuoteAmount('0.00');
                  }}
                  balances={balances}
                  ownedTokens={ownedTokens}
                />
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
        </div>,
        document.body
      )}
    </div>
  );
}
