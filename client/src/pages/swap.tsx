import { useState, useEffect } from 'react';
import { useWalletAdapter } from '@/hooks/useWalletAdapter';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowDownUp, Loader2, RefreshCw, Search, ChevronDown, X, ArrowLeft, Shield, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { VersionedTransaction } from '@solana/web3.js';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useAppKit } from "@reown/appkit/react";
import logoImage from '@assets/image_1757882056840.png';

const PLATFORM_WALLET = 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT';

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
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png'
  },
];

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

  const getTokenList = () => {
    if (modalSearchQuery.trim().length > 0 && modalSearchData?.tokens) {
      return modalSearchData.tokens;
    }
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
            <div className="p-4 border-b border-purple-500/30">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold text-lg">Search Tokens</h3>
                <button onClick={() => setShowSearchModal(false)} className="text-purple-200 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-300" />
                <Input
                  type="text"
                  placeholder="Search tokens"
                  value={modalSearchQuery}
                  onChange={(e) => setModalSearchQuery(e.target.value)}
                  className="pl-11 bg-purple-950/50 border-purple-500/30 text-white placeholder:text-purple-300/50 h-12 rounded-lg"
                />
              </div>
            </div>

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

export default function SwapPage() {
  const { publicKey, signTransaction, connected } = useWalletAdapter();
  const { open } = useAppKit();
  const { toast } = useToast();
  
  const [fromToken, setFromToken] = useState<TokenInfo>(POPULAR_TOKENS[0]);
  const [toToken, setToToken] = useState<TokenInfo>(POPULAR_TOKENS[1]);
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

  const isPlatformWallet = publicKey?.toString() === PLATFORM_WALLET;

  useEffect(() => {
    if (!quote || !fromAmount || parseFloat(fromAmount) <= 0) return;

    const refreshInterval = setInterval(() => {
      console.log('🔄 Auto-refreshing quote for live prices...');
      getQuote(fromAmount);
    }, 10000);

    return () => clearInterval(refreshInterval);
  }, [quote, fromAmount, fromToken, toToken]);

  useEffect(() => {
    if (!publicKey || !isPlatformWallet) return;
    fetchBalances();
  }, [publicKey, isPlatformWallet]);

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
      
      const orderUrl = `/api/jupiter/ultra/order?inputMint=${fromToken.address}&outputMint=${toToken.address}&amount=${inputAmount}&taker=${publicKey?.toString() || ''}`;
      
      const response = await fetch(orderUrl);
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorMsg = 'Unable to get swap quote';
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.includes?.('Failed to get quotes')) {
            errorMsg = 'No swap route available. Try a larger amount or different token pair.';
          } else if (errorData.error?.includes?.('Unsupported')) {
            errorMsg = 'This token is not supported for swapping.';
          } else {
            errorMsg = errorData.error || errorMsg;
          }
        } catch {
          errorMsg = errorText || response.statusText;
        }
        throw new Error(errorMsg);
      }
      
      const orderData = await response.json();
      
      if (!orderData || !orderData.outAmount) {
        throw new Error('No swap route available. Try a larger amount or different token pair.');
      }
      
      const signatureFeeLamports = orderData.signatureFeeLamports || 5000;
      const prioritizationFeeLamports = orderData.prioritizationFeeLamports || 0;
      const transactionFeeLamports = signatureFeeLamports + prioritizationFeeLamports;
      const calculatedNetworkFee = transactionFeeLamports / 1e9;
      
      setQuote(orderData);
      setQuoteTimestamp(Date.now());
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

    const quoteAge = (Date.now() - quoteTimestamp) / 1000;
    if (quoteAge > 90) {
      toast({
        title: 'Quote Expired',
        description: 'Your quote is too old. Please get a fresh quote.',
        variant: 'destructive',
      });
      setQuote(null);
      setQuoteTimestamp(0);
      return;
    }

    setIsSwapping(true);
    try {
      if (!quote.transaction || !quote.requestId) {
        throw new Error('Amount too small or no route available for this swap');
      }

      const transactionBuf = Buffer.from(quote.transaction, 'base64');
      const transaction = VersionedTransaction.deserialize(transactionBuf);
      const signedTransaction = await signTransaction(transaction);
      const signedBase64 = Buffer.from(signedTransaction.serialize()).toString('base64');

      const executeResponse = await fetch('/api/jupiter/ultra/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signedTransaction: signedBase64,
          requestId: quote.requestId,
          walletAddress: publicKey.toString(),
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
          if (errorStr.includes('Order not found') || errorStr.includes('expired')) {
            errorMessage = 'Quote expired. Please get a fresh quote.';
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
        
        queryClient.invalidateQueries({ queryKey: ['/api/user/stats'] });
        
        toast({
          title: 'Swap Successful!',
          description: (
            <div className="space-y-2">
              <p>Transaction confirmed on Solana blockchain</p>
              {executeData.rebatesEnabled && (
                <p className="text-cyan-300 font-semibold">MEV rebates enabled!</p>
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
        fetchBalances();
      } else {
        let errorMsg = 'Transaction failed on-chain.';
        if (executeData.signature) {
          errorMsg += ` View on Solscan: https://solscan.io/tx/${executeData.signature}`;
        }
        throw new Error(executeData.error || executeData.message || errorMsg);
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

  if (!connected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-black flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-6">
          <img src={logoImage} alt="GetFreeSol" className="h-16 w-auto mx-auto" />
          <h1 className="text-3xl font-bold text-white">Admin Swap</h1>
          <p className="text-purple-200">Connect your wallet to access admin swap</p>
          <Button
            onClick={() => open()}
            className="bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white px-8 py-3"
          >
            Connect Wallet
          </Button>
          <Link href="/">
            <Button variant="ghost" className="text-purple-300 hover:text-white mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!isPlatformWallet) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-black flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-6">
          <Shield className="w-16 h-16 text-red-400 mx-auto" />
          <h1 className="text-3xl font-bold text-white">Access Denied</h1>
          <p className="text-purple-200 max-w-md">
            This page is only accessible to the platform wallet.
          </p>
          <Link href="/">
            <Button className="bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-black">
      <header className="border-b border-purple-500/30 bg-purple-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer">
              <img src={logoImage} alt="GetFreeSol" className="h-10 w-auto" />
              <span className="text-white font-bold text-xl">Admin Swap</span>
            </div>
          </Link>
          <div className="flex items-center gap-4">
            <div className="bg-purple-800/50 border border-purple-500/30 rounded-lg px-4 py-2">
              <span className="text-purple-200 text-sm">Platform Wallet</span>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-lg mx-auto">
          <div className="bg-gradient-to-br from-purple-800/40 to-purple-900/60 backdrop-blur-sm rounded-2xl border border-purple-500/30 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-400" />
                <h2 className="text-xl font-bold text-white">Jupiter Ultra Swap</h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchBalances}
                disabled={isLoadingBalances}
                className="p-2 text-purple-300 hover:text-white hover:bg-purple-800/30"
              >
                <RefreshCw className={cn("h-5 w-5", isLoadingBalances && "animate-spin")} />
              </Button>
            </div>

            <div className="space-y-5">
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
                <div className="flex items-center gap-3 bg-purple-900/30 border border-purple-500/30 rounded-lg p-4">
                  <TokenSelector 
                    token={fromToken} 
                    onSelect={(token) => {
                      if (token.address === toToken.address) {
                        setToToken(fromToken);
                        setFromToken(token);
                        setFromAmount(toAmount);
                        setToAmount(fromAmount);
                        setQuote(null);
                      } else {
                        setFromToken(token);
                      }
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
                  />
                </div>
              </div>

              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={swapTokens}
                  className="text-purple-300 hover:text-white hover:bg-purple-800/30 rounded-full"
                >
                  <ArrowDownUp className="h-5 w-5" />
                </Button>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-purple-300">Receive:</label>
                <div className="flex items-center gap-3 bg-purple-900/30 border border-purple-500/30 rounded-lg p-4">
                  <TokenSelector 
                    token={toToken} 
                    onSelect={(token) => {
                      if (token.address === fromToken.address) {
                        setFromToken(toToken);
                        setToToken(token);
                        setFromAmount(toAmount);
                        setToAmount(fromAmount);
                        setQuote(null);
                      } else {
                        setToToken(token);
                      }
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
                  />
                </div>
              </div>

              {isLoadingQuote && (
                <div className="flex items-center justify-center py-2">
                  <Loader2 className="h-5 w-5 animate-spin text-purple-300" />
                  <span className="ml-2 text-purple-200 text-sm">Getting quote...</span>
                </div>
              )}

              {quote && (
                <div className="space-y-2 bg-purple-950/30 border border-purple-500/20 rounded-lg p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-purple-300">Rate:</span>
                    <span className="text-white">
                      1 {fromToken.symbol} ≈ {(parseFloat(toAmount) / parseFloat(fromAmount) || 0).toFixed(6)} {toToken.symbol}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-purple-300">Network Fee:</span>
                    <span className="text-white">{networkFee.toFixed(6)} SOL</span>
                  </div>
                  {quote.platformFee && quote.platformFee.amount !== "0" && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-purple-300">Platform Fee:</span>
                      <span className="text-green-400">
                        {(parseInt(quote.platformFee.amount) / Math.pow(10, quote.platformFee.mint === 'So11111111111111111111111111111111111111112' ? 9 : 6)).toFixed(6)} {quote.platformFee.mint === 'So11111111111111111111111111111111111111112' ? 'SOL' : 'Token'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <Button
                onClick={handleSwap}
                disabled={!quote || isSwapping || isLoadingQuote}
                className="w-full bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white py-6 text-lg font-semibold rounded-xl disabled:opacity-50"
              >
                {isSwapping ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Swapping...
                  </>
                ) : (
                  'Swap'
                )}
              </Button>
            </div>
          </div>

          <div className="mt-6 text-center">
            <Link href="/">
              <Button variant="ghost" className="text-purple-300 hover:text-white">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
