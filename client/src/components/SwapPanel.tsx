import { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowDownUp, Loader2, RefreshCw, Search, ChevronDown, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { VersionedTransaction, Transaction, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, createCloseAccountInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';

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
        data-testid={`button-token-selector-${label.toLowerCase()}`}
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

export function SwapPanel() {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
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

  useEffect(() => {
    if (!quote || !fromAmount || parseFloat(fromAmount) <= 0) return;

    const refreshInterval = setInterval(() => {
      console.log('🔄 Auto-refreshing quote for live prices...');
      getQuote(fromAmount);
    }, 10000);

    return () => clearInterval(refreshInterval);
  }, [quote, fromAmount, fromToken, toToken]);

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
    console.log('Balances fetched:', newBalances);
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
      console.log('🚀 Fetching Ultra Order:', orderUrl);
      
      const response = await fetch(orderUrl);
      console.log('Ultra Order response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Ultra Order API error:', response.status, errorText);
        
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
      
      const signatureFeeLamports = orderData.signatureFeeLamports || 5000;
      const prioritizationFeeLamports = orderData.prioritizationFeeLamports || 0;
      
      const transactionFeeLamports = signatureFeeLamports + prioritizationFeeLamports;
      const calculatedNetworkFee = transactionFeeLamports / 1e9;
      
      console.log('✅ Real network fee from Jupiter:', {
        signatureFeeLamports,
        prioritizationFeeLamports,
        transactionFeeLamports,
        networkFeeSOL: calculatedNetworkFee.toFixed(6)
      });
      
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
        description: 'Your quote is too old and has likely expired. Please get a fresh quote by adjusting the amount.',
        variant: 'destructive',
      });
      setQuote(null);
      setQuoteTimestamp(0);
      return;
    }

    setIsSwapping(true);
    try {
      if (!quote.transaction || !quote.requestId) {
        throw new Error('Invalid order: missing transaction or requestId');
      }

      console.log('🚀 Signing Ultra Swap transaction...');
      
      const transactionBuf = Buffer.from(quote.transaction, 'base64');
      const transaction = VersionedTransaction.deserialize(transactionBuf);
      const signedTransaction = await signTransaction(transaction);
      const signedBase64 = Buffer.from(signedTransaction.serialize()).toString('base64');

      console.log('✅ Transaction signed, executing with requestId:', quote.requestId);
      
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
        console.log('✅ Ultra Swap successful:', signature);
        
        let rentReclaimed = 0;
        let closeSignature = '';
        
        const isSolOutput = toToken.address === 'So11111111111111111111111111111111111111112';
        const isNotSolInput = fromToken.address !== 'So11111111111111111111111111111111111111112';
        
        if (isSolOutput && isNotSolInput && signTransaction) {
          try {
            console.log('🔍 Checking if source token account is now empty...');
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const fromMint = new PublicKey(fromToken.address);
            const tokenAccountAddress = await getAssociatedTokenAddress(fromMint, publicKey);
            
            const accountInfo = await connection.getAccountInfo(tokenAccountAddress);
            
            if (accountInfo) {
              const tokenAccountData = await connection.getParsedAccountInfo(tokenAccountAddress);
              const parsedData = tokenAccountData.value?.data;
              
              if (parsedData && 'parsed' in parsedData) {
                const balance = parsedData.parsed.info.tokenAmount?.uiAmount || 0;
                
                if (balance === 0) {
                  console.log('✅ Token account is empty, closing to reclaim rent...');
                  
                  const rentLamports = accountInfo.lamports;
                  
                  const closeIx = createCloseAccountInstruction(
                    tokenAccountAddress,
                    publicKey,
                    publicKey,
                    [],
                    TOKEN_PROGRAM_ID
                  );
                  
                  const closeTx = new Transaction().add(closeIx);
                  closeTx.feePayer = publicKey;
                  const latestBlockhash = await connection.getLatestBlockhash();
                  closeTx.recentBlockhash = latestBlockhash.blockhash;
                  
                  const signedCloseTx = await signTransaction(closeTx);
                  closeSignature = await connection.sendRawTransaction(signedCloseTx.serialize());
                  
                  await connection.confirmTransaction({
                    signature: closeSignature,
                    blockhash: latestBlockhash.blockhash,
                    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
                  });
                  
                  rentReclaimed = rentLamports / 1e9;
                  console.log(`✅ Account closed! Reclaimed ${rentReclaimed.toFixed(6)} SOL rent`);
                } else {
                  console.log(`ℹ️ Token account still has balance: ${balance}, not closing`);
                }
              }
            } else {
              console.log('ℹ️ Token account already closed or does not exist');
            }
          } catch (closeError: any) {
            console.error('⚠️ Could not auto-close account:', closeError?.message);
          }
        }
        
        toast({
          title: rentReclaimed > 0 ? 'Swap + Rent Reclaimed!' : 'Swap Successful!',
          description: (
            <div className="space-y-2">
              <p>Transaction confirmed on Solana blockchain</p>
              {rentReclaimed > 0 && (
                <p className="text-green-200 font-medium">
                  + {rentReclaimed.toFixed(6)} SOL rent recovered!
                </p>
              )}
              <div className="flex flex-col gap-1">
                <a 
                  href={`https://solscan.io/tx/${signature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-white hover:text-green-100 underline font-medium"
                >
                  View Swap Transaction →
                </a>
                {closeSignature && (
                  <a 
                    href={`https://solscan.io/tx/${closeSignature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-white hover:text-green-100 underline font-medium"
                  >
                    View Close Account Transaction →
                  </a>
                )}
              </div>
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

  return (
    <div className="w-full max-w-md md:max-w-xl lg:max-w-2xl mx-auto bg-gradient-to-br from-purple-800/30 to-purple-900/50 backdrop-blur-sm rounded-2xl border border-purple-500/30 p-6 md:p-8 shadow-2xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl md:text-2xl font-bold text-white">Swap</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchBalances}
          disabled={isLoadingBalances}
          className="p-2 text-purple-300 hover:text-white hover:bg-purple-800/30"
          data-testid="button-refresh-swap-balances"
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
          <div className="flex items-center gap-3 bg-purple-900/30 border border-purple-500/30 rounded-lg p-3 md:p-4">
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
              className="flex-1 bg-transparent border-none text-right text-white text-2xl md:text-3xl font-medium focus-visible:ring-0 focus-visible:ring-offset-0 p-0"
              data-testid="input-swap-from-amount"
            />
          </div>
        </div>

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

        <div className="space-y-2">
          <label className="text-sm text-purple-300">Receive:</label>
          <div className="flex items-center gap-3 bg-purple-900/30 border border-purple-500/30 rounded-lg p-3 md:p-4">
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
              className="flex-1 bg-transparent border-none text-right text-white text-2xl md:text-3xl font-medium focus-visible:ring-0 focus-visible:ring-offset-0 p-0"
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
          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold h-12 md:h-14 text-lg md:text-xl rounded-lg"
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
  );
}
