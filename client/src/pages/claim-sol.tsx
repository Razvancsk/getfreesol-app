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
import { Coins, Wallet, Search, CheckCircle, ExternalLink, AlertTriangle, RefreshCw, Flame, Image, Trash2, ArrowLeftRight, ArrowUpDown, Copy, Share2, Users, TrendingUp, DollarSign, Globe, ChevronDown, Code, Shield, Cpu, TreePine, Info, Check, Plane, Zap, X } from "lucide-react";
import { SiX, SiDiscord } from 'react-icons/si';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWalletAdapter } from '@/hooks/useWalletAdapter';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { VersionedTransaction, Connection, PublicKey, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccountInstruction, createTransferInstruction } from '@solana/spl-token';
import { SwapModal } from '@/components/SwapModal';
import { ShareModal } from '@/components/ShareModal';
import { LendPositions } from '@/components/LendPositions';
import logoImage from '@assets/image_1757882056840.png';
import swapButtonImage from '@assets/image_1760235318056.png';
import pumpkinImage from '@assets/image_1761923461687.png';
import halloweenBg from '@assets/image_1761925113493.png';

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
  const wallet = useWallet();
  const { connection: rpcConnection } = useConnection();
  const isMobile = useIsMobile();
  
  // Note: UMI will be created inside the burn handler to avoid initialization errors
  
  const donationPercentage = 15; // Fixed 15% service fee
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'referrals' | 'reclaim' | 'burnTokens' | 'statistics' | 'massTransfer' | 'lend'>('reclaim');
  const [burnSubTab, setBurnSubTab] = useState<'tokens' | 'nft'>('tokens');
  const [selectedTokenMint, setSelectedTokenMint] = useState<string>('So11111111111111111111111111111111111111112'); // Default to SOL
  const [tokenList, setTokenList] = useState<any[]>([]);
  const [nftData, setNftData] = useState<any>(null);
  const [selectedNfts, setSelectedNfts] = useState<Set<string>>(new Set());
  const [referralCode, setReferralCode] = useState<string>('');
  const [userReferralCode, setUserReferralCode] = useState<string | null>(null);

  // Selection states for bulk burning
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  
  // Mass transfer states
  const [massTransferTokens, setMassTransferTokens] = useState<any[]>([]);
  const [selectedTransferTokens, setSelectedTransferTokens] = useState<Set<string>>(new Set());
  const [tokenAmounts, setTokenAmounts] = useState<Map<string, string>>(new Map());
  
  // Jupiter Lend states
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [selectedReserve, setSelectedReserve] = useState<any>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositRawAmount, setDepositRawAmount] = useState<string | null>(null); // Store raw amount for withdrawals to avoid float precision loss
  const [depositingLend, setDepositingLend] = useState(false);
  const [lendMode, setLendMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [destinationWallet, setDestinationWallet] = useState<string>('');
  const [loadingTransferTokens, setLoadingTransferTokens] = useState(false);
  const [walletTokenBalance, setWalletTokenBalance] = useState<number>(0);
  const [lendStats, setLendStats] = useState<{ totalDepositsUsd: string; totalEarningsUsd: string } | null>(null);
  
  // Swap modal state
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
  
  // Share modal state
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareData, setShareData] = useState<{ solClaimed: number } | null>(null);

  // Statistics queries for time-filtered data (SOL recovered)
  const { data: stats24h } = useQuery<{ success: boolean; period: string; stats: { totalUsers: number; totalSolRecovered: string } }>({
    queryKey: ['/api/statistics/overview', '24h'],
    queryFn: async () => {
      const response = await fetch('/api/statistics/overview?period=24h');
      if (!response.ok) throw new Error('Failed to fetch statistics');
      return response.json();
    },
    enabled: activeTab === 'statistics',
  });

  const { data: statsWeekly } = useQuery<{ success: boolean; period: string; stats: { totalUsers: number; totalSolRecovered: string } }>({
    queryKey: ['/api/statistics/overview', 'weekly'],
    queryFn: async () => {
      const response = await fetch('/api/statistics/overview?period=weekly');
      if (!response.ok) throw new Error('Failed to fetch statistics');
      return response.json();
    },
    enabled: activeTab === 'statistics',
  });

  const { data: statsMonthly } = useQuery<{ success: boolean; period: string; stats: { totalUsers: number; totalSolRecovered: string } }>({
    queryKey: ['/api/statistics/overview', 'monthly'],
    queryFn: async () => {
      const response = await fetch('/api/statistics/overview?period=monthly');
      if (!response.ok) throw new Error('Failed to fetch statistics');
      return response.json();
    },
    enabled: activeTab === 'statistics',
  });

  // All-time data for Total Wallets
  const { data: statsAllTime } = useQuery<{ success: boolean; period: string; stats: { totalUsers: number; totalSolRecovered: string } }>({
    queryKey: ['/api/statistics/overview', 'all'],
    queryFn: async () => {
      const response = await fetch('/api/statistics/overview?period=all');
      if (!response.ok) throw new Error('Failed to fetch statistics');
      return response.json();
    },
    enabled: activeTab === 'statistics',
  });

  const { data: leaderboardData } = useQuery<{ success: boolean; period: string; leaderboard: Array<{ walletAddress: string; totalSolRecovered: string }> }>({
    queryKey: ['/api/statistics/leaderboard', 'all'],
    queryFn: async () => {
      const response = await fetch('/api/statistics/leaderboard?period=all&limit=10');
      if (!response.ok) throw new Error('Failed to fetch leaderboard');
      return response.json();
    },
    enabled: activeTab === 'statistics',
  });

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


  // Function to load mass transfer tokens
  const loadMassTransferTokens = async () => {
    if (!publicKey) {
      console.log('No publicKey available for loading tokens');
      return;
    }
    
    console.log('Loading tokens for wallet:', publicKey.toBase58());
    setLoadingTransferTokens(true);
    try {
      // Fetch SPL tokens
      const response = await fetch(`/api/tokens/holdings/${publicKey.toBase58()}`);
      console.log('Holdings API response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Holdings API error:', errorText);
        throw new Error(`Failed to fetch token holdings: ${response.status}`);
      }
      const data = await response.json();
      console.log('Received token data:', data);
      const tokensWithBalance = data.filter((t: any) => t.balance > 0);
      
      // Get SOL balance
      const solBalance = await rpcConnection.getBalance(publicKey);
      const solInSol = solBalance / 1_000_000_000;
      console.log('SOL balance:', solInSol);
      
      // Add SOL as the first token if balance > 0
      const allTokens = [];
      if (solInSol > 0) {
        allTokens.push({
          mint: 'So11111111111111111111111111111111111111112', // SOL mint address
          symbol: 'SOL',
          name: 'Solana',
          logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
          balance: solInSol,
          decimals: 9,
          isNativeSOL: true,
          accounts: [] // No token accounts for native SOL
        });
      }
      allTokens.push(...tokensWithBalance);
      
      console.log('Total tokens loaded:', allTokens.length);
      setMassTransferTokens(allTokens);
      setSelectedTransferTokens(new Set());
    } catch (error: any) {
      console.error('Token loading error:', error);
      toast({
        title: "Error loading tokens",
        description: error.message || 'Unknown error',
        variant: "destructive",
      });
    } finally {
      setLoadingTransferTokens(false);
    }
  };

  // Function to fetch wallet balance for a specific token (for Lend deposit dialog)
  const fetchTokenBalance = async (tokenMint: string) => {
    if (!publicKey) {
      setWalletTokenBalance(0);
      return;
    }
    
    try {
      // Fetch from Jupiter Ultra Holdings API
      const response = await fetch(`https://lite-api.jup.ag/ultra/v1/holdings/${publicKey.toBase58()}`);
      
      if (!response.ok) {
        setWalletTokenBalance(0);
        return;
      }
      
      const data = await response.json();
      
      // Special handling for WSOL/SOL - native SOL balance is at top level
      if (tokenMint === 'So11111111111111111111111111111111111111112') {
        setWalletTokenBalance(data.uiAmount || 0);
        return;
      }
      
      // For other tokens, check the tokens object
      if (data.tokens && data.tokens[tokenMint]) {
        const tokenAccounts = data.tokens[tokenMint];
        // Sum all token account balances for this mint
        const totalBalance = tokenAccounts.reduce((sum: number, account: any) => {
          return sum + (account.uiAmount || 0);
        }, 0);
        setWalletTokenBalance(totalBalance);
      } else {
        setWalletTokenBalance(0);
      }
    } catch (error) {
      console.error('Error fetching token balance:', error);
      setWalletTokenBalance(0);
    }
  };

  // Auto-scan wallet when user connects or switches tabs
  useEffect(() => {
    if (isConnected && publicKey && activeTab !== 'referrals') {
      if (activeTab === 'reclaim') {
        scanMutation.mutate(publicKey.toString());
      } else if (activeTab === 'burnTokens') {
        if (burnSubTab === 'tokens') {
          scanTokensMutation.mutate(publicKey.toString());
        } else if (burnSubTab === 'nft') {
          scanNftsMutation.mutate(publicKey.toString());
        }
      } else if (activeTab === 'massTransfer') {
        // Auto-load tokens for mass transfer tab
        loadMassTransferTokens();
      }
    }
  }, [isConnected, publicKey, activeTab, burnSubTab]);

  // Fetch lend statistics for platform wallet
  useEffect(() => {
    if (activeTab === 'lend' && publicKey?.toString() === 'GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6') {
      fetch('/api/jupiter-lend/statistics')
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setLendStats(data);
          }
        })
        .catch(err => console.error('Failed to fetch lend stats:', err));
    }
  }, [activeTab, publicKey]);

  // Query to get user's referral code and stats
  const { data: userReferrals } = useQuery({
    queryKey: ['/api/referrals/wallet', publicKey?.toString()],
    enabled: !!publicKey,
    retry: false,
  });

  // Query to get mass transfer stats (only fetch when platform wallet is connected)
  const isPlatformWallet = publicKey?.toString() === 'GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6';
  const { data: massTransferStats } = useQuery<{ success: boolean; stats: { totalUniqueUsers: number; totalTransfers: number } }>({
    queryKey: ['/api/mass-transfer/stats'],
    enabled: activeTab === 'massTransfer' && isPlatformWallet,
    retry: false,
  });

  // Query to get referral transactions
  const { data: referralTransactions } = useQuery({
    queryKey: ['/api/referrals', (userReferrals as any)?.referralCode?.id, 'transactions'],
    enabled: !!(userReferrals as any)?.referralCode?.id,
    retry: false,
  });

  // Jupiter Lend query is now handled inside LendPositions component

  // Query for user positions
  const { data: userPositions, isLoading: loadingPositions } = useQuery<{ success: boolean; hasPositions: boolean; deposits: any[]; totalDepositValue: string }>({
    queryKey: ['/api/jupiter-lend/user-positions', publicKey?.toString()],
    queryFn: async () => {
      if (!publicKey) return null;
      const response = await fetch(`/api/jupiter-lend/user-positions/${publicKey.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch user positions');
      const data = await response.json();
      console.log('User positions data:', data);
      return data;
    },
    enabled: activeTab === 'lend' && !!publicKey,
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

  // Clear scan results and reset to first tab when wallet disconnects
  useEffect(() => {
    if (!isConnected || !publicKey) {
      setScanResult(null);
      setActiveTab('reclaim'); // Reset to first page when wallet disconnects
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

  const scanNftsMutation = useMutation({
    mutationFn: async (address: string) => {
      const response = await fetch(`/api/nfts/scan/${address}`);
      if (!response.ok) {
        throw new Error('Failed to scan NFTs');
      }
      return response.json();
    },
    onSuccess: (data: any) => {
      setNftData(data);
      // Clear NFT selection when data changes
      setSelectedNfts(new Set());
    },
    onError: (error: any) => {
      toast({
        title: "NFT Scan Failed",
        description: error.message || "Failed to scan wallet for NFTs",
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

      // Wait for confirmation and verify SUCCESS
      await connection.confirmTransaction(signature, 'confirmed');
      
      // Check if transaction actually succeeded
      const txStatus = await connection.getSignatureStatus(signature);
      if (txStatus.value?.err) {
        throw new Error(`Transaction failed on blockchain: ${JSON.stringify(txStatus.value.err)}`);
      }
      console.log('Transaction confirmed successfully!');

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

      // Wait for confirmation and verify SUCCESS
      await connection.confirmTransaction(signature, 'confirmed');
      
      // Check if transaction actually succeeded
      const txStatus = await connection.getSignatureStatus(signature);
      if (txStatus.value?.err) {
        throw new Error(`Transaction failed on blockchain: ${JSON.stringify(txStatus.value.err)}`);
      }
      console.log('✅ Transaction confirmed successfully!');

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
        title: `Successfully burned ${result.tokensProcessed} token${result.tokensProcessed > 1 ? 's' : ''} and recovered ${result.netAmount} SOL!`,
        description: `Transaction: ${result.signature.substring(0, 8)}...`,
        className: "bg-green-600 text-white border-green-600",
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

  // Burn NFTs mutation
  const burnNftsMutation = useMutation({
    mutationFn: async (selectedNftIds: string[]) => {
      if (!isConnected || !publicKey) {
        throw new Error('Wallet not connected');
      }

      // Get the NFT data to group by type
      if (!nftData || !nftData.nfts) {
        throw new Error('No NFT data available');
      }

      // Find the selected NFTs and group them by type
      const selectedNfts = nftData.nfts.filter((nft: any) => {
        const nftId = nft.mint || nft.id || nft.assetId;
        return selectedNftIds.includes(nftId);
      });

      if (selectedNfts.length === 0) {
        throw new Error('No valid NFTs selected');
      }

      // Group NFTs by type (only excluding cNFTs - Core NFTs are now supported)
      const nftsByType: { [key: string]: any[] } = {};
      selectedNfts.forEach((nft: any) => {
        // Skip cNFTs only (Core NFTs are now supported with official Metaplex integration)
        if (nft.type === 'cnft') {
          return;
        }
        if (!nftsByType[nft.type]) {
          nftsByType[nft.type] = [];
        }
        nftsByType[nft.type].push(nft);
      });

      const results = [];

      // Process each type separately
      for (const [nftType, nfts] of Object.entries(nftsByType)) {
        console.log(`Burning ${nfts.length} ${nftType} NFTs...`);

        const nftMints = nfts.map(nft => nft.mint);

        // Handle Core NFTs with Server-Side UMI Implementation  
        if (nftType === 'core') {
          try {
            console.log('🔥 Starting Core NFT burning with server-side UMI...');
            
            if (!wallet.publicKey) {
              throw new Error('Wallet not connected');
            }

            // Prepare Core NFT IDs (use the actual ID from the NFT objects)
            const coreNftIds = nfts.map(nft => nft.id || nft.mint || nft.assetId);
            console.log(`📦 Preparing burn transactions for ${coreNftIds.length} Core NFTs...`);

            // Call server to prepare burn transactions (new batching API)
            const prepareResponseRaw = await apiRequest('POST', '/api/core-nfts/prepare-burn', { 
              coreNftIds,
              walletAddress: wallet.publicKey.toString()
            });
            const prepareResponse = await prepareResponseRaw.json();

            console.log('🔧 Server prepared burn batches:', {
              rawResponse: prepareResponse,
              hasSuccess: 'success' in prepareResponse,
              successValue: prepareResponse.success,
              hasBatches: 'batches' in prepareResponse,
              batchesValue: prepareResponse.batches,
              totalBatches: prepareResponse.totalBatches,
              totalNfts: prepareResponse.totalNfts
            });

            if (!prepareResponse.success || !prepareResponse.batches) {
              console.error('❌ Server response validation failed:', {
                success: prepareResponse.success,
                batches: prepareResponse.batches
              });
              throw new Error('Server failed to prepare burn batches');
            }

            // 🚀 NEW: Handle multiple batches (max 5 NFTs per signature!)
            if (!prepareResponse.batches || prepareResponse.batches.length === 0) {
              throw new Error('No burn batches prepared by server');
            }

            console.log(`🔥 Processing ${prepareResponse.totalBatches} batches for ${prepareResponse.totalNfts} Core NFTs (max 5 per signature)...`);

            const allBatchResults = [];
            let totalNetAmount = 0;
            let totalRentRecovered = 0;
            let totalBurned = 0;

            // Process each batch sequentially (user signs each one)
            for (let i = 0; i < prepareResponse.batches.length; i++) {
              const batch = prepareResponse.batches[i];
              console.log(`🔐 Signing batch ${batch.batchIndex}/${prepareResponse.totalBatches} with ${batch.nftCount} Core NFTs...`);

              if (!batch.transaction) {
                throw new Error(`No transaction in batch ${batch.batchIndex}`);
              }

              if (!batch.nftIds || !Array.isArray(batch.nftIds)) {
                throw new Error(`Invalid batch ${batch.batchIndex} format - missing nftIds array`);
              }

              // Deserialize the batch transaction from base64 (legacy transaction)
              const transactionBuffer = Buffer.from(batch.transaction, 'base64');
              const { Transaction } = await import('@solana/web3.js');
              const transaction = Transaction.from(transactionBuffer);

              // Sign this batch transaction
              if (!wallet.signTransaction) {
                throw new Error('Wallet does not support transaction signing');
              }
              const signedTransaction = await wallet.signTransaction(transaction);
              console.log(`✅ Batch ${batch.batchIndex} transaction signed for ${batch.nftCount} Core NFTs!`);

              // Submit the signed batch transaction via server relay
              console.log(`📡 Submitting batch ${batch.batchIndex} transaction via server relay...`);
              const relayResponseRaw = await apiRequest('POST', '/api/tx/relay', {
                signedTxBase64: Buffer.from(signedTransaction.serialize()).toString('base64'),
                description: `Core NFT batch burn ${batch.batchIndex}: ${batch.nftCount} NFTs`,
                skipPreflight: true
              });
              const relayResponse = await relayResponseRaw.json();

              if (!relayResponse.success || !relayResponse.signature) {
                throw new Error(`Batch ${batch.batchIndex} relay failed: ${relayResponse.error || 'No signature returned'}`);
              }

              const signature = relayResponse.signature;
              console.log(`🚀 Batch ${batch.batchIndex} confirmed: ${signature}`);

              // Record each NFT burn in the database for this batch
              for (const nftId of batch.nftIds) {
                try {
                  await apiRequest('POST', '/api/nfts/burn/record', {
                    signature,
                    nftMint: nftId,
                    rentRecovered: batch.expectedRent / batch.nftCount, // Split batch rent
                    netAmount: batch.netAmount / batch.nftCount, // Split batch net
                    feeAmount: (batch.platformFee + batch.referralFee) / batch.nftCount,
                    platformFeeAmount: batch.platformFee / batch.nftCount,
                    referralFeeAmount: batch.referralFee / batch.nftCount,
                    walletAddress: wallet.publicKey.toString(),
                    nftType: 'core',
                    success: true
                  });
                  console.log(`✅ Core NFT burn recorded in database: ${nftId}`);
                  
                  allBatchResults.push({
                    mint: nftId,
                    signature,
                    rentRecovered: batch.expectedRent / batch.nftCount
                  });
                } catch (recordError) {
                  console.warn(`⚠️ Failed to record Core NFT burn in database for ${nftId}:`, recordError);
                }
              }

              // Track totals across all batches
              totalNetAmount += batch.netAmount;
              totalRentRecovered += batch.expectedRent;
              totalBurned += batch.nftCount;
              console.log(`✅ Batch ${batch.batchIndex} completed: ${batch.nftCount} NFTs, rent: ${batch.expectedRent} SOL, net: ${batch.netAmount} SOL`);
            }

            // All batches completed successfully
            if (allBatchResults.length === 0) {
              throw new Error('Failed to record any NFT burns in database');
            }

            console.log(`🎉 Successfully burned ${totalBurned} Core NFTs across ${prepareResponse.totalBatches} batches!`);
            console.log(`💰 Total net amount received: ${totalNetAmount} SOL after fees`);

            // Show any failed NFTs as warnings
            if (prepareResponse.failedNfts && prepareResponse.failedNfts.length > 0) {
              console.warn(`⚠️ ${prepareResponse.failedNfts.length} NFTs failed validation:`, prepareResponse.failedNfts.map((f: any) => f.nftId));
            }

            // Optimistically remove burned NFTs from local state immediately
            const burnedIds = allBatchResults.map(burn => burn.mint);
            console.log(`🔥 Debug: burnedIds from all batches:`, burnedIds);
            
            // Clear burned NFTs from selection first
            setSelectedNfts(prev => {
              const newSet = new Set(prev);
              burnedIds.forEach(id => newSet.delete(id));
              return newSet;
            });

            // Update local NFT data state to remove burned NFTs immediately  
            setNftData((prev: any) => {
              if (!prev?.nfts) {
                return prev;
              }
              
              const filtered = prev.nfts.filter((nft: any) => {
                const nftId = nft.id || nft.mint || nft.assetId;
                return !burnedIds.includes(nftId);
              });
              
              return {
                ...prev,
                nfts: filtered
              };
            });

            // Show success message with green styling and transaction signature
            const firstSignature = allBatchResults[0]?.signature || '';
            toast({
              title: `Successfully burned ${totalBurned} Core NFT${totalBurned > 1 ? 's' : ''} in ${prepareResponse.totalBatches} batch${prepareResponse.totalBatches > 1 ? 'es' : ''}`,
              description: `${totalRentRecovered.toFixed(6)} SOL reclaimed | First tx: ${firstSignature.substring(0, 8)}...`,
              className: "bg-green-600 text-white border-green-600",
            });

            // Add results to main results array
            results.push({
              type: 'core',
              signatures: allBatchResults.map(r => r.signature),
              totalBurned,
              totalNetAmount,
              batchCount: prepareResponse.totalBatches
            });

            return;

          } catch (coreError: any) {
            console.error('❌ Core NFT burning failed:', {
              error: coreError,
              message: coreError instanceof Error ? coreError.message : String(coreError),
              stack: coreError instanceof Error ? coreError.stack : undefined,
              details: coreError
            });
            
            toast({
              title: "Core NFT Burning Failed",
              description: coreError.message || 'An unexpected error occurred',
              variant: "destructive",
            });
            
            throw coreError;
          }
        }

        // Handle Programmable NFTs with Server-Side UMI Implementation  
        if (nftType === 'pnft' || nftType === 'programmable') {
          try {
            console.log('🔥 Starting Programmable NFT burning with server-side UMI...');
            
            if (!wallet.publicKey) {
              throw new Error('Wallet not connected');
            }

            // Prepare pNFT IDs (use the actual ID from the NFT objects)
            const pNftIds = nfts.map(nft => nft.id || nft.mint || nft.assetId);
            console.log(`📦 Preparing burn transactions for ${pNftIds.length} Programmable NFTs...`);

            // Call server to prepare pNFT burn transactions
            const prepareResponseRaw = await apiRequest('POST', '/api/pnfts/prepare-burn', {
              pNftIds,
              walletAddress: wallet.publicKey.toString()
            });
            const prepareResponse = await prepareResponseRaw.json();

            console.log('🔧 Server prepared pNFT burn batches:', {
              rawResponse: prepareResponse,
              hasSuccess: 'success' in prepareResponse,
              successValue: prepareResponse.success,
              hasBatches: 'batches' in prepareResponse,
              batchesValue: prepareResponse.batches,
              batchesType: typeof prepareResponse.batches,
              batchesLength: Array.isArray(prepareResponse.batches) ? prepareResponse.batches.length : 'not array'
            });

            // 🚀 NEW: Handle multiple batches (max 5 NFTs per signature!)
            if (!prepareResponse.batches || prepareResponse.batches.length === 0) {
              throw new Error('No PNFT burn batches prepared by server');
            }

            console.log(`🔥 Processing ${prepareResponse.totalBatches} batches for ${prepareResponse.totalNfts} Programmable NFTs (max 5 per signature)...`);

            const allBatchResults = [];
            let totalRentRecovered = 0;
            let totalBurned = 0;

            // Process each batch sequentially (user signs each one)
            for (let i = 0; i < prepareResponse.batches.length; i++) {
              const batch = prepareResponse.batches[i];
              console.log(`🔐 Signing batch ${batch.batchIndex}/${prepareResponse.totalBatches} with ${batch.nftCount} Programmable NFTs...`);

              if (!batch.transaction) {
                throw new Error(`No transaction in batch ${batch.batchIndex}`);
              }

              if (!batch.nftIds || !Array.isArray(batch.nftIds)) {
                throw new Error(`Invalid batch ${batch.batchIndex} format - missing nftIds array`);
              }

              // Deserialize the batch transaction from base64 (versioned transaction for PNFTs)
              const transactionBuffer = Buffer.from(batch.transaction, 'base64');
              const transaction = VersionedTransaction.deserialize(transactionBuffer);

              // Sign this batch transaction
              const signedTransaction = await signTransaction(transaction);
              console.log(`✅ Batch ${batch.batchIndex} transaction signed for ${batch.nftCount} Programmable NFTs!`);

              // Submit the signed batch transaction via server relay
              console.log(`📡 Submitting batch ${batch.batchIndex} transaction via server relay...`);
              const relayResponseRaw = await apiRequest('POST', '/api/tx/relay', {
                signedTxBase64: Buffer.from(signedTransaction.serialize()).toString('base64'),
                description: `PNFT batch burn ${batch.batchIndex}: ${batch.nftCount} NFTs`,
                skipPreflight: true
              });
              const relayResponse = await relayResponseRaw.json();

              if (!relayResponse.success || !relayResponse.signature) {
                throw new Error(`Batch ${batch.batchIndex} relay failed: ${relayResponse.error || 'No signature returned'}`);
              }

              const signature = relayResponse.signature;
              console.log(`🚀 Batch ${batch.batchIndex} confirmed: ${signature}`);

              // Record each NFT burn in the database for this batch
              for (const nftId of batch.nftIds) {
                try {
                  await apiRequest('POST', '/api/nfts/burn/record', {
                    signature,
                    nftMint: nftId,
                    rentRecovered: batch.expectedRent / batch.nftCount, // Split batch rent evenly
                    walletAddress: wallet.publicKey.toString(),
                    nftType: 'pnft',
                    success: true
                  });
                } catch (recordError) {
                  console.warn(`⚠️ Failed to record PNFT burn for ${nftId}:`, recordError);
                }
              }

              // Track batch results
              allBatchResults.push({
                batchIndex: batch.batchIndex,
                signature,
                nftIds: batch.nftIds,
                nftCount: batch.nftCount,
                rentRecovered: batch.expectedRent,
                netAmount: batch.netAmount
              });

              totalRentRecovered += batch.expectedRent;
              totalBurned += batch.nftCount;

              console.log(`✅ Batch ${batch.batchIndex} processed: ${batch.nftCount} Programmable NFTs burned, ${batch.expectedRent} SOL recovered`);
            }

            if (allBatchResults.length === 0 || totalBurned === 0) {
              throw new Error('No Programmable NFTs were successfully burned');
            }

            console.log(`🎉 Successfully burned ${totalBurned} Programmable NFTs in ${allBatchResults.length} batches!`);
            console.log(`💰 Total rent recovered: ${totalRentRecovered} SOL`);

            // Optimistically remove burned pNFTs from local state immediately
            const burnedIds = allBatchResults.flatMap(batch => batch.nftIds);
            console.log(`🔥 pNFT Debug: burnedIds:`, burnedIds);
            console.log(`🔥 pNFT Debug: current nftData:`, nftData);
            
            // Clear burned pNFTs from selection first
            setSelectedNfts(prev => {
              const newSet = new Set(prev);
              burnedIds.forEach(id => newSet.delete(id));
              return newSet;
            });

            // Update local NFT data state to remove burned pNFTs immediately  
            setNftData((prev: any) => {
              console.log(`🔥 pNFT Debug: setNftData prev:`, prev);
              if (!prev?.nfts) {
                console.log(`🔥 pNFT Debug: No NFTs in prev data`);
                return prev;
              }
              
              const currentIds = prev.nfts.map((nft: any) => nft.id || nft.mint || nft.assetId);
              console.log(`🔥 pNFT Debug: current NFT IDs:`, currentIds);
              
              const filtered = prev.nfts.filter((nft: any) => {
                const nftId = nft.id || nft.mint || nft.assetId;
                const shouldKeep = !burnedIds.includes(nftId);
                console.log(`🔥 pNFT Debug: NFT ${nftId} - Keep: ${shouldKeep}`);
                return shouldKeep;
              });
              
              console.log(`🔥 pNFT Debug: Filtered NFTs:`, filtered);
              
              const result = {
                ...prev,
                nfts: filtered
              };
              
              console.log(`🔥 pNFT Debug: Final result:`, result);
              return result;
            });

            // Show success message with green styling and transaction signature
            const firstSignature = allBatchResults[0]?.signature || '';
            toast({
              title: `Successfully burned ${totalBurned} Programmable NFT${totalBurned > 1 ? 's' : ''}`,
              description: `Transaction: ${firstSignature.substring(0, 8)}...`,
              className: "bg-green-600 text-white border-green-600",
            });

            // Don't invalidate immediately - let optimistic update handle UI state
            // We'll rely on the next manual refresh or page load to sync with server

            return;

          } catch (pnftError: any) {
            console.error('❌ Programmable NFT burning failed:', {
              error: pnftError,
              message: pnftError instanceof Error ? pnftError.message : String(pnftError),
              stack: pnftError instanceof Error ? pnftError.stack : undefined,
              details: pnftError
            });
            
            // Check if this is a user cancellation - if so, don't show error toast
            const isUserCancellation = pnftError?.error?.code === 4001 || 
              pnftError?.code === 4001 ||
              pnftError?.message?.includes('User rejected') ||
              pnftError?.message?.includes('rejected the request') ||
              pnftError?.error?.message?.includes('User rejected') ||
              pnftError?.error?.message?.includes('rejected the request');
            
            if (!isUserCancellation) {
              toast({
                title: "Programmable NFT Burning Failed",
                description: pnftError.message || 'An unexpected error occurred',
                variant: "destructive",
              });
            }
            
            throw pnftError;
          }
        }

        // Handle Traditional/Standard NFTs with Server-Side UMI Implementation  
        if (nftType === 'standard') {
          try {
            console.log('🔥 Starting Traditional NFT burning with server-side UMI...');
            
            if (!wallet.publicKey) {
              throw new Error('Wallet not connected');
            }

            // Prepare standard NFT IDs (use the actual ID from the NFT objects)
            const standardNftIds = nfts.map(nft => nft.id || nft.mint || nft.assetId);
            console.log(`📦 Preparing burn transactions for ${standardNftIds.length} Traditional NFTs...`);

            // Call server to prepare standard NFT burn transactions
            const prepareResponseRaw = await apiRequest('POST', '/api/standard-nfts/prepare-burn', {
              standardNftIds,
              walletAddress: wallet.publicKey.toString()
            });
            const prepareResponse = await prepareResponseRaw.json();

            console.log('🔧 Server prepared Traditional NFT burn batches:', {
              rawResponse: prepareResponse,
              hasSuccess: 'success' in prepareResponse,
              successValue: prepareResponse.success,
              hasBatches: 'batches' in prepareResponse,
              batchesValue: prepareResponse.batches,
              batchesType: typeof prepareResponse.batches,
              batchesLength: Array.isArray(prepareResponse.batches) ? prepareResponse.batches.length : 'not array'
            });

            // 🚀 NEW: Handle multiple batches (max 5 NFTs per signature!)
            if (!prepareResponse.batches || prepareResponse.batches.length === 0) {
              throw new Error('No Traditional NFT burn batches prepared by server');
            }

            console.log(`🔥 Processing ${prepareResponse.totalBatches} batches for ${prepareResponse.totalNfts} Traditional NFTs (max 5 per signature)...`);

            const allBatchResults = [];
            let totalRentRecovered = 0;
            let totalBurned = 0;

            // Process each batch sequentially (user signs each one)
            for (let i = 0; i < prepareResponse.batches.length; i++) {
              const batch = prepareResponse.batches[i];
              console.log(`🔐 Signing batch ${batch.batchIndex}/${prepareResponse.totalBatches} with ${batch.nftCount} Traditional NFTs...`);

              if (!batch.transaction) {
                throw new Error(`No transaction in batch ${batch.batchIndex}`);
              }

              if (!batch.nftIds || !Array.isArray(batch.nftIds)) {
                throw new Error(`Invalid batch ${batch.batchIndex} format - missing nftIds array`);
              }

              // Deserialize the batch transaction from base64 (versioned transaction for Traditional NFTs)
              const transactionBuffer = Buffer.from(batch.transaction, 'base64');
              const transaction = VersionedTransaction.deserialize(transactionBuffer);

              // Sign this batch transaction
              const signedTransaction = await signTransaction(transaction);
              console.log(`✅ Batch ${batch.batchIndex} transaction signed for ${batch.nftCount} Traditional NFTs!`);

              // Submit the signed batch transaction via server relay
              console.log(`📡 Submitting batch ${batch.batchIndex} transaction via server relay...`);
              const relayResponseRaw = await apiRequest('POST', '/api/tx/relay', {
                signedTxBase64: Buffer.from(signedTransaction.serialize()).toString('base64'),
                description: `Traditional NFT batch burn ${batch.batchIndex}: ${batch.nftCount} NFTs`,
                skipPreflight: true
              });
              const relayResponse = await relayResponseRaw.json();

              if (!relayResponse.success || !relayResponse.signature) {
                throw new Error(`Batch ${batch.batchIndex} relay failed: ${relayResponse.error || 'No signature returned'}`);
              }

              const signature = relayResponse.signature;
              console.log(`🚀 Batch ${batch.batchIndex} confirmed: ${signature}`);

              // Record each NFT burn in the database for this batch
              for (const nftId of batch.nftIds) {
                try {
                  await apiRequest('POST', '/api/nfts/burn/record', {
                    signature,
                    nftMint: nftId,
                    rentRecovered: batch.expectedRent / batch.nftCount, // Split batch rent evenly
                    walletAddress: wallet.publicKey.toString(),
                    nftType: 'standard',
                    success: true
                  });
                } catch (recordError) {
                  console.warn(`⚠️ Failed to record Traditional NFT burn for ${nftId}:`, recordError);
                }
              }

              // Track batch results
              allBatchResults.push({
                batchIndex: batch.batchIndex,
                signature,
                nftIds: batch.nftIds,
                nftCount: batch.nftCount,
                rentRecovered: batch.expectedRent,
                netAmount: batch.netAmount
              });

              totalRentRecovered += batch.expectedRent;
              totalBurned += batch.nftCount;

              console.log(`✅ Batch ${batch.batchIndex} processed: ${batch.nftCount} Traditional NFTs burned, ${batch.expectedRent} SOL recovered`);
            }

            if (allBatchResults.length === 0 || totalBurned === 0) {
              throw new Error('No Traditional NFTs were successfully burned');
            }

            console.log(`🎉 Successfully burned ${totalBurned} Traditional NFTs in ${allBatchResults.length} batches!`);
            console.log(`💰 Total rent recovered: ${totalRentRecovered} SOL`);

            // Optimistically remove burned Traditional NFTs from local state immediately
            const burnedIds = allBatchResults.flatMap(batch => batch.nftIds);
            console.log(`🔥 Traditional NFT Debug: burnedIds:`, burnedIds);
            console.log(`🔥 Traditional NFT Debug: current nftData:`, nftData);
            
            // Clear burned Traditional NFTs from selection first
            setSelectedNfts(prev => {
              const newSet = new Set(prev);
              burnedIds.forEach(id => newSet.delete(id));
              return newSet;
            });

            // Update local NFT data state to remove burned Traditional NFTs immediately  
            setNftData((prev: any) => {
              console.log(`🔥 Traditional NFT Debug: setNftData prev:`, prev);
              if (!prev?.nfts) {
                console.log(`🔥 Traditional NFT Debug: No NFTs in prev data`);
                return prev;
              }
              
              const currentIds = prev.nfts.map((nft: any) => nft.id || nft.mint || nft.assetId);
              console.log(`🔥 Traditional NFT Debug: current NFT IDs:`, currentIds);
              
              const filtered = prev.nfts.filter((nft: any) => {
                const nftId = nft.id || nft.mint || nft.assetId;
                const shouldKeep = !burnedIds.includes(nftId);
                console.log(`🔥 Traditional NFT Debug: NFT ${nftId} - Keep: ${shouldKeep}`);
                return shouldKeep;
              });
              
              console.log(`🔥 Traditional NFT Debug: Filtered NFTs:`, filtered);
              
              const result = {
                ...prev,
                nfts: filtered
              };
              
              console.log(`🔥 Traditional NFT Debug: Final result:`, result);
              return result;
            });

            // Show success message with green styling and transaction signature
            const firstSignature = allBatchResults[0]?.signature || '';
            toast({
              title: `Successfully burned ${totalBurned} Traditional NFT${totalBurned > 1 ? 's' : ''}`,
              description: `Transaction: ${firstSignature.substring(0, 8)}...`,
              className: "bg-green-600 text-white border-green-600",
            });

            // Don't invalidate immediately - let optimistic update handle UI state
            // We'll rely on the next manual refresh or page load to sync with server

            return;

          } catch (standardError: any) {
            console.error('❌ Traditional NFT burning failed:', {
              error: standardError,
              message: standardError instanceof Error ? standardError.message : String(standardError),
              stack: standardError instanceof Error ? standardError.stack : undefined,
              details: standardError
            });
            
            toast({
              title: "Traditional NFT Burning Failed",
              description: standardError.message || 'An unexpected error occurred',
              variant: "destructive",
            });
            
            throw standardError;
          }
        }
        
        // Legacy code (disabled):
        if (false) { // Disabled legacy Core NFT code
          try {
            console.log('🔥 Attempting direct Solana transaction approach for Core NFTs...');

            // Ensure wallet is properly connected with adapter
            if (!wallet.wallet?.adapter || !wallet.publicKey) {
              throw new Error('Wallet adapter not properly connected for Core NFT burning');
            }
            console.log('✅ Wallet adapter validated');

            // Set up UMI according to official Metaplex documentation
            console.log('🔧 Creating UMI instance with RPC endpoint...');
            const heliusRpc = 'https://mainnet.helius-rpc.com/?api-key=e5a15b67-0b29-4a7f-8e31-5d4d7c8b333d';
            
            console.log('🚀 BREAKTHROUGH: Using DIRECT SOLANA TRANSACTIONS (copying working server approach)!');
            console.log('✅ Abandoning UMI completely - using exact same method that works on server');
            
            // Import necessary Solana classes 
            const { Transaction, TransactionInstruction, ComputeBudgetProgram, SystemProgram } = await import('@solana/web3.js');
            
            // Import PublicKey for Core program constants
            const { PublicKey } = await import('@solana/web3.js');
            
            // Core program constants (same as server)
            const CORE_PROGRAM_ID = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');
            const userPubkey = wallet.publicKey!;
            
            console.log('✅ Direct Solana transaction approach initialized');
            console.log('💰 User pubkey:', userPubkey.toString());

            // Now burn Core NFTs using direct Solana transactions (same as server)
            console.log('🔥 Attempting Core NFT burn with DIRECT TRANSACTIONS (server approach)...');
            
            let burnedCount = 0;
            const burnResults = [];
            let totalActualRecovered = 0;

            for (const mintAddress of nftMints) {
              try {
                console.log(`🔥 Burning Core NFT with DIRECT TRANSACTION: ${mintAddress}`);
                const assetPubkey = new PublicKey(mintAddress);

                console.log('📄 Starting Core NFT burn - letting server handle RPC verification...');

                // Build DIRECT Core burn instruction (EXACT SAME AS SERVER)
                const instructionData = Buffer.from([7]); // Burn discriminator

                const burnInstruction = new TransactionInstruction({
                  keys: [
                    { pubkey: assetPubkey, isSigner: false, isWritable: true },    // Asset to burn
                    { pubkey: userPubkey, isSigner: true, isWritable: true },     // Owner/authority  
                    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // System program
                  ],
                  programId: CORE_PROGRAM_ID,
                  data: instructionData,
                });

                // Add compute budget (same as server)
                const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
                  units: 200_000, // Enough compute for Core burn
                });

                // 🚀 HYBRID APPROACH: Server builds transaction, frontend signs
                console.log('🔥 Using hybrid approach - server builds, frontend signs...');
                
                // Step 1: Server builds the transaction  
                const buildResponse = await apiRequest('POST', '/api/nfts/burn/build', {
                  walletAddress: userPubkey.toString(),
                  nftMints: [mintAddress],
                  nftType: 'core',
                  referralCode: referralCode || undefined
                });
                
                if (!buildResponse.ok) {
                  const error = await buildResponse.text();
                  throw new Error(`Server build failed: ${error}`);
                }
                
                const { transactions } = await buildResponse.json();
                
                // Step 2: Sign all transactions
                const unsignedTxs = transactions.map((tx: any) => 
                  Transaction.from(Buffer.from(tx.transaction, 'base64'))
                );
                
                const signedTxs = await wallet.signAllTransactions!(unsignedTxs);
                
                // Step 3: Serialize signed transactions for server
                const signedTransactions = signedTxs.map(tx => 
                  Buffer.from(tx.serialize()).toString('base64')
                );
                
                // Step 4: Server submits the signed transactions  
                const signedTransactionsWithMints = signedTransactions.map((signedTx, index) => ({
                  mint: nftMints[index], // Match transaction to mint
                  signedTransaction: signedTx
                }));
                
                const submitResponse = await apiRequest('POST', '/api/nfts/burn/submit', {
                  signedTransactions: signedTransactionsWithMints,
                  walletAddress: userPubkey.toString()
                });
                
                if (!submitResponse.ok) {
                  const error = await submitResponse.text(); 
                  throw new Error(`Server submit failed: ${error}`);
                }
                
                const submitResult = await submitResponse.json();
                const txSignature = submitResult.results?.[0]?.signature || null;

                console.log('🎉 Core NFT burn succeeded with DIRECT TRANSACTIONS!');
                console.log('✅ Transaction confirmed:', txSignature);

                // ✅ Server handles rent calculation, no frontend RPC calls
                const actualRecovered = 0.004; // Standard Core NFT rent recovery (~0.004 SOL)

                console.log('✅ Core NFT DESTROYED! Metadata deleted and rent recovered!', {
                  signature: txSignature,
                  explorer: `https://solscan.io/tx/${txSignature}`,
                  rentRecovered: `${actualRecovered} SOL`
                });

                totalActualRecovered += actualRecovered;
                burnedCount++;
                burnResults.push({
                  mint: mintAddress,
                  signature: txSignature,
                  actualRentRecovered: actualRecovered,
                  success: true
                });

              } catch (burnError: any) {
                console.error(`Failed to burn Core NFT ${mintAddress}:`, {
                  message: burnError?.message || 'Unknown error',
                  stack: burnError?.stack,
                  name: burnError?.name,
                  code: burnError?.code,
                  cause: burnError?.cause,
                  fullError: burnError
                });
                burnResults.push({
                  mint: mintAddress,
                  error: burnError.message || 'Unknown error',
                  success: false
                });
              }
            }

            // Success - return results from UMI approach
            const actualTotalRent = burnResults
              .filter(r => r.success)
              .reduce((sum, r) => sum + (r.actualRentRecovered || 0), 0);

            results.push({
              type: nftType,
              nftsProcessed: burnedCount,
              totalAttempted: nftMints.length,
              solRecovered: actualTotalRent,
              netAmount: actualTotalRent,
              feeAmount: 0,
              signatures: burnResults.filter(r => r.success).map(r => r.signature)
            });

            continue; // Skip to next NFT type
            
          } catch (coreError: any) {
            console.log('❌ UMI approach failed. Trying server-side burn fallback...');
            
            // Fallback to server-side burn
            try {
              // Get real burn transactions from server
            console.log('🔄 Requesting REAL Core NFT burn transactions from server...');
            const burnPrepResponse = await apiRequest('POST', '/api/nfts/burn', {
              nftMints: nftMints,
              nftType: 'core',
              walletAddress: wallet.publicKey!.toString()
            });

            const burnPrepData = await burnPrepResponse.json();
            console.log('📋 Received burn transaction preparation:', burnPrepData);

            if (!burnPrepData.success || !burnPrepData.burnTransactions) {
              throw new Error('Failed to prepare burn transactions: ' + burnPrepData.error);
            }

            console.log(`🎯 Got ${burnPrepData.burnTransactions.length} REAL burn transactions to sign`);
            console.log(`💰 Expected total rent recovery: ${burnPrepData.totalExpectedRentSol} SOL`);

            // Sign and submit each real burn transaction
            const completedBurns = [];
            let totalActualRecovered = 0;

            for (const burnTx of burnPrepData.burnTransactions) {
              try {
                console.log(`🔥 Signing REAL burn transaction for ${burnTx.name} (${burnTx.asset})`);
                console.log(`💰 Expected rent recovery: ${burnTx.expectedRentSol} SOL`);

                // Decode the prepared transaction (legacy Transaction, not VersionedTransaction)
                const { Transaction } = await import('@solana/web3.js');
                const transaction = Transaction.from(
                  Buffer.from(burnTx.transaction, 'base64')
                );

                console.log('📝 Transaction decoded, requesting wallet signature...');

                // Get user's balance before transaction
                const balanceBefore = await rpcConnection.getBalance(wallet.publicKey!);
                console.log('💰 Balance before:', balanceBefore / 1e9, 'SOL');

                // ❌ REMOVED: Frontend RPC calls cause 403 errors - hybrid approach handles this on server

                // Sign and send the REAL burn transaction using the wallet adapter's signTransaction method
                console.log('🚀 About to sign transaction with wallet adapter...');
                console.log('🔍 Wallet info:', {
                  connected: isConnected,
                  publicKey: publicKey?.toString(),
                  walletName: walletName
                });

                let signature: string;
                try {
                  // Use the wallet adapter's signTransaction instead of sendTransaction
                  console.log('✏️ Signing transaction...');
                  const signedTransaction = await signTransaction(transaction);
                  console.log('✅ Transaction signed successfully');

                  // Send the signed transaction using RPC connection
                  console.log('📡 Sending signed transaction to network...');
                  signature = await rpcConnection.sendRawTransaction(signedTransaction.serialize(), {
                    skipPreflight: false,
                    preflightCommitment: 'confirmed',
                    maxRetries: 3
                  });

                  console.log(`✅ Transaction sent successfully: ${signature}`);
                } catch (sendError: any) {
                  console.error('❌ Transaction signing/sending error:', sendError);

                  // Try to extract meaningful error info
                  let errorMsg = 'Transaction failed';
                  if (sendError?.message) {
                    if (sendError.message.includes('User rejected')) {
                      errorMsg = 'Transaction was cancelled by user';
                    } else {
                      errorMsg = sendError.message;
                    }
                  }

                  throw new Error(errorMsg);
                }

                console.log(`✅ REAL burn transaction signed! Signature: ${signature}`);
                console.log(`🔗 Explorer: https://solscan.io/tx/${signature}`);

                // Wait for confirmation
                await rpcConnection.confirmTransaction(signature, 'confirmed');
                console.log('✅ Transaction confirmed on blockchain!');

                // Check actual rent recovered
                const balanceAfter = await rpcConnection.getBalance(wallet.publicKey!);
                const txDetails = await rpcConnection.getTransaction(signature, {
                  commitment: 'confirmed',
                  maxSupportedTransactionVersion: 0
                });
                const transactionFee = txDetails?.meta?.fee || 5000;
                const actualRecovered = (balanceAfter - balanceBefore + transactionFee) / 1e9;

                console.log(`💰 Actual SOL recovered: ${actualRecovered} SOL (after ${transactionFee / 1e9} SOL fee)`);
                console.log(`🔥 NFT ${burnTx.name} DESTROYED and rent recovered!`);

                totalActualRecovered += actualRecovered;
                completedBurns.push({
                  mint: burnTx.asset,
                  name: burnTx.name,
                  signature: signature,
                  solRecovered: actualRecovered,
                  success: true
                });

              } catch (txError: any) {
                console.error(`❌ Failed to burn ${burnTx.name}:`, txError);
                completedBurns.push({
                  mint: burnTx.asset,
                  name: burnTx.name,
                  error: txError instanceof Error ? txError.message : String(txError),
                  success: false
                });
              }
            }

            const successfulBurns = completedBurns.filter(b => b.success);

            if (successfulBurns.length === 0) {
              throw new Error('Failed to burn any Core NFTs');
            }

            console.log(`🎉 Successfully burned ${successfulBurns.length} Core NFTs!`);
            console.log(`💰 Total actual SOL recovered: ${totalActualRecovered} SOL`);

            results.push({
              type: nftType,
              nftsProcessed: successfulBurns.length,
              totalAttempted: nftMints.length,
              solRecovered: totalActualRecovered,
              netAmount: totalActualRecovered,
              feeAmount: 0,
              signatures: successfulBurns.map(b => b.signature).filter(Boolean),
              transactions: completedBurns
            });

            continue; // Skip the rest of the UMI approach

            // UNREACHABLE CODE - This section is commented out as it's after a continue statement
            /*
            let burnedCount = 0;
            const burnResults = [];

            for (const mintAddress of nftMints) {
              try {
                // Use the Core asset ID directly (not mint address)
                const assetPublicKey = umiPublicKey(mintAddress);

                console.log('🔥 Starting Core NFT burn for asset:', mintAddress);
                console.log('💰 User wallet:', wallet.publicKey?.toString());

                // Get wallet balance before burn
                const balanceBefore = await rpcConnection.getBalance(wallet.publicKey!);
                console.log('💰 Balance before:', balanceBefore / 1e9, 'SOL');

                // Try alternative approach: Use Raw Solana transaction
                console.log('🔧 Alternative approach: Direct Solana transaction...');

                let txSignature: string = '';
                try {
                  // Fetch asset info first (this should work)
                  console.log('📄 Fetching asset data...');
                  const asset = await fetchAssetV1(umi, assetPublicKey);
                  console.log('✅ Asset fetched successfully:', asset.name);

                  // Try collection-aware burn
                  console.log('🔥 Attempting collection-aware burn...');
                  const collectionId = collectionAddress(asset);
                  let collection = undefined;

                  if (collectionId) {
                    console.log('🏛️ Fetching collection:', collectionId);
                    collection = await fetchCollection(umi, collectionId as any);
                    console.log('✅ Collection fetched');
                  }

                  // Attempt burn with minimal setup
                  console.log('🔥 Executing burn transaction...');
                  const result = await burn(umi, {
                    asset: asset,
                    collection: collection,
                    authority: umi.identity,
                    payer: umi.identity,
                  }).sendAndConfirm(umi);

                  console.log('🎉 Burn succeeded with alternative approach!');

                  // Properly encode signature for Solana RPC
                  txSignature = typeof result.signature === 'string' ? result.signature : bs58.encode(result.signature as Uint8Array);
                  console.log('✅ Transaction confirmed:', txSignature);

                } catch (burnError) {
                  console.error('💥 Alternative burn approach failed:', burnError);
                  throw burnError;
                }

                // Get transaction details with error handling
                let txDetails = null;
                let networkFee = 5000; // Default Solana fee estimate
                try {
                  txDetails = await rpcConnection.getTransaction(txSignature, {
                    commitment: 'confirmed',
                    maxSupportedTransactionVersion: 0
                  });
                  networkFee = txDetails?.meta?.fee || 5000;
                } catch (error) {
                  console.warn('Could not fetch transaction details, using estimated fee');
                }

                const balanceAfter = await rpcConnection.getBalance(wallet.publicKey!);
                const actualRentRecovered = (balanceAfter - balanceBefore + networkFee) / 1e9; // Accurate with fees
                console.log('💰 Balance after:', balanceAfter / 1e9, 'SOL');

                console.log('✅ Core NFT DESTROYED! Metadata deleted and rent recovered!', {
                  signature: txSignature,
                  explorer: `https://solscan.io/tx/${txSignature}`,
                  rentRecovered: `${actualRentRecovered} SOL`,
                  networkFee: `${networkFee / 1e9} SOL`,
                  balanceBefore: balanceBefore / 1e9,
                  balanceAfter: balanceAfter / 1e9
                });

                // Note: Asset verification removed - using direct transactions

                burnedCount++;
                burnResults.push({
                  mint: mintAddress,
                  signature: txSignature,
                  actualRentRecovered,
                  success: true
                });

              } catch (error: any) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`❌ Failed to burn Core NFT ${mintAddress}:`, {
                  message: error?.message || 'Unknown error',
                  stack: error?.stack,
                  name: error?.name,
                  code: error?.code,
                  cause: error?.cause,
                  fullError: error
                });
                burnResults.push({
                  mint: mintAddress,
                  error: errorMessage,
                  success: false
                });
              }
            }

            if (burnedCount === 0) {
              throw new Error('All UMI Core NFT burns failed');
            }

            console.log(`✅ Successfully burned ${burnedCount} Core NFTs with UMI!`);
            */
            
            } catch (serverError: any) {
              console.error('❌ Server-side burn fallback also failed:', {
                message: serverError?.message || 'Unknown error',
                stack: serverError?.stack,
                name: serverError?.name,
                code: serverError?.code,
                cause: serverError?.cause,
                fullError: serverError
              });
              throw new Error(`Core NFT burning failed: ${serverError.message || 'All approaches failed'}`);
            }
          }
        }

        // For non-Core NFTs, use server API (will return error for unsupported types)
        const response = await fetch('/api/nfts/burn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: publicKey.toString(),
            nftMints,
            nftType,
            referralCode: referralCode || undefined
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`${nftType} NFT burning: ${errorData.error || 'This NFT type is not supported for burning'}`);
        }

        const { transaction, nftsProcessed, solRecovered, netAmount, feeAmount } = await response.json();

        // Sign and send transaction using connected wallet
        const { Connection, Transaction } = await import('@solana/web3.js');

        const heliusResponse = await fetch('/api/helius-config');
        const rpcConfig = await heliusResponse.json();

        const connection = new Connection(
          rpcConfig.success && rpcConfig.apiKey ? rpcConfig.rpcUrl : 'https://api.mainnet-beta.solana.com',
          'confirmed'
        );

        const txBuffer = Buffer.from(transaction, 'base64');
        const tx = Transaction.from(txBuffer);

        const signedTx = await signTransaction(tx);
        const signature = await connection.sendRawTransaction(signedTx.serialize());

        // Wait for confirmation and verify SUCCESS
        await connection.confirmTransaction(signature, 'confirmed');
        
        // Check if transaction actually succeeded
        const txStatus = await connection.getSignatureStatus(signature);
        if (txStatus.value?.err) {
          throw new Error(`Transaction failed on blockchain: ${JSON.stringify(txStatus.value.err)}`);
        }
        console.log(`${nftType} NFT burn transaction confirmed:`, signature);

        results.push({
          type: nftType,
          count: nftsProcessed,
          signature,
          solRecovered: parseFloat(solRecovered || '0'),
          netAmount: parseFloat(netAmount || '0'),
          feeAmount: parseFloat(feeAmount || '0')
        });
      }

      return results;
    },
    onSuccess: (results) => {
      if (!results) return;
      
      const totalBurned = results.reduce((sum, r) => sum + (r.count || 0), 0);
      const totalSolRecovered = results.reduce((sum, r) => sum + (r.solRecovered || 0), 0);
      const totalNetAmount = results.reduce((sum, r) => sum + (r.netAmount || 0), 0);

      const hasRentRecovery = totalSolRecovered > 0;

      // Generate Solscan links for each transaction
      const transactionLinks = results.map(result => 
        `${result.type.toUpperCase()}: https://solscan.io/tx/${result.signature}`
      ).join('\n');

      toast({
        title: hasRentRecovery ? "NFTs Burned Successfully!" : "Burn Requests Recorded",
        description: hasRentRecovery 
          ? `Burned ${totalBurned} NFTs and recovered ${totalNetAmount.toFixed(6)} SOL (after 15% fee)\n\nView on Solscan:\n${transactionLinks}`
          : `Recorded burn requests for ${totalBurned} NFTs (compressed NFTs cannot be burned via this interface yet)\n\nView transaction on Solscan:\n${transactionLinks}`,
        className: "bg-green-600 text-white border-green-600",
      });

      // Clear selection but don't refresh immediately - let optimistic update handle UI state
      setSelectedNfts(new Set());

      // Always refresh stats and transaction history after NFT burns
      queryClient.invalidateQueries({ queryKey: ['/api/sol-refund/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/transactions/history'] });
    },
    onError: (error: any) => {
      console.error('Error burning NFTs:', error);

      // Check if this is a user cancellation - if so, don't show error toast
      const isUserCancellation = error?.error?.code === 4001 || 
        error?.code === 4001 ||
        error?.message?.includes('User rejected') ||
        error?.message?.includes('rejected the request') ||
        error?.error?.message?.includes('User rejected') ||
        error?.error?.message?.includes('rejected the request');
      
      if (!isUserCancellation) {
        let errorMessage = "Failed to burn NFTs. Please try again.";
        if (error.message) {
          if (error.message.includes('wallet not found')) {
            errorMessage = "Please install and connect your wallet.";
          } else {
            errorMessage = error.message;
          }
        }

        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
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

      const { transaction, message, totalSolReclaimed, feeAmount, netAmount, platformFeeAmount, referralFeeAmount, referralCodeUsed, totalRentRecovered } = await response.json();

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
          const { Transaction, ComputeBudgetProgram } = await import('@solana/web3.js');
          transactionBuffer = Buffer.from(transaction, 'base64');
          deserializedTransaction = Transaction.from(transactionBuffer);

          // Add FIXED priority fee for everyone (0.00001 SOL = 10,000 lamports)
          const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: 10000, // Fixed priority fee - same for all users
          });
          deserializedTransaction.add(priorityFeeInstruction);

          console.log(`Transaction with priority fee, signing with ${walletName || 'connected wallet'}...`);
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

        // Verify transaction SUCCESS with 45-second timeout using fast polling
        console.log('Waiting for fast confirmation with high priority fee...');
        const startTime = Date.now();
        const timeout = 45000; // 45 seconds
        let confirmed = false;
        let txError = null;

        while (Date.now() - startTime < timeout) {
          const statusResponse = await connection.getSignatureStatus(signature);
          
          if (statusResponse.value?.confirmationStatus === 'confirmed' || statusResponse.value?.confirmationStatus === 'finalized') {
            if (statusResponse.value.err) {
              txError = statusResponse.value.err;
              break;
            }
            confirmed = true;
            break;
          }
          
          // Wait only 200ms before checking again for faster feedback
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        if (txError) {
          throw new Error(`Transaction failed on blockchain: ${JSON.stringify(txError)}`);
        }

        if (!confirmed) {
          // Transaction timed out - provide helpful message with signature
          throw new Error(`Transaction was not confirmed in 45 seconds. It may still succeed. Check status at: https://solscan.io/tx/${signature}`);
        }
        
        console.log('Transaction confirmed successfully!');

        // Save successful transaction to database and get points message
        let pointsMessage = '';
        try {
          const dbResponse = await fetch('/api/sol-refund/record-success', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              signature,
              walletAddress: data.walletAddress,
              selectedAccounts: data.selectedAccounts, // Account addresses that were closed
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

      // Show share modal with the claimed amount
      setShareData({ solClaimed: result.totalReceived });
      setIsShareModalOpen(true);

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
    const donation = total * 0.15; // 15% service fee
    const net = total - donation; // 85% to user

    return { total, donation, net };
  };

  const refundCalc = calculateRefund();


  return (
    <div className="min-h-screen relative overflow-hidden bg-black">
      {/* Halloween Background */}
      <div className="fixed inset-0 pointer-events-none">
        <img 
          src={halloweenBg} 
          alt="" 
          className="w-full h-full object-cover opacity-60"
          style={{ objectPosition: 'center' }}
        />
        
        {/* Floating Ghosts - More visible */}
        <div className="absolute top-40 left-20 animate-float opacity-35">
          <svg width="60" height="80" viewBox="0 0 60 80">
            <path d="M 30 10 Q 15 10 10 25 Q 10 45 15 55 L 15 70 Q 15 75 20 75 Q 20 65 25 65 Q 25 75 30 75 Q 30 65 35 65 Q 35 75 40 75 Q 45 75 45 70 L 45 55 Q 50 45 50 25 Q 45 10 30 10 Z" fill="#d0f0d0" opacity="0.6" />
            <circle cx="22" cy="28" r="4" fill="#000" />
            <circle cx="38" cy="28" r="4" fill="#000" />
          </svg>
        </div>
        <div className="absolute top-60 right-32 animate-float-delayed opacity-30">
          <svg width="50" height="70" viewBox="0 0 60 80">
            <path d="M 30 10 Q 15 10 10 25 Q 10 45 15 55 L 15 70 Q 15 75 20 75 Q 20 65 25 65 Q 25 75 30 75 Q 30 65 35 65 Q 35 75 40 75 Q 45 75 45 70 L 45 55 Q 50 45 50 25 Q 45 10 30 10 Z" fill="#d0f0d0" opacity="0.5" />
            <circle cx="22" cy="28" r="4" fill="#000" />
            <circle cx="38" cy="28" r="4" fill="#000" />
          </svg>
        </div>
        <div className="absolute top-32 right-64 animate-float opacity-25">
          <svg width="40" height="60" viewBox="0 0 60 80">
            <path d="M 30 10 Q 15 10 10 25 Q 10 45 15 55 L 15 70 Q 15 75 20 75 Q 20 65 25 65 Q 25 75 30 75 Q 30 65 35 65 Q 35 75 40 75 Q 45 75 45 70 L 45 55 Q 50 45 50 25 Q 45 10 30 10 Z" fill="#d0f0d0" opacity="0.4" />
            <circle cx="22" cy="28" r="4" fill="#000" />
            <circle cx="38" cy="28" r="4" fill="#000" />
          </svg>
        </div>
        <div className="absolute top-20 left-1/2 animate-float-delayed opacity-20">
          <svg width="55" height="75" viewBox="0 0 60 80">
            <path d="M 30 10 Q 15 10 10 25 Q 10 45 15 55 L 15 70 Q 15 75 20 75 Q 20 65 25 65 Q 25 75 30 75 Q 30 65 35 65 Q 35 75 40 75 Q 45 75 45 70 L 45 55 Q 50 45 50 25 Q 45 10 30 10 Z" fill="#d0f0d0" opacity="0.4" />
            <circle cx="22" cy="28" r="4" fill="#000" />
            <circle cx="38" cy="28" r="4" fill="#000" />
          </svg>
        </div>
      </div>

      <div className="container mx-auto px-4 pt-1 pb-2 max-w-6xl relative z-10">
        <div className="space-y-2">
          {/* Header with Navigation and Wallet Connection */}
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between mb-2 space-y-4 lg:space-y-0">
            {/* Top row: Logo and Title */}
            <div className="flex items-center justify-between">
              {/* Jack-o-lantern Logo with Spooky Title */}
              <div className="flex items-center space-x-4">
                <img 
                  src={pumpkinImage}
                  alt="Halloween Pumpkin"
                  className="h-[100px] w-[100px] halloween-pumpkin"
                />
                <div className="hidden sm:block">
                  <h1 className="text-3xl lg:text-4xl font-bold text-white halloween-title" style={{ fontFamily: 'Georgia, serif', textShadow: '2px 2px 4px #000' }}>
                    Spooky SOL Recovery
                  </h1>
                  <p className="text-orange-300 text-sm" style={{ fontFamily: 'Georgia, serif' }}>Get your SOL back... if you dare!</p>
                </div>
              </div>

              {/* Mobile Wallet Connection */}
              <div className="lg:hidden flex items-center space-x-2">
                {/* Social Media Buttons */}
                <div className="flex items-center space-x-1">
                  <a
                    href="https://x.com/getfreesol_xyz"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="button-social-x"
                    className="flex items-center justify-center w-8 h-8 bg-transparent hover:bg-white/10 backdrop-blur-sm rounded-md transition-colors border border-orange-500/30"
                    title="Follow us on X (Twitter)"
                  >
                    <SiX className="h-4 w-4 text-white" />
                  </a>
                  <a
                    href="https://discord.gg/tSBMgYcZaK"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="button-social-discord"
                    className="flex items-center justify-center w-8 h-8 bg-transparent hover:bg-white/10 backdrop-blur-sm rounded-md transition-colors border border-orange-500/30"
                    title="Join our Discord community"
                  >
                    <SiDiscord className="h-4 w-4 text-white" />
                  </a>
                </div>

                {isConnected && publicKey ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        className="bg-transparent hover:bg-white/10 backdrop-blur-sm rounded-lg px-3 py-2 text-white font-mono text-sm border border-orange-500/30 flex items-center space-x-2"
                        data-testid="button-wallet-connected"
                      >
                        <span>{publicKey.toString().slice(0, 4)}...{publicKey.toString().slice(-4)}</span>
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-slate-900 border-orange-500/30">
                      {publicKey?.toString() === 'GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6' && (
                        <Link href="/admin/x-bot">
                          <DropdownMenuItem 
                            className="text-white hover:bg-orange-600/40 cursor-pointer"
                            data-testid="button-admin-xbot"
                          >
                            🤖 X Bot Admin
                          </DropdownMenuItem>
                        </Link>
                      )}
                      <DropdownMenuItem 
                        onClick={disconnectWallet}
                        className="text-white hover:bg-orange-600/40 cursor-pointer"
                        data-testid="button-disconnect"
                      >
                        Disconnect
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Button
                    onClick={() => {
                      select(null);
                      setVisible(true);
                    }}
                    className="bg-orange-600 hover:bg-orange-700 text-white rounded-lg px-4 py-2 text-sm font-medium border border-orange-500/30"
                    title="Connect your wallet"
                    data-testid="button-connect"
                  >
                    <Wallet className="h-4 w-4 mr-1" />
                    Connect
                  </Button>
                )}
              </div>
            </div>

            {/* Desktop Navigation and Wallet Connection - hidden on mobile */}
            <div className="hidden lg:flex items-center space-x-3">
              {/* Social Media Buttons */}
              <div className="flex items-center space-x-1">
                <a
                  href="https://x.com/getfreesol_xyz"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="button-social-x-desktop"
                  className="flex items-center justify-center w-8 h-8 bg-transparent hover:bg-white/10 backdrop-blur-sm rounded-md transition-colors border border-orange-500/30"
                  title="Follow us on X (Twitter)"
                >
                  <SiX className="h-4 w-4 text-white" />
                </a>
                <a
                  href="https://discord.gg/tSBMgYcZaK"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="button-social-discord-desktop"
                  className="flex items-center justify-center w-8 h-8 bg-transparent hover:bg-white/10 backdrop-blur-sm rounded-md transition-colors border border-orange-500/30"
                  title="Join our Discord community"
                >
                  <SiDiscord className="h-4 w-4 text-white" />
                </a>
              </div>

              {isConnected && publicKey ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      className="bg-transparent hover:bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2 text-white font-mono text-sm border border-orange-500/30 flex items-center space-x-2"
                      data-testid="button-wallet-connected-desktop"
                    >
                      <span>{publicKey.toString().slice(0, 6)}...{publicKey.toString().slice(-6)}</span>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-slate-900 border-orange-500/30">
                    {publicKey?.toString() === 'GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6' && (
                      <Link href="/admin/x-bot">
                        <DropdownMenuItem 
                          className="text-white hover:bg-orange-600/40 cursor-pointer"
                          data-testid="button-admin-xbot-desktop"
                        >
                          🤖 X Bot Admin
                        </DropdownMenuItem>
                      </Link>
                    )}
                    <DropdownMenuItem 
                      onClick={disconnectWallet}
                      className="text-white hover:bg-orange-600/40 cursor-pointer"
                      data-testid="button-disconnect-desktop"
                    >
                      Disconnect
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="flex flex-col items-center space-y-3">
                  <Button
                    onClick={() => {
                      select(null);
                      setVisible(true);
                    }}
                    className="bg-orange-600 hover:bg-orange-700 text-white rounded-lg px-6 py-3 text-lg font-medium border border-orange-500/30"
                    title="Connect your wallet - supports Phantom, Magic Eden, Solflare, Backpack, Coinbase, Bitget"
                    data-testid="button-connect-desktop"
                  >
                    <Wallet className="h-5 w-5 mr-2" />
                    Connect Wallet
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Center Navigation Buttons */}
          {isConnected && (
            <div className="flex justify-center py-2 px-2">
              <div className="flex items-center space-x-2">
                <Button
                  onClick={() => setActiveTab('reclaim')}
                  className={`px-4 py-2.5 text-sm font-medium rounded-md border transition-all ${
                    activeTab === 'reclaim' 
                      ? 'bg-black/60 text-white border-gray-600' 
                      : 'bg-black/40 text-gray-300 border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <svg className="h-4 w-4 mr-2 inline-block" viewBox="0 0 397.7 311.7" style={{ fill: '#ff6600' }}>
                    <path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"/>
                    <path d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1L333.1,73.8c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"/>
                    <path d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z"/>
                  </svg>
                  <span className="hidden sm:inline">Reclaim SOL</span>
                  <span className="sm:hidden">Reclaim</span>
                </Button>
                <Button
                  onClick={() => setActiveTab('burnTokens')}
                  className={`px-4 py-2.5 text-sm font-medium rounded-md border transition-all ${
                    activeTab === 'burnTokens' 
                      ? 'bg-black/60 text-white border-gray-600' 
                      : 'bg-black/40 text-gray-300 border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <Flame className="h-4 w-4 mr-2 inline-block" style={{ color: '#ff6600' }} />
                  Burn
                </Button>
                <Button
                  onClick={() => setActiveTab('referrals')}
                  className={`px-4 py-2.5 text-sm font-medium rounded-md border transition-all ${
                    activeTab === 'referrals' 
                      ? 'bg-black/60 text-white border-gray-600' 
                      : 'bg-black/40 text-gray-300 border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <Users className="h-4 w-4 mr-2 inline-block" />
                  Referrals
                </Button>
                <Button
                  onClick={() => setActiveTab('massTransfer')}
                  className={`hidden md:inline-flex px-4 py-2.5 text-sm font-medium rounded-md border transition-all ${
                    activeTab === 'massTransfer' 
                      ? 'bg-black/60 text-white border-gray-600' 
                      : 'bg-black/40 text-gray-300 border-gray-700 hover:border-gray-600'
                  }`}
                  data-testid="button-mass-transfer"
                >
                  <ArrowLeftRight className="h-4 w-4 mr-2" />
                  Transfer
                </Button>
                <Button
                  onClick={() => setActiveTab('statistics')}
                  className={`hidden md:inline-flex px-4 py-2.5 text-sm font-medium rounded-md border transition-all ${
                    activeTab === 'statistics' 
                      ? 'bg-black/60 text-white border-gray-600' 
                      : 'bg-black/40 text-gray-300 border-gray-700 hover:border-gray-600'
                  }`}
                  data-testid="button-statistics"
                >
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Statistics
                </Button>
                <Button
                  onClick={() => setActiveTab('lend')}
                  className={`hidden px-3 sm:px-4 py-2 sm:py-2 text-sm sm:text-sm font-medium rounded transition-all ${
                    activeTab === 'lend' 
                      ? 'bg-purple-600 text-white' 
                      : 'bg-purple-800/40 text-purple-300 hover:bg-purple-600/60'
                  }`}
                  data-testid="button-lend"
                >
                  🌱 Earn
                </Button>
                {/* Statistics button - only visible to platform wallet */}
                {isPlatformWallet && (
                  <Button
                    onClick={() => setActiveTab('statistics')}
                    className={`hidden md:inline-flex px-4 py-2 text-sm font-medium rounded transition-all ${
                      activeTab === 'statistics' 
                        ? 'bg-purple-600 text-white' 
                        : 'bg-purple-800/40 text-purple-300 hover:bg-purple-600/60'
                    }`}
                    data-testid="button-statistics"
                  >
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Statistics
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Description */}
          <div className="text-center space-y-4 py-4">
            <p className="text-white max-w-2xl mx-auto text-2xl font-semibold">
{activeTab === 'referrals' ? 'Earn 50% commission from your referrals — just by helping others!' : activeTab === 'burnTokens' ? (burnSubTab === 'tokens' ? 'Burn Unwanted Tokens.' : 'Burn Unwanted NFTs.') : activeTab === 'statistics' ? 'Track rent recovery metrics and top performers' : activeTab === 'massTransfer' ? 'Select and send multiple tokens from one wallet to another' : activeTab === 'lend' ? 'Earn passive income on your Solana assets' : 'Get your SOL back!'}
            </p>
          </div>

          {/* Burn Sub-Tabs */}
          {activeTab === 'burnTokens' && (
            <div className="flex justify-center mb-6">
              <div className="bg-purple-800/20 backdrop-blur-sm border border-purple-500/30 rounded-lg p-1 flex space-x-1">
                <button
                  onClick={() => setBurnSubTab('tokens')}
                  className={`px-4 py-2 text-sm font-medium rounded transition-all ${
                    burnSubTab === 'tokens' 
                      ? 'bg-purple-600 text-white' 
                      : 'bg-transparent text-purple-300 hover:bg-purple-600/60'
                  }`}
                  data-testid="button-burn-tokens"
                >
                  🪙 Burn Tokens
                </button>
                <button
                  onClick={() => setBurnSubTab('nft')}
                  className={`px-4 py-2 text-sm font-medium rounded transition-all ${
                    burnSubTab === 'nft' 
                      ? 'bg-purple-600 text-white' 
                      : 'bg-transparent text-purple-300 hover:bg-purple-600/60'
                  }`}
                  data-testid="button-burn-nft"
                >
                  🖼️ Burn NFT
                </button>
              </div>
            </div>
          )}






          {/* Reclaim SOL Results */}
          {activeTab === 'reclaim' && (
            <div className="backdrop-blur-sm rounded-xl border border-orange-900/40 p-6" style={{ backgroundColor: 'rgba(40, 20, 10, 0.6)' }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold text-white" style={{ fontFamily: 'Georgia, serif' }}>Scan Results</h3>
                <button 
                  onClick={() => {
                    if (publicKey) {
                      scanMutation.mutate(publicKey.toString());
                    }
                  }}
                  disabled={scanMutation.isPending || !publicKey}
                  className="inline-flex items-center justify-center p-3 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 hover:border-purple-400/50 backdrop-blur-sm rounded-full text-purple-200 hover:text-white transition-all duration-200 disabled:opacity-50"
                  data-testid="button-refresh-scan"
                  title="Refresh"
                >
                  <RefreshCw className={`h-6 w-6 ${scanMutation.isPending ? 'animate-spin' : ''}`} />
                </button>
              </div>
              {!scanResult ? (
                <div className="text-center text-gray-300 py-8">
                  {scanMutation.isPending ? 'Scanning wallet...' : 'Connect wallet and scan to find empty accounts'}
                </div>
              ) : (
                <>
                  <p className="text-gray-300 text-sm mb-6">
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
                    className="w-full bg-gradient-to-r from-red-700 via-orange-600 to-red-700 hover:from-red-800 hover:via-orange-700 hover:to-red-800 text-white py-4 text-lg font-bold rounded-xl transition-all duration-200 shadow-lg border-2 border-orange-500/50"
                    style={{ fontFamily: 'Georgia, serif' }}
                    data-testid="button-claim-all"
                  >
                    {refundMutation.isPending ? (
                      <>
                        <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                        CLAIMING...
                      </>
                    ) : (
                      <>
                        🍬 CLAIM YOUR CANDY 🍬
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="bg-black/40 backdrop-blur-sm border border-gray-700 rounded-lg p-8 text-center">
                  <CheckCircle className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h4 className="text-xl font-semibold text-white mb-2" style={{ fontFamily: 'Georgia, serif' }}>Great news!</h4>
                  <p className="text-gray-300">
                    Your wallet has no empty token accounts. All your accounts are either active or already closed.
                  </p>
                </div>
              )}
                </>
              )}
            </div>
          )}

          {/* Burn Tokens Results */}
          {activeTab === 'burnTokens' && burnSubTab === 'tokens' && tokenList.length > 0 && (
            <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-semibold text-white">{tokenList.length} Tokens Found</h3>
                  {scanTokensMutation.isPending && (
                    <p className="text-xs text-purple-300 mt-1">Scanning wallet...</p>
                  )}
                </div>
                <button 
                  onClick={() => {
                    if (publicKey) {
                      scanTokensMutation.mutate(publicKey.toString());
                    }
                  }}
                  disabled={scanTokensMutation.isPending || !publicKey}
                  className="inline-flex items-center justify-center p-2 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 hover:border-purple-400/50 backdrop-blur-sm rounded-full text-purple-200 hover:text-white transition-all duration-200 disabled:opacity-50"
                  data-testid="button-refresh-tokens"
                  title="Refresh"
                >
                  <RefreshCw className={`h-5 w-5 ${scanTokensMutation.isPending ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Token List */}
              <div className="max-h-96 overflow-y-auto space-y-3 mb-6">
                {tokenList.map((token, index) => (
                  <div 
                    key={index} 
                    className={`relative flex items-center gap-3 p-4 rounded-xl cursor-pointer transition-all ${
                      selectedTokens.has(token.mint)
                        ? 'bg-gradient-to-r from-red-900/40 to-pink-900/40 border-2 border-red-500' 
                        : 'bg-purple-900/40 border-2 border-purple-700/50 hover:border-purple-600/60'
                    }`}
                    onClick={() => toggleTokenSelection(token.mint)}
                    data-testid={`card-token-${index}`}
                  >
                    {/* Checkbox - LEFT SIDE */}
                    <div className="flex-shrink-0">
                      <div 
                        className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors pointer-events-none ${
                          selectedTokens.has(token.mint)
                            ? 'bg-purple-600 border-purple-600' 
                            : 'bg-transparent border-purple-400'
                        }`}
                      >
                        {selectedTokens.has(token.mint) && <Check className="h-4 w-4 text-white" />}
                      </div>
                    </div>

                    {/* Token Icon */}
                    <div className="flex-shrink-0">
                      {token.logo ? (
                        <img 
                          src={token.logo} 
                          alt={token.symbol || 'Token'} 
                          className="w-12 h-12 rounded-full"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-purple-600/30 flex items-center justify-center">
                          <Coins className="h-6 w-6 text-purple-300" />
                        </div>
                      )}
                    </div>

                    {/* Token Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-lg font-semibold text-white truncate">
                        {token.symbol || token.name || 'Unknown Token'}
                      </div>
                      <div className="text-sm text-purple-200">
                        Balance: {token.balance.toLocaleString()} {token.symbol || ''}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-purple-300 font-mono truncate">
                          {token.mint.slice(0, 8)}...{token.mint.slice(-8)}
                        </span>
                        {token.usdPrice && token.usdPrice > 0 && (
                          <span className="text-sm text-green-400 font-medium">
                            ${token.usdValue.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* "MARKED FOR BURN" Badge - TOP RIGHT */}
                    {selectedTokens.has(token.mint) && (
                      <div className="absolute top-2 right-2">
                        <div className="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-md pointer-events-none whitespace-nowrap">
                          MARKED FOR BURN
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Bottom Actions */}
              <div className="space-y-4">
                {/* Select All / Clear Selection Buttons */}
                <div className="flex gap-3">
                  <Button
                    onClick={selectAllTokens}
                    className="flex-1 bg-purple-900/60 hover:bg-purple-800/70 text-white border border-purple-600/40 rounded-xl py-3"
                    data-testid="button-select-all-tokens"
                  >
                    Select All
                  </Button>
                  <Button
                    onClick={clearTokenSelection}
                    className="flex-1 bg-purple-900/60 hover:bg-purple-800/70 text-white border border-purple-600/40 rounded-xl py-3"
                    data-testid="button-clear-selection-tokens"
                  >
                    Clear
                  </Button>
                </div>

                {/* Total Selected */}
                <div className="text-center">
                  <div className="text-sm text-purple-300 mb-2">
                    Total Selected: {selectedTokens.size} token{selectedTokens.size !== 1 ? 's' : ''} (~{calculateTotalSOL(selectedTokens.size)} SOL net)
                  </div>
                </div>

                {/* Burn Button */}
                <Button
                  onClick={() => bulkBurnTokensMutation.mutate(Array.from(selectedTokens))}
                  disabled={selectedTokens.size === 0 || bulkBurnTokensMutation.isPending}
                  className="w-full bg-red-600 hover:bg-red-700 text-white py-4 text-lg font-bold rounded-xl transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  data-testid="button-burn-selected-tokens"
                >
                  {bulkBurnTokensMutation.isPending ? (
                    <>
                      <RefreshCw className="h-5 w-5 animate-spin" />
                      Burning...
                    </>
                  ) : (
                    <>
                      <Flame className="h-5 w-5" />
                      BURN
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}



          {/* Empty State Messages - Tokens */}
          {activeTab === 'burnTokens' && burnSubTab === 'tokens' && tokenList.length === 0 && (
            <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Token & NFT Scanner</h3>
                <button 
                  onClick={() => {
                    if (publicKey) {
                      scanTokensMutation.mutate(publicKey.toString());
                    }
                  }}
                  disabled={scanTokensMutation.isPending || !publicKey}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-800/20 hover:bg-purple-700/30 border border-purple-500/30 hover:border-purple-400/50 backdrop-blur-sm rounded-lg text-purple-200 hover:text-white transition-all duration-200 disabled:opacity-50 text-sm"
                  data-testid="button-refresh-tokens-empty"
                >
                  Click to Refresh
                  <RefreshCw className={`h-3.5 w-3.5 ${scanTokensMutation.isPending ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <div className="text-center space-y-4">
                <Flame className="h-12 w-12 text-purple-400 mx-auto" />
                <h3 className="text-lg font-semibold text-white">No Tokens Found</h3>
                <p className="text-purple-200">Scan your wallet to find tokens available for burning.</p>
              </div>
            </div>
          )}

          {/* NFT Burning Interface */}
          {activeTab === 'burnTokens' && burnSubTab === 'nft' && (
            <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-semibold text-white">
                    {nftData && nftData.nfts && nftData.nfts.length > 0 
                      ? `${nftData.nfts.length} NFTs Found` 
                      : 'NFT Scanner'}
                  </h3>
                  {scanNftsMutation.isPending && (
                    <p className="text-xs text-purple-300 mt-1">Scanning wallet...</p>
                  )}
                </div>
                <button 
                  onClick={() => {
                    if (publicKey) {
                      scanNftsMutation.mutate(publicKey.toString());
                    }
                  }}
                  disabled={scanNftsMutation.isPending || !publicKey}
                  className="inline-flex items-center justify-center p-2 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 hover:border-purple-400/50 backdrop-blur-sm rounded-full text-purple-200 hover:text-white transition-all duration-200 disabled:opacity-50"
                  data-testid="button-refresh-nft"
                  title="Refresh"
                >
                  <RefreshCw className={`h-5 w-5 ${scanNftsMutation.isPending ? 'animate-spin' : ''}`} />
                </button>
              </div>


              {/* Individual NFT Grid */}
              {scanNftsMutation.isPending ? (
                <div className="text-center py-8">
                  <RefreshCw className="h-8 w-8 text-purple-400 mx-auto animate-spin mb-4" />
                  <p className="text-purple-200">Scanning for NFTs...</p>
                </div>
              ) : nftData && nftData.nfts && nftData.nfts.length > 0 ? (
                <div className="space-y-4">
                  {/* NFT Grid */}
                  <div className="max-h-96 overflow-y-auto scrollbar-thin scrollbar-track-purple-900/20 scrollbar-thumb-purple-500/50 mb-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {nftData.nfts.map((nft: any) => {
                      // Use a stable identifier that works for all NFT types
                      const nftId = nft.mint || nft.id || nft.assetId;
                      const isSelected = selectedNfts.has(nftId);
                      const isFrozen = nft.isFrozen === true;

                      return (
                        <div
                          key={nftId}
                          className={`relative bg-gradient-to-br from-purple-700/20 to-purple-800/30 backdrop-blur-sm border rounded-lg p-3 transition-all ${
                            isFrozen 
                              ? 'cursor-not-allowed opacity-75' 
                              : 'cursor-pointer'
                          } ${
                            isSelected 
                              ? 'border-green-400/50 bg-green-900/20' 
                              : 'border-purple-500/30 hover:border-purple-400/50'
                          }`}
                          onClick={() => {
                            if (isFrozen) return; // Prevent selection of frozen NFTs
                            setSelectedNfts(prev => {
                              const newSet = new Set(prev);
                              if (isSelected) {
                                newSet.delete(nftId);
                              } else {
                                newSet.add(nftId);
                              }
                              return newSet;
                            });
                          }}
                          data-testid={`card-nft-${nftId}`}
                        >
                          {/* Selection Checkbox */}
                          <div className="absolute top-2 left-2 z-10">
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                              isFrozen 
                                ? 'bg-gray-600/50 border-gray-500 cursor-not-allowed' 
                                : isSelected 
                                  ? 'bg-green-500 border-green-500' 
                                  : 'bg-purple-900/50 border-purple-400'
                            }`}>
                              {isSelected && !isFrozen && <Check className="h-3 w-3 text-white" />}
                            </div>
                          </div>

                          
                          {/* NFT Image */}
                          <div className="aspect-square mb-3 rounded-lg overflow-hidden bg-purple-900/30 relative">
                            {nft.image ? (
                              <img
                                src={nft.image}
                                alt={nft.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  target.nextElementSibling!.classList.remove('hidden');
                                }}
                              />
                            ) : null}
                            <div className={`w-full h-full flex items-center justify-center ${nft.image ? 'hidden' : ''}`}>
                              <Image className="h-8 w-8 text-purple-400" />
                            </div>
                            
                            {/* FROZEN overlay for frozen NFTs */}
                            {isFrozen && (
                              <div className="absolute inset-0 flex items-center justify-center bg-blue-400/30 backdrop-blur-sm z-20">
                                <span className="text-4xl font-bold text-white drop-shadow-2xl tracking-wider">FROZEN</span>
                              </div>
                            )}
                            
                            {/* Big Flame Icon Overlay for Selected NFTs */}
                            {isSelected && !isFrozen && (
                              <div className="absolute inset-0 flex items-center justify-center z-20">
                                <span className="text-9xl drop-shadow-2xl animate-pulse">🔥</span>
                              </div>
                            )}
                          </div>

                          {/* NFT Details */}
                          <div className="space-y-1">
                            <h4 className="text-white text-sm font-medium truncate" title={nft.name}>
                              {nft.name || 'Unknown NFT'}
                            </h4>

                            {/* Type Badge */}
                            <div className="flex items-center justify-between">
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                nft.type === 'standard' ? 'bg-blue-500/20 text-blue-300' :
                                nft.type === 'pnft' ? 'bg-purple-500/20 text-purple-300' :
                                nft.type === 'ocp' ? 'bg-green-500/20 text-green-300' :
                                nft.type === 'core' ? 'bg-orange-500/20 text-orange-300' :
                                'bg-gray-500/20 text-gray-300'
                              }`}>
                                {nft.type.toUpperCase()}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </div>

                  {/* Bottom Actions */}
                  <div className="space-y-4">
                    {/* Select All / Clear Selection Buttons */}
                    <div className="flex gap-3">
                      <Button
                        onClick={() => {
                          const allNfts = nftData.nfts;
                          // Only select non-frozen NFTs
                          const selectableNfts = allNfts
                            .filter((nft: any) => !nft.isFrozen)
                            .map((nft: any) => nft.mint || nft.id || nft.assetId)
                            .filter(Boolean);
                          setSelectedNfts(new Set(selectableNfts));
                        }}
                        className="flex-1 bg-purple-900/60 hover:bg-purple-800/70 text-white border border-purple-600/40 rounded-xl py-3"
                        data-testid="button-select-all-nfts"
                      >
                        Select All
                      </Button>
                      <Button
                        onClick={() => setSelectedNfts(new Set())}
                        className="flex-1 bg-purple-900/60 hover:bg-purple-800/70 text-white border border-purple-600/40 rounded-xl py-3"
                        data-testid="button-clear-selection-nfts"
                      >
                        Clear
                      </Button>
                    </div>

                    {/* Total Selected */}
                    <div className="text-center">
                      <div className="text-sm text-purple-300 mb-2">Total Selected: {selectedNfts.size} NFT{selectedNfts.size !== 1 ? 's' : ''}</div>
                    </div>

                    {/* Burn Button */}
                    <Button
                      onClick={() => {
                        if (!publicKey) {
                          toast({
                            title: "Error",
                            description: "Please connect your wallet first",
                            variant: "destructive",
                          });
                          return;
                        }

                        const selectedIds = Array.from(selectedNfts);
                        const selectedNftData = nftData.nfts.filter((nft: any) => 
                          selectedIds.includes(nft.mint || nft.id || nft.assetId)
                        );
                        
                        // Group by type and burn
                        const nftsByType: { [key: string]: any[] } = {};
                        selectedNftData.forEach((nft: any) => {
                          if (!nftsByType[nft.type]) {
                            nftsByType[nft.type] = [];
                          }
                          nftsByType[nft.type].push(nft);
                        });

                        // Call burn mutation with selected NFT IDs
                        burnNftsMutation.mutate(selectedIds);
                      }}
                      disabled={selectedNfts.size === 0 || burnNftsMutation.isPending || !publicKey}
                      className="w-full bg-red-600 hover:bg-red-700 text-white py-4 text-lg font-bold rounded-xl transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      data-testid="button-burn-selected-nfts"
                    >
                      {burnNftsMutation.isPending ? (
                        <>
                          <RefreshCw className="h-5 w-5 animate-spin" />
                          Burning...
                        </>
                      ) : (
                        <>
                          <Flame className="h-5 w-5" />
                          BURN
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : !scanNftsMutation.isPending ? (
                <div className="text-center py-8">
                  <Image className="h-12 w-12 text-purple-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-white mb-2">No NFTs Found</h3>
                  <p className="text-purple-200">Scan your wallet to find NFTs in your collection.</p>
                </div>
              ) : null}

              {/* Burn Instructions */}
              <div className="bg-purple-900/20 border border-purple-500/20 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Info className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-purple-200">
                    <p className="font-medium mb-2">About NFT Burning:</p>
                    <ul className="space-y-1 text-purple-300">
                      <li>• Burn unwanted NFTs and recover SOL rent deposits</li>
                      <li>• Burning permanently destroys the NFT and its metadata</li>
                      <li>• Burning NFTs usually returns 0.01 SOL, while most tokens and some scam NFTs give only 0.002 SOL. Magic Eden OCP NFTs return 0.004 SOL, and compressed NFTs return nothing.</li>
                    </ul>
                  </div>
                </div>
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
                        Earn 50% of platform fee from every referral transaction
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

          {/* Statistics Tab Content */}
          {activeTab === 'statistics' && (() => {
            const formatSol = (amount: string | number) => {
              const num = typeof amount === 'string' ? parseFloat(amount) : amount;
              return num.toFixed(4);
            };

            const truncateAddress = (address: string) => {
              return `${address.slice(0, 4)}...${address.slice(-4)}`;
            };

            return (
              <div className="space-y-8">
                {/* Time-Filtered Statistics Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* SOL Recovered (24H) */}
                  <Card className="bg-purple-800/50 border-purple-600 backdrop-blur" data-testid="card-sol-24h">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-white">
                        <DollarSign className="w-5 h-5 text-green-400" />
                        SOL Recovered
                      </CardTitle>
                      <CardDescription className="text-purple-200">
                        Last 24 hours
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div data-testid="stat-sol-24h" className="text-4xl font-bold text-green-400">
                        {formatSol(stats24h?.stats.totalSolRecovered || '0')}
                      </div>
                      <p className="text-sm text-purple-300 mt-3">24H</p>
                    </CardContent>
                  </Card>

                  {/* SOL Recovered (Weekly) */}
                  <Card className="bg-purple-800/50 border-purple-600 backdrop-blur" data-testid="card-sol-weekly">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-white">
                        <DollarSign className="w-5 h-5 text-green-400" />
                        SOL Recovered
                      </CardTitle>
                      <CardDescription className="text-purple-200">
                        Last 7 days
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div data-testid="stat-sol-weekly" className="text-4xl font-bold text-green-400">
                        {formatSol(statsWeekly?.stats.totalSolRecovered || '0')}
                      </div>
                      <p className="text-sm text-purple-300 mt-3">Weekly</p>
                    </CardContent>
                  </Card>

                  {/* SOL Recovered (Monthly) */}
                  <Card className="bg-purple-800/50 border-purple-600 backdrop-blur" data-testid="card-sol-monthly">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-white">
                        <DollarSign className="w-5 h-5 text-green-400" />
                        SOL Recovered
                      </CardTitle>
                      <CardDescription className="text-purple-200">
                        Last 30 days
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div data-testid="stat-sol-monthly" className="text-4xl font-bold text-green-400">
                        {formatSol(statsMonthly?.stats.totalSolRecovered || '0')}
                      </div>
                      <p className="text-sm text-purple-300 mt-3">Monthly</p>
                    </CardContent>
                  </Card>

                  {/* Total Wallets (All Time) */}
                  <Card className="bg-purple-800/50 border-purple-600 backdrop-blur" data-testid="card-total-wallets">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-white">
                        <Users className="w-5 h-5 text-purple-300" />
                        Total Wallets
                      </CardTitle>
                      <CardDescription className="text-purple-200">
                        Unique wallets
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div data-testid="stat-total-users" className="text-4xl font-bold text-white">
                        {statsAllTime?.stats.totalUsers.toLocaleString('en-US') || '0'}
                      </div>
                      <p className="text-sm text-purple-300 mt-3">All Time</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Leaderboard */}
                <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-white">
                      <TrendingUp className="w-6 h-6 text-yellow-400" />
                      Top Addresses Leaderboard
                    </CardTitle>
                    <CardDescription className="text-purple-200">
                      Addresses that recovered the most rent (all time)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {leaderboardData && leaderboardData.leaderboard.length > 0 ? (
                      <div className="space-y-3">
                        {leaderboardData.leaderboard.map((entry, index) => (
                          <div 
                            key={entry.walletAddress} 
                            className="flex items-center justify-between p-4 bg-purple-900/20 border border-purple-500/30 rounded-lg hover:bg-purple-700/30 transition-colors"
                            data-testid={`leaderboard-row-${index}`}
                          >
                            <div className="flex items-center gap-4">
                              {index === 0 && (
                                <Badge className="bg-yellow-500 text-black hover:bg-yellow-600">
                                  🥇 1st
                                </Badge>
                              )}
                              {index === 1 && (
                                <Badge className="bg-gray-400 text-black hover:bg-gray-500">
                                  🥈 2nd
                                </Badge>
                              )}
                              {index === 2 && (
                                <Badge className="bg-orange-600 text-white hover:bg-orange-700">
                                  🥉 3rd
                                </Badge>
                              )}
                              {index > 2 && (
                                <span className="text-purple-200 font-medium ml-2">#{index + 1}</span>
                              )}
                              <a
                                href={`https://solscan.io/account/${entry.walletAddress}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-purple-300 hover:text-purple-100 underline font-mono text-sm"
                                data-testid={`address-${index}`}
                              >
                                {truncateAddress(entry.walletAddress)}
                              </a>
                            </div>
                            <div className="text-right font-bold text-green-400" data-testid={`amount-${index}`}>
                              {formatSol(entry.totalSolRecovered)} SOL
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-purple-300">
                        No data available for this time period
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })()}

          {/* Mass Transfer Tab Content */}
          {activeTab === 'massTransfer' && (
            <div className="space-y-6">
              {/* Transfer Stats - Only visible to platform wallet */}
              {isPlatformWallet && massTransferStats && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6 text-center">
                    <div className="text-3xl font-bold text-white mb-2">
                      {massTransferStats.stats.totalUniqueUsers}
                    </div>
                    <div className="text-sm text-purple-200 uppercase tracking-wider">
                      USERS USING TRANSFER
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6 text-center">
                    <div className="text-3xl font-bold text-white mb-2">
                      {massTransferStats.stats.totalTransfers}
                    </div>
                    <div className="text-sm text-purple-200 uppercase tracking-wider">
                      TOTAL TRANSFERS
                    </div>
                  </div>
                </div>
              )}
              
              <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <ArrowUpDown className="w-6 h-6 text-green-400" />
                    Mass Transfer
                  </CardTitle>
                  <CardDescription className="text-purple-200">
                    Select multiple tokens from your wallet and send them all to one destination address
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Destination Wallet Input */}
                  <div className="space-y-2">
                    <Label htmlFor="destination-wallet" className="text-white">
                      Destination Wallet Address
                    </Label>
                    <Input
                      id="destination-wallet"
                      value={destinationWallet}
                      onChange={(e) => setDestinationWallet(e.target.value)}
                      placeholder="Enter Solana wallet address..."
                      className="bg-purple-900/30 border-purple-500/30 text-white placeholder-purple-400"
                      data-testid="input-destination-wallet"
                    />
                  </div>

                  {/* Token List */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <Label className="text-white text-lg">Your Tokens</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (!wallet.publicKey) {
                            toast({
                              title: "Wallet not connected",
                              description: "Please connect your wallet first",
                              variant: "destructive",
                            });
                            return;
                          }
                          loadMassTransferTokens();
                        }}
                        disabled={loadingTransferTokens}
                        className="bg-purple-800/20 border-purple-500/30 text-purple-300 hover:bg-purple-700/30"
                        data-testid="button-refresh-tokens"
                      >
                        <RefreshCw className={`w-4 h-4 mr-2 ${loadingTransferTokens ? 'animate-spin' : ''}`} />
                        {loadingTransferTokens ? 'Loading...' : 'Refresh'}
                      </Button>
                    </div>

                    {/* Token Selection List */}
                    <div className="border border-purple-500/30 rounded-lg p-4 bg-purple-900/20 max-h-96 overflow-y-auto">
                      {massTransferTokens.length > 0 ? (
                        <div className="space-y-3">
                          {massTransferTokens.map((token, index) => {
                            const isSelected = selectedTransferTokens.has(token.mint);
                            const currentAmount = tokenAmounts.has(token.mint) ? tokenAmounts.get(token.mint)! : token.balance.toString();
                            return (
                              <div
                                key={token.mint}
                                className={`p-3 rounded-lg transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-purple-600/40 border-2 border-purple-500'
                                    : 'bg-purple-900/20 border border-purple-700/50 hover:border-purple-600/60'
                                }`}
                                onClick={() => {
                                  const newSelection = new Set(selectedTransferTokens);
                                  if (isSelected) {
                                    newSelection.delete(token.mint);
                                  } else {
                                    newSelection.add(token.mint);
                                    // Initialize with max amount
                                    setTokenAmounts(prev => new Map(prev).set(token.mint, token.balance.toString()));
                                  }
                                  setSelectedTransferTokens(newSelection);
                                }}
                                data-testid={`token-transfer-${index}`}
                              >
                                <div className="flex items-center gap-3 mb-2">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                    }}
                                    className="w-4 h-4 cursor-pointer pointer-events-none"
                                  />
                                  {token.logo && (
                                    <img src={token.logo} alt={token.symbol} className="w-10 h-10 rounded-full flex-shrink-0" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <div className="text-white font-semibold">{token.symbol || 'Unknown'}</div>
                                    <div className="text-purple-300 text-xs">
                                      Balance: {token.balance.toLocaleString(undefined, {maximumFractionDigits: 4})} {token.symbol}
                                    </div>
                                    <div className="text-purple-400 text-xs font-mono truncate">
                                      {token.mint.slice(0, 8)}...{token.mint.slice(-6)}
                                    </div>
                                  </div>
                                </div>
                                
                                {isSelected && (
                                  <div className="ml-7 space-y-2">
                                    <div className="flex gap-2">
                                      <Input
                                        type="number"
                                        value={currentAmount}
                                        onChange={(e) => {
                                          const value = e.target.value;
                                          if (value === '') {
                                            setTokenAmounts(prev => new Map(prev).set(token.mint, ''));
                                          } else {
                                            const numValue = parseFloat(value);
                                            const clamped = Math.min(Math.max(0, numValue), token.balance);
                                            setTokenAmounts(prev => new Map(prev).set(token.mint, clamped.toString()));
                                          }
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        step={1 / Math.pow(10, token.decimals)}
                                        max={token.balance}
                                        placeholder="Enter amount"
                                        className="flex-1 bg-purple-900/30 border-purple-500/30 text-white"
                                        data-testid={`input-amount-${index}`}
                                      />
                                    </div>
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setTokenAmounts(prev => new Map(prev).set(token.mint, (token.balance * 0.25).toString()));
                                        }}
                                        className="flex-1 bg-purple-800/20 border-purple-500/30 text-purple-300 hover:bg-purple-700/30"
                                      >
                                        25%
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setTokenAmounts(prev => new Map(prev).set(token.mint, (token.balance * 0.5).toString()));
                                        }}
                                        className="flex-1 bg-purple-800/20 border-purple-500/30 text-purple-300 hover:bg-purple-700/30"
                                      >
                                        50%
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setTokenAmounts(prev => new Map(prev).set(token.mint, (token.balance * 0.75).toString()));
                                        }}
                                        className="flex-1 bg-purple-800/20 border-purple-500/30 text-purple-300 hover:bg-purple-700/30"
                                      >
                                        75%
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setTokenAmounts(prev => new Map(prev).set(token.mint, token.balance.toString()));
                                        }}
                                        className="flex-1 bg-purple-800/20 border-purple-500/30 text-purple-300 hover:bg-purple-700/30"
                                      >
                                        Max
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-purple-300 text-center py-8">
                          {loadingTransferTokens ? 'Loading tokens...' : 'Connect your wallet and click Refresh to load your tokens'}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Transfer Summary */}
                  {selectedTransferTokens.size > 0 && (
                    <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-4 space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-purple-300">Selected Tokens:</span>
                        <span className="text-white font-medium">{selectedTransferTokens.size}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-purple-300">Platform Fee:</span>
                        <span className="text-white font-medium">{(selectedTransferTokens.size * 0.0002).toFixed(4)} SOL</span>
                      </div>
                      <div className="border-t border-purple-500/20 pt-2 mt-2">
                        <p className="text-xs text-purple-400 text-center">
                          0.0002 SOL per token + Solana network fees
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Transfer Button */}
                  <div className="flex justify-center pt-4">
                    <Button
                      size="lg"
                      disabled={selectedTransferTokens.size === 0 || !destinationWallet || processing}
                      onClick={async () => {
                        if (!wallet.publicKey || !wallet.signTransaction) {
                          toast({
                            title: "Wallet not connected",
                            description: "Please connect your wallet first",
                            variant: "destructive",
                          });
                          return;
                        }

                        // Validate destination address
                        try {
                          new PublicKey(destinationWallet);
                        } catch (error) {
                          toast({
                            title: "Invalid destination address",
                            description: "Please enter a valid Solana wallet address",
                            variant: "destructive",
                          });
                          return;
                        }

                        setProcessing(true);
                        try {
                          // Use the wallet's RPC connection
                          const transaction = new Transaction();
                          const destinationPubkey = new PublicKey(destinationWallet);
                          
                          // Add platform fee (0.0002 SOL per token)
                          const platformFeeWallet = new PublicKey('GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6');
                          const feePerToken = 0.0002 * 1_000_000_000; // Convert to lamports
                          const totalPlatformFee = selectedTransferTokens.size * feePerToken;
                          
                          const { SystemProgram } = await import('@solana/web3.js');
                          const feeInstruction = SystemProgram.transfer({
                            fromPubkey: wallet.publicKey!,
                            toPubkey: platformFeeWallet,
                            lamports: totalPlatformFee,
                          });
                          transaction.add(feeInstruction);
                          
                          // Create transfer instructions for each selected token
                          for (const mintAddress of selectedTransferTokens) {
                            const token = massTransferTokens.find(t => t.mint === mintAddress);
                            if (!token) continue;
                            
                            // Get the custom amount or use full balance
                            const amountStr = tokenAmounts.has(mintAddress) ? tokenAmounts.get(mintAddress)! : token.balance.toString();
                            const transferAmount = amountStr === '' ? 0 : parseFloat(amountStr);
                            if (transferAmount <= 0) continue;
                            
                            // Handle native SOL transfer
                            if (token.isNativeSOL) {
                              const lamports = Math.floor(transferAmount * 1_000_000_000);
                              const solTransferIx = SystemProgram.transfer({
                                fromPubkey: wallet.publicKey!,
                                toPubkey: destinationPubkey,
                                lamports: lamports,
                              });
                              transaction.add(solTransferIx);
                            } else {
                              // Handle SPL token transfer
                              const mintPubkey = new PublicKey(mintAddress);
                              const programId = token.accounts[0].programId === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' 
                                ? TOKEN_2022_PROGRAM_ID 
                                : TOKEN_PROGRAM_ID;
                              
                              // Get source token account (prefer ATA)
                              const sourceAccount = token.accounts.find((acc: any) => acc.isAssociatedTokenAccount) || token.accounts[0];
                              const sourceAccountPubkey = new PublicKey(sourceAccount.address);
                              
                              // Convert UI amount to raw amount (multiply by 10^decimals)
                              const rawAmount = BigInt(Math.floor(transferAmount * Math.pow(10, token.decimals)));
                              
                              // Get or create destination ATA
                              const destTokenAccount = await getAssociatedTokenAddress(
                                mintPubkey,
                                destinationPubkey,
                                false,
                                programId
                              );
                              
                              // Check if destination account exists
                              const destAccountInfo = await rpcConnection.getAccountInfo(destTokenAccount);
                              
                              // Create account if it doesn't exist
                              if (!destAccountInfo) {
                                const createIx = createAssociatedTokenAccountInstruction(
                                  wallet.publicKey!,
                                  destTokenAccount,
                                  destinationPubkey,
                                  mintPubkey,
                                  programId
                                );
                                transaction.add(createIx);
                              }
                              
                              // Add transfer instruction with custom amount
                              const transferIx = createTransferInstruction(
                                sourceAccountPubkey,
                                destTokenAccount,
                                wallet.publicKey!,
                                rawAmount,
                                [],
                                programId
                              );
                              transaction.add(transferIx);
                            }
                          }
                          
                          // Get recent blockhash
                          const { blockhash } = await rpcConnection.getLatestBlockhash();
                          transaction.recentBlockhash = blockhash;
                          transaction.feePayer = wallet.publicKey;
                          
                          // Sign and send
                          const signed = await wallet.signTransaction(transaction);
                          const signature = await rpcConnection.sendRawTransaction(signed.serialize());
                          
                          // Confirm
                          await rpcConnection.confirmTransaction(signature, 'confirmed');
                          
                          // Record the transfer for analytics
                          try {
                            const tokenDetails = Array.from(selectedTransferTokens).map(mintAddress => {
                              const token = massTransferTokens.find(t => t.mint === mintAddress);
                              const amountStr = tokenAmounts.has(mintAddress) ? tokenAmounts.get(mintAddress)! : token?.balance.toString() || '0';
                              return {
                                mint: mintAddress,
                                symbol: token?.symbol || 'Unknown',
                                amount: amountStr
                              };
                            });
                            
                            await fetch('/api/mass-transfer/record', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                signature,
                                walletAddress: wallet.publicKey!.toBase58(),
                                destinationWallet,
                                tokensCount: selectedTransferTokens.size,
                                tokenDetails: JSON.stringify(tokenDetails),
                                totalPlatformFees: (selectedTransferTokens.size * 0.0002).toString()
                              })
                            });
                          } catch (recordError) {
                            console.error('Failed to record transfer analytics:', recordError);
                          }
                          
                          toast({
                            title: "Transfer Successful!",
                            description: `Transferred ${selectedTransferTokens.size} tokens to ${destinationWallet.slice(0, 8)}...`,
                          });
                          
                          // Clear selection and reload tokens
                          setSelectedTransferTokens(new Set());
                          setDestinationWallet('');
                          setMassTransferTokens([]);
                          
                        } catch (error: any) {
                          console.error('Transfer error:', error);
                          toast({
                            title: "Transfer Failed",
                            description: error.message || "Failed to transfer tokens",
                            variant: "destructive",
                          });
                        } finally {
                          setProcessing(false);
                        }
                      }}
                      className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold px-8 disabled:opacity-50 disabled:cursor-not-allowed"
                      data-testid="button-execute-transfer"
                    >
                      <ArrowUpDown className="w-5 h-5 mr-2" />
                      {processing ? 'Transferring...' : `Transfer ${selectedTransferTokens.size} Token${selectedTransferTokens.size !== 1 ? 's' : ''}`}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Lend Tab Content */}
          {activeTab === 'lend' && (
              <div className="space-y-6">
                {/* Jupiter Lend Statistics - Only visible to platform wallet */}
                {publicKey?.toString() === 'GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6' && (
                  <div className="px-2 md:px-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                      {/* Total Deposits Card */}
                      <div className="bg-purple-800/50 border-purple-600 backdrop-blur p-4 md:p-6 rounded-xl border text-center">
                        <div className="text-2xl md:text-[32px] font-bold text-white mb-1 md:mb-2">
                          {lendStats ? `$${parseFloat(lendStats.totalDepositsUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00'}
                        </div>
                        <div className="text-xs md:text-sm font-medium text-purple-200 uppercase tracking-wider">
                          Total Deposits
                        </div>
                      </div>
                      
                      {/* Total Earned Card */}
                      <div className="bg-purple-800/50 border-purple-600 backdrop-blur p-4 md:p-6 rounded-xl border text-center">
                        <div className="text-2xl md:text-[32px] font-bold text-white mb-1 md:mb-2">
                          {lendStats ? `$${parseFloat(lendStats.totalEarningsUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00'}
                        </div>
                        <div className="text-xs md:text-sm font-medium text-purple-200 uppercase tracking-wider">
                          Total Earned
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Available Lending Pools */}
                <LendPositions
                  publicKey={publicKey}
                  userPositions={userPositions}
                  onVaultClick={async (reserve: any) => {
                    if (!publicKey) {
                      toast({
                        title: "Wallet Not Connected",
                        description: "Please connect your wallet to deposit.",
                        variant: "destructive",
                      });
                      return;
                    }
                    setSelectedReserve(reserve);
                    setDepositAmount('');
                    setLendMode('deposit');
                    setDepositDialogOpen(true);
                    // Fetch wallet balance for this token
                    await fetchTokenBalance(reserve.mint);
                  }}
                />

                {/* Deposit Dialog - Responsive: Drawer for Mobile, Dialog for Desktop */}
                {isMobile ? (
                  <Drawer open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
                    <DrawerContent className="bg-gradient-to-br from-purple-700 via-purple-800 to-purple-900 backdrop-blur-xl border-t-2 border-purple-500/40 max-h-[70vh]">
                      <DrawerHeader className="pb-3 bg-transparent pt-2">
                        <DrawerTitle className="sr-only">{selectedReserve?.symbol}</DrawerTitle>
                      </DrawerHeader>

                      <div className="px-4 pb-3 space-y-3 bg-transparent">
                        {/* Mode Toggle Buttons */}
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant={lendMode === 'deposit' ? 'default' : 'outline'}
                            onClick={() => { setLendMode('deposit'); setDepositAmount(''); }}
                            className={lendMode === 'deposit' ? 'bg-purple-600 text-white' : 'bg-purple-900/30 text-purple-300 border-purple-600'}
                            data-testid="button-mode-deposit"
                          >
                            Deposit
                          </Button>
                          <Button
                            variant={lendMode === 'withdraw' ? 'default' : 'outline'}
                            onClick={() => { setLendMode('withdraw'); setDepositAmount(''); }}
                            className={lendMode === 'withdraw' ? 'bg-purple-600 text-white' : 'bg-purple-900/30 text-purple-300 border-purple-600'}
                            data-testid="button-mode-withdraw"
                          >
                            Withdraw
                          </Button>
                        </div>

                        {/* APY and Balance Row */}
                        <div className="flex items-center justify-between">
                          <div className="bg-green-500/20 border border-green-400/50 rounded-full px-3 py-1">
                            <span className="text-green-300 text-xs font-bold">
                              APY: ≈ {selectedReserve?.depositAPY.toFixed(2)}%
                            </span>
                          </div>
                          <span className="text-xs text-white/80 font-medium">
                            💰 {lendMode === 'deposit' ? walletTokenBalance.toFixed(2) : (() => {
                              const userPosition = userPositions?.deposits?.find((dep: any) => dep.asset === selectedReserve?.mint);
                              if (!userPosition) return '0.00';
                              const deposited = parseFloat(userPosition.amount) / Math.pow(10, userPosition.decimals);
                              return deposited.toFixed(userPosition.decimals);
                            })()} {selectedReserve?.symbol}
                          </span>
                        </div>

                        {/* Amount Input */}
                        <div className="bg-purple-900/50 border-2 border-purple-700/50 rounded-xl p-4 shadow-lg backdrop-blur-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              {selectedReserve?.logoUrl && (
                                <img src={selectedReserve.logoUrl} alt={selectedReserve.symbol} className="w-10 h-10 flex-shrink-0 rounded-full border-2 border-purple-400/40 shadow-lg" />
                              )}
                              <span className="text-white font-bold text-lg">{selectedReserve?.symbol}</span>
                            </div>
                            <Input
                              type="text"
                              value={depositAmount}
                              onChange={(e) => setDepositAmount(e.target.value)}
                              placeholder="0.00"
                              className="bg-transparent border-none text-right text-2xl font-bold text-white focus-visible:ring-0 focus-visible:ring-offset-0 w-auto min-w-[100px] placeholder:text-purple-500/50"
                              data-testid="input-deposit-amount"
                            />
                          </div>
                        </div>

                        {/* HALF and MAX Buttons */}
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-sm bg-purple-600/60 text-white hover:bg-purple-500/70 py-2.5 h-auto rounded-lg font-bold shadow-md border border-purple-400/30"
                            onClick={() => {
                              if (lendMode === 'deposit') {
                                const balance = walletTokenBalance;
                                const isSOL = selectedReserve?.symbol === 'SOL' || selectedReserve?.symbol === 'WSOL';
                                const maxAmount = isSOL ? Math.max(0, balance - 0.01) : balance;
                                const decimals = selectedReserve?.decimals || 9;
                                setDepositAmount((maxAmount / 2).toFixed(decimals));
                                setDepositRawAmount(null); // Clear raw amount for deposits
                              } else {
                                // For withdrawals, use SHARES for calculations
                                const userPosition = userPositions?.deposits?.find((dep: any) => dep.asset === selectedReserve?.mint);
                                if (!userPosition) return;
                                const rawShares = userPosition.shares;
                                const rawAmount = userPosition.amount; // For display
                                const halfShares = Math.floor(parseFloat(rawShares) / 2).toString();
                                const decimals = userPosition.decimals;
                                const displayAmount = parseFloat(rawAmount) / Math.pow(10, decimals);
                                setDepositAmount((displayAmount / 2).toFixed(decimals));
                                setDepositRawAmount(halfShares);
                              }
                            }}
                            data-testid="button-half-amount"
                          >
                            HALF
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-sm bg-purple-600/60 text-white hover:bg-purple-500/70 py-2.5 h-auto rounded-lg font-bold shadow-md border border-purple-400/30"
                            onClick={() => {
                              if (lendMode === 'deposit') {
                                const balance = walletTokenBalance;
                                const isSOL = selectedReserve?.symbol === 'SOL' || selectedReserve?.symbol === 'WSOL';
                                const maxAmount = isSOL ? Math.max(0, balance - 0.01) : balance;
                                const decimals = selectedReserve?.decimals || 9;
                                setDepositAmount(maxAmount.toFixed(decimals));
                                setDepositRawAmount(null); // Clear raw amount for deposits
                              } else {
                                // For withdrawals, use SHARES not amount (Jupiter SDK expects shares)
                                const userPosition = userPositions?.deposits?.find((dep: any) => dep.asset === selectedReserve?.mint);
                                if (!userPosition) return;
                                const rawShares = userPosition.shares; // Use shares, not amount!
                                const rawAmount = userPosition.amount; // For display only
                                const decimals = userPosition.decimals;
                                const displayAmount = parseFloat(rawAmount) / Math.pow(10, decimals);
                                setDepositAmount(displayAmount.toFixed(decimals));
                                setDepositRawAmount(rawShares); // Store shares for withdrawal
                              }
                            }}
                            data-testid="button-max-amount"
                          >
                            MAX
                          </Button>
                        </div>
                      </div>

                      <DrawerFooter className="pt-3 pb-6 bg-transparent px-4">
                        <Button
                          onClick={async () => {
                            console.log('🚀 DEPOSIT BUTTON CLICKED - Starting deposit flow');
                            if (!publicKey || !wallet || !selectedReserve || !depositAmount) {
                              console.error('❌ Missing required fields:', { publicKey: !!publicKey, wallet: !!wallet, selectedReserve: !!selectedReserve, depositAmount });
                              return;
                            }
                            
                            setDepositingLend(true);
                            try {
                              const amountNum = parseFloat(depositAmount);
                              if (isNaN(amountNum) || amountNum <= 0) {
                                throw new Error('Invalid amount');
                              }

                              // For withdrawals, ALWAYS fetch LATEST shares (they accrue in real-time!)
                              let amountInLamports: string;
                              if (lendMode === 'withdraw') {
                                const userPosition = userPositions?.deposits?.find((dep: any) => dep.asset === selectedReserve.mint);
                                if (!userPosition) throw new Error('Position not found');
                                amountInLamports = userPosition.shares; // Use CURRENT shares, not cached value
                              } else {
                                amountInLamports = Math.floor(amountNum * Math.pow(10, selectedReserve.decimals || 9)).toString();
                              }

                              // CRITICAL: CASH is ONLY on Kamino, NOT Jupiter
                              const CASH_MINT = 'CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH';
                              const isCASH = selectedReserve.mint === CASH_MINT;
                              
                              // Route based on mint address (primary) or platform field (fallback)
                              const platform = isCASH ? 'Kamino' : (selectedReserve.platform || 'Jupiter');
                              console.log('🏦 MINT-BASED ROUTING - Token:', selectedReserve.symbol, 'Mint:', selectedReserve.mint, 'Platform:', platform);
                              
                              const platformPrefix = platform === 'Kamino' ? '/api/kamino-lend' : '/api/jupiter-lend';
                              const endpoint = lendMode === 'deposit' 
                                ? `${platformPrefix}/build-deposit` 
                                : `${platformPrefix}/build-withdraw`;
                              console.log('📍 Using endpoint:', endpoint);
                              
                              const response = await fetch(endpoint, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  asset: selectedReserve.mint,
                                  amount: amountInLamports,
                                  walletAddress: publicKey.toString(),
                                }),
                              });

                              console.log('📨 Response status:', response.status);
                              if (!response.ok) {
                                const errorData = await response.json();
                                console.error('❌ Server error:', errorData);
                                throw new Error(errorData.error || `Failed to build ${lendMode} transaction`);
                              }

                              const { transaction: base64Transaction } = await response.json();
                              const txBuffer = Buffer.from(base64Transaction, 'base64');
                              const transaction = VersionedTransaction.deserialize(txBuffer);
                              
                              if ('signTransaction' in wallet && wallet.signTransaction) {
                                const signedTx = await wallet.signTransaction(transaction);
                                
                                const signature = await connection.sendRawTransaction(signedTx.serialize(), {
                                  skipPreflight: false,
                                  maxRetries: 3
                                });

                                await connection.confirmTransaction(signature, 'confirmed');

                                // Record transaction for analytics (only for deposits)
                                if (lendMode === 'deposit') {
                                  try {
                                    const tokenPrice = selectedReserve.price || 0;
                                    const usdValue = amountNum * tokenPrice;
                                    
                                    await fetch('/api/jupiter-lend/record-deposit', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        signature,
                                        walletAddress: publicKey.toString(),
                                        tokenMint: selectedReserve.mint,
                                        tokenSymbol: selectedReserve.symbol,
                                        amountDeposited: amountNum.toString(),
                                        usdValueAtDeposit: usdValue.toString(),
                                        apyAtDeposit: selectedReserve.depositAPY.toString(),
                                      }),
                                    });
                                  } catch (err) {
                                    console.error('Failed to record deposit:', err);
                                  }
                                }
                                
                                // Refresh stats if platform wallet
                                if (publicKey.toString() === 'GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6') {
                                  const statsResponse = await fetch('/api/jupiter-lend/statistics');
                                  if (statsResponse.ok) {
                                    const stats = await statsResponse.json();
                                    setLendStats(stats);
                                  }
                                }

                                toast({
                                  title: lendMode === 'deposit' ? "Deposit Successful!" : "Withdrawal Successful!",
                                  description: lendMode === 'deposit' 
                                    ? `Deposited ${amountNum} ${selectedReserve.symbol}. Now earning ${selectedReserve.depositAPY.toFixed(2)}% APY!`
                                    : `Withdrew ${amountNum} ${selectedReserve.symbol} from lending pool.`,
                                });

                                setDepositDialogOpen(false);
                                setDepositAmount('');
                                
                                // Refresh user positions
                                queryClient.invalidateQueries({ queryKey: ['/api/jupiter-lend/user-positions', publicKey.toString()] });
                              }
                            } catch (error: any) {
                              console.error(`${lendMode} error:`, error);
                              toast({
                                title: lendMode === 'deposit' ? "Deposit Failed" : "Withdrawal Failed",
                                description: error.message || `Failed to ${lendMode} assets`,
                                variant: "destructive",
                              });
                            } finally {
                              setDepositingLend(false);
                            }
                          }}
                          disabled={depositingLend || !depositAmount}
                          className="w-full bg-gradient-to-r from-teal-600 via-teal-700 to-teal-800 hover:from-teal-700 hover:via-teal-800 hover:to-teal-900 text-white py-6 text-lg font-bold rounded-xl shadow-lg transition-all duration-200 active:scale-[0.98]"
                          data-testid={`button-confirm-${lendMode}`}
                        >
                          {depositingLend ? (
                            <div className="flex items-center justify-center gap-3">
                              <RefreshCw className="w-5 h-5 animate-spin" />
                              <span>{lendMode === 'deposit' ? 'Depositing...' : 'Withdrawing...'}</span>
                            </div>
                          ) : (
                            <span>{lendMode === 'deposit' ? 'Deposit' : 'Withdraw'}</span>
                          )}
                        </Button>
                      </DrawerFooter>
                    </DrawerContent>
                  </Drawer>
                ) : (
                  <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
                    <DialogContent className="bg-gradient-to-br from-purple-900/95 to-purple-950/95 backdrop-blur-xl border-purple-500/30 text-white p-4" style={{ width: '512px', height: '606px', maxWidth: '512px' }}>
                      <div>
                        {/* Header with Token Logo and Symbol */}
                        <div className="flex items-center gap-2 mb-3">
                          {selectedReserve?.logoUrl && (
                            <img src={selectedReserve.logoUrl} alt={selectedReserve.symbol} className="w-8 h-8 rounded-full border border-purple-400/30" />
                          )}
                          <h2 className="text-lg font-bold text-white">{selectedReserve?.symbol}</h2>
                        </div>

                      {/* Mode Toggle Buttons */}
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <Button
                          variant={lendMode === 'deposit' ? 'default' : 'outline'}
                          onClick={() => { setLendMode('deposit'); setDepositAmount(''); }}
                          className={lendMode === 'deposit' ? 'bg-purple-600 text-white' : 'bg-purple-900/30 text-purple-300 border-purple-600'}
                          data-testid="button-mode-deposit"
                        >
                          Deposit
                        </Button>
                        <Button
                          variant={lendMode === 'withdraw' ? 'default' : 'outline'}
                          onClick={() => { setLendMode('withdraw'); setDepositAmount(''); }}
                          className={lendMode === 'withdraw' ? 'bg-purple-600 text-white' : 'bg-purple-900/30 text-purple-300 border-purple-600'}
                          data-testid="button-mode-withdraw"
                        >
                          Withdraw
                        </Button>
                      </div>

                      {/* 1. Amount Section (FIRST) */}
                    <div className="bg-purple-900/40 border border-purple-500/30 rounded-lg p-3 mb-3">
                      {/* Header with Balance and Quick Actions */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-purple-200 text-sm font-medium">{lendMode === 'deposit' ? 'Deposit Amount' : 'Withdraw Amount'}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-purple-300">
                            💰 {lendMode === 'deposit' ? walletTokenBalance.toFixed(2) : (() => {
                              const userPosition = userPositions?.deposits?.find((dep: any) => dep.asset === selectedReserve?.mint);
                              if (!userPosition) return '0.00';
                              const deposited = parseFloat(userPosition.amount) / Math.pow(10, userPosition.decimals);
                              return deposited.toFixed(userPosition.decimals);
                            })()} {selectedReserve?.symbol}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs bg-purple-800/40 text-purple-300 hover:text-white hover:bg-purple-700/50 px-2 py-0.5 h-auto border border-purple-500/30"
                            onClick={() => {
                              if (lendMode === 'deposit') {
                                const balance = walletTokenBalance;
                                const isSOL = selectedReserve?.symbol === 'SOL' || selectedReserve?.symbol === 'WSOL';
                                const maxAmount = isSOL ? Math.max(0, balance - 0.01) : balance;
                                const decimals = selectedReserve?.decimals || 9;
                                setDepositAmount((maxAmount / 2).toFixed(decimals));
                                setDepositRawAmount(null);
                              } else {
                                // For withdrawals, use SHARES for calculations
                                const userPosition = userPositions?.deposits?.find((dep: any) => dep.asset === selectedReserve?.mint);
                                if (!userPosition) return;
                                const rawShares = userPosition.shares;
                                const rawAmount = userPosition.amount; // For display
                                const halfShares = Math.floor(parseFloat(rawShares) / 2).toString();
                                const decimals = userPosition.decimals;
                                const displayAmount = parseFloat(rawAmount) / Math.pow(10, decimals);
                                setDepositAmount((displayAmount / 2).toFixed(decimals));
                                setDepositRawAmount(halfShares);
                              }
                            }}
                            data-testid="button-half-amount"
                          >
                            HALF
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs bg-purple-800/40 text-purple-300 hover:text-white hover:bg-purple-700/50 px-2 py-0.5 h-auto border border-purple-500/30"
                            onClick={() => {
                              if (lendMode === 'deposit') {
                                const balance = walletTokenBalance;
                                const isSOL = selectedReserve?.symbol === 'SOL' || selectedReserve?.symbol === 'WSOL';
                                const maxAmount = isSOL ? Math.max(0, balance - 0.01) : balance;
                                const decimals = selectedReserve?.decimals || 9;
                                setDepositAmount(maxAmount.toFixed(decimals));
                                setDepositRawAmount(null);
                              } else {
                                // For withdrawals, use SHARES not amount (Jupiter SDK expects shares)
                                const userPosition = userPositions?.deposits?.find((dep: any) => dep.asset === selectedReserve?.mint);
                                if (!userPosition) return;
                                const rawShares = userPosition.shares; // Use shares, not amount!
                                const rawAmount = userPosition.amount; // For display only
                                const decimals = userPosition.decimals;
                                const displayAmount = parseFloat(rawAmount) / Math.pow(10, decimals);
                                setDepositAmount(displayAmount.toFixed(decimals));
                                setDepositRawAmount(rawShares); // Store shares for withdrawal
                              }
                            }}
                            data-testid="button-max-amount"
                          >
                            MAX
                          </Button>
                        </div>
                      </div>

                      {/* Token and Amount Input */}
                      <div className="flex items-center justify-between bg-purple-950/50 rounded-lg p-2.5 border border-purple-500/20">
                        <div className="flex items-center gap-2">
                          {selectedReserve?.logoUrl && (
                            <img src={selectedReserve.logoUrl} alt={selectedReserve.symbol} className="w-7 h-7 rounded-full border border-purple-400/30" />
                          )}
                          <span className="text-white font-semibold text-sm">{selectedReserve?.symbol}</span>
                        </div>
                        <Input
                          type="text"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          placeholder="0.00"
                          className="bg-transparent border-none text-right text-xl font-semibold text-white focus-visible:ring-0 focus-visible:ring-offset-0 w-auto max-w-[120px] placeholder:text-purple-600"
                          data-testid="input-deposit-amount"
                        />
                      </div>
                    </div>

                    {/* 2. APY and TVL Info / Data Pool (SECOND) */}
                    <div className="bg-purple-800/20 border border-purple-500/20 rounded-lg p-2.5 mb-3 space-y-2">
                      {/* APY */}
                      <div className="flex items-center justify-between">
                        <span className="text-purple-300 text-sm">APY</span>
                        <span className="text-green-400 text-sm font-semibold bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                          ≈ {selectedReserve?.depositAPY.toFixed(2)}%
                        </span>
                      </div>

                      <Separator className="bg-purple-500/20" />

                      {/* Vault TVL */}
                      <div className="flex items-center justify-between">
                        <span className="text-purple-300 text-sm">Vault TVL</span>
                        <div className="text-right">
                          {(() => {
                            const tvl = parseFloat(selectedReserve?.tvl || '0');
                            const formatTVL = (value: number) => {
                              if (value >= 1_000_000) {
                                return `${(value / 1_000_000).toFixed(1)}M`;
                              } else if (value >= 1_000) {
                                return `${(value / 1_000).toFixed(1)}K`;
                              } else {
                                return value.toFixed(2);
                              }
                            };
                            return (
                              <>
                                <div className="text-white text-sm font-semibold">${formatTVL(tvl)}</div>
                                <div className="text-xs text-purple-400">{formatTVL(tvl)} {selectedReserve?.symbol}</div>
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      <Separator className="bg-purple-500/20" />

                      {/* Layer Total */}
                      <div className="flex items-center justify-between">
                        <span className="text-purple-300 text-sm">Layer Total</span>
                        <div className="text-right">
                          {(() => {
                            const tvl = parseFloat(selectedReserve?.tvl || '0');
                            const formatTVL = (value: number) => {
                              if (value >= 1_000_000) {
                                return `${(value / 1_000_000).toFixed(1)}M`;
                              } else if (value >= 1_000) {
                                return `${(value / 1_000).toFixed(1)}K`;
                              } else {
                                return value.toFixed(2);
                              }
                            };
                            return (
                              <>
                                <div className="text-white text-sm font-semibold">${formatTVL(tvl)}</div>
                                <div className="text-xs text-purple-400">{formatTVL(tvl)} {selectedReserve?.symbol}</div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* 3. User Deposit and Earnings (THIRD) */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      {/* Deposited Card */}
                      <div className="bg-purple-800/20 border border-purple-500/20 rounded-lg p-3">
                        <div className="text-xs text-purple-300 mb-1">Deposited</div>
                        {(() => {
                          const userPos = (userPositions as any)?.deposits?.find(
                            (d: any) => d.asset === selectedReserve?.mint
                          );
                          if (!userPos) {
                            return (
                              <>
                                <div className="text-lg font-bold text-white">0.00 {selectedReserve?.symbol}</div>
                                <div className="text-xs text-purple-400">$0.00</div>
                              </>
                            );
                          }
                          const amount = parseFloat(userPos.amount) / Math.pow(10, selectedReserve?.decimals || 6);
                          const usdValue = amount * parseFloat(selectedReserve?.price || '0');
                          const decimals = selectedReserve?.decimals || 6;
                          return (
                            <>
                              <div className="text-lg font-bold text-white">
                                {amount.toFixed(amount < 0.01 ? decimals : 2)} {selectedReserve?.symbol}
                              </div>
                              <div className="text-xs text-purple-400">${usdValue.toFixed(usdValue < 0.01 ? 10 : 2)}</div>
                            </>
                          );
                        })()}
                      </div>

                      {/* Earnings Card */}
                      <div className="bg-purple-800/20 border border-purple-500/20 rounded-lg p-3">
                        <div className="text-xs text-purple-300 mb-1">Your Earnings</div>
                        {(() => {
                          const userPos = (userPositions as any)?.deposits?.find(
                            (d: any) => d.asset === selectedReserve?.mint
                          );
                          if (!userPos || !userPos.earnings) {
                            return (
                              <>
                                <div className="text-lg font-bold text-green-400">0.00 {selectedReserve?.symbol}</div>
                                <div className="text-xs text-purple-400">$0.00</div>
                              </>
                            );
                          }
                          const earnings = parseFloat(userPos.earnings) / Math.pow(10, selectedReserve?.decimals || 6);
                          const usdValue = earnings * parseFloat(selectedReserve?.price || '0');
                          const decimals = selectedReserve?.decimals || 6;
                          return (
                            <>
                              <div className="text-lg font-bold text-green-400">
                                {earnings.toFixed(earnings < 0.01 ? decimals : 2)} {selectedReserve?.symbol}
                              </div>
                              <div className="text-xs text-purple-400">${usdValue.toFixed(usdValue < 0.01 ? 10 : 2)}</div>
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    {/* 4. Action Button (LAST) */}
                    <Button
                      onClick={async () => {
                        console.log('🚀 DIALOG DEPOSIT BUTTON CLICKED');
                        if (!publicKey || !wallet || !selectedReserve || !depositAmount) {
                          console.error('❌ Missing required fields:', { publicKey: !!publicKey, wallet: !!wallet, selectedReserve: !!selectedReserve, depositAmount });
                          return;
                        }
                        
                        setDepositingLend(true);
                        try {
                          const amountNum = parseFloat(depositAmount);
                          if (isNaN(amountNum) || amountNum <= 0) {
                            throw new Error('Invalid amount');
                          }

                          // For withdrawals, ALWAYS fetch LATEST shares (they accrue in real-time!)
                          let amountInLamports: string;
                          if (lendMode === 'withdraw') {
                            const userPosition = userPositions?.deposits?.find((dep: any) => dep.asset === selectedReserve.mint);
                            if (!userPosition) throw new Error('Position not found');
                            amountInLamports = userPosition.shares; // Use CURRENT shares, not cached value
                          } else {
                            amountInLamports = Math.floor(amountNum * Math.pow(10, selectedReserve.decimals || 9)).toString();
                          }

                          // CRITICAL: CASH is ONLY on Kamino, NOT Jupiter
                          const CASH_MINT = 'CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH';
                          const isCASH = selectedReserve.mint === CASH_MINT;
                          
                          // Route based on mint address (primary) or platform field (fallback)
                          const platform = isCASH ? 'Kamino' : (selectedReserve.platform || 'Jupiter');
                          console.log('🏦 MINT-BASED ROUTING (Dialog) - Token:', selectedReserve.symbol, 'Mint:', selectedReserve.mint, 'Platform:', platform);
                          
                          const platformPrefix = platform === 'Kamino' ? '/api/kamino-lend' : '/api/jupiter-lend';
                          const endpoint = lendMode === 'deposit' 
                            ? `${platformPrefix}/build-deposit` 
                            : `${platformPrefix}/build-withdraw`;
                          console.log('📍 Using endpoint (Dialog):', endpoint);
                          
                          const response = await fetch(endpoint, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              asset: selectedReserve.mint,
                              amount: amountInLamports,
                              walletAddress: publicKey.toString()
                            })
                          });

                          console.log('📨 Response status (Dialog):', response.status);
                          if (!response.ok) {
                            const errorData = await response.json();
                            console.error('❌ Server error (Dialog):', errorData);
                            throw new Error(errorData.error || `Failed to build ${lendMode} transaction`);
                          }

                          const { transaction: base64Transaction } = await response.json();
                          const txBuffer = Buffer.from(base64Transaction, 'base64');
                          const transaction = VersionedTransaction.deserialize(txBuffer);
                          
                          if ('signTransaction' in wallet && wallet.signTransaction) {
                            const signedTx = await wallet.signTransaction(transaction);
                            
                            const signature = await connection.sendRawTransaction(signedTx.serialize(), {
                              skipPreflight: false,
                              maxRetries: 3
                            });

                            await connection.confirmTransaction(signature, 'confirmed');

                            // Record transaction for analytics (only for deposits)
                            if (lendMode === 'deposit') {
                              try {
                                const tokenPrice = selectedReserve.price || 0;
                                const usdValue = amountNum * tokenPrice;
                                
                                await fetch('/api/jupiter-lend/record-deposit', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    signature,
                                    walletAddress: publicKey.toString(),
                                    tokenMint: selectedReserve.mint,
                                    tokenSymbol: selectedReserve.symbol,
                                    amountDeposited: amountNum.toString(),
                                    usdValueAtDeposit: usdValue.toString(),
                                    apyAtDeposit: selectedReserve.depositAPY.toString(),
                                  }),
                                });
                              } catch (err) {
                                console.error('Failed to record deposit:', err);
                              }
                            }
                            
                            // Refresh stats if platform wallet
                            if (publicKey.toString() === 'GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6') {
                              const statsResponse = await fetch('/api/jupiter-lend/statistics');
                              if (statsResponse.ok) {
                                const stats = await statsResponse.json();
                                setLendStats(stats);
                              }
                            }

                            toast({
                              title: lendMode === 'deposit' ? "Deposit Successful!" : "Withdrawal Successful!",
                              description: lendMode === 'deposit' 
                                ? `Deposited ${amountNum} ${selectedReserve.symbol}. Now earning ${selectedReserve.depositAPY.toFixed(2)}% APY!`
                                : `Withdrew ${amountNum} ${selectedReserve.symbol} from lending pool.`,
                            });

                            setDepositDialogOpen(false);
                            setDepositAmount('');
                            
                            // Refresh user positions
                            queryClient.invalidateQueries({ queryKey: ['/api/jupiter-lend/user-positions', publicKey.toString()] });
                          }
                        } catch (error: any) {
                          console.error(`${lendMode} error:`, error);
                          toast({
                            title: lendMode === 'deposit' ? "Deposit Failed" : "Withdrawal Failed",
                            description: error.message || `Failed to ${lendMode} assets`,
                            variant: "destructive",
                          });
                        } finally {
                          setDepositingLend(false);
                        }
                      }}
                      disabled={depositingLend || !depositAmount}
                      className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white py-6 text-lg font-semibold rounded-lg shadow-lg shadow-green-500/20 border border-green-500/30"
                      data-testid={`button-confirm-${lendMode}`}
                    >
                      {depositingLend ? (
                        <div className="flex items-center gap-2">
                          <RefreshCw className="w-5 h-5 animate-spin" />
                          {lendMode === 'deposit' ? 'Depositing...' : 'Withdrawing...'}
                        </div>
                      ) : (
                        lendMode === 'deposit' ? 'Deposit' : 'Withdraw'
                      )}
                    </Button>
                    </div>
                  </DialogContent>
                </Dialog>
                )}
              </div>
          )}

          {/* Statistics Section - Only show on reclaim tab - Above safety sections */}
          {activeTab === 'reclaim' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* Total SOL Recovered */}
              <div className="bg-black/40 backdrop-blur-sm rounded-xl border border-gray-700 p-8 text-center">
                <div className="text-4xl font-bold text-white mb-3" style={{ fontFamily: 'Georgia, serif' }}>
                  {stats ? stats.totalSolRecovered.toFixed(6) : '0.000000'}
                </div>
                <div className="text-sm text-gray-300 uppercase tracking-wider" style={{ fontFamily: 'Georgia, serif' }}>
                  TOTAL SOL RECOVERED
                </div>
              </div>

              {/* Total Accounts Closed */}
              <div className="bg-black/40 backdrop-blur-sm rounded-xl border border-gray-700 p-8 text-center">
                <div className="text-4xl font-bold text-white mb-3" style={{ fontFamily: 'Georgia, serif' }}>
                  {stats ? stats.totalAccountsClaimed : 0}
                </div>
                <div className="text-sm text-gray-300 uppercase tracking-wider" style={{ fontFamily: 'Georgia, serif' }}>
                  TOTAL ACCOUNTS CLOSED
                </div>
              </div>
            </div>
          )}

          {/* All Time Ledger Section - Only show on reclaim tab */}
          {activeTab === 'reclaim' && (
            <div className="bg-black/40 backdrop-blur-sm rounded-xl border border-gray-700 p-6 mb-6">
              <div className="flex items-center mb-6">
                <h3 className="text-2xl font-bold text-white text-center w-full" style={{ fontFamily: 'Georgia, serif' }}>ALL TIME LEDGER</h3>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-full">
                  {/* Header */}
                  <div className="grid grid-cols-4 gap-4 mb-4 pb-3 border-b border-gray-600">
                    <div className="text-sm font-semibold text-gray-300 uppercase tracking-wider" style={{ fontFamily: 'Georgia, serif' }}>
                      WALLET/TX
                    </div>
                    <div className="text-sm font-semibold text-gray-300 uppercase tracking-wider text-center" style={{ fontFamily: 'Georgia, serif' }}>
                      ACCTS
                    </div>
                    <div className="text-sm font-semibold text-gray-300 uppercase tracking-wider text-center" style={{ fontFamily: 'Georgia, serif' }}>
                      CLAIMED SOL
                    </div>
                    <div className="text-sm font-semibold text-gray-300 uppercase tracking-wider text-center" style={{ fontFamily: 'Georgia, serif' }}>
                      DATE
                    </div>
                  </div>

                  {/* Transaction Rows */}
                  <div>
                    {isLoadingTransactions && allTransactions.length === 0 ? (
                      <div className="text-center text-gray-400 py-8">
                        Loading transactions...
                      </div>
                    ) : allTransactions.length === 0 ? (
                      <div className="text-center text-gray-400 py-8">
                        No transactions yet
                      </div>
                    ) : (
                      allTransactions.map((tx, index) => (
                        <div key={tx.signature}>
                          <div 
                            className="grid grid-cols-4 gap-4 py-3 hover:bg-gray-800/40 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-gray-600"
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
                              {(tx.netAmount || tx.solRecovered * 0.85).toFixed(6)}
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
                      ))
                    )}
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

      {/* Footer */}
      <div className="border-t border-gray-700 bg-black/30 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6 max-w-6xl">
          <div className="flex items-center justify-center space-x-3">
            <img 
              src={pumpkinImage}
              alt="Halloween Pumpkin"
              className="h-[40px] w-[40px]"
            />
            <div className="text-center">
              <div className="text-white font-semibold text-lg" style={{ fontFamily: 'Georgia, serif' }}>Spooky SOL Recovery</div>
              <div className="text-orange-300 text-sm">2025 All rights reserved</div>
            </div>
          </div>
        </div>
      </div>

      {/* Wallet Selection Modal */}

      {/* Swap Modal */}
      <SwapModal open={isSwapModalOpen} onOpenChange={setIsSwapModalOpen} />
      
      {/* Share Modal */}
      {shareData && (
        <ShareModal 
          isOpen={isShareModalOpen} 
          onClose={() => setIsShareModalOpen(false)} 
          solClaimed={shareData.solClaimed}
          referralCode={userReferralCode}
        />
      )}

      {/* Floating Swap Toggle Button - Halloween Style */}
      <button
        onClick={() => setIsSwapModalOpen(!isSwapModalOpen)}
        className="fixed bottom-4 left-4 md:left-8 z-40 hover:scale-105 transition-all bg-black/60 border-2 border-gray-700 px-6 py-3 rounded-lg text-white font-bold text-xl"
        data-testid="button-floating-swap"
        title="Toggle Token Swap"
        style={{ fontFamily: 'Georgia, serif' }}
      >
        SWAP
      </button>

      <style>{`
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .animate-spin-slow {
          animation: spin-slow 10s linear infinite;
        }
        
        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-20px);
          }
        }
        
        @keyframes float-delayed {
          0%, 100% {
            transform: translateY(0px) translateX(0px);
          }
          50% {
            transform: translateY(-15px) translateX(10px);
          }
        }
        
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
        
        .animate-float-delayed {
          animation: float-delayed 8s ease-in-out infinite;
        }
        
        .halloween-pumpkin {
          filter: none;
        }
      `}</style>
    </div>
  );
}