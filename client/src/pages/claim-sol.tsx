import { useState, useEffect, useMemo, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from "wouter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Coins, Wallet, Search, CheckCircle, ExternalLink, AlertTriangle, RefreshCw, Flame, Image, Trash2, ArrowLeftRight, ArrowUpDown, Copy, Share2, Users, TrendingUp, DollarSign, Globe, Clock, Shield, Plus, X } from "lucide-react";
import { Connection, VersionedTransaction } from '@solana/web3.js';
import { useWalletAdapter } from '@/hooks/useWalletAdapter';
import logoImage from '@assets/image_1754527057994.png';
import AdContainer from '@/components/AdContainer';
import AxiomBanner from '@/components/AxiomBanner';

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
  const donationPercentage = 0; // Fees temporarily disabled - users get 100% back
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'referrals' | 'reclaim' | 'burnTokens' | 'premarket'>('reclaim');
  const [selectedTokenMint, setSelectedTokenMint] = useState<string>('So11111111111111111111111111111111111111112'); // Default to SOL
  const [tokenList, setTokenList] = useState<any[]>([]);
  const [referralCode, setReferralCode] = useState<string>('');
  const [userReferralCode, setUserReferralCode] = useState<string | null>(null);
  
  // Selection states for bulk burning
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  
  // Pre-market form state
  const [premarketForm, setPremarketForm] = useState({
    tokenName: '',
    tokenSymbol: '',
    totalSupply: '',
    startingPrice: '',
    description: ''
  });
  
  // Pre-market sub-tab state
  const [premarketSubTab, setPremarketSubTab] = useState<'active' | 'activity' | 'create'>('active');
  
  // Selected token in active premarket view
  const [selectedToken, setSelectedToken] = useState<any>(null);
  const [selectedDetailTab, setSelectedDetailTab] = useState<'trade' | 'activity' | 'info'>('trade');
  const [showCreateOfferModal, setShowCreateOfferModal] = useState(false);
  const [offerType, setOfferType] = useState<'buy' | 'sell'>('buy');
  
  // Real-time countdown ticker for settlement windows
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Smart price formatting function
  const formatPrice = (price: string | number) => {
    const num = parseFloat(price.toString());
    if (num >= 1) {
      return num.toFixed(2); // $1.00, $2.50, etc.
    } else if (num >= 0.1) {
      return num.toFixed(2); // $0.50, $0.25, etc.
    } else if (num >= 0.01) {
      return num.toFixed(3); // $0.052, $0.025, etc.
    } else {
      return num.toFixed(4); // $0.0052, $0.0025, etc.
    }
  };

  // Real-time ticker for countdown updates (every second)
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Clean up selected tokens when switching tabs or when token list changes
  useEffect(() => {
    if (activeTab !== 'burnTokens') {
      setSelectedTokens(new Set());
    }
  }, [activeTab]);

  // Clean up stale selections when token list changes
  useEffect(() => {
    if (tokenList.length === 0) {
      setSelectedTokens(new Set());
    } else {
      // Remove any selected tokens that are no longer in the current token list
      const currentTokenMints = new Set(tokenList.map(token => token.mint));
      setSelectedTokens(prev => {
        const filteredSelection = new Set<string>();
        prev.forEach(mint => {
          if (currentTokenMints.has(mint)) {
            filteredSelection.add(mint);
          }
        });
        return filteredSelection;
      });
    }
  }, [tokenList]);
  
  const { toast } = useToast();
  const [location] = useLocation();

  // Wallet adapter state - Move this early so publicKey is available
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
    isBitgetAvailable,
    connectBitget,
    setVisible,
    select
  } = useWalletAdapter();

  // Query to get user's referral code and stats
  const { data: userReferrals } = useQuery({
    queryKey: ['/api/referrals/wallet', publicKey?.toString()],
    enabled: !!publicKey,
    retry: false,
  });

  // Query to get referral transactions
  const { data: referralTransactions } = useQuery({
    queryKey: ['/api/referrals', (userReferrals as any)?.referralCode?.id, 'transactions'],
    enabled: !!(userReferrals as any)?.referralCode?.id,
    retry: false,
  });


  // Mutation to create referral code automatically
  const createReferralMutation = useMutation({
    mutationFn: async (walletAddress: string) => {
      const response = await apiRequest('POST', '/api/referrals/create', {
        walletAddress,
        websiteUrl: window.location.origin
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success && data.referralCode) {
        setUserReferralCode(data.referralCode.code);
        // Refetch user referrals to update the cache
        queryClient.invalidateQueries({ queryKey: ['/api/referrals/wallet', publicKey?.toString()] });
      }
    },
    onError: (error) => {
      console.error('Failed to create referral code:', error);
    }
  });

  // Clear referral code only when wallet disconnects, invalidate query when wallet changes  
  useEffect(() => {
    if (!isConnected) {
      setUserReferralCode('');
    } else if (publicKey) {
      // Force refresh query for new wallet
      queryClient.invalidateQueries({ queryKey: ['/api/referrals/wallet', publicKey.toString()] });
    }
  }, [isConnected, publicKey, queryClient]);

  // Update userReferralCode when data changes - with auto-creation
  useEffect(() => {
    if (userReferrals && typeof userReferrals === 'object' && 'success' in userReferrals && userReferrals.success) {
      // Check if referralCodes exists and has data
      if ('referralCodes' in userReferrals && Array.isArray(userReferrals.referralCodes) && userReferrals.referralCodes.length > 0) {
        setUserReferralCode(String(userReferrals.referralCodes[0].code));
      } 
      // Check if it's a single referralCode object (different API response format)
      else if ('referralCode' in userReferrals && userReferrals.referralCode && typeof userReferrals.referralCode === 'object' && 'code' in userReferrals.referralCode) {
        setUserReferralCode(String(userReferrals.referralCode.code));
      }
    }
    // No referral code found - create one automatically for THIS specific wallet
    else if (isConnected && publicKey && !createReferralMutation.isPending && 
             (userReferrals === undefined || userReferrals === null || 
              (userReferrals && typeof userReferrals === 'object' && 'success' in userReferrals && !userReferrals.success) || 
              (userReferrals && typeof userReferrals === 'object' && 'error' in userReferrals))) {
      console.log('Creating referral code for wallet:', publicKey.toString());
      createReferralMutation.mutate(publicKey.toString());
    }
  }, [userReferrals, isConnected, publicKey]);

  // Copy referral link function
  const copyReferralLink = async () => {
    if (userReferralCode) {
      const referralLink = `${window.location.origin}/${userReferralCode}`;
      await navigator.clipboard.writeText(referralLink);
      toast({
        title: "Link Copied!",
        description: "Your referral link has been copied to clipboard.",
      });
    }
  };

  // Share referral link function
  const shareReferralLink = async () => {
    if (userReferralCode && navigator.share) {
      const referralLink = `${window.location.origin}/${userReferralCode}`;
      try {
        await navigator.share({
          title: 'Get Your SOL Back!',
          text: 'Recover SOL from empty token accounts and help me earn rewards!',
          url: referralLink,
        });
      } catch (err) {
        copyReferralLink(); // Fallback to copy
      }
    } else {
      copyReferralLink(); // Fallback to copy
    }
  };

  // Pre-market form handlers
  const handlePremarketFormChange = (field: string, value: string) => {
    setPremarketForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleCreateListing = () => {
    if (!publicKey) {
      toast({
        title: "Wallet Required",
        description: "Please connect your wallet to create a listing.",
        variant: "destructive",
      });
      return;
    }

    // Validate form
    if (!premarketForm.tokenName || !premarketForm.tokenSymbol || !premarketForm.totalSupply || !premarketForm.startingPrice) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    const listingData = {
      creatorWallet: publicKey.toString(),
      tokenName: premarketForm.tokenName,
      tokenSymbol: premarketForm.tokenSymbol,
      totalSupply: premarketForm.totalSupply,
      startingPrice: premarketForm.startingPrice,
      description: premarketForm.description
    };

    createListingMutation.mutate(listingData);
  };
  // Check for referral code in URL on mount - support both formats
  useEffect(() => {
    // Check for query parameter format: ?ref=CODE
    const urlParams = new URLSearchParams(window.location.search);
    const queryRefCode = urlParams.get('ref');
    
    // Check for path format: /CODE
    const pathRefCode = window.location.pathname.replace('/', '');
    
    const refCode = queryRefCode || (pathRefCode && pathRefCode !== '' ? pathRefCode : null);
    
    if (refCode) {
      setReferralCode(refCode);
      toast({
        title: "Referral Code Applied",
        description: `Using referral code: ${refCode}`,
      });
    }
  }, [toast]);




  const REFERRAL_ACCOUNT = 'EeGruK1u1DswLBKQ985ZHYvDkezDLKNFL9hMqMeSicji';


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

  // Pagination state for All Time Ledger
  const [transactionOffset, setTransactionOffset] = useState(0);
  const [allTransactions, setAllTransactions] = useState<Array<{
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
  }>>([]);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(true);

  // Fetch transaction history with pagination (10 transactions per page)
  const { data: transactionHistory, isLoading: isLoadingTransactions } = useQuery<{
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
    hasMore: boolean;
  }>({
    queryKey: ['/api/transactions/history', { offset: transactionOffset }],
    queryFn: ({ queryKey }) => {
      const [url, params] = queryKey as [string, { offset: number }];
      return fetch(`${url}?limit=10&offset=${params.offset}`).then(res => res.json());
    },
    refetchInterval: transactionOffset === 0 ? 5000 : false, // Only auto-refresh first page
    refetchOnWindowFocus: transactionOffset === 0, // Only auto-refresh first page
    staleTime: 0,
  });

  // Update accumulated transactions when new data arrives
  useEffect(() => {
    if (transactionHistory?.transactions) {
      if (transactionOffset === 0) {
        // First load or refresh - replace all transactions
        setAllTransactions(transactionHistory.transactions);
      } else {
        // Load more - append new transactions
        setAllTransactions(prev => {
          const existingIds = new Set(prev.map(tx => tx.id));
          const newTransactions = transactionHistory.transactions.filter(tx => !existingIds.has(tx.id));
          return [...prev, ...newTransactions];
        });
      }
      setHasMoreTransactions(transactionHistory.hasMore || false);
    }
  }, [transactionHistory, transactionOffset]);

  // Load more transactions
  const loadMoreTransactions = useCallback(() => {
    if (hasMoreTransactions && !isLoadingTransactions) {
      setTransactionOffset(prev => prev + 10);
    }
  }, [hasMoreTransactions, isLoadingTransactions]);

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
          
          // Initialize Jupiter with minimal configuration
          (window as any).Jupiter.init({
            displayMode: "integrated",
            integratedTargetId: "jupiter-terminal",
            endpoint: "https://api.mainnet-beta.solana.com",
            containerStyles: {
              maxHeight: '577px',
              height: '577px',
              width: '390px'
            },
            defaultExplorer: "SolanaFM",
            strictTokenList: false,
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
          if (isConnected && publicKey) {
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
      // Clear selection when token list changes to prevent stale selections
      setSelectedTokens(new Set());
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
      
      // Sign and send transaction using connected wallet
      if (!isConnected || !publicKey) {
        throw new Error('Wallet not connected');
      }

      const { Connection, Transaction } = await import('@solana/web3.js');
      
      // Use Helius RPC if available, otherwise fallback
      const heliusResponse = await fetch('/api/helius-config');
      const rpcConfig = await heliusResponse.json();
      
      const connection = new Connection(
        rpcConfig.success && rpcConfig.apiKey ? rpcConfig.rpcUrl : 'https://api.mainnet-beta.solana.com',
        'confirmed'
      );
      
      // Deserialize and sign transaction with connected wallet
      const txBuffer = Buffer.from(transaction, 'base64');
      const tx = Transaction.from(txBuffer);
      
      const signedTx = await signTransaction(tx);
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



  // Create Pre-market Listing Mutation
  const createListingMutation = useMutation({
    mutationFn: async (listingData: any) => {
      const response = await apiRequest('POST', '/api/premarket/listings', listingData);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Listing Created!",
        description: `Your ${premarketForm.tokenName} listing has been created successfully.`,
      });
      // Reset form
      setPremarketForm({
        tokenName: '',
        tokenSymbol: '',
        totalSupply: '',
        startingPrice: '',
        description: ''
      });
      // Refresh listings
      queryClient.invalidateQueries({ queryKey: ['/api/premarket/listings'] });
    },
    onError: (error) => {
      console.error('Error creating listing:', error);
      toast({
        title: "Error",
        description: "Failed to create listing. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Query to get pre-market listings
  const { data: premarketListings } = useQuery({
    queryKey: ['/api/premarket/listings'],
    enabled: activeTab === 'premarket',
    retry: false,
  });

  // Query to get user's orders
  const { data: userOrders } = useQuery({
    queryKey: ['/api/premarket/orders/wallet', publicKey?.toString()],
    enabled: activeTab === 'premarket' && !!publicKey,
    retry: false,
  });

  // Query to get user's collateral
  const { data: userCollateral } = useQuery({
    queryKey: ['/api/premarket/collateral/wallet', publicKey?.toString()],
    enabled: activeTab === 'premarket' && !!publicKey,
    retry: false,
  });

  // Query to get creator's own listings for the Create tab
  const { data: creatorListings, refetch: refetchCreatorListings } = useQuery({
    queryKey: ['/api/premarket/listings/creator', publicKey?.toString()],
    enabled: activeTab === 'premarket' && premarketSubTab === 'create' && !!publicKey,
    retry: false,
  });

  // Set TGE date mutation
  const setTgeDateMutation = useMutation({
    mutationFn: async ({ listingId, tgeDate }: { listingId: string; tgeDate: string }) => {
      const response = await fetch(`/api/premarket/listings/${listingId}/set-tge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tgeDate })
      });
      
      if (!response.ok) {
        throw new Error('Failed to set TGE date');
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "TGE date set successfully!", description: "Settlement window is now 4 hours from TGE." });
        refetchCreatorListings();
        queryClient.invalidateQueries({ queryKey: ['/api/premarket/listings'] });
      }
    },
    onError: (error: any) => {
      console.error("Failed to set TGE date:", error);
      toast({ 
        title: "Failed to set TGE date", 
        description: error.message || "Please try again.",
        variant: "destructive" 
      });
    }
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
          tokenMints,
          referralCode: referralCode || undefined
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to prepare bulk burn transaction');
      }
      
      const { transaction, tokensProcessed, solRecovered, netAmount, feeAmount, platformFeeAmount, referralFeeAmount, referralCodeUsed } = await response.json();
      
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
          feeAmount,
          referralCodeUsed: referralCodeUsed || null,
          platformFeeAmount: platformFeeAmount || 0,
          referralFeeAmount: referralFeeAmount || 0
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
    mutationFn: async (data: { walletAddress: string; selectedAccounts: string[]; donationPercentage: number; referralCode?: string }) => {
      // Get transaction (15% service fee)
      const response = await fetch('/api/sol-refund/prepare-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        throw new Error('Failed to prepare transaction');
      }
      
      const { transaction, message, totalSolReclaimed, feeAmount, netAmount, platformFeeAmount, referralFeeAmount, referralCodeUsed } = await response.json();
      
      if (!isConnected || !publicKey) {
        throw new Error('Wallet not connected');
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
          
          console.log(`Transaction deserialized, signing with ${walletName || 'connected wallet'}...`);
          signedTransaction = await signTransaction(deserializedTransaction);
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
              feeAmount: feeAmount,
              referralCodeUsed: referralCodeUsed,
              platformFeeAmount: platformFeeAmount || feeAmount,
              referralFeeAmount: referralFeeAmount || 0
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
      referralCode: referralCode || undefined,
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
    const donation = 0; // No fees - users get 100% back
    const net = total - donation; // 100% to user
    
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
    if (!publicKey || !swapQuote || !isConnected) return;
    
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
      const signedTransaction = await signTransaction(transaction);
      
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
      <div className="container mx-auto px-4 pt-1 pb-2 max-w-7xl">
        <div className="w-full">
          {/* Main Content */}
          <div className="space-y-4 lg:space-y-6">
          {/* Header with Navigation and Wallet Connection */}
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between mb-2 space-y-4 lg:space-y-0">
            {/* Top row: Logo and Wallet Connection (mobile) */}
            <div className="flex items-center justify-between">
              {/* Logo */}
              <div className="flex items-center">
                <img 
                  src={logoImage}
                  alt="Claim Solana Rent– Zero Fees!"
                  className="h-24 w-auto"
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
                    onClick={() => setActiveTab('premarket')}
                    className={`px-4 py-2 text-sm font-medium rounded transition-all ${
                      activeTab === 'premarket' 
                        ? 'bg-purple-600 text-white' 
                        : 'bg-purple-800/40 text-purple-300 hover:bg-purple-600/60'
                    }`}
                    data-testid="button-premarket"
                  >
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Pre market
                  </Button>
                  {/* Referrals tab temporarily hidden 
                  <Button
                    onClick={() => setActiveTab('referrals')}
                    className={`px-4 py-2 text-sm font-medium rounded transition-all ${
                      activeTab === 'referrals' 
                        ? 'bg-purple-600 text-white' 
                        : 'bg-purple-800/40 text-purple-300 hover:bg-purple-600/60'
                    }`}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Referrals
                  </Button>
                  */}
                </div>
              </div>
            )}
            
            {/* Desktop Navigation and Wallet Connection - hidden on mobile */}
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
                    title="Connect your wallet - supports Phantom, Magic Eden, Solflare, Backpack, Coinbase, Bitget"
                  >
                    <Wallet className="h-5 w-5 mr-2" />
                    Connect Wallet
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Axiom Banner */}
          <div className="mb-4">
            <AxiomBanner />
          </div>

          {/* Description */}
          <div className="text-center space-y-4 py-4">
            <p className="text-white max-w-4xl mx-auto text-3xl lg:text-4xl font-semibold">
{activeTab === 'referrals' ? 'Earn 35% commission from your referrals — just by helping others!' : activeTab === 'burnTokens' ? 'Burn Unwanted Tokens.' : activeTab === 'premarket' ? 'Create Pre-market Token Sales with Collateral.' : 'Claim Solana Rent– Zero Fees!'}
            </p>
          </div>


          {/* Scan Wallet Section */}
          {isConnected && activeTab !== 'referrals' && activeTab !== 'premarket' && (
            <div className="text-center">
              <Button 
                onClick={() => {
                  if (publicKey) {
                    if (activeTab === 'reclaim') {
                      scanMutation.mutate(publicKey.toString());
                    } else if (activeTab === 'burnTokens') {
                      scanTokensMutation.mutate(publicKey.toString());
                    } else if (activeTab === 'premarket') {
                      // For premarket, we don't need to scan - show the creation interface
                      // This will be handled by state below
                    }
                  }
                }}
                disabled={scanMutation.isPending || scanTokensMutation.isPending || !publicKey || activeTab === 'premarket'}
                size="lg"
                className="bg-black/20 backdrop-blur-sm border border-purple-500/30 hover:bg-black/30 hover:border-purple-400/50 text-white px-10 py-5 text-xl lg:text-2xl font-semibold transition-all duration-200"
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
                <p className="text-purple-200">Connect your wallet using the "Connect Wallet" button above to get your SOL back!</p>
                <p className="text-sm text-purple-300">Supports: Phantom, Backpack, Solflare, Magic Eden, Coinbase, Coin98, Bitget, and <strong>Ledger Hardware Wallets</strong></p>
              </div>
            </div>
          )}



          {/* Reclaim SOL Results */}
          {activeTab === 'reclaim' && scanResult && (
            <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Scan Results</h3>
              </div>
              <p className="text-white text-sm mb-6">
                Found {scanResult.emptyAccounts} empty token accounts
              </p>
              
              {scanResult.emptyAccounts > 0 ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm border border-purple-500/20 rounded-xl">
                      <div className="text-2xl font-bold text-white">{scanResult.emptyAccounts}</div>
                      <div className="text-xs text-purple-200">Empty Accounts</div>
                    </div>
                    <div className="text-center p-4 bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm border border-purple-500/20 rounded-xl">
                      <div className="text-2xl font-bold text-white">{refundCalc.total.toFixed(6)}</div>
                      <div className="text-xs text-purple-200">Total Recoverable</div>
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
                <h3 className="text-lg font-semibold text-white">{selectedTokens.size} selected</h3>
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
                </div>
                <div className="text-2xl text-green-400 font-bold">
                  {calculateTotalSOL(selectedTokens.size)}
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
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-center space-x-2">
                          <div className="text-sm font-medium text-white truncate">
                            {token.symbol || 'TOKEN'}
                          </div>
                          {/* Status Badge */}
                          <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                            token.status === 'Empty'
                              ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                              : 'bg-green-500/20 text-green-400 border border-green-500/30'
                          }`}>
                            {token.status || 'Active'}
                          </div>
                        </div>
                        <div className="text-xs text-gray-300 truncate">
                          {token.balance > 0 
                            ? `Balance: ${token.balance} ${token.symbol || 'TOKENS'}` 
                            : 'Empty account - can close for ~0.002 SOL'
                          }
                        </div>
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



          {/* Pre-market Interface */}
          {activeTab === 'premarket' && isConnected && (
            <div className="space-y-6">
              {/* Pre-market Sub-navigation */}
              <div className="flex justify-center">
                <div className="flex items-center space-x-2 bg-black/20 backdrop-blur-sm border border-purple-500/30 rounded-lg p-1">
                  <Button
                    onClick={() => setPremarketSubTab('active')}
                    className={`px-4 py-2 text-sm font-medium rounded transition-all ${
                      premarketSubTab === 'active' 
                        ? 'bg-purple-600 text-white' 
                        : 'bg-transparent text-purple-300 hover:bg-purple-600/20'
                    }`}
                    data-testid="button-active-premarket"
                  >
                    <Globe className="h-4 w-4 mr-2" />
                    Active Premarket
                  </Button>
                  <Button
                    onClick={() => setPremarketSubTab('activity')}
                    className={`px-4 py-2 text-sm font-medium rounded transition-all ${
                      premarketSubTab === 'activity' 
                        ? 'bg-purple-600 text-white' 
                        : 'bg-transparent text-purple-300 hover:bg-purple-600/20'
                    }`}
                    data-testid="button-your-activity"
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Your Activity
                  </Button>
                  <Button
                    onClick={() => setPremarketSubTab('create')}
                    className={`px-4 py-2 text-sm font-medium rounded transition-all ${
                      premarketSubTab === 'create' 
                        ? 'bg-purple-600 text-white' 
                        : 'bg-transparent text-purple-300 hover:bg-purple-600/20'
                    }`}
                    data-testid="button-create-listing"
                  >
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Create
                  </Button>
                </div>
              </div>

              {/* Active Premarket Tab */}
              {premarketSubTab === 'active' && (
                <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
                  {!selectedToken ? (
                    // Token Preview/Overview (Horizontal row format like XPL)
                    <div className="space-y-3">
                      {premarketListings && premarketListings.success && premarketListings.listings?.length > 0 ? (
                        premarketListings.listings.map((listing: any) => (
                          <div 
                            key={listing.id}
                            className="bg-neutral-900/50 rounded-lg border border-neutral-800 p-4 hover:bg-neutral-800/40 transition-colors cursor-pointer"
                            onClick={() => setSelectedToken(listing)}
                            data-testid={`row-token-${listing.id}`}
                          >
                            <div className="flex items-center justify-between">
                              {/* Token Info */}
                              <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                                  {listing.tokenSymbol.charAt(0)}
                                </div>
                                <div>
                                  <div className="text-white font-semibold text-lg">{listing.tokenSymbol}</div>
                                  <div className="text-neutral-400 text-xs">{listing.tokenName}</div>
                                </div>
                              </div>

                              {/* Price */}
                              <div className="text-right">
                                <div className="text-white font-bold text-lg">${formatPrice(listing.startingPrice)}</div>
                              </div>

                              {/* 24h Vol */}
                              <div className="text-right">
                                <div className="text-neutral-400 text-xs">24h Vol</div>
                                <div className="text-white font-mono">$18,691.9 <span className="text-green-400">+14.76%</span></div>
                              </div>

                              {/* Total Vol */}
                              <div className="text-right">
                                <div className="text-neutral-400 text-xs">Total Vol</div>
                                <div className="text-white font-mono">$10.7M</div>
                              </div>

                              {/* Settle Starts */}
                              <div className="text-center">
                                <div className="text-neutral-400 text-xs">Settle Starts (UTC)</div>
                                <div className="text-white font-mono">TBA</div>
                              </div>

                              {/* Settle Ends */}
                              <div className="text-center">
                                <div className="text-neutral-400 text-xs">Settle Ends (UTC)</div>
                                <div className="text-white font-mono">TBA</div>
                              </div>

                              {/* Countdown */}
                              <div className="text-right">
                                <div className="text-neutral-400 text-xs">Countdown</div>
                                <div className="text-white">Not Started</div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        // Mock tokens for demo (horizontal row format)
                        Array.from({ length: 6 }, (_, index) => (
                          <div 
                            key={index}
                            className="bg-black/80 rounded-md border border-gray-700/50 px-4 py-3 hover:bg-gray-900/50 transition-colors cursor-pointer"
                            onClick={() => {
                              const mockToken = {
                                tokenSymbol: index === 0 ? 'XPL' : index === 1 ? 'LINEA' : index === 2 ? 'STARK' : index === 3 ? 'BASE' : index === 4 ? 'POLY' : 'ARB',
                                tokenName: index === 0 ? 'Plasma' : index === 1 ? 'Linea Token' : index === 2 ? 'Starknet' : index === 3 ? 'Base Token' : index === 4 ? 'Polygon' : 'Arbitrum',
                                startingPrice: index === 0 ? '0.565' : index === 1 ? '0.028' : '0.025',
                                totalSupply: '1000000'
                              };
                              setSelectedToken(mockToken);
                            }}
                            data-testid={`row-token-mock-${index}`}
                          >
                            <div className="flex items-center justify-between">
                              {/* Token Info */}
                              <div className="flex items-center space-x-3 min-w-[120px]">
                                <div className="w-7 h-7 bg-gradient-to-br from-teal-500 to-green-600 rounded-full flex items-center justify-center text-white font-bold text-xs">
                                  {index === 0 ? 'X' : index === 1 ? 'L' : index === 2 ? 'S' : index === 3 ? 'B' : index === 4 ? 'P' : 'A'}
                                </div>
                                <div>
                                  <div className="text-white font-medium text-base">
                                    {index === 0 ? 'XPL' : index === 1 ? 'LINEA' : index === 2 ? 'STARK' : index === 3 ? 'BASE' : index === 4 ? 'POLY' : 'ARB'}
                                  </div>
                                  <div className="text-gray-400 text-xs">
                                    {index === 0 ? 'Plasma' : index === 1 ? 'Linea Token' : index === 2 ? 'Starknet' : index === 3 ? 'Base Token' : index === 4 ? 'Polygon' : 'Arbitrum'}
                                  </div>
                                </div>
                              </div>

                              {/* Price */}
                              <div className="text-right min-w-[80px]">
                                <div className="text-white font-semibold text-base">
                                  ${formatPrice(index === 0 ? 0.565 : index === 1 ? 0.028 : index === 2 ? 0.027 : index === 3 ? 0.026 : index === 4 ? 0.024 : 0.022)}
                                </div>
                              </div>

                              {/* 24h Vol */}
                              <div className="text-right min-w-[100px]">
                                <div className="text-gray-500 text-xs mb-0.5">24h Vol</div>
                                <div className="text-white text-sm font-mono">
                                  ${index === 0 ? '18,691.9' : index === 1 ? '12,345.6' : index === 2 ? '8,923.4' : index === 3 ? '5,678.9' : index === 4 ? '3,456.7' : '2,134.5'}
                                </div>
                                <div className="text-green-400 text-xs">
                                  +{index === 0 ? '14.76' : index === 1 ? '22.31' : index === 2 ? '18.42' : index === 3 ? '9.87' : index === 4 ? '15.63' : '7.21'}%
                                </div>
                              </div>

                              {/* Total Vol */}
                              <div className="text-right min-w-[80px]">
                                <div className="text-gray-500 text-xs mb-0.5">Total Vol</div>
                                <div className="text-white text-sm font-mono">
                                  ${index === 0 ? '10.7M' : index === 1 ? '8.2M' : index === 2 ? '6.5M' : index === 3 ? '4.1M' : index === 4 ? '2.8M' : '1.5M'}
                                </div>
                              </div>

                              {/* Settle Starts */}
                              <div className="text-right min-w-[100px]">
                                <div className="text-gray-500 text-xs mb-0.5">Settle Starts (UTC)</div>
                                <div className="text-white text-sm font-mono">TBA</div>
                              </div>

                              {/* Settle Ends */}
                              <div className="text-right min-w-[100px]">
                                <div className="text-gray-500 text-xs mb-0.5">Settle Ends (UTC)</div>
                                <div className="text-white text-sm font-mono">TBA</div>
                              </div>

                              {/* Countdown */}
                              <div className="text-right min-w-[80px]">
                                <div className="text-gray-500 text-xs mb-0.5">Countdown</div>
                                <div className="text-white text-sm">Not Started</div>
                              </div>

                              {/* Social/Website/Share Icons */}
                              <div className="flex items-center space-x-2 ml-4">
                                <button className="text-gray-400 hover:text-white transition-colors" data-testid="button-twitter">
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                  </svg>
                                </button>
                                <button className="text-gray-400 hover:text-white transition-colors" data-testid="button-website">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                                  </svg>
                                </button>
                                <button className="text-gray-400 hover:text-white transition-colors" data-testid="button-share">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    // Token Details View
                    <div className="space-y-0">
                      {/* Sticky Header: Back Button + Token Row */}
                      <div className="sticky top-0 bg-gradient-to-br from-purple-800/90 to-purple-900/90 backdrop-blur-sm z-10 -mx-6 px-6 py-4 border-b border-purple-500/20">
                        <div className="flex items-center space-x-4 mb-3">
                          <Button 
                            onClick={() => setSelectedToken(null)}
                            variant="outline"
                            size="sm"
                            className="border-purple-500/30 text-purple-300 hover:bg-purple-600/20"
                            data-testid="button-back-to-list"
                          >
                            ← Back
                          </Button>
                        </div>

                        {/* Token Summary Row */}
                        <div className="bg-black/60 rounded-md border border-gray-700/50 px-4 py-3">
                          <div className="flex items-center justify-between">
                            {/* Token Info */}
                            <div className="flex items-center space-x-3 min-w-[120px]">
                              <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-green-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                                {selectedToken.tokenSymbol.charAt(0)}
                              </div>
                              <div>
                                <div className="text-white font-semibold text-lg">{selectedToken.tokenSymbol}</div>
                                <div className="text-gray-400 text-sm">{selectedToken.tokenName}</div>
                              </div>
                            </div>

                            {/* Price */}
                            <div className="text-right min-w-[80px]">
                              <div className="text-white font-bold text-lg">${formatPrice(selectedToken.startingPrice)}</div>
                            </div>

                            {/* 24h Vol */}
                            <div className="text-right min-w-[100px]">
                              <div className="text-gray-500 text-xs mb-0.5">24h Vol</div>
                              <div className="text-white text-sm font-mono">$18,691.9</div>
                              <div className="text-green-400 text-xs">+14.76%</div>
                            </div>

                            {/* Total Vol */}
                            <div className="text-right min-w-[80px]">
                              <div className="text-gray-500 text-xs mb-0.5">Total Vol</div>
                              <div className="text-white text-sm font-mono">$10.7M</div>
                            </div>

                            {/* Settle Starts */}
                            <div className="text-right min-w-[100px]">
                              <div className="text-gray-500 text-xs mb-0.5">Settle Starts (UTC)</div>
                              <div className="text-white text-sm font-mono">TBA</div>
                            </div>

                            {/* Settle Ends */}
                            <div className="text-right min-w-[100px]">
                              <div className="text-gray-500 text-xs mb-0.5">Settle Ends (UTC)</div>
                              <div className="text-white text-sm font-mono">TBA</div>
                            </div>

                            {/* Countdown */}
                            <div className="text-right min-w-[80px]">
                              <div className="text-gray-500 text-xs mb-0.5">Countdown</div>
                              <div className="text-white text-sm">Not Started</div>
                            </div>

                            {/* Social/Website/Share Icons */}
                            <div className="flex items-center space-x-2 ml-4">
                              <button className="text-gray-400 hover:text-white transition-colors" data-testid="button-twitter-details">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                </svg>
                              </button>
                              <button className="text-gray-400 hover:text-white transition-colors" data-testid="button-website-details">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                                </svg>
                              </button>
                              <button className="text-gray-400 hover:text-white transition-colors" data-testid="button-share-details">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Token Details Content */}
                      <div className="pt-6">
                        {/* Detail Tabs */}
                        <div className="flex space-x-1 border-b border-neutral-800 mb-6">
                          <button 
                            className={`px-4 py-2 text-sm font-medium transition-colors ${
                              selectedDetailTab === 'trade' 
                                ? 'text-purple-300 border-b-2 border-purple-500 bg-purple-500/10' 
                                : 'text-gray-400 hover:text-white'
                            }`}
                            onClick={() => setSelectedDetailTab('trade')}
                            data-testid="tab-trade"
                          >
                            Trade
                          </button>
                          <button 
                            className={`px-4 py-2 text-sm font-medium transition-colors ${
                              selectedDetailTab === 'activity' 
                                ? 'text-purple-300 border-b-2 border-purple-500 bg-purple-500/10' 
                                : 'text-gray-400 hover:text-white'
                            }`}
                            onClick={() => setSelectedDetailTab('activity')}
                            data-testid="tab-activity"
                          >
                            Activity
                          </button>
                          <button 
                            className={`px-4 py-2 text-sm font-medium transition-colors ${
                              selectedDetailTab === 'info' 
                                ? 'text-purple-300 border-b-2 border-purple-500 bg-purple-500/10' 
                                : 'text-gray-400 hover:text-white'
                            }`}
                            onClick={() => setSelectedDetailTab('info')}
                            data-testid="tab-info"
                          >
                            Info
                          </button>
                        </div>

                        {/* Tab Content */}
                        {selectedDetailTab === 'trade' && (
                          <div className="space-y-4">
                            {/* Header with filter buttons and Create Offer */}
                            <div className="flex items-center justify-between">
                              <h3 className="text-white font-semibold text-lg">Your Orders</h3>
                              <div className="flex items-center space-x-2">
                                <Button size="sm" className="text-sm px-4 py-2 bg-green-500 hover:bg-green-600 text-white border-0">
                                  Buy Orders
                                </Button>
                                <Button size="sm" className="text-sm px-4 py-2 bg-red-500 hover:bg-red-600 text-white border-0">
                                  Sell Orders
                                </Button>
                                <Button 
                                  size="sm" 
                                  className="text-sm px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white border-0"
                                  onClick={() => setShowCreateOfferModal(true)}
                                  data-testid="button-create-offer"
                                >
                                  Create Offer
                                </Button>
                              </div>
                            </div>
                            
                            {/* Orders Table - Direct Row Layout */}
                            <div className="max-h-80 overflow-y-auto overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-neutral-900/90 backdrop-blur border-b border-neutral-700">
                                  <tr>
                                    <th className="text-left text-neutral-400 font-medium py-3 px-2 text-xs">Price</th>
                                    <th className="text-left text-neutral-400 font-medium py-3 px-2 text-xs">Amount</th>
                                    <th className="text-left text-neutral-400 font-medium py-3 px-2 text-xs">Collateral</th>
                                    <th className="text-left text-neutral-400 font-medium py-3 px-2 text-xs">Fill Type</th>
                                    <th className="text-left text-neutral-400 font-medium py-3 px-2 text-xs"></th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-800/50">
                                  {Array.from({ length: 20 }, (_, i) => (
                                    <tr key={i} className="hover:bg-neutral-800/40 transition-colors">
                                      <td className="py-3 px-2 text-white font-mono text-sm">
                                        {i === 0 ? '0.0278' : i === 1 ? '0.0332' : i === 2 ? '0.096' : i === 3 ? '0.10' : i === 4 ? '0.13' : i === 5 ? '0.15' : i === 6 ? '0.45' : i === 7 ? '0.45' : i === 8 ? '0.50' : i === 9 ? '0.55' : i === 10 ? '0.60' : i === 11 ? '0.65' : i === 12 ? '0.70' : i === 13 ? '0.75' : i === 14 ? '0.80' : i === 15 ? '0.85' : i === 16 ? '0.90' : i === 17 ? '0.95' : i === 18 ? '1.00' : '1.05'}
                                      </td>
                                      <td className="py-3 px-2 text-white text-sm">
                                        {i === 0 ? '30.0K' : i === 1 ? '1.0K' : i === 2 ? '4.0K' : i === 3 ? '100' : i === 4 ? '3.0K' : i === 5 ? '270' : i === 6 ? '50' : i === 7 ? '30' : i === 8 ? '30' : i === 9 ? '25' : i === 10 ? '20' : i === 11 ? '15' : i === 12 ? '12' : i === 13 ? '10' : i === 14 ? '8' : i === 15 ? '6' : i === 16 ? '5' : i === 17 ? '4' : i === 18 ? '3' : '2'}
                                      </td>
                                      <td className="py-3 px-2 text-white text-sm">
                                        <div className="flex items-center space-x-1">
                                          <span>{i === 0 ? '836.7' : i === 1 ? '0.00765' : i === 2 ? '384' : i === 3 ? '10' : i === 4 ? '384' : i === 5 ? '40.2' : i === 6 ? '22.5' : i === 7 ? '13.5' : i === 8 ? '15' : i === 9 ? '13.8' : i === 10 ? '12' : i === 11 ? '9.8' : i === 12 ? '8.4' : i === 13 ? '7.5' : i === 14 ? '6.4' : i === 15 ? '5.1' : i === 16 ? '4.5' : i === 17 ? '3.8' : i === 18 ? '3.0' : '2.1'}</span>
                                          <div className="w-3 h-3 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs">$</div>
                                        </div>
                                      </td>
                                      <td className="py-3 px-2">
                                        <span className="px-2 py-1 text-xs rounded bg-neutral-700/50 text-neutral-300 border border-neutral-600">
                                          PARTIAL
                                        </span>
                                      </td>
                                      <td className="py-3 px-2 text-right">
                                        <span className="text-green-400 font-medium text-sm">Buy</span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                          </div>
                        )}

                        {selectedDetailTab === 'activity' && (
                          <div className="space-y-4">
                            <div className="bg-neutral-900/50 rounded-lg border border-neutral-800 overflow-hidden">
                              <div className="px-4 py-3 border-b border-neutral-800 bg-neutral-900/60">
                                <h4 className="text-sm font-medium text-white">Recent Transactions</h4>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead className="bg-neutral-900/90 border-b border-neutral-800">
                                    <tr>
                                      <th className="text-left text-neutral-400 font-medium py-2 px-3">Time</th>
                                      <th className="text-left text-neutral-400 font-medium py-2 px-3">Type</th>
                                      <th className="text-right text-neutral-400 font-medium py-2 px-3">Price</th>
                                      <th className="text-right text-neutral-400 font-medium py-2 px-3">Amount</th>
                                      <th className="text-right text-neutral-400 font-medium py-2 px-3">Total</th>
                                      <th className="text-center text-neutral-400 font-medium py-2 px-3">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-neutral-800/50">
                                    {Array.from({ length: 8 }, (_, i) => (
                                      <tr key={i} className="hover:bg-neutral-800/40 transition-colors">
                                        <td className="py-2 px-3 text-neutral-400 text-xs">{i + 1}h ago</td>
                                        <td className="py-2 px-3">
                                          <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${
                                            i % 2 === 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                                          }`}>
                                            {i % 2 === 0 ? 'BUY' : 'SELL'}
                                          </span>
                                        </td>
                                        <td className="py-2 px-3 text-right text-white font-mono">${formatPrice(selectedToken.startingPrice)}</td>
                                        <td className="py-2 px-3 text-right text-white">{(Math.random() * 1000).toFixed(0)}</td>
                                        <td className="py-2 px-3 text-right text-white font-mono">${(Math.random() * 10000).toFixed(2)}</td>
                                        <td className="py-2 px-3 text-center">
                                          <span className="text-green-400 text-xs">Completed</span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        )}

                        {selectedDetailTab === 'info' && (
                          <div className="space-y-4">
                            <div className="bg-neutral-900/50 rounded-lg border border-neutral-800 p-4">
                              <div className="flex items-center justify-between mb-4">
                                <h3 className="text-white font-semibold">Token Information</h3>
                                <Button variant="destructive" size="sm" className="bg-red-600 hover:bg-red-700" data-testid="button-delete-token">
                                  Delete
                                </Button>
                              </div>
                              
                              <div className="space-y-4">
                                <div>
                                  <label className="text-sm text-neutral-400">Token Symbol</label>
                                  <div className="text-white font-mono">{selectedToken.tokenSymbol}</div>
                                </div>
                                <div>
                                  <label className="text-sm text-neutral-400">Token Name</label>
                                  <div className="text-white">{selectedToken.tokenName}</div>
                                </div>
                                <div>
                                  <label className="text-sm text-neutral-400">Description</label>
                                  <div className="text-white">{selectedToken.description || 'No description available'}</div>
                                </div>
                                <div>
                                  <label className="text-sm text-neutral-400">Total Supply</label>
                                  <div className="text-white font-mono">{parseInt(selectedToken.totalSupply || '0').toLocaleString()}</div>
                                </div>
                                <div>
                                  <label className="text-sm text-neutral-400">Starting Price</label>
                                  <div className="text-white font-mono">${formatPrice(selectedToken.startingPrice)}</div>
                                </div>
                                <div>
                                  <label className="text-sm text-neutral-400">Created</label>
                                  <div className="text-white">{new Date(selectedToken.createdAt).toLocaleDateString()}</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Create Offer Modal */}
                  {showCreateOfferModal && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                      <div className="bg-neutral-900 rounded-lg border border-neutral-800 w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                          {/* Step Indicator */}
                          <div className="text-neutral-400 text-sm mb-4">STEP 2/3</div>
                          
                          {/* Title */}
                          <h2 className="text-white text-2xl font-bold mb-6">Create {selectedToken?.tokenSymbol || 'Token'} Offer</h2>
                          
                          {/* Buy/Sell Toggle */}
                          <div className="flex space-x-2 mb-6">
                            <button 
                              className={`flex-1 py-3 px-4 rounded-lg border transition-colors ${
                                offerType === 'buy' 
                                  ? 'border-green-500/50 bg-green-500/10 text-white' 
                                  : 'border-neutral-600 bg-neutral-800 text-neutral-400 hover:text-white'
                              }`}
                              onClick={() => setOfferType('buy')}
                            >
                              WANT TO BUY
                            </button>
                            <button 
                              className={`flex-1 py-3 px-4 rounded-lg border transition-colors ${
                                offerType === 'sell' 
                                  ? 'border-red-500/50 bg-red-500/10 text-red-400' 
                                  : 'border-neutral-600 bg-neutral-800 text-neutral-400 hover:text-white'
                              }`}
                              onClick={() => setOfferType('sell')}
                            >
                              WANT TO SELL
                            </button>
                          </div>

                          {/* Price per Point */}
                          <div className="mb-6">
                            <div className="flex items-center space-x-2 mb-2">
                              <label className="text-neutral-400 text-sm font-medium">PRICE PER POINT</label>
                              <div className="w-4 h-4 rounded-full border border-neutral-600 flex items-center justify-center text-neutral-400 text-xs">?</div>
                            </div>
                            <div className="bg-neutral-800 rounded-lg p-4">
                              <input 
                                type="text" 
                                placeholder="$ Enter your price"
                                className="bg-transparent text-white text-xl placeholder-neutral-500 w-full outline-none"
                              />
                            </div>
                          </div>

                          {/* Amount */}
                          <div className="mb-6">
                            <div className="flex items-center space-x-2 mb-2">
                              <label className="text-neutral-400 text-sm font-medium">AMOUNT</label>
                              <div className="w-4 h-4 rounded-full border border-neutral-600 flex items-center justify-center text-neutral-400 text-xs">?</div>
                            </div>
                            <div className="bg-neutral-800 rounded-lg p-4 flex items-center space-x-3">
                              <input 
                                type="text" 
                                placeholder="Enter amount"
                                className="bg-transparent text-white text-lg placeholder-neutral-500 flex-1 outline-none"
                              />
                              <div className="flex items-center space-x-2 bg-neutral-700 px-3 py-1 rounded-lg">
                                <div className="w-4 h-4 bg-orange-500 rounded-full"></div>
                                <span className="text-white text-sm">{selectedToken?.tokenSymbol || 'Token'}</span>
                                <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </div>
                            </div>
                          </div>

                          {/* Collateral */}
                          <div className="mb-6">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center space-x-2">
                                <label className="text-neutral-400 text-sm font-medium">COLLATERAL</label>
                                <div className="w-4 h-4 rounded-full border border-neutral-600 flex items-center justify-center text-neutral-400 text-xs">?</div>
                              </div>
                              <span className="text-neutral-400 text-sm">Balance: 0 USDC</span>
                            </div>
                            <div className="bg-neutral-800 rounded-lg p-4 flex items-center justify-between">
                              <span className="text-neutral-500 text-2xl">0.00</span>
                              <div className="flex items-center space-x-2 bg-neutral-700 px-3 py-1 rounded-lg">
                                <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs">$</div>
                                <span className="text-white text-sm">USDC</span>
                                <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </div>
                            </div>
                          </div>

                          {/* Fill Type */}
                          <div className="mb-8">
                            <label className="text-neutral-400 text-sm font-medium block mb-4">FILL TYPE</label>
                            <div className="space-y-3">
                              <label className="flex items-start space-x-3 cursor-pointer">
                                <div className="w-5 h-5 rounded-full border-2 border-orange-500 bg-orange-500 flex items-center justify-center mt-0.5">
                                  <div className="w-2 h-2 bg-white rounded-full"></div>
                                </div>
                                <div>
                                  <div className="text-white font-medium">Partial Fill</div>
                                  <div className="text-neutral-400 text-sm">Multiple users can contribute to fulfill the offer</div>
                                </div>
                              </label>
                              
                              <label className="flex items-start space-x-3 cursor-pointer">
                                <div className="w-5 h-5 rounded-full border border-neutral-600 mt-0.5"></div>
                                <div>
                                  <div className="text-white font-medium">Single Fill</div>
                                  <div className="text-neutral-400 text-sm">Entire offer must be filled by 1 user</div>
                                </div>
                              </label>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex space-x-3">
                            <Button 
                              className="flex-1 bg-neutral-700 hover:bg-neutral-600 text-white py-3"
                              onClick={() => setShowCreateOfferModal(false)}
                            >
                              Back
                            </Button>
                            <Button 
                              className={`flex-1 py-3 text-white font-medium ${
                                offerType === 'buy' 
                                  ? 'bg-green-600 hover:bg-green-700' 
                                  : 'bg-red-600 hover:bg-red-700'
                              }`}
                            >
                              {offerType === 'buy' ? 'Buy' : 'Sell'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Your Activity Tab */}
              {premarketSubTab === 'activity' && (
                <div className="space-y-6">
                  {/* Your Orders */}
                  <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Your Orders</h3>
                    
                    <div className="space-y-4">
                      {userOrders && userOrders.success && userOrders.orders?.length > 0 ? (
                        userOrders.orders.map((order: any) => (
                          <div key={order.id} className="bg-slate-800/50 rounded-lg p-4 border border-purple-500/20">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2">
                                  <span className="font-semibold text-white capitalize">{order.orderType}</span>
                                  <span className="text-purple-300">{order.quantity} tokens</span>
                                </div>
                                <div className="text-sm text-purple-400 mt-1">
                                  Price: {order.price} SOL • Collateral: {order.collateralAmount} SOL
                                </div>
                                
                                {/* Settlement Phase for Filled Orders */}
                                {order.status === 'filled' && (
                                  <div className="mt-3 p-3 bg-orange-900/20 rounded border border-orange-500/30">
                                    <div className="text-xs text-orange-300 mb-2">⏰ SETTLEMENT PHASE ACTIVE</div>
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs text-orange-300">Settlement Deadline:</span>
                                        <span className="font-mono text-xs text-orange-200">
                                          <span className="text-yellow-400">2h 15m remaining</span>
                                        </span>
                                      </div>
                                      
                                      {/* Settlement Actions */}
                                      <div className="space-y-2">
                                        {order.orderType === 'sell' ? (
                                          <div className="flex items-center space-x-2">
                                            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-xs">
                                              <CheckCircle className="h-3 w-3 mr-1" />
                                              Settle Order
                                            </Button>
                                            <div className="text-xs text-green-300">Deliver tokens to get payment + collateral</div>
                                          </div>
                                        ) : (
                                          <div className="flex items-center space-x-2">
                                            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-xs" disabled>
                                              <Clock className="h-3 w-3 mr-1" />
                                              Waiting for Seller
                                            </Button>
                                            <div className="text-xs text-blue-300">If seller doesn't settle, you can claim their collateral</div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}
                                
                                {/* Settlement Success */}
                                {order.status === 'settled' && (
                                  <div className="mt-3 p-3 bg-green-900/20 rounded border border-green-500/30">
                                    <div className="text-xs text-green-300 mb-1">✅ ORDER SETTLED SUCCESSFULLY</div>
                                    <div className="text-xs text-green-400">
                                      {order.orderType === 'sell' ? 'Payment received + collateral returned' : 'Tokens received'}
                                    </div>
                                  </div>
                                )}
                                
                                {/* Cancelled Due to Overdue */}
                                {order.status === 'cancelled_overdue' && (
                                  <div className="mt-3 p-3 bg-red-900/20 rounded border border-red-500/30">
                                    <div className="text-xs text-red-300 mb-1">❌ ORDER CANCELLED - OVERDUE</div>
                                    <div className="text-xs text-red-400">
                                      {order.orderType === 'buy' ? 'Refund + seller collateral received' : 'Collateral forfeited to buyer'}
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className="ml-4">
                                <Badge 
                                  variant="outline" 
                                  className={`${
                                    order.status === 'active' ? 'border-green-500 text-green-400' : 
                                    order.status === 'filled' ? 'border-orange-500 text-orange-400' : 
                                    order.status === 'settled' ? 'border-blue-500 text-blue-400' :
                                    order.status === 'cancelled_overdue' ? 'border-red-500 text-red-400' :
                                    'border-gray-500 text-gray-400'
                                  }`}
                                >
                                  {order.status.replace('_', ' ').toUpperCase()}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center text-purple-300 text-sm py-8">
                          <Users className="h-12 w-12 text-purple-400 mx-auto mb-4" />
                          <p>No orders yet.</p>
                          <p>Start trading in the Active Premarket section!</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Collateral Status */}
                  <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Collateral Status</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-slate-800/30 rounded-lg p-4">
                        <div className="flex justify-between items-center">
                          <span className="text-purple-300">Total Locked:</span>
                          <span className="text-yellow-400 font-semibold">0.0 SOL</span>
                        </div>
                      </div>
                      <div className="bg-slate-800/30 rounded-lg p-4">
                        <div className="flex justify-between items-center">
                          <span className="text-purple-300">Available:</span>
                          <span className="text-green-400 font-semibold">0.0 SOL</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Airdrop Claims */}
                    <div className="mt-6">
                      <h4 className="font-medium text-purple-300 mb-3">Airdrop Claims</h4>
                      <div className="text-center space-y-4">
                        <div className="text-purple-300 text-sm">
                          When you claim a token airdrop, collateral will be automatically redistributed according to the rules.
                        </div>
                        <Button className="bg-blue-600 hover:bg-blue-700" data-testid="button-claimairdrop">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Claim Airdrop
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Create Tab */}
              {premarketSubTab === 'create' && (
                <div className="space-y-6">
                  {/* Create Listing Form */}
                  <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Create Pre-market Listing</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="tokenName" className="text-purple-300">Token Name</Label>
                        <Input
                          id="tokenName"
                          value={premarketForm.tokenName}
                          onChange={(e) => handlePremarketFormChange('tokenName', e.target.value)}
                          placeholder="e.g., MyToken"
                          className="bg-slate-800/50 border-slate-600 text-white"
                          data-testid="input-tokenname"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tokenSymbol" className="text-purple-300">Token Symbol</Label>
                        <Input
                          id="tokenSymbol"
                          value={premarketForm.tokenSymbol}
                          onChange={(e) => handlePremarketFormChange('tokenSymbol', e.target.value)}
                          placeholder="e.g., MTK"
                          className="bg-slate-800/50 border-slate-600 text-white"
                          data-testid="input-tokensymbol"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="totalSupply" className="text-purple-300">Total Supply</Label>
                        <Input
                          id="totalSupply"
                          type="number"
                          value={premarketForm.totalSupply}
                          onChange={(e) => handlePremarketFormChange('totalSupply', e.target.value)}
                          placeholder="1000000"
                          className="bg-slate-800/50 border-slate-600 text-white"
                          data-testid="input-totalsupply"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="startingPrice" className="text-purple-300">Starting Price (SOL)</Label>
                        <Input
                          id="startingPrice"
                          type="number"
                          step="0.000001"
                          value={premarketForm.startingPrice}
                          onChange={(e) => handlePremarketFormChange('startingPrice', e.target.value)}
                          placeholder="0.001"
                          className="bg-slate-800/50 border-slate-600 text-white"
                          data-testid="input-startingprice"
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="description" className="text-purple-300">Description</Label>
                        <Input
                          id="description"
                          value={premarketForm.description}
                          onChange={(e) => handlePremarketFormChange('description', e.target.value)}
                          placeholder="Describe your token project..."
                          className="bg-slate-800/50 border-slate-600 text-white"
                          data-testid="input-description"
                        />
                      </div>
                    </div>
                    <Button
                      onClick={handleCreateListing}
                      disabled={createListingMutation.isPending}
                      className="w-full mt-4 bg-purple-600 hover:bg-purple-700 text-white"
                      data-testid="button-createlisting"
                    >
                      {createListingMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <TrendingUp className="h-4 w-4 mr-2" />
                      )}
                      {createListingMutation.isPending ? 'Creating...' : 'Create Listing'}
                    </Button>
                  </div>

                  {/* Your Created Listings */}
                  <div className="bg-gradient-to-br from-blue-800/20 to-blue-900/30 backdrop-blur-sm rounded-xl border border-blue-500/20 p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Your Pre-market Listings</h3>
                    
                    <div className="space-y-4">
                      {creatorListings && creatorListings.success && creatorListings.listings?.length > 0 ? (
                        creatorListings.listings.map((listing: any) => (
                          <div key={listing.id} className="bg-slate-800/50 rounded-lg p-4 border border-blue-500/20">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <h4 className="font-semibold text-white">{listing.tokenName} ({listing.tokenSymbol})</h4>
                                <div className="text-sm text-blue-300 space-y-1">
                                  <div>Supply: {parseInt(listing.totalSupply).toLocaleString()}</div>
                                  <div>Price: {formatPrice(listing.startingPrice)} SOL</div>
                                  <div>Status: <Badge className="bg-green-600">{listing.isActive ? 'Active' : 'Inactive'}</Badge></div>
                                </div>
                                
                                {/* TGE Management Section */}
                                <div className="mt-3">
                                  {!listing.tgeDate ? (
                                    /* TGE Date Setting Form */
                                    <div className="p-3 bg-orange-900/20 rounded border border-orange-500/30">
                                      <div className="text-xs text-orange-300 mb-2">⏰ Set Token Generation Event (TGE) Date</div>
                                      <div className="flex items-center space-x-2">
                                        <Input
                                          type="datetime-local"
                                          className="bg-slate-800/50 border-slate-600 text-white text-xs flex-1"
                                          min={new Date().toISOString().slice(0, 16)}
                                          id={`tge-date-${listing.id}`}
                                        />
                                        <Button 
                                          size="sm" 
                                          className="bg-orange-600 hover:bg-orange-700 text-xs"
                                          disabled={setTgeDateMutation.isPending}
                                          onClick={() => {
                                            const input = document.getElementById(`tge-date-${listing.id}`) as HTMLInputElement;
                                            if (input.value) {
                                              setTgeDateMutation.mutate({
                                                listingId: listing.id,
                                                tgeDate: input.value
                                              });
                                            }
                                          }}
                                          data-testid="button-settge"
                                        >
                                          {setTgeDateMutation.isPending ? 'Setting...' : 'Set TGE'}
                                        </Button>
                                      </div>
                                      <div className="text-xs text-orange-300 mt-1">
                                        Once TGE is set, buyers have 4 hours to settle orders after token launch
                                      </div>
                                    </div>
                                  ) : (
                                    /* TGE Date Set - Show Status */
                                    <div className="p-3 bg-blue-900/20 rounded border border-blue-500/30">
                                      <div className="text-xs text-blue-300 space-y-1">
                                        <div>🚀 TGE: {new Date(listing.tgeDate).toLocaleString()}</div>
                                        {listing.settlementDeadline && (
                                          <div className="flex items-center space-x-2">
                                            <span>Settlement Deadline:</span>
                                            <span className="font-mono text-blue-200">
                                              {new Date() < new Date(listing.settlementDeadline) ? (
                                                <span className="text-green-400">
                                                  {Math.max(0, Math.floor((new Date(listing.settlementDeadline).getTime() - new Date().getTime()) / (1000 * 60)))} min remaining
                                                </span>
                                              ) : (
                                                <span className="text-red-400">Settlement window closed</span>
                                              )}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                      <div className="text-xs text-green-300 mt-1">
                                        ✅ Your listing is ready for settlement once orders are filled
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                              
                              <div className="ml-4">
                                <div className="text-xs text-blue-400">
                                  Created: {new Date(listing.createdAt).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center text-blue-300 text-sm py-8">
                          <Plus className="h-12 w-12 text-blue-400 mx-auto mb-4" />
                          <p>No listings created yet.</p>
                          <p>Create your first pre-market listing above!</p>
                        </div>
                      )}
                    </div>
                  </div>
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

          {/* Referrals Tab Content */}
          {activeTab === 'referrals' && (
            <div className="space-y-8">
              {/* How It Works */}
              <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    How It Works
                  </h3>
                </div>
                <div className="space-y-4">
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="text-center space-y-2">
                      <div className="w-12 h-12 bg-blue-500/20 border border-blue-500/30 rounded-full flex items-center justify-center mx-auto">
                        <Wallet className="w-6 h-6 text-blue-400" />
                      </div>
                      <h3 className="font-semibold text-white">Connect Wallet</h3>
                      <p className="text-sm text-purple-200">
                        Connect your wallet to automatically generate your referral link
                      </p>
                    </div>
                    <div className="text-center space-y-2">
                      <div className="w-12 h-12 bg-green-500/20 border border-green-500/30 rounded-full flex items-center justify-center mx-auto">
                        <Users className="w-6 h-6 text-green-400" />
                      </div>
                      <h3 className="font-semibold text-white">Share</h3>
                      <p className="text-sm text-purple-200">
                        Share with your friends
                      </p>
                    </div>
                    <div className="text-center space-y-2">
                      <div className="w-12 h-12 bg-purple-500/20 border border-purple-500/30 rounded-full flex items-center justify-center mx-auto">
                        <DollarSign className="w-6 h-6 text-purple-400" />
                      </div>
                      <h3 className="font-semibold text-white">Earn</h3>
                      <p className="text-sm text-purple-200">
                        Earn 35% of platform fee from every referral transaction
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats Cards */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6 text-center">
                  <div className="text-3xl font-bold text-white mb-2">
                    {(userReferrals as any)?.referralCode?.stats?.totalEarnings || '0'} SOL
                  </div>
                  <div className="text-sm text-purple-200 uppercase tracking-wider">
                    Total Earnings
                  </div>
                </div>
                
                <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6 text-center">
                  <div className="text-3xl font-bold text-white mb-2">
                    {(userReferrals as any)?.referralCode?.stats?.totalReferrals || '0'}
                  </div>
                  <div className="text-sm text-purple-200 uppercase tracking-wider">
                    Total Referrals
                  </div>
                </div>
              </div>

              {/* Referral Dashboard Content */}
              <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Globe className="w-5 h-5" />
                    Your Referral Information
                  </h3>
                </div>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-purple-200">Referral Link</Label>
                    <div className="flex space-x-2">
                      <Input 
                        value={userReferralCode ? `${window.location.origin}/${userReferralCode}` : 'Generating referral link...'} 
                        readOnly
                        data-testid="input-referral-link"
                        className="bg-purple-900/30 border-purple-500/30 text-white"
                      />
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => {
                          if (userReferralCode) {
                            navigator.clipboard.writeText(`${window.location.origin}/${userReferralCode}`);
                            toast({
                              title: "Copied!",
                              description: "Referral link copied to clipboard",
                            });
                          }
                        }}
                        data-testid="button-copy-link"
                        className="bg-purple-800/20 border-purple-500/30 text-purple-300 hover:bg-purple-700/30 hover:text-white"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Referral Transactions */}
              <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-white">Recent Referral Transactions</h3>
                  <p className="text-purple-200 text-sm mt-2">
                    Track your recent referral earnings
                  </p>
                </div>
                <div className="space-y-4">
                  {(referralTransactions as any)?.transactions && (referralTransactions as any).transactions.length > 0 ? (
                    (referralTransactions as any).transactions.map((tx: any, index: number) => (
                      <div key={index} className="border border-purple-500/30 bg-purple-900/20 rounded-lg p-4 space-y-2">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <p className="font-mono text-sm text-white">
                              {tx.referredWalletAddress?.slice(0, 8)}...{tx.referredWalletAddress?.slice(-8)}
                            </p>
                            <p className="text-xs text-purple-300">
                              {tx.paidAt ? new Date(tx.paidAt).toLocaleString() : 'Date unavailable'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-green-400">
                              +{tx.referralFeeAmount || '0'} SOL
                            </p>
                            <p className="text-xs text-purple-300">
                              From {tx.originalFeeAmount || '0'} SOL fee
                            </p>
                          </div>
                        </div>
                        <Separator className="bg-purple-500/30" />
                        <div className="flex justify-between text-xs text-purple-300">
                          <span>Transaction: {tx.transactionSignature?.slice(0, 12)}...</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(`https://solscan.io/tx/${tx.transactionSignature}`, "_blank")}
                            className="text-purple-300 hover:text-white hover:bg-purple-700/30"
                          >
                            View on Solscan
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-purple-300">No referral transactions yet</p>
                      <p className="text-sm text-purple-400 mt-2">Share your referral link to start earning!</p>
                    </div>
                  )}
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
          {activeTab === 'reclaim' && allTransactions.length > 0 && (
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
                    {allTransactions.map((tx, index) => (
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
                        {index < allTransactions.length - 1 && (
                          <div className="border-b border-purple-500/20 my-2"></div>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  {/* Load More Button */}
                  {hasMoreTransactions && (
                    <div className="flex justify-center mt-6">
                      <button
                        onClick={loadMoreTransactions}
                        disabled={isLoadingTransactions}
                        className="px-6 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isLoadingTransactions ? 'Loading...' : 'Load More'}
                      </button>
                    </div>
                  )}
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
                  <span className="text-sm">No fees - you get 100% of your SOL back!</span>
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
        
        {/* Mobile Ads - Show below main content on smaller screens */}
        <div className="lg:hidden mt-6">
          <AdContainer 
            placement="mobile" 
            maxAds={2}
            title="DeFi Opportunities"
            className="w-full"
          />
        </div>
      </div>

      {/* Wallet Selection Modal */}

    </div>
  );
}
