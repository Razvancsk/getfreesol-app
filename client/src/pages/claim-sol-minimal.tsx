import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Coins, Wallet, Search, CheckCircle, ExternalLink, AlertTriangle, RefreshCw, Flame, Image, Trash2, ArrowLeftRight, ArrowUpDown } from "lucide-react";
import { Connection, VersionedTransaction } from '@solana/web3.js';

interface EmptyTokenAccount {
  id: number;
  accountAddress: string;
  mintAddress: string;
  tokenSymbol?: string;
  tokenName?: string;
  rentAmount: number;
  balance: number;
  decimals: number;
}

interface ScanResult {
  success: boolean;
  walletAddress: string;
  totalAccounts: number;
  emptyAccounts: number;
  totalReclaimable: string;
  accounts: EmptyTokenAccount[];
  scannedAt: string;
}

interface TransactionRecord {
  signature: string;
  solRecovered: number;
  accountsClosed: number;
  processedAt: string;
}

interface RefundStats {
  totalSolRecovered: number;
  totalAccountsClaimed: number;
  recentTransactions: TransactionRecord[];
}

interface Token {
  mint: string;
  symbol: string;
  name: string;
  balance: number;
  decimals: number;
  image?: string;
}

interface JupiterToken {
  address: string;
  symbol: string;
  name: string;
  logoURI: string;
  decimals: number;
}

interface SwapForm {
  fromMint: string;
  toMint: string;
  fromValue: string;
  toValue: string;
}

declare global {
  interface Window {
    solana?: any;
    Jupiter?: any;
  }
}

export default function SolRefund() {
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [activeTab, setActiveTab] = useState<'claim' | 'burnTokens' | 'burnNfts' | 'swap'>('claim');
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const [selectedNfts, setSelectedNfts] = useState<Set<string>>(new Set());
  const [tokenList, setTokenList] = useState<Token[]>([]);
  const [nftList, setNftList] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isBurning, setIsBurning] = useState(false);
  const [selectedTokenMint, setSelectedTokenMint] = useState('So11111111111111111111111111111111111111112'); // Default to SOL
  
  // Jupiter Terminal states
  const [jupiterTokens, setJupiterTokens] = useState<JupiterToken[]>([]);
  const [swapForm, setSwapForm] = useState<SwapForm>({
    fromMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    toMint: 'So11111111111111111111111111111111111111112',   // SOL
    fromValue: '',
    toValue: ''
  });
  const [showTokenSelector, setShowTokenSelector] = useState<'from' | 'to' | null>(null);
  const [tokenSearchQuery, setTokenSearchQuery] = useState('');
  const [slippage, setSlippage] = useState(0.5);
  const [jitoPriority, setJitoPriority] = useState('Normal');
  const [manualJitoFee, setManualJitoFee] = useState('0.0001');
  const [showSlippageModal, setShowSlippageModal] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Load Jupiter tokens
  useEffect(() => {
    const loadJupiterTokens = async () => {
      try {
        const response = await fetch('https://token.jup.ag/strict');
        const tokens = await response.json();
        setJupiterTokens(tokens);
      } catch (error) {
        console.error('Failed to load Jupiter tokens:', error);
      }
    };
    
    loadJupiterTokens();
  }, []);

  // Filter tokens based on search
  const filteredTokens = useMemo(() => {
    if (!tokenSearchQuery.trim()) {
      // Show top 20 popular tokens by default
      const popularTokenAddresses = [
        'So11111111111111111111111111111111111111112', // SOL
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
        'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',  // mSOL
        'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',  // JUP
        '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', // ETH (Portal)
        'A9mUU4qviSctJVPJdBJWkb28deg915LYJKrzQ19ji3FM', // USDCet
        'Duic7t8deboCGLGqYNfC41TzW2GbfSmyXwG6JVsM8kC8', // PYTH
        '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', // RAY
        '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj'  // stSOL
      ];
      
      return jupiterTokens
        .filter(token => popularTokenAddresses.includes(token.address))
        .sort((a, b) => popularTokenAddresses.indexOf(a.address) - popularTokenAddresses.indexOf(b.address))
        .slice(0, 20);
    }
    
    const query = tokenSearchQuery.toLowerCase();
    return jupiterTokens
      .filter(token => 
        token.symbol.toLowerCase().includes(query) ||
        token.name.toLowerCase().includes(query) ||
        token.address.toLowerCase().includes(query)
      )
      .slice(0, 50); // Limit search results
  }, [jupiterTokens, tokenSearchQuery]);

  // Get current tokens for display
  const swapInputToken = jupiterTokens.find(t => t.address === swapForm.fromMint) || {
    address: swapForm.fromMint,
    symbol: 'USDC',
    name: 'USD Coin',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
    decimals: 6
  };

  const swapOutputToken = jupiterTokens.find(t => t.address === swapForm.toMint) || {
    address: swapForm.toMint,
    symbol: 'SOL',
    name: 'Solana',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    decimals: 9
  };

  // Select token function
  const selectToken = (token: JupiterToken, type: 'from' | 'to') => {
    if (type === 'from') {
      setSwapForm(prev => ({ ...prev, fromMint: token.address }));
    } else {
      setSwapForm(prev => ({ ...prev, toMint: token.address }));
    }
    setShowTokenSelector(null);
    setTokenSearchQuery('');
  };

  // Wallet connection functions
  const connectWallet = async () => {
    try {
      if (!window.solana) {
        toast({
          title: "Phantom Wallet Required",
          description: "Please install Phantom wallet extension to continue.",
          variant: "destructive",
        });
        return;
      }

      const response = await window.solana.connect();
      setWalletAddress(response.publicKey.toString());
      setIsConnected(true);
      console.log('SOL Refund: Wallet connected successfully');
      
      toast({
        title: "Wallet Connected",
        description: `Connected to ${response.publicKey.toString().slice(0, 8)}...`,
      });
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      toast({
        title: "Connection Failed",
        description: "Failed to connect to Phantom wallet.",
        variant: "destructive",
      });
    }
  };

  const disconnectWallet = () => {
    try {
      if (window.solana) {
        window.solana.disconnect();
      }
      setWalletAddress('');
      setIsConnected(false);
      setScanResult(null);
      setSelectedTokens(new Set());
      setSelectedNfts(new Set());
      setTokenList([]);
      setNftList([]);
      console.log('SOL Refund: Wallet disconnected');
      
      toast({
        title: "Wallet Disconnected",
        description: "Your wallet has been disconnected.",
      });
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  };

  // Check wallet connection on component mount
  useEffect(() => {
    const checkWalletConnection = async () => {
      try {
        if (window.solana && window.solana.isPhantom) {
          const response = await window.solana.connect({ onlyIfTrusted: true });
          if (response.publicKey) {
            setWalletAddress(response.publicKey.toString());
            setIsConnected(true);
            console.log('SOL Refund: Initial wallet check - connected');
          } else {
            console.log('SOL Refund: Initial wallet check - not connected');
          }
        }
      } catch (error) {
        console.log('SOL Refund: Initial wallet check - not connected');
      }
    };

    checkWalletConnection();

    // Listen for wallet connection changes
    if (window.solana) {
      window.solana.on('connect', () => {
        console.log('Wallet connect event detected');
        checkWalletConnection();
      });
      
      window.solana.on('disconnect', () => {
        console.log('Wallet disconnect event detected');
        setIsConnected(false);
        setWalletAddress('');
        setScanResult(null);
      });
    }

    return () => {
      if (window.solana) {
        window.solana.removeAllListeners('connect');
        window.solana.removeAllListeners('disconnect');
      }
    };
  }, []);

  // Initialize Jupiter Terminal after wallet connection
  useEffect(() => {
    if (isConnected && walletAddress) {
      const initJupiter = () => {
        console.log('SOL Refund: Wallet verified as connected');
        
        if (window.Jupiter) {
          let initAttempts = 0;
          const maxAttempts = 10;
          
          const attemptInit = () => {
            initAttempts++;
            console.log(`Attempting Jupiter initialization (${initAttempts}/${maxAttempts})`);
            
            try {
              console.log('Jupiter found, initializing terminal...');
              
              // Initialize Jupiter Terminal
              window.Jupiter.init({
                displayMode: 'integrated',
                integratedTargetId: 'jupiter-terminal',
                endpoint: 'https://mainnet.helius-rpc.com/?api-key=1a05493f-1a9e-4795-b7ad-e7b4b5b5d5c5',
                platformFeeAndAccounts: {
                  feeBps: 50,
                  feeAccounts: [
                    {
                      pubkey: 'GJRLvDvnw3XNpSJFHGfZR2Q2Q3Wm3Q7J5y5v6v7v8v9v',
                      bps: 50
                    }
                  ]
                },
                passthroughWalletContextState: window.solana,
                onSuccess: ({ txid }: { txid: string }) => {
                  console.log('Swap transaction successful:', txid);
                  toast({
                    title: "Swap Successful",
                    description: `Transaction: ${txid.slice(0, 8)}...`,
                  });
                },
                onSwapError: ({ error }: { error: any }) => {
                  console.error('Swap error:', error);
                  toast({
                    title: "Swap Failed",
                    description: error.message || "Unknown error occurred",
                    variant: "destructive",
                  });
                }
              });
              
              console.log('Jupiter Terminal initialized successfully');
              console.log('Wallet passed through Jupiter initialization');
              
              // Update form to sync with Jupiter
              setSwapForm(prev => {
                const newForm = {
                  ...prev,
                  fromMint: prev.fromMint || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                  toMint: prev.toMint || 'So11111111111111111111111111111111111111112'
                };
                console.log('Jupiter form updated:', newForm);
                return newForm;
              });
              
              // Prevent screen transitions
              setTimeout(() => {
                console.log('Jupiter screen transition prevention activated');
                const jupiterElement = document.getElementById('jupiter-terminal');
                if (jupiterElement) {
                  const observer = new MutationObserver(() => {
                    const screens = jupiterElement.querySelectorAll('[data-testid*="screen"]');
                    screens.forEach(screen => {
                      if (screen.textContent?.includes('Swap')) {
                        (screen as HTMLElement).style.display = 'block';
                      }
                    });
                  });
                  observer.observe(jupiterElement, { childList: true, subtree: true });
                }
              }, 1000);
              
              // Gentle monitoring after initial setup
              setTimeout(() => {
                console.log('Starting gentle monitoring after Jupiter settlement');
              }, 3000);
              
            } catch (error) {
              console.error(`Jupiter init attempt ${initAttempts} failed:`, error);
              if (initAttempts < maxAttempts) {
                setTimeout(attemptInit, 2000);
              } else {
                console.error('Jupiter Terminal initialization failed after all attempts');
              }
            }
          };
          
          attemptInit();
        } else {
          console.log('Jupiter not available, retrying...');
          setTimeout(initJupiter, 1000);
        }
      };
      
      // Delay to ensure wallet is fully ready
      setTimeout(initJupiter, 500);
    }
  }, [isConnected, walletAddress, toast]);

  // Fetch stats
  const { data: stats } = useQuery<RefundStats>({
    queryKey: ['/api/sol-refund/stats'],
    refetchInterval: 5000,
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
            GET YOUR <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">SOL</span>
          </h1>
          <p className="text-xl text-purple-200 mb-8">
            Reclaim your SOL from empty token accounts • Burn unused tokens • Swap on Jupiter
          </p>
          
          {/* Wallet Connection */}
          <div className="flex justify-center mb-8">
            {!isConnected ? (
              <Button
                onClick={connectWallet}
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-8 py-3 text-lg font-semibold rounded-lg transition-all duration-200 transform hover:scale-105 shadow-lg"
              >
                <Wallet className="h-5 w-5 mr-2" />
                Connect Phantom Wallet
              </Button>
            ) : (
              <div className="flex items-center space-x-4">
                <div className="bg-gradient-to-r from-purple-800/50 to-blue-800/50 backdrop-blur-sm rounded-lg px-6 py-3 border border-purple-500/30">
                  <div className="flex items-center space-x-3">
                    <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                    <div>
                      <p className="text-sm text-purple-200">Connected Wallet</p>
                      <p className="text-white font-mono text-sm">
                        {walletAddress.slice(0, 8)}...{walletAddress.slice(-8)}
                      </p>
                    </div>
                  </div>
                </div>
                <Button
                  onClick={disconnectWallet}
                  variant="outline"
                  className="border-purple-500/50 text-purple-200 hover:bg-purple-500/20"
                >
                  Disconnect
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        {isConnected && (
          <div className="flex justify-center mb-8">
            <div className="bg-gradient-to-r from-purple-800/30 to-blue-800/30 backdrop-blur-sm rounded-xl p-2 border border-purple-500/20">
              <div className="flex space-x-2">
                {[
                  { id: 'claim' as const, label: 'Claim SOL', icon: Coins },
                  { id: 'burnTokens' as const, label: 'Burn Tokens', icon: Flame },
                  { id: 'burnNfts' as const, label: 'Burn NFTs', icon: Image },
                  { id: 'swap' as const, label: 'Swap', icon: ArrowLeftRight }
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                      activeTab === id
                        ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg transform scale-105'
                        : 'text-purple-200 hover:text-white hover:bg-purple-500/20'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Swap Interface */}
        {activeTab === 'swap' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* DexScreener Chart */}
            <div className="bg-black rounded-xl border border-gray-700/50 overflow-hidden">
              <iframe
                key={`chart-${selectedTokenMint}-${Date.now()}`}
                src={`https://dexscreener.com/solana/${selectedTokenMint}?embed=1&theme=dark&trades=1&info=0&controls=0&refresh=${Date.now()}`}
                style={{
                  width: '100%',
                  height: '600px',
                  border: 'none',
                  backgroundColor: 'transparent'
                }}
                allow="clipboard-write"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                loading="lazy"
              />
            </div>

            {/* Jupiter Terminal */}
            <div className="relative overflow-hidden rounded-xl border border-purple-600/30 shadow-2xl w-fit mx-auto" style={{ width: '390px', height: '577px' }}>
              <div 
                id="jupiter-terminal" 
                style={{ 
                  width: '390px', 
                  height: '577px'
                }}
              />
            </div>
          </div>
        )}

        {/* Settings Modal - Slippage & Jito Settings */}
        {showSlippageModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold text-white mb-6">Swap Settings</h2>
              
              {/* Slippage Settings */}
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-white font-medium">Slippage Tolerance</h3>
                  <span className="text-gray-400 text-sm">[%]</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={slippage}
                    onChange={(e) => setSlippage(Number(e.target.value))}
                    className="px-3 py-2 w-20 bg-gray-800 text-white rounded-lg text-sm border border-gray-600"
                    min="0.1"
                    max="50"
                    step="0.1"
                  />
                </div>
              </div>

              {/* Jito Fee */}
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-white font-medium">Jito Fee</h3>
                  <span className="text-yellow-400">⚡</span>
                  <span className="text-gray-400 text-sm">[SOL]</span>
                </div>
                <div className="flex items-center gap-2 mb-3 overflow-x-auto">
                  {['Slow', 'Normal', 'Fast', 'Turbo'].map((priority) => (
                    <button
                      key={priority}
                      onClick={() => setJitoPriority(priority)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                        jitoPriority === priority
                          ? 'bg-white text-black'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-600'
                      }`}
                    >
                      {priority}
                    </button>
                  ))}
                  <input
                    type="number"
                    value={manualJitoFee}
                    className="px-3 py-2 w-20 bg-gray-800 text-white rounded-lg text-sm border border-gray-600 flex-shrink-0 focus:border-white focus:outline-none focus:ring-1 focus:ring-white"
                    step="0.0001"
                    min="0"
                    onChange={(e) => setManualJitoFee(e.target.value)}
                  />
                </div>
              </div>

              {/* Close button */}
              <div className="flex justify-end">
                <button
                  onClick={() => setShowSlippageModal(false)}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Statistics Cards */}
        {stats && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6 text-center">
                <h3 className="text-lg font-semibold text-white mb-2">TOTAL SOL RECOVERED</h3>
                <div className="text-3xl font-bold text-white mb-1">{stats.totalSolRecovered.toLocaleString()}</div>
                <div className="text-sm text-white">SOL</div>
              </div>
              <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6 text-center">
                <h3 className="text-lg font-semibold text-white mb-2">TOTAL ACCOUNTS CLAIMED</h3>
                <div className="text-3xl font-bold text-white">{stats.totalAccountsClaimed.toLocaleString()}</div>
              </div>
            </div>
          </div>
        )}

        {/* What is this rent explanation */}
        <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
          <div className="flex items-center space-x-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-purple-400" />
            <h3 className="text-lg font-semibold text-white">What is this rent?</h3>
          </div>
          <div className="space-y-3 text-white">
            <p className="text-sm">Every time you receive a token, NFT, or memecoin, Solana creates a token account that requires ~0.002 SOL rent deposit (approximately 2 years worth of rent).</p>
            <p className="text-sm">When you sell or transfer all tokens, the account becomes empty but the rent remains locked. Our tool safely closes these empty accounts and returns your SOL.</p>
            <p className="text-sm font-medium text-white">Only accounts with 0 tokens are eligible for closure - your funds are completely safe.</p>
          </div>
        </div>
      </div>
    </div>
  );
}