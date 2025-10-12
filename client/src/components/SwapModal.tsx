import { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogHeader, DialogTitle, DialogPortal, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowDownUp, Loader2, X, RefreshCw, Search, ChevronDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { cn } from '@/lib/utils';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';
import { useQuery } from '@tanstack/react-query';

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
  balances
}: { 
  token: TokenInfo; 
  onSelect: (token: TokenInfo) => void; 
  label: string;
  balances: Record<string, number>;
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

  const searchResults = modalSearchQuery.trim().length > 0 && modalSearchData?.tokens 
    ? modalSearchData.tokens 
    : POPULAR_TOKENS;

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
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowSearchModal(false)} />
          <div className="relative bg-gradient-to-br from-purple-900 via-purple-800 to-purple-900 rounded-lg w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
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
                  placeholder="wen"
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
  
  const [fromToken, setFromToken] = useState<TokenInfo>(POPULAR_TOKENS[0]);
  const [toToken, setToToken] = useState<TokenInfo>(POPULAR_TOKENS[1]);
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [quote, setQuote] = useState<any>(null);
  const [balances, setBalances] = useState<Record<string, number>>({});

  // Fetch token balances
  useEffect(() => {
    if (!publicKey || !connection) return;

    const fetchBalances = async () => {
      const newBalances: Record<string, number> = {};
      
      for (const token of POPULAR_TOKENS) {
        try {
          if (token.address === 'So11111111111111111111111111111111111111112') {
            // SOL balance
            const balance = await connection.getBalance(publicKey);
            newBalances[token.address] = balance / Math.pow(10, 9);
          } else {
            // SPL Token balance
            const tokenMint = new PublicKey(token.address);
            const ata = await getAssociatedTokenAddress(tokenMint, publicKey);
            try {
              const accountInfo = await getAccount(connection, ata);
              newBalances[token.address] = Number(accountInfo.amount) / Math.pow(10, token.decimals);
            } catch {
              newBalances[token.address] = 0;
            }
          }
        } catch (error) {
          console.error(`Error fetching balance for ${token.symbol}:`, error);
          newBalances[token.address] = 0;
        }
      }
      
      setBalances(newBalances);
    };

    fetchBalances();
  }, [publicKey, connection, open]);

  const getQuote = async (amount: string) => {
    if (!amount || parseFloat(amount) <= 0) {
      setToAmount('');
      setQuote(null);
      return;
    }

    setIsLoadingQuote(true);
    try {
      const inputAmount = Math.floor(parseFloat(amount) * Math.pow(10, fromToken.decimals));
      
      const quoteUrl = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${fromToken.address}&outputMint=${toToken.address}&amount=${inputAmount}&slippageBps=50`;
      console.log('Fetching quote from:', quoteUrl);
      
      const response = await fetch(quoteUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      console.log('Quote response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Quote API error:', response.status, errorText);
        throw new Error(`Failed to get quote: ${errorText || response.statusText}`);
      }
      
      const quoteData = await response.json();
      console.log('Quote data received:', quoteData);
      
      if (!quoteData || !quoteData.outAmount) {
        throw new Error('No routes found for this swap');
      }
      
      setQuote(quoteData);
      
      const outAmount = parseFloat(quoteData.outAmount) / Math.pow(10, toToken.decimals);
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
    } finally {
      setIsLoadingQuote(false);
    }
  };

  const handleSwap = async () => {
    if (!publicKey || !signTransaction || !quote) return;

    setIsSwapping(true);
    try {
      const response = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: publicKey.toString(),
          wrapAndUnwrapSol: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get swap transaction: ${errorText || response.statusText}`);
      }

      const { swapTransaction } = await response.json();
      const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

      const signedTransaction = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      
      await connection.confirmTransaction(signature, 'confirmed');

      toast({
        title: 'Success!',
        description: `Swapped ${fromAmount} ${fromToken.symbol} for ${toAmount} ${toToken.symbol}`,
      });

      setFromAmount('');
      setToAmount('');
      setQuote(null);
      onOpenChange(false);
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
              <ArrowDownUp className="h-5 w-5 text-white" />
              <DialogTitle className="text-white text-xl">Trade SOL</DialogTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => getQuote(fromAmount)}
              className="text-purple-300 hover:text-white hover:bg-purple-800/30"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </DialogHeader>
          
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none text-white">
            <X className="h-4 w-4" />
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
                    setFromAmount(balance.toString());
                    getQuote(balance.toString());
                  }}
                  className="px-3 py-1 bg-purple-800/50 hover:bg-purple-700/50 text-purple-200 hover:text-white rounded text-xs font-medium transition-colors"
                >
                  MAX
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-purple-900/30 border border-purple-500/30 rounded-lg p-3">
              <TokenSelector token={fromToken} onSelect={setFromToken} label="From" balances={balances} />
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
              <TokenSelector token={toToken} onSelect={setToToken} label="To" balances={balances} />
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

          {isLoadingQuote && (
            <div className="text-center text-sm text-purple-300 py-2">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
              Getting quote...
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
