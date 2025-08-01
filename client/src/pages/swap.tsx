import React, { useState, useEffect } from 'react';
import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Link } from 'wouter';
import { ArrowUpDown, RefreshCw, Coins, Wallet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const connection = new Connection(
  import.meta.env.VITE_HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com'
);

const REFERRAL_ACCOUNT = 'EeGruK1u1DswLBKQ985ZHYvDkezDLKNFL9hMqMeSicji';

interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

interface Quote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: any;
  priceImpactPct: string;
  routePlan: any[];
}

const popularTokens: Token[] = [
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
    name: 'Tether USD',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png'
  }
];

export default function SwapPage() {
  const { toast } = useToast();
  
  // Wallet state management (similar to claim-sol page)
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  const [inputToken, setInputToken] = useState<Token>(popularTokens[0]);
  const [outputToken, setOutputToken] = useState<Token>(popularTokens[1]);
  const [inputAmount, setInputAmount] = useState<string>('');
  const [outputAmount, setOutputAmount] = useState<string>('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);

  // Wallet connection logic
  useEffect(() => {
    const checkWalletConnection = () => {
      if (window.solana?.isConnected) {
        const pubKey = window.solana.publicKey?.toString();
        if (pubKey) {
          setPublicKey(pubKey);
          setIsConnected(true);
        }
      }
    };

    checkWalletConnection();
    
    if (window.solana) {
      window.solana.on('connect', () => {
        const pubKey = window.solana?.publicKey?.toString();
        if (pubKey) {
          setPublicKey(pubKey);
          setIsConnected(true);
        }
      });

      window.solana.on('disconnect', () => {
        setPublicKey(null);
        setIsConnected(false);
      });
    }

    return () => {
      if (window.solana) {
        try {
          window.solana.off('connect', () => {});
          window.solana.off('disconnect', () => {});
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, []);

  // Connect wallet function
  const connectWallet = async () => {
    try {
      if (!window.solana?.isPhantom) {
        toast({
          title: "Phantom Wallet Required",
          description: "Please install Phantom wallet to continue.",
          variant: "destructive",
        });
        return;
      }

      await window.solana.connect();
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      toast({
        title: "Connection Failed", 
        description: "Failed to connect to Phantom wallet.",
        variant: "destructive",
      });
    }
  };
  
  // Get quote from Jupiter
  const getQuote = async () => {
    if (!inputAmount || !inputToken || !outputToken) return;
    
    setIsLoading(true);
    try {
      const amount = Math.floor(parseFloat(inputAmount) * Math.pow(10, inputToken.decimals));
      
      const response = await fetch(
        `https://quote-api.jup.ag/v6/quote?inputMint=${inputToken.address}&outputMint=${outputToken.address}&amount=${amount}&slippageBps=50&platformFeeBps=50`
      );
      
      if (!response.ok) throw new Error('Failed to get quote');
      
      const quoteData = await response.json();
      setQuote(quoteData);
      setOutputAmount((parseInt(quoteData.outAmount) / Math.pow(10, outputToken.decimals)).toFixed(6));
    } catch (error) {
      console.error('Quote error:', error);
      toast({
        title: 'Quote Error',
        description: 'Failed to get swap quote',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Execute swap
  const executeSwap = async () => {
    if (!publicKey || !quote || !window.solana) return;
    
    setIsSwapping(true);
    try {
      // Get swap transaction
      const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: publicKey,
          wrapAndUnwrapSol: true,
          feeAccount: REFERRAL_ACCOUNT,
        }),
      });

      if (!swapResponse.ok) throw new Error('Failed to get swap transaction');
      
      const { swapTransaction } = await swapResponse.json();
      
      // Deserialize and sign transaction
      const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
      
      // Sign with Phantom wallet
      const signedTransaction = await window.solana.signTransaction(transaction);
      
      // Send transaction
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      
      // Confirm transaction
      await connection.confirmTransaction(signature, 'confirmed');
      
      toast({
        title: 'Swap Successful',
        description: `Transaction: ${signature}`,
      });
      
      // Reset form
      setInputAmount('');
      setOutputAmount('');
      setQuote(null);
      
    } catch (error) {
      console.error('Swap error:', error);
      toast({
        title: 'Swap Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      });
    } finally {
      setIsSwapping(false);
    }
  };

  // Swap input/output tokens
  const swapTokens = () => {
    const temp = inputToken;
    setInputToken(outputToken);
    setOutputToken(temp);
    setInputAmount('');
    setOutputAmount('');
    setQuote(null);
  };

  // Auto-quote when input changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputAmount && parseFloat(inputAmount) > 0) {
        getQuote();
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [inputAmount, inputToken, outputToken]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-black p-4">
      {/* Navigation Header */}
      <div className="flex items-center justify-center space-x-4 pt-8 pb-4">
        <Button asChild className="bg-slate-600 hover:bg-slate-700 text-white text-sm">
          <Link href="/claim-sol">
            <Coins className="h-4 w-4 mr-2" />
            Claim SOL
          </Link>
        </Button>
        <Button asChild className="bg-purple-600 hover:bg-purple-700 text-white text-sm">
          <Link href="/swap">Swap</Link>
        </Button>
      </div>

      <div className="max-w-md mx-auto pt-8">
        <Card className="bg-black/40 backdrop-blur-sm border border-purple-500/30">
          <CardHeader>
            <CardTitle className="text-white text-center text-xl">SWAP</CardTitle>
            {/* Wallet Connection Status */}
            {!isConnected && (
              <div className="text-center pt-4">
                <Button
                  onClick={connectWallet}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <Wallet className="h-4 w-4 mr-2" />
                  Connect Wallet
                </Button>
              </div>
            )}
            {isConnected && publicKey && (
              <div className="text-center pt-2">
                <div className="bg-purple-800/60 backdrop-blur-sm rounded-lg px-3 py-1 text-white font-mono text-xs">
                  {publicKey.slice(0, 6)}...{publicKey.slice(-6)}
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {isConnected ? (
              <>
                {/* Input Token */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-purple-300">From</span>
                    <div className="flex items-center space-x-2">
                      {inputToken.logoURI && (
                        <img src={inputToken.logoURI} alt={inputToken.symbol} className="w-5 h-5" />
                      )}
                      <span className="text-sm text-white">{inputToken.symbol}</span>
                    </div>
                  </div>
                  <Input
                    value={inputAmount}
                    onChange={(e) => setInputAmount(e.target.value)}
                    placeholder="0.0"
                    className="bg-slate-800/50 border-slate-600 text-white text-lg"
                    type="number"
                  />
                </div>

                {/* Swap Button */}
                <div className="flex justify-center">
                  <Button
                    onClick={swapTokens}
                    size="sm"
                    className="bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/50"
                  >
                    <ArrowUpDown className="h-4 w-4" />
                  </Button>
                </div>

                {/* Output Token */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-purple-300">To</span>
                    <div className="flex items-center space-x-2">
                      {outputToken.logoURI && (
                        <img src={outputToken.logoURI} alt={outputToken.symbol} className="w-5 h-5" />
                      )}
                      <span className="text-sm text-white">{outputToken.symbol}</span>
                    </div>
                  </div>
                  <Input
                    value={outputAmount}
                    placeholder="0.0"
                    className="bg-slate-800/50 border-slate-600 text-white text-lg"
                    disabled
                  />
                </div>

                {/* Quote Info */}
                {quote && (
                  <div className="bg-slate-800/30 rounded-lg p-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-purple-300">Rate</span>
                      <span className="text-white">
                        1 {inputToken.symbol} = {(parseFloat(outputAmount) / parseFloat(inputAmount)).toFixed(6)} {outputToken.symbol}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-purple-300">Fee</span>
                      <span className="text-white">0.5%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-purple-300">Price Impact</span>
                      <span className="text-white">{parseFloat(quote.priceImpactPct).toFixed(2)}%</span>
                    </div>
                  </div>
                )}

                {/* Swap Button */}
                <Button
                  onClick={executeSwap}
                  disabled={!publicKey || !quote || isSwapping || isLoading}
                  className="w-full bg-gradient-to-br from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white py-3"
                >
                  {!publicKey ? (
                    'Connect Wallet'
                  ) : isSwapping ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      Swapping...
                    </>
                  ) : isLoading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      Getting Quote...
                    </>
                  ) : (
                    'SWAP'
                  )}
                </Button>

                {/* Popular Tokens */}
                <div className="space-y-2">
                  <span className="text-sm text-purple-300">Popular Tokens</span>
                  <div className="grid grid-cols-3 gap-2">
                    {popularTokens.map((token) => (
                      <Button
                        key={token.address}
                        onClick={() => {
                          if (inputToken.address !== token.address) {
                            setInputToken(token);
                          } else {
                            setOutputToken(token);
                          }
                        }}
                        size="sm"
                        className="bg-slate-700/50 hover:bg-slate-700/80 text-white border border-slate-600"
                      >
                        {token.symbol}
                      </Button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-purple-300">Connect your wallet to start swapping tokens</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}