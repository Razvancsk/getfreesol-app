import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { triggerFeedbackCard } from "@/components/FeedbackWidget";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import bs58 from "bs58";
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
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Coins, Wallet, Search, CheckCircle, ExternalLink, AlertTriangle, RefreshCw, Flame, Image, Trash2, ArrowLeftRight, ArrowRightLeft, Copy, Share2, Users, User, TrendingUp, DollarSign, Globe, ChevronDown, Code, Shield, Cpu, TreePine, Info, Check, Plane, Zap, X, Trophy, Star, Award, ArrowLeft, Gift, Clock, PartyPopper, BarChart3, Layers, BookOpen, HelpCircle } from "lucide-react";
import { SiX, SiDiscord, SiTelegram } from 'react-icons/si';
import { Confetti } from '@/components/Confetti';
import GsolRateHistoryCard from '@/components/GsolRateHistoryCard';
import { FaSackDollar } from 'react-icons/fa6';
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
import { VersionedTransaction, Connection, PublicKey, Transaction } from '@solana/web3.js';
import { useAppKit } from "@reown/appkit/react";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import { SwapModal } from '@/components/SwapModal';
import { SwapPanel } from '@/components/SwapPanel';
import { ShareModal } from '@/components/ShareModal';
import { LendPositions } from '@/components/LendPositions';
import { CoinFlipGame } from '@/components/CoinFlipGame';
import logoImage from '@assets/image_1757882056840.png';
import footerLogo from '@assets/logo-ELKtyS9R_1776448181410.png';
import greenCandleBanner from '@assets/resizeplus_5cb60dea-180d-454a-86fd-c1035242cd90_(1)_1774229059979.png';
import tokenLogo from '@assets/image_1757882056840_1772656509435.png';
import gfsBanner from '@assets/image_1772667495108.png';
import ApiDocs from './api-docs';
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

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff} sec ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)} day ago`;
}

export default function SolRefund() {
  const queryClient = useQueryClient();
  const { open } = useAppKit();
  const isMobile = useIsMobile();
  
  // Note: UMI will be created inside the burn handler to avoid initialization errors
  
  const autoScanRef = useRef(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'referrals' | 'reclaim' | 'burnTokens' | 'swap' | 'dex' | 'statistics' | 'docs' | 'coinflip' | 'staking'>('reclaim');
  const [claimSubTab, setClaimSubTab] = useState<'empty' | 'programs'>('empty');
  const [showDeveloper, setShowDeveloper] = useState(false);
  const [showDevAccountModal, setShowDevAccountModal] = useState(false);
  const [devProjectName, setDevProjectName] = useState('');
  const [selectedLeaderboardPeriod, setSelectedLeaderboardPeriod] = useState<'24h' | 'weekly' | 'monthly' | 'all'>('all');
  const [activeDocSection, setActiveDocSection] = useState<'overview' | 'burn-tokens' | 'burn-nfts' | 'referrals' | 'developer-api'>('overview');
  const [burnSubTab, setBurnSubTab] = useState<'tokens' | 'nft'>('tokens');
  const [mobileWalletMenuOpen, setMobileWalletMenuOpen] = useState(false);
  const [desktopWalletMenuOpen, setDesktopWalletMenuOpen] = useState(false);
  const [stakeMode, setStakeMode] = useState<'stake' | 'unstake'>('stake');
  const [stakeAmount, setStakeAmount] = useState('');
  const [stakeLoading, setStakeLoading] = useState(false);
  const [stakingMethod, setStakingMethod] = useState<'direct' | 'jupiter'>('direct');
  const [showHowToChoose, setShowHowToChoose] = useState(false);
  const [showRewardsInfo, setShowRewardsInfo] = useState(false);
  const [gsolApy, setGsolApy] = useState<number | null>(null);
  const [gsolSolValue, setGsolSolValue] = useState<number>(1);
  const [gsolTvl, setGsolTvl] = useState<number | null>(null);
  const [gsolHolders, setGsolHolders] = useState<number | null>(null);
  const [stakeSuccessData, setStakeSuccessData] = useState<{ amount: number; txid: string; gsolReceived?: number } | null>(null);
  const [stakeQuote, setStakeQuote] = useState<{ outputAmount: number; priceImpactPct: number } | null>(null);
  const [stakeQuoteLoading, setStakeQuoteLoading] = useState(false);
  const [gsolBalance, setGsolBalance] = useState<number>(0);
  const GSOL_MINT = 'GSoLRcWKQE5nbWTYFr83Ei3HGjnp9YzQNAFK6VAATg3';
  const [burnMode, setBurnMode] = useState<'burn' | 'swap'>('burn'); // Toggle between burn and swap
  const [selectedTokenMint, setSelectedTokenMint] = useState<string>('So11111111111111111111111111111111111111112'); // Default to SOL
  const [tokenList, setTokenList] = useState<any[]>([]);
  const [nftData, setNftData] = useState<any>(null);
  const [selectedNfts, setSelectedNfts] = useState<Set<string>>(new Set());
  const [nftTabView, setNftTabView] = useState<'nfts' | 'cnfts'>('nfts'); // Tab for NFTs vs cNFTs
  const [referralCode, setReferralCode] = useState<string>('');
  const [userReferralCode, setUserReferralCode] = useState<string | null>(null);
  const [enteringGiveaway, setEnteringGiveaway] = useState(false);
  const [viewProfileWallet, setViewProfileWallet] = useState<string | null>(null);

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
  const [shareData, setShareData] = useState<{ solClaimed: number; accountsClosed: number; claimType: 'accounts' | 'tokens' | 'nfts' } | null>(null);
  
  // Batch processing state
  const [isBatching, setIsBatching] = useState(false);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [batchResults, setBatchResults] = useState<{totalSol: number; totalAccounts: number}>({ totalSol: 0, totalAccounts: 0 });

  // Buffer accounts (program deploys) state
  const [bufferAccounts, setBufferAccounts] = useState<any[]>([]);
  const [selectedBuffers, setSelectedBuffers] = useState<Set<string>>(new Set());
  const [bufferScanning, setBufferScanning] = useState(false);
  const [bufferClosing, setBufferClosing] = useState(false);

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

  // Navigate to coin flip tab when announcement CTA is clicked
  useEffect(() => {
    const handler = () => setActiveTab('coinflip');
    window.addEventListener('navigate-to-coinflip', handler);
    return () => window.removeEventListener('navigate-to-coinflip', handler);
  }, []);

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
    signMessage,
    walletName,
    connection,
    isMagicEdenAvailable,
    connectMagicEden,
    isBitgetAvailable,
    connectBitget,
    setVisible,
    select
  } = useWalletAdapter();
  
  const rpcConnection = connection;


  const pointsWalletAddress = publicKey?.toBase58();

  const { data: gfsDiscountData } = useQuery({
    queryKey: ['/api/user/gfs-discount', pointsWalletAddress],
    queryFn: async () => {
      if (!pointsWalletAddress) throw new Error('No wallet');
      const res = await fetch(`/api/user/gfs-discount/${pointsWalletAddress}`);
      return res.json();
    },
    enabled: !!pointsWalletAddress,
    staleTime: 60000,
  });

  const { data: userStatsData } = useQuery({
    queryKey: ['/api/user/stats', pointsWalletAddress],
    queryFn: async () => {
      if (!pointsWalletAddress) throw new Error('No wallet');
      const res = await fetch(`/api/user/stats/${pointsWalletAddress}`);
      return res.json();
    },
    enabled: !!pointsWalletAddress,
    staleTime: 30000,
  });
  const userXP = userStatsData?.totalPoints ?? 0;

  const { data: stakingPositionData } = useQuery({
    queryKey: ['/api/staking/position', pointsWalletAddress],
    queryFn: async () => {
      if (!pointsWalletAddress) throw new Error('No wallet');
      const res = await fetch(`/api/staking/position/${pointsWalletAddress}`);
      return res.json();
    },
    enabled: !!pointsWalletAddress,
    refetchInterval: 60 * 1000,
    staleTime: 30000,
  });

  const { data: jupPortfolio, isLoading: jupPortfolioLoading } = useQuery<any>({
    queryKey: ['/api/wallet-pnl', pointsWalletAddress],
    queryFn: async () => {
      if (!pointsWalletAddress) throw new Error('No wallet');
      const res = await fetch(`/api/wallet-pnl/${pointsWalletAddress}`);
      return res.json();
    },
    enabled: !!pointsWalletAddress,
    refetchInterval: 60 * 1000,
    staleTime: 30000,
  });

  const formatXP = (n: number): string => {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')}B`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(2).replace(/\.?0+$/, '')}K`;
    if (n >= 1) return n.toFixed(2).replace(/\.?0+$/, '');
    if (n > 0) return n.toFixed(4).replace(/\.?0+$/, '');
    return '0';
  };
  const isGfsHolder = gfsDiscountData?.isGfsHolder ?? false;
  const effectiveFeePercent = isGfsHolder ? 10 : 20;
  const donationPercentage = effectiveFeePercent;

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
        if (claimSubTab === 'empty') {
          autoScanRef.current = true;
          scanMutation.mutate(publicKey.toString());
        } else if (claimSubTab === 'programs') {
          // Auto-scan for buffer accounts
          (async () => {
            setBufferScanning(true);
            try {
              const response = await fetch(`/api/buffer-accounts/scan/${publicKey}`);
              const data = await response.json();
              if (data.success) {
                setBufferAccounts(data.bufferAccounts || []);
                setSelectedBuffers(new Set(data.bufferAccounts?.map((b: any) => b.address) || []));
              } else {
                setBufferAccounts([]);
                setSelectedBuffers(new Set());
              }
            } catch (error) {
              console.error('Buffer scan error:', error);
              setBufferAccounts([]);
              setSelectedBuffers(new Set());
            } finally {
              setBufferScanning(false);
            }
          })();
        }
      } else if (activeTab === 'burnTokens') {
        if (burnSubTab === 'tokens') {
          scanTokensMutation.mutate(publicKey.toString());
        } else if (burnSubTab === 'nft') {
          scanNftsMutation.mutate(publicKey.toString());
        }
      }
    }
  }, [isConnected, publicKey, activeTab, burnSubTab, claimSubTab]);

  // Fetch lend statistics for platform wallet
  useEffect(() => {
    if (activeTab === 'docs' && showDeveloper && publicKey?.toString() === 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT') {
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
  const isPlatformWallet = publicKey?.toString() === 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT' || publicKey?.toString() === 'BtdxCT4DzqYYuxh9WRDFgRpM1g5H3aQ2ZsMRbjGmBQgT';
  const canViewPartners = publicKey?.toString() === 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT' || publicKey?.toString() === '6p7Zh4ptyVphDU5SfWjLEB8JfH7BhkK9PX4CRiMEHjbR';
  const canViewPerps = publicKey?.toString() === 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT';
  const canFlip = isPlatformWallet || publicKey?.toString() === 'GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6';

  // Query for user profile stats (platform wallet viewing other users)
  const { data: viewProfileData, isLoading: loadingProfileData } = useQuery<{
    totalSolClaimed: number;
    totalAccountsClosed: number;
    totalTokensBurned: number;
    totalNftsBurned: number;
    totalPoints: number;
    referralCode: string | null;
    referralEarnings: number;
    weeklyRank: number | null;
    weeklySol: number;
    allTimeRank: number | null;
    allTimeSol: number;
  }>({
    queryKey: ['/api/user/stats', viewProfileWallet],
    queryFn: async () => {
      const response = await fetch(`/api/user/stats/${viewProfileWallet}`);
      if (!response.ok) throw new Error('Failed to fetch user stats');
      return response.json();
    },
    enabled: !!viewProfileWallet && isPlatformWallet,
  });

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

  // Giveaway query
  const { data: activeGiveaway, refetch: refetchGiveaway } = useQuery<{ success: boolean; giveaway: any; entryCount: number }>({
    queryKey: ['/api/giveaways/active'],
    queryFn: async () => {
      const response = await fetch('/api/giveaways/active');
      if (!response.ok) throw new Error('Failed to fetch giveaway');
      return response.json();
    },
    staleTime: 30000,
  });

  // Check if user has entered giveaway
  const { data: giveawayStatus, refetch: refetchGiveawayStatus } = useQuery<{ success: boolean; isEligible: boolean; hasEntered: boolean }>({
    queryKey: ['/api/giveaways', activeGiveaway?.giveaway?.id, 'check', publicKey?.toString()],
    queryFn: async () => {
      if (!activeGiveaway?.giveaway?.id || !publicKey) return null;
      const response = await fetch(`/api/giveaways/${activeGiveaway.giveaway.id}/check/${publicKey.toString()}`);
      if (!response.ok) throw new Error('Failed to check eligibility');
      return response.json();
    },
    enabled: !!activeGiveaway?.giveaway?.id && !!publicKey,
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

  // Developer API account query
  const { data: devAccountData, isLoading: isDevAccountLoading } = useQuery<any>({
    queryKey: ["/api/referral/account", publicKey?.toString()],
    enabled: !!publicKey,
    retry: false,
    staleTime: 0,
  });

  const hasDevAccount = devAccountData?.success && devAccountData?.account;
  const devAccount = devAccountData?.account;

  // Create developer account mutation
  const createDevAccountMutation = useMutation({
    mutationFn: async () => {
      if (!publicKey || !signMessage || !devProjectName.trim()) {
        throw new Error("Missing wallet or project name");
      }

      const message = `Create developer fee account for project: ${devProjectName}`;
      const encodedMessage = new TextEncoder().encode(message);
      const signature = await signMessage(encodedMessage);

      const response = await apiRequest('POST', '/api/referral/create-account', {
        walletAddress: publicKey.toString(),
        signature: bs58.encode(signature),
        message,
        projectName: devProjectName.trim(),
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/referral/account", publicKey?.toString()] });
      toast({
        title: "Developer Account Created! 🎉",
        description: `Your PDA wallet has been created for "${devProjectName.trim()}"`,
      });
      setDevProjectName("");
      setShowDevAccountModal(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
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

  // Reset to reclaim tab on disconnect so connect card always shows
  useEffect(() => {
    if (!isConnected) {
      setActiveTab('reclaim');
    }
  }, [isConnected]);

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

  // Enter giveaway function
  const handleEnterGiveaway = async () => {
    if (!publicKey || !signMessage || !activeGiveaway?.giveaway?.id) {
      toast({
        title: "Error",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    setEnteringGiveaway(true);
    try {
      // Create and sign message
      const message = `Enter Giveaway: ${activeGiveaway.giveaway.title}\nWallet: ${publicKey.toString()}\nTimestamp: ${Date.now()}`;
      const encodedMessage = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(encodedMessage);
      const signature = btoa(String.fromCharCode(...signatureBytes));

      // Convert signature to base58
      const bs58Signature = (() => {
        const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        const bytes = signatureBytes;
        const digits = [0];
        for (let i = 0; i < bytes.length; i++) {
          let carry = bytes[i];
          for (let j = 0; j < digits.length; j++) {
            carry += digits[j] << 8;
            digits[j] = carry % 58;
            carry = (carry / 58) | 0;
          }
          while (carry) {
            digits.push(carry % 58);
            carry = (carry / 58) | 0;
          }
        }
        let str = '';
        for (let i = 0; i < bytes.length && bytes[i] === 0; i++) str += ALPHABET[0];
        for (let i = digits.length - 1; i >= 0; i--) str += ALPHABET[digits[i]];
        return str;
      })();

      const response = await fetch(`/api/giveaways/${activeGiveaway.giveaway.id}/enter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: publicKey.toString(),
          signature: bs58Signature,
          message,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "You're In!",
          description: "You've successfully entered the giveaway. Good luck!",
        });
        refetchGiveawayStatus();
        refetchGiveaway();
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to enter giveaway",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Error entering giveaway:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to enter giveaway",
        variant: "destructive",
      });
    } finally {
      setEnteringGiveaway(false);
    }
  };

  // Check for referral code and tab in URL on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Check for tab parameter: ?tab=docs
    const tabParam = urlParams.get('tab');
    if (tabParam === 'docs') {
      setActiveTab('docs');
    }
    
    // Check for query parameter format: ?ref=CODE
    const queryRefCode = urlParams.get('ref');

    // Check for path format: /CODE (skip known app routes)
    const path = window.location.pathname;
    const reservedPrefixes = ['/terminal', '/claim-sol', '/referrals', '/developer', '/admin', '/docs', '/api-docs', '/profile', '/swap', '/design', '/privacy', '/terms', '/partners', '/x-admin'];
    const isReserved = reservedPrefixes.some(p => path === p || path.startsWith(p + '/'));
    const pathRefCode = (!isReserved && path !== '/') ? path.replace('/', '') : '';

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
      return fetch(`${url}?limit=6&offset=${params.offset}`).then(res => res.json());
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

  useEffect(() => {
    if (!isConnected || !publicKey) {
      setScanResult(null);
    }
  }, [isConnected, publicKey]);

  // Fetch SOL balance when staking tab is active or wallet connects
  useEffect(() => {
    if (activeTab === 'staking' && publicKey && connection) {
      connection.getBalance(publicKey).then(bal => {
        setWalletTokenBalance(bal / 1e9);
      }).catch(() => {});
    }
  }, [activeTab, publicKey, connection]);

  // Fetch GSOL APY, SOL value, TVL, holders from Sanctum
  useEffect(() => {
    fetch('/api/staking/info')
      .then(r => r.json())
      .then(data => {
        if (data.apy !== undefined && data.apy !== null) setGsolApy(parseFloat(parseFloat(data.apy).toFixed(2)));
        if (data.solValue) setGsolSolValue(parseFloat(data.solValue));
        if (data.tvl !== undefined && data.tvl !== null) setGsolTvl(parseFloat(data.tvl));
        if (data.holders !== undefined && data.holders !== null) setGsolHolders(Number(data.holders));
      }).catch(() => {});
  }, []);

  // Debounced Jupiter quote — only for Jupiter method
  useEffect(() => {
    if (stakingMethod !== 'jupiter') { setStakeQuote(null); setStakeQuoteLoading(false); return; }
    const amt = parseFloat(stakeAmount);
    if (!stakeAmount || isNaN(amt) || amt <= 0) { setStakeQuote(null); return; }
    const inputLamports = Math.round(amt * 1e9);
    setStakeQuoteLoading(true);
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/staking/quote?inputLamports=${inputLamports}&mode=${stakeMode}`);
        const data = await r.json();
        if (data.outputAmount) setStakeQuote({ outputAmount: data.outputAmount, priceImpactPct: data.priceImpactPct ?? 0 });
        else setStakeQuote(null);
      } catch { setStakeQuote(null); }
      finally { setStakeQuoteLoading(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [stakeAmount, stakeMode, stakingMethod]);

  // Fetch GSOL token balance when wallet connects or staking tab is active
  useEffect(() => {
    if (!publicKey || !connection) return;
    (async () => {
      try {
        const { getAssociatedTokenAddress } = await import('@solana/spl-token');
        const gsolMintPk = new PublicKey(GSOL_MINT);
        const ata = await getAssociatedTokenAddress(gsolMintPk, publicKey);
        const info = await connection.getTokenAccountBalance(ata).catch(() => null);
        if (info?.value?.uiAmount !== undefined) setGsolBalance(info.value.uiAmount ?? 0);
      } catch { /* no GSOL account yet */ }
    })();
  }, [publicKey, connection, activeTab, stakeMode]);

  // Handle staking SOL → GSOL
  const handleStake = async () => {
    if (!publicKey || !signTransaction || !connection) return;
    const amt = parseFloat(stakeAmount);
    if (!amt || amt <= 0) { toast({ title: 'Enter an amount', variant: 'destructive' }); return; }
    if (amt > walletTokenBalance) { toast({ title: 'Insufficient SOL balance', variant: 'destructive' }); return; }
    setStakeLoading(true);
    try {
      const lamports = Math.floor(amt * 1e9);
      // 1. Get order from backend (proxied to Jupiter Ultra)
      const resp = await fetch('/api/staking/stake-tx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: lamports, signerPublicKey: publicKey.toBase58(), method: stakingMethod })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to build transaction');
      // 2. Sign the transaction
      const txBuffer = Buffer.from(data.transaction, 'base64');
      const tx = VersionedTransaction.deserialize(txBuffer);
      const signed = await signTransaction(tx);
      const signedBase64 = Buffer.from(signed.serialize()).toString('base64');
      let txid = '';
      if (stakingMethod === 'jupiter' && data.requestId) {
        // Jupiter path: use Ultra execute for reliable broadcast + confirmation
        const execResp = await fetch('/api/jupiter/ultra/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signedTransaction: signedBase64,
            requestId: data.requestId,
            walletAddress: publicKey.toBase58(),
            inputMint: 'So11111111111111111111111111111111111111112',
            outputMint: GSOL_MINT,
            inputSymbol: 'SOL',
            outputSymbol: 'GSOL',
          })
        });
        const execData = await execResp.json();
        if (!execResp.ok) throw new Error(execData.error || 'Execute failed');
        txid = execData.signature || execData.txid || '';
      } else {
        // Direct Mint path: broadcast directly
        txid = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
        await connection.confirmTransaction(txid, 'confirmed');
      }
      // Show success card
      // Calculate GSOL received: Jupiter quote if available, otherwise estimate from exchange rate
      const gsolReceived = stakeQuote?.outputAmount
        ? stakeQuote.outputAmount / 1e9
        : gsolSolValue > 0 ? amt / gsolSolValue : undefined;
      setStakeSuccessData({ amount: amt, txid, gsolReceived });

      // Award staking points (fire-and-forget)
      if (publicKey) {
        fetch('/api/staking/award-points', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: publicKey.toBase58(), solAmount: amt })
        }).catch(() => {});
        queryClient.invalidateQueries({ queryKey: ['/api/user/gfs-discount', publicKey.toBase58()] });
      }
      setStakeAmount('');
      // Refresh balances
      const bal = await connection.getBalance(publicKey);
      setWalletTokenBalance(bal / 1e9);
      const { getAssociatedTokenAddress } = await import('@solana/spl-token');
      const ata = await getAssociatedTokenAddress(new PublicKey(GSOL_MINT), publicKey);
      const info = await connection.getTokenAccountBalance(ata).catch(() => null);
      if (info?.value?.uiAmount !== undefined) setGsolBalance(info.value.uiAmount ?? 0);
    } catch (e: any) {
      toast({ title: 'Staking failed', description: e.message, variant: 'destructive' });
    } finally {
      setStakeLoading(false);
    }
  };

  // Handle unstaking GSOL → SOL
  const handleUnstake = async () => {
    if (!publicKey || !signTransaction || !connection) return;
    const amt = parseFloat(stakeAmount);
    if (!amt || amt <= 0) { toast({ title: 'Enter an amount', variant: 'destructive' }); return; }
    if (amt > gsolBalance + 1e-9) { toast({ title: 'Insufficient GSOL balance', variant: 'destructive' }); return; }
    setStakeLoading(true);
    try {
      const lamports = Math.floor(amt * 1e9);
      const resp = await fetch('/api/staking/unstake-tx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: lamports, signerPublicKey: publicKey.toBase58(), method: stakingMethod })
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (resp.status === 422 && data.error === 'POOL_RESERVE_INSUFFICIENT') {
          const maxSol = data.maxSol ?? (data.maxWithdrawable / 1e9).toFixed(9);
          setStakeAmount(String(parseFloat(maxSol)));
          toast({
            title: 'Pool reserve limit',
            description: `Pool only has ${parseFloat(maxSol).toFixed(6)} SOL available right now. Amount updated — try again.`,
            variant: 'destructive',
          });
          return;
        }
        throw new Error(data.error || 'Failed to build transaction');
      }
      const txBuffer = Buffer.from(data.transaction, 'base64');
      const tx = VersionedTransaction.deserialize(txBuffer);
      const signed = await signTransaction(tx);
      const signedBase64 = Buffer.from(signed.serialize()).toString('base64');
      let txid = '';
      if (data.requestId) {
        // Jupiter Ultra execute path (direct method or fallback)
        const execResp = await fetch('/api/jupiter/ultra/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signedTransaction: signedBase64,
            requestId: data.requestId,
            walletAddress: publicKey.toBase58(),
            inputMint: GSOL_MINT,
            outputMint: 'So11111111111111111111111111111111111111112',
            inputSymbol: 'GSOL',
            outputSymbol: 'SOL',
          })
        });
        const execData = await execResp.json();
        if (!execResp.ok) throw new Error(execData.error || 'Execute failed');
        txid = execData.signature || execData.txid || '';
      } else {
        txid = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
        await connection.confirmTransaction(txid, 'confirmed');
      }
      toast({ title: '✅ Unstaked!', description: `${amt} GSOL → SOL${txid ? `. Tx: ${txid.slice(0, 8)}…` : ''}` });
      // Reduce staking position so daily points stop accruing on unstaked amount
      fetch('/api/staking/reduce-position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: publicKey.toBase58(), gsolAmount: amt })
      }).catch(() => {});
      setStakeAmount('');
      const bal = await connection.getBalance(publicKey);
      setWalletTokenBalance(bal / 1e9);
      const { getAssociatedTokenAddress } = await import('@solana/spl-token');
      const ata = await getAssociatedTokenAddress(new PublicKey(GSOL_MINT), publicKey);
      const info = await connection.getTokenAccountBalance(ata).catch(() => null);
      if (info?.value?.uiAmount !== undefined) setGsolBalance(info.value.uiAmount ?? 0);
    } catch (e: any) {
      toast({ title: 'Unstaking failed', description: e.message, variant: 'destructive' });
    } finally {
      setStakeLoading(false);
    }
  };

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
      autoScanRef.current = false;
    },
    onError: (error: any) => {
      if (!autoScanRef.current) {
        toast({
          title: "Scan Failed",
          description: error.message || "Failed to scan wallet for empty accounts",
          variant: "destructive",
        });
      }
      autoScanRef.current = false;
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

      const { Transaction } = await import('@solana/web3.js');

      // Deserialize and sign transaction with connected wallet
      const txBuffer = Buffer.from(transaction, 'base64');
      const tx = Transaction.from(txBuffer);

      const signedTx = await signTransaction(tx);
      
      // Send via backend with Helius Backrun Rebates (earns SOL from MEV)
      const sendResponse = await fetch('/api/rpc/send-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signedTransaction: Buffer.from(signedTx.serialize()).toString('base64'),
          rebateAddress: publicKey?.toString()
        })
      });

      const sendResult = await sendResponse.json();
      if (!sendResponse.ok || !sendResult.success) {
        throw new Error(sendResult.error || 'Transaction failed');
      }
      
      const signature = sendResult.signature;
      console.log('Transaction confirmed successfully!');
      
      // Check for MEV rebates earned
      let rebateAmount = 0;
      if (sendResult.rebatesEnabled && publicKey) {
        console.log('💰 MEV rebates enabled - checking for earnings...');
        try {
          // Wait a moment for transaction to be indexed
          await new Promise(resolve => setTimeout(resolve, 2000));
          const rebateResponse = await fetch(`/api/rpc/check-rebates/${signature}/${publicKey.toString()}`);
          const rebateData = await rebateResponse.json();
          if (rebateData.rebateAmount > 0) {
            rebateAmount = rebateData.rebateAmount;
            console.log(`💰 MEV rebate earned: ${rebateAmount} SOL`);
          }
        } catch (e) {
          console.log('Could not check rebates:', e);
        }
      }

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
          netAmount: parseFloat(solRecovered) * 0.90, // 10% fee
          feeAmount: parseFloat(solRecovered) * 0.10
        })
      });

      if (!recordResponse.ok) {
        console.error('Failed to record burn success:', await recordResponse.text());
      }

      return { signature, solRecovered, rebateAmount };
    },
    onSuccess: (data) => {
      const totalRecovered = parseFloat(data.solRecovered) + (data.rebateAmount || 0);
      const rebateText = data.rebateAmount > 0 ? ` + ${data.rebateAmount.toFixed(6)} SOL MEV rebate!` : '';
      toast({
        title: "Success!",
        description: `Token burned successfully! Recovered ${data.solRecovered} SOL${rebateText}`,
      });
      
      // Show share modal
      setShareData({ solClaimed: totalRecovered, accountsClosed: 1, claimType: 'tokens' });
      setIsShareModalOpen(true);
      triggerFeedbackCard(publicKey?.toString());
      
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



  // Bulk Burn Tokens Mutation - Now with batching (max 15 tokens per signature)
  const bulkBurnTokensMutation = useMutation({
    mutationFn: async (tokenMints: string[]) => {
      // Get batched transactions from backend
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
        throw new Error('Failed to prepare bulk burn transactions');
      }

      const prepareResponse = await response.json();
      
      if (!prepareResponse.success || !prepareResponse.batches || prepareResponse.batches.length === 0) {
        throw new Error('No burn batches prepared by server');
      }

      console.log(`🔥 Processing ${prepareResponse.totalBatches} batches for ${prepareResponse.totalTokens} tokens (max 15 per signature)...`);

      const { Transaction } = await import('@solana/web3.js');
      
      const allBatchResults: { signature: string; tokensProcessed: number; solRecovered: number; netAmount: number; tokenMints: string[] }[] = [];
      let totalTokensProcessed = 0;
      let totalSolRecovered = 0;
      let totalNetAmount = 0;
      let totalRebateAmount = 0;

      // Process each batch sequentially (user signs each one)
      for (const batch of prepareResponse.batches) {
        console.log(`🔐 Signing batch ${batch.batchIndex}/${prepareResponse.totalBatches} with ${batch.tokenCount} tokens...`);

        const txBuffer = Buffer.from(batch.transaction, 'base64');
        const tx = Transaction.from(txBuffer);

        // Sign this batch with wallet
        const signedTx = await signTransaction(tx);
        console.log(`✅ Batch ${batch.batchIndex} signed successfully with:`, walletName);

        // Send via backend with Helius Backrun Rebates
        const sendResponse = await fetch('/api/rpc/send-transaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signedTransaction: Buffer.from(signedTx.serialize()).toString('base64'),
            rebateAddress: publicKey?.toString()
          })
        });

        const sendResult = await sendResponse.json();
        if (!sendResponse.ok || !sendResult.success) {
          throw new Error(`Batch ${batch.batchIndex} failed: ${sendResult.error || 'Transaction failed'}`);
        }
        
        const signature = sendResult.signature;
        console.log(`🚀 Batch ${batch.batchIndex} confirmed: ${signature}`);
        
        // Check for MEV rebates
        let rebateAmount = 0;
        if (sendResult.rebatesEnabled && publicKey) {
          try {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const rebateResponse = await fetch(`/api/rpc/check-rebates/${signature}/${publicKey.toString()}`);
            const rebateData = await rebateResponse.json();
            if (rebateData.rebateAmount > 0) {
              rebateAmount = rebateData.rebateAmount;
              totalRebateAmount += rebateAmount;
              console.log(`💰 Batch ${batch.batchIndex} MEV rebate: ${rebateAmount} SOL`);
            }
          } catch (e) {
            console.log('Could not check rebates:', e);
          }
        }

        // Record the batch success — skip individual X post, batch total posted at end
        const recordResponse = await fetch('/api/tokens/record-burn-success', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signature,
            walletAddress: publicKey?.toString(),
            tokenMints: batch.tokenMints,
            tokensProcessed: batch.tokenCount,
            solRecovered: batch.solRecovered,
            netAmount: batch.netAmount,
            feeAmount: batch.feeAmount,
            referralCodeUsed: prepareResponse.referralCodeUsed || null,
            platformFeeAmount: batch.platformFee || 0,
            referralFeeAmount: batch.referralFee || 0,
            skipXPost: true
          })
        });

        if (!recordResponse.ok) {
          console.error('Failed to record batch burn success:', await recordResponse.text());
        }

        allBatchResults.push({
          signature,
          tokensProcessed: batch.tokenCount,
          solRecovered: batch.solRecovered,
          netAmount: batch.netAmount,
          tokenMints: batch.tokenMints
        });

        totalTokensProcessed += batch.tokenCount;
        totalSolRecovered += batch.solRecovered;
        totalNetAmount += batch.netAmount;

        console.log(`✅ Batch ${batch.batchIndex}/${prepareResponse.totalBatches} completed: ${batch.tokenCount} tokens burned`);
      }

      console.log(`🎉 Successfully burned ${totalTokensProcessed} tokens in ${prepareResponse.totalBatches} batches!`);

      // Post combined total to X after all batches complete
      if (totalNetAmount > 0 && allBatchResults.length > 0) {
        try {
          const lastSig = allBatchResults[allBatchResults.length - 1]?.signature;
          await fetch('/api/sol-refund/post-batch-to-x', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              walletAddress: publicKey?.toString(),
              totalNetAmount,
              totalAccountsClosed: totalTokensProcessed,
              signature: lastSig,
              transactionType: 'token_burn'
            })
          });
        } catch (xError) {
          console.warn('Failed to post token burn total to X:', xError);
        }
      }

      return { 
        tokensProcessed: totalTokensProcessed, 
        solRecovered: totalSolRecovered, 
        netAmount: totalNetAmount, 
        signature: allBatchResults[0]?.signature || '',
        rebateAmount: totalRebateAmount,
        batchCount: prepareResponse.totalBatches,
        allSignatures: allBatchResults.map(r => r.signature)
      };
    },
    onSuccess: (result) => {
      const totalRecovered = result.netAmount + (result.rebateAmount || 0);
      const rebateText = result.rebateAmount > 0 ? ` + ${result.rebateAmount.toFixed(6)} SOL MEV rebate!` : '';
      const batchText = result.batchCount > 1 ? ` (${result.batchCount} batches)` : '';
      toast({
        title: `Successfully burned ${result.tokensProcessed} token${result.tokensProcessed > 1 ? 's' : ''}${batchText}${rebateText}`,
        className: "bg-green-600 text-white border-green-600",
        action: <ToastAction altText="View transaction on Solscan" onClick={() => window.open(`https://solscan.io/tx/${result.signature}`, '_blank')}>View on Solscan</ToastAction>
      });
      
      // Show share modal
      setShareData({ solClaimed: totalRecovered, accountsClosed: result.tokensProcessed, claimType: 'tokens' });
      setIsShareModalOpen(true);
      triggerFeedbackCard(publicKey?.toString());
      
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
        description: error instanceof Error ? error.message : "Failed to burn tokens. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Bulk Swap Tokens Mutation - Swap tokens to SOL and close accounts
  const bulkSwapTokensMutation = useMutation({
    mutationFn: async (tokenMints: string[]) => {
      if (!isConnected || !publicKey) {
        throw new Error('Wallet not connected');
      }
      if (!signAllTransactions) {
        throw new Error('Wallet does not support batch signing');
      }

      const { VersionedTransaction } = await import('@solana/web3.js');
      const SOL_MINT = 'So11111111111111111111111111111111111111112';

      const tokensToSwap = tokenList.filter(token => tokenMints.includes(token.mint));
      if (tokensToSwap.length === 0) {
        throw new Error('No valid tokens selected for swap');
      }

      console.log(`🔄 Preparing ${tokensToSwap.length} swap transactions in batch...`);

      // STEP 1: Fetch all swap transactions in parallel (no signing yet)
      const txDataList: { token: any; swapData: any; tx: InstanceType<typeof VersionedTransaction> }[] = [];
      
      const fetchPromises = tokensToSwap.map(async (token) => {
        try {
          const rawAmount = token.amount || Math.floor(token.balance * Math.pow(10, token.decimals || 6)).toString();
          console.log(`🔄 Fetching swap tx for ${token.symbol || token.mint.slice(0, 8)}...`);
          
          const swapResponse = await fetch(
            `/api/jupiter/swap-with-close?inputMint=${token.mint}&outputMint=${SOL_MINT}&amount=${rawAmount}&taker=${publicKey.toString()}`
          );
          
          if (!swapResponse.ok) {
            const errorText = await swapResponse.text();
            console.error(`Failed to get swap tx for ${token.symbol}: ${errorText}`);
            return null;
          }
          
          const swapData = await swapResponse.json();
          if (!swapData.success || !swapData.transaction) {
            console.error(`No transaction for ${token.symbol}:`, swapData.error);
            return null;
          }

          const txBuffer = Buffer.from(swapData.transaction, 'base64');
          const tx = VersionedTransaction.deserialize(txBuffer);
          console.log(`✅ Got swap tx for ${token.symbol} (${swapData.quoteData?.outAmount} lamports out)`);
          
          return { token, swapData, tx };
        } catch (err) {
          console.error(`Error preparing ${token.symbol}:`, err);
          return null;
        }
      });

      const results = await Promise.all(fetchPromises);
      const failedTokens: string[] = [];
      for (let i = 0; i < results.length; i++) {
        if (results[i]) {
          txDataList.push(results[i]!);
        } else {
          failedTokens.push(tokensToSwap[i].symbol || tokensToSwap[i].mint.slice(0, 8));
        }
      }

      if (txDataList.length === 0) {
        throw new Error('No swap routes available');
      }

      if (failedTokens.length > 0) {
        toast({
          title: `${failedTokens.join(', ')} skipped - no swap route available`,
          description: `Proceeding with ${txDataList.length} token${txDataList.length > 1 ? 's' : ''} that have valid routes.`,
          className: "bg-yellow-600 text-white border-yellow-600",
        });
      }

      console.log(`📦 Got ${txDataList.length}/${tokensToSwap.length} transactions ready. Requesting signature approval...`);

      // STEP 2: Sign ALL transactions at once (ONE wallet popup)
      const unsignedTxs = txDataList.map(d => d.tx);
      let signedTxs: InstanceType<typeof VersionedTransaction>[];
      try {
        signedTxs = await signAllTransactions(unsignedTxs);
        console.log(`✅ All ${signedTxs.length} transactions signed in one popup!`);
      } catch (signErr: any) {
        console.error(`❌ User rejected batch signing:`, signErr);
        throw new Error('Transaction signing was cancelled');
      }

      // STEP 3: Send all signed transactions
      let totalSwapped = 0;
      let totalSolReceived = 0;
      let totalRentRecovered = 0;
      const successfulSwaps: { signature: string; inputMint: string; outputAmount: number }[] = [];

      for (let i = 0; i < signedTxs.length; i++) {
        const signedTx = signedTxs[i];
        const { token, swapData } = txDataList[i];
        
        try {
          console.log(`📤 Sending tx ${i + 1}/${signedTxs.length} for ${token.symbol}...`);
          const sendResponse = await fetch('/api/rpc/send-transaction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              signedTransaction: Buffer.from(signedTx.serialize()).toString('base64'),
              rebateAddress: publicKey.toString()
            })
          });
          
          const sendResult = await sendResponse.json();
          if (sendResponse.ok && sendResult.signature) {
            const signature = sendResult.signature;
            console.log(`✅ Tx ${i + 1} confirmed: ${signature}`);
            
            const outputSol = Number(swapData.quoteData?.outAmount || 0) / 1e9;
            totalSwapped++;
            totalSolReceived += outputSol;
            successfulSwaps.push({ signature, inputMint: token.mint, outputAmount: outputSol });

            const rentPerAccount = 2039280;
            const rentRecoveredForThisAccount = (rentPerAccount * 0.90) / 1e9;
            const feeForThisAccount = (rentPerAccount * 0.10) / 1e9;
            totalRentRecovered += rentRecoveredForThisAccount;

            try {
              await fetch('/api/sol-refund/record-success', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  signature,
                  walletAddress: publicKey.toString(),
                  accountsClosed: 1,
                  solRecovered: rentPerAccount / 1e9,
                  netAmount: rentRecoveredForThisAccount,
                  feeAmount: feeForThisAccount,
                  platformFeeAmount: feeForThisAccount
                })
              });
            } catch (recordErr) {
              console.warn(`Could not record stats:`, recordErr);
            }

            console.log(`✅ Swapped ${token.symbol} → ${outputSol.toFixed(6)} SOL + closed account`);
          } else {
            console.error(`Send failed for ${token.symbol}:`, sendResult.error);
          }
        } catch (sendErr) {
          console.error(`Failed to send tx for ${token.symbol}:`, sendErr);
        }
      }

      if (successfulSwaps.length === 0) {
        throw new Error('No swaps completed successfully');
      }

      console.log(`💰 Total: ${totalSwapped} tokens swapped, ${totalRentRecovered.toFixed(6)} SOL rent recovered`);

      return {
        tokensSwapped: totalSwapped,
        totalSolReceived: totalSolReceived + totalRentRecovered,
        rentRecovered: totalRentRecovered,
        signature: successfulSwaps[0]?.signature || '',
        allSignatures: successfulSwaps.map(s => s.signature)
      };
    },
    onSuccess: (result) => {
      toast({
        title: `Successfully swapped ${result.tokensSwapped} token${result.tokensSwapped > 1 ? 's' : ''} to ${result.totalSolReceived.toFixed(4)} SOL`,
        className: "bg-green-600 text-white border-green-600",
        action: <ToastAction altText="View transaction on Solscan" onClick={() => window.open(`https://solscan.io/tx/${result.signature}`, '_blank')}>View on Solscan</ToastAction>
      });
      
      // Show share modal
      setShareData({ solClaimed: result.totalSolReceived, accountsClosed: result.tokensSwapped, claimType: 'tokens' });
      setIsShareModalOpen(true);
      triggerFeedbackCard(publicKey?.toString());
      
      // Clear selections and refresh
      setSelectedTokens(new Set());
      if (publicKey) {
        scanTokensMutation.mutate(publicKey.toString());
      }
      queryClient.invalidateQueries({ queryKey: ['/api/sol-refund/stats'] });
    },
    onError: (error) => {
      console.error('Error bulk swapping tokens:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to swap tokens. Please try again.",
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
            
            if (!publicKey) {
              throw new Error('Wallet not connected');
            }

            // Prepare Core NFT IDs (use the actual ID from the NFT objects)
            const coreNftIds = nfts.map(nft => nft.id || nft.mint || nft.assetId);
            console.log(`📦 Preparing burn transactions for ${coreNftIds.length} Core NFTs...`);

            // Call server to prepare burn transactions (new batching API)
            const prepareResponseRaw = await apiRequest('POST', '/api/core-nfts/prepare-burn', { 
              coreNftIds,
              walletAddress: publicKey.toString()
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
              if (!signTransaction) {
                throw new Error('Wallet does not support transaction signing');
              }
              const signedTransaction = await signTransaction(transaction);
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

              // Record each NFT burn in the database for this batch — skip X post, batch total posted at end
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
                    walletAddress: publicKey.toString(),
                    nftType: 'core',
                    success: true,
                    skipXPost: true
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

            // Post combined total to X after all Core NFT batches complete
            if (totalNetAmount > 0 && allBatchResults.length > 0) {
              try {
                const lastSig = allBatchResults[allBatchResults.length - 1]?.signature;
                await fetch('/api/sol-refund/post-batch-to-x', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    walletAddress: publicKey.toString(),
                    totalNetAmount,
                    totalAccountsClosed: totalBurned,
                    signature: lastSig,
                    transactionType: 'nft_burn'
                  })
                });
              } catch (xError) {
                console.warn('Failed to post Core NFT burn total to X:', xError);
              }
            }

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
            
            if (!publicKey) {
              throw new Error('Wallet not connected');
            }

            // Prepare pNFT IDs (use the actual ID from the NFT objects)
            const pNftIds = nfts.map(nft => nft.id || nft.mint || nft.assetId);
            console.log(`📦 Preparing burn transactions for ${pNftIds.length} Programmable NFTs...`);

            // Call server to prepare pNFT burn transactions
            const prepareResponseRaw = await apiRequest('POST', '/api/pnfts/prepare-burn', {
              pNftIds,
              walletAddress: publicKey.toString()
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
                    walletAddress: publicKey.toString(),
                    nftType: 'pnft',
                    success: true,
                    skipXPost: true
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

            // Post combined total to X after all pNFT batches complete
            const pNftTotalNetAmount = allBatchResults.reduce((sum: number, b: any) => sum + (b.netAmount || 0), 0);
            if (pNftTotalNetAmount > 0 && allBatchResults.length > 0) {
              try {
                const lastSig = allBatchResults[allBatchResults.length - 1]?.signature;
                await fetch('/api/sol-refund/post-batch-to-x', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    walletAddress: publicKey.toString(),
                    totalNetAmount: pNftTotalNetAmount,
                    totalAccountsClosed: totalBurned,
                    signature: lastSig,
                    transactionType: 'nft_burn'
                  })
                });
              } catch (xError) {
                console.warn('Failed to post pNFT burn total to X:', xError);
              }
            }

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
            
            if (!publicKey) {
              throw new Error('Wallet not connected');
            }

            // Prepare standard NFT IDs (use the actual ID from the NFT objects)
            const standardNftIds = nfts.map(nft => nft.id || nft.mint || nft.assetId);
            console.log(`📦 Preparing burn transactions for ${standardNftIds.length} Traditional NFTs...`);

            // Call server to prepare standard NFT burn transactions
            const prepareResponseRaw = await apiRequest('POST', '/api/standard-nfts/prepare-burn', {
              standardNftIds,
              walletAddress: publicKey.toString()
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
                    walletAddress: publicKey.toString(),
                    nftType: 'standard',
                    success: true,
                    skipXPost: true
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

            // Post combined total to X after all Traditional NFT batches complete
            const tradNftTotalNetAmount = allBatchResults.reduce((sum: number, b: any) => sum + (b.netAmount || 0), 0);
            if (tradNftTotalNetAmount > 0 && allBatchResults.length > 0) {
              try {
                const lastSig = allBatchResults[allBatchResults.length - 1]?.signature;
                await fetch('/api/sol-refund/post-batch-to-x', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    walletAddress: publicKey.toString(),
                    totalNetAmount: tradNftTotalNetAmount,
                    totalAccountsClosed: totalBurned,
                    signature: lastSig,
                    transactionType: 'nft_burn'
                  })
                });
              } catch (xError) {
                console.warn('Failed to post Traditional NFT burn total to X:', xError);
              }
            }

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
            
            if (!publicKey) {
              throw new Error('Wallet not connected');
            }

            // Prepare cNFT asset IDs
            const cnftIds = nfts.map(nft => nft.assetId || nft.id);
            console.log(`📦 Preparing burn transactions for ${cnftIds.length} Compressed NFTs...`);

            // Call server to prepare cNFT burn transactions
            const prepareResponseRaw = await apiRequest('POST', '/api/cnfts/prepare-burn', {
              cnftIds,
              walletAddress: publicKey.toString()
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
              // UMI creates versioned transactions - use Uint8Array for proper deserialization
              const transactionBuffer = Buffer.from(batch.transaction, 'base64');
              const transactionBytes = new Uint8Array(transactionBuffer);
              
              // Try to deserialize as VersionedTransaction (UMI format)
              let transaction: VersionedTransaction | Transaction;
              try {
                transaction = VersionedTransaction.deserialize(transactionBytes);
                console.log(`📦 Deserialized as VersionedTransaction`);
              } catch (versionedError) {
                // Fallback to legacy Transaction if versioned fails
                console.log(`⚠️ VersionedTransaction failed, trying legacy Transaction...`);
                const { Transaction } = await import('@solana/web3.js');
                transaction = Transaction.from(transactionBuffer);
                console.log(`📦 Deserialized as legacy Transaction`);
              }

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
            if (!publicKey) {
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
            const userPubkey = publicKey!;
            
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
                
                const signedTxs = await signAllTransactions(unsignedTxs);
                
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
              walletAddress: publicKey!.toString()
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
                const balanceBefore = await rpcConnection.getBalance(publicKey!);
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
                const balanceAfter = await rpcConnection.getBalance(publicKey!);
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
                console.log('💰 User wallet:', publicKey?.toString());

                // Get wallet balance before burn
                const balanceBefore = await rpcConnection.getBalance(publicKey!);
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

                const balanceAfter = await rpcConnection.getBalance(publicKey!);
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
        const { Transaction } = await import('@solana/web3.js');

        const txBuffer = Buffer.from(transaction, 'base64');
        const tx = Transaction.from(txBuffer);

        const signedTx = await signTransaction(tx);
        
        // Send via backend with Helius Backrun Rebates (earns SOL from MEV)
        const sendResponse = await fetch('/api/rpc/send-transaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signedTransaction: Buffer.from(signedTx.serialize()).toString('base64'),
            rebateAddress: publicKey?.toString()
          })
        });

        const sendResult = await sendResponse.json();
        if (!sendResponse.ok || !sendResult.success) {
          throw new Error(sendResult.error || 'Transaction failed');
        }
        
        const signature = sendResult.signature;
        console.log(`${nftType} NFT burn transaction confirmed:`, signature);
        
        // Check for MEV rebates earned
        let rebateAmount = 0;
        if (sendResult.rebatesEnabled && publicKey) {
          console.log('💰 MEV rebates enabled - checking for earnings...');
          try {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const rebateResponse = await fetch(`/api/rpc/check-rebates/${signature}/${publicKey.toString()}`);
            const rebateData = await rebateResponse.json();
            if (rebateData.rebateAmount > 0) {
              rebateAmount = rebateData.rebateAmount;
              console.log(`💰 MEV rebate earned: ${rebateAmount} SOL`);
            }
          } catch (e) {
            console.log('Could not check rebates:', e);
          }
        }

        results.push({
          type: nftType,
          count: nftsProcessed,
          signature,
          solRecovered: parseFloat(solRecovered || '0'),
          netAmount: parseFloat(netAmount || '0'),
          feeAmount: parseFloat(feeAmount || '0'),
          rebateAmount
        });
      }

      return results;
    },
    onSuccess: (results) => {
      if (!results) return;
      
      // Calculate total rebates earned and SOL recovered
      const totalRebate = results.reduce((sum, r) => sum + (r.rebateAmount || 0), 0);
      const totalSolRecovered = results.reduce((sum, r) => sum + (r.netAmount || 0), 0) + totalRebate;
      const rebateText = totalRebate > 0 ? ` + ${totalRebate.toFixed(6)} SOL MEV rebate!` : '';
      
      if (results.length > 0) {
        const totalNfts = results.reduce((sum, r) => sum + r.count, 0);
        toast({
          title: `Successfully burned ${totalNfts} NFT${totalNfts > 1 ? 's' : ''}${rebateText}`,
          className: "bg-green-600 text-white border-green-600",
        });
        
        // Show share modal
        setShareData({ solClaimed: totalSolRecovered, accountsClosed: totalNfts, claimType: 'nfts' });
        setIsShareModalOpen(true);
      triggerFeedbackCard(publicKey?.toString());
      }

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
    setSelectedTokens(new Set(filteredTokenList.map(token => token.mint)));
  };

  const clearTokenSelection = () => {
    setSelectedTokens(new Set());
  };

  // Calculate total SOL user receives (90% of rent per account, 10% platform fee)
  const calculateTotalSOL = (count: number) => {
    const netAmount = count * 0.001867;
    return `${netAmount.toFixed(6)}`;
  };

  // Process SOL refund (20% service fee)
  const refundMutation = useMutation({
    mutationFn: async (data: { walletAddress: string; selectedAccounts: string[]; donationPercentage: number; referralCode?: string; skipXPost?: boolean }) => {
      // Get transaction (20% service fee)
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

      // Execute transaction (20% service fee)
      try {
        setProcessing(true);
        console.log('Starting transaction processing...');

        // Prepare and sign transaction
        let signedTransaction;
        try {
          const { Transaction, ComputeBudgetProgram } = await import('@solana/web3.js');
          const transactionBuffer = Buffer.from(transaction, 'base64');
          const deserializedTransaction = Transaction.from(transactionBuffer);

          // Add FIXED priority fee for everyone (0.00001 SOL = 10,000 lamports)
          const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: 10000,
          });
          deserializedTransaction.add(priorityFeeInstruction);

          console.log(`Transaction with priority fee, signing with ${walletName || 'connected wallet'}...`);
          signedTransaction = await signTransaction(deserializedTransaction);
        } catch (prepError: any) {
          console.log('Transaction preparation error:', prepError.message);
          throw new Error(`Transaction preparation failed: ${prepError.message}`);
        }

        console.log('Transaction signed, sending via backend...');

        // Send via backend with Helius Backrun Rebates (earns SOL from MEV)
        const sendResponse = await fetch('/api/rpc/send-transaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signedTransaction: Buffer.from(signedTransaction.serialize()).toString('base64'),
            rebateAddress: publicKey?.toString()
          })
        });

        const sendResult = await sendResponse.json();
        if (!sendResponse.ok || !sendResult.success) {
          throw new Error(sendResult.error || 'Transaction failed');
        }
        
        const signature = sendResult.signature;
        console.log('Transaction confirmed successfully!');
        
        // Check for MEV rebates earned
        let rebateAmount = 0;
        if (sendResult.rebatesEnabled && publicKey) {
          console.log('💰 MEV rebates enabled - checking for earnings...');
          try {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const rebateResponse = await fetch(`/api/rpc/check-rebates/${signature}/${publicKey.toString()}`);
            const rebateData = await rebateResponse.json();
            if (rebateData.rebateAmount > 0) {
              rebateAmount = rebateData.rebateAmount;
              console.log(`💰 MEV rebate earned: ${rebateAmount} SOL`);
            }
          } catch (e) {
            console.log('Could not check rebates:', e);
          }
        }

        // Save successful transaction to database (with retries)
        const recordData = {
          signature,
          walletAddress: data.walletAddress,
          selectedAccounts: data.selectedAccounts,
          accountsClosed: data.selectedAccounts.length,
          solRecovered: totalSolReclaimed,
          netAmount: netAmount,
          feeAmount: feeAmount,
          referralCodeUsed: referralCodeUsed,
          platformFeeAmount: platformFeeAmount || feeAmount,
          referralFeeAmount: referralFeeAmount || 0,
          skipXPost: data.skipXPost || false
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
          rebateAmount: rebateAmount,
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
      // Only show share modal for single transactions (not during batching)
      // Batch processing shows the modal at the end with total amount
      if (!isBatching) {
        const totalWithRebate = result.totalReceived + (result.rebateAmount || 0);
        const closedCount = result.accountsClosed || selectedAccounts.length;
        setShareData({ solClaimed: totalWithRebate, accountsClosed: closedCount, claimType: 'accounts' });
        setIsShareModalOpen(true);
      triggerFeedbackCard(publicKey?.toString());
        
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
      }
      
      // Show toast if there was a rebate
      if (result.rebateAmount > 0) {
        toast({
          title: "💰 MEV Rebate Earned!",
          description: `You earned an extra ${result.rebateAmount.toFixed(6)} SOL from MEV rebates!`,
          className: "bg-green-600 text-white border-green-600",
        });
      }
    },
    onError: (error: any) => {
      const errorMsg = error.message || "Failed to process SOL refund transaction";
      
      // Check if accounts were already closed - prompt user to re-scan
      if (errorMsg.includes('already closed') || errorMsg.includes('re-scan') || 
          errorMsg.includes('AccountNotFound') || errorMsg.includes('ownership mismatch')) {
        toast({
          title: "Accounts Already Claimed",
          description: "Some accounts may have been closed. Please re-scan your wallet to get fresh data.",
          variant: "destructive",
        });
        // Reset scan result to force re-scan
        setScanResult(null);
      } else {
        toast({
          title: "Transaction Failed",
          description: errorMsg,
          variant: "destructive",
        });
      }
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
    let lastSignature = '';
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
          skipXPost: true,
        });
        
        // Accumulate results
        totalSolRecovered += result.totalReceived || 0;
        totalAccountsClosed += batches[i].length;
        if (result.signature) lastSignature = result.signature;
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
    
    // Post total to X after all batches (one combined post)
    if (failedBatches.length === 0 && lastSignature && totalSolRecovered > 0) {
      try {
        await fetch('/api/sol-refund/post-batch-to-x', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: publicKey?.toString() || '',
            totalNetAmount: totalSolRecovered,
            totalAccountsClosed,
            signature: lastSignature
          })
        });
      } catch (e) {
        console.warn('Could not post batch total to X:', e);
      }
    }

    // Show final summary
    if (failedBatches.length === 0) {
      toast({
        title: "All Batches Completed!",
        description: `Successfully closed ${totalAccountsClosed} accounts and recovered ${totalSolRecovered.toFixed(6)} SOL!`,
      });
      
      // Show share modal with total results
      setShareData({ solClaimed: totalSolRecovered, accountsClosed: totalAccountsClosed, claimType: 'accounts' });
      setIsShareModalOpen(true);
      triggerFeedbackCard(publicKey?.toString());
      
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
    const net = scanResult.emptyAccounts * 0.001867; // user receives ~0.001867 SOL per account
    const donation = Math.max(0, total - net); // platform fee

    return { total, donation, net };
  };

  const refundCalc = calculateRefund();


  return (
    <><div className="h-screen md:h-auto md:min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col overflow-x-hidden">
      <div className={`flex-1 min-h-0 overflow-y-auto md:overflow-visible md:flex-grow container mx-auto pt-1 max-w-6xl md:max-w-7xl ${activeTab === 'docs' ? 'px-0' : 'px-4'} pb-2`}>
        <div className="space-y-1">
          {/* Header with Navigation and Wallet Connection */}
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between mb-0 space-y-1 lg:space-y-0">
            {activeTab === 'docs' ? (
              /* Docs Mode Header - Logo only */
              <div className="flex items-center justify-between w-full">
                <img 
                  src={logoImage}
                  alt="Get your SOL back!"
                  className="h-[80px] w-[80px]"
                />
              </div>
            ) : (
              <>
                {/* Top row: Logo and Wallet Connection (mobile) */}
                <div className="flex items-center justify-between">
                  {/* Logo */}
                  <div className="flex items-center">
                    <img
                      src={logoImage}
                      alt="Get your SOL back!"
                      className="h-[70px] w-[70px] md:h-[100px] md:w-[100px]"
                    />
                  </div>

                  {/* Mobile Wallet Connection */}
                  <div className="lg:hidden flex items-center space-x-2">
                {isConnected && publicKey ? (
                  <>
                    {/* XP Badge — mobile */}
                    <div className="flex items-center bg-purple-700/50 border border-purple-400/40 rounded-md px-2 py-2 text-white text-xs font-bold gap-1">
                      <span className="text-purple-200">XP</span>
                      <span className="text-white/50">|</span>
                      <span className="text-green-400">{formatXP(userXP)}</span>
                    </div>
                    <Link href="/profile">
                      <Button
                        className="bg-purple-800/60 hover:bg-purple-700/60 backdrop-blur-sm rounded-md px-2 py-2 text-white text-xs border border-purple-500/30 flex items-center gap-1 h-auto"
                        data-testid="button-profile"
                      >
                        <User className="h-3 w-3" />
                        <span>Profile</span>
                      </Button>
                    </Link>
                    <div className="relative">
                      <button
                        onClick={() => setMobileWalletMenuOpen(o => !o)}
                        className="bg-purple-800/60 hover:bg-purple-700/60 backdrop-blur-sm rounded-lg px-2 py-2 text-white font-mono text-xs border border-purple-500/30 outline-none"
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                        data-testid="button-wallet-connected"
                      >
                        {publicKey.toString().slice(0, 3)}...{publicKey.toString().slice(-3)}
                      </button>
                      {mobileWalletMenuOpen && (
                        <div className="fixed inset-0 z-40" onClick={() => setMobileWalletMenuOpen(false)} />
                      )}
                      {mobileWalletMenuOpen && (
                        <div className="absolute right-0 top-full mt-1 z-50 bg-slate-800 border border-purple-500/30 rounded-md shadow-lg w-full overflow-hidden">
                          {publicKey?.toString() === 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT' && (
                            <>
                              <Link href="/admin/x-bot" onClick={() => setMobileWalletMenuOpen(false)}>
                                <div className="px-2 py-2 text-white hover:bg-purple-600/40 cursor-pointer text-xs text-center truncate" data-testid="button-admin-xbot">🤖 X Bot</div>
                              </Link>
                              <Link href="/x-admin" onClick={() => setMobileWalletMenuOpen(false)}>
                                <div className="px-2 py-2 text-white hover:bg-purple-600/40 cursor-pointer text-xs text-center truncate" data-testid="button-x-admin">🐦 X</div>
                              </Link>
                              <Link href="/admin/vault" onClick={() => setMobileWalletMenuOpen(false)}>
                                <div className="px-2 py-2 text-white hover:bg-purple-600/40 cursor-pointer text-xs text-center truncate" data-testid="button-vault-admin">🏦 Vault</div>
                              </Link>
                            </>
                          )}
                          {canViewPartners && (
                            <Link href="/partners" onClick={() => setMobileWalletMenuOpen(false)}>
                              <div className="px-2 py-2 text-yellow-300 hover:bg-purple-600/40 cursor-pointer text-xs text-center truncate">🤝 Partners</div>
                            </Link>
                          )}
                          <div
                            onClick={() => { disconnectWallet(); setMobileWalletMenuOpen(false); }}
                            className="px-2 py-2 text-white cursor-pointer text-xs text-center truncate"
                            style={{ WebkitTapHighlightColor: 'transparent' }}
                            data-testid="button-disconnect"
                          >
                            Disconnect
                          </div>
                        </div>
                      )}
                    </div>
                  </>
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
                    Connect
                  </Button>
                )}
              </div>
            </div>

            {/* Desktop Navigation and Wallet Connection - hidden on mobile */}
            <div className="hidden lg:flex items-center space-x-3">
              {isConnected && publicKey ? (
                <>
                  {/* XP Badge — desktop */}
                  <div className="flex items-center bg-purple-700/50 border border-purple-400/40 rounded-md px-3 py-2 text-white text-xs font-bold gap-1.5">
                    <span className="text-purple-200">XP</span>
                    <span className="text-white/50">|</span>
                    <span className="text-green-400">{formatXP(userXP)}</span>
                  </div>
                  <Link href="/profile">
                    <Button
                      className="bg-purple-800/60 hover:bg-purple-700/60 backdrop-blur-sm rounded-md px-2 py-2 text-white text-xs border border-purple-500/30 flex items-center gap-1 h-auto"
                      data-testid="button-profile-desktop"
                    >
                      <User className="h-3 w-3" />
                      <span>Profile</span>
                    </Button>
                  </Link>
                  <div className="relative">
                    <button
                      onClick={() => setDesktopWalletMenuOpen(o => !o)}
                      className="bg-purple-800/60 hover:bg-purple-700/60 backdrop-blur-sm rounded-lg px-4 py-2 text-white font-mono text-sm border border-purple-500/30 outline-none"
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                      data-testid="button-wallet-connected-desktop"
                    >
                      {publicKey.toString().slice(0, 6)}...{publicKey.toString().slice(-6)}
                    </button>
                    {desktopWalletMenuOpen && (
                      <div className="fixed inset-0 z-40" onClick={() => setDesktopWalletMenuOpen(false)} />
                    )}
                    {desktopWalletMenuOpen && (
                      <div className="absolute right-0 top-full mt-1 z-50 bg-slate-800 border border-purple-500/30 rounded-md shadow-lg w-full overflow-hidden">
                        {publicKey?.toString() === 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT' && (
                          <>
                            <Link href="/admin/x-bot" onClick={() => setDesktopWalletMenuOpen(false)}>
                              <div className="px-3 py-2 text-white cursor-pointer text-sm text-center truncate" style={{ WebkitTapHighlightColor: 'transparent' }} data-testid="button-admin-xbot-desktop">🤖 X Bot Admin</div>
                            </Link>
                            <Link href="/x-admin" onClick={() => setDesktopWalletMenuOpen(false)}>
                              <div className="px-3 py-2 text-white cursor-pointer text-sm text-center truncate" style={{ WebkitTapHighlightColor: 'transparent' }} data-testid="button-x-admin-desktop">🐦 X Account</div>
                            </Link>
                          </>
                        )}
                        {canViewPartners && (
                          <Link href="/partners" onClick={() => setDesktopWalletMenuOpen(false)}>
                            <div className="px-3 py-2 text-yellow-300 hover:bg-purple-600/40 cursor-pointer text-sm text-center truncate">🤝 Partners</div>
                          </Link>
                        )}
                        <div
                          onClick={() => { disconnectWallet(); setDesktopWalletMenuOpen(false); }}
                          className="px-3 py-2 text-white cursor-pointer text-sm text-center truncate"
                          style={{ WebkitTapHighlightColor: 'transparent' }}
                          data-testid="button-disconnect-desktop"
                        >
                          Disconnect
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <Button
                  onClick={() => {
                    select(null);
                    setVisible(true);
                  }}
                  className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2 text-sm font-medium border border-purple-500/30 h-auto"
                  title="Connect your wallet - supports Phantom, Magic Eden, Solflare, Backpack, Coinbase, Bitget"
                  data-testid="button-connect-desktop"
                >
                  Connect Wallet
                </Button>
              )}
            </div>
              </>
            )}
          </div>



          {/* Description */}

          {isConnected && activeTab !== 'docs' && (
            <div className="text-center py-1">
              <p className="text-white max-w-2xl mx-auto text-2xl font-semibold">
{activeTab === 'referrals' ? 'Earn 50% commission from your referrals — just by helping others!' : activeTab === 'burnTokens' ? (burnSubTab === 'tokens' ? 'Burn Unwanted Tokens.' : 'Burn Unwanted NFTs.') : activeTab === 'swap' ? 'Swap tokens instantly. Earn 50% of MEV rebates!' : activeTab === 'statistics' ? 'Track rent recovery metrics and top performers' : activeTab === 'coinflip' ? 'Click, Flip, Snatch!' : activeTab === 'staking' ? 'Stake your SOL and earn yield.' : activeTab === 'reclaim' && claimSubTab === 'programs' ? 'Recover SOL from failed program deploys.' : 'Get your SOL back!'}
              </p>
            </div>
          )}


          {/* Center Navigation Buttons - desktop only (mobile uses bottom nav) */}
          {isConnected && activeTab !== 'docs' && (
            <div className="hidden md:block py-3 md:mx-0 md:px-2">
              <div className="flex items-center gap-2 md:gap-3 md:justify-center w-full">
                <Button
                  onClick={() => setActiveTab('reclaim')}
                  className={`md:w-[215px] px-4 py-3 text-xl font-semibold rounded-full transition-all flex items-center justify-center gap-2 border whitespace-nowrap ${
                    activeTab === 'reclaim' 
                      ? 'bg-purple-600 text-white border-purple-500' 
                      : 'bg-purple-800/40 text-white hover:bg-purple-600/60 border-purple-500/30'
                  }`}
                >
                  <svg className="h-5 w-5 shrink-0" viewBox="0 0 397.7 311.7" style={{ fill: '#00FFA3' }}>
                    <path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"/>
                    <path d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1L333.1,73.8c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"/>
                    <path d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z"/>
                  </svg>
                  Claim Rent
                </Button>
                <Button
                  onClick={() => { setActiveTab('burnTokens'); }}
                  className={`md:w-[215px] px-4 py-3 text-xl font-semibold rounded-full transition-all flex items-center justify-center gap-2 border whitespace-nowrap ${
                    activeTab === 'burnTokens'
                      ? 'bg-purple-600 text-white border-purple-500' 
                      : 'bg-purple-800/40 text-white hover:bg-purple-600/60 border-purple-500/30'
                  }`}
                >
                  <Flame className="h-5 w-5 shrink-0" /> Burn Tokens/NFTs
                </Button>
                {/* Statistics button - only visible to platform wallet */}
                {isPlatformWallet && (
                  <Button
                    onClick={() => setActiveTab('statistics')}
                    className={`hidden md:inline-flex px-5 py-2.5 text-base font-medium rounded-full transition-all items-center gap-2 border ${
                      activeTab === 'statistics' 
                        ? 'bg-purple-600 text-white border-purple-500' 
                        : 'bg-purple-800/40 text-white hover:bg-purple-600/60 border-purple-500/30'
                    }`}
                    data-testid="button-statistics"
                  >
                    <TrendingUp className="h-5 w-5" />
                    Statistics
                  </Button>
                )}
                {/* Swap button - only visible to platform wallet */}
                {isPlatformWallet && (
                  <Button
                    onClick={() => setActiveTab('swap')}
                    className={`flex-1 md:flex-none md:min-w-[100px] px-3 md:px-4 py-2.5 text-base md:text-lg font-semibold rounded-full transition-all flex items-center justify-center gap-1.5 md:gap-2 border whitespace-nowrap ${
                      activeTab === 'swap' 
                        ? 'bg-green-600 text-white border-green-500' 
                        : 'bg-purple-800/40 text-white hover:bg-green-600/60 border-purple-500/30'
                    }`}
                    data-testid="button-swap"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5 md:h-5 md:w-5 shrink-0" />
                    Swap
                  </Button>
                )}
                <Button
                  onClick={() => setActiveTab('coinflip')}
                  className={`md:w-[215px] px-4 py-3 text-xl font-semibold rounded-full transition-all flex items-center justify-center gap-2 border whitespace-nowrap ${
                    activeTab === 'coinflip'
                      ? 'bg-green-600 text-white border-green-500'
                      : 'bg-purple-800/40 text-white hover:bg-green-600/60 border-purple-500/30'
                  }`}
                  data-testid="button-coinflip"
                >
                  <img src="/coin_icon.png" alt="Coin Flip" className="h-5 w-5 object-contain shrink-0" /> Coin Flip
                </Button>
                <Button
                  onClick={() => setActiveTab('staking')}
                  id="staking-tab-btn"
                  className={`md:w-[215px] px-4 py-3 text-xl font-semibold rounded-full transition-all flex items-center justify-center gap-2 border whitespace-nowrap ${
                    activeTab === 'staking'
                      ? 'bg-purple-600 text-white border-purple-500'
                      : 'bg-purple-800/40 text-white hover:bg-purple-600/60 border-purple-500/30'
                  }`}
                >
                  <FaSackDollar className="h-5 w-5 shrink-0" /> Staking
                </Button>
                {canViewPerps && (
                  <Link href="/perps">
                    <Button
                      className="md:w-[215px] px-4 py-3 text-xl font-semibold rounded-full transition-all flex items-center justify-center gap-2 border whitespace-nowrap bg-purple-800/40 text-white hover:bg-purple-600/60 border-purple-500/30"
                    >
                      📈 Perps
                    </Button>
                  </Link>
                )}
                {canViewPartners && (
                  <Link href="/partners">
                    <Button
                      className="md:w-[215px] px-4 py-3 text-xl font-semibold rounded-full transition-all flex items-center justify-center gap-2 border whitespace-nowrap bg-yellow-600/20 text-yellow-300 hover:bg-yellow-600/40 border-yellow-500/40"
                    >
                      🤝 Partners
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          )}


          





          {/* Mobile-only: Claim + Burn 3-way sub-tabs */}
          {isConnected && (activeTab === 'reclaim' || activeTab === 'burnTokens') && (
            <div className="md:hidden flex items-center pb-2">
              <div className="flex items-center bg-purple-900/40 rounded-xl p-1 gap-1 w-full">
                <button
                  onClick={() => setActiveTab('reclaim')}
                  className={`flex-1 py-1.5 rounded-lg text-base font-semibold transition-all flex items-center justify-center gap-1.5 ${
                    activeTab === 'reclaim' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <svg style={{ width: '18px', height: '18px', fill: '#00FFA3', flexShrink: 0 }} viewBox="0 0 397.7 311.7">
                    <path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"/>
                    <path d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1L333.1,73.8c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"/>
                    <path d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z"/>
                  </svg>
                  Rent
                </button>
                <button
                  onClick={() => { setActiveTab('burnTokens'); setBurnSubTab('tokens'); }}
                  className={`flex-1 py-1.5 rounded-lg text-base font-semibold transition-all flex items-center justify-center gap-1 ${
                    activeTab === 'burnTokens' && burnSubTab === 'tokens' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  🪙 Tokens
                </button>
                <button
                  onClick={() => { setActiveTab('burnTokens'); setBurnSubTab('nft'); }}
                  className={`flex-1 py-1.5 rounded-lg text-base font-semibold transition-all flex items-center justify-center gap-1 ${
                    activeTab === 'burnTokens' && burnSubTab === 'nft' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  🖼️ NFTs
                </button>
              </div>
            </div>
          )}

          {/* Burn sub-nav: Token / NFT pill toggle — desktop only */}
          {isConnected && activeTab === 'burnTokens' && (
            <div className="hidden md:flex items-center justify-center pb-2">
              <div className={`flex items-center gap-2`}>
                <button
                  onClick={() => setBurnSubTab('tokens')}
                  className={`w-24 h-9 text-lg font-semibold rounded-md transition-all duration-200 border text-center flex items-center justify-center gap-1 ${
                    burnSubTab === 'tokens'
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'text-white border-purple-500/30 bg-purple-900/40'
                  }`}
                >
                  🪙 Token
                </button>

                <button
                  onClick={() => setBurnSubTab('nft')}
                  className={`w-24 h-9 text-lg font-semibold rounded-md transition-all duration-200 border text-center flex items-center justify-center gap-1 ${
                    burnSubTab === 'nft'
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'text-white border-purple-500/30 bg-purple-900/40'
                  }`}
                >
                  🖼️ NFT
                </button>
              </div>
            </div>
          )}

          {/* Reclaim SOL Results */}
          {activeTab === 'reclaim' && (
            <div className="space-y-4">
              {/* Empty Accounts Content */}
              {claimSubTab === 'empty' && !isConnected && (
                <div className={`backdrop-blur-sm rounded-xl p-6 md:p-10 ${
                  'bg-gradient-to-br from-purple-800/20 to-purple-900/30 border border-purple-500/20'
                }`}>
                  <div className="flex flex-col items-center gap-4 py-4 text-center">
                    <svg viewBox="0 0 397.7 311.7" className="w-8 h-8" xmlns="http://www.w3.org/2000/svg">
                      <path fill="#00FFA3" d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"/>
                      <path fill="#00FFA3" d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1L333.1,73.8c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"/>
                      <path fill="#00FFA3" d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z"/>
                    </svg>
                    <div>
                      <h3 className="text-lg md:text-xl font-bold text-white mb-1">Get your free SOL back!</h3>
                      <p className="text-white text-xs md:text-sm">Connect your wallet to scan and get back the SOL locked in your empty token accounts.</p>
                    </div>
                    <Button
                      onClick={() => { select(null); setVisible(true); }}
                      className="bg-purple-600 hover:bg-purple-700 text-white rounded-full px-6 py-2 text-sm font-semibold border border-purple-500/30"
                    >
                      Connect wallet
                    </Button>
                  </div>
                </div>
              )}
              {claimSubTab === 'empty' && isConnected && (
            <div className={`backdrop-blur-sm rounded-xl p-6 md:p-10 ${
              'bg-gradient-to-br from-purple-800/20 to-purple-900/30 border border-purple-500/20'
            }`}>
              <div className="mb-4 md:mb-8 flex items-center justify-between">
                <h3 className="text-lg md:text-2xl font-semibold text-white">Scan Results</h3>
                <button
                  onClick={() => publicKey && scanMutation.mutate(publicKey)}
                  disabled={scanMutation.isPending}
                  className="inline-flex items-center justify-center p-3 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 hover:border-purple-400/50 backdrop-blur-sm rounded-full text-white hover:text-white transition-all duration-200 disabled:opacity-50"
                  title="Refresh"
                >
                  <RefreshCw className={`h-6 w-6 ${scanMutation.isPending ? 'animate-spin' : ''}`} />
                </button>
              </div>
              {!scanResult ? (
                <div className="text-center text-white py-12">
                  {scanMutation.isPending ? 'Scanning wallet...' : 'Click refresh to scan your wallet'}
                </div>
              ) : (
                <>
                  {scanResult.emptyAccounts > 0 ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4 md:gap-6">
                    <div className="text-center p-4 md:p-8 bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm border border-purple-500/20 rounded-xl">
                      <div className="text-2xl md:text-5xl font-bold text-white">{scanResult.emptyAccounts}</div>
                      <div className="text-xs md:text-base text-white mt-1">Empty Accounts</div>
                    </div>
                    <div className="text-center p-4 md:p-8 bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm border border-purple-500/20 rounded-xl">
                      <div className="text-2xl md:text-5xl font-bold text-green-400">+{refundCalc.net.toFixed(6)}</div>
                      <div className="text-xs md:text-base text-white mt-1">To Claim</div>
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
                    className="w-full bg-gradient-to-br from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white py-4 md:py-7 text-lg md:text-2xl font-semibold rounded-lg transition-all duration-200 shadow-lg"
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
                <div className="py-4 text-center">
                  <Layers className="h-8 w-8 text-purple-400 mx-auto mb-2 opacity-70" />
                  <h4 className="text-sm font-medium text-white mb-0.5">No empty accounts found</h4>
                  <p className="text-white text-xs">
                    Your wallet is clean!
                  </p>
                </div>
              )}
                </>
              )}
            </div>
              )}

              {/* Statistics - above sponsor */}
              <div className="mb-3">
                {/* Mobile */}
                <div className="flex md:hidden bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20">
                  <div className="flex-1 p-5 text-center">
                    <div className="text-3xl font-bold text-white mb-1">
                      {stats ? (Math.floor(stats.totalSolRecovered * 100) / 100).toFixed(2) : '0.00'}
                    </div>
                    <div className="text-xs text-white uppercase tracking-wider">SOL RECOVERED</div>
                  </div>
                  <div className="w-px bg-purple-500/30 my-4" />
                  <div className="flex-1 p-5 text-center">
                    <div className="text-3xl font-bold text-white mb-1">
                      {stats ? (stats.totalAccountsClaimed / 1000).toFixed(3) : '0.000'}
                    </div>
                    <div className="text-xs text-white uppercase tracking-wider">ACCOUNTS CLOSED</div>
                  </div>
                </div>
                {/* Desktop */}
                <div className="hidden md:flex bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20">
                  <div className="flex-1 p-6 text-center">
                    <div className="text-3xl font-bold text-white mb-2">
                      {stats ? (Math.floor(stats.totalSolRecovered * 100) / 100).toFixed(2) : '0.00'}
                    </div>
                    <div className="text-sm text-white uppercase tracking-wider">SOL RECOVERED</div>
                  </div>
                  <div className="w-px bg-purple-500/30 my-5" />
                  <div className="flex-1 p-6 text-center">
                    <div className="text-3xl font-bold text-white mb-2">
                      {stats ? (stats.totalAccountsClaimed / 1000).toFixed(3) : '0.000'}
                    </div>
                    <div className="text-sm text-white uppercase tracking-wider">ACCOUNTS CLOSED</div>
                  </div>
                </div>
              </div>

              {/* SPONSOR CARD */}
              <a
                href="https://greencandle.gg/?ref=7B976Y"
                target="_blank"
                rel="noopener noreferrer"
                className="group block mt-3 hover:scale-[1.01] transform transition-all duration-200"
              >
                <div className="rounded-xl overflow-hidden relative">
                  <img
                    src={greenCandleBanner}
                    alt="GreenCandle.gg — Unlock Free SOL"
                    className="w-full h-auto"
                  />
                  <div className="absolute top-0 right-0 bg-black/60 text-white text-[9px] md:text-sm font-semibold tracking-wider uppercase px-1.5 md:px-3 py-px md:py-1 rounded-bl">
                    SPONSORED
                  </div>
                  <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <div className="flex items-center gap-1.5 bg-black/70 text-white text-xs font-semibold px-3 py-1 rounded-full">
                      Learn More
                      <ExternalLink className="h-3 w-3" />
                    </div>
                  </div>
                </div>
              </a>
            </div>
          )}

          {/* Burn Connect Card - when not connected */}
          {activeTab === 'burnTokens' && !isConnected && (
            <div className={`backdrop-blur-sm rounded-xl p-6 md:p-10 ${
              'bg-gradient-to-br from-purple-800/20 to-purple-900/30 border border-purple-500/20'
            }`}>
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <Flame className="w-8 h-8 text-orange-400" />
                <div>
                  <h3 className="text-lg md:text-xl font-bold text-white mb-1">Burn tokens & NFTs, get SOL back!</h3>
                  <p className="text-white text-xs md:text-sm">Connect your wallet to scan and burn unwanted tokens or NFTs.</p>
                </div>
                <Button
                  onClick={() => { select(null); setVisible(true); }}
                  className="bg-purple-600 hover:bg-purple-700 text-white rounded-full px-6 py-2 text-sm font-semibold border border-purple-500/30"
                >
                  Connect wallet
                </Button>
              </div>
            </div>
          )}

          {/* Burn Tokens Results */}
          {isConnected && activeTab === 'burnTokens' && burnSubTab === 'tokens' && (
            <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6 md:p-10">
              {/* Header */}
              <div className="flex items-center justify-between mb-4 md:mb-8">
                <div>
                  <h3 className="text-xl md:text-3xl font-semibold text-white">{tokenList.length} Tokens Found</h3>
                  {scanTokensMutation.isPending && (
                    <p className="text-xs text-white mt-1">Scanning wallet...</p>
                  )}
                </div>
                
                <div className="flex items-center gap-3">
                  {/* Burn/Swap Toggle Switch - Desktop only (next to refresh) */}
                  <div className="hidden md:flex items-center gap-3">
                    <span className={`text-base font-bold ${burnMode === 'burn' ? 'text-red-400' : 'text-purple-400'}`}>Burn</span>
                    <button
                      onClick={() => setBurnMode(burnMode === 'burn' ? 'swap' : 'burn')}
                      className={`relative w-14 h-7 rounded-full transition-colors duration-200 ${
                        burnMode === 'swap' ? 'bg-green-600' : 'bg-red-600'
                      }`}
                      title={burnMode === 'burn' ? 'Switch to Swap' : 'Switch to Burn'}
                    >
                      <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform duration-200 ${
                        burnMode === 'swap' ? 'translate-x-8' : 'translate-x-1'
                      }`} />
                    </button>
                    <span className={`text-base font-bold ${burnMode === 'swap' ? 'text-green-400' : 'text-purple-400'}`}>Swap</span>
                  </div>
                  
                  {/* Refresh Button */}
                  <button 
                    onClick={() => {
                      if (publicKey) {
                        scanTokensMutation.mutate(publicKey.toString());
                      }
                    }}
                    disabled={scanTokensMutation.isPending || !publicKey}
                    className="inline-flex items-center justify-center p-3 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 hover:border-purple-400/50 backdrop-blur-sm rounded-full text-white hover:text-white transition-all duration-200 disabled:opacity-50"
                    data-testid="button-refresh-tokens"
                    title="Refresh"
                  >
                    <RefreshCw className={`h-6 w-6 ${scanTokensMutation.isPending ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
              
              {/* Burn/Swap Toggle Switch - Mobile only (under header) */}
              <div className="flex md:hidden items-center gap-3 mb-6">
                <span className={`text-base font-bold ${burnMode === 'burn' ? 'text-red-400' : 'text-purple-400'}`}>Burn</span>
                <button
                  onClick={() => setBurnMode(burnMode === 'burn' ? 'swap' : 'burn')}
                  className={`relative w-14 h-7 rounded-full transition-colors duration-200 ${
                    burnMode === 'swap' ? 'bg-green-600' : 'bg-red-600'
                  }`}
                  title={burnMode === 'burn' ? 'Switch to Swap' : 'Switch to Burn'}
                >
                  <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform duration-200 ${
                    burnMode === 'swap' ? 'translate-x-8' : 'translate-x-1'
                  }`} />
                </button>
                <span className={`text-base font-bold ${burnMode === 'swap' ? 'text-green-400' : 'text-purple-400'}`}>Swap</span>
              </div>

              {/* Value Filter Buttons - Always visible */}
              <div className="mb-6 space-y-3">
                <p className="text-sm text-green-400 font-medium">
                  {currentMaxTokenValue === null 
                    ? 'All tokens being displayed.'
                    : `Showing tokens worth up to $${currentMaxTokenValue}.`}
                </p>

                <div className="flex gap-2 md:gap-3 flex-wrap">
                  {[['$1', 0], ['$10', 1], ['$30', 2], ['$100', 3], ['All', 4]].map(([label, index]) => (
                    <button
                      key={label}
                      onClick={() => setMaxTokenValueIndex(index as number)}
                      data-testid={`filter-btn-${label}`}
                      className={`px-4 py-2 md:px-7 md:py-3 rounded-xl text-sm md:text-base font-bold border transition-all ${
                        maxTokenValueIndex === index
                          ? 'bg-purple-600 text-white border-purple-400'
                          : 'bg-purple-900/30 text-white border-purple-500/30 hover:bg-purple-800/40 hover:border-purple-400/60'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <p className="text-xs text-yellow-400 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>These filters cannot be 100% accurate. Always double check the items you're about to {burnMode === 'swap' ? 'swap' : 'burn'}.</span>
                </p>
              </div>

              {tokenList.length === 0 ? (
                <div className="text-center py-12">
                  <div className="inline-block bg-purple-900/30 rounded-full p-4 mb-4">
                    <Flame className="h-12 w-12 text-purple-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">No Tokens Found</h3>
                  <p className="text-white text-sm">Scan your wallet to find tokens available for burning.</p>
                </div>
              ) : (
                <>
                  {/* Token Count */}
                  {filteredTokenList.length < tokenList.length && (
                    <p className="text-sm text-white mb-3">
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
                          <Coins className="h-6 w-6 text-white" />
                        </div>
                      )}
                    </div>

                    {/* Token Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-lg font-semibold text-white truncate">
                        {token.symbol || token.name || 'Unknown Token'}
                      </div>
                      <div className="text-sm text-white">
                        Balance: {token.balance < 1000 ? Number(token.balance.toFixed(6)) : token.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} {token.symbol || ''}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white font-mono truncate">
                          {token.mint.slice(0, 8)}...{token.mint.slice(-8)}
                        </span>
                        {token.usdPrice && token.usdPrice > 0 && (
                          <span className="text-sm text-green-400 font-medium">
                            ${token.usdValue.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>

                    {selectedTokens.has(token.mint) && (
                      <div className="absolute top-2 right-2">
                        <div className={`${burnMode === 'swap' ? 'bg-green-600' : 'bg-red-600'} text-white text-xs font-bold px-3 py-1 rounded-md pointer-events-none whitespace-nowrap`}>
                          {burnMode === 'swap' ? 'MARKED FOR SWAP' : 'MARKED FOR BURN'}
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
                  <div className="text-sm text-white mb-2">
                    Total Selected: {selectedTokens.size} token{selectedTokens.size !== 1 ? 's' : ''} (~{calculateTotalSOL(selectedTokens.size)} SOL net)
                  </div>
                </div>

                {/* Action Button - Burn or Swap */}
                <Button
                  onClick={() => {
                    if (burnMode === 'burn') {
                      bulkBurnTokensMutation.mutate(Array.from(selectedTokens));
                    } else {
                      bulkSwapTokensMutation.mutate(Array.from(selectedTokens));
                    }
                  }}
                  disabled={selectedTokens.size === 0 || bulkBurnTokensMutation.isPending || bulkSwapTokensMutation.isPending}
                  className={`w-full py-4 text-lg font-bold rounded-xl transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                    burnMode === 'burn'
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                  data-testid="button-burn-selected-tokens"
                >
                  {bulkBurnTokensMutation.isPending ? (
                    <>
                      <RefreshCw className="h-5 w-5 animate-spin" />
                      Burning...
                    </>
                  ) : bulkSwapTokensMutation.isPending ? (
                    <>
                      <RefreshCw className="h-5 w-5 animate-spin" />
                      Swapping...
                    </>
                  ) : burnMode === 'burn' ? (
                    <>
                      <Flame className="h-5 w-5" />
                      BURN
                    </>
                  ) : (
                    <>
                      <ArrowRightLeft className="h-5 w-5" />
                      SWAP
                    </>
                  )}
                </Button>
                
              </div>

              {/* Instructions - Dynamic based on mode */}
              <div className="bg-purple-900/20 border border-purple-500/20 rounded-lg p-4 mt-4">
                <div className="flex items-start space-x-3">
                  <Info className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-white">
                    {burnMode === 'burn' ? (
                      <>
                        <p className="font-medium mb-2">About Token Burning:</p>
                        <ul className="space-y-1 text-white">
                          <li>• Burn unwanted tokens and recover SOL rent deposits</li>
                          <li>• Burning permanently destroys the tokens</li>
                          <li>• You receive 90% of recovered SOL (10% platform fee)</li>
                        </ul>
                      </>
                    ) : (
                      <>
                        <p className="font-medium mb-2">About Token Swap:</p>
                        <ul className="space-y-1 text-white">
                          <li>• Swap tokens to SOL before closing the account</li>
                          <li>• Get the token value + rent deposit back</li>
                          <li>• Swap and close account in a single transaction</li>
                        </ul>
                      </>
                    )}
                  </div>
                </div>
                
                {/* Warning Disclaimer */}
                <div className="mt-3 bg-yellow-900/20 border-l-4 border-yellow-500 p-3 rounded">
                  <div className="flex items-start space-x-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-yellow-200 font-semibold">
                      {burnMode === 'burn' 
                        ? "Burning tokens can't be undone. By using GetFreeSOL, you agree it's on you — we're not responsible for mistakes or accidental burns."
                        : "Swaps are executed at current market rates. Slippage may apply. By using GetFreeSOL, you agree it's on you."}
                    </p>
                  </div>
                </div>
              </div>
                </>
              )}
            </div>
          )}

          {/* NFT Burning Interface */}
          {isConnected && activeTab === 'burnTokens' && burnSubTab === 'nft' && (
            <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6 md:p-10">
              {/* Header */}
              <div className="flex items-center justify-between mb-6 md:mb-8">
                <div>
                  <h3 className="text-xl md:text-3xl font-semibold text-white">
                    {(() => {
                      const visibleCount = nftData?.nfts?.filter((nft: any) => nft.type !== 'cnft').length ?? 0;
                      return visibleCount > 0 ? `${visibleCount} NFTs Found` : 'NFT Scanner';
                    })()}
                  </h3>
                  {scanNftsMutation.isPending && (
                    <p className="text-xs text-white mt-1">Scanning wallet...</p>
                  )}
                </div>
                <button 
                  onClick={() => {
                    if (publicKey) {
                      scanNftsMutation.mutate(publicKey.toString());
                    }
                  }}
                  disabled={scanNftsMutation.isPending || !publicKey}
                  className="inline-flex items-center justify-center p-2 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 hover:border-purple-400/50 backdrop-blur-sm rounded-full text-white hover:text-white transition-all duration-200 disabled:opacity-50"
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
                  <p className="text-white">Scanning for NFTs...</p>
                </div>
              ) : nftData && nftData.nfts && nftData.nfts.length > 0 ? (
                (() => {
                  const filteredNfts = nftData.nfts.filter((nft: any) => nft.type !== 'cnft');

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
                        <p className="text-white max-w-md mx-auto">
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
                            
                            {/* FROZEN badge for frozen NFTs (top-right corner) - NOT shown for pNFTs since they're always frozen by design */}
                            {isFrozen && nft.type !== 'pnft' && (
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
                                  nft.type === 'pnft' ? 'bg-purple-500/20 text-white' :
                                  nft.type === 'ocp' ? 'bg-green-500/20 text-green-300' :
                                  nft.type === 'core' ? 'bg-orange-500/20 text-orange-300' :
                                  'bg-gray-500/20 text-gray-300'
                                }`}>
                                  {nft.type.toUpperCase()}
                                </span>
                              </div>
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
                      const visibleNfts = nftData.nfts.filter((nft: any) => nft.type !== 'cnft');
                      return visibleNfts.length > 0 ? (
                        <div className="flex gap-3">
                          <Button
                            onClick={() => {
                              const selectableNfts = nftData.nfts
                                .filter((nft: any) => nft.type !== 'cnft')
                                .map((nft: any) => nft.mint || nft.id || nft.assetId)
                                .filter(Boolean);
                              setSelectedNfts(new Set(selectableNfts));
                            }}
                            className="flex-1 bg-purple-900/60 hover:bg-purple-800/70 text-white border border-purple-600/40 rounded-xl py-3"
                            data-testid="button-select-all-nfts"
                          >
                            Select All NFTs
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
                      <div className="text-sm text-white mb-2">Total Selected: {selectedNfts.size} NFT{selectedNfts.size !== 1 ? 's' : ''}</div>
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
                  <p className="text-white">Scan your wallet to find NFTs in your collection.</p>
                </div>
              ) : null}

              {/* Burn Instructions */}
              <div className="bg-purple-900/20 border border-purple-500/20 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Info className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-white">
                    <p className="font-medium mb-2">About NFT Burning:</p>
                    <ul className="space-y-1 text-white">
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
                      <p className="text-sm text-white">
                        Connect your wallet to automatically generate your referral link
                      </p>
                    </div>
                    <div className="text-center space-y-2">
                      <div className="w-12 h-12 bg-green-500/20 border border-green-500/30 rounded-full flex items-center justify-center mx-auto">
                        <Users className="w-6 h-6 text-green-400" />
                      </div>
                      <h3 className="font-semibold text-white">Share</h3>
                      <p className="text-sm text-white">
                        Share with your friends
                      </p>
                    </div>
                    <div className="text-center space-y-2">
                      <div className="w-12 h-12 bg-purple-500/20 border border-purple-500/30 rounded-full flex items-center justify-center mx-auto">
                        <DollarSign className="w-6 h-6 text-purple-400" />
                      </div>
                      <h3 className="font-semibold text-white">Earn</h3>
                      <p className="text-sm text-white">
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
                  <div className="text-sm text-white uppercase tracking-wider">
                    Total Earnings
                  </div>
                </div>

                <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6 text-center">
                  <div className="text-3xl font-bold text-white mb-2">
                    {(userReferrals as any)?.referralCode?.stats?.totalReferrals || '0'}
                  </div>
                  <div className="text-sm text-white uppercase tracking-wider">
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
                  <p className="text-white text-sm mt-1">Earn 50% of the fees from referred users!</p>
                </div>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-white">Referral Link</Label>
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
                        className="bg-purple-800/20 border-purple-500/30 text-white hover:bg-purple-700/30 hover:text-white"
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
                  <p className="text-white text-sm mt-2">
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
                            <p className="text-xs text-white">
                              {tx.paidAt ? new Date(tx.paidAt).toLocaleString() : 'Date unavailable'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-green-400">
                              +{tx.referralFeeAmount || '0'} SOL
                            </p>
                            <p className="text-xs text-white">
                              From {tx.originalFeeAmount || '0'} SOL fee
                            </p>
                          </div>
                        </div>
                        <Separator className="bg-purple-500/30" />
                        <div className="flex justify-between text-xs text-white">
                          <span>Transaction: {tx.transactionSignature?.slice(0, 12)}...</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(`https://solscan.io/tx/${tx.transactionSignature}`, "_blank")}
                            className="text-white hover:text-white hover:bg-purple-700/30"
                          >
                            View on Solscan
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-white">No referral transactions yet</p>
                      <p className="text-sm text-purple-400 mt-2">Share your referral link to start earning!</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Coin Flip Tab Content */}
          {activeTab === 'coinflip' && (
            <>
              <CoinFlipGame />
              <div className="mt-10 space-y-6">
                <div>
                  <p className="text-white font-black uppercase tracking-wider text-xl mb-4">How It Works</p>
                  <ul className="space-y-3 list-disc list-inside text-white text-xl">
                    <li>Pick <span className="text-green-400 font-bold">Green</span> or <span className="text-red-400 font-bold">Red</span>, place your bet, and flip.</li>
                    <li>Win = <span className="text-white font-bold">2x</span> your bet. Lose = you lose your bet.</li>
                  </ul>
                </div>
              </div>
            </>
          )}

          {/* Staking Page */}
          {activeTab === 'staking' && (
            <div className="space-y-6">

              {/* Confetti burst on stake success */}
              {stakeSuccessData && <Confetti />}

              {/* Stake Success Card */}
              {stakeSuccessData && (
                <div
                  className="fixed inset-0 z-[70] flex items-center justify-center p-4"
                  onClick={() => setStakeSuccessData(null)}
                >
                  <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
                  <div
                    className="relative w-full max-w-xs rounded-3xl shadow-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900"
                    style={{ animation: '0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards modalBounce', border: '1px solid rgba(153, 69, 255, 0.35)' }}
                    onClick={e => e.stopPropagation()}
                  >
                    {/* Close */}
                    <button
                      onClick={() => setStakeSuccessData(null)}
                      className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full text-white/40 hover:text-white/80 z-10 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>

                    <div className="flex flex-col items-center px-6 pt-8 pb-6">
                      {/* Solana logo */}
                      <img src="/solana-logo.png" alt="GSOL" className="w-14 h-14 rounded-full mb-3 shadow-lg" />
                      <h2 className="text-white font-bold text-xl mb-3">Successfully Staked</h2>

                      {/* Staked + Minted rows */}
                      <div
                        className="w-full rounded-2xl py-3 px-4 mb-2"
                        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-white text-sm">You staked</span>
                          <span className="text-white font-bold text-lg">{stakeSuccessData.amount} SOL</span>
                        </div>
                        {stakeSuccessData.gsolReceived !== undefined && (
                          <>
                            <div className="h-px my-2" style={{ background: 'rgba(255,255,255,0.08)' }} />
                            <div className="flex justify-between items-center">
                              <span className="text-white text-sm">Minted</span>
                              <span className="font-bold text-lg whitespace-nowrap" style={{ color: 'rgb(20,241,149)' }}>+{stakeSuccessData.gsolReceived.toFixed(6)} GSOL</span>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Transaction link */}
                      {stakeSuccessData.txid && (
                        <div className="w-full flex flex-col justify-center items-center mt-2 mb-2 gap-1">
                          <span className="text-white text-sm">Transaction</span>
                          <a
                            href={`https://solscan.io/tx/${stakeSuccessData.txid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-white font-bold text-base hover:text-purple-300 transition-colors"
                          >
                            {stakeSuccessData.txid.slice(0, 7)}…{stakeSuccessData.txid.slice(-4)}
                            <ExternalLink className="w-4 h-4 opacity-80" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* How to Choose modal */}
              {showHowToChoose && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowHowToChoose(false)}>
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                  <div
                    className={`relative w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border ${'bg-purple-900/80 border-purple-500/30 backdrop-blur-md'}`}
                    onClick={e => e.stopPropagation()}
                  >
                    {/* Question mark badge top-right */}
                    <div className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                      <span className="text-white/60 font-bold text-base">?</span>
                    </div>

                    <div className="p-6 pt-7">
                      <h2 className="text-white font-black text-xl mb-1">Choosing How You Stake</h2>
                      <p className="text-white text-sm mb-6">Direct deposit or via Jupiter</p>

                      <div className="space-y-5 text-sm text-white leading-relaxed">
                        <div>
                          <p className="text-white font-bold mb-1">Direct deposit:</p>
                          <p>Stake your SOL directly into the LST's stake pool to mint the LST at the current exchange rate. There's <strong className="text-white">no price impact</strong>, and you'll <strong className="text-white">only pay the pool's deposit fee (if any)</strong>.</p>
                          <p className="mt-2 text-white">Choose this if you prefer predictable fees or if deposit vs. swap matters for tax purposes in your jurisdiction.</p>
                        </div>

                        <div>
                          <p className="text-white font-bold mb-1">Via Jupiter:</p>
                          <p>Swap SOL for LST via Jupiter, which finds the best available price across Solana, including Sanctum's Infinity Pool and Router. <strong className="text-white">Fees and price impact vary</strong> by route.</p>
                          <p className="mt-2 text-white">Choose this if you're open to variable pricing and want a potentially better deal.</p>
                        </div>

                        <p className="text-white">In both cases, you'll receive your LST instantly and start earning staking rewards right away.</p>

                        <p className="text-white italic text-xs">This is not financial advice, do your own research.</p>
                      </div>

                      <button
                        onClick={() => setShowHowToChoose(false)}
                        className="mt-6 w-full py-3.5 rounded-2xl bg-purple-600 hover:bg-purple-500 border border-purple-400/50 text-white font-bold text-base transition-all shadow-lg shadow-purple-900/30"
                      >
                        Got it
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Rewards Info modal */}
              {showRewardsInfo && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowRewardsInfo(false)}>
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                  <div
                    className={`relative w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border ${'bg-purple-900/80 border-purple-500/30 backdrop-blur-md'}`}
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                      <span className="text-white/60 font-bold text-base">?</span>
                    </div>
                    <div className="p-6 pt-7">
                      <h2 className="text-white font-black text-xl mb-1">How Rewards Are Estimated</h2>
                      <p className="text-white text-sm mb-5">Based on 10-epoch average APY</p>
                      <p className="text-white text-sm leading-relaxed mb-6">
                        The projected SOL value is an estimate based on the average APY from the last 10 epochs. It reflects recent performance trends but does <strong>not guarantee future returns</strong>.
                      </p>
                      <button
                        onClick={() => setShowRewardsInfo(false)}
                        className="w-full py-3.5 rounded-2xl bg-purple-600 hover:bg-purple-500 border border-purple-400/50 text-white font-bold text-base transition-all shadow-lg shadow-purple-900/30"
                      >
                        Got it
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className={`rounded-2xl p-6 md:p-10 border ${'bg-gradient-to-br from-blue-900/20 to-purple-900/30 border-blue-500/20'}`}>
                {/* Powered by Sanctum */}
                <div className="flex items-center justify-center mb-6">
                  <a href="https://app.sanctum.so/explore/GSOL" target="_blank" rel="noopener noreferrer"
                     className="inline-flex items-center gap-0 hover:opacity-80 transition-opacity">
                    <span className="text-white font-bold text-xl">Powered by</span>
                    <img src="/sanctum-logo-cropped.png" alt="Sanctum" className="h-8 object-contain ml-1" style={{ mixBlendMode: 'lighten' }} />
                  </a>
                </div>
                {/* GSOL Staking Module */}
                <div className="mb-6 max-w-2xl mx-auto">
                  {/* Header */}
                  <div className="flex items-center gap-4 mb-6">
                    <img src="/gsol-token-logo.png?v=6" alt="GSOL" className="w-14 h-14 rounded-full object-cover" />
                    <div>
                      <h3 className="text-white font-black text-2xl">GSOL</h3>
                      <p className="text-white text-sm">GetFreeSol Liquid Staking Token</p>
                    </div>
                  </div>

                  {/* APY + Est. rewards row — no card, just two cols with a divider */}
                  <div className="flex mb-4">
                    {/* Left: APY */}
                    <div className="flex-1 flex flex-col items-center pr-5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-white text-xs font-medium">GSOL APY</span>
                        <HelpCircle className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-black text-2xl">
                          {gsolApy !== null ? `${gsolApy.toFixed(2)}%` : '—'}
                        </span>
                        <img src="/gsol-token-logo.png?v=6" alt="GSOL" className="w-5 h-5 rounded-full object-contain" />
                      </div>
                    </div>
                    {/* Vertical divider */}
                    <div className="w-px bg-white/20 self-stretch" />
                    {/* Right: Est. rewards per year */}
                    <div className="flex-1 flex flex-col items-center pl-5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-white text-xs font-medium">Est. rewards per year</span>
                        <button onClick={() => setShowRewardsInfo(true)} className="text-white hover:text-white/80 transition-colors">
                          <HelpCircle className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-black text-2xl">
                          {stakeAmount && gsolApy
                            ? `${(parseFloat(stakeAmount) * gsolApy / 100).toFixed(4)}`
                            : '0'}{' '}
                          <span className="text-white font-semibold text-base">SOL</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* TVL + Holders + Exchange Rate row */}
                  <div className="flex mb-6 border-t border-white/10 pt-4">
                    {/* TVL */}
                    <div className="flex-1 flex flex-col items-center">
                      <span className="text-white/60 text-xs mb-1">TVL</span>
                      <span className="text-white font-semibold text-sm">
                        {gsolTvl !== null
                          ? (() => {
                              const sol = gsolTvl / 1e9;
                              return sol >= 1000 ? `${(sol / 1000).toFixed(1)}K SOL` : `${sol.toFixed(2)} SOL`;
                            })()
                          : '—'}
                      </span>
                    </div>
                    <div className="w-px bg-white/10 self-stretch" />
                    {/* Holders */}
                    <div className="flex-1 flex flex-col items-center">
                      <span className="text-white/60 text-xs mb-1">Holders</span>
                      <span className="text-white font-semibold text-sm">
                        {gsolHolders !== null ? gsolHolders.toLocaleString() : '—'}
                      </span>
                    </div>
                    <div className="w-px bg-white/10 self-stretch" />
                    {/* Exchange Rate */}
                    <div className="flex-1 flex flex-col items-center">
                      <span className="text-white/60 text-xs mb-1">1 GSOL</span>
                      <span className="text-white font-semibold text-sm">
                        {gsolSolValue > 1 ? `${gsolSolValue.toFixed(4)} SOL` : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Stake / Unstake toggle */}
                  <div className={`relative flex rounded-2xl p-1.5 mb-6 border border-white/30 ${'bg-purple-900/30'}`}>
                    <div
                      className="absolute top-1.5 bottom-1.5 rounded-xl bg-purple-600 transition-all duration-300"
                      style={{ width: 'calc(50% - 6px)', left: stakeMode === 'stake' ? '6px' : 'calc(50%)' }}
                    />
                    <button onClick={() => setStakeMode('stake')} className={`relative z-10 flex-1 py-3.5 text-base font-black rounded-xl transition-colors duration-300 ${stakeMode === 'stake' ? 'text-white' : 'text-purple-400'}`}>Stake</button>
                    <button onClick={() => setStakeMode('unstake')} className={`relative z-10 flex-1 py-3.5 text-base font-black rounded-xl transition-colors duration-300 ${stakeMode === 'unstake' ? 'text-white' : 'text-purple-400'}`}>Unstake</button>
                  </div>

                  {/* You're staking card */}
                  <div className="rounded-2xl p-5 mb-4 bg-purple-900/20 border border-white/30">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-white font-medium text-base">{stakeMode === 'stake' ? "You're staking" : "You're unstaking"}</span>
                      <div className="flex items-center gap-1.5 text-white text-xs">
                        <span>
                          {stakeMode === 'stake'
                            ? `≈ ${publicKey ? walletTokenBalance.toFixed(4) : '—'} SOL`
                            : `≈ ${publicKey ? gsolBalance.toFixed(4) : '—'} GSOL`}
                        </span>
                        <button onClick={() => setStakeAmount(stakeMode === 'stake' ? (walletTokenBalance * 0.5).toFixed(4) : (gsolBalance * 0.5).toFixed(9).replace(/\.?0+$/, ''))} data-testid="button-half" className="text-xs text-white font-bold px-2 py-0.5 rounded-md bg-purple-500/20 hover:bg-purple-500/40 border border-purple-500/30 transition-all">HALF</button>
                        <button onClick={() => setStakeAmount(stakeMode === 'stake' ? Math.max(0, walletTokenBalance - 0.005).toFixed(4) : (Math.floor(gsolBalance * 1e9) / 1e9).toString())} data-testid="button-max" className="text-xs text-white font-bold px-2 py-0.5 rounded-md bg-purple-500/20 hover:bg-purple-500/40 border border-purple-500/30 transition-all">MAX</button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 shrink-0">
                        {stakeMode === 'stake' ? (
                          <>
                            <img alt="SOL" width={28} height={28} className="rounded-full" src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png" />
                            <span className="font-semibold text-white text-base">SOL</span>
                          </>
                        ) : (
                          <>
                            <img alt="GSOL" width={28} height={28} className="rounded-full object-cover" src="/gsol-token-logo.png?v=6" />
                            <span className="font-semibold text-white text-base">GSOL</span>
                          </>
                        )}
                      </div>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={stakeAmount}
                        onChange={e => setStakeAmount(e.target.value)}
                        className="flex-1 bg-transparent text-white text-3xl font-black outline-none text-right min-w-0 placeholder:text-white/30"
                      />
                    </div>
                  </div>

                  {/* Exchange rate inline row */}
                  <div className="flex justify-between items-center px-1 mb-4 text-white text-sm">
                    <span>Exchange rate</span>
                    <span>
                      {stakeMode === 'stake'
                        ? `1 SOL ≈ ${gsolSolValue > 0 ? (1 / gsolSolValue).toFixed(6) : '—'} GSOL`
                        : `1 GSOL ≈ ${gsolSolValue > 0 ? gsolSolValue.toFixed(6) : '—'} SOL`}
                    </span>
                  </div>

                  {/* You receive card */}
                  <div className="rounded-2xl p-5 mb-5 bg-purple-900/20 border border-white/30">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-white font-medium text-base">You receive</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 shrink-0">
                        {stakeMode === 'stake' ? (
                          <>
                            <img src="/gsol-token-logo.png?v=6" alt="GSOL" width={28} height={28} className="rounded-full object-contain" />
                            <span className="font-semibold text-white text-base">GSOL</span>
                          </>
                        ) : (
                          <>
                            <img src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png" alt="SOL" width={28} height={28} className="rounded-full" />
                            <span className="font-semibold text-white text-base">SOL</span>
                          </>
                        )}
                      </div>
                      <span className="flex-1 text-white text-3xl font-black text-right min-w-0">
                        {stakingMethod === 'direct'
                          ? (stakeAmount && parseFloat(stakeAmount) > 0
                              ? (stakeMode === 'stake'
                                  ? (parseFloat(stakeAmount) / (gsolSolValue > 0 ? gsolSolValue : 1)).toFixed(6)
                                  : (parseFloat(stakeAmount) * gsolSolValue).toFixed(6))
                              : '0.00')
                          : stakeQuoteLoading
                            ? <span className="text-purple-300 text-2xl animate-pulse">...</span>
                            : stakeQuote
                              ? (stakeQuote.outputAmount / 1e9).toFixed(6)
                              : '0.00'}
                      </span>
                    </div>
                  </div>

                  {/* Stake Method selector — hidden on Unstake tab */}
                  <div className={`mb-5 ${stakeMode === 'unstake' ? 'hidden' : ''}`}>
                    {/* Header row */}
                    <div className="flex flex-col gap-2 mb-3 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-white font-semibold text-sm whitespace-nowrap">
                        {stakeMode === 'stake' ? 'Stake Method' : 'Unstake Method'}
                        <button
                          onClick={() => setShowHowToChoose(true)}
                          className="text-white hover:text-white/80 font-normal ml-1.5 underline underline-offset-2 cursor-pointer transition-colors"
                        >(How to choose?)</button>
                      </span>
                      {/* Pill toggle */}
                      <div className="flex rounded-full p-1 bg-white/10 border border-white/15 gap-0.5 w-full sm:w-auto">
                        <button
                          onClick={() => setStakingMethod('direct')}
                          className={`flex-1 sm:flex-none px-6 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-200 ${
                            stakingMethod === 'direct'
                              ? 'bg-white text-gray-900 shadow-sm'
                              : 'text-white hover:text-white/80'
                          }`}
                        >
                          Direct deposit
                        </button>
                        <button
                          onClick={() => setStakingMethod('jupiter')}
                          className={`flex-1 sm:flex-none px-6 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-200 ${
                            stakingMethod === 'jupiter'
                              ? 'bg-white text-gray-900 shadow-sm'
                              : 'text-white hover:text-white/80'
                          }`}
                        >
                          Via Jupiter
                        </button>
                      </div>
                    </div>

                    {/* Method detail card */}
                    <div className={`rounded-xl px-4 py-3.5 border border-white/10 flex items-start gap-3 ${'bg-white/8'}`}>
                      {stakingMethod === 'direct' ? (
                        <>
                          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-white">
                              <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-bold text-sm leading-tight">Direct deposit</p>
                            <p className="text-white text-xs mt-0.5 whitespace-nowrap">{stakeMode === 'stake' ? 'Mint LST via stake pool' : 'Redeem via stake pool'}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-green-400 text-xs font-bold leading-tight">0% Deposit Fee</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0">
                            <img src="https://jup.ag/favicon.ico" alt="Jupiter" className="w-8 h-8 object-cover" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-bold text-sm leading-tight">Via Jupiter</p>
                            <p className="text-white text-xs mt-0.5 whitespace-nowrap">{stakeMode === 'stake' ? 'Swap SOL for LST via Jupiter' : 'Swap LST for SOL via Jupiter'}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-yellow-400 text-xs font-bold">&lt;0.1% price impact</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Stake button */}
                  <button
                    onClick={stakeMode === 'stake' ? handleStake : handleUnstake}
                    disabled={stakeLoading || !stakeAmount || parseFloat(stakeAmount) <= 0 || !publicKey}
                    className={`w-full py-4 rounded-2xl font-black text-xl border transition-all duration-200 ${
                      stakeLoading || !stakeAmount || parseFloat(stakeAmount) <= 0 || !publicKey
                        ? 'bg-purple-600/50 text-white/60 cursor-not-allowed border-purple-500/30'
                        : 'bg-purple-600 hover:bg-purple-500 text-white cursor-pointer border-purple-400/50 shadow-lg shadow-purple-900/30'
                    }`}
                  >
                    {stakeLoading
                      ? (stakeMode === 'stake' ? 'Staking...' : 'Unstaking...')
                      : (stakeMode === 'stake' ? 'Stake SOL' : 'Unstake GSOL')}
                  </button>
                </div>

              </div>


              <GsolRateHistoryCard
                tvl={gsolTvl}
                holders={gsolHolders}
                solValue={gsolSolValue}
                gsolBalance={gsolBalance}
                gsolApy={gsolApy}
                connected={!!publicKey && isConnected}
                jupPortfolio={jupPortfolio}
                jupPortfolioLoading={jupPortfolioLoading}
                walletAddress={pointsWalletAddress}
              />

              {/* GSOL FAQ Accordion */}
              <div className="space-y-3">
                {([
                  {
                    Icon: HelpCircle,
                    q: 'What is liquid staking?',
                    a: 'On Solana, liquid staking means delegating your SOL to a validator and receiving a liquid staking token (LST) in return. This token represents your staked SOL and accrues staking rewards over time. Unlike regular staking, it stays flexible. You can use it in DeFi, trade it, or redeem it back for SOL whenever you like.',
                  },
                  {
                    Icon: RefreshCw,
                    q: 'Why does GSOL offer more than other LSTs?',
                    a: "With GSOL LSTs you don't just earn competitive yield, you also gain XP in our point system. For GSOL specifically, you earn 1x XP per dollar per day, boosting your rewards beyond standard staking.",
                  },
                  {
                    Icon: HelpCircle,
                    q: 'How do I receive staking rewards?',
                    a: "Rewards are automatically reflected in the token's value. Instead of separate payouts, the LST itself appreciates. For example, 1 GSOL may grow from 1 SOL to 1.05 SOL as rewards accumulate. This means every holder earns yield passively, no matter where the LST is stored. To realize your rewards, you can simply unstake and redeem back into SOL anytime.",
                  },
                  {
                    Icon: Shield,
                    q: 'Are LSTs secure?',
                    a: 'Yes. LSTs on Solana are built on a standard, battle-tested contract that has been audited multiple times. This same code has safely secured billions of dollars in value for years, making it one of the most trusted pieces of infrastructure in the Solana ecosystem.',
                  },
                ] as { Icon: React.ElementType; q: string; a: string }[]).map(({ Icon, q, a }) => (
                  <details key={q} className="group rounded-2xl border border-purple-500/40 bg-purple-800/30 overflow-hidden">
                    <summary className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer list-none select-none">
                      <div className="flex items-center gap-3">
                        <Icon className="w-5 h-5 text-purple-300 shrink-0" />
                        <span className="text-white font-semibold text-sm md:text-base">{q}</span>
                      </div>
                      <ChevronDown className="w-5 h-5 text-purple-300 shrink-0 transition-transform duration-200 group-open:rotate-180" />
                    </summary>
                    <div className="px-5 pb-5 pt-1">
                      <p className="text-purple-100 text-sm leading-relaxed">{a}</p>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}

          {/* Swap Tab Content - Platform Wallet Only */}
          {activeTab === 'swap' && isPlatformWallet && (
            <div className="py-4">
              <SwapPanel />
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
                      <CardDescription className="text-white">
                        Last 24 hours
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div data-testid="stat-sol-24h" className="text-4xl font-bold text-green-400">
                        {formatSol(stats24h?.stats.totalSolRecovered || '0')}
                      </div>
                      <p className="text-sm text-white mt-3">24H</p>
                    </CardContent>
                  </Card>

                  {/* SOL Recovered (Weekly) */}
                  <Card className="bg-purple-800/50 border-purple-600 backdrop-blur" data-testid="card-sol-weekly">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-white">
                        <DollarSign className="w-5 h-5 text-green-400" />
                        SOL Recovered
                      </CardTitle>
                      <CardDescription className="text-white">
                        Last 7 days
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div data-testid="stat-sol-weekly" className="text-4xl font-bold text-green-400">
                        {formatSol(statsWeekly?.stats.totalSolRecovered || '0')}
                      </div>
                      <p className="text-sm text-white mt-3">Weekly</p>
                    </CardContent>
                  </Card>

                  {/* SOL Recovered (Monthly) */}
                  <Card className="bg-purple-800/50 border-purple-600 backdrop-blur" data-testid="card-sol-monthly">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-white">
                        <DollarSign className="w-5 h-5 text-green-400" />
                        SOL Recovered
                      </CardTitle>
                      <CardDescription className="text-white">
                        Last 30 days
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div data-testid="stat-sol-monthly" className="text-4xl font-bold text-green-400">
                        {formatSol(statsMonthly?.stats.totalSolRecovered || '0')}
                      </div>
                      <p className="text-sm text-white mt-3">Monthly</p>
                    </CardContent>
                  </Card>

                  {/* Total Wallets (All Time) */}
                  <Card className="bg-purple-800/50 border-purple-600 backdrop-blur" data-testid="card-total-wallets">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-white">
                        <Users className="w-5 h-5 text-white" />
                        Total Wallets
                      </CardTitle>
                      <CardDescription className="text-white">
                        Unique wallets
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div data-testid="stat-total-users" className="text-4xl font-bold text-white">
                        {statsAllTime?.stats.totalUsers.toLocaleString('en-US') || '0'}
                      </div>
                      <p className="text-sm text-white mt-3">All Time</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Leaderboard */}
                <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
                  <CardHeader>
                    <div className="flex items-center justify-between mb-2">
                      <CardTitle className="flex items-center gap-2 text-white">
                        <TrendingUp className="w-6 h-6 text-yellow-400" />
                        Top 10 Leaders
                      </CardTitle>
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
                    <CardDescription className="text-white">
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
                                <span className="text-white font-medium ml-2">#{index + 1}</span>
                              )}
                              {isPlatformWallet ? (
                                <button
                                  onClick={() => setViewProfileWallet(entry.walletAddress)}
                                  className="text-white hover:text-green-300 underline font-mono text-sm cursor-pointer transition-colors"
                                  data-testid={`address-${index}`}
                                >
                                  {entry.walletAddress}
                                </button>
                              ) : (
                                <a
                                  href={`https://solscan.io/account/${entry.walletAddress}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-white hover:text-gray-200 underline font-mono text-sm"
                                  data-testid={`address-${index}`}
                                >
                                  {entry.walletAddress}
                                </a>
                              )}
                            </div>
                            <div className="text-right font-bold text-green-400" data-testid={`amount-${index}`}>
                              {formatSol(entry.totalSolRecovered)} SOL
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-white">
                        No data available for this time period
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })()}


          {/* Docs Tab Content - Sidebar Layout */}
          {activeTab === 'docs' && (() => {
            // Define section order and titles for pagination
            const sections = [
              { id: 'overview', title: 'How to Claim SOL' },
              { id: 'burn-tokens', title: 'Burn Tokens' },
              { id: 'burn-nfts', title: 'Burn NFTs' },
              { id: 'referrals', title: 'Referral System' },
              { id: 'points', title: 'Points System' },
              { id: 'developer-api', title: 'Developer API' }
            ];
            
            const currentIndex = sections.findIndex(s => s.id === activeDocSection);
            const previousSection = currentIndex > 0 ? sections[currentIndex - 1] : null;
            const nextSection = currentIndex < sections.length - 1 ? sections[currentIndex + 1] : null;
            
            return (
              <div className="flex flex-col lg:flex-row gap-6 h-full px-4">
                {/* Left Sidebar Navigation - Hidden on Mobile */}
                <div className="hidden lg:block lg:w-64 flex-shrink-0 pl-0">
                  <div className="lg:sticky top-4 space-y-4">
                    <div className="flex flex-col gap-3">
                      <button
                        onClick={() => setActiveTab('reclaim')}
                        className="bg-purple-700/50 hover:bg-purple-600 text-white border border-purple-500/30 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors w-fit"
                        data-testid="button-back-from-docs"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Back
                      </button>
                      <h2 className="text-white text-lg font-semibold">Documentation</h2>
                    </div>
                    <div className="space-y-1">
                      <button
                        onClick={() => setActiveDocSection('overview')}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                          activeDocSection === 'overview' 
                            ? 'bg-purple-600 text-white' 
                            : 'text-white hover:bg-purple-700/30'
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
                            : 'text-white hover:bg-purple-700/30'
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
                            : 'text-white hover:bg-purple-700/30'
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
                            : 'text-white hover:bg-purple-700/30'
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
                            : 'text-white hover:bg-purple-700/30'
                        }`}
                        data-testid="docs-nav-points"
                      >
                        ⭐ Points System
                      </button>
                      <div className="pt-3 pb-2 px-3 text-purple-400 text-xs font-semibold uppercase">
                        Developers
                      </div>
                      <button
                        onClick={() => setActiveDocSection('developer-api')}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                          activeDocSection === 'developer-api' 
                            ? 'bg-purple-600 text-white' 
                            : 'text-white hover:bg-purple-700/30'
                        }`}
                        data-testid="docs-nav-api"
                      >
                        <Code className="w-4 h-4 inline mr-2" />
                        Developer API
                        {hasDevAccount && <Check className="w-4 h-4 inline ml-2 text-green-400" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Content Area */}
                <div className="flex-1">
                  {/* Mobile Back Button - Only visible on mobile */}
                  <div className="block lg:hidden mb-4">
                    <button
                      onClick={() => setActiveTab('reclaim')}
                      className="bg-purple-700/50 hover:bg-purple-600 text-white border border-purple-500/30 inline-flex items-center gap-2 px-3 py-2 rounded-lg transition-colors"
                      data-testid="button-back-mobile"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </button>
                  </div>

                  {activeDocSection === 'overview' && (
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <h2 className="text-white text-2xl font-semibold">How to Claim SOL</h2>
                        <p className="text-white">
                          Complete guide to reclaiming your SOL from empty token accounts
                        </p>
                      </div>
                      <div className="space-y-6 text-white prose prose-invert max-w-none">
                        <div className="space-y-8">
                          <div className="space-y-4">
                            <h3 className="text-xl font-semibold text-white mb-4">
                              1. Find Our App
                            </h3>
                            <p className="text-white leading-relaxed mb-4">
                              Open your <strong className="text-white">Phantom Wallet</strong> and use the Discovery feature to find GetFreeSol:
                            </p>
                            <ul className="space-y-3 text-white leading-relaxed mb-6">
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
                                <p className="text-sm text-white text-center italic">Step 1: Search for "Get Free Sol"</p>
                              </div>
                              <div className="space-y-2">
                                <img 
                                  src={new URL('@assets/image_1763869243474.png', import.meta.url).href}
                                  alt="Get Free Sol App Page - Tap Open" 
                                  className="rounded-lg border border-purple-500/50 w-full"
                                />
                                <p className="text-sm text-white text-center italic">Step 2: Tap "Open" to launch</p>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <h3 className="text-xl font-semibold text-white mb-4">
                              2. Connect Your Wallet
                            </h3>
                            <ul className="space-y-3 text-white leading-relaxed mb-6">
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
                            <p className="text-white leading-relaxed mb-6">
                              We support <strong className="text-white">8 different wallets</strong>: Phantom, Backpack, Solflare, Magic Eden, Coinbase, Coin98, Bitget, and Ledger hardware wallets.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <img 
                                  src={new URL('@assets/image_1763872863603.png', import.meta.url).href}
                                  alt="GetFreeSol main page - Click Connect button" 
                                  className="rounded-lg border border-purple-500/50 w-full"
                                />
                                <p className="text-sm text-white text-center italic">Step 1: Click "Connect" button</p>
                              </div>
                              <div className="space-y-2">
                                <img 
                                  src={new URL('@assets/image_1763872748597.png', import.meta.url).href}
                                  alt="Wallet selection modal - Choose your wallet" 
                                  className="rounded-lg border border-purple-500/50 w-full"
                                />
                                <p className="text-sm text-white text-center italic">Step 2: Select your wallet</p>
                              </div>
                            </div>
                          </div>
                          
                          <div className="space-y-4">
                            <h3 className="text-xl font-semibold text-white mb-4">
                              3. Claim Your SOL
                            </h3>
                            <p className="text-white leading-relaxed mb-4">
                              After connecting your wallet, the app will <strong className="text-white">automatically scan and close all empty accounts</strong>. The process is fully automated:
                            </p>
                            <ul className="space-y-3 text-white leading-relaxed">
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
                              <p className="text-sm text-white">
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
                                <p className="text-sm text-white text-center italic">Step 1: Click "CLAIM ALL"</p>
                              </div>
                              <div className="space-y-2">
                                <img 
                                  src={new URL('@assets/image_1763873493603.png', import.meta.url).href}
                                  alt="Transaction confirmation modal in wallet" 
                                  className="rounded-lg border border-purple-500/50 w-full"
                                />
                                <p className="text-sm text-white text-center italic">Step 2: Confirm transaction</p>
                              </div>
                              <div className="space-y-2">
                                <img 
                                  src={new URL('@assets/image_1763873559520.png', import.meta.url).href}
                                  alt="Success message showing SOL claimed" 
                                  className="rounded-lg border border-purple-500/50 w-full"
                                />
                                <p className="text-sm text-white text-center italic">Step 3: SOL claimed! 🎉</p>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <h3 className="text-xl font-semibold text-white mb-3">Additional Features</h3>
                            <ul className="space-y-3 text-white">
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

                          <div className="space-y-4">
                            <h3 className="text-xl font-semibold text-white mb-3">💡 Pro Tips</h3>
                            <ul className="space-y-2 text-white list-disc list-inside">
                              <li>Use the Auto-Claim feature to automatically recover SOL from new empty accounts</li>
                              <li>Check the Statistics tab to see total SOL recovered across the platform</li>
                              <li>Enable notifications to get alerts when new claimable SOL is detected</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeDocSection === 'burn-tokens' && (
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <h2 className="text-white text-2xl font-semibold">How to Burn Tokens</h2>
                        <p className="text-white">
                          Remove unwanted tokens from your wallet and recover SOL from token accounts
                        </p>
                      </div>
                      <div className="space-y-6 text-white prose prose-invert max-w-none">
                        <div className="space-y-8">
                          <div className="space-y-4">
                            <h3 className="text-xl font-semibold text-white mb-4">What is Token Burning?</h3>
                            <p className="text-white leading-relaxed">
                              Token burning allows you to <strong className="text-white">permanently destroy unwanted tokens</strong> from your wallet 
                              and <strong className="text-white">recover SOL</strong> from the token accounts. This helps clean up your wallet and 
                              reclaim rent deposits.
                            </p>
                          </div>

                          <div className="space-y-4">
                            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                              <span className="text-2xl">🔥</span> How to Burn Tokens
                            </h3>
                            <ul className="space-y-3 text-white leading-relaxed mb-6">
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
                                <p className="text-sm text-white text-center italic">Step 1: Select tokens and click "BURN"</p>
                              </div>
                              <div className="space-y-2">
                                <img 
                                  src={new URL('@assets/image_1763874201656.png', import.meta.url).href}
                                  alt="Transaction confirmation showing token burn" 
                                  className="rounded-lg border border-purple-500/50 w-full"
                                />
                                <p className="text-sm text-white text-center italic">Step 2: Confirm the burn transaction</p>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <h3 className="text-xl font-semibold text-white mb-3">💡 Pro Tips</h3>
                            <ul className="space-y-2 text-white list-disc list-inside">
                              <li>Start with low-value tokens to test the feature before burning higher-value tokens</li>
                              <li>The value slider helps you quickly filter out spam tokens worth almost nothing</li>
                              <li>Burning tokens is permanent - make sure you really don't want them!</li>
                              <li>You recover ~0.00203928 SOL per token account closed</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeDocSection === 'burn-nfts' && (
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <h2 className="text-white text-2xl font-semibold">How to Burn NFTs</h2>
                        <p className="text-white">
                          Burn unwanted NFTs (including compressed NFTs and frozen NFTs) and recover SOL
                        </p>
                      </div>
                      <div className="space-y-6 text-white prose prose-invert max-w-none">
                        <div className="space-y-8">
                          <div className="space-y-4">
                            <h3 className="text-xl font-semibold text-white mb-4">What is NFT Burning?</h3>
                            <p className="text-white leading-relaxed">
                              NFT burning allows you to <strong className="text-white">permanently destroy unwanted NFTs</strong> from your wallet 
                              and <strong className="text-white">recover SOL</strong> from the NFT accounts. Our platform supports:
                            </p>
                            <ul className="space-y-3 text-white leading-relaxed">
                              <li className="flex items-start gap-3">
                                <span className="text-green-400 mt-1">✓</span>
                                <span><strong className="text-white">Regular NFTs:</strong> Standard Metaplex NFTs</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-green-400 mt-1">✓</span>
                                <span><strong className="text-white">Compressed NFTs (cNFTs):</strong> Cost-efficient NFTs using Merkle trees</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-green-400 mt-1">✓</span>
                                <span><strong className="text-white">Programmable NFTs (pNFTs):</strong> NFTs with royalty enforcement</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-green-400 mt-1">✓</span>
                                <span><strong className="text-white">Frozen NFTs:</strong> Even NFTs with frozen accounts can be burned</span>
                              </li>
                            </ul>
                          </div>

                          <div className="space-y-4">
                            <h3 className="text-xl font-semibold text-white mb-4">How to Burn NFTs</h3>
                            <ul className="space-y-3 text-white leading-relaxed mb-6">
                              <li className="flex items-start gap-3">
                                <span className="text-pink-400 mt-1">▸</span>
                                <span>Navigate to the <strong className="text-white">"Burn NFT"</strong> tab</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-pink-400 mt-1">▸</span>
                                <span>Choose between <strong className="text-white">"NFTs"</strong> or <strong className="text-white">"cNFTs"</strong> (compressed NFTs) tabs</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-pink-400 mt-1">▸</span>
                                <span>Browse your NFT collection and select the ones you want to burn</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-pink-400 mt-1">▸</span>
                                <span>Click the <strong className="text-white">checkbox</strong> on each NFT you want to burn</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-pink-400 mt-1">▸</span>
                                <span>Click <strong className="text-white">"BURN"</strong> button at the bottom</span>
                              </li>
                              <li className="flex items-start gap-3">
                                <span className="text-pink-400 mt-1">▸</span>
                                <span>Confirm the transaction in your wallet - you'll see the SOL you'll recover!</span>
                              </li>
                            </ul>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                              <div className="space-y-2">
                                <img 
                                  src={new URL('@assets/image_1763880886408.png', import.meta.url).href}
                                  alt="NFT burning interface showing available NFTs" 
                                  className="rounded-lg border border-purple-500/50 w-full"
                                />
                                <p className="text-sm text-white text-center italic">Step 1: Browse your NFTs</p>
                              </div>
                              <div className="space-y-2">
                                <img 
                                  src={new URL('@assets/image_1763880899559.png', import.meta.url).href}
                                  alt="Selected NFT ready to burn" 
                                  className="rounded-lg border border-purple-500/50 w-full"
                                />
                                <p className="text-sm text-white text-center italic">Step 2: Select NFT and click "BURN"</p>
                              </div>
                              <div className="space-y-2">
                                <img 
                                  src={new URL('@assets/image_1763881281359.png', import.meta.url).href}
                                  alt="Transaction confirmation showing SOL recovered" 
                                  className="rounded-lg border border-purple-500/50 w-full"
                                />
                                <p className="text-sm text-white text-center italic">Step 3: Confirm and recover SOL! 🎉</p>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <h3 className="text-xl font-semibold text-white mb-3">💡 Pro Tips</h3>
                            <ul className="space-y-2 text-white list-disc list-inside">
                              <li>Check both NFTs and cNFTs tabs - you might have compressed NFTs you weren't aware of</li>
                              <li>The platform shows you exactly how much SOL you'll recover before you confirm</li>
                              <li>You can use "Select All NFTs" to quickly select all unwanted NFTs at once</li>
                              <li>Burning NFTs is permanent and cannot be undone - make absolutely sure you want to burn them!</li>
                              <li>Even frozen or locked NFTs can be burned using our advanced burn mechanism</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeDocSection === 'referrals' && (
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <h2 className="text-white text-2xl font-semibold">Referral System</h2>
                        <p className="text-white">
                          Earn 50% commission from your referrals - the highest rate in the market!
                        </p>
                      </div>
                      <div className="space-y-6 text-white prose prose-invert max-w-none">
                        <div className="space-y-8">
                          <div className="space-y-4">
                            <h3 className="text-xl font-semibold text-white mb-4">How the Referral System Works</h3>
                            <p className="text-white leading-relaxed mb-4">
                              Share your unique referral link with friends and earn <strong className="text-white">50% commission</strong> on all fees 
                              collected from users who sign up through your link. This is the <strong className="text-white">highest commission rate in the market</strong>!
                            </p>
                            <ul className="space-y-3 text-white leading-relaxed">
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

                          <div className="space-y-4">
                            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                              <span className="text-2xl">💰</span> How to Get Started
                            </h3>
                            <ul className="space-y-3 text-white leading-relaxed mb-6">
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
                                <p className="text-sm text-white text-center italic">Your referral stats and link</p>
                              </div>
                              <div className="space-y-2">
                                <img 
                                  src={new URL('@assets/image_1763875199940.png', import.meta.url).href}
                                  alt="Recent referral transactions showing earnings" 
                                  className="rounded-lg border border-purple-500/50 w-full"
                                />
                                <p className="text-sm text-white text-center italic">Track your referral earnings</p>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <h3 className="text-xl font-semibold text-white mb-3">💡 Pro Tips</h3>
                            <ul className="space-y-2 text-white list-disc list-inside">
                              <li>Share your referral link in crypto communities, Discord servers, and social media</li>
                              <li>Explain the benefits of GetFreeSol to maximize conversions</li>
                              <li>Your commission is automatically tracked - no manual claiming needed</li>
                              <li>The more your referrals use the platform, the more you earn!</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeDocSection === 'points' && (
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <h2 className="text-white text-2xl font-semibold">Points System</h2>
                        <p className="text-white">
                          Earn points for every account you close and compete on the leaderboard!
                        </p>
                      </div>
                      <div className="space-y-6 text-white prose prose-invert max-w-none">
                        <div className="space-y-8">
                          <div className="space-y-4">
                            <h3 className="text-xl font-semibold text-white mb-4">How the Points System Works</h3>
                            <p className="text-white leading-relaxed mb-4">
                              Every time you close an empty token account, you earn <strong className="text-white">20 points</strong>. 
                              Points are tracked automatically and displayed on your profile. Compete with other users on the 
                              <strong className="text-white"> Top 10 Leaderboard</strong> to see who's recovering the most SOL!
                            </p>
                            <ul className="space-y-3 text-white leading-relaxed">
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

                          <div className="space-y-4">
                            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                              <span className="text-2xl">🏆</span> Your Stats & Leaderboard
                            </h3>
                            <ul className="space-y-3 text-white leading-relaxed mb-6">
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
                                  src={new URL('@assets/image_1763875662978.png', import.meta.url).href}
                                  alt="Points dashboard showing total points, SOL claimed, and rank" 
                                  className="rounded-lg border border-purple-500/50 w-full"
                                />
                                <p className="text-sm text-white text-center italic">Your points and ranking</p>
                              </div>
                              <div className="space-y-2">
                                <img 
                                  src={new URL('@assets/image_1763875412373.png', import.meta.url).href}
                                  alt="Top 10 leaderboard showing highest-ranking users" 
                                  className="rounded-lg border border-purple-500/50 w-full"
                                />
                                <p className="text-sm text-white text-center italic">Top 10 leaderboard</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeDocSection === 'developer-api' && (
                    <div>
                      {/* Show account creation card if no developer account */}
                      {publicKey && !hasDevAccount && !isDevAccountLoading && (
                        <div className="flex items-center justify-center min-h-[60vh]">
                          <Card className="w-full max-w-md bg-white dark:bg-slate-900 border border-gray-200 dark:border-purple-500/30 shadow-lg">
                            <CardHeader className="space-y-1">
                              <CardTitle className="text-2xl font-bold text-gray-900 dark:text-white">
                                Create Referral Account
                              </CardTitle>
                              <CardDescription className="text-gray-600 dark:text-white">
                                Use your project name
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div className="space-y-2">
                                <Label htmlFor="dev-project-name-inline" className="text-gray-900 dark:text-white font-semibold">
                                  Name
                                </Label>
                                <Input
                                  id="dev-project-name-inline"
                                  placeholder="E.g: Birdeye, Meteora, Solend"
                                  value={devProjectName}
                                  onChange={(e) => setDevProjectName(e.target.value)}
                                  maxLength={50}
                                  className="bg-white dark:bg-slate-800 border-gray-300 dark:border-purple-400/30 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/50"
                                  data-testid="input-dev-project-name-inline"
                                />
                              </div>
                              <Button
                                onClick={() => createDevAccountMutation.mutate()}
                                disabled={!devProjectName.trim() || createDevAccountMutation.isPending}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                                data-testid="button-create-dev-account-inline"
                              >
                                {createDevAccountMutation.isPending ? (
                                  <>
                                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                    Creating...
                                  </>
                                ) : (
                                  "Create"
                                )}
                              </Button>
                            </CardContent>
                          </Card>
                        </div>
                      )}

                      {/* Show loading state */}
                      {publicKey && isDevAccountLoading && (
                        <div className="flex items-center justify-center min-h-[60vh]">
                          <RefreshCw className="h-8 w-8 animate-spin text-purple-400" />
                        </div>
                      )}

                      {/* Show connect wallet prompt if not connected */}
                      {!publicKey && (
                        <div className="flex items-center justify-center min-h-[60vh]">
                          <Card className="w-full max-w-md bg-white dark:bg-slate-900 border border-gray-200 dark:border-purple-500/30 shadow-lg text-center">
                            <CardHeader>
                              <CardTitle className="text-xl text-gray-900 dark:text-white">
                                Connect Your Wallet
                              </CardTitle>
                              <CardDescription className="text-gray-600 dark:text-white">
                                Connect your wallet to create a developer account
                              </CardDescription>
                            </CardHeader>
                          </Card>
                        </div>
                      )}

                      {/* Show API docs only if account exists */}
                      {hasDevAccount && <ApiDocs />}
                    </div>
                  )}

                  {/* Mobile Pagination - Only visible on mobile */}
                  <div className="block lg:hidden mt-12 pt-6 border-t border-purple-700/50 space-y-3">
                    {previousSection && (
                      <button
                        onClick={() => setActiveDocSection(previousSection.id as any)}
                        className="w-full text-left bg-purple-800/30 hover:bg-purple-700/50 border border-purple-600/50 rounded-lg p-4 transition-colors"
                        data-testid="button-prev-section"
                      >
                        <div className="text-xs text-white mb-1">Previous</div>
                        <div className="text-white font-medium">{previousSection.title}</div>
                      </button>
                    )}
                    {nextSection && (
                      <button
                        onClick={() => setActiveDocSection(nextSection.id as any)}
                        className="w-full text-left bg-purple-800/30 hover:bg-purple-700/50 border border-purple-600/50 rounded-lg p-4 transition-colors"
                        data-testid="button-next-section"
                      >
                        <div className="text-xs text-white mb-1">Next</div>
                        <div className="text-white font-medium">{nextSection.title}</div>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Old Lend Content - REMOVED */}
          {activeTab === 'docs' && showDeveloper && false && (
              <div className="space-y-6">
                {/* Jupiter Lend Statistics - Only visible to platform wallet */}
                {publicKey?.toString() === 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT' && (
                  <div className="px-2 md:px-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                      {/* Total Deposits Card */}
                      <div className="bg-purple-800/50 border-purple-600 backdrop-blur p-4 md:p-6 rounded-xl border text-center">
                        <div className="text-2xl md:text-[32px] font-bold text-white mb-1 md:mb-2">
                          {lendStats ? `$${parseFloat(lendStats.totalDepositsUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00'}
                        </div>
                        <div className="text-xs md:text-sm font-medium text-white uppercase tracking-wider">
                          Total Deposits
                        </div>
                      </div>
                      
                      {/* Total Earned Card */}
                      <div className="bg-purple-800/50 border-purple-600 backdrop-blur p-4 md:p-6 rounded-xl border text-center">
                        <div className="text-2xl md:text-[32px] font-bold text-white mb-1 md:mb-2">
                          {lendStats ? `$${parseFloat(lendStats.totalEarningsUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00'}
                        </div>
                        <div className="text-xs md:text-sm font-medium text-white uppercase tracking-wider">
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
                            className={lendMode === 'deposit' ? 'bg-purple-600 text-white' : 'bg-purple-900/30 text-white border-purple-600'}
                            data-testid="button-mode-deposit"
                          >
                            Deposit
                          </Button>
                          <Button
                            variant={lendMode === 'withdraw' ? 'default' : 'outline'}
                            onClick={() => { setLendMode('withdraw'); setDepositAmount(''); }}
                            className={lendMode === 'withdraw' ? 'bg-purple-600 text-white' : 'bg-purple-900/30 text-white border-purple-600'}
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
                            if (!publicKey || !isConnected || !selectedReserve || !depositAmount) {
                              console.error('❌ Missing required fields:', { publicKey: !!publicKey, isConnected, selectedReserve: !!selectedReserve, depositAmount });
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
                              
                              if (signTransaction) {
                                const signedTx = await signTransaction(transaction);
                                
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
                                if (publicKey.toString() === 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT') {
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
                          className={lendMode === 'deposit' ? 'bg-purple-600 text-white' : 'bg-purple-900/30 text-white border-purple-600'}
                          data-testid="button-mode-deposit"
                        >
                          Deposit
                        </Button>
                        <Button
                          variant={lendMode === 'withdraw' ? 'default' : 'outline'}
                          onClick={() => { setLendMode('withdraw'); setDepositAmount(''); }}
                          className={lendMode === 'withdraw' ? 'bg-purple-600 text-white' : 'bg-purple-900/30 text-white border-purple-600'}
                          data-testid="button-mode-withdraw"
                        >
                          Withdraw
                        </Button>
                      </div>

                      {/* 1. Amount Section (FIRST) */}
                    <div className="bg-purple-900/40 border border-purple-500/30 rounded-lg p-3 mb-3">
                      {/* Header with Balance and Quick Actions */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white text-sm font-medium">{lendMode === 'deposit' ? 'Deposit Amount' : 'Withdraw Amount'}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-white">
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
                            className="text-xs bg-purple-800/40 text-white hover:text-white hover:bg-purple-700/50 px-2 py-0.5 h-auto border border-purple-500/30"
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
                            className="text-xs bg-purple-800/40 text-white hover:text-white hover:bg-purple-700/50 px-2 py-0.5 h-auto border border-purple-500/30"
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
                        <span className="text-white text-sm">APY</span>
                        <span className="text-green-400 text-sm font-semibold bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                          ≈ {selectedReserve?.depositAPY.toFixed(2)}%
                        </span>
                      </div>

                      <Separator className="bg-purple-500/20" />

                      {/* Vault TVL */}
                      <div className="flex items-center justify-between">
                        <span className="text-white text-sm">Vault TVL</span>
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
                        <span className="text-white text-sm">Layer Total</span>
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
                        <div className="text-xs text-white mb-1">Deposited</div>
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
                        <div className="text-xs text-white mb-1">Your Earnings</div>
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
                        if (!publicKey || !isConnected || !selectedReserve || !depositAmount) {
                          console.error('❌ Missing required fields:', { publicKey: !!publicKey, isConnected, selectedReserve: !!selectedReserve, depositAmount });
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
                          
                          if (signTransaction) {
                            const signedTx = await signTransaction(transaction);
                            
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
                            if (publicKey.toString() === 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT') {
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


          {/* All Time Ledger Section - Only show on reclaim tab */}
          {activeTab === 'reclaim' && (
            <div className={`backdrop-blur-sm rounded-xl p-6 mb-6 ${
              'bg-gradient-to-br from-purple-800/20 to-purple-900/30 border border-purple-500/20'
            }`}>
              <div className="flex items-center mb-6">
                <h3 className="text-xl font-bold text-white text-center w-full">Recent Claims</h3>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-full">
                  {/* Header */}
                  <div className={`grid grid-cols-4 gap-4 mb-4 pb-3 border-b ${'border-purple-500/30'}`}>
                    <div className={`text-sm font-semibold uppercase tracking-wider ${'text-white'}`}>
                      WALLET/TX
                    </div>
                    <div className={`text-sm font-semibold uppercase tracking-wider text-center ${'text-white'}`}>
                      ACCTS
                    </div>
                    <div className={`text-sm font-semibold uppercase tracking-wider text-center ${'text-white'}`}>
                      CLAIMED SOL
                    </div>
                    <div className={`text-sm font-semibold uppercase tracking-wider text-center ${'text-white'}`}>
                      AGE
                    </div>
                  </div>

                  {/* Transaction Rows */}
                  <div>
                    {isLoadingTransactions && allTransactions.length === 0 ? (
                      <div className="text-center text-white py-8">
                        Loading transactions...
                      </div>
                    ) : allTransactions.length === 0 ? (
                      <div className="text-center text-white py-8">
                        No transactions yet
                      </div>
                    ) : (
                      allTransactions.map((tx, index) => (
                        <div key={tx.signature}>
                          <div 
                            className={`grid grid-cols-4 gap-4 py-3 transition-colors cursor-pointer ${
                              'hover:bg-purple-800/20 rounded-lg border border-transparent hover:border-purple-500/30'
                            }`}
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
                              {timeAgo(tx.processedAt)}
                            </div>
                          </div>
                          {/* Separator line between rows - don't show after last row */}
                          {index < allTransactions.length - 1 && (
                            <div className={`border-b my-2 ${'border-purple-500/20'}`}></div>
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

          {/* Partner Trust Strip - under All Time Ledger */}
          {activeTab === 'reclaim' && (
            <div className="py-8 mb-4">
              <p className="text-center text-white text-[11px] uppercase tracking-widest mb-6 font-medium">
                Partners
              </p>
              <div className="grid grid-cols-2 md:flex md:flex-row md:items-center md:justify-center gap-6 md:gap-0 md:divide-x md:divide-white/10">
                <a href="https://app.sanctum.so/explore/GSOL" target="_blank" rel="noopener noreferrer"
                   className="flex items-center justify-center md:px-10 group">
                  <img src="/sanctum-logo-cropped.png" alt="Sanctum" className="h-12 object-contain hover:opacity-80 transition-opacity" style={{ mixBlendMode: 'lighten' }} />
                </a>
                <a href="https://phantom.com/apps/get-free-sol" target="_blank" rel="noopener noreferrer"
                   className="flex items-center justify-center md:px-10 group">
                  <img src="/phantom-real-logo.png" alt="Phantom" className="h-12 object-contain hover:opacity-80 transition-opacity" />
                </a>
                <a href="https://www.okx.com/web3" target="_blank" rel="noopener noreferrer"
                   className="flex items-center justify-center md:px-10 group">
                  <img src="/okx-wallet-logo.png" alt="OKX Wallet" className="h-12 object-contain hover:opacity-80 transition-opacity" />
                </a>
                <a href="https://web3.bitget.com" target="_blank" rel="noopener noreferrer"
                   className="flex items-center justify-center md:px-10 group">
                  <img src="/bitget-wallet-logo.png" alt="Bitget Wallet" className="h-12 object-contain hover:opacity-80 transition-opacity" />
                </a>
              </div>
            </div>
          )}

          {/* Referral Program Section - Only show on reclaim tab - Bottom of page */}
          {activeTab === 'reclaim' && (
            <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6 mb-6">
              <div className="flex items-center mb-4">
                <Users className="h-5 w-5 text-purple-400 mr-2" />
                <h3 className="text-lg font-semibold text-white">Referral Program</h3>
              </div>

              <div className="space-y-3 text-white text-sm">
                <p>Refer friends &amp; earn <span className="text-green-400 font-semibold">50% commission</span>.</p>
                {publicKey ? (
                  <div className="mt-3">
                    <p className="text-xs text-white mb-2">Your Referral Link:</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs text-green-400 overflow-x-auto break-all">
                        {`${window.location.origin}?ref=${publicKey.toString().slice(0, 8)}`}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}?ref=${publicKey.toString().slice(0, 8)}`);
                          toast({
                            title: 'Copied!',
                            description: 'Referral link copied to clipboard',
                          });
                        }}
                        className="px-3 py-2 bg-purple-600 hover:bg-purple-500 rounded text-white text-xs font-medium transition-colors flex-shrink-0"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-white mt-2">Connect your wallet to get your referral link.</p>
                )}
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

              <div className="space-y-3 text-white text-sm">
                <p>
                  On Solana, each token account requires about 0.002 SOL as a rent deposit for storage. You can recover it by closing the account.
                </p>
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

              <div className="space-y-3 text-white">
                <div className="flex items-start">
                  <CheckCircle className="h-4 w-4 text-green-400 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Only empty accounts (0 tokens) can be closed</span>
                </div>
                <div className="flex items-start">
                  <CheckCircle className="h-4 w-4 text-green-400 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Your tokens and active accounts stay safe</span>
                </div>
                <div className="flex items-start">
                  <CheckCircle className="h-4 w-4 text-green-400 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Transactions run on Solana mainnet</span>
                </div>
                <div className="flex items-start">
                  <CheckCircle className="h-4 w-4 text-green-400 mr-3 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">You receive ~0.001867 SOL per account (10% fee)</span>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-purple-500/20 bg-gradient-to-r from-purple-900/30 to-slate-900/30 backdrop-blur-sm mt-4 -mx-4">
            <div className="px-4 md:px-6 py-4 md:py-6">
              <div className="flex flex-row items-center justify-between gap-3">
                {/* Brand */}
                <div className="flex flex-col min-w-0 shrink-0">
                  <div className="flex items-center space-x-2">
                    <img 
                      src={footerLogo}
                      alt="Get Free Sol"
                      className="h-6 w-6 md:h-8 md:w-8 shrink-0"
                    />
                    <div className="text-white font-semibold text-base md:text-lg">Get Free Sol</div>
                    <div className="text-white text-[11px] md:text-sm whitespace-nowrap">2026 All rights reserved</div>
                  </div>
                  <div className="text-[11px] md:text-sm mt-0.5 ml-8 md:ml-10">
                    <Link href="/privacy" className="text-white hover:text-white/70 underline">Privacy Policy</Link> · <Link href="/terms" className="text-white hover:text-white/70 underline">Terms & Conditions</Link>
                  </div>
                </div>
                {/* Social Links */}
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <div className="flex items-center space-x-1.5 md:space-x-2">
                  <Link href="/docs">
                    <BookOpen className="h-6 w-6 text-white hover:text-white/70 transition-colors" />
                  </Link>
                  <a
                    href="https://x.com/getfreesol_xyz"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="button-footer-x"
                    className="flex items-center justify-center hover:opacity-70 transition-opacity"
                    title="Follow us on X (Twitter)"
                  >
                    <SiX className="h-6 w-6 text-white transition-colors" />
                  </a>
                  <a
                    href="https://t.me/GetFreeSolXyzbot"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="button-footer-telegram"
                    className="flex items-center justify-center hover:opacity-70 transition-opacity"
                    title="Open Telegram Bot — auto-claim SOL 24/7"
                  >
                    <SiTelegram className="h-6 w-6 text-white transition-colors" />
                  </a>
                  <a
                    href="https://discord.gg/tSBMgYcZaK"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="button-footer-discord"
                    className="flex items-center justify-center hover:opacity-70 transition-opacity"
                    title="Join our Discord community"
                  >
                    <SiDiscord className="h-6 w-6 text-white transition-colors" />
                  </a>
                </div>
                </div>
              </div>
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
          accountsClosed={shareData.accountsClosed}
          claimType={shareData.claimType}
          walletAddress={publicKey?.toBase58()}
          onFlip={() => setActiveTab('coinflip')}
        />
      )}

      {/* User Profile Modal (Platform Wallet Only) */}
      <Dialog open={!!viewProfileWallet} onOpenChange={(open) => !open && setViewProfileWallet(null)}>
        <DialogContent className="bg-gradient-to-br from-purple-900/95 to-purple-950/95 backdrop-blur-xl border-purple-500/30 text-white max-w-lg [&>button]:hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <User className="w-5 h-5 text-purple-400" />
              User Profile
            </DialogTitle>
            <DialogDescription className="text-white">
              {viewProfileWallet && (
                <span className="font-mono text-xs break-all">{viewProfileWallet}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {loadingProfileData ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-purple-400" />
            </div>
          ) : viewProfileData ? (
            <div className="space-y-4">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                <Card className="bg-purple-800/40 border-purple-500/30">
                  <CardContent className="p-4 text-center">
                    <p className="text-white text-sm">SOL Claimed</p>
                    <p className="text-xl font-bold text-green-400">{Number(viewProfileData.totalSolClaimed).toFixed(4)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-purple-800/40 border-purple-500/30">
                  <CardContent className="p-4 text-center">
                    <p className="text-white text-sm">Accounts Closed</p>
                    <p className="text-xl font-bold text-white">{viewProfileData.totalAccountsClosed}</p>
                  </CardContent>
                </Card>
                <Card className="bg-purple-800/40 border-purple-500/30">
                  <CardContent className="p-4 text-center">
                    <p className="text-white text-sm">Tokens Burned</p>
                    <p className="text-xl font-bold text-orange-400">{viewProfileData.totalTokensBurned}</p>
                  </CardContent>
                </Card>
                <Card className="bg-purple-800/40 border-purple-500/30">
                  <CardContent className="p-4 text-center">
                    <p className="text-white text-sm">NFTs Burned</p>
                    <p className="text-xl font-bold text-pink-400">{viewProfileData.totalNftsBurned}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Points */}
              <Card className="bg-purple-800/40 border-purple-500/30">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-yellow-400" />
                    <span className="text-white">Total Points</span>
                  </div>
                  <span className="text-xl font-bold text-yellow-400">{viewProfileData.totalPoints.toLocaleString()}</span>
                </CardContent>
              </Card>

              {/* Leaderboard Rankings */}
              <Card className="bg-purple-800/40 border-purple-500/30">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-5 h-5 text-purple-400" />
                    <span className="text-white font-medium">Leaderboard Rankings</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Weekly Rank */}
                    <div className="bg-purple-900/50 rounded-lg p-3 text-center">
                      <p className="text-xs text-white mb-1">Weekly (7 days)</p>
                      {viewProfileData.weeklyRank ? (
                        <>
                          <p className="text-lg font-bold text-white">
                            {viewProfileData.weeklyRank <= 3 && (
                              <span className={viewProfileData.weeklyRank === 1 ? 'text-yellow-400' : viewProfileData.weeklyRank === 2 ? 'text-gray-300' : 'text-orange-400'}>
                                {viewProfileData.weeklyRank === 1 ? '🥇' : viewProfileData.weeklyRank === 2 ? '🥈' : '🥉'}
                              </span>
                            )} #{viewProfileData.weeklyRank}
                          </p>
                          <p className="text-xs text-green-400">{(viewProfileData.weeklySol ?? 0).toFixed(4)} SOL</p>
                        </>
                      ) : (
                        <p className="text-sm text-purple-400">Not ranked</p>
                      )}
                    </div>
                    {/* All Time Rank */}
                    <div className="bg-purple-900/50 rounded-lg p-3 text-center">
                      <p className="text-xs text-white mb-1">All Time</p>
                      {viewProfileData.allTimeRank ? (
                        <>
                          <p className="text-lg font-bold text-white">
                            {viewProfileData.allTimeRank <= 3 && (
                              <span className={viewProfileData.allTimeRank === 1 ? 'text-yellow-400' : viewProfileData.allTimeRank === 2 ? 'text-gray-300' : 'text-orange-400'}>
                                {viewProfileData.allTimeRank === 1 ? '🥇' : viewProfileData.allTimeRank === 2 ? '🥈' : '🥉'}
                              </span>
                            )} #{viewProfileData.allTimeRank}
                          </p>
                          <p className="text-xs text-green-400">{(viewProfileData.allTimeSol ?? 0).toFixed(4)} SOL</p>
                        </>
                      ) : (
                        <p className="text-sm text-purple-400">Not ranked</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Referral Info */}
              {viewProfileData.referralCode && (
                <Card className="bg-purple-800/40 border-purple-500/30">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-blue-400" />
                      <span className="text-white">Referral Code</span>
                    </div>
                    <p className="font-mono text-sm text-white bg-purple-900/50 px-3 py-1.5 rounded">
                      {viewProfileData.referralCode}
                    </p>
                    <p className="text-sm text-white">
                      Earnings: <span className="text-green-400 font-bold">{Number(viewProfileData.referralEarnings).toFixed(4)} SOL</span>
                    </p>
                  </CardContent>
                </Card>
              )}

            </div>
          ) : (
            <div className="text-center py-8 text-white">
              No data available for this user
            </div>
          )}
          
          <DialogFooter>
            <Button 
              onClick={() => setViewProfileWallet(null)}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Developer Account Creation Modal */}
      <Dialog open={showDevAccountModal} onOpenChange={setShowDevAccountModal}>
        <DialogContent className="bg-gradient-to-br from-purple-900/95 to-blue-900/95 backdrop-blur-xl border-2 border-purple-500/50 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-center">
              🚀 Create Developer Account
            </DialogTitle>
            <DialogDescription className="text-center text-white">
              Get your unique PDA wallet to start earning fees from your API integrations
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="dev-project-name" className="text-white font-semibold">
                Project Name
              </Label>
              <Input
                id="dev-project-name"
                placeholder="E.g: MyApp, Birdeye, Meteora"
                value={devProjectName}
                onChange={(e) => setDevProjectName(e.target.value)}
                maxLength={50}
                className="bg-slate-900/50 border-purple-400/30 text-white placeholder:text-white/50 h-12 text-lg"
                data-testid="input-dev-project-name"
              />
            </div>

            <div className="bg-blue-900/30 rounded-lg p-4 space-y-2">
              <p className="text-sm text-blue-200 font-semibold">What you'll get:</p>
              <ul className="text-sm text-blue-100 space-y-1">
                <li>✅ Unique PDA wallet address</li>
                <li>✅ Earn 80% of fees from your integrations</li>
                <li>✅ Access to full API documentation</li>
                <li>✅ Track your earnings in real-time</li>
              </ul>
            </div>
          </div>

          <DialogFooter className="flex flex-col gap-2">
            <Button
              onClick={() => createDevAccountMutation.mutate()}
              disabled={!devProjectName.trim() || createDevAccountMutation.isPending}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white h-12 text-lg font-semibold"
              data-testid="button-create-dev-account"
            >
              {createDevAccountMutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
                  Creating Your PDA Wallet...
                </>
              ) : (
                "Create Account & Sign"
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowDevAccountModal(false)}
              className="w-full text-white hover:text-white"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Mobile bottom nav — flex child of the h-screen container, no fixed/portal needed */}
      {isConnected && (
        <div className="md:hidden shrink-0 flex items-center py-3 relative z-[60]" style={{ backgroundColor: '#0f172a', borderTop: '1px solid rgba(100,116,139,0.3)' }}>
          <button
            onClick={() => setActiveTab('reclaim')}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: (activeTab === 'reclaim' || activeTab === 'burnTokens') ? '#c084fc' : '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <svg style={{ width: '20px', height: '20px', fill: '#00FFA3' }} viewBox="0 0 397.7 311.7">
              <path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"/>
              <path d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1L333.1,73.8c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"/>
              <path d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z"/>
            </svg>
            <span style={{ fontSize: '11px', fontWeight: 500 }}>Claim + Burn</span>
          </button>
          <button
            onClick={() => setActiveTab('coinflip')}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: activeTab === 'coinflip' ? '#c084fc' : '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <img src="/coin_icon.png" alt="Coin Flip" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
            <span style={{ fontSize: '11px', fontWeight: 500 }}>Coin Flip</span>
          </button>
          <button
            onClick={() => setActiveTab('staking')}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: activeTab === 'staking' ? '#c084fc' : '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <FaSackDollar style={{ width: '20px', height: '20px' }} />
            <span style={{ fontSize: '11px', fontWeight: 500 }}>Staking</span>
          </button>
          {canViewPerps && (
            <Link href="/perps" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: '#9ca3af', textDecoration: 'none', cursor: 'pointer' }}>
              <span style={{ fontSize: '20px', lineHeight: 1 }}>📈</span>
              <span style={{ fontSize: '11px', fontWeight: 500 }}>Perps</span>
            </Link>
          )}
          {canViewPartners && (
            <Link href="/partners" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: '#fde68a', textDecoration: 'none', cursor: 'pointer' }}>
              <span style={{ fontSize: '20px', lineHeight: 1 }}>🤝</span>
              <span style={{ fontSize: '11px', fontWeight: 500 }}>Partners</span>
            </Link>
          )}
        </div>
      )}
    </div>
    </>
  );
}