import { useState, useEffect } from "react";
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

  const REFERRAL_ACCOUNT = 'EeGruK1u1DswLBKQ985ZHYvDkezDLKNFL9hMqMeSicji';
  
  // Wallet state synced with main navigation
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [forceDisconnected, setForceDisconnected] = useState(false);
  const [hasCheckedInitialState, setHasCheckedInitialState] = useState(false);

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

  // Sync with Phantom wallet state from main navigation
  useEffect(() => {
    const checkWalletConnection = () => {
      // If user manually disconnected from SOL Refund page, stay disconnected
      if (forceDisconnected) {
        setPublicKey(null);
        setIsConnected(false);
        setScanResult(null);
        console.log('SOL Refund: Force disconnected by user');
        return;
      }
      
      // Check if wallet is properly connected
      const isPhantomInstalled = window.solana && window.solana.isPhantom;
      
      // On first load, be extra strict - wallet must be truly connected
      if (!hasCheckedInitialState) {
        setHasCheckedInitialState(true);
        // Only show as connected if wallet is actually connected
        if (isPhantomInstalled && window.solana?.isConnected && window.solana?.publicKey) {
          try {
            const currentKey = window.solana.publicKey.toString();
            if (currentKey && currentKey.length > 40) {
              setPublicKey(currentKey);
              setIsConnected(true);
              console.log('SOL Refund: Initial wallet check - connected');
              return;
            }
          } catch (error) {
            console.log('SOL Refund: Initial wallet check - error');
          }
        }
        // Default to disconnected on first load
        setPublicKey(null);
        setIsConnected(false);
        setScanResult(null);
        console.log('SOL Refund: Initial wallet check - not connected');
        return;
      }
      
      // Regular checks after initial load
      if (isPhantomInstalled && window.solana?.isConnected && window.solana?.publicKey) {
        try {
          const currentKey = window.solana.publicKey.toString();
          if (currentKey && currentKey.length > 40) {
            setPublicKey(currentKey);
            setIsConnected(true);
            console.log('SOL Refund: Wallet verified as connected');
          } else {
            throw new Error('Invalid wallet key');
          }
        } catch (error) {
          setPublicKey(null);
          setIsConnected(false);
          setScanResult(null);
          console.log('SOL Refund: Error validating wallet');
        }
      } else {
        setPublicKey(null);
        setIsConnected(false);
        setScanResult(null);
        console.log('SOL Refund: Wallet not connected');
      }
    };

    // Check initial connection state
    checkWalletConnection();

    // Listen for wallet connection events
    const handleConnect = () => {
      console.log('Wallet connect event detected');
      checkWalletConnection();
    };
    
    const handleDisconnect = () => {
      console.log('Wallet disconnect event detected');
      setPublicKey(null);
      setIsConnected(false);
      setScanResult(null);
    };

    // Add event listeners if available
    if (window.solana && typeof (window.solana as any).on === 'function') {
      (window.solana as any).on('connect', handleConnect);
      (window.solana as any).on('disconnect', handleDisconnect);
    }

    // Fallback: Check wallet state periodically
    const interval = setInterval(checkWalletConnection, 2000);

    return () => {
      clearInterval(interval);
      if (window.solana && typeof (window.solana as any).off === 'function') {
        (window.solana as any).off('connect', handleConnect);
        (window.solana as any).off('disconnect', handleDisconnect);
      }
    };
  }, []);

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

  // Clear scan results when wallet disconnects
  useEffect(() => {
    if (!isConnected || !publicKey) {
      setScanResult(null);
    }
  }, [isConnected, publicKey]);

  // Initialize Jupiter Terminal when swap tab is active
  useEffect(() => {
    if (activeTab === 'swap' && typeof window !== 'undefined') {
      let retryCount = 0;
      const maxRetries = 10;
      
      const initTerminal = () => {
        try {
          console.log(`Attempting Jupiter initialization (${retryCount + 1}/${maxRetries})`);
          
          // Wait for Jupiter to be available
          if (!(window as any).Jupiter || typeof (window as any).Jupiter.init !== 'function') {
            retryCount++;
            if (retryCount < maxRetries) {
              console.log('Jupiter not ready, retrying in 2 seconds...');
              setTimeout(initTerminal, 2000);
            } else {
              console.error('Jupiter failed to load after maximum retries');
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
                setSelectedTokenMint(tokenBeingBought);
                // Force chart refresh
                setTimeout(() => {
                  console.log('Forcing chart refresh for token:', tokenBeingBought);
                }, 100);
              }
            },
            onSuccess: ({ txid, swapResult }: any) => {
              console.log('Jupiter swap successful:', txid);
              // No notification - user doesn't want transaction messages
            },
            onSwapError: ({ error }: any) => {
              // Don't show error for user rejection/cancellation
              if (error && (
                error.code === 4001 || 
                error.message?.includes('User rejected') ||
                error.message?.includes('rejected the request') ||
                error.name === 'WalletNotConnectedError'
              )) {
                console.log('Swap cancelled by user');
                return; // Silently handle user cancellation
              }
              console.error('Jupiter swap error:', error);
            }
          });

          // Start preventing screen transitions immediately and continuously
          preventTransitions();
          
          // Run prevention immediately every 25ms for the first 5 seconds
          const immediateInterval = setInterval(preventTransitions, 25);
          setTimeout(() => clearInterval(immediateInterval), 5000);
          
          setTimeout(() => {
            preventTransitions();
            console.log('Jupiter screen transition prevention activated');
          }, 1000);

          // Additional aggressive approach - constantly ensure only swap form is visible
          const enforceSwapView = () => {
            const terminal = document.getElementById('jupiter-terminal');
            if (!terminal) return;

            // Find all child divs and hide any that contain error or success content
            const allDivs = terminal.querySelectorAll('div');
            allDivs.forEach((div: Element) => {
              const htmlDiv = div as HTMLElement;
              const content = htmlDiv.textContent || '';
              
              // If this div contains error screens, hide its entire parent container
              if (content.includes('Swap Failed') || 
                  content.includes('User rejected') ||
                  content.includes('unable to complete') ||
                  content.includes('Retry') ||
                  content.includes('Try Again')) {
                    
                // Find the top-level container within terminal and hide it
                let container = htmlDiv;
                while (container.parentElement && container.parentElement !== terminal) {
                  container = container.parentElement;
                }
                
                if (container !== terminal) {
                  container.style.display = 'none';
                  container.style.visibility = 'hidden';
                  container.style.opacity = '0';
                  container.style.position = 'absolute';
                  container.style.top = '-9999px';
                  console.log('Force-hid Jupiter screen container:', content.slice(0, 30));
                }
              }
            });
          };

          // Run enforcement every 50ms for ultra-fast response
          const enforcementInterval = setInterval(enforceSwapView, 50);
          
          // Also run immediately when any DOM changes occur
          const fastObserver = new MutationObserver(enforceSwapView);
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
          walletAddress: publicKey,
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
      
      return { signature, solRecovered };
    },
    onSuccess: (data) => {
      toast({
        title: "Success!",
        description: `Token burned successfully! Recovered ${data.solRecovered} SOL`,
      });
      // Refresh token list
      if (publicKey) {
        scanTokensMutation.mutate(publicKey);
      }
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
          walletAddress: publicKey,
          tokenMints
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to prepare bulk burn transaction');
      }
      
      const { transaction, tokensProcessed, solRecovered, netAmount, feeAmount } = await response.json();
      
      // Sign and send transaction
      if (!window.solana || !window.solana.isPhantom) {
        throw new Error('Phantom wallet not found');
      }

      const { Connection, Transaction } = await import('@solana/web3.js');
      
      const heliusResponse = await fetch('/api/helius-config');
      const rpcConfig = await heliusResponse.json();
      
      const connection = new Connection(
        rpcConfig.success && rpcConfig.apiKey ? rpcConfig.rpcUrl : 'https://api.mainnet-beta.solana.com',
        'confirmed'
      );
      
      const txBuffer = Buffer.from(transaction, 'base64');
      const tx = Transaction.from(txBuffer);
      
      const signedTx = await window.solana.signTransaction(tx);
      const signature = await connection.sendRawTransaction(signedTx.serialize());
      
      await connection.confirmTransaction(signature, 'confirmed');
      
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
        scanTokensMutation.mutate(publicKey);
      }
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
        queryClient.invalidateQueries({ queryKey: ['/api/user/profile', publicKey] });
        queryClient.refetchQueries({ queryKey: ['/api/user/profile', publicKey] });
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
      walletAddress: publicKey || "",
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
          userPublicKey: publicKey,
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

  // Connect wallet function
  const connectWallet = async () => {
    try {
      // Clear force disconnected state first
      setForceDisconnected(false);
      
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

  // Disconnect wallet function
  const disconnectWallet = async () => {
    try {
      if (window.solana) {
        await window.solana.disconnect();
      }
      setForceDisconnected(true);
      setPublicKey(null);
      setIsConnected(false);
      setScanResult(null);
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="space-y-6">
          {/* Header with Navigation and Wallet Connection */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-6">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">Get Your Sol</h1>
            </div>
            
            {/* Wallet Connection Button */}
            <div className="flex items-center space-x-3">
              {isConnected && publicKey ? (
                <>
                  <div className="bg-purple-800/60 backdrop-blur-sm rounded-lg px-4 py-2 text-white font-mono text-sm border border-purple-500/30">
                    {publicKey.slice(0, 6)}...{publicKey.slice(-6)}
                  </div>
                  <Button
                    onClick={disconnectWallet}
                    className="bg-purple-700/60 hover:bg-purple-600/60 text-white rounded-lg px-4 py-2 text-sm font-medium border border-purple-500/30"
                  >
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button
                  onClick={connectWallet}
                  className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2 text-sm font-medium"
                >
                  <Wallet className="h-4 w-4 mr-2" />
                  Connect Wallet
                </Button>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="text-center space-y-4 py-4">
            <p className="text-white max-w-2xl mx-auto text-lg">
              Reclaim your SOL rent from empty token accounts and burn unwanted tokens.
            </p>
          </div>

          {/* Action Tabs */}
          {isConnected && (
            <div className="flex justify-center mb-6">
              <div className="bg-black/20 backdrop-blur-sm border border-purple-500/30 rounded-lg p-1">
                <div className="flex space-x-1">
                  <Button
                    onClick={() => setActiveTab('reclaim')}
                    className={`px-4 py-2 text-sm font-medium rounded transition-all ${
                      activeTab === 'reclaim' 
                        ? 'bg-purple-600 text-white' 
                        : 'bg-transparent text-purple-300 hover:bg-purple-600/20'
                    }`}
                  >
                    <Coins className="h-4 w-4 mr-2" />
                    Reclaim SOL
                  </Button>
                  <Button
                    onClick={() => setActiveTab('burnTokens')}
                    className={`px-4 py-2 text-sm font-medium rounded transition-all ${
                      activeTab === 'burnTokens' 
                        ? 'bg-purple-600 text-white' 
                        : 'bg-transparent text-purple-300 hover:bg-purple-600/20'
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
                        : 'bg-transparent text-purple-300 hover:bg-purple-600/20'
                    }`}
                  >
                    <ArrowLeftRight className="h-4 w-4 mr-2" />
                    Swap
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Scan Wallet Section */}
          {isConnected && (
            <div className="text-center">
              <Button 
                onClick={() => {
                  if (publicKey) {
                    if (activeTab === 'reclaim') {
                      scanMutation.mutate(publicKey);
                    } else if (activeTab === 'burnTokens') {
                      scanTokensMutation.mutate(publicKey);
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
                <p className="text-purple-200">Please connect your Phantom wallet using the "Connect Wallet" button above to access the Get Your Sol utility.</p>
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
              <div className="bg-black rounded-xl border border-gray-700/50 overflow-hidden w-fit mx-auto">
                {/* Settings Button */}
                <div className="p-3 border-b border-gray-700/50 flex justify-between items-center">
                  <div className="text-white text-sm">
                    Slippage: {slippage}% | Priority: {jitoPriority} | Jito Fee⚡ {manualJitoFee || '0'} SOL
                  </div>
                  <button
                    onClick={() => setShowSlippageModal(true)}
                    className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-gray-300">
                      <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" fill="currentColor"/>
                      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
                
                <div 
                  id="jupiter-terminal" 
                  style={{ 
                    width: '390px', 
                    height: '540px',
                    minHeight: '540px',
                    backgroundColor: 'transparent'
                  }}
                />
              </div>
            </div>
          )}

          {/* Slippage Settings Modal */}
          {showSlippageModal && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-white">Sell Setting</h2>
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

              {/* Transaction History */}
              <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
                <h3 className="text-xl font-bold text-white mb-6 text-center">ALL TIME LEDGER</h3>
                
                {stats.recentTransactions && stats.recentTransactions.length > 0 ? (
                  <>
                    {/* Mobile Card Layout */}
                    <div className="block md:hidden space-y-3">
                      {stats.recentTransactions.map((tx: any, index: number) => (
                        <div key={tx.signature} className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs text-purple-300">TRANSACTION</div>
                            <div className="text-xs text-purple-300">
                              {new Date(tx.processedAt).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          </div>
                          <div className="mb-3">
                            <a 
                              href={`https://solscan.io/tx/${tx.signature}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-purple-300 hover:text-white font-mono text-xs hover:underline break-all"
                            >
                              {tx.signature.substring(0, 12)}...{tx.signature.substring(tx.signature.length - 12)}
                            </a>
                          </div>
                          <div className="flex justify-between items-center">
                            <div className="text-center">
                              <div className="text-xs text-purple-300">ACCOUNTS</div>
                              <div className="text-white font-medium">{tx.accountsClosed}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-purple-300">CLAIMED SOL</div>
                              <div className="text-white font-medium">{tx.solRecovered.toFixed(6)}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop Table Layout */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-white">
                        <thead>
                          <tr className="text-purple-300 border-b border-purple-600/50">
                            <th className="text-left py-3 px-2">WALLET/TX</th>
                            <th className="text-center py-3 px-2">ACCTS</th>
                            <th className="text-center py-3 px-2">CLAIMED SOL</th>
                            <th className="text-center py-3 px-2">DATE</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.recentTransactions.map((tx: any, index: number) => (
                            <tr key={tx.signature} className="border-b border-purple-700/30 hover:bg-purple-700/20">
                              <td className="py-3 px-2">
                                <a 
                                  href={`https://solscan.io/tx/${tx.signature}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-purple-300 hover:text-white font-mono text-sm hover:underline"
                                >
                                  {tx.signature.substring(0, 8)}...{tx.signature.substring(tx.signature.length - 8)}
                                </a>
                              </td>
                              <td className="text-center py-3 px-2">{tx.accountsClosed}</td>
                              <td className="text-center py-3 px-2">{tx.solRecovered.toFixed(6)}</td>
                              <td className="text-center py-3 px-2 text-sm">
                                {new Date(tx.processedAt).toLocaleDateString('en-US', { 
                                  month: 'short', 
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-12">
                    <div className="text-6xl mb-4">📜</div>
                    <h4 className="text-lg font-medium text-purple-400 mb-2">No Transactions Yet</h4>
                    <p className="text-purple-200">
                      Once you start claiming SOL or burning tokens, your transaction history will appear here.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}



          {/* Safety Information */}
          <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
            <div className="flex items-center space-x-2 mb-4">
              <CheckCircle className="h-5 w-5 text-purple-400" />
              <h3 className="text-lg font-semibold text-white">Safety & Security</h3>
            </div>
            <div className="space-y-3 text-sm text-white">
              <div className="flex items-start space-x-2">
                <CheckCircle className="h-4 w-4 text-purple-400 mt-0.5 flex-shrink-0" />
                <span>Only empty accounts (0 token balance) are eligible for closure</span>
              </div>
              <div className="flex items-start space-x-2">
                <CheckCircle className="h-4 w-4 text-purple-400 mt-0.5 flex-shrink-0" />
                <span>Your tokens and active accounts are completely safe</span>
              </div>
              <div className="flex items-start space-x-2">
                <CheckCircle className="h-4 w-4 text-purple-400 mt-0.5 flex-shrink-0" />
                <span>Transactions are processed on Solana mainnet</span>
              </div>
              <div className="flex items-start space-x-2">
                <CheckCircle className="h-4 w-4 text-purple-400 mt-0.5 flex-shrink-0" />
                <span>15% service fee supports platform maintenance and development</span>
              </div>
            </div>


          </div>

          {/* What is this rent explanation - at bottom */}
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
    </div>
  );
}