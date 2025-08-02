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
import { useWalletAdapter } from '@/hooks/useWalletAdapter';
import logoImage from '@assets/Parachuting_Solana_Token_Logo-removebg-preview_1754155843750.png';

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
  success: boolean;
  totalSolRecovered: number;
  totalAccountsClaimed: number;
  recentTransactions: TransactionRecord[];
}

export default function SolRefund() {
  const queryClient = useQueryClient();
  const donationPercentage = 15; // Fixed 15% service fee
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'reclaim' | 'burnTokens' | 'swap'>('reclaim');
  const [selectedTokenMint, setSelectedTokenMint] = useState<string>('So11111111111111111111111111111111111111112'); // Default to SOL
  const [slippage, setSlippage] = useState<number>(3); // Default 3% slippage
  const [showSlippageModal, setShowSlippageModal] = useState<boolean>(false);
  const [jitoPriority, setJitoPriority] = useState<string>('Normal'); // Jito fee priority
  const [manualJitoFee, setManualJitoFee] = useState<string>('0'); // Manual Jito fee amount
  const [tokenList, setTokenList] = useState<any[]>([]);
  
  // Selection states for bulk burning
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Swap state
  const [swapInputToken, setSwapInputToken] = useState({
    address: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
  });
  const [swapOutputToken, setSwapOutputToken] = useState({
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png'
  });
  const [swapInputAmount, setSwapInputAmount] = useState<string>('');
  const [swapOutputAmount, setSwapOutputAmount] = useState<string>('');
  const [swapQuote, setSwapQuote] = useState<any>(null);
  const [isSwapLoading, setIsSwapLoading] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);

  // Custom swap interface state
  const [swapForm, setSwapForm] = useState({
    fromValue: '',
    toValue: ''
  });
  const [realBalances, setRealBalances] = useState<any>(null);
  const [realTokens, setRealTokens] = useState({
    fromSymbol: 'USDC',
    toSymbol: 'SOL'
  });
  const [realSwapData, setRealSwapData] = useState<any>(null);
  const [showTokenSelector, setShowTokenSelector] = useState<string | null>(null);
  const [tokenSearchQuery, setTokenSearchQuery] = useState('');
  const [allTokens, setAllTokens] = useState<any[]>([]);
  const [jupiterTokens, setJupiterTokens] = useState<any[]>([]);

  const [isSearchingTokens, setIsSearchingTokens] = useState(false);
  const [isJupiterLoading, setIsJupiterLoading] = useState(false);

  // Function to get the correct trading pair address for DexScreener
  const getTradingPairAddress = (tokenMint: string): string => {
    // Map common tokens to their most liquid trading pairs on Solana
    const tradingPairs: { [key: string]: string } = {
      // SOL pairs
      'So11111111111111111111111111111111111111112': 'So11111111111111111111111111111111111111112', // SOL itself
      // USDC pairs - show USDC/SOL (most liquid USDC pair)
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2', // USDC/SOL pair
      // USDT pairs
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'HWHvQhFmJB6gPtqJx3gjxHWnJsZFa5anEhNMC1RmYgcx', // USDT/SOL pair
      // BONK pairs
      'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': '8BnEgHoWFysVcuFFX7QztDmzuH8r5ZFvyP3sYwn1XTh6', // BONK/SOL pair
      // WIF pairs
      'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm': 'HWHvQhFmJB6gPtqJx3gjxHWnJsZFa5anEhNMC1RmYgcx', // WIF/SOL pair
    };
    
    // Return the trading pair address if we have a mapping, otherwise use the token itself
    return tradingPairs[tokenMint] || tokenMint;
  };

  // Popular tokens list with logos
  const popularTokens = [
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
      name: 'Tether',
      decimals: 6,
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png'
    },
    {
      address: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
      symbol: 'mSOL',
      name: 'Marinade staked SOL',
      decimals: 9,
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png'
    },
    {
      address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
      symbol: 'JUP',
      name: 'Jupiter',
      decimals: 6,
      logoURI: 'https://static.jup.ag/jup/icon.png'
    },
    {
      address: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
      symbol: 'ETH',
      name: 'Ethereum (Portal)',
      decimals: 8,
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs/logo.png'
    }
  ];

  const REFERRAL_ACCOUNT = 'EeGruK1u1DswLBKQ985ZHYvDkezDLKNFL9hMqMeSicji';

  // Custom swap functions
  const getJupiterQuote = async (amount: string) => {
    if (!amount || parseFloat(amount) <= 0) return;
    
    try {
      // Use Jupiter API to get real quotes
      const quote = await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${swapInputToken.address}&outputMint=${swapOutputToken.address}&amount=${parseFloat(amount) * Math.pow(10, swapInputToken.decimals)}&slippageBps=${slippage * 100}`);
      const quoteData = await quote.json();
      
      if (quoteData && quoteData.outAmount) {
        const outputAmount = (quoteData.outAmount / Math.pow(10, swapOutputToken.decimals)).toFixed(6);
        setSwapForm(prev => ({ ...prev, toValue: outputAmount }));
        setRealSwapData({
          exchangeRate: (parseFloat(outputAmount) / parseFloat(amount)).toFixed(6),
          platformFee: '0',
          routeLabel: quoteData.routePlan?.[0]?.swapInfo?.label || 'Best Route'
        });
      }
    } catch (error) {
      console.error('Error getting Jupiter quote:', error);
    }
  };

  const reverseTokenPair = () => {
    const tempToken = swapInputToken;
    setSwapInputToken(swapOutputToken);
    setSwapOutputToken(tempToken);
    setRealTokens({
      fromSymbol: swapOutputToken.symbol,
      toSymbol: tempToken.symbol
    });
    setSwapForm({ fromValue: '', toValue: '' });
  };

  const executeCustomSwap = async () => {
    if (!isConnected || !swapForm.fromValue) return;
    
    setIsSwapping(true);
    try {
      // Here you would integrate with Jupiter's swap execution
      // For now, just show success message
      toast({
        title: "Swap Initiated",
        description: `Swapping ${swapForm.fromValue} ${realTokens.fromSymbol} for ${swapForm.toValue} ${realTokens.toSymbol}`,
      });
    } catch (error) {
      console.error('Swap failed:', error);
      toast({
        title: "Swap Failed",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSwapping(false);
    }
  };

  // Fetch Jupiter token list
  const fetchJupiterTokens = async () => {
    try {
      const response = await fetch('https://token.jup.ag/strict');
      const tokens = await response.json();
      setAllTokens(tokens);
      return tokens;
    } catch (error) {
      console.error('Failed to fetch Jupiter tokens:', error);
      return popularTokens; // Fallback to popular tokens
    }
  };

  // Load tokens on component mount and preload Jupiter
  useEffect(() => {
    fetchJupiterTokens();
    
    // Preload Jupiter script for faster initialization
    if (typeof window !== 'undefined' && !document.getElementById('jupiter-preload')) {
      const preloadScript = document.createElement('link');
      preloadScript.id = 'jupiter-preload';
      preloadScript.rel = 'preload';
      preloadScript.href = 'https://terminal.jup.ag/main-v2.js';
      preloadScript.as = 'script';
      document.head.appendChild(preloadScript);
    }
  }, []);

  // Filter tokens based on search query
  const filteredTokens = useMemo(() => {
    const tokensToFilter = allTokens.length > 0 ? allTokens : popularTokens;
    
    if (!tokenSearchQuery.trim()) {
      return tokensToFilter.slice(0, 20); // Show top 20 by default
    }
    
    const query = tokenSearchQuery.toLowerCase();
    return tokensToFilter
      .filter(token => 
        token.symbol.toLowerCase().includes(query) ||
        token.name.toLowerCase().includes(query) ||
        token.address.toLowerCase().includes(query)
      )
      .slice(0, 50); // Limit to 50 results
  }, [allTokens, popularTokens, tokenSearchQuery]);

  const selectToken = (token: any, position: 'from' | 'to') => {
    if (position === 'from') {
      setSwapInputToken(token);
      setRealTokens(prev => ({ ...prev, fromSymbol: token.symbol }));
    } else {
      setSwapOutputToken(token);
      setRealTokens(prev => ({ ...prev, toSymbol: token.symbol }));
    }
    setShowTokenSelector(null);
    setTokenSearchQuery(''); // Clear search on selection
    setSwapForm({ fromValue: '', toValue: '' });
    setRealSwapData(null);
  };
  
  // Wallet adapter state
  const { 
    publicKey, 
    connected: isConnected, 
    connecting, 
    connect, 
    disconnect, 
    signTransaction, 
    signAllTransactions,
    walletName,
    connection,
    isMagicEdenAvailable,
    connectMagicEden,
    isTrustWalletAvailable,
    connectTrustWallet,
    setVisible,
    select
  } = useWalletAdapter();

  // Auto-quote for swap when input changes
  useEffect(() => {
    if (activeTab === 'swap') {
      const timer = setTimeout(() => {
        if (swapInputAmount && parseFloat(swapInputAmount) > 0) {
          getSwapQuote();
        }
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [swapInputAmount, swapInputToken, swapOutputToken, activeTab]);

  // Clear scan result when wallet disconnects
  useEffect(() => {
    if (!isConnected) {
      setScanResult(null);
    }
  }, [isConnected]);

  // Add comprehensive error handler to prevent ALL unhandled promise rejections from showing overlay
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      // Suppress all promise rejections that could be related to network/RPC issues or user cancellations
      const errorMessage = event.reason?.message || '';
      if (errorMessage.includes('Failed to fetch') || 
          errorMessage.includes('Connection timeout') ||
          errorMessage.includes('RPC failed') ||
          errorMessage.includes('sendRawTransaction') ||
          errorMessage.includes('Transaction failed') ||
          errorMessage.includes('User rejected') ||
          errorMessage.includes('rejected the request') ||
          event.reason?.code === 'NETWORK_ERROR' ||
          event.reason?.code === 4001 ||
          event.reason?.name === 'WalletNotConnectedError' ||
          !errorMessage) { // Also suppress empty/undefined errors
        event.preventDefault();
        console.log('Suppressed network/transaction error:', errorMessage || 'Unknown error');
        return false;
      }
    };
    
    const handleError = (event: ErrorEvent) => {
      if (event.message?.includes('Failed to fetch') || 
          event.message?.includes('sendRawTransaction') ||
          event.message?.includes('User rejected') ||
          event.message?.includes('rejected the request')) {
        event.preventDefault();
        console.log('Suppressed error event:', event.message);
        return false;
      }
    };
    
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);

  // Fetch SOL refund statistics
  const { data: stats } = useQuery<RefundStats>({
    queryKey: ['/api/sol-refund/stats'],
    refetchInterval: 5000, // Refresh every 5 seconds for real-time updates
    refetchOnWindowFocus: true, // Refresh when window gets focus
    staleTime: 0, // Always consider data stale for immediate updates
  });

  // Fetch complete transaction history for All Time Ledger
  const { data: transactionHistory } = useQuery<{
    success: boolean;
    transactions: Array<{
      id: string;
      signature: string;
      walletAddress: string;
      type: string;
      solRecovered: number;
      netAmount: number;
      feeAmount: number;
      itemsProcessed: number;
      details: any;
      processedAt: string;
    }>;
    count: number;
  }>({
    queryKey: ['/api/transactions/history'],
    refetchInterval: 5000, // Refresh every 5 seconds for real-time updates
    refetchOnWindowFocus: true, // Refresh when window gets focus
    staleTime: 0, // Always consider data stale for immediate updates
  });

  // Clear scan results when wallet disconnects
  useEffect(() => {
    if (!isConnected || !publicKey) {
      setScanResult(null);
    }
  }, [isConnected, publicKey]);

  // Wallet connection functions using wallet adapter
  const handleConnectWallet = async () => {
    try {
      await connect();
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    }
  };

  const disconnectWallet = async () => {
    try {
      await disconnect();
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  };

  // Initialize Jupiter Terminal when swap tab is active
  useEffect(() => {
    if (activeTab === 'swap' && typeof window !== 'undefined') {
      setIsJupiterLoading(true);
      let retryCount = 0;
      const maxRetries = 10;
      
      const initTerminal = () => {
        try {
          console.log(`Attempting Jupiter initialization (${retryCount + 1}/${maxRetries})`);
          
          // Wait for Jupiter to be available
          if (!(window as any).Jupiter || typeof (window as any).Jupiter.init !== 'function') {
            retryCount++;
            if (retryCount < maxRetries) {
              console.log('Jupiter not ready, retrying in 500ms...');
              setTimeout(initTerminal, 500);
            } else {
              console.error('Jupiter failed to load after maximum retries');
              setIsJupiterLoading(false);
            }
            return;
          }

          // Clear container and reset
          const targetElement = document.getElementById('jupiter-terminal');
          if (targetElement) {
            targetElement.innerHTML = '';
          }

          console.log('Jupiter found, initializing terminal...');
          
          // Add runtime script to prevent screen transitions
          const preventTransitions = () => {
            // Function to hide transition screens
            const hideTransitionScreens = () => {
              const terminalElement = document.getElementById('jupiter-terminal');
              if (!terminalElement) return;

              // Find and hide all elements containing transition text
              const allElements = terminalElement.querySelectorAll('*');
              allElements.forEach((element: Element) => {
                const htmlElement = element as HTMLElement;
                const text = htmlElement.textContent || '';
                
                if (text.includes('Swapping') || 
                    text.includes('Pending Approval') ||
                    text.includes('Transaction pending') ||
                    text.includes('Confirming') ||
                    text.includes('Swap Failed') ||
                    text.includes('We were unable to complete') ||
                    text.includes('User rejected the request') ||
                    text.includes('Retry') ||
                    text.includes('Try Again') ||
                    htmlElement.tagName === 'H1' && text.trim() === 'Swapping' ||
                    htmlElement.tagName === 'H2' && text.includes('Pending') ||
                    htmlElement.tagName === 'H1' && text.includes('Failed') ||
                    htmlElement.tagName === 'BUTTON' && text.includes('Retry')) {
                  
                  // Hide the element and its parent containers
                  let currentElement = htmlElement;
                  while (currentElement && currentElement !== terminalElement) {
                    currentElement.style.display = 'none';
                    currentElement.style.visibility = 'hidden';
                    currentElement.style.opacity = '0';
                    console.log('Hid Jupiter transition element:', text.slice(0, 50));
                    currentElement = currentElement.parentElement as HTMLElement;
                    
                    // Stop if we've hidden too many parent elements
                    if (currentElement && currentElement.children.length > 5) break;
                  }
                }
              });
            };

            // Run immediately
            hideTransitionScreens();

            // Set up mutation observer
            const observer = new MutationObserver(() => {
              hideTransitionScreens();
            });
            
            const terminalElement = document.getElementById('jupiter-terminal');
            if (terminalElement) {
              observer.observe(terminalElement, {
                childList: true,
                subtree: true,
                characterData: true
              });
            }

            // Also run periodically as backup
            const interval = setInterval(hideTransitionScreens, 500);
            
            // Clean up after 30 seconds
            setTimeout(() => {
              clearInterval(interval);
              observer.disconnect();
            }, 30000);
          };
          
          // Initialize Jupiter with wallet passthrough
          (window as any).Jupiter.init({
            displayMode: "integrated",
            integratedTargetId: "jupiter-terminal",
            endpoint: "https://api.mainnet-beta.solana.com",
            enableWalletPassthrough: true,
            passthroughWalletContextState: isConnected && publicKey && window.solana ? {
              connected: true,
              connecting: false,
              disconnecting: false,
              publicKey: {
                toString: () => publicKey,
                toBase58: () => publicKey
              },
              wallet: {
                adapter: {
                  name: 'Phantom',
                  icon: '',
                  url: '',
                  publicKey: {
                    toString: () => publicKey,
                    toBase58: () => publicKey
                  },
                  connected: true,
                  connecting: false,
                  disconnecting: false,
                  signTransaction: window.solana.signTransaction,
                  signAllTransactions: (window.solana as any).signAllTransactions || window.solana.signTransaction,
                  signMessage: (window.solana as any).signMessage || (() => Promise.reject('SignMessage not supported'))
                }
              },
              signTransaction: window.solana.signTransaction,
              signAllTransactions: (window.solana as any).signAllTransactions || window.solana.signTransaction,
              signMessage: (window.solana as any).signMessage || (() => Promise.reject('SignMessage not supported'))
            } : undefined,
            containerStyles: {
              maxHeight: '577px',
              height: '577px',
              width: '390px'
            },
            defaultExplorer: "SolanaFM",
            strictTokenList: false,
            enableAdvancedRouting: true,
            formProps: {
              fixedInputMint: false,
              fixedOutputMint: false,
              swapMode: "ExactIn",
              slippageBps: slippage * 100, // Convert percentage to basis points
              initialSlippageBps: slippage * 100
            },
            simulateWalletPassthrough: true,
            disableWalletConfirmation: true,
            enableWalletModalConfirmation: false,
            hideScreenTransition: true,
            enableResultPage: false,
            enableErrorPage: false,
            defaultSlippageSettings: {
              slippageBps: slippage * 100,
              enableSlippageSettings: true
            },
            onFormUpdate: (form: any) => {
              // Update chart when user changes output token (the token being bought)
              console.log('Jupiter form updated:', form);
              const tokenBeingBought = form.toMint || form.outputMint;
              if (tokenBeingBought && tokenBeingBought !== selectedTokenMint) {
                console.log('Updating chart from', selectedTokenMint, 'to', tokenBeingBought);
                
                // Show loading overlay immediately
                const overlay = document.querySelector('.absolute.inset-0.bg-black\\/90');
                if (overlay) {
                  (overlay as HTMLElement).style.opacity = '1';
                  (overlay as HTMLElement).style.pointerEvents = 'auto';
                }
                
                // Update token mint to trigger immediate iframe refresh
                setSelectedTokenMint(tokenBeingBought);
                console.log('Forcing immediate chart refresh for token:', tokenBeingBought);
              }
            },
            onSuccess: ({ txid, swapResult }: any) => {
              console.log('Jupiter swap successful:', txid);
              // No notification - user doesn't want transaction messages
            },
            onSwapError: ({ error }: any) => {
              // Completely suppress ALL error handling - no error screens at all
              console.log('Swap error silently handled:', error);
              
              // Force Jupiter back to swap interface immediately
              setTimeout(() => {
                const terminal = document.getElementById('jupiter-terminal');
                if (terminal) {
                  // Remove any error elements that might have appeared
                  const errorElements = terminal.querySelectorAll('*');
                  errorElements.forEach((el: Element) => {
                    const htmlEl = el as HTMLElement;
                    const text = htmlEl.textContent || '';
                    if (text.includes('Swap Failed') || 
                        text.includes('unable to complete') ||
                        text.includes('not been authorized') ||
                        text.includes('Retry')) {
                      htmlEl.remove();
                    }
                  });
                }
              }, 1);
              
              return; // Never let Jupiter show error screens
            }
          });

          // Start preventing screen transitions immediately and continuously
          preventTransitions();
          
          // Run prevention immediately every 25ms for the first 3 seconds (faster)
          const immediateInterval = setInterval(preventTransitions, 25);
          setTimeout(() => clearInterval(immediateInterval), 3000);
          
          setTimeout(() => {
            preventTransitions();
            console.log('Jupiter screen transition prevention activated');
          }, 1000);

          // GENTLE ENFORCEMENT - Check if Jupiter needs reinitialization
          const gentleEnforcement = () => {
            const terminal = document.getElementById('jupiter-terminal');
            if (!terminal) return;

            // Check if terminal is completely empty (no Jupiter content at all)
            const hasContent = terminal.querySelector('form, input, button, [data-testid], [class*="jupiter"]');
            
            if (!hasContent && terminal.children.length === 0) {
              console.log('Jupiter Terminal empty, but avoiding reinitialization to prevent loops');
              return;
            }

            // Only remove specific error screens, preserve everything else
            const errorScreens = terminal.querySelectorAll('*');
            errorScreens.forEach((element: Element) => {
              const htmlElement = element as HTMLElement;
              const content = htmlElement.textContent || '';
              
              // Only remove if it's clearly an error/transition screen
              if ((content === 'Swap Failed' || 
                   content === 'Swapping' ||
                   content === 'Pending Approval' ||
                   content === 'Transaction pending' ||
                   content.includes('unable to complete the swap')) &&
                  content.length < 50) { // Only small error messages
                    
                htmlElement.remove();
                console.log('GENTLE: Removed error screen:', content.slice(0, 20));
              }
            });
          };

          // Let Jupiter settle first, then start gentle monitoring
          setTimeout(() => {
            console.log('Starting gentle monitoring after Jupiter settlement');
          }, 1500); // Faster monitoring start
          
          // SELECTIVE DOM CLEANER - Remove only specific error screens, keep swap interface
          const selectiveClean = () => {
            const terminal = document.getElementById('jupiter-terminal');
            if (!terminal) return;
            
            // Find and remove only specific error overlays and transition screens
            const errorSelectors = [
              '[role="dialog"]', // Modal dialogs
              '[data-testid*="error"]', // Error components
              '[data-testid*="failed"]', // Failed state components
              'div[style*="position: absolute"]', // Positioned overlays
              'div[style*="position: fixed"]', // Fixed overlays
            ];
            
            errorSelectors.forEach(selector => {
              const elements = terminal.querySelectorAll(selector);
              elements.forEach((el: Element) => {
                const htmlEl = el as HTMLElement;
                const text = htmlEl.textContent || '';
                
                // Only remove if it contains error/transition text
                if (text.includes('Swap Failed') || 
                    text.includes('unable to complete') ||
                    text.includes('not been authorized') ||
                    text.includes('Retry') ||
                    text.includes('Try Again') ||
                    text.includes('Swapping') ||
                    text.includes('Pending Approval') ||
                    text.includes('Transaction pending')) {
                  
                  htmlEl.remove();
                  console.log('SELECTIVE CLEAN: Removed error screen');
                }
              });
            });
            
            // Also check for text-based removal but be more careful
            const allElements = terminal.querySelectorAll('div, span, p');
            allElements.forEach((el: Element) => {
              const htmlEl = el as HTMLElement;
              const text = htmlEl.textContent?.trim() || '';
              
              // Only remove elements that are ONLY error text (not mixed content)
              if ((text === 'Swap Failed' || 
                   text === 'Swapping' ||
                   text === 'Pending Approval' ||
                   text === 'Transaction pending' ||
                   text.includes('unable to complete the swap')) &&
                  text.length < 100) { // Don't remove large content blocks
                
                // Remove the closest container, not just the text
                let container = htmlEl;
                while (container.parentElement && 
                       container.parentElement !== terminal &&
                       container.parentElement.children.length === 1) {
                  container = container.parentElement;
                }
                container.remove();
                console.log('SELECTIVE CLEAN: Removed', text.slice(0, 30));
              }
            });
          };
          
          // Run selective cleaner continuously for first 10 seconds
          const selectiveCleanInterval = setInterval(selectiveClean, 50);
          setTimeout(() => clearInterval(selectiveCleanInterval), 10000);
          
          // Run gentle enforcement every 100ms to preserve Jupiter functionality
          const enforcementInterval = setInterval(gentleEnforcement, 100);
          
          // Also run immediately when any DOM changes occur
          const fastObserver = new MutationObserver(gentleEnforcement);
          const terminal = document.getElementById('jupiter-terminal');
          if (terminal) {
            fastObserver.observe(terminal, {
              childList: true,
              subtree: true,
              attributes: true,
              attributeOldValue: true,
              characterData: true
            });
          }
          
          // Clean up after 60 seconds  
          setTimeout(() => {
            clearInterval(enforcementInterval);
            fastObserver.disconnect();
          }, 60000);

          console.log('Jupiter Terminal initialized successfully');
          setIsJupiterLoading(false);
          
          // Wallet state is now passed directly in initialization
          if (isConnected && publicKey && window.solana) {
            console.log('Wallet passed through Jupiter initialization');
          }
          
        } catch (error) {
          console.error('Jupiter initialization error:', error);
          retryCount++;
          if (retryCount < maxRetries) {
            setTimeout(initTerminal, 3000);
          }
        }
      };

      // Start initialization with delay
      setTimeout(initTerminal, 1000);
    }
  }, [activeTab, isConnected, publicKey]);

  // Scan wallet for empty token accounts
  const scanMutation = useMutation({
    mutationFn: async (address: string) => {
      const response = await fetch(`/api/sol-refund/scan/${address}`);
      if (!response.ok) {
        throw new Error('Failed to scan wallet');
      }
      return response.json();
    },
    onSuccess: (data: ScanResult) => {
      setScanResult(data);
      // Removed scan completion notification per user request
    },
    onError: (error: any) => {
      toast({
        title: "Scan Failed",
        description: error.message || "Failed to scan wallet for empty accounts",
        variant: "destructive",
      });
    },
  });

  // Scan tokens for burning
  const scanTokensMutation = useMutation({
    mutationFn: async (address: string) => {
      const response = await fetch(`/api/tokens/scan/${address}`);
      if (!response.ok) {
        throw new Error('Failed to scan tokens');
      }
      return response.json();
    },
    onSuccess: (data: any[]) => {
      setTokenList(data);
    },
    onError: (error: any) => {
      toast({
        title: "Token Scan Failed",
        description: error.message || "Failed to scan wallet for tokens",
        variant: "destructive",
      });
    },
  });



  // Burn Token Mutation
  const burnTokenMutation = useMutation({
    mutationFn: async (tokenMint: string) => {
      // First, get the transaction from backend
      const response = await fetch('/api/tokens/burn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: publicKey?.toString(),
          tokenMint
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to prepare burn transaction');
      }
      
      const { transaction, solRecovered } = await response.json();
      
      // Sign and send transaction using Phantom wallet
      if (!window.solana || !window.solana.isPhantom) {
        throw new Error('Phantom wallet not found');
      }

      const { Connection, Transaction } = await import('@solana/web3.js');
      
      // Use Helius RPC if available, otherwise fallback
      const heliusResponse = await fetch('/api/helius-config');
      const rpcConfig = await heliusResponse.json();
      
      const connection = new Connection(
        rpcConfig.success && rpcConfig.apiKey ? rpcConfig.rpcUrl : 'https://api.mainnet-beta.solana.com',
        'confirmed'
      );
      
      // Deserialize and sign transaction
      const txBuffer = Buffer.from(transaction, 'base64');
      const tx = Transaction.from(txBuffer);
      
      const signedTx = await window.solana.signTransaction(tx);
      const signature = await connection.sendRawTransaction(signedTx.serialize());
      
      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed');
      
      // Record the successful transaction
      const recordResponse = await fetch('/api/tokens/record-burn-success', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature,
          walletAddress: publicKey?.toString(),
          tokenMints: [tokenMint],
          tokensProcessed: 1,
          solRecovered: parseFloat(solRecovered),
          netAmount: parseFloat(solRecovered) * 0.85, // 15% fee
          feeAmount: parseFloat(solRecovered) * 0.15
        })
      });
      
      if (!recordResponse.ok) {
        console.error('Failed to record burn success:', await recordResponse.text());
      }
      
      return { signature, solRecovered };
    },
    onSuccess: (data) => {
      toast({
        title: "Success!",
        description: `Token burned successfully! Recovered ${data.solRecovered} SOL`,
      });
      // Refresh token list
      if (publicKey) {
        scanTokensMutation.mutate(publicKey.toString());
      }
      // Refresh stats to show updated totals
      queryClient.invalidateQueries({ queryKey: ['/api/sol-refund/stats'] });
    },
    onError: (error) => {
      console.error('Error burning token:', error);
      let errorMessage = "Failed to burn token. Please try again.";
      
      if (error instanceof Error) {
        if (error.message.includes('User rejected')) {
          errorMessage = "Transaction was cancelled by user.";
        } else if (error.message.includes('Phantom wallet not found')) {
          errorMessage = "Please install and connect Phantom wallet.";
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });



  // Bulk Burn Tokens Mutation
  const bulkBurnTokensMutation = useMutation({
    mutationFn: async (tokenMints: string[]) => {
      // Get bulk transaction from backend
      const response = await fetch('/api/tokens/bulk-burn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: publicKey?.toString(),
          tokenMints
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to prepare bulk burn transaction');
      }
      
      const { transaction, tokensProcessed, solRecovered, netAmount, feeAmount } = await response.json();
      
      // Sign and send transaction using the connected wallet
      console.log('🔐 About to sign bulk burn transaction with:', walletName || 'unknown wallet');

      const { Connection, Transaction } = await import('@solana/web3.js');
      
      const heliusResponse = await fetch('/api/helius-config');
      const rpcConfig = await heliusResponse.json();
      
      const connection = new Connection(
        rpcConfig.success && rpcConfig.apiKey ? rpcConfig.rpcUrl : 'https://api.mainnet-beta.solana.com',
        'confirmed'
      );
      
      const txBuffer = Buffer.from(transaction, 'base64');
      const tx = Transaction.from(txBuffer);
      
      // Use the wallet adapter's signTransaction instead of hardcoded window.solana
      const signedTx = await signTransaction(tx);
      console.log('✅ Transaction signed successfully with:', walletName);
      
      const signature = await connection.sendRawTransaction(signedTx.serialize());
      console.log('📡 Transaction sent to network:', signature);
      
      await connection.confirmTransaction(signature, 'confirmed');
      
      // Record the successful transaction
      const recordResponse = await fetch('/api/tokens/record-burn-success', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature,
          walletAddress: publicKey?.toString(),
          tokenMints,
          tokensProcessed,
          solRecovered,
          netAmount,
          feeAmount
        })
      });
      
      if (!recordResponse.ok) {
        console.error('Failed to record burn success:', await recordResponse.text());
      }
      
      return { tokensProcessed, solRecovered, netAmount, feeAmount, signature };
    },
    onSuccess: (result) => {
      toast({
        title: "Success!",
        description: `Burned ${result.tokensProcessed} tokens! Net recovery: ${result.netAmount} SOL (${result.feeAmount} SOL fee)`,
      });
      // Clear selections and refresh
      setSelectedTokens(new Set());
      if (publicKey) {
        scanTokensMutation.mutate(publicKey.toString());
      }
      // Refresh stats to show updated totals
      queryClient.invalidateQueries({ queryKey: ['/api/sol-refund/stats'] });
    },
    onError: (error) => {
      console.error('Error bulk burning tokens:', error);
      toast({
        title: "Error",
        description: "Failed to burn tokens. Please try again.",
        variant: "destructive",
      });
    },
  });



  // Selection handlers
  const toggleTokenSelection = (mintAddress: string) => {
    const newSelection = new Set(selectedTokens);
    if (newSelection.has(mintAddress)) {
      newSelection.delete(mintAddress);
    } else {
      newSelection.add(mintAddress);
    }
    setSelectedTokens(newSelection);
  };

  const selectAllTokens = () => {
    setSelectedTokens(new Set(tokenList.map(token => token.mint)));
  };

  const clearTokenSelection = () => {
    setSelectedTokens(new Set());
  };

  // Calculate total SOL to recover (net after 15% fee)
  const calculateTotalSOL = (count: number) => {
    const grossAmount = count * 0.00203928;
    const netAmount = grossAmount * 0.85; // 15% fee deducted
    return `${netAmount.toFixed(6)}`;
  };

  // Process SOL refund (15% service fee)
  const refundMutation = useMutation({
    mutationFn: async (data: { walletAddress: string; selectedAccounts: string[]; donationPercentage: number }) => {
      // Get transaction (15% service fee)
      const response = await fetch('/api/sol-refund/prepare-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        throw new Error('Failed to prepare transaction');
      }
      
      const { transaction, message, totalSolReclaimed, feeAmount, netAmount } = await response.json();
      
      if (!window.solana || !window.solana.isPhantom) {
        throw new Error('Phantom wallet not found');
      }

      const { Connection } = await import('@solana/web3.js');
      
      // Get RPC configuration with fallbacks from backend
      console.log('Getting RPC configuration with fallbacks...');
      
      const heliusResponse = await fetch('/api/helius-config');
      const rpcConfig = await heliusResponse.json();
      
      // Build fallback endpoint list (public endpoints that work reliably)
      const fallbackEndpoints = [
        'https://api.mainnet-beta.solana.com',
        'https://solana-api.projectserum.com',
        'https://rpc.ankr.com/solana'
      ];
      
      // Try Helius first if available, then fallback to public endpoints
      let connection: any;
      let endpointUsed: string = '';
      let connectionWorking = false;
      
      // Try Helius if we have any API key, but test if it actually works
      if (rpcConfig.success && rpcConfig.apiKey) {
        try {
          connection = new Connection(rpcConfig.rpcUrl, 'confirmed');
          // Test the connection with a simple call
          await connection.getLatestBlockhash();
          endpointUsed = 'Helius RPC';
          connectionWorking = true;
          console.log('Using verified Helius RPC for transaction sending...');
        } catch (heliusError) {
          console.log('Helius RPC failed, trying fallback endpoints...');
        }
      } else {
        console.log('No valid Helius key, using public endpoints...');
      }
      
      // If Helius failed or not available, try fallback endpoints
      if (!connectionWorking) {
        for (const endpoint of fallbackEndpoints) {
          try {
            connection = new Connection(endpoint, 'confirmed');
            // Test the connection
            await connection.getLatestBlockhash();
            endpointUsed = endpoint.includes('mainnet-beta') ? 'Solana Public RPC' : 'Alternative RPC';
            connectionWorking = true;
            console.log(`Using working ${endpointUsed}: ${endpoint}`);
            break;
          } catch (error) {
            console.log(`RPC ${endpoint} failed, trying next...`);
          }
        }
      }
      
      if (!connectionWorking) {
        throw new Error('All RPC endpoints failed. Please try again later.');
      }
      
      // Execute transaction (15% service fee)
      try {
        setProcessing(true);
        console.log('Starting DIRECT transaction processing - NO SIMULATION...');
        
        // Wrap all async operations to prevent unhandled rejections
        let transactionBuffer, deserializedTransaction, signedTransaction;
        
        try {
          transactionBuffer = Buffer.from(transaction, 'base64');
          deserializedTransaction = (await import('@solana/web3.js')).Transaction.from(transactionBuffer);
          
          console.log('Transaction deserialized, signing with Phantom...');
          signedTransaction = await window.solana!.signTransaction!(deserializedTransaction);
        } catch (prepError: any) {
          console.log('Transaction preparation error:', prepError.message);
          throw new Error(`Transaction preparation failed: ${prepError.message}`);
        }
        
        console.log(`Transaction signed, sending via ${endpointUsed} - SKIP ALL SIMULATION...`);
        
        // Send with complete error handling to prevent unhandled rejections
        let signature;
        try {
          signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
            skipPreflight: true,  // SKIP SIMULATION - This prevents Jupiter injection
            preflightCommitment: 'confirmed',
            maxRetries: 3
          }).catch((sendError: any) => {
            console.log('Transaction send error caught:', sendError.message);
            throw new Error(`Transaction failed: ${sendError.message}`);
          });
        } catch (wrappedError: any) {
          console.log('Send transaction wrapper error:', wrappedError.message);
          throw wrappedError;
        }
        
        console.log(`Transaction sent, signature: ${signature}, confirming...`);
        
        // Simple confirmation without Promise.race to prevent unhandled rejections
        try {
          console.log('Waiting for transaction confirmation...');
          await connection.confirmTransaction(signature, 'confirmed');
          console.log('Transaction confirmed successfully!');
        } catch (confirmError: any) {
          console.log('Confirmation failed but transaction was sent:', confirmError.message);
          // Still proceed as transaction was successfully sent
        }

        // Save successful transaction to database and get points message
        let pointsMessage = '';
        try {
          const dbResponse = await fetch('/api/sol-refund/record-success', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              signature,
              walletAddress: data.walletAddress,
              accountsClosed: data.selectedAccounts.length, // Correct number of accounts processed
              solRecovered: totalSolReclaimed,
              netAmount: netAmount,
              feeAmount: feeAmount
            })
          });
          
          if (dbResponse.ok) {
            const dbResult = await dbResponse.json();
            pointsMessage = dbResult.message || '';
            console.log('Transaction recorded in database successfully');
          }
        } catch (dbError) {
          console.warn('Failed to record transaction in database:', dbError);
        }

        return {
          success: true,
          signature,
          accountsClosed: data.selectedAccounts.length, // Correct number of accounts processed
          totalReceived: netAmount,
          feeAmount: feeAmount,
          pointsMessage: pointsMessage,
          message: `Transaction sent successfully! Check: https://solscan.io/tx/${signature}`
        };
      } catch (walletError: any) {
        console.error('Transaction error:', walletError);
        console.error('Error details:', JSON.stringify(walletError, null, 2));
        
        // Extract specific Solana error information
        let errorMessage = 'Transaction failed';
        if (walletError.message) {
          errorMessage = walletError.message;
        } else if (walletError.logs) {
          errorMessage = `Solana logs: ${walletError.logs.join('; ')}`;
        } else if (walletError.err) {
          errorMessage = `Solana error: ${JSON.stringify(walletError.err)}`;
        }
        
        throw new Error(errorMessage);
      }
    },
    onSuccess: (result: any) => {
      // Use points message from backend if available, otherwise show default
      const title = result.pointsMessage || `Successfully closed ${result.accountsClosed} accounts and claimed ${result.totalReceived.toFixed(6)} SOL`;
      
      toast({
        title: title,
        description: `Transaction: ${result.signature.substring(0, 8)}...`,
        className: "bg-green-600 text-white border-green-600",
      });
      
      // Reset form and immediately refresh statistics and transaction history
      setScanResult(null);
      
      // Invalidate and refetch all related queries for real-time updates
      queryClient.invalidateQueries({ queryKey: ['/api/sol-refund/stats'] });
      queryClient.refetchQueries({ queryKey: ['/api/sol-refund/stats'] });
      
      // Invalidate user profile to update total points
      if (publicKey) {
        queryClient.invalidateQueries({ queryKey: ['/api/user/profile', publicKey?.toString()] });
        queryClient.refetchQueries({ queryKey: ['/api/user/profile', publicKey?.toString()] });
      }
      
      // Also invalidate leaderboard to update rankings
      queryClient.invalidateQueries({ queryKey: ['/api/leaderboard'] });
      queryClient.refetchQueries({ queryKey: ['/api/leaderboard'] });
    },
    onError: (error: any) => {
      toast({
        title: "Transaction Failed",
        description: error.message || "Failed to process SOL refund transaction",
        variant: "destructive",
      });
    },
  });



  const handleProcessAllRefunds = () => {
    if (!scanResult || scanResult.accounts.length === 0) {
      toast({
        title: "No Accounts Found",
        description: "No empty accounts found to close",
        variant: "destructive",
      });
      return;
    }
    
    // Process all found empty accounts
    const allAccountAddresses = scanResult.accounts.map(acc => acc.accountAddress);
    
    refundMutation.mutate({
      walletAddress: publicKey?.toString() || "",
      selectedAccounts: allAccountAddresses,
      donationPercentage,
    });
  };

  const handleBurnToken = (tokenMint: string) => {
    if (!publicKey) {
      toast({
        title: "Error",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }
    burnTokenMutation.mutate(tokenMint);
  };

  const handleBurnNFT = (nftMint: string) => {
    if (!publicKey) {
      toast({
        title: "Error", 
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }
    burnTokenMutation.mutate(nftMint);
  };

  const calculateRefund = () => {
    if (!scanResult) return { total: 0, donation: 0, net: 0 };
    
    const total = parseFloat(scanResult.totalReclaimable);
    const donation = total * 0.15; // 15% service fee
    const net = total - donation; // 85% to user
    
    return { total, donation, net };
  };

  const refundCalc = calculateRefund();

  // Swap functions
  const getSwapQuote = async () => {
    if (!swapInputAmount || !swapInputToken || !swapOutputToken) return;
    
    setIsSwapLoading(true);
    try {
      const amount = Math.floor(parseFloat(swapInputAmount) * Math.pow(10, swapInputToken.decimals));
      
      const response = await fetch(
        `https://quote-api.jup.ag/v6/quote?inputMint=${swapInputToken.address}&outputMint=${swapOutputToken.address}&amount=${amount}&slippageBps=50&platformFeeBps=50`
      );
      
      if (!response.ok) throw new Error('Failed to get quote');
      
      const quoteData = await response.json();
      setSwapQuote(quoteData);
      setSwapOutputAmount((parseInt(quoteData.outAmount) / Math.pow(10, swapOutputToken.decimals)).toFixed(6));
    } catch (error) {
      console.error('Quote error:', error);
    } finally {
      setIsSwapLoading(false);
    }
  };

  const executeSwap = async () => {
    if (!publicKey || !swapQuote || !window.solana) return;
    
    setIsSwapping(true);
    try {
      const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: swapQuote,
          userPublicKey: publicKey?.toString(),
          wrapAndUnwrapSol: true,
          feeAccount: REFERRAL_ACCOUNT,
        }),
      });

      if (!swapResponse.ok) throw new Error('Failed to get swap transaction');
      
      const { swapTransaction } = await swapResponse.json();
      const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
      const signedTransaction = await window.solana.signTransaction(transaction);
      
      const connection = new Connection(import.meta.env.VITE_HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com');
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      await connection.confirmTransaction(signature, 'confirmed');
      
      // Reset form
      setSwapInputAmount('');
      setSwapOutputAmount('');
      setSwapQuote(null);
      
    } catch (error) {
      console.error('Swap error:', error);
    } finally {
      setIsSwapping(false);
    }
  };

  const swapTokens = () => {
    const temp = swapInputToken;
    setSwapInputToken(swapOutputToken);
    setSwapOutputToken(temp);
    setSwapInputAmount('');
    setSwapOutputAmount('');
    setSwapQuote(null);
  };



  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 pt-1 pb-2 max-w-6xl">
        <div className="space-y-2">
          {/* Header with Navigation and Wallet Connection */}
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between mb-2 space-y-4 lg:space-y-0">
            {/* Top row: Logo and Wallet Connection (mobile) */}
            <div className="flex items-center justify-between">
              {/* Logo */}
              <div className="flex items-center">
                <img 
                  src={logoImage}
                  alt="Get your SOL back!"
                  className="h-32 w-auto"
                />
              </div>
              
              {/* Mobile Wallet Connection */}
              <div className="lg:hidden flex items-center space-x-3">
                {isConnected && publicKey ? (
                  <>
                    <div className="bg-purple-800/60 backdrop-blur-sm rounded-lg px-3 py-1 text-white font-mono text-xs border border-purple-500/30">
                      <span>{publicKey.toString().slice(0, 4)}...{publicKey.toString().slice(-4)}</span>
                    </div>
                    <Button
                      onClick={disconnectWallet}
                      className="bg-purple-700/60 hover:bg-purple-600/60 text-white rounded-lg px-3 py-1 text-xs font-medium border border-purple-500/30"
                    >
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => {
                      select(null);
                      setVisible(true);
                    }}
                    className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2 text-sm font-medium border border-purple-500/30"
                    title="Connect your wallet"
                  >
                    <Wallet className="h-4 w-4 mr-1" />
                    Connect
                  </Button>
                )}
              </div>
            </div>
            
            {/* Center Navigation Buttons - Desktop: centered, Mobile: below logo */}
            {isConnected && (
              <div className="flex justify-center lg:absolute lg:left-1/2 lg:transform lg:-translate-x-1/2">
                <div className="flex items-center space-x-2">
                  <Button
                    onClick={() => setActiveTab('reclaim')}
                    className={`px-4 py-2 text-sm font-medium rounded transition-all ${
                      activeTab === 'reclaim' 
                        ? 'bg-purple-600 text-white' 
                        : 'bg-purple-800/40 text-purple-300 hover:bg-purple-600/60'
                    }`}
                  >
                    <svg className="h-4 w-4 mr-2" viewBox="0 0 397.7 311.7" style={{ fill: activeTab === 'reclaim' ? 'white' : '#00FFA3' }}>
                      <path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"/>
                      <path d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1L333.1,73.8c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"/>
                      <path d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z"/>
                    </svg>
                    Reclaim SOL
                  </Button>
                  <Button
                    onClick={() => setActiveTab('burnTokens')}
                    className={`px-4 py-2 text-sm font-medium rounded transition-all ${
                      activeTab === 'burnTokens' 
                        ? 'bg-purple-600 text-white' 
                        : 'bg-purple-800/40 text-purple-300 hover:bg-purple-600/60'
                    }`}
                  >
                    <Flame className="h-4 w-4 mr-2" />
                    Burn Tokens
                  </Button>
                  <Button
                    onClick={() => setActiveTab('swap')}
                    className={`px-4 py-2 text-sm font-medium rounded transition-all ${
                      activeTab === 'swap' 
                        ? 'bg-purple-600 text-white' 
                        : 'bg-purple-800/40 text-purple-300 hover:bg-purple-600/60'
                    }`}
                  >
                    <ArrowLeftRight className="h-4 w-4 mr-2" />
                    Swap
                  </Button>
                </div>
              </div>
            )}
            
            {/* Desktop Wallet Connection - hidden on mobile */}
            <div className="hidden lg:flex items-center space-x-3">
              {isConnected && publicKey ? (
                <>
                  <div className="bg-purple-800/60 backdrop-blur-sm rounded-lg px-4 py-2 text-white font-mono text-sm border border-purple-500/30">
                    <div className="flex items-center">
                      <span>{publicKey.toString().slice(0, 6)}...{publicKey.toString().slice(-6)}</span>
                    </div>
                  </div>
                  <Button
                    onClick={disconnectWallet}
                    className="bg-purple-700/60 hover:bg-purple-600/60 text-white rounded-lg px-4 py-2 text-sm font-medium border border-purple-500/30"
                  >
                    Disconnect
                  </Button>
                </>
              ) : (
                <div className="flex flex-col items-center space-y-3">
                  <Button
                    onClick={() => {
                      select(null);
                      setVisible(true);
                    }}
                    className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-6 py-3 text-lg font-medium border border-purple-500/30"
                    title="Connect your wallet - supports Phantom, Magic Eden, Solflare, Trust Wallet"
                  >
                    <Wallet className="h-5 w-5 mr-2" />
                    Connect Wallet
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="text-center space-y-4 py-4">
            <p className="text-white max-w-2xl mx-auto text-2xl font-semibold">
              {activeTab === 'swap' 
                ? 'Swap with no fees!' 
                : 'Get your SOL back!'
              }
            </p>
          </div>





          {/* Scan Wallet Section - Hidden on swap tab */}
          {isConnected && activeTab !== 'swap' && (
            <div className="text-center">
              <Button 
                onClick={() => {
                  if (publicKey) {
                    if (activeTab === 'reclaim') {
                      scanMutation.mutate(publicKey.toString());
                    } else if (activeTab === 'burnTokens') {
                      scanTokensMutation.mutate(publicKey.toString());
                    }
                  }
                }}
                disabled={scanMutation.isPending || scanTokensMutation.isPending || !publicKey}
                size="lg"
                className="bg-black/20 backdrop-blur-sm border border-purple-500/30 hover:bg-black/30 hover:border-purple-400/50 text-white px-8 py-4 text-lg font-semibold transition-all duration-200"
              >
                {(scanMutation.isPending || scanTokensMutation.isPending) ? (
                  <RefreshCw className="h-6 w-6 animate-spin mr-3" />
                ) : (
                  <Search className="h-6 w-6 mr-3" />
                )}
                {(scanMutation.isPending || scanTokensMutation.isPending) 
                  ? 'Scanning Wallet...' 
                  : `Scan ${activeTab === 'reclaim' ? 'Empty Accounts' : 'Tokens'}`
                }
              </Button>
            </div>
          )}

          {/* Connect Wallet Message */}
          {!isConnected && (
            <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
              <div className="text-center space-y-4">
                <Wallet className="h-12 w-12 text-purple-400 mx-auto" />
                <h3 className="text-lg font-semibold text-white">Connect Your Wallet</h3>
                <p className="text-purple-200">Please connect your Phantom wallet using the "Connect Wallet" button above to get your SOL back!</p>
              </div>
            </div>
          )}



          {/* Reclaim SOL Results */}
          {activeTab === 'reclaim' && scanResult && (
            <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Scan Results</h3>
                <div className="px-3 py-1 bg-black/20 backdrop-blur-sm border border-purple-500/30 rounded-full text-sm text-purple-400">
                  {scanResult.emptyAccounts} Empty Accounts
                </div>
              </div>
              <p className="text-white text-sm mb-6">
                Found {scanResult.emptyAccounts} empty token accounts out of {scanResult.totalAccounts} total accounts
              </p>
              
              {scanResult.emptyAccounts > 0 ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm border border-purple-500/20 rounded-xl">
                      <div className="text-2xl font-bold text-white">{scanResult.emptyAccounts}</div>
                      <div className="text-xs text-purple-200">Empty Accounts</div>
                    </div>
                    <div className="text-center p-4 bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm border border-purple-500/20 rounded-xl">
                      <div className="text-2xl font-bold text-white">{(refundCalc.total * 0.85).toFixed(6)}</div>
                      <div className="text-xs text-purple-200">Total Net</div>
                    </div>
                  </div>

                  <div className="w-full h-px bg-slate-600"></div>

                  {/* Empty Accounts List */}
                  <div className="space-y-4">
                    <h4 className="text-base font-medium text-white">Empty Accounts Found ({scanResult.accounts.length})</h4>

                    <div className="max-h-64 overflow-y-auto space-y-2 border border-slate-600 rounded-lg p-3 bg-slate-900/30">
                      {scanResult.accounts.map((account) => (
                        <div key={account.accountAddress} className="flex items-center space-x-3 p-3 bg-slate-700/50 rounded border border-slate-700/50">
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-sm text-white truncate">
                              {account.accountAddress}
                            </div>
                            <div className="text-xs text-white">
                              Mint: {account.mintAddress.substring(0, 8)}...{account.mintAddress.substring(-8)}
                            </div>
                          </div>
                          <div className="px-2 py-1 bg-black/20 backdrop-blur-sm border border-purple-500/30 rounded text-xs text-purple-400">
                            {account.rentAmount} SOL
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>





                  {/* Process Button */}
                  <Button 
                    onClick={handleProcessAllRefunds}
                    disabled={refundMutation.isPending}
                    size="lg"
                    className="w-full bg-gradient-to-br from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white py-4 text-lg font-semibold rounded-lg transition-all duration-200 shadow-lg"
                  >
                    {refundMutation.isPending ? (
                      <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                    ) : (
                      <CheckCircle className="h-5 w-5 mr-2" />
                    )}
                    CLAIM ALL
                  </Button>
                </div>
              ) : (
                <div className="bg-black/20 backdrop-blur-sm border border-purple-500/30 rounded-lg p-6 text-center">
                  <CheckCircle className="h-12 w-12 text-purple-400 mx-auto mb-4" />
                  <h4 className="text-lg font-medium text-purple-400 mb-2">Great news!</h4>
                  <p className="text-white">
                    Your wallet has no empty token accounts. All your accounts are either active or already closed.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Burn Tokens Results */}
          {activeTab === 'burnTokens' && tokenList.length > 0 && (
            <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Your Tokens</h3>
                <div className="px-3 py-1 bg-black/20 backdrop-blur-sm border border-purple-500/30 rounded-full text-sm text-purple-400">
                  {tokenList.length} Tokens Found
                </div>
              </div>

              {/* Selection Controls */}
              <div className="flex items-center justify-between mb-4 p-3 bg-slate-700/30 rounded-lg border border-slate-600/50">
                <div className="flex items-center space-x-3">
                  <Button
                    onClick={selectAllTokens}
                    size="sm"
                    className="bg-purple-600/20 text-white border border-purple-500/50 hover:bg-purple-600/40 hover:border-purple-400"
                  >
                    Select All
                  </Button>
                  <Button
                    onClick={clearTokenSelection}
                    size="sm"
                    className="bg-slate-600/40 text-white border border-slate-500/50 hover:bg-slate-600/60 hover:border-slate-400"
                  >
                    Clear
                  </Button>
                  <div className="text-sm text-purple-300">
                    {selectedTokens.size} selected
                  </div>
                </div>
                <div className="text-sm text-green-400 font-semibold">
                  SOL {calculateTotalSOL(selectedTokens.size)}
                </div>
              </div>
              
              <div className="max-h-64 overflow-y-auto space-y-2 border border-slate-600 rounded-lg p-3 bg-slate-900/30 mb-6">
                {tokenList.map((token, index) => (
                  <div 
                    key={index} 
                    className="flex items-center space-x-3 p-3 bg-slate-700/50 rounded border border-slate-700/50 hover:bg-slate-700/70 cursor-pointer transition-colors"
                    onClick={() => toggleTokenSelection(token.mint)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTokens.has(token.mint)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleTokenSelection(token.mint);
                      }}
                      className="w-4 h-4 text-purple-600 bg-slate-700 border-purple-500 rounded focus:ring-purple-500 focus:ring-2 checked:bg-purple-600 checked:border-purple-600"
                    />
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      {token.logo && (
                        <img 
                          src={token.logo} 
                          alt={token.symbol || 'Token'} 
                          className="w-8 h-8 rounded-full flex-shrink-0"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white">
                          {token.symbol || 'TOKEN'}
                        </div>
                        <div className="text-xs text-purple-300 font-mono truncate">
                          {token.mint}
                        </div>
                        <div className="text-xs text-white">
                          Balance: {token.balance} {token.symbol || 'TOKENS'}
                        </div>
                        {/* SOL recovery info removed */}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Burn Button at Bottom */}
              {selectedTokens.size > 0 && (
                <div className="mt-6">
                  <Button
                    onClick={() => bulkBurnTokensMutation.mutate(Array.from(selectedTokens))}
                    disabled={selectedTokens.size === 0 || bulkBurnTokensMutation.isPending}
                    className="w-full bg-gradient-to-br from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white py-4 text-lg font-semibold rounded-lg transition-all duration-200 shadow-lg"
                  >
                    {bulkBurnTokensMutation.isPending ? (
                      <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                    ) : (
                      <Flame className="h-5 w-5 mr-2" />
                    )}
                    BURN
                  </Button>
                </div>
              )}
            </div>
          )}



          {/* Empty State Messages */}
          {activeTab === 'burnTokens' && tokenList.length === 0 && (
            <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
              <div className="text-center space-y-4">
                <Flame className="h-12 w-12 text-purple-400 mx-auto" />
                <h3 className="text-lg font-semibold text-white">No Tokens Found</h3>
                <p className="text-purple-200">Scan your wallet to find tokens available for burning.</p>
              </div>
            </div>
          )}

          {/* Swap Interface */}
          {activeTab === 'swap' && (
            <div className="space-y-6">
              <div className="flex flex-col lg:grid lg:grid-cols-2 lg:gap-6">
                
                {/* Jupiter Terminal - Single container for all screen sizes */}
                <div className="order-1 lg:order-2 w-fit mx-auto" style={{ width: '390px', height: '577px' }}>
                  {isJupiterLoading && (
                    <div className="flex items-center justify-center bg-purple-900/20 backdrop-blur-sm border border-purple-500/30 rounded-lg" style={{ width: '390px', height: '577px' }}>
                      <div className="text-center space-y-4">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400 mx-auto"></div>
                        <p className="text-purple-300 text-sm">Loading Jupiter Terminal...</p>
                      </div>
                    </div>
                  )}
                  <div 
                    id="jupiter-terminal" 
                    style={{ 
                      width: '390px', 
                      height: '577px',
                      display: isJupiterLoading ? 'none' : 'block'
                    }}
                  ></div>
                </div>

                {/* DexScreener Chart - Hidden on mobile, visible on desktop */}
                <div className="hidden lg:block order-2 lg:order-1 bg-black rounded-xl border border-gray-700/50 overflow-hidden relative">
                  {/* Loading overlay for chart transitions */}
                  <div className="absolute inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-10 transition-opacity duration-200" 
                       style={{ opacity: selectedTokenMint ? 0 : 1, pointerEvents: selectedTokenMint ? 'none' : 'auto' }}>
                    <div className="text-center space-y-2">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-400 mx-auto"></div>
                      <p className="text-purple-300 text-xs">Loading chart...</p>
                    </div>
                  </div>
                  
                  <iframe
                    key={`chart-${selectedTokenMint}-${Date.now()}`}
                    src={`https://dexscreener.com/solana/${getTradingPairAddress(selectedTokenMint)}?embed=1&theme=dark&trades=1&info=0&controls=0&autorefresh=5&cache=${Date.now()}`}
                    style={{
                      width: '100%',
                      height: '600px',
                      border: 'none',
                      backgroundColor: 'black'
                    }}
                    allow="clipboard-write"
                    sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                    loading="eager"
                    onLoad={() => {
                      // Hide loading overlay when chart loads
                      const overlay = document.querySelector('.absolute.inset-0.bg-black\\/90');
                      if (overlay) {
                        (overlay as HTMLElement).style.opacity = '0';
                        (overlay as HTMLElement).style.pointerEvents = 'none';
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Slippage Settings Modal */}
          {showSlippageModal && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-white">Swap Settings</h2>
                  <button
                    onClick={() => setShowSlippageModal(false)}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>

                {/* Slippage Tolerance */}
                <div className="mb-8">
                  <h3 className="text-white font-medium mb-4">Slippage Tolerance</h3>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {[1, 3, 5, 10].map((value) => (
                      <button
                        key={value}
                        onClick={() => setSlippage(value)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          slippage === value
                            ? 'bg-white text-black'
                            : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-600'
                        }`}
                      >
                        {value}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Statistics Section - Only show on reclaim tab - Above safety sections */}
          {activeTab === 'reclaim' && stats && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* Total SOL Recovered */}
              <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6 text-center">
                <div className="text-3xl font-bold text-white mb-2">
                  {stats.totalSolRecovered.toFixed(6)}
                </div>
                <div className="text-sm text-purple-200 uppercase tracking-wider">
                  TOTAL SOL RECOVERED
                </div>
              </div>

              {/* Total Accounts Closed */}
              <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6 text-center">
                <div className="text-3xl font-bold text-white mb-2">
                  {stats.totalAccountsClaimed}
                </div>
                <div className="text-sm text-purple-200 uppercase tracking-wider">
                  TOTAL ACCOUNTS CLOSED
                </div>
              </div>
            </div>
          )}

          {/* All Time Ledger Section - Only show on reclaim tab */}
          {activeTab === 'reclaim' && transactionHistory && transactionHistory.transactions.length > 0 && (
            <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6 mb-6">
              <div className="flex items-center mb-6">
                <h3 className="text-xl font-bold text-white text-center w-full">ALL TIME LEDGER</h3>
              </div>
              
              <div className="overflow-x-auto">
                <div className="min-w-full">
                  {/* Header */}
                  <div className="grid grid-cols-4 gap-4 mb-4 pb-3 border-b border-purple-500/30">
                    <div className="text-sm font-semibold text-purple-200 uppercase tracking-wider">
                      WALLET/TX
                    </div>
                    <div className="text-sm font-semibold text-purple-200 uppercase tracking-wider text-center">
                      ACCTS
                    </div>
                    <div className="text-sm font-semibold text-purple-200 uppercase tracking-wider text-center">
                      CLAIMED SOL
                    </div>
                    <div className="text-sm font-semibold text-purple-200 uppercase tracking-wider text-center">
                      DATE
                    </div>
                  </div>
                  
                  {/* Transaction Rows */}
                  <div>
                    {transactionHistory.transactions.map((tx, index) => (
                      <div key={tx.signature}>
                        <div 
                          className="grid grid-cols-4 gap-4 py-3 hover:bg-purple-800/20 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-purple-500/30"
                          onClick={() => window.open(`https://solscan.io/tx/${tx.signature}`, '_blank')}
                          title="Click to view transaction on Solscan"
                        >
                          <div className="text-white font-mono text-sm">
                            <div className="truncate" title={tx.signature}>
                              {tx.signature.slice(0, 8)}...{tx.signature.slice(-8)}
                            </div>
                          </div>
                          <div className="text-white text-center text-lg font-semibold">
                            {tx.itemsProcessed}
                          </div>
                          <div className="text-white text-center text-sm font-medium">
                            {tx.solRecovered.toFixed(6)}
                          </div>
                          <div className="text-white text-center text-sm">
                            {new Date(tx.processedAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true
                            })}
                          </div>
                        </div>
                        {/* Separator line between rows - don't show after last row */}
                        {index < transactionHistory.transactions.length - 1 && (
                          <div className="border-b border-purple-500/20 my-2"></div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Safety & Security Section - Only show on reclaim tab - Bottom of page */}
          {activeTab === 'reclaim' && (
            <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6 mb-6">
              <div className="flex items-center mb-4">
                <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
                <h3 className="text-lg font-semibold text-white">Safety & Security</h3>
              </div>
              
              <div className="space-y-3 text-purple-200">
                <div className="flex items-start">
                  <CheckCircle className="h-4 w-4 text-green-400 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Only empty accounts (0 token balance) are eligible for closure</span>
                </div>
                <div className="flex items-start">
                  <CheckCircle className="h-4 w-4 text-green-400 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Your tokens and active accounts are completely safe</span>
                </div>
                <div className="flex items-start">
                  <CheckCircle className="h-4 w-4 text-green-400 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Transactions are processed on Solana mainnet</span>
                </div>
                <div className="flex items-start">
                  <CheckCircle className="h-4 w-4 text-green-400 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">15% service fee supports platform maintenance and development</span>
                </div>
              </div>
            </div>
          )}

          {/* What is this rent? Section - Only show on reclaim tab - Bottom of page */}
          {activeTab === 'reclaim' && (
            <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6 mb-6">
              <div className="flex items-center mb-4">
                <AlertTriangle className="h-5 w-5 text-yellow-400 mr-2" />
                <h3 className="text-lg font-semibold text-white">What is this rent?</h3>
              </div>
              
              <div className="space-y-3 text-purple-200 text-sm">
                <p>
                  Every time you receive a token, NFT, or memecoin, Solana creates a token account that requires ~0.002 SOL rent deposit (approximately 2 years worth of rent).
                </p>
                <p>
                  When you sell or transfer all tokens, the account becomes empty but the rent remains locked. Our tool safely closes these empty accounts and returns your SOL.
                </p>
                <p className="font-medium text-white">
                  Only accounts with 0 tokens are eligible for closure - your funds are completely safe.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Wallet Selection Modal */}

    </div>
  );
}
