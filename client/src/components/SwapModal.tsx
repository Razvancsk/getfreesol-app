import { useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowDownUp, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';

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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Swap Tokens</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">From</label>
            <div className="flex gap-2">
              <select
                className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={fromToken.address}
                onChange={(e) => {
                  const token = POPULAR_TOKENS.find(t => t.address === e.target.value);
                  if (token) setFromToken(token);
                }}
              >
                {POPULAR_TOKENS.map(token => (
                  <option key={token.address} value={token.address}>
                    {token.symbol}
                  </option>
                ))}
              </select>
              <Input
                type="number"
                placeholder="0.00"
                value={fromAmount}
                onChange={(e) => {
                  setFromAmount(e.target.value);
                  getQuote(e.target.value);
                }}
                className="flex-1"
                data-testid="input-swap-from-amount"
              />
            </div>
          </div>

          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={swapTokens}
              data-testid="button-swap-direction"
            >
              <ArrowDownUp className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">To</label>
            <div className="flex gap-2">
              <select
                className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={toToken.address}
                onChange={(e) => {
                  const token = POPULAR_TOKENS.find(t => t.address === e.target.value);
                  if (token) setToToken(token);
                }}
              >
                {POPULAR_TOKENS.map(token => (
                  <option key={token.address} value={token.address}>
                    {token.symbol}
                  </option>
                ))}
              </select>
              <Input
                type="number"
                placeholder="0.00"
                value={toAmount}
                readOnly
                className="flex-1 bg-muted"
                data-testid="input-swap-to-amount"
              />
            </div>
          </div>

          {isLoadingQuote && (
            <div className="text-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
              Getting quote...
            </div>
          )}

          <Button
            onClick={handleSwap}
            disabled={!publicKey || !quote || isSwapping || isLoadingQuote}
            className="w-full"
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
            <p className="text-sm text-center text-muted-foreground">
              Connect your wallet to swap
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
