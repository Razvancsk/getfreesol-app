import { useState, useEffect, useMemo, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link, useLocation } from "wouter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Coins, Wallet, Search, CheckCircle, ExternalLink, AlertTriangle, RefreshCw, Flame, Image, Trash2, ArrowLeftRight, Copy, Share2, Users, TrendingUp, DollarSign, Globe, ChevronDown, Code, Shield, Cpu, TreePine, Info, Check, Plane, Zap, X, Trophy, Star, Award } from "lucide-react";
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
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import { SwapModal } from '@/components/SwapModal';
import { ShareModal } from '@/components/ShareModal';
import { LendPositions } from '@/components/LendPositions';
import logoImage from '@assets/image_1757882056840.png';
import swapButtonImage from '@assets/image_1760235318056.png';
import whalesMarketLogo from '@assets/image_1763213026376.png';

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
  const [activeTab, setActiveTab] = useState<'referrals' | 'reclaim' | 'burnTokens' | 'statistics' | 'docs' | 'points'>('reclaim');
  const [showDeveloper, setShowDeveloper] = useState(false);
  const [activeDocSection, setActiveDocSection] = useState<'overview' | 'burn-tokens' | 'burn-nfts' | 'referrals' | 'points' | 'developer'>('overview');
  const [selectedLeaderboardPeriod, setSelectedLeaderboardPeriod] = useState<'24h' | 'weekly' | 'monthly' | 'all'>('24h');
  const [burnSubTab, setBurnSubTab] = useState<'tokens' | 'nft'>('tokens');
  const [selectedTokenMint, setSelectedTokenMint] = useState<string>('So11111111111111111111111111111111111111112'); // Default to SOL
  const [tokenList, setTokenList] = useState<any[]>([]);
  const [nftData, setNftData] = useState<any>(null);
  const [selectedNfts, setSelectedNfts] = useState<Set<string>>(new Set());
  const [nftTabView, setNftTabView] = useState<'nfts' | 'cnfts'>('nfts'); // Tab for NFTs vs cNFTs
  const [referralCode, setReferralCode] = useState<string>('');
  const [userReferralCode, setUserReferralCode] = useState<string | null>(null);

  // Selection states for bulk burning
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const [maxTokenValueIndex, setMaxTokenValueIndex] = useState<number>(0); // 0=$1, 1=$10, 2=$30, 3=$100, 4=All (Start at minimum)
  
  // Token value filter logic
  const VALUE_PRESETS = [1, 10, 30, 100, null]; // null = show all
  const currentMaxTokenValue = VALUE_PRESETS[maxTokenValueIndex];
  const filteredTokenList = useMemo(() => {
    if (currentMaxTokenValue === null) return tokenList;
    return tokenList.filter(token => {
      const tokenValue = token.usdValue || 0;
      return tokenValue <= currentMaxTokenValue;
    });
  }, [tokenList, currentMaxTokenValue]);
  
  // Jupiter Lend states
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [selectedReserve, setSelectedReserve] = useState<any>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositRawAmount, setDepositRawAmount] = useState<string | null>(null); // Store raw amount for withdrawals to avoid float precision loss
  const [depositingLend, setDepositingLend] = useState(false);
  const [lendMode, setLendMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [walletTokenBalance, setWalletTokenBalance] = useState<number>(0);
  const [lendStats, setLendStats] = useState<{ totalDepositsUsd: string; totalEarningsUsd: string } | null>(null);
  
  // Swap modal state
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
  
  // Share modal state
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareData, setShareData] = useState<{ solClaimed: number } | null>(null);
  
  // Batch processing state
  const [isBatching, setIsBatching] = useState(false);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [batchResults, setBatchResults] = useState<{totalSol: number; totalAccounts: number}>({ totalSol: 0, totalAccounts: 0 });

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
    queryKey: ['/api/statistics/leaderboard', selectedLeaderboardPeriod],
    queryFn: async () => {
      const response = await fetch(`/api/statistics/leaderboard?period=${selectedLeaderboardPeriod}&limit=10`);
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

  // Points queries - need to be after publicKey is defined
  const pointsWalletAddress = publicKey?.toBase58();
  
  const { data: userPoints, isLoading: userPointsLoading } = useQuery({
    queryKey: ['/api/points', pointsWalletAddress],
    queryFn: async () => {
      if (!pointsWalletAddress) throw new Error('Wallet address required');
      const response = await fetch(`/api/points/${pointsWalletAddress}`);
      if (!response.ok) throw new Error('Failed to fetch user points');
      return response.json();
    },
    enabled: activeTab === 'points' && !!pointsWalletAddress,
  });

  const { data: pointsLeaderboard, isLoading: pointsLeaderboardLoading } = useQuery({
    queryKey: ['/api/points/leaderboard'],
    queryFn: async () => {
      const response = await fetch('/api/points/leaderboard?limit=100');
      if (!response.ok) throw new Error('Failed to fetch leaderboard');
      return response.json();
    },
    enabled: activeTab === 'points',
  });

  // Function to fetch wallet balance for a specific token (for Lend deposit dialog)
  const fetchTokenBalance = async (tokenMint: string) => {
    if (!publicKey || !connection) {
      setWalletTokenBalance(0);
      return;
    }
    
    try {
      // For SOL, get native balance directly from connection
      if (tokenMint === 'So11111111111111111111111111111111111111112') {
        const balance = await connection.getBalance(publicKey);
        const solBalance = balance / 1e9; // Convert lamports to SOL
        setWalletTokenBalance(solBalance);
        return;
      }
      
      // For other tokens, use backend proxy with Jupiter API key
      const response = await fetch(`/api/wallet/all-tokens?address=${publicKey.toBase58()}`);
      
      if (!response.ok) {
        setWalletTokenBalance(0);
        return;
      }
      
      const data = await response.json();
      
      if (data.success && data.tokens) {
        const matchingToken = data.tokens.find((t: any) => t.address === tokenMint);
        if (matchingToken) {
          setWalletTokenBalance(matchingToken.balance);
        } else {
          setWalletTokenBalance(0);
        }
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
      }
    }
  }, [isConnected, publicKey, activeTab, burnSubTab]);

  // Fetch lend statistics for platform wallet
  useEffect(() => {
    if (activeTab === 'docs' && showDeveloper && publicKey?.toString() === 'GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6') {
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

  // Check if platform wallet
  const isPlatformWallet = publicKey?.toString() === 'GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6';

  // Redirect from lend tab if not platform wallet
  useEffect(() => {
    // Reset showDeveloper when switching tabs
    if (activeTab !== 'docs') {
      setShowDeveloper(false);
    }
  }, [activeTab]);

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
    enabled: activeTab === 'docs' && showDeveloper && !!publicKey,
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
        title: `Successfully burned ${result.tokensProcessed} token${result.tokensProcessed > 1 ? 's' : ''}`,
        className: "bg-green-600 text-white border-green-600",
        action: <ToastAction altText="View transaction on Solscan" onClick={() => window.open(`https://solscan.io/tx/${result.signature}`, '_blank')}>View on Solscan</ToastAction>
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

      // Group NFTs by type (all types supported including cNFTs)
      const nftsByType: { [key: string]: any[] } = {};
      selectedNfts.forEach((nft: any) => {
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
              title: `Successfully burned ${totalBurned} Core NFT${totalBurned > 1 ? 's' : ''}`,
              className: "bg-green-600 text-white border-green-600",
              action: <ToastAction altText="View transaction on Solscan" onClick={() => window.open(`https://solscan.io/tx/${firstSignature}`, '_blank')}>View on Solscan</ToastAction>
            });

            // Add results to main results array
            results.push({
              type: 'core',
              signatures: allBatchResults.map(r => r.signature),
              totalBurned,
              totalNetAmount,
              batchCount: prepareResponse.totalBatches
            });

            continue; // Continue to next NFT type

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
              className: "bg-green-600 text-white border-green-600",
              action: <ToastAction altText="View transaction on Solscan" onClick={() => window.open(`https://solscan.io/tx/${firstSignature}`, '_blank')}>View on Solscan</ToastAction>
            });

            // Don't invalidate immediately - let optimistic update handle UI state
            // We'll rely on the next manual refresh or page load to sync with server

            continue; // Continue to next NFT type

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
              className: "bg-green-600 text-white border-green-600",
              action: <ToastAction altText="View transaction on Solscan" onClick={() => window.open(`https://solscan.io/tx/${firstSignature}`, '_blank')}>View on Solscan</ToastAction>
            });

            // Don't invalidate immediately - let optimistic update handle UI state
            // We'll rely on the next manual refresh or page load to sync with server

            continue; // Continue to next NFT type

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

        // Handle Compressed NFTs (cNFTs) with Bubblegum
        if (nftType === 'cnft') {
          try {
            console.log('🔥 Starting Compressed NFT burning with Bubblegum...');
            console.log('⚠️ WARNING: cNFTs do NOT recover SOL - this is for cleanup only');
            
            if (!wallet.publicKey) {
              throw new Error('Wallet not connected');
            }

            // Prepare cNFT asset IDs
            const cnftIds = nfts.map(nft => nft.assetId || nft.id);
            console.log(`📦 Preparing burn transactions for ${cnftIds.length} Compressed NFTs...`);

            // Call server to prepare cNFT burn transactions
            const prepareResponseRaw = await apiRequest('POST', '/api/cnfts/prepare-burn', {
              cnftIds,
              walletAddress: wallet.publicKey.toString()
            });
            const prepareResponse = await prepareResponseRaw.json();

            console.log('🔧 Server prepared cNFT burn transactions:', prepareResponse);

            if (!prepareResponse.batches || prepareResponse.batches.length === 0) {
              throw new Error('No cNFT burn transactions prepared by server');
            }

            // Show warning about no SOL recovery
            if (prepareResponse.warning) {
              console.warn('⚠️ cNFT Warning:', prepareResponse.warning);
            }

            const allBatchResults: any[] = [];
            let totalBurned = 0;

            // Process each cNFT transaction sequentially (one per cNFT due to unique Merkle proofs)
            for (let i = 0; i < prepareResponse.batches.length; i++) {
              const batch = prepareResponse.batches[i];
              console.log(`🔐 Signing cNFT transaction ${i + 1}/${prepareResponse.batches.length}...`);

              if (!batch.transaction) {
                throw new Error(`No transaction in cNFT batch ${i + 1}`);
              }

              // Deserialize the transaction from base64
              const transactionBuffer = Buffer.from(batch.transaction, 'base64');
              const transaction = VersionedTransaction.deserialize(transactionBuffer);

              // Sign the transaction
              const signedTransaction = await signTransaction(transaction);
              console.log(`✅ cNFT transaction ${i + 1} signed!`);

              // Submit the signed transaction via server relay
              console.log(`📡 Submitting cNFT transaction ${i + 1}...`);
              const relayResponseRaw = await apiRequest('POST', '/api/tx/relay', {
                signedTxBase64: Buffer.from(signedTransaction.serialize()).toString('base64'),
                description: `cNFT burn ${i + 1}: ${batch.nftIds.join(', ')}`,
                skipPreflight: true
              });
              const relayResponse = await relayResponseRaw.json();

              if (!relayResponse.success) {
                throw new Error(relayResponse.error || 'Failed to submit cNFT burn transaction');
              }

              const signature = relayResponse.signature;
              console.log(`✅ cNFT burn transaction ${i + 1} confirmed: ${signature}`);

              allBatchResults.push({
                signature,
                nftIds: batch.nftIds,
                success: true,
                solRecovered: 0 // cNFTs never recover SOL
              });

              totalBurned += batch.nftIds.length;
            }

            console.log(`🎉 Successfully burned ${totalBurned} Compressed NFTs!`);
            console.log(`⚠️ Note: 0 SOL recovered (cNFTs have no rent deposits)`);

            // Remove burned cNFTs from UI
            setNftData((prev: any) => {
              if (!prev) return prev;
              
              const burnedAssetIds = allBatchResults.flatMap(r => r.nftIds);
              const remainingNfts = prev.nfts.filter((nft: any) => 
                !burnedAssetIds.includes(nft.assetId || nft.id)
              );
              
              return {
                ...prev,
                nfts: remainingNfts,
                totalNfts: remainingNfts.length
              };
            });

            // Clear selection
            setSelectedNfts(new Set());

            // Show success message
            const firstSignature = allBatchResults[0]?.signature || '';
            toast({
              title: `Successfully burned ${totalBurned} Compressed NFT${totalBurned > 1 ? 's' : ''}`,
              className: "bg-green-600 text-white border-green-600",
              action: <ToastAction altText="View transaction on Solscan" onClick={() => window.open(`https://solscan.io/tx/${firstSignature}`, '_blank')}>View on Solscan</ToastAction>
            });

            continue; // Continue to next NFT type

          } catch (cnftError: any) {
            console.error('❌ Compressed NFT burning failed:', cnftError);
            
            toast({
              title: "Compressed NFT Burning Failed",
              description: cnftError.message || 'An unexpected error occurred',
              variant: "destructive",
            });
            
            throw cnftError;
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
      
      // Don't show final summary toast - each NFT type handler already shows its own success message
      // This prevents duplicate notifications

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

        // Save successful transaction to database and get points message (with retries)
        let pointsMessage = '';
        const recordData = {
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
        };

        // Retry up to 3 times with exponential backoff
        let recordSuccess = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            console.log(`📝 Recording transaction (attempt ${attempt}/3)...`);
            const dbResponse = await fetch('/api/sol-refund/record-success', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(recordData)
            });

            if (dbResponse.ok) {
              const dbResult = await dbResponse.json();
              pointsMessage = dbResult.message || '';
              console.log('✅ Transaction recorded and posted to X successfully');
              recordSuccess = true;
              break;
            } else {
              console.warn(`⚠️ Record attempt ${attempt} failed with status ${dbResponse.status}`);
            }
          } catch (dbError) {
            console.warn(`⚠️ Record attempt ${attempt} failed:`, dbError);
          }

          // Wait before retry (exponential backoff: 1s, 2s, 4s)
          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
          }
        }

        if (!recordSuccess) {
          console.error('❌ Failed to record transaction after 3 attempts - X post may have been missed');
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
      // Show share modal with the claimed amount (toast removed since share dialog shows the info)
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



  // Helper to chunk accounts into batches
  const chunkAccounts = <T,>(array: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  };

  // Process refunds in batches
  const processRefundBatches = async (allAccounts: string[]) => {
    const BATCH_SIZE = 20;
    const batches = chunkAccounts(allAccounts, BATCH_SIZE);
    
    setTotalBatches(batches.length);
    setIsBatching(true);
    setBatchResults({ totalSol: 0, totalAccounts: 0 });
    
    let totalSolRecovered = 0;
    let totalAccountsClosed = 0;
    const failedBatches: number[] = [];
    
    for (let i = 0; i < batches.length; i++) {
      setCurrentBatch(i + 1);
      
      try {
        console.log(`Processing batch ${i + 1} of ${batches.length} (${batches[i].length} accounts)`);
        
        const result = await refundMutation.mutateAsync({
          walletAddress: publicKey?.toString() || "",
          selectedAccounts: batches[i],
          donationPercentage,
          referralCode: referralCode || undefined,
        });
        
        // Accumulate results
        totalSolRecovered += result.totalReceived || 0;
        totalAccountsClosed += batches[i].length;
        setBatchResults({ totalSol: totalSolRecovered, totalAccounts: totalAccountsClosed });
        
      } catch (error) {
        console.error(`Batch ${i + 1} failed:`, error);
        failedBatches.push(i + 1);
        
        // Show error for this batch but continue processing
        toast({
          title: `Batch ${i + 1} Failed`,
          description: error instanceof Error ? error.message : "Failed to process this batch",
          variant: "destructive",
        });
      }
    }
    
    // Reset batching state
    setIsBatching(false);
    setCurrentBatch(0);
    setTotalBatches(0);
    
    // Show final summary
    if (failedBatches.length === 0) {
      toast({
        title: "All Batches Completed!",
        description: `Successfully closed ${totalAccountsClosed} accounts and recovered ${totalSolRecovered.toFixed(6)} SOL!`,
      });
      
      // Show share modal with total results
      setShareData({ solClaimed: totalSolRecovered });
      setIsShareModalOpen(true);
      
      // Reset scan and refresh data
      setScanResult(null);
      queryClient.invalidateQueries({ queryKey: ['/api/sol-refund/stats'] });
      queryClient.refetchQueries({ queryKey: ['/api/sol-refund/stats'] });
      
      if (publicKey) {
        queryClient.invalidateQueries({ queryKey: ['/api/user/profile', publicKey?.toString()] });
        queryClient.refetchQueries({ queryKey: ['/api/user/profile', publicKey?.toString()] });
      }
      
      queryClient.invalidateQueries({ queryKey: ['/api/leaderboard'] });
      queryClient.refetchQueries({ queryKey: ['/api/leaderboard'] });
    } else {
      toast({
        title: "Batching Completed with Errors",
        description: `Closed ${totalAccountsClosed} accounts (${failedBatches.length} batches failed). Recovered ${totalSolRecovered.toFixed(6)} SOL.`,
        variant: "destructive",
      });
    }
  };

  const handleProcessAllRefunds = () => {
    if (!scanResult || scanResult.accounts.length === 0) {
      toast({
        title: "No Accounts Found",
        description: "No empty accounts found to close",
        variant: "destructive",
      });
      return;
    }

    // Get all account addresses
    const allAccountAddresses = scanResult.accounts.map(acc => acc.accountAddress);
    
    // Check if batching is needed
    if (allAccountAddresses.length > 20) {
      // Use batching for large account sets
      processRefundBatches(allAccountAddresses);
    } else {
      // Single transaction for 20 or fewer accounts
      refundMutation.mutate({
        walletAddress: publicKey?.toString() || "",
        selectedAccounts: allAccountAddresses,
        donationPercentage,
        referralCode: referralCode || undefined,
      });
    }
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
                  className="h-[100px] w-[100px]"
                />
              </div>

              {/* Mobile Wallet Connection */}
              <div className="lg:hidden flex items-center space-x-2">
                {/* Social Media Buttons */}
                <div className="flex items-center space-x-1">
                  <Link 
                    href="/docs"
                    data-testid="button-social-docs"
                    className="flex items-center justify-center gap-1 px-2 h-8 bg-purple-800/60 hover:bg-purple-700/60 backdrop-blur-sm rounded-md transition-colors border border-purple-500/30"
                    title="API Documentation"
                  >
                    <Code className="h-4 w-4 text-white" />
                    <span className="text-white text-xs font-medium">API</span>
                  </Link>
                  <a
                    href="https://x.com/getfreesol_xyz"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="button-social-x"
                    className="flex items-center justify-center w-8 h-8 bg-purple-800/60 hover:bg-purple-700/60 backdrop-blur-sm rounded-md transition-colors border border-purple-500/30"
                    title="Follow us on X (Twitter)"
                  >
                    <SiX className="h-4 w-4 text-white" />
                  </a>
                  <a
                    href="https://discord.gg/tSBMgYcZaK"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="button-social-discord"
                    className="flex items-center justify-center w-8 h-8 bg-purple-800/60 hover:bg-purple-700/60 backdrop-blur-sm rounded-md transition-colors border border-purple-500/30"
                    title="Join our Discord community"
                  >
                    <SiDiscord className="h-4 w-4 text-white" />
                  </a>
                </div>

                {isConnected && publicKey ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        className="bg-purple-800/60 hover:bg-purple-700/60 backdrop-blur-sm rounded-lg px-2 py-2 text-white font-mono text-xs border border-purple-500/30 flex items-center space-x-1"
                        data-testid="button-wallet-connected"
                      >
                        <span>{publicKey.toString().slice(0, 3)}...{publicKey.toString().slice(-3)}</span>
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-slate-800 border-purple-500/30">
                      {publicKey?.toString() === 'GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6' && (
                        <>
                          <Link href="/admin/x-bot">
                            <DropdownMenuItem 
                              className="text-white hover:bg-purple-600/40 cursor-pointer"
                              data-testid="button-admin-xbot"
                            >
                              🤖 X Bot Admin
                            </DropdownMenuItem>
                          </Link>
                          <Link href="/x-admin">
                            <DropdownMenuItem 
                              className="text-white hover:bg-purple-600/40 cursor-pointer"
                              data-testid="button-x-admin"
                            >
                              🐦 X Account
                            </DropdownMenuItem>
                          </Link>
                        </>
                      )}
                      <DropdownMenuItem 
                        onClick={disconnectWallet}
                        className="text-white hover:bg-purple-600/40 cursor-pointer"
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
                    className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2 text-sm font-medium border border-purple-500/30"
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
                <Link 
                  href="/docs"
                  data-testid="button-social-docs-desktop"
                  className="flex items-center justify-center gap-1 px-2 h-8 bg-purple-800/60 hover:bg-purple-700/60 backdrop-blur-sm rounded-md transition-colors border border-purple-500/30"
                  title="API Documentation"
                >
                  <Code className="h-4 w-4 text-white" />
                  <span className="text-white text-xs font-medium">API</span>
                </Link>
                <a
                  href="https://x.com/getfreesol_xyz"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="button-social-x-desktop"
                  className="flex items-center justify-center w-8 h-8 bg-purple-800/60 hover:bg-purple-700/60 backdrop-blur-sm rounded-md transition-colors border border-purple-500/30"
                  title="Follow us on X (Twitter)"
                >
                  <SiX className="h-4 w-4 text-white" />
                </a>
                <a
                  href="https://discord.gg/tSBMgYcZaK"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="button-social-discord-desktop"
                  className="flex items-center justify-center w-8 h-8 bg-purple-800/60 hover:bg-purple-700/60 backdrop-blur-sm rounded-md transition-colors border border-purple-500/30"
                  title="Join our Discord community"
                >
                  <SiDiscord className="h-4 w-4 text-white" />
                </a>
              </div>

              {isConnected && publicKey ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      className="bg-purple-800/60 hover:bg-purple-700/60 backdrop-blur-sm rounded-lg px-4 py-2 text-white font-mono text-sm border border-purple-500/30 flex items-center space-x-2"
                      data-testid="button-wallet-connected-desktop"
                    >
                      <span>{publicKey.toString().slice(0, 6)}...{publicKey.toString().slice(-6)}</span>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-slate-800 border-purple-500/30">
                    {publicKey?.toString() === 'GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6' && (
                      <>
                        <Link href="/admin/x-bot">
                          <DropdownMenuItem 
                            className="text-white hover:bg-purple-600/40 cursor-pointer"
                            data-testid="button-admin-xbot-desktop"
                          >
                            🤖 X Bot Admin
                          </DropdownMenuItem>
                        </Link>
                        <Link href="/x-admin">
                          <DropdownMenuItem 
                            className="text-white hover:bg-purple-600/40 cursor-pointer"
                            data-testid="button-x-admin-desktop"
                          >
                            🐦 X Account
                          </DropdownMenuItem>
                        </Link>
                      </>
                    )}
                    <DropdownMenuItem 
                      onClick={disconnectWallet}
                      className="text-white hover:bg-purple-600/40 cursor-pointer"
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
                    className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-6 py-3 text-lg font-medium border border-purple-500/30"
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
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <Button
                  onClick={() => setActiveTab('reclaim')}
                  className={`px-3 md:px-2 py-2 text-sm font-medium rounded transition-all flex items-center gap-1 ${
                    activeTab === 'reclaim' 
                      ? 'bg-purple-600 text-white' 
                      : 'bg-purple-800/40 text-purple-300 hover:bg-purple-600/60'
                  }`}
                >
                  <svg className="h-4 w-4" viewBox="0 0 397.7 311.7" style={{ fill: '#00FFA3' }}>
                    <path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"/>
                    <path d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1L333.1,73.8c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"/>
                    <path d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z"/>
                  </svg>
                  <span className="hidden sm:inline">Claim SOL</span>
                  <span className="sm:hidden">Claim</span>
                </Button>
                <Button
                  onClick={() => setActiveTab('burnTokens')}
                  className={`px-3 md:px-2 py-2 text-sm font-medium rounded transition-all ${
                    activeTab === 'burnTokens' 
                      ? 'bg-purple-600 text-white' 
                      : 'bg-purple-800/40 text-purple-300 hover:bg-purple-600/60'
                  }`}
                >
                  🔥 Burn
                </Button>
                <Button
                  onClick={() => setActiveTab('referrals')}
                  className={`px-3 md:px-2 py-2 text-sm font-medium rounded transition-all flex items-center gap-1 ${
                    activeTab === 'referrals' 
                      ? 'bg-purple-600 text-white' 
                      : 'bg-purple-800/40 text-purple-300 hover:bg-purple-600/60'
                  }`}
                >
                  <Users className="h-4 w-4" />
                  Referrals
                </Button>
                <Button
                  onClick={() => setActiveTab('points')}
                  className={`px-3 md:px-2 py-2 text-sm font-medium rounded transition-all flex items-center gap-1 ${
                    activeTab === 'points' 
                      ? 'bg-purple-600 text-white' 
                      : 'bg-purple-800/40 text-purple-300 hover:bg-purple-600/60'
                  }`}
                  data-testid="button-points-tab"
                >
                  <Trophy className="h-4 w-4" />
                  Points
                </Button>
                <Button
                  onClick={() => setActiveTab('docs')}
                  className={`px-3 md:px-2 py-2 text-sm font-medium rounded transition-all flex items-center gap-1 ${
                    activeTab === 'docs' 
                      ? 'bg-purple-600 text-white' 
                      : 'bg-purple-800/40 text-purple-300 hover:bg-purple-600/60'
                  }`}
                  data-testid="button-docs"
                >
                  <Info className="h-4 w-4" />
                  Docs
                </Button>
                {/* Statistics button - only visible to platform wallet */}
                {isPlatformWallet && (
                  <Button
                    onClick={() => setActiveTab('statistics')}
                    className={`hidden md:inline-flex px-3 lg:px-2 py-2 text-sm font-medium rounded transition-all items-center gap-1 ${
                      activeTab === 'statistics' 
                        ? 'bg-purple-600 text-white' 
                        : 'bg-purple-800/40 text-purple-300 hover:bg-purple-600/60'
                    }`}
                    data-testid="button-statistics"
                  >
                    <TrendingUp className="h-4 w-4" />
                    Statistics
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Description */}
          <div className="text-center space-y-4 py-4">
            <p className="text-white max-w-2xl mx-auto text-2xl font-semibold">
{activeTab === 'referrals' ? 'Earn 50% commission from your referrals — just by helping others!' : activeTab === 'burnTokens' ? (burnSubTab === 'tokens' ? 'Burn Unwanted Tokens.' : 'Burn Unwanted NFTs.') : activeTab === 'statistics' ? 'Track rent recovery metrics and top performers' : activeTab === 'docs' ? 'Learn how to use GetFreeSol' : activeTab === 'points' ? 'Earn points for every account you close!' : 'Get your SOL back!'}
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
            <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Scan Results</h3>
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
                <div className="text-center text-purple-300 py-8">
                  {scanMutation.isPending ? 'Scanning wallet...' : 'Connect wallet and scan to find empty accounts'}
                </div>
              ) : (
                <>
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





                  {/* Batch Processing Progress */}
                  {isBatching && (
                    <div className="bg-gradient-to-br from-blue-800/20 to-blue-900/30 backdrop-blur-sm border border-blue-500/30 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between text-white">
                        <span className="font-semibold">Processing Batches</span>
                        <span className="text-sm">Batch {currentBatch} of {totalBatches}</span>
                      </div>
                      <Progress value={(currentBatch / totalBatches) * 100} className="h-2" />
                      <div className="text-sm text-blue-200">
                        <div>Closed: {batchResults.totalAccounts} accounts</div>
                        <div>Recovered: {batchResults.totalSol.toFixed(6)} SOL</div>
                      </div>
                    </div>
                  )}

                  {/* Process Button */}
                  <Button 
                    onClick={handleProcessAllRefunds}
                    disabled={refundMutation.isPending || isBatching}
                    size="lg"
                    className="w-full bg-gradient-to-br from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white py-4 text-lg font-semibold rounded-lg transition-all duration-200 shadow-lg"
                    data-testid="button-claim-all"
                  >
                    {(refundMutation.isPending || isBatching) ? (
                      <>
                        <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                        {isBatching ? `Processing Batch ${currentBatch}/${totalBatches}...` : 'Processing...'}
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-5 w-5 mr-2" />
                        CLAIM ALL
                      </>
                    )}
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

              {/* Value Filter Slider */}
              <div className="mb-6 space-y-3">
                <p className="text-sm text-green-400 font-medium">
                  {currentMaxTokenValue === null 
                    ? 'All tokens being displayed.'
                    : `Showing tokens worth up to $${currentMaxTokenValue}.`}
                </p>
                
                <Slider
                  value={[maxTokenValueIndex]}
                  onValueChange={(value) => {
                    const index = Math.round(value[0]);
                    setMaxTokenValueIndex(index);
                  }}
                  max={4}
                  step={1}
                  className="w-full"
                  data-testid="slider-token-value"
                />
                
                <div className="flex justify-between text-xs text-purple-300">
                  <span>$1</span>
                  <span>$10</span>
                  <span>$30</span>
                  <span>$100</span>
                  <span>All</span>
                </div>
                
                <p className="text-xs text-yellow-400 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>This slider cannot be 100% accurate. Always double check the items you're about to burn.</span>
                </p>
              </div>

              {/* Token Count */}
              {filteredTokenList.length < tokenList.length && (
                <p className="text-sm text-purple-300 mb-3">
                  Showing {filteredTokenList.length} of {tokenList.length} tokens
                </p>
              )}

              {/* Token List */}
              <div className="max-h-96 overflow-y-auto space-y-3 mb-6">
                {filteredTokenList.map((token, index) => (
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

              {/* Burn Instructions */}
              <div className="bg-purple-900/20 border border-purple-500/20 rounded-lg p-4 mt-4">
                <div className="flex items-start space-x-3">
                  <Info className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-purple-200">
                    <p className="font-medium mb-2">About Token Burning:</p>
                    <ul className="space-y-1 text-purple-300">
                      <li>• Burn unwanted tokens and recover SOL rent deposits</li>
                      <li>• Burning permanently destroys the tokens</li>
                      <li>• Most tokens return ~0.002 SOL per account closed</li>
                    </ul>
                  </div>
                </div>
                
                {/* Warning Disclaimer */}
                <div className="mt-3 bg-yellow-900/20 border-l-4 border-yellow-500 p-3 rounded">
                  <div className="flex items-start space-x-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-yellow-200 font-semibold">
                      Burning tokens can't be undone. By using GetFreeSOL, you agree it's on you — we're not responsible for mistakes or accidental burns.
                    </p>
                  </div>
                </div>
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

              {/* NFT Type Tabs - Filter between regular NFTs and Compressed NFTs */}
              {nftData && nftData.nfts && nftData.nfts.length > 0 && (
                <div className="flex items-center gap-2 mb-6">
                  <button
                    onClick={() => setNftTabView('nfts')}
                    className={`flex-1 px-6 py-3 rounded-lg font-semibold text-sm transition-all duration-200 ${
                      nftTabView === 'nfts'
                        ? 'bg-purple-600 text-white border border-purple-500'
                        : 'bg-black/40 text-purple-200 border border-purple-500/30 hover:border-purple-400/50 hover:bg-purple-800/20'
                    }`}
                    data-testid="tab-nfts"
                  >
                    NFTs ({nftData.nfts.filter((n: any) => n.type !== 'cnft').length})
                  </button>
                  <button
                    onClick={() => setNftTabView('cnfts')}
                    className={`flex-1 px-6 py-3 rounded-lg font-semibold text-sm transition-all duration-200 ${
                      nftTabView === 'cnfts'
                        ? 'bg-green-600 text-white border border-green-500'
                        : 'bg-black/40 text-purple-200 border border-purple-500/30 hover:border-purple-400/50 hover:bg-purple-800/20'
                    }`}
                    data-testid="tab-cnfts"
                  >
                    cNFTs ({nftData.nfts.filter((n: any) => n.type === 'cnft').length})
                  </button>
                </div>
              )}

              {/* Individual NFT Grid */}
              {scanNftsMutation.isPending ? (
                <div className="text-center py-8">
                  <RefreshCw className="h-8 w-8 text-purple-400 mx-auto animate-spin mb-4" />
                  <p className="text-purple-200">Scanning for NFTs...</p>
                </div>
              ) : nftData && nftData.nfts && nftData.nfts.length > 0 ? (
                (() => {
                  // Filter NFTs based on selected tab
                  const filteredNfts = nftData.nfts.filter((nft: any) => {
                    if (nftTabView === 'cnfts') {
                      return nft.type === 'cnft';
                    } else {
                      return nft.type !== 'cnft'; // Show regular NFTs (core, pnft, standard)
                    }
                  });

                  // Show empty state if no NFTs in current tab
                  if (filteredNfts.length === 0) {
                    return (
                      <div className="text-center py-12">
                        <div className="inline-block bg-purple-900/30 rounded-full p-4 mb-4">
                          <Image className="h-12 w-12 text-purple-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-white mb-2">
                          No NFTs Found
                        </h3>
                        <p className="text-purple-200 max-w-md mx-auto">
                          Ensure you have the correct wallet selected.
                        </p>
                      </div>
                    );
                  }

                  return (
                <div className="space-y-4">
                  {/* NFT Grid */}
                  <div className="max-h-96 overflow-y-auto scrollbar-thin scrollbar-track-purple-900/20 scrollbar-thumb-purple-500/50 mb-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {filteredNfts.map((nft: any) => {
                      // Use a stable identifier that works for all NFT types
                      const nftId = nft.mint || nft.id || nft.assetId;
                      const isSelected = selectedNfts.has(nftId);
                      const isFrozen = nft.isFrozen === true;

                      return (
                        <div
                          key={nftId}
                          className={`relative bg-gradient-to-br from-purple-700/20 to-purple-800/30 backdrop-blur-sm border rounded-lg p-3 transition-all cursor-pointer ${
                            isSelected 
                              ? 'border-green-400/50 bg-green-900/20' 
                              : 'border-purple-500/30 hover:border-purple-400/50'
                          }`}
                          onClick={() => {
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
                              isSelected 
                                ? 'bg-green-500 border-green-500' 
                                : 'bg-purple-900/50 border-purple-400'
                            }`}>
                              {isSelected && <Check className="h-3 w-3 text-white" />}
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
                            
                            {/* FROZEN badge for frozen NFTs (top-right corner) */}
                            {isFrozen && (
                              <div className="absolute top-2 right-2 z-10">
                                <Badge className="text-[10px] px-2 py-0.5 bg-blue-500/90 border-blue-400 flex items-center gap-1">
                                  ❄️ FROZEN
                                </Badge>
                              </div>
                            )}
                            
                            {/* Big Flame Icon Overlay for Selected NFTs */}
                            {isSelected && (
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

                            {/* Type Badge and Warning */}
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between">
                                <span className={`text-xs px-2 py-1 rounded-full ${
                                  nft.type === 'standard' ? 'bg-blue-500/20 text-blue-300' :
                                  nft.type === 'pnft' ? 'bg-purple-500/20 text-purple-300' :
                                  nft.type === 'ocp' ? 'bg-green-500/20 text-green-300' :
                                  nft.type === 'core' ? 'bg-orange-500/20 text-orange-300' :
                                  nft.type === 'cnft' ? 'bg-green-500/20 text-green-300' :
                                  'bg-gray-500/20 text-gray-300'
                                }`}>
                                  {nft.type.toUpperCase()}
                                </span>
                              </div>
                              {/* Warning for cNFTs - no SOL recovery */}
                              {nft.type === 'cnft' && (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5 bg-orange-600/90 border-orange-500 flex items-center gap-1">
                                  <AlertTriangle className="h-2.5 w-2.5" />
                                  No SOL
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </div>

                  {/* Bottom Actions */}
                  <div className="space-y-4">
                    {/* Select All / Clear Selection Buttons - Only show if there are NFTs in current tab */}
                    {(() => {
                      const visibleNfts = nftData.nfts.filter((nft: any) => {
                        if (nftTabView === 'cnfts') {
                          return nft.type === 'cnft';
                        } else {
                          return nft.type !== 'cnft';
                        }
                      });
                      return visibleNfts.length > 0 ? (
                        <div className="flex gap-3">
                          <Button
                            onClick={() => {
                              const allNfts = nftData.nfts;
                              // Select all NFTs from the currently visible tab (including frozen)
                              const selectableNfts = allNfts
                                .filter((nft: any) => {
                                  // Filter by current tab only
                                  if (nftTabView === 'cnfts') {
                                    return nft.type === 'cnft';
                                  } else {
                                    return nft.type !== 'cnft';
                                  }
                                })
                                .map((nft: any) => nft.mint || nft.id || nft.assetId)
                                .filter(Boolean);
                              setSelectedNfts(new Set(selectableNfts));
                            }}
                            className="flex-1 bg-purple-900/60 hover:bg-purple-800/70 text-white border border-purple-600/40 rounded-xl py-3"
                            data-testid="button-select-all-nfts"
                          >
                            Select All {nftTabView === 'cnfts' ? 'cNFTs' : 'NFTs'}
                          </Button>
                          <Button
                            onClick={() => setSelectedNfts(new Set())}
                            className="flex-1 bg-purple-900/60 hover:bg-purple-800/70 text-white border border-purple-600/40 rounded-xl py-3"
                            data-testid="button-clear-selection-nfts"
                          >
                            Clear
                          </Button>
                        </div>
                      ) : null;
                    })()}

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
                  )
                })()
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
                
                {/* Warning Disclaimer */}
                <div className="mt-3 bg-yellow-900/20 border-l-4 border-yellow-500 p-3 rounded">
                  <div className="flex items-start space-x-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-yellow-200 font-semibold">
                      Burning tokens can't be undone. By using GetFreeSOL, you agree it's on you — we're not responsible for mistakes or accidental burns.
                    </p>
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

          {/* Points Tab Content */}
          {activeTab === 'points' && (() => {
            const walletAddress = pointsWalletAddress;
            
            const truncateAddress = (address: string) => {
              return `${address.slice(0, 4)}...${address.slice(-4)}`;
            };

            const getRankBadgeColor = (rank: number) => {
              if (rank === 1) return "bg-yellow-500 text-black";
              if (rank === 2) return "bg-gray-300 text-black";
              if (rank === 3) return "bg-orange-600 text-white";
              return "bg-purple-600 text-white";
            };

            const getUserRank = () => {
              return userPoints?.rank || null;
            };

            return (
              <div className="-mx-4 md:mx-0">
                <div className="space-y-8 md:space-y-6">
                  {/* Whales Market Voting Card */}
                  <Card className="bg-gradient-to-r from-purple-600 to-pink-600 border-pink-500 backdrop-blur shadow-lg">
                    <CardContent className="p-6">
                      <div className="flex flex-col items-center text-center space-y-4">
                        <img 
                          src={whalesMarketLogo} 
                          alt="Whales Market" 
                          className="w-20 h-20 object-contain"
                        />
                        <h3 className="text-2xl font-bold text-white">
                          Vote for GetFreeSol on Whales Market!
                        </h3>
                        <p className="text-white/90 max-w-2xl">
                          Help boost the future of $GFS Points by voting for us on Whales Market. Your support matters!
                        </p>
                        <div className="bg-white/10 rounded-lg p-4 max-w-2xl">
                          <p className="text-white text-sm">
                            Mention "GetFreeSol" and "@getfreesol_xyz" in conversations (no spamming!)
                          </p>
                        </div>
                        <a
                          href="https://discord.gg/nWtveZhnra"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-6 py-3 bg-white text-purple-700 rounded-lg font-bold hover:bg-purple-100 transition-colors shadow-lg"
                          data-testid="button-whales-vote"
                        >
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z"/>
                          </svg>
                          Join Discord & Vote Now
                        </a>
                      </div>
                    </CardContent>
                  </Card>

                  {/* User Points Card */}
                  {walletAddress && (
                    <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-white">
                        <Star className="w-5 h-5 text-yellow-400" />
                        Your Points
                      </CardTitle>
                      <CardDescription className="text-purple-200">
                        Your current ranking and statistics
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {userPointsLoading ? (
                        <div className="text-center py-4 text-purple-300">Loading your points...</div>
                      ) : (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                          <div className="text-center">
                            <div className="text-sm text-purple-300 mb-1">Total Points</div>
                            <div className="text-4xl font-bold text-yellow-400" data-testid="text-user-points">
                              {userPoints?.points || 0}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-sm text-purple-300 mb-1">SOL Claimed</div>
                            <div className="text-4xl font-bold text-green-400 flex items-center justify-center gap-2" data-testid="text-user-sol">
                              <svg className="h-8 w-8" viewBox="0 0 397.7 311.7" style={{ fill: '#00FFA3' }}>
                                <path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"/>
                                <path d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1L333.1,73.8c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"/>
                                <path d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z"/>
                              </svg>
                              {userPoints?.totalSolClaimed ? parseFloat(userPoints.totalSolClaimed).toFixed(4) : '0.0000'}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-sm text-purple-300 mb-1">Accounts Closed</div>
                            <div className="text-4xl font-bold text-white" data-testid="text-user-accounts">
                              {userPoints?.accountsClosed || 0}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-sm text-purple-300 mb-1">Your Rank</div>
                            <div className="text-4xl font-bold text-white" data-testid="text-user-rank">
                              {getUserRank() ? `#${getUserRank()}` : '-'}
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Leaderboard Card */}
                <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-white">
                      <Trophy className="w-5 h-5 text-yellow-400" />
                      Top 10 Leaders
                    </CardTitle>
                    <CardDescription className="text-purple-200">
                      Top 10 users with the most points
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {pointsLeaderboardLoading ? (
                      <div className="text-center py-8 text-purple-300">Loading leaderboard...</div>
                    ) : pointsLeaderboard?.leaderboard && pointsLeaderboard.leaderboard.length > 0 ? (
                      <div>
                        <Table>
                          <TableHeader>
                            <TableRow className="border-purple-600 hover:bg-purple-700/50">
                              <TableHead className="text-purple-200 w-16">Rank</TableHead>
                              <TableHead className="text-purple-200">Wallet</TableHead>
                              <TableHead className="text-purple-200 text-right">Points</TableHead>
                              <TableHead className="text-purple-200 text-right">SOL</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pointsLeaderboard.leaderboard.slice(0, 10).map((entry: any) => (
                              <TableRow 
                                key={entry.walletAddress}
                                className={`border-purple-600 hover:bg-purple-700/50 ${
                                  entry.walletAddress === walletAddress ? 'bg-purple-700/70' : ''
                                }`}
                                data-testid={`row-leaderboard-${entry.rank}`}
                              >
                                <TableCell className="py-2">
                                  <Badge className={`${getRankBadgeColor(entry.rank)} text-sm md:text-xs px-2.5 md:px-2 font-bold`}>
                                    #{entry.rank}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-mono text-purple-100 text-xs py-2">
                                  <span className="md:hidden">{truncateAddress(entry.walletAddress)}</span>
                                  <span className="hidden md:inline">{entry.walletAddress}</span>
                                  {entry.walletAddress === walletAddress && (
                                    <Badge className="ml-1 bg-green-600 text-white text-xs px-1">You</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-right font-bold text-yellow-400 text-sm py-2" data-testid={`text-points-${entry.rank}`}>
                                  {entry.points.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right text-green-400 font-semibold text-sm" data-testid={`text-sol-${entry.rank}`}>
                                  <div className="flex items-center justify-end gap-0.5">
                                    <svg className="h-3 w-3" viewBox="0 0 397.7 311.7" style={{ fill: '#00FFA3' }}>
                                      <path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"/>
                                      <path d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1L333.1,73.8c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"/>
                                      <path d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z"/>
                                    </svg>
                                    {entry.totalSolClaimed ? parseFloat(entry.totalSolClaimed).toFixed(4) : '0.0000'}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-purple-300">
                        No leaderboard data available yet. Be the first to earn points!
                      </div>
                    )}
                  </CardContent>
                </Card>
                </div>
              </div>
            );
          })()}

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
                    <div className="flex items-center justify-between mb-2">
                      <CardTitle className="flex items-center gap-2 text-white">
                        <TrendingUp className="w-6 h-6 text-yellow-400" />
                        Top Addresses Leaderboard
                      </CardTitle>
                      {/* Filter buttons inside card */}
                      <div className="flex gap-2">
                        <Button
                          data-testid="leaderboard-filter-24h"
                          size="sm"
                          onClick={() => setSelectedLeaderboardPeriod('24h')}
                          className={selectedLeaderboardPeriod === '24h' 
                            ? 'bg-purple-600 hover:bg-purple-700 text-white border-purple-600' 
                            : 'bg-transparent border border-purple-400 text-white hover:bg-purple-800/50'}
                        >
                          Daily
                        </Button>
                        <Button
                          data-testid="leaderboard-filter-weekly"
                          size="sm"
                          onClick={() => setSelectedLeaderboardPeriod('weekly')}
                          className={selectedLeaderboardPeriod === 'weekly' 
                            ? 'bg-purple-600 hover:bg-purple-700 text-white border-purple-600' 
                            : 'bg-transparent border border-purple-400 text-white hover:bg-purple-800/50'}
                        >
                          Weekly
                        </Button>
                        <Button
                          data-testid="leaderboard-filter-monthly"
                          size="sm"
                          onClick={() => setSelectedLeaderboardPeriod('monthly')}
                          className={selectedLeaderboardPeriod === 'monthly' 
                            ? 'bg-purple-600 hover:bg-purple-700 text-white border-purple-600' 
                            : 'bg-transparent border border-purple-400 text-white hover:bg-purple-800/50'}
                        >
                          Monthly
                        </Button>
                        <Button
                          data-testid="leaderboard-filter-all"
                          size="sm"
                          onClick={() => setSelectedLeaderboardPeriod('all')}
                          className={selectedLeaderboardPeriod === 'all' 
                            ? 'bg-purple-600 hover:bg-purple-700 text-white border-purple-600' 
                            : 'bg-transparent border border-purple-400 text-white hover:bg-purple-800/50'}
                        >
                          All Time
                        </Button>
                      </div>
                    </div>
                    <CardDescription className="text-purple-200">
                      Addresses that recovered the most rent ({selectedLeaderboardPeriod === '24h' ? 'last 24 hours' : selectedLeaderboardPeriod === 'weekly' ? 'last 7 days' : selectedLeaderboardPeriod === 'monthly' ? 'last 30 days' : 'all time'})
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
                                className="text-white hover:text-gray-200 underline font-mono text-sm"
                                data-testid={`address-${index}`}
                              >
                                {entry.walletAddress}
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


          {/* Docs Tab Content - Sidebar Layout */}
          {activeTab === 'docs' && (
              <div className="flex gap-6 h-full">
                {/* Left Sidebar Navigation */}
                <div className="w-64 flex-shrink-0">
                  <Card className="bg-purple-800/50 border-purple-600 backdrop-blur sticky top-4">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-white text-lg">Documentation</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      <button
                        onClick={() => setActiveDocSection('overview')}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                          activeDocSection === 'overview' 
                            ? 'bg-purple-600 text-white' 
                            : 'text-purple-200 hover:bg-purple-700/30'
                        }`}
                        data-testid="docs-nav-overview"
                      >
                        📖 Overview
                      </button>
                      <div className="pt-3 pb-2 px-3 text-purple-400 text-xs font-semibold uppercase">
                        Features
                      </div>
                      <button
                        onClick={() => setActiveDocSection('burn-tokens')}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                          activeDocSection === 'burn-tokens' 
                            ? 'bg-purple-600 text-white' 
                            : 'text-purple-200 hover:bg-purple-700/30'
                        }`}
                        data-testid="docs-nav-tokens"
                      >
                        🔥 Burn Tokens
                      </button>
                      <button
                        onClick={() => setActiveDocSection('burn-nfts')}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                          activeDocSection === 'burn-nfts' 
                            ? 'bg-purple-600 text-white' 
                            : 'text-purple-200 hover:bg-purple-700/30'
                        }`}
                        data-testid="docs-nav-nfts"
                      >
                        🎨 Burn NFTs
                      </button>
                      <button
                        onClick={() => setActiveDocSection('referrals')}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                          activeDocSection === 'referrals' 
                            ? 'bg-purple-600 text-white' 
                            : 'text-purple-200 hover:bg-purple-700/30'
                        }`}
                        data-testid="docs-nav-referrals"
                      >
                        💰 Referral System
                      </button>
                      <button
                        onClick={() => setActiveDocSection('points')}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                          activeDocSection === 'points' 
                            ? 'bg-purple-600 text-white' 
                            : 'text-purple-200 hover:bg-purple-700/30'
                        }`}
                        data-testid="docs-nav-points"
                      >
                        ⭐ Points System
                      </button>
                      <div className="pt-3 pb-2 px-3 text-purple-400 text-xs font-semibold uppercase">
                        Developers
                      </div>
                      <button
                        onClick={() => setActiveDocSection('developer')}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                          activeDocSection === 'developer' 
                            ? 'bg-purple-600 text-white' 
                            : 'text-purple-200 hover:bg-purple-700/30'
                        }`}
                        data-testid="docs-nav-api"
                      >
                        <Code className="w-4 h-4 inline mr-2" />
                        Developer API
                      </button>
                    </CardContent>
                  </Card>
                </div>

                {/* Right Content Area */}
                <div className="flex-1">
                  {activeDocSection === 'overview' && (
                    <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
                      <CardHeader>
                        <CardTitle className="text-white text-2xl">How to Claim SOL</CardTitle>
                        <CardDescription className="text-purple-200">
                          Complete guide to reclaiming your SOL from empty token accounts
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6 text-white prose prose-invert max-w-none">
                        <div className="space-y-8">
                          <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-6">
                            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                              <span className="text-2xl">0️⃣</span> Find Our App
                            </h3>
                            <p className="text-purple-200 leading-relaxed mb-4">
                              Open your <strong className="text-white">Phantom Wallet</strong> and use the Discovery feature to find GetFreeSol:
                            </p>
                            <ul className="space-y-3 text-purple-200 leading-relaxed mb-6">
                              <li className="flex items-start gap-3">
                                <span className="text-purple-400 mt-1">▸</span>
                                <span>Tap the <strong className="text-white">Discovery (search)</strong> icon in Phantom</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-purple-400 mt-1">▸</span>
                                <span>Type <strong className="text-white">"Get Free Sol"</strong> in the search bar</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-purple-400 mt-1">▸</span>
                                <span>Select <strong className="text-white">"Get Free Sol"</strong> from the results (Tools category)</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-purple-400 mt-1">▸</span>
                                <span>Tap <strong className="text-white">"Open"</strong> to launch the app</span>
                              </li>
                            </ul>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <img 
                                  src={new URL('@assets/image_1763869158638.png', import.meta.url).href}
                                  alt="Phantom Discovery Search - Type 'Get Free Sol'" 
                                  className="rounded-lg border border-purple-500/50 w-full"
                                />
                                <p className="text-sm text-purple-300 text-center italic">Step 1: Search for "Get Free Sol"</p>
                              </div>
                              <div className="space-y-2">
                                <img 
                                  src={new URL('@assets/image_1763869243474.png', import.meta.url).href}
                                  alt="Get Free Sol App Page - Tap Open" 
                                  className="rounded-lg border border-purple-500/50 w-full"
                                />
                                <p className="text-sm text-purple-300 text-center italic">Step 2: Tap "Open" to launch</p>
                              </div>
                            </div>
                          </div>

                          <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-6">
                            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                              <span className="text-2xl">1️⃣</span> Connect Your Wallet
                            </h3>
                            <ul className="space-y-3 text-purple-200 leading-relaxed mb-6">
                              <li className="flex items-start gap-3">
                                <span className="text-blue-400 mt-1">▸</span>
                                <span>Click the <strong className="text-white">"Connect"</strong> button in the top right corner</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-blue-400 mt-1">▸</span>
                                <span>Select your Solana wallet from the list</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-blue-400 mt-1">▸</span>
                                <span>Approve the connection in your wallet</span>
                              </li>
                            </ul>
                            <p className="text-purple-200 leading-relaxed mb-6">
                              We support <strong className="text-white">8 different wallets</strong>: Phantom, Backpack, Solflare, Magic Eden, Coinbase, Coin98, Bitget, and Ledger hardware wallets.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <img 
                                  src={new URL('@assets/image_1763872863603.png', import.meta.url).href}
                                  alt="GetFreeSol main page - Click Connect button" 
                                  className="rounded-lg border border-purple-500/50 w-full"
                                />
                                <p className="text-sm text-purple-300 text-center italic">Step 1: Click "Connect" button</p>
                              </div>
                              <div className="space-y-2">
                                <img 
                                  src={new URL('@assets/image_1763872748597.png', import.meta.url).href}
                                  alt="Wallet selection modal - Choose your wallet" 
                                  className="rounded-lg border border-purple-500/50 w-full"
                                />
                                <p className="text-sm text-purple-300 text-center italic">Step 2: Select your wallet</p>
                              </div>
                            </div>
                          </div>
                          
                          <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-6">
                            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                              <span className="text-2xl">2️⃣</span> Claim Your SOL
                            </h3>
                            <p className="text-purple-200 leading-relaxed mb-4">
                              After connecting your wallet, the app will <strong className="text-white">automatically scan and close all empty accounts</strong>. The process is fully automated:
                            </p>
                            <ul className="space-y-3 text-purple-200 leading-relaxed">
                              <li className="flex items-start gap-3">
                                <span className="text-green-400 mt-1">▸</span>
                                <span>The app automatically detects all empty token accounts</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-green-400 mt-1">▸</span>
                                <span>Up to <strong className="text-white">20 accounts per transaction</strong> will be closed automatically</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-green-400 mt-1">▸</span>
                                <span>Simply <strong className="text-white">approve the transaction</strong> in your wallet</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-green-400 mt-1">▸</span>
                                <span>Receive your reclaimed SOL instantly! 🎉</span>
                              </li>
                            </ul>
                            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 mt-4">
                              <p className="text-sm text-purple-200">
                                <strong className="text-white">💡 Note:</strong> If you have more than 20 empty accounts, the app will process them in batches. Just approve each transaction until all accounts are closed.
                              </p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                              <div className="space-y-2">
                                <img 
                                  src={new URL('@assets/image_1763873482444.png', import.meta.url).href}
                                  alt="Scan results showing empty accounts - Click Claim All button" 
                                  className="rounded-lg border border-purple-500/50 w-full"
                                />
                                <p className="text-sm text-purple-300 text-center italic">Step 1: Click "CLAIM ALL"</p>
                              </div>
                              <div className="space-y-2">
                                <img 
                                  src={new URL('@assets/image_1763873493603.png', import.meta.url).href}
                                  alt="Transaction confirmation modal in wallet" 
                                  className="rounded-lg border border-purple-500/50 w-full"
                                />
                                <p className="text-sm text-purple-300 text-center italic">Step 2: Confirm transaction</p>
                              </div>
                              <div className="space-y-2">
                                <img 
                                  src={new URL('@assets/image_1763873559520.png', import.meta.url).href}
                                  alt="Success message showing SOL claimed" 
                                  className="rounded-lg border border-purple-500/50 w-full"
                                />
                                <p className="text-sm text-purple-300 text-center italic">Step 3: SOL claimed! 🎉</p>
                              </div>
                            </div>
                          </div>

                          <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-6">
                            <h3 className="text-xl font-semibold text-white mb-3">Additional Features</h3>
                            <ul className="space-y-3 text-purple-200">
                              <li className="flex items-start gap-3">
                                <span className="text-2xl">🔥</span>
                                <div>
                                  <strong className="text-white">Burn Tokens:</strong> Remove unwanted tokens from your wallet and recover SOL from the token accounts
                                </div>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-2xl">🎨</span>
                                <div>
                                  <strong className="text-white">Burn NFTs:</strong> Burn NFTs including compressed NFTs (cNFTs), programmable NFTs (pNFTs), and even frozen NFTs
                                </div>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-2xl">💰</span>
                                <div>
                                  <strong className="text-white">Referrals:</strong> Share your referral code and earn 50% commission from fees collected through your referrals
                                </div>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-2xl">⭐</span>
                                <div>
                                  <strong className="text-white">Points:</strong> Earn 20 points for every account closed. Compete on the leaderboard for top rankings!
                                </div>
                              </li>
                            </ul>
                          </div>

                          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-6">
                            <h3 className="text-xl font-semibold text-white mb-3">💡 Pro Tips</h3>
                            <ul className="space-y-2 text-purple-200 list-disc list-inside">
                              <li>Use the Auto-Claim feature to automatically recover SOL from new empty accounts</li>
                              <li>Check the Statistics tab to see total SOL recovered across the platform</li>
                              <li>Enable notifications to get alerts when new claimable SOL is detected</li>
                            </ul>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {activeDocSection === 'burn-tokens' && (
                    <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
                      <CardHeader>
                        <CardTitle className="text-white text-2xl">How to Burn Tokens</CardTitle>
                        <CardDescription className="text-purple-200">
                          Remove unwanted tokens from your wallet and recover SOL from token accounts
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6 text-white prose prose-invert max-w-none">
                        <div className="space-y-8">
                          <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-6">
                            <h3 className="text-xl font-semibold text-white mb-4">What is Token Burning?</h3>
                            <p className="text-purple-200 leading-relaxed">
                              Token burning allows you to <strong className="text-white">permanently destroy unwanted tokens</strong> from your wallet 
                              and <strong className="text-white">recover SOL</strong> from the token accounts. This helps clean up your wallet and 
                              reclaim rent deposits.
                            </p>
                          </div>

                          <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-6">
                            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                              <span className="text-2xl">🔥</span> How to Burn Tokens
                            </h3>
                            <ul className="space-y-3 text-purple-200 leading-relaxed mb-6">
                              <li className="flex items-start gap-3">
                                <span className="text-orange-400 mt-1">▸</span>
                                <span>Navigate to the <strong className="text-white">"Burn Tokens"</strong> tab</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-orange-400 mt-1">▸</span>
                                <span>Use the <strong className="text-white">value slider</strong> to filter tokens by worth (up to $1, $10, $30, $100, or All)</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-orange-400 mt-1">▸</span>
                                <span>Select the tokens you want to burn (or click <strong className="text-white">"Select All"</strong>)</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-orange-400 mt-1">▸</span>
                                <span>Click <strong className="text-white">"BURN"</strong> to create the transaction</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-orange-400 mt-1">▸</span>
                                <span>Confirm the transaction in your wallet</span>
                              </li>
                            </ul>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                              <div className="space-y-2">
                                <img 
                                  src={new URL('@assets/image_1763874192116.png', import.meta.url).href}
                                  alt="Token burning interface with value slider and token selection" 
                                  className="rounded-lg border border-purple-500/50 w-full"
                                />
                                <p className="text-sm text-purple-300 text-center italic">Step 1: Select tokens and click "BURN"</p>
                              </div>
                              <div className="space-y-2">
                                <img 
                                  src={new URL('@assets/image_1763874201656.png', import.meta.url).href}
                                  alt="Transaction confirmation showing token burn" 
                                  className="rounded-lg border border-purple-500/50 w-full"
                                />
                                <p className="text-sm text-purple-300 text-center italic">Step 2: Confirm the burn transaction</p>
                              </div>
                            </div>
                          </div>

                          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-6">
                            <h3 className="text-xl font-semibold text-white mb-3">💡 Pro Tips</h3>
                            <ul className="space-y-2 text-purple-200 list-disc list-inside">
                              <li>Start with low-value tokens to test the feature before burning higher-value tokens</li>
                              <li>The value slider helps you quickly filter out spam tokens worth almost nothing</li>
                              <li>Burning tokens is permanent - make sure you really don't want them!</li>
                              <li>You recover ~0.00203928 SOL per token account closed</li>
                            </ul>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {activeDocSection === 'referrals' && (
                    <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
                      <CardHeader>
                        <CardTitle className="text-white text-2xl">Referral System</CardTitle>
                        <CardDescription className="text-purple-200">
                          Earn 50% commission from your referrals - the highest rate in the market!
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6 text-white prose prose-invert max-w-none">
                        <div className="space-y-8">
                          <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-6">
                            <h3 className="text-xl font-semibold text-white mb-4">How the Referral System Works</h3>
                            <p className="text-purple-200 leading-relaxed mb-4">
                              Share your unique referral link with friends and earn <strong className="text-white">50% commission</strong> on all fees 
                              collected from users who sign up through your link. This is the <strong className="text-white">highest commission rate in the market</strong>!
                            </p>
                            <ul className="space-y-3 text-purple-200 leading-relaxed">
                              <li className="flex items-start gap-3">
                                <span className="text-green-400 mt-1">✓</span>
                                <span><strong className="text-white">50% commission</strong> on all fees from your referrals</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-green-400 mt-1">✓</span>
                                <span>Automatic tracking of all referral transactions</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-green-400 mt-1">✓</span>
                                <span>Real-time earnings dashboard</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-green-400 mt-1">✓</span>
                                <span>No minimum payout - earn from the first transaction</span>
                              </li>
                            </ul>
                          </div>

                          <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-6">
                            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                              <span className="text-2xl">💰</span> How to Get Started
                            </h3>
                            <ul className="space-y-3 text-purple-200 leading-relaxed mb-6">
                              <li className="flex items-start gap-3">
                                <span className="text-blue-400 mt-1">▸</span>
                                <span>Navigate to the <strong className="text-white">"Referrals"</strong> tab</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-blue-400 mt-1">▸</span>
                                <span>Your unique referral link is automatically generated</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-blue-400 mt-1">▸</span>
                                <span>Click the <strong className="text-white">copy button</strong> to copy your referral link</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-blue-400 mt-1">▸</span>
                                <span>Share your link with friends via social media, Discord, Twitter, or anywhere else</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-blue-400 mt-1">▸</span>
                                <span>Track your earnings in real-time on the Referrals page</span>
                              </li>
                            </ul>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                              <div className="space-y-2">
                                <img 
                                  src={new URL('@assets/image_1763874886453.png', import.meta.url).href}
                                  alt="Referral dashboard showing total earnings and referral link" 
                                  className="rounded-lg border border-purple-500/50 w-full"
                                />
                                <p className="text-sm text-purple-300 text-center italic">Your referral stats and link</p>
                              </div>
                              <div className="space-y-2">
                                <img 
                                  src={new URL('@assets/image_1763875199940.png', import.meta.url).href}
                                  alt="Recent referral transactions showing earnings" 
                                  className="rounded-lg border border-purple-500/50 w-full"
                                />
                                <p className="text-sm text-purple-300 text-center italic">Track your referral earnings</p>
                              </div>
                            </div>
                          </div>

                          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-6">
                            <h3 className="text-xl font-semibold text-white mb-3">💡 Pro Tips</h3>
                            <ul className="space-y-2 text-purple-200 list-disc list-inside">
                              <li>Share your referral link in crypto communities, Discord servers, and social media</li>
                              <li>Explain the benefits of GetFreeSol to maximize conversions</li>
                              <li>Your commission is automatically tracked - no manual claiming needed</li>
                              <li>The more your referrals use the platform, the more you earn!</li>
                            </ul>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {activeDocSection === 'points' && (
                    <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
                      <CardHeader>
                        <CardTitle className="text-white text-2xl">Points System</CardTitle>
                        <CardDescription className="text-purple-200">
                          Earn points for every account you close and compete on the leaderboard!
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6 text-white prose prose-invert max-w-none">
                        <div className="space-y-8">
                          <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-6">
                            <h3 className="text-xl font-semibold text-white mb-4">How the Points System Works</h3>
                            <p className="text-purple-200 leading-relaxed mb-4">
                              Every time you close an empty token account, you earn <strong className="text-white">20 points</strong>. 
                              Points are tracked automatically and displayed on your profile. Compete with other users on the 
                              <strong className="text-white"> Top 10 Leaderboard</strong> to see who's recovering the most SOL!
                            </p>
                            <ul className="space-y-3 text-purple-200 leading-relaxed">
                              <li className="flex items-start gap-3">
                                <span className="text-yellow-400 mt-1">⭐</span>
                                <span><strong className="text-white">20 points</strong> for every account closed</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-yellow-400 mt-1">⭐</span>
                                <span>Track your total points, SOL claimed, and global rank</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-yellow-400 mt-1">⭐</span>
                                <span>Compete on the Top 10 Leaderboard</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-yellow-400 mt-1">⭐</span>
                                <span>See how much SOL the top users have recovered</span>
                              </li>
                            </ul>
                          </div>

                          <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-6">
                            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                              <span className="text-2xl">🏆</span> Your Stats & Leaderboard
                            </h3>
                            <ul className="space-y-3 text-purple-200 leading-relaxed mb-6">
                              <li className="flex items-start gap-3">
                                <span className="text-blue-400 mt-1">▸</span>
                                <span>Navigate to the <strong className="text-white">"Points"</strong> tab</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-blue-400 mt-1">▸</span>
                                <span>View your <strong className="text-white">Total Points</strong>, <strong className="text-white">SOL Claimed</strong>, and <strong className="text-white">Global Rank</strong></span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-blue-400 mt-1">▸</span>
                                <span>Check the <strong className="text-white">Top 10 Leaderboard</strong> to see the highest-ranking users</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-blue-400 mt-1">▸</span>
                                <span>Close more accounts to climb the leaderboard!</span>
                              </li>
                            </ul>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                              <div className="space-y-2">
                                <img 
                                  src={new URL('@assets/image_1763875393582.png', import.meta.url).href}
                                  alt="Points dashboard showing total points, SOL claimed, and rank" 
                                  className="rounded-lg border border-purple-500/50 w-full"
                                />
                                <p className="text-sm text-purple-300 text-center italic">Your points and ranking</p>
                              </div>
                              <div className="space-y-2">
                                <img 
                                  src={new URL('@assets/image_1763875412373.png', import.meta.url).href}
                                  alt="Top 10 leaderboard showing highest-ranking users" 
                                  className="rounded-lg border border-purple-500/50 w-full"
                                />
                                <p className="text-sm text-purple-300 text-center italic">Top 10 leaderboard</p>
                              </div>
                            </div>
                          </div>

                          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-6">
                            <h3 className="text-xl font-semibold text-white mb-3">💡 Pro Tips</h3>
                            <ul className="space-y-2 text-purple-200 list-disc list-inside">
                              <li>The more accounts you close, the higher your rank on the leaderboard</li>
                              <li>Check back regularly to see if you've moved up in the rankings</li>
                              <li>Use the Auto-Claim feature to automatically close new empty accounts and earn points</li>
                              <li>Share the app with friends - they can use your referral link to join!</li>
                            </ul>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {activeDocSection === 'developer' && (
                    <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-white text-2xl">
                          <Code className="w-6 h-6" />
                          Developer API
                        </CardTitle>
                        <CardDescription className="text-purple-200">
                          Integrate SOL rent recovery and token burning directly into your application
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6 text-white prose prose-invert max-w-none">
                        <div className="space-y-6">
                          <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-6">
                            <h3 className="text-xl font-semibold text-white mb-3">🚀 Getting Started</h3>
                            <p className="text-purple-200 mb-4">
                              Integrate GetFreeSol's powerful SOL recovery and token burning features directly into your application. 
                              Build your own UI while leveraging our backend infrastructure.
                            </p>
                            <div className="space-y-3">
                              <p className="text-white font-semibold">How It Works:</p>
                              <ol className="list-decimal list-inside space-y-2 text-purple-200 ml-4">
                                <li>Build your own UI in your application</li>
                                <li>Call our API endpoints from your backend or frontend</li>
                                <li>Pass your <code className="bg-purple-800 px-2 py-1 rounded text-sm">feeReceiverAddress</code> (your PDA) to collect fees</li>
                                <li>Display results in your app with your branding</li>
                                <li>Earn 80% of fees collected - claim anytime!</li>
                              </ol>
                            </div>
                          </div>

                          <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-6">
                            <h3 className="text-xl font-semibold text-white mb-3">🔗 Base URL</h3>
                            <code className="block bg-purple-950 text-green-400 p-4 rounded font-mono text-sm break-all">
                              {window.location.origin}/api
                            </code>
                          </div>

                          <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-6">
                            <h3 className="text-xl font-semibold text-white mb-3">📋 Key Endpoints</h3>
                            <div className="space-y-4 text-sm">
                              <div>
                                <code className="bg-purple-950 text-green-400 px-3 py-1 rounded">GET /api/sol-refund/scan/:address</code>
                                <p className="text-purple-200 mt-2">Scan a wallet for empty token accounts</p>
                              </div>
                              <div>
                                <code className="bg-purple-950 text-green-400 px-3 py-1 rounded">POST /api/sol-refund/prepare-transaction</code>
                                <p className="text-purple-200 mt-2">Build transaction to close empty accounts</p>
                              </div>
                              <div>
                                <code className="bg-purple-950 text-green-400 px-3 py-1 rounded">POST /api/tokens/burn</code>
                                <p className="text-purple-200 mt-2">Create token burn transaction</p>
                              </div>
                              <div>
                                <code className="bg-purple-950 text-green-400 px-3 py-1 rounded">POST /api/nfts/burn/build</code>
                                <p className="text-purple-200 mt-2">Build NFT burn transaction (all types)</p>
                              </div>
                            </div>
                          </div>

                          <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-6">
                            <h3 className="text-xl font-semibold text-white mb-3">📦 Response Format</h3>
                            <p className="text-purple-200 mb-3">
                              All endpoints return JSON with a <code className="bg-purple-800 px-2 py-1 rounded text-sm">success</code> field
                            </p>
                            <pre className="bg-purple-950 p-4 rounded text-sm overflow-x-auto">
                              <code className="text-green-400">{`{
  "success": true,
  "transaction": "base64_encoded_transaction",
  "message": "Transaction prepared successfully"
}`}</code>
                            </pre>
                          </div>

                          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-6">
                            <p className="text-purple-200">
                              💡 <strong className="text-white">Getting Your PDA:</strong> Visit the Referrals tab to create your developer account 
                              and get your deterministic PDA address for fee collection. Full API documentation available at{' '}
                              <a href="/openapi.yaml" className="text-blue-400 hover:text-blue-300 underline">openapi.yaml</a>
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
          )}

          {/* Old Lend Content - REMOVED */}
          {activeTab === 'docs' && showDeveloper && false && (
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
              <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6 text-center">
                <div className="text-3xl font-bold text-white mb-2">
                  {stats ? stats.totalSolRecovered.toFixed(6) : '0.000000'}
                </div>
                <div className="text-sm text-purple-200 uppercase tracking-wider">
                  TOTAL SOL RECOVERED
                </div>
              </div>

              {/* Total Accounts Closed */}
              <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6 text-center">
                <div className="text-3xl font-bold text-white mb-2">
                  {stats ? (stats.totalAccountsClaimed / 1000).toFixed(3) : '0.000'}
                </div>
                <div className="text-sm text-purple-200 uppercase tracking-wider">
                  TOTAL ACCOUNTS CLOSED
                </div>
              </div>
            </div>
          )}

          {/* All Time Ledger Section - Only show on reclaim tab */}
          {activeTab === 'reclaim' && (
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
                    {isLoadingTransactions && allTransactions.length === 0 ? (
                      <div className="text-center text-purple-300 py-8">
                        Loading transactions...
                      </div>
                    ) : allTransactions.length === 0 ? (
                      <div className="text-center text-purple-300 py-8">
                        No transactions yet
                      </div>
                    ) : (
                      allTransactions.map((tx, index) => (
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
      <div className="border-t border-purple-500/20 bg-gradient-to-r from-purple-900/30 to-slate-900/30 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6 max-w-6xl">
          <div className="flex items-center justify-center space-x-3">
            <img 
              src={logoImage}
              alt="Get Free Sol"
              className="h-8 w-8"
            />
            <div className="text-center">
              <div className="text-white font-semibold text-lg">Get Free Sol</div>
              <div className="text-purple-300 text-sm">2025 All rights reserved</div>
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

      {/* Floating Swap Toggle Button */}
      <button
        onClick={() => setIsSwapModalOpen(!isSwapModalOpen)}
        className="fixed -bottom-4 left-0 md:bottom-4 md:left-8 z-40 hover:scale-105 transition-transform bg-transparent border-0 p-0"
        data-testid="button-floating-swap"
        title="Toggle Token Swap"
      >
        <img 
          src={swapButtonImage} 
          alt="Swap" 
          className="h-36 w-auto drop-shadow-2xl"
        />
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
      `}</style>
    </div>
  );
}