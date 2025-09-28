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
import { Coins, Wallet, Search, CheckCircle, ExternalLink, AlertTriangle, RefreshCw, Flame, Image, Trash2, ArrowLeftRight, ArrowUpDown, Copy, Share2, Users, TrendingUp, DollarSign, Globe, ChevronDown, Code, Shield, Cpu, TreePine, Info, Check } from "lucide-react";
import { SiX, SiDiscord } from 'react-icons/si';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWalletAdapter } from '@/hooks/useWalletAdapter';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { VersionedTransaction, Transaction } from '@solana/web3.js';
import logoImage from '@assets/image_1757882056840.png';

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
  
  // Note: UMI will be created inside the burn handler to avoid initialization errors
  
  const donationPercentage = 15; // Fixed 15% service fee
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'referrals' | 'reclaim' | 'burnTokens'>('reclaim');
  const [burnSubTab, setBurnSubTab] = useState<'tokens' | 'nft'>('tokens');
  const [selectedTokenMint, setSelectedTokenMint] = useState<string>('So11111111111111111111111111111111111111112'); // Default to SOL
  const [tokenList, setTokenList] = useState<any[]>([]);
  const [nftData, setNftData] = useState<any>(null);
  const [selectedNfts, setSelectedNfts] = useState<Set<string>>(new Set());
  const [referralCode, setReferralCode] = useState<string>('');
  const [userReferralCode, setUserReferralCode] = useState<string | null>(null);

  // Selection states for bulk burning
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());

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

      // Wait for confirmation with error handling
      try {
        await connection.confirmTransaction(signature, 'confirmed');
        console.log('Transaction confirmed successfully!');
      } catch (confirmError: any) {
        console.warn('Transaction confirmation failed but transaction was sent:', confirmError.message);
        console.warn('Transaction signature:', signature);
        // Continue with success recording since transaction was sent
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

      // Wait for confirmation with error handling
      try {
        await connection.confirmTransaction(signature, 'confirmed');
        console.log('✅ Transaction confirmed successfully!');
      } catch (confirmError: any) {
        console.warn('Transaction confirmation failed but transaction was sent:', confirmError.message);
        console.warn('Transaction signature:', signature);
        // Continue with success recording since transaction was sent
      }

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

      // Find the selected NFTs and prepare data for batch burning
      const selectedNfts = nftData.nfts.filter((nft: any) => {
        const nftId = nft.mint || nft.id || nft.assetId;
        return selectedNftIds.includes(nftId);
      });

      if (selectedNfts.length === 0) {
        throw new Error('No valid NFTs selected');
      }

      console.log(`🔥 Starting batch burn for ${selectedNfts.length} NFTs...`);

      // Prepare NFT data for the batch endpoint
      const nftsForBatch = selectedNfts.map((nft: any) => ({
        id: nft.mint || nft.id || nft.assetId,
        type: nft.type === 'cnft' ? 'core' : nft.type, // Skip cNFTs by treating as unsupported, map others correctly
        mint: nft.mint || nft.id || nft.assetId,
        tokenAccount: nft.tokenAccount,
        collection: nft.collection,
        masterEdition: nft.masterEdition, 
        metadata: nft.metadata,
        ruleSet: nft.ruleSet,
        name: nft.name
      })).filter(nft => nft.type !== 'cnft'); // Filter out compressed NFTs

      if (nftsForBatch.length === 0) {
        throw new Error('No supported NFTs selected (compressed NFTs are not supported)');
      }

      // Call the new batch burning endpoint
      console.log(`📦 Calling batch burn endpoint for ${nftsForBatch.length} NFTs...`);
      const batchResponse = await apiRequest('POST', '/api/nfts/burn/batch', {
        nfts: nftsForBatch,
        walletAddress: publicKey.toString()
      });

      const batchData = await batchResponse.json();
      console.log('🔧 Server prepared batch transactions:', batchData);

      if (!batchData.success || !batchData.batchTransactions || batchData.batchTransactions.length === 0) {
        throw new Error(batchData.message || 'Failed to prepare batch transactions');
      }

      console.log(`🔐 Signing ${batchData.batchTransactions.length} batch transactions...`);

      // Convert base64 transactions to Transaction objects
      const transactions = batchData.batchTransactions.map((batch: any) => {
        const txBuffer = Buffer.from(batch.transaction, 'base64');
        return Transaction.from(txBuffer);
      });

      let signedTransactions;
      let successfulBurns = 0;
      let totalRecovered = 0;

      try {
        // Try to sign all transactions at once if wallet supports it
        if (wallet.signAllTransactions) {
          console.log('📝 Using signAllTransactions for batch signing...');
          signedTransactions = await wallet.signAllTransactions(transactions);
        } else {
          console.log('📝 Signing transactions individually...');
          signedTransactions = [];
          for (let i = 0; i < transactions.length; i++) {
            console.log(`🔐 Signing transaction ${i + 1}/${transactions.length}...`);
            const signed = await wallet.signTransaction(transactions[i]);
            signedTransactions.push(signed);
          }
        }

        // Submit each signed transaction
        for (let i = 0; i < signedTransactions.length; i++) {
          const batch = batchData.batchTransactions[i];
          const signedTx = signedTransactions[i];
          
          try {
            console.log(`📡 Submitting batch transaction ${i + 1}/${signedTransactions.length}...`);
            
            // Submit the signed transaction
            const signature = await connection.sendRawTransaction(signedTx.serialize(), {
              skipPreflight: false,
              maxRetries: 3
            });

            // Wait for confirmation
            const confirmation = await connection.confirmTransaction(signature, 'confirmed');
            
            if (!confirmation.value.err) {
              console.log(`✅ Batch transaction ${i + 1} confirmed: ${signature}`);
              successfulBurns += batch.items.length;
              totalRecovered += batch.netAmount;

              // Record each NFT burn in the batch
              for (const item of batch.items) {
                try {
                  await apiRequest('POST', '/api/nfts/burn/record', {
                    nftId: item.id,
                    signature: signature,
                    walletAddress: publicKey.toString(),
                    success: true,
                    rentRecovered: item.expectedRent,
                    fees: item.fees
                  });
                } catch (recordError) {
                  console.warn(`Failed to record burn for NFT ${item.id}:`, recordError);
                }
              }
            } else {
              console.error(`❌ Batch transaction ${i + 1} failed:`, confirmation.value.err);
              // Record failures for NFTs in this batch
              for (const item of batch.items) {
                try {
                  await apiRequest('POST', '/api/nfts/burn/record', {
                    nftId: item.id,
                    signature: signature,
                    walletAddress: publicKey.toString(),
                    success: false,
                    error: JSON.stringify(confirmation.value.err)
                  });
                } catch (recordError) {
                  console.warn(`Failed to record failed burn for NFT ${item.id}:`, recordError);
                }
              }
            }
          } catch (txError) {
            console.error(`❌ Failed to submit batch transaction ${i + 1}:`, txError);
            
            // Record failures for NFTs in this batch
            for (const item of batch.items) {
              try {
                await apiRequest('POST', '/api/nfts/burn/record', {
                  nftId: item.id,
                  walletAddress: publicKey.toString(),
                  success: false,
                  error: txError instanceof Error ? txError.message : 'Transaction submission failed'
                });
              } catch (recordError) {
                console.warn(`Failed to record failed burn for NFT ${item.id}:`, recordError);
              }
            }
          }
        }

        if (successfulBurns === 0) {
          throw new Error('No NFTs were successfully burned');
        }

        console.log(`🎉 Successfully burned ${successfulBurns} NFTs, recovered ${totalRecovered} SOL`);
        
        return {
          success: true,
          burnedCount: successfulBurns,
          totalRecovered,
          message: `Successfully burned ${successfulBurns} NFT${successfulBurns > 1 ? 's' : ''}`
        };

      } catch (signingError) {
        console.error('❌ Failed to sign transactions:', signingError);
        
        // Record all as failures
        for (const nft of nftsForBatch) {
          try {
            await apiRequest('POST', '/api/nfts/burn/record', {
              nftId: nft.id,
              walletAddress: publicKey.toString(),
              success: false,
              error: signingError instanceof Error ? signingError.message : 'Transaction signing failed'
            });
          } catch (recordError) {
            console.warn(`Failed to record failed burn for NFT ${nft.id}:`, recordError);
          }
        }
        
        throw signingError;
      }
    },
    onSuccess: (result) => {
      console.log(`🎉 NFT burning completed:`, result);
      
      toast({
        title: "Success!",
        description: result.message,
        variant: "default",
      });

      // Clear selection after successful burn
      setSelectedNfts(new Set());
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/nfts/scan'] });
      queryClient.invalidateQueries({ queryKey: ['/api/transactions/history'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sol-refund/stats'] });
    },
    onError: (error) => {
      console.error('❌ NFT burning failed:', error);
      console.error('Error burning NFTs:', error);
      
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to burn NFTs',
        variant: "destructive",
      });
    }
  });


  // Handler functions
  const handleScanWallet = () => {
    if (publicKey) {
      scanMutation.mutate(publicKey.toString());
    }
  };

  const handleScanTokens = () => {
    if (publicKey) {
      scanTokensMutation.mutate(publicKey.toString());
    }
  };

  const handleScanNfts = () => {
    if (publicKey) {
      scanNftsMutation.mutate(publicKey.toString());
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 pt-1 pb-2 max-w-6xl">
        <div className="space-y-2">
          {/* Header with Navigation and Wallet Connection */}
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between mb-2 space-y-4 lg:space-y-0">
            <div className="flex items-center space-x-3">
              <img src={logoImage} alt="Logo" className="h-8 w-8 rounded-md" />
              <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
                Get Your SOL Back!
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <WalletMultiButton />
            </div>
          </div>

          {/* Main Content */}
          {isConnected && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Scan Wallet Section */}
              <div className="lg:col-span-1">
                <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
                  <h2 className="text-xl font-bold text-white mb-4">Scan Your Wallet</h2>
                  <div className="space-y-4">
                    <Button 
                      onClick={handleScanWallet}
                      disabled={scanMutation.isPending}
                      className="w-full bg-black/20 backdrop-blur-sm border border-purple-500/30 hover:bg-black/30 hover:border-purple-400/50 text-white"
                    >
                      {scanMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Search className="h-4 w-4 mr-2" />
                      )}
                      Scan SOL Refunds
                    </Button>
                    
                    <Button 
                      onClick={handleScanTokens}
                      disabled={scanTokensMutation.isPending}
                      className="w-full bg-black/20 backdrop-blur-sm border border-purple-500/30 hover:bg-black/30 hover:border-purple-400/50 text-white"
                    >
                      {scanTokensMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Search className="h-4 w-4 mr-2" />
                      )}
                      Scan Tokens
                    </Button>
                    
                    <Button 
                      onClick={handleScanNfts}
                      disabled={scanNftsMutation.isPending}
                      className="w-full bg-black/20 backdrop-blur-sm border border-purple-500/30 hover:bg-black/30 hover:border-purple-400/50 text-white"
                    >
                      {scanNftsMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Search className="h-4 w-4 mr-2" />
                      )}
                      Scan NFTs
                    </Button>
                  </div>
                </div>
              </div>

              {/* NFT Burning Section */}
              {nftData && nftData.nfts && nftData.nfts.length > 0 && (
                <div className="lg:col-span-2">
                  <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-xl font-bold text-white">Burn NFTs</h2>
                      <div className="flex items-center space-x-2">
                        <Button
                          onClick={() => setSelectedNfts(new Set(nftData.nfts.map((nft: any) => nft.id || nft.mint || nft.assetId)))}
                          variant="outline"
                          size="sm"
                          className="border-purple-500/30 text-purple-300 hover:bg-purple-500/20"
                        >
                          Select All
                        </Button>
                        <Button
                          onClick={() => setSelectedNfts(new Set())}
                          variant="outline"
                          size="sm"
                          className="border-purple-500/30 text-purple-300 hover:bg-purple-500/20"
                        >
                          Clear All
                        </Button>
                        <Button
                          onClick={() => burnNftsMutation.mutate(Array.from(selectedNfts))}
                          disabled={selectedNfts.size === 0 || burnNftsMutation.isPending}
                          className="bg-red-600 hover:bg-red-700 text-white"
                        >
                          {burnNftsMutation.isPending ? (
                            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Flame className="h-4 w-4 mr-2" />
                          )}
                          Burn Selected ({selectedNfts.size})
                        </Button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-purple-600 scrollbar-track-purple-300">
                      {nftData.nfts.map((nft: any) => {
                        const nftId = nft.id || nft.mint || nft.assetId;
                        const isSelected = selectedNfts.has(nftId);
                        
                        return (
                          <div
                            key={nftId}
                            className={`relative cursor-pointer rounded-lg border-2 transition-all ${
                              isSelected 
                                ? 'border-purple-500 bg-purple-500/20' 
                                : 'border-purple-500/30 hover:border-purple-400/50'
                            }`}
                            onClick={() => {
                              const newSet = new Set(selectedNfts);
                              if (isSelected) {
                                newSet.delete(nftId);
                              } else {
                                newSet.add(nftId);
                              }
                              setSelectedNfts(newSet);
                            }}
                          >
                            <div className="aspect-square">
                              {nft.image ? (
                                <img 
                                  src={nft.image} 
                                  alt={nft.name || 'NFT'} 
                                  className="w-full h-full object-cover rounded-lg"
                                />
                              ) : (
                                <div className="w-full h-full bg-purple-800/50 rounded-lg flex items-center justify-center">
                                  <span className="text-purple-300">No Image</span>
                                </div>
                              )}
                            </div>
                            {isSelected && (
                              <div className="absolute top-2 right-2 bg-purple-500 rounded-full w-6 h-6 flex items-center justify-center">
                                <Check className="h-4 w-4 text-white" />
                              </div>
                            )}
                            <div className="p-2">
                              <p className="text-sm text-white font-medium truncate">
                                {nft.name || 'Unnamed NFT'}
                              </p>
                              <p className="text-xs text-purple-300 capitalize">
                                {nft.type || 'Unknown'}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {!isConnected && (
            <div className="text-center py-12">
              <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-8">
                <Wallet className="h-16 w-16 text-purple-400 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">Connect Your Wallet</h2>
                <p className="text-purple-300">Connect your wallet to start reclaiming SOL and burning NFTs</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
