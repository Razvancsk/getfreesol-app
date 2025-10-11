import { useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogHeader, DialogTitle, DialogPortal, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowDownUp, Loader2, X, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { cn } from '@/lib/utils';

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
    address: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
    symbol: 'mSOL',
    name: 'Marinade SOL',
    decimals: 9,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png'
  },
];

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

  const getQuote = async (amount: string) => {
    if (!amount || parseFloat(amount) <= 0) {
      setToAmount('');
      setQuote(null);
      return;
    }

    setIsLoadingQuote(true);
    try {
      const inputAmount = Math.floor(parseFloat(amount) * Math.pow(10, fromToken.decimals));
      
      const response = await fetch(
        `https://quote-api.jup.ag/v6/quote?inputMint=${fromToken.address}&outputMint=${toToken.address}&amount=${inputAmount}&slippageBps=50`
      );
      
      if (!response.ok) throw new Error('Failed to fetch quote');
      
      const quoteData = await response.json();
      setQuote(quoteData);
      
      const outAmount = parseFloat(quoteData.outAmount) / Math.pow(10, toToken.decimals);
      setToAmount(outAmount.toFixed(6));
    } catch (error) {
      console.error('Quote error:', error);
      toast({
        title: 'Error',
        description: 'Failed to get swap quote',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingQuote(false);
    }
  };

  const handleSwap = async () => {
    if (!publicKey || !signTransaction || !quote) return;

    setIsSwapping(true);
    try {
      const response = await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: publicKey.toString(),
          wrapAndUnwrapSol: true,
        }),
      });

      if (!response.ok) throw new Error('Failed to get swap transaction');

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
            "fixed left-[50%] top-[50%] z-50 grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border border-purple-500/50 bg-gradient-to-br from-purple-900/95 to-purple-800/95 backdrop-blur-xl p-6 shadow-2xl duration-200",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg"
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
        
        <div className="space-y-4">
          {/* Buy/Sell Toggle */}
          <div className="flex gap-2 bg-purple-900/50 p-1 rounded-lg">
            <button
              onClick={() => {
                setFromToken(POPULAR_TOKENS.find(t => t.symbol === 'USDC') || POPULAR_TOKENS[1]);
                setToToken(POPULAR_TOKENS[0]); // SOL
              }}
              className="flex-1 py-2 px-4 rounded-md bg-green-600 hover:bg-green-700 text-white font-medium transition-colors"
            >
              Buy SOL
            </button>
            <button
              onClick={() => {
                setFromToken(POPULAR_TOKENS[0]); // SOL
                setToToken(POPULAR_TOKENS.find(t => t.symbol === 'USDC') || POPULAR_TOKENS[1]);
              }}
              className="flex-1 py-2 px-4 rounded-md bg-purple-700/50 hover:bg-purple-700 text-purple-200 hover:text-white font-medium transition-colors"
            >
              Sell SOL
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm text-purple-300">Amount ({fromToken.symbol})</label>
              <button className="text-xs text-purple-300 hover:text-white">MAX</button>
            </div>
            <Input
              type="number"
              placeholder="0.00"
              value={fromAmount}
              onChange={(e) => {
                setFromAmount(e.target.value);
                getQuote(e.target.value);
              }}
              className="w-full bg-purple-900/30 border-purple-500/30 text-white text-lg h-12 rounded-lg"
              data-testid="input-swap-from-amount"
            />
          </div>

          <div className="space-y-3">
            <label className="text-sm text-purple-300">You receive ({toToken.symbol})</label>
            <Input
              type="number"
              placeholder="0.00"
              value={toAmount}
              readOnly
              className="w-full bg-purple-900/30 border-purple-500/30 text-white text-lg h-12 rounded-lg"
              data-testid="input-swap-to-amount"
            />
          </div>

          {/* Token Selection */}
          <div className="flex gap-2">
            <select
              className="flex-1 h-10 rounded-md border border-purple-500/30 bg-purple-900/40 text-white px-3 py-2 text-sm"
              value={fromToken.address}
              onChange={(e) => {
                const token = POPULAR_TOKENS.find(t => t.address === e.target.value);
                if (token) setFromToken(token);
              }}
            >
              {POPULAR_TOKENS.map(token => (
                <option key={token.address} value={token.address}>
                  From: {token.symbol}
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              size="sm"
              onClick={swapTokens}
              className="text-purple-300 hover:text-white hover:bg-purple-800/30"
              data-testid="button-swap-direction"
            >
              <ArrowDownUp className="h-4 w-4" />
            </Button>
            <select
              className="flex-1 h-10 rounded-md border border-purple-500/30 bg-purple-900/40 text-white px-3 py-2 text-sm"
              value={toToken.address}
              onChange={(e) => {
                const token = POPULAR_TOKENS.find(t => t.address === e.target.value);
                if (token) setToToken(token);
              }}
            >
              {POPULAR_TOKENS.map(token => (
                <option key={token.address} value={token.address}>
                  To: {token.symbol}
                </option>
              ))}
            </select>
          </div>

          {isLoadingQuote && (
            <div className="text-center text-sm text-purple-300">
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
              `Buy ${toToken.symbol}`
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
