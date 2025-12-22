import { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogHeader, DialogTitle, DialogPortal, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowDownUp, Loader2, X, RefreshCw, Search, ChevronDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { VersionedTransaction } from '@solana/web3.js';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';

interface SwapModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  usdPrice?: number;
  usdValue?: number;
}

const POPULAR_TOKENS: TokenInfo[] = [
  {
    address: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
  },
  {
    address: '5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm',
    symbol: 'solami',
    name: 'Solami',
    decimals: 9,
    logoURI: 'https://img.fotofolio.xyz/?url=https%3A%2F%2Fbafkreifkvjqvyx7kggqa7vnu5xtccio6nyao4ckg42jpnk6xjpfob47jey.ipfs.nftstorage.link'
  },
  {
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png'
  },
  {
    address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    symbol: 'USDT',
    name: 'USDT',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png'
  },
  {
    address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    symbol: 'JLP',
    name: 'Jupiter Perps',
    decimals: 6,
    logoURI: 'https://static.jup.ag/jlp/icon.png'
  },
  {
    address: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
    symbol: 'mSOL',
    name: 'Marinade staked SOL',
    decimals: 9,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png'
  },
  {
    address: 'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v',
    symbol: 'JupSOL',
    name: 'Jupiter Staked SOL',
    decimals: 9,
    logoURI: 'https://static.jup.ag/jupSOL/icon.png'
  },
  {
    address: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
    symbol: 'JitoSOL',
    name: 'Jito Staked SOL',
    decimals: 9,
    logoURI: 'https://storage.googleapis.com/token-metadata/JitoSOL-256.png'
  },
];

// TokenSelector Component
function TokenSelector({ 
  token, 
  onSelect, 
  label,
  balances,
  ownedTokens
}: { 
  token: TokenInfo; 
  onSelect: (token: TokenInfo) => void; 
  label: string;
  balances: Record<string, number>;
  ownedTokens: TokenInfo[];
}) {
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [modalSearchQuery, setModalSearchQuery] = useState('');

  const { data: modalSearchData, isLoading: isModalSearching } = useQuery({
    queryKey: ['jupiter-search', modalSearchQuery.trim()],
    queryFn: async () => {
      const query = modalSearchQuery.trim();
      const response = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(query)}`);
      const data = await response.json();
      
      // Jupiter returns an array directly
      const tokens = Array.isArray(data) ? data.map((t: any) => ({
        address: t.id,
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        logoURI: t.icon
      })) : [];
      
      return { tokens };
    },
    enabled: showSearchModal && modalSearchQuery.trim().length > 0,
  });

  const handleSearchInputClick = () => {
    setShowSearchModal(true);
  };

  // Show only owned tokens (no popular tokens)
  const getTokenList = () => {
    if (modalSearchQuery.trim().length > 0 && modalSearchData?.tokens) {
      return modalSearchData.tokens;
    }
    
    // Show ONLY tokens the user owns
    return ownedTokens || [];
  };

  const searchResults = getTokenList();

  return (
    <>
      <button
        onClick={() => setShowSearchModal(true)}
        className="flex items-center gap-2 bg-purple-900/40 hover:bg-purple-800/40 border border-purple-500/30 rounded-lg px-3 py-2 transition-colors"
      >
        <img src={token.logoURI} alt={token.symbol} className="w-6 h-6 rounded-full" />
        <span className="text-white font-medium">{token.symbol}</span>
        <ChevronDown className="w-4 h-4 text-purple-300" />
      </button>

      {showSearchModal && (
        <div className="fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowSearchModal(false)} />
          <div className="relative bg-gradient-to-br from-purple-900 via-purple-800 to-purple-900 w-full h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-purple-500/30">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold text-lg">Search Tokens</h3>
                <button onClick={() => setShowSearchModal(false)} className="text-purple-200 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-300" />
                <Input
                  type="text"
                  placeholder="Search tokens"
                  value={modalSearchQuery}
                  onChange={(e) => setModalSearchQuery(e.target.value)}
                  onClick={handleSearchInputClick}
                  className="pl-11 bg-purple-950/50 border-purple-500/30 text-white placeholder:text-purple-300/50 h-12 rounded-lg"
                />
              </div>
            </div>

            {/* Token List */}
            <div className="flex-1 overflow-y-auto p-2">
              {isModalSearching ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-purple-300" />
                  <span className="ml-2 text-purple-200">Searching tokens...</span>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="text-center py-8 text-purple-300">
                  No tokens found
                </div>
              ) : (
                searchResults.map((t) => {
                  const balance = balances[t.address] || 0;
                  return (
                    <button
                      key={t.address}
                      onClick={() => {
                        onSelect(t);
                        setShowSearchModal(false);
                        setModalSearchQuery('');
                      }}
                      className="w-full flex items-center gap-3 p-3 hover:bg-purple-700/30 rounded-lg transition-colors text-left"
                    >
                      <img src={t.logoURI} alt={t.symbol} className="w-12 h-12 rounded-full" />
                      <div className="flex-1">
                        <div className="text-white font-semibold text-base">{t.symbol}</div>
                        <div className="text-sm text-purple-200/70">{t.name}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-white font-medium">{balance.toFixed(4)}</div>
                        <div className="text-xs text-purple-300/60 font-mono">{t.address.slice(0, 8)}...{t.address.slice(-8)}</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function SwapModal({ open, onOpenChange }: SwapModalProps) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { toast } = useToast();
  
  const [fromToken, setFromToken] = useState<TokenInfo>(POPULAR_TOKENS[0]); // SOL
  const [toToken, setToToken] = useState<TokenInfo>(POPULAR_TOKENS[2]); // USDC
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [quote, setQuote] = useState<any>(null);
  const [quoteTimestamp, setQuoteTimestamp] = useState<number>(0);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [ownedTokens, setOwnedTokens] = useState<TokenInfo[]>([]);
  const [networkFee, setNetworkFee] = useState<number>(0);

  // Auto-refresh quote every 10 seconds for live price updates
  useEffect(() => {
    if (!quote || !fromAmount || parseFloat(fromAmount) <= 0 || !open) return;

    const refreshInterval = setInterval(() => {
      console.log('🔄 Auto-refreshing quote for live prices...');
      getQuote(fromAmount);
    }, 10000); // Refresh every 10 seconds for live prices

    return () => clearInterval(refreshInterval);
  }, [quote, fromAmount, open, fromToken, toToken]);

  // Fetch token balances and metadata
  useEffect(() => {
    if (!publicKey || !open) return;

    const fetchBalances = async () => {
      setIsLoadingBalances(true);
      console.log('Fetching balances for wallet:', publicKey.toString());
      const newBalances: Record<string, number> = {};
      const tokensWithMetadata: TokenInfo[] = [];
      
      try {
        // Fetch from Jupiter Ultra Holdings API via backend proxy (uses API key for dynamic rate limits)
        const holdingsResponse = await fetch(`/api/jupiter/ultra/holdings/${publicKey.toString()}`);
        
        if (!holdingsResponse.ok) {
          throw new Error('Failed to fetch holdings');
        }
        
        const holdingsData = await holdingsResponse.json();
        
        // Add native SOL balance
        if (holdingsData.uiAmount !== undefined) {
          newBalances['So11111111111111111111111111111111111111112'] = holdingsData.uiAmount;
          tokensWithMetadata.push({
            address: 'So11111111111111111111111111111111111111112',
            symbol: 'SOL',
            name: 'Solana',
            decimals: 9,
            logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
          });
        }
        
        // Add token balances from Jupiter Holdings response
        if (holdingsData.tokens) {
          const tokenAddresses = Object.keys(holdingsData.tokens);
          let tokenMetadata: Record<string, any> = {};
          
          // Fetch token metadata for all tokens
          if (tokenAddresses.length > 0) {
            try {
              const metaResponse = await fetch(`https://lite-api.jup.ag/tokens/v2/mints?mints=${tokenAddresses.slice(0, 50).join(',')}`);
              const metaData = await metaResponse.json();
              if (Array.isArray(metaData)) {
                for (const t of metaData) {
                  tokenMetadata[t.id] = t;
                }
              }
            } catch (e) {
              console.error('Error fetching token metadata:', e);
            }
          }
          
          for (const [mint, accounts] of Object.entries(holdingsData.tokens)) {
            const accountArray = accounts as any[];
            if (accountArray.length > 0) {
              const account = accountArray[0];
              const meta = tokenMetadata[mint];
              newBalances[mint] = account.uiAmount || 0;
              tokensWithMetadata.push({
                address: mint,
                symbol: meta?.symbol || mint.slice(0, 4),
                name: meta?.name || 'Unknown',
                decimals: account.decimals || 9,
                logoURI: meta?.icon
              });
            }
          }
        }
        
        setOwnedTokens(tokensWithMetadata);
      } catch (error: any) {
        console.error('Error fetching holdings:', error?.message || error);
      }
      
      setBalances(newBalances);
      setIsLoadingBalances(false);
      console.log('Balances fetched:', newBalances);
    };

    fetchBalances();
  }, [publicKey, open]);

  const getQuote = async (amount: string) => {
    if (!amount || parseFloat(amount) <= 0) {
      setToAmount('');
      setQuote(null);
      setQuoteTimestamp(0);
      return;
    }

    setIsLoadingQuote(true);
    try {
      const inputAmount = Math.floor(parseFloat(amount) * Math.pow(10, fromToken.decimals));
      
      // Use Ultra Swap API with referral fees
      const orderUrl = `/api/jupiter/ultra/order?inputMint=${fromToken.address}&outputMint=${toToken.address}&amount=${inputAmount}&taker=${publicKey?.toString() || ''}`;
      console.log('🚀 Fetching Ultra Order:', orderUrl);
      
      const response = await fetch(orderUrl);
      console.log('Ultra Order response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Ultra Order API error:', response.status, errorText);
        
        // Parse Jupiter's error message
        let errorMsg = 'Unable to get swap quote';
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.includes?.('Failed to get quotes')) {
            errorMsg = 'No swap route available. Try a larger amount or different token pair.';
          } else if (errorData.error?.includes?.('Unsupported')) {
            errorMsg = 'This token is not supported for swapping. Please choose a different token.';
          } else {
            errorMsg = errorData.error || errorMsg;
          }
        } catch {
          errorMsg = errorText || response.statusText;
        }
        
        throw new Error(errorMsg);
      }
      
      const orderData = await response.json();
      console.log('✅ Ultra Order data received:', orderData);
      
      if (!orderData || !orderData.outAmount) {
        throw new Error('No swap route available. Try a larger amount or different token pair.');
      }
      
      // Jupiter Ultra API returns real network fee values directly
      const signatureFeeLamports = orderData.signatureFeeLamports || 5000;
      const prioritizationFeeLamports = orderData.prioritizationFeeLamports || 0;
      
      // Total network fee
      const transactionFeeLamports = signatureFeeLamports + prioritizationFeeLamports;
      const calculatedNetworkFee = transactionFeeLamports / 1e9; // Convert to SOL
      
      console.log('✅ Real network fee from Jupiter:', {
        signatureFeeLamports,
        prioritizationFeeLamports,
        transactionFeeLamports,
        networkFeeSOL: calculatedNetworkFee.toFixed(6)
      });
      
      setQuote(orderData);
      setQuoteTimestamp(Date.now()); // Track when quote was received
      setNetworkFee(calculatedNetworkFee);
      
      const outAmount = parseFloat(orderData.outAmount) / Math.pow(10, toToken.decimals);
      setToAmount(outAmount.toFixed(6));
    } catch (error: any) {
      console.error('Quote error:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to get swap quote',
        variant: 'destructive',
      });
      setToAmount('');
      setQuote(null);
      setQuoteTimestamp(0);
    } finally {
      setIsLoadingQuote(false);
    }
  };

  const handleSwap = async () => {
    if (!publicKey || !signTransaction || !quote) return;

    // Check if quote is too old (older than 90 seconds = 1.5 minutes)
    const quoteAge = (Date.now() - quoteTimestamp) / 1000; // in seconds
    if (quoteAge > 90) {
      toast({
        title: 'Quote Expired',
        description: 'Your quote is too old and has likely expired. Please get a fresh quote by adjusting the amount.',
        variant: 'destructive',
      });
      setQuote(null);
      setQuoteTimestamp(0);
      return;
    }

    setIsSwapping(true);
    try {
      // Ultra Swap: order already contains the transaction from getQuote
      if (!quote.transaction || !quote.requestId) {
        throw new Error('Invalid order: missing transaction or requestId');
      }

      console.log('🚀 Signing Ultra Swap transaction...');
      
      // Deserialize and sign the transaction
      const transactionBuf = Buffer.from(quote.transaction, 'base64');
      const transaction = VersionedTransaction.deserialize(transactionBuf);
      const signedTransaction = await signTransaction(transaction);
      const signedBase64 = Buffer.from(signedTransaction.serialize()).toString('base64');

      console.log('✅ Transaction signed, executing with requestId:', quote.requestId);
      
      // Execute via Ultra Swap API (Jupiter handles transaction sending)
      // USD value is calculated server-side using Jupiter Price API for accuracy
      const executeResponse = await fetch('/api/jupiter/ultra/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signedTransaction: signedBase64,
          requestId: quote.requestId,
          // Swap details for recording and points (USD value calculated server-side)
          walletAddress: publicKey.toBase58(),
          inputMint: fromToken?.address,
          outputMint: toToken?.address,
          inputAmount: fromAmount,
          outputAmount: toAmount,
          inputSymbol: fromToken?.symbol,
          outputSymbol: toToken?.symbol,
          platformFee: quote.platformFee?.amount || "0"
        })
      });

      if (!executeResponse.ok) {
        let errorMessage = 'Failed to execute swap';
        try {
          const errorData = await executeResponse.json();
          const errorStr = typeof errorData.error === 'string' ? errorData.error : JSON.stringify(errorData.error);
          
          // Check for specific Jupiter errors
          if (errorStr.includes('Order not found') || errorStr.includes('expired')) {
            errorMessage = 'Quote expired. Please close this modal and get a fresh quote.';
          } else {
            errorMessage = errorData.details || errorStr || errorMessage;
          }
        } catch {
          errorMessage = await executeResponse.text();
        }
        throw new Error(errorMessage);
      }

      const executeData = await executeResponse.json();
      
      if (executeData.status === "Success") {
        const signature = executeData.signature;
        console.log('✅ Ultra Swap successful:', signature);
        
        // Invalidate user stats and points queries to refresh after swap
        queryClient.invalidateQueries({ queryKey: ['/api/user/stats'] });
        queryClient.invalidateQueries({ queryKey: ['/api/points/leaderboard'] });
        
        toast({
          title: 'Swap Successful!',
          description: (
            <div className="space-y-2">
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
                className="inline-flex items-center gap-1 text-white hover:text-green-100 underline font-medium"
              >
                View Transaction →
              </a>
            </div>
          ),
          className: 'bg-green-600 text-white border-green-500',
        });

        setFromAmount('');
        setToAmount('');
        setQuote(null);
        setQuoteTimestamp(0);
        onOpenChange(false);
      } else {
        // Jupiter returned Failed status - log full response and show link if signature exists
        console.error('Jupiter execute failed:', JSON.stringify(executeData, null, 2));
        if (executeData.signature) {
          console.log(`View failed transaction: https://solscan.io/tx/${executeData.signature}`);
        }
        
        let errorMsg = 'Transaction failed on-chain.';
        if (executeData.signature) {
          errorMsg += ` View on Solscan: https://solscan.io/tx/${executeData.signature}`;
        } else {
          errorMsg += ' Likely due to slippage, insufficient balance for fees, or network congestion.';
        }
        
        throw new Error(executeData.error || executeData.message || errorMsg);
      }
    } catch (error: any) {
      console.error('❌ Ultra Swap error:', error);
      toast({
        title: 'Swap Failed',
        description: error.message || 'Failed to complete swap',
        variant: 'destructive',
      });
    } finally {
      setIsSwapping(false);
    }
  };

  const swapTokens = () => {
    const tempToken = fromToken;
    setFromToken(toToken);
    setToToken(tempToken);
    setFromAmount(toAmount);
    setToAmount(fromAmount);
    setQuote(null);
    setQuoteTimestamp(0);
  };
  
  // Fetch balance for a specific token when it's selected but not in balances map
  const fetchTokenBalance = async (tokenAddress: string) => {
    if (!publicKey || balances[tokenAddress] !== undefined) return;
    
    try {
      const response = await fetch(`/api/wallet/token-balance?mint=${tokenAddress}&address=${publicKey.toString()}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setBalances(prev => ({
            ...prev,
            [tokenAddress]: data.balance || 0
          }));
        }
      }
    } catch (error) {
      console.error('Error fetching token balance:', error);
    }
  };

  const refreshBalances = async () => {
    if (!publicKey) return;

    setIsLoadingBalances(true);
    const newBalances: Record<string, number> = {};
    const tokensWithMetadata: TokenInfo[] = [];
    
    try {
      // Fetch from Jupiter Ultra Holdings API via backend proxy (uses API key for dynamic rate limits)
      const holdingsResponse = await fetch(`/api/wallet/all-tokens?address=${publicKey.toString()}`);
      
      if (!holdingsResponse.ok) {
        throw new Error('Failed to fetch holdings');
      }
      
      const holdingsData = await holdingsResponse.json();
      
      // Process tokens from backend response
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogPrimitive.Content
          className={cn(
            "fixed left-0 bottom-0 z-50 grid w-full max-w-md gap-4 border-t border-l border-r border-purple-500/50 bg-gradient-to-br from-purple-900/95 to-purple-800/95 backdrop-blur-xl p-6 shadow-2xl duration-300 rounded-t-2xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom"
          )}
        >
          <DialogHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-white text-xl"></DialogTitle>
            </div>
          </DialogHeader>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshBalances}
            disabled={isLoadingBalances}
            className="absolute right-14 top-0 p-2.5 text-purple-300 hover:text-white hover:bg-purple-800/30"
            data-testid="button-refresh-balances"
          >
            <RefreshCw className={cn("h-5 w-5", isLoadingBalances && "animate-spin")} />
          </Button>
          
          <DialogPrimitive.Close className="absolute right-4 top-0 p-2.5 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none text-white">
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        
        <div className="space-y-5">
          {/* Pay Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-purple-300">Pay:</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-purple-400">
                  ≈ {(balances[fromToken.address] || 0).toFixed(8)} {fromToken.symbol}
                </span>
                <button 
                  onClick={() => {
                    const balance = balances[fromToken.address] || 0;
                    setFromAmount((balance / 2).toString());
                    getQuote((balance / 2).toString());
                  }}
                  className="px-3 py-1 bg-purple-800/50 hover:bg-purple-700/50 text-purple-200 hover:text-white rounded text-xs font-medium transition-colors"
                >
                  HALF
                </button>
                <button 
                  onClick={() => {
                    const balance = balances[fromToken.address] || 0;
                    // Reserve 0.01 SOL for transaction fees when swapping FROM SOL
                    const isSol = fromToken.address === 'So11111111111111111111111111111111111111112';
                    const feeReserve = 0.01;
                    const maxAmount = isSol ? Math.max(0, balance - feeReserve) : balance;
                    setFromAmount(maxAmount.toString());
                    getQuote(maxAmount.toString());
                  }}
                  className="px-3 py-1 bg-purple-800/50 hover:bg-purple-700/50 text-purple-200 hover:text-white rounded text-xs font-medium transition-colors"
                >
                  MAX
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-purple-900/30 border border-purple-500/30 rounded-lg p-3">
              <TokenSelector 
                token={fromToken} 
                onSelect={(token) => {
                  // If selecting the same token that's already in "Receive", swap them
                  if (token.address === toToken.address) {
                    setToToken(fromToken);
                    setFromToken(token);
                    setFromAmount(toAmount);
                    setToAmount(fromAmount);
                    setQuote(null);
                  } else {
                    setFromToken(token);
                  }
                  // Fetch balance if not already in balances map
                  fetchTokenBalance(token.address);
                }} 
                label="From" 
                balances={balances} 
                ownedTokens={ownedTokens} 
              />
              <Input
                type="number"
                placeholder="0.00"
                value={fromAmount}
                onChange={(e) => {
                  setFromAmount(e.target.value);
                  getQuote(e.target.value);
                }}
                className="flex-1 bg-transparent border-none text-right text-white text-2xl font-medium focus-visible:ring-0 focus-visible:ring-offset-0 p-0"
                data-testid="input-swap-from-amount"
              />
            </div>
          </div>

          {/* Swap Direction Button */}
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={swapTokens}
              className="text-purple-300 hover:text-white hover:bg-purple-800/30 rounded-full"
              data-testid="button-swap-direction"
            >
              <ArrowDownUp className="h-5 w-5" />
            </Button>
          </div>

          {/* Receive Section */}
          <div className="space-y-2">
            <label className="text-sm text-purple-300">Receive:</label>
            <div className="flex items-center gap-3 bg-purple-900/30 border border-purple-500/30 rounded-lg p-3">
              <TokenSelector 
                token={toToken} 
                onSelect={(token) => {
                  // If selecting the same token that's already in "Pay", swap them
                  if (token.address === fromToken.address) {
                    setFromToken(toToken);
                    setToToken(token);
                    setFromAmount(toAmount);
                    setToAmount(fromAmount);
                    setQuote(null);
                  } else {
                    setToToken(token);
                  }
                  // Fetch balance if not already in balances map
                  fetchTokenBalance(token.address);
                }} 
                label="To" 
                balances={balances} 
                ownedTokens={ownedTokens} 
              />
              <Input
                type="number"
                placeholder="0.00"
                value={toAmount}
                readOnly
                className="flex-1 bg-transparent border-none text-right text-white text-2xl font-medium focus-visible:ring-0 focus-visible:ring-offset-0 p-0"
                data-testid="input-swap-to-amount"
              />
            </div>
          </div>

          {isLoadingQuote && !quote && (
            <div className="text-center text-sm text-purple-300 py-2">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
              Getting quote...
            </div>
          )}

          {/* Fee Display Section */}
          {quote && (
            <div className="space-y-2 bg-purple-950/30 border border-purple-500/20 rounded-lg p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-purple-300">Network Fee</span>
                <span className="text-white font-medium" data-testid="text-network-fee">
                  {networkFee.toFixed(6)} SOL
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-purple-300">Platform Fee</span>
                <span className="text-white font-medium" data-testid="text-platform-fee">0.50%</span>
              </div>
            </div>
          )}

          <Button
            onClick={handleSwap}
            disabled={!publicKey || !quote || isSwapping || isLoadingQuote}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold h-12 text-lg rounded-lg"
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
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
