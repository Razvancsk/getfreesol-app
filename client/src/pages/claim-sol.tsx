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
import { Coins, Wallet, Search, CheckCircle, ExternalLink, AlertTriangle, RefreshCw, Flame, Image, Trash2, ArrowLeftRight, ArrowUpDown, Copy, Share2, Users, TrendingUp, DollarSign, Globe, ChevronDown, Code, Shield, Cpu, TreePine, Info, Check, Loader2, BarChart3 } from "lucide-react";
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
import { VersionedTransaction } from '@solana/web3.js';
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
  const [activeTab, setActiveTab] = useState<'scan' | 'burnTokens' | 'stats' | 'referrals' | 'reclaim'>('scan');
  const [burnSubTab, setBurnSubTab] = useState<'tokens' | 'nft'>('tokens');
  const [selectedTokenMint, setSelectedTokenMint] = useState<string>('So11111111111111111111111111111111111111112'); // Default to SOL
  const [tokenList, setTokenList] = useState<any[]>([]);
  const [nftData, setNftData] = useState<any>(null);
  const [selectedNfts, setSelectedNfts] = useState<Set<string>>(new Set());
  const [referralCode, setReferralCode] = useState<string>('');
  const [userReferralCode, setUserReferralCode] = useState<string | null>(null);
  
  // Input field states for different wallet addresses
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [tokenWalletAddress, setTokenWalletAddress] = useState<string>('');
  const [nftWalletAddress, setNftWalletAddress] = useState<string>('');

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
    if (isConnected && publicKey && activeTab !== 'referrals' && activeTab !== 'reclaim') {
      if (activeTab === 'scan') {
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
      setActiveTab('scan'); // Reset to first page when wallet disconnects
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

      // Get the NFT data to prepare batch request
      if (!nftData || !nftData.nfts) {
        throw new Error('No NFT data available');
      }

      // Find the selected NFTs
      const selectedNfts = nftData.nfts.filter((nft: any) => {
        const nftId = nft.mint || nft.id || nft.assetId;
        return selectedNftIds.includes(nftId);
      });

      if (selectedNfts.length === 0) {
        throw new Error('No valid NFTs selected');
      }

      console.log(`🔥 Starting batch burn for ${selectedNfts.length} NFTs...`);

      // Prepare NFT data for batch endpoint
      const nftsForBatch = selectedNfts.map((nft: any) => ({
        type: nft.type,
        mint: nft.mint,
        assetId: nft.id || nft.assetId,
        tokenAccount: nft.tokenAccount,
        collection: nft.collection?.id,
        ruleSet: nft.ruleSet
      })).filter(nft => nft.type !== 'cnft'); // Skip cNFTs for now

      if (nftsForBatch.length === 0) {
        throw new Error('No supported NFTs selected (cNFTs not yet supported in batch)');
      }

      // Call batch burn endpoint
      console.log(`📦 Preparing batch burn for ${nftsForBatch.length} NFTs...`);
      const batchResponse = await apiRequest('POST', '/api/nfts/prepare-burn-batch', {
        walletAddress: publicKey.toString(),
        nfts: nftsForBatch
      });

      const batchData = await batchResponse.json();
      
      if (!batchData.success || !batchData.txs || batchData.txs.length === 0) {
        throw new Error(batchData.error || 'Failed to prepare batch burn transactions');
      }

      console.log(`🔧 Server prepared ${batchData.txs.length} batch transactions for ${nftsForBatch.length} NFTs`);

      const results = [];
      let totalBurnedCount = 0;

      // Process each batch transaction
      for (let i = 0; i < batchData.txs.length; i++) {
        const txBase64 = batchData.txs[i];
        const batchInfo = batchData.batchTransactions[i];
        
        try {
          console.log(`🔐 Signing batch transaction ${i + 1}/${batchData.txs.length} (${batchInfo.count} NFTs)`);
          
          // Decode and sign the transaction
          const transaction = web3.Transaction.from(Buffer.from(txBase64, 'base64'));
          
          // Sign transaction with wallet
          const signedTransaction = await wallet.signTransaction!(transaction);
          
          // Send the signed transaction
          const connection = new web3.Connection(
            import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
            'confirmed'
          );
          
          const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          });

          // Confirm the transaction
          const confirmation = await connection.confirmTransaction(signature, 'confirmed');
          
          if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
          }

          console.log(`✅ Batch transaction ${i + 1} confirmed: ${signature}`);
          
          // Record each NFT burn with server
          for (const nftId of batchInfo.nftIds) {
            try {
              await apiRequest('POST', '/api/nfts/burn/record', {
                nftMint: nftId,
                signature: signature,
                success: true,
                walletAddress: publicKey.toString(),
                nftType: batchInfo.type,
                rentRecovered: (batchInfo.expectedRent / batchInfo.count).toFixed(6) // Estimate per NFT
              });
            } catch (recordError) {
              console.log(`⚠️ Failed to record burn for ${nftId}:`, recordError);
            }
          }

          results.push({
            type: batchInfo.type,
            nftsProcessed: batchInfo.count,
            totalAttempted: batchInfo.count,
            solRecovered: batchInfo.expectedRent,
            netAmount: batchInfo.expectedRent - batchInfo.platformFee - batchInfo.referralFee,
            feeAmount: batchInfo.platformFee + batchInfo.referralFee,
            signatures: [signature],
            signature: signature
          });

          totalBurnedCount += batchInfo.count;

        } catch (batchError: any) {
          console.error(`❌ Batch transaction ${i + 1} failed:`, batchError);
          
          // Record failed burns
          for (const nftId of batchInfo.nftIds) {
            try {
              await apiRequest('POST', '/api/nfts/burn/record', {
                nftMint: nftId,
                signature: '',
                success: false,
                error: batchError.message || 'Batch transaction failed',
                walletAddress: publicKey.toString(),
                nftType: batchInfo.type
              });
            } catch (recordError) {
              console.log(`⚠️ Failed to record failed burn for ${nftId}:`, recordError);
            }
          }

          results.push({
            type: batchInfo.type,
            nftsProcessed: 0,
            totalAttempted: batchInfo.count,
            solRecovered: 0,
            netAmount: 0,
            feeAmount: 0,
            signatures: [],
            error: batchError.message || 'Batch transaction failed'
          });
        }
      }

      if (totalBurnedCount === 0) {
        throw new Error('No NFTs were successfully burned');
      }

      return results;
    },
    onSuccess: (results) => {
      if (!results) return;
      
      const totalBurned = results.reduce((sum, r) => sum + (r.nftsProcessed || 0), 0);
      const totalSolRecovered = results.reduce((sum, r) => sum + (r.solRecovered || 0), 0);
      const totalNetAmount = results.reduce((sum, r) => sum + (r.netAmount || 0), 0);

      // Optimistically remove burned NFTs from local state
      if (totalBurned > 0) {
        const allBurnedIds: string[] = [];
        results.forEach(result => {
          if (result.signatures && result.signatures.length > 0) {
            // For batch results, we need to track the NFT IDs that were burned
            // This will be handled by the batch transaction data
          }
        });

        // Clear burned NFTs from selection
        setSelectedNfts(new Set());

        // Update local NFT data to remove burned NFTs
        setNftData((prev: any) => {
          if (!prev?.nfts) return prev;
          
          // For now, we'll invalidate and refetch rather than trying to track exact IDs
          // This ensures consistency with the server state
          return prev;
        });

        // Show success message
        const firstSignature = results.find(r => r.signatures?.[0])?.signatures?.[0] || '';
        toast({
          title: `Successfully burned ${totalBurned} NFT${totalBurned > 1 ? 's' : ''}!`,
          description: totalSolRecovered > 0 ? 
            `Recovered ${totalNetAmount.toFixed(6)} SOL (after fees)` :
            `Transaction: ${firstSignature.substring(0, 8)}...`,
          className: "bg-green-600 text-white border-green-600",
        });
      }

      // Refresh NFT data after successful burns
      if (publicKey) {
        scanNftsMutation.mutate(publicKey.toString());
      }

      // Refresh stats if SOL was recovered
      if (totalSolRecovered > 0) {
        queryClient.invalidateQueries({ queryKey: ['/api/sol-refund/stats'] });
      }
    },
    onError: (error: any) => {
      console.error('Error burning NFTs:', error);

      let errorMessage = "Failed to burn NFTs. Please try again.";
      if (error.message) {
        if (error.message.includes('User rejected')) {
          errorMessage = "Transaction cancelled by user.";
        } else if (error.message.includes('cNFTs not yet supported')) {
          errorMessage = "Compressed NFTs are not yet supported in batch burning.";
        } else {
          errorMessage = error.message;
        }
      }

      toast({
        title: "Burn Failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  });

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

  // Clean up selected NFTs when wallet disconnects or tab changes
  useEffect(() => {
    if (activeTab !== 'burnTokens' || burnSubTab !== 'nft') {
      setSelectedNfts(new Set());
    }
  }, [activeTab, burnSubTab]);

  // Clear selected NFTs when NFT list changes
  useEffect(() => {
    const nftList = nftData?.nfts || [];
    if (nftList.length === 0) {
      setSelectedNfts(new Set());
    } else {
      // Remove any selected NFTs that are no longer in the current list
      const currentNftIds = new Set(nftList.map(nft => nft.id));
      setSelectedNfts(prev => {
        const filteredSelection = new Set<string>();
        prev.forEach(id => {
          if (currentNftIds.has(id)) {
            filteredSelection.add(id);
          }
        });
        return filteredSelection;
      });
    }
  }, [nftData]);

  // Handler functions for scanning
  const handleScan = () => {
    if (!walletAddress) {
      toast({
        title: "Error",
        description: "Please enter a wallet address",
        variant: "destructive",
      });
      return;
    }
    scanMutation.mutate(walletAddress);
  };

  const handleScanTokens = () => {
    if (!tokenWalletAddress) {
      toast({
        title: "Error", 
        description: "Please enter a wallet address",
        variant: "destructive",
      });
      return;
    }
    scanTokensMutation.mutate(tokenWalletAddress);
  };

  const handleScanNfts = () => {
    if (!nftWalletAddress) {
      toast({
        title: "Error",
        description: "Please enter a wallet address", 
        variant: "destructive",
      });
      return;
    }
    scanNftsMutation.mutate(nftWalletAddress);
  };

  // Claim all mutation for bulk claiming
  const claimAllMutation = useMutation({
    mutationFn: async () => {
      if (!scanResult || !publicKey) {
        throw new Error('No scan result or wallet not connected');
      }
      
      const response = await fetch('/api/sol-refund/claim-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: publicKey.toString(),
          accounts: scanResult.accounts,
          referralCode: referralCode || undefined
        })
      });

      if (!response.ok) {
        throw new Error('Failed to claim SOL');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success!",
        description: `Claimed ${data.solRecovered} SOL from ${data.accountsClosed} accounts`,
      });
      // Refresh scan to update the results
      if (publicKey) {
        scanMutation.mutate(publicKey.toString());
      }
      // Refresh stats
      queryClient.invalidateQueries({ queryKey: ['/api/sol-refund/stats'] });
    },
    onError: (error) => {
      console.error('Error claiming SOL:', error);
      toast({
        title: "Claim Failed",
        description: error.message || "Failed to claim SOL. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleClaimAll = () => {
    if (!scanResult || scanResult.emptyAccounts === 0) {
      toast({
        title: "Error",
        description: "No empty accounts to claim",
        variant: "destructive",
      });
      return;
    }
    claimAllMutation.mutate();
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
                  className="h-[100px] w-[100px]"
                />
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
                    title="Join our Discord"
                  >
                    <SiDiscord className="h-4 w-4 text-white" />
                  </a>
                </div>
                <WalletMultiButton className="wallet-adapter-button-trigger" />
              </div>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex lg:items-center lg:space-x-4">
              {/* Left: Navigation */}
              <div className="flex items-center space-x-6">
                <button
                  onClick={() => setActiveTab('scan')}
                  data-testid="nav-empty-accounts"
                  className={`font-medium transition-colors ${
                    activeTab === 'scan'
                      ? 'text-green-400'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  Empty Accounts
                </button>
                <button
                  onClick={() => setActiveTab('burnTokens')}
                  data-testid="nav-burn-tokens"
                  className={`font-medium transition-colors ${
                    activeTab === 'burnTokens'
                      ? 'text-green-400'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  Burn Tokens
                </button>
                <button
                  onClick={() => setActiveTab('stats')}
                  data-testid="nav-statistics"
                  className={`font-medium transition-colors ${
                    activeTab === 'stats'
                      ? 'text-green-400'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  Statistics
                </button>
              </div>

              {/* Right: Social + Wallet */}
              <div className="flex items-center space-x-3">
                {/* Social Media Buttons */}
                <div className="flex items-center space-x-2">
                  <a
                    href="https://x.com/getfreesol_xyz"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="button-social-x-desktop"
                    className="flex items-center justify-center w-9 h-9 bg-purple-800/60 hover:bg-purple-700/60 backdrop-blur-sm rounded-lg transition-colors border border-purple-500/30"
                    title="Follow us on X (Twitter)"
                  >
                    <SiX className="h-4 w-4 text-white" />
                  </a>
                  <a
                    href="https://discord.gg/tSBMgYcZaK"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="button-social-discord-desktop"
                    className="flex items-center justify-center w-9 h-9 bg-purple-800/60 hover:bg-purple-700/60 backdrop-blur-sm rounded-lg transition-colors border border-purple-500/30"
                    title="Join our Discord"
                  >
                    <SiDiscord className="h-4 w-4 text-white" />
                  </a>
                </div>

                {/* Wallet Connection */}
                <WalletMultiButton className="wallet-adapter-button-trigger" />
              </div>
            </div>
          </div>

          {/* Main Content */}
          {activeTab === 'scan' && (
            <Card className="bg-gradient-to-br from-slate-800/50 to-purple-800/30 backdrop-blur-sm border-purple-500/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <Search className="mr-2 h-5 w-5" />
                  Scan for Empty Token Accounts
                </CardTitle>
                <CardDescription className="text-gray-300">
                  Find and reclaim SOL from dormant token accounts
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-2 sm:space-y-0">
                    <div className="flex-1">
                      <Input
                        placeholder="Enter Solana wallet address..."
                        value={walletAddress}
                        onChange={(e) => setWalletAddress(e.target.value)}
                        className="bg-slate-700/50 border-purple-500/30 text-white placeholder-gray-400"
                        data-testid="input-wallet-address"
                      />
                    </div>
                    <Button
                      onClick={handleScan}
                      disabled={!walletAddress || scanMutation.isPending}
                      className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                      data-testid="button-scan"
                    >
                      {scanMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Scanning...
                        </>
                      ) : (
                        <>
                          <Search className="mr-2 h-4 w-4" />
                          Scan Wallet
                        </>
                      )}
                    </Button>
                  </div>

                  {scanResult && (
                    <div className="mt-6 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-slate-700/30 rounded-lg p-4 text-center">
                          <div className="text-2xl font-bold text-green-400">
                            {scanResult.emptyAccounts?.length || 0}
                          </div>
                          <div className="text-sm text-gray-300">Empty Accounts</div>
                        </div>
                        <div className="bg-slate-700/30 rounded-lg p-4 text-center">
                          <div className="text-2xl font-bold text-yellow-400">
                            {parseFloat(scanResult.totalReclaimable || '0').toFixed(4)} SOL
                          </div>
                          <div className="text-sm text-gray-300">Total Reclaimable</div>
                        </div>
                        <div className="bg-slate-700/30 rounded-lg p-4 text-center">
                          <div className="text-2xl font-bold text-blue-400">
                            {refundCalc.net.toFixed(4)} SOL
                          </div>
                          <div className="text-sm text-gray-300">After Service Fee</div>
                        </div>
                      </div>

                      {scanResult.emptyAccounts && scanResult.emptyAccounts.length > 0 && (
                        <Button
                          onClick={handleClaimAll}
                          disabled={claimAllMutation.isPending}
                          className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white"
                          data-testid="button-claim-all"
                        >
                          {claimAllMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Claiming SOL...
                            </>
                          ) : (
                            <>
                              <Coins className="mr-2 h-4 w-4" />
                              Claim {refundCalc.net.toFixed(4)} SOL
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Burn Tokens Tab */}
          {activeTab === 'burnTokens' && (
            <Card className="bg-gradient-to-br from-slate-800/50 to-purple-800/30 backdrop-blur-sm border-purple-500/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <Flame className="mr-2 h-5 w-5" />
                  Burn Tokens & NFTs
                </CardTitle>
                <CardDescription className="text-gray-300">
                  Burn unwanted tokens and NFTs to reclaim SOL
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Sub-navigation */}
                <div className="flex space-x-4 mb-6">
                  <button
                    onClick={() => setBurnSubTab('token')}
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      burnSubTab === 'token'
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-700/50 text-gray-300 hover:text-white'
                    }`}
                    data-testid="tab-burn-tokens"
                  >
                    Tokens
                  </button>
                  <button
                    onClick={() => setBurnSubTab('nft')}
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      burnSubTab === 'nft'
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-700/50 text-gray-300 hover:text-white'
                    }`}
                    data-testid="tab-burn-nfts"
                  >
                    NFTs
                  </button>
                </div>

                {/* Token Burning Section */}
                {burnSubTab === 'token' && (
                  <div className="space-y-4">
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-2 sm:space-y-0">
                        <div className="flex-1">
                          <Input
                            placeholder="Enter wallet address to scan for tokens..."
                            value={tokenWalletAddress}
                            onChange={(e) => setTokenWalletAddress(e.target.value)}
                            className="bg-slate-700/50 border-purple-500/30 text-white placeholder-gray-400"
                            data-testid="input-token-wallet-address"
                          />
                        </div>
                        <Button
                          onClick={handleScanTokens}
                          disabled={!tokenWalletAddress || scanTokensMutation.isPending}
                          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                          data-testid="button-scan-tokens"
                        >
                          {scanTokensMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Scanning...
                            </>
                          ) : (
                            <>
                              <Search className="mr-2 h-4 w-4" />
                              Scan for Tokens
                            </>
                          )}
                        </Button>
                      </div>

                      {/* Token List */}
                      {tokenList.length > 0 && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-white">
                              Found {tokenList.length} Tokens
                            </h3>
                            <div className="flex space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedTokens(new Set(tokenList.map(token => token.mint)))}
                                className="border-purple-500/30 text-purple-300 hover:bg-purple-500/20"
                                data-testid="button-select-all-tokens"
                              >
                                Select All
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedTokens(new Set())}
                                className="border-purple-500/30 text-purple-300 hover:bg-purple-500/20"
                                data-testid="button-deselect-all-tokens"
                              >
                                Deselect All
                              </Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                            {tokenList.map((token, index) => {
                              const isSelected = selectedTokens.has(token.mint);
                              return (
                                <div
                                  key={`${token.mint}-${index}`}
                                  onClick={() => {
                                    setSelectedTokens(prev => {
                                      const newSet = new Set(prev);
                                      if (isSelected) {
                                        newSet.delete(token.mint);
                                      } else {
                                        newSet.add(token.mint);
                                      }
                                      return newSet;
                                    });
                                  }}
                                  className={`relative bg-gradient-to-br from-purple-700/20 to-purple-800/30 backdrop-blur-sm border rounded-lg p-3 transition-all cursor-pointer ${
                                    isSelected 
                                      ? 'border-green-400/50 bg-green-900/20' 
                                      : 'border-purple-500/30 hover:border-purple-400/50'
                                  }`}
                                  data-testid={`token-card-${token.mint}`}
                                >
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <h4 className="font-medium text-white truncate">
                                        {token.name || 'Unknown Token'}
                                      </h4>
                                      {isSelected && (
                                        <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                                          <Check className="w-3 h-3 text-white" />
                                        </div>
                                      )}
                                    </div>
                                    <div className="text-sm text-gray-300">
                                      <div>Balance: {token.balance}</div>
                                      <div className="truncate">Mint: {token.mint}</div>
                                      <div>Rent: ~{token.estimatedRent} SOL</div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {selectedTokens.size > 0 && (
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4 border-t border-purple-500/30">
                              <div className="text-sm text-gray-300">
                                {selectedTokens.size} tokens selected
                              </div>
                              <Button
                                onClick={() => {
                                  const selectedMints = Array.from(selectedTokens);
                                  selectedMints.forEach(mint => handleBurnToken(mint));
                                }}
                                disabled={burnTokenMutation.isPending}
                                className="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white"
                                data-testid="button-burn-selected-tokens"
                              >
                                {burnTokenMutation.isPending ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Burning...
                                  </>
                                ) : (
                                  <>
                                    <Flame className="mr-2 h-4 w-4" />
                                    Burn Selected Tokens
                                  </>
                                )}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* NFT Burning Section with Batch Support */}
                {burnSubTab === 'nft' && (
                  <div className="space-y-4">
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-2 sm:space-y-0">
                        <div className="flex-1">
                          <Input
                            placeholder="Enter wallet address to scan for NFTs..."
                            value={nftWalletAddress}
                            onChange={(e) => setNftWalletAddress(e.target.value)}
                            className="bg-slate-700/50 border-purple-500/30 text-white placeholder-gray-400"
                            data-testid="input-nft-wallet-address"
                          />
                        </div>
                        <Button
                          onClick={handleScanNfts}
                          disabled={!nftWalletAddress || scanNftsMutation.isPending}
                          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                          data-testid="button-scan-nfts"
                        >
                          {scanNftsMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Scanning...
                            </>
                          ) : (
                            <>
                              <Search className="mr-2 h-4 w-4" />
                              Scan for NFTs
                            </>
                          )}
                        </Button>
                      </div>

                      {/* NFT List with Batch Burning Support */}
                      {(nftData?.nfts || []).length > 0 && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-white">
                              Found {(nftData?.nfts || []).length} NFTs (Batch Burning Enabled!)
                            </h3>
                            <div className="flex space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedNfts(new Set((nftData?.nfts || []).map(nft => nft.id)))}
                                className="border-purple-500/30 text-purple-300 hover:bg-purple-500/20"
                                data-testid="button-select-all-nfts"
                              >
                                Select All
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedNfts(new Set())}
                                className="border-purple-500/30 text-purple-300 hover:bg-purple-500/20"
                                data-testid="button-deselect-all-nfts"
                              >
                                Deselect All
                              </Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto scrollbar-thin scrollbar-track-slate-800 scrollbar-thumb-purple-600">
                            {(nftData?.nfts || []).map((nft, index) => {
                              const nftId = nft.id || nft.mint || nft.assetId;
                              const isSelected = selectedNfts.has(nftId);
                              
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
                                  data-testid={`nft-card-${nftId}`}
                                >
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <h4 className="font-medium text-white truncate">
                                        {nft.name || 'Unknown NFT'}
                                      </h4>
                                      {isSelected && (
                                        <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                                          <Check className="w-3 h-3 text-white" />
                                        </div>
                                      )}
                                    </div>
                                    <div className="text-sm text-gray-300">
                                      <div className="mb-1">
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                                          nft.type === 'core' ? 'bg-blue-600/30 text-blue-300' :
                                          nft.type === 'pnft' ? 'bg-purple-600/30 text-purple-300' :
                                          nft.type === 'standard' ? 'bg-green-600/30 text-green-300' :
                                          'bg-gray-600/30 text-gray-300'
                                        }`}>
                                          {nft.type === 'core' ? 'Core NFT' :
                                           nft.type === 'pnft' ? 'Programmable' :
                                           nft.type === 'standard' ? 'Standard' :
                                           'Unknown'}
                                        </span>
                                      </div>
                                      <div className="truncate">ID: {nftId}</div>
                                      <div>Rent: ~{nft.estimatedRent || '0.002'} SOL</div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {selectedNfts.size > 0 && (
                            <div className="space-y-4 pt-4 border-t border-purple-500/30">
                              <div className="bg-slate-700/30 rounded-lg p-4">
                                <h4 className="text-white font-medium mb-2">🚀 Batch Burning Preview</h4>
                                <div className="text-sm text-gray-300 space-y-1">
                                  <div>✨ Selected NFTs: {selectedNfts.size}</div>
                                  <div>⚡ Estimated Signatures Required: {
                                    (() => {
                                      const selectedNftsList = (nftData?.nfts || []).filter(nft => selectedNfts.has(nft.id || nft.mint || nft.assetId));
                                      const typeGroups = selectedNftsList.reduce((acc, nft) => {
                                        const type = nft.type || 'unknown';
                                        acc[type] = (acc[type] || 0) + 1;
                                        return acc;
                                      }, {} as Record<string, number>);
                                      
                                      let signatures = 0;
                                      if (typeGroups.core) signatures += 1; // Core NFTs batch together
                                      if (typeGroups.standard) signatures += 1; // Standard NFTs batch together  
                                      if (typeGroups.pnft) signatures += 1; // Programmable NFTs batch together
                                      if (typeGroups.cnft) signatures += typeGroups.cnft; // cNFTs require individual signatures
                                      
                                      return signatures;
                                    })()
                                  }</div>
                                  <div className="text-xs text-purple-300">
                                    💡 Same NFT types burn together in one transaction!
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                <div className="text-sm text-gray-300">
                                  Ready for batch burning: {selectedNfts.size} NFTs
                                </div>
                                <Button
                                  onClick={() => {
                                    const selectedNftsList = (nftData?.nfts || []).filter(nft => selectedNfts.has(nft.id || nft.mint || nft.assetId));
                                    burnNftsMutation.mutate(selectedNftsList);
                                  }}
                                  disabled={burnNftsMutation.isPending}
                                  className="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white"
                                  data-testid="button-burn-selected-nfts"
                                >
                                  {burnNftsMutation.isPending ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Batch Burning...
                                    </>
                                  ) : (
                                    <>
                                      <Flame className="mr-2 h-4 w-4" />
                                      Batch Burn Selected NFTs
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Statistics Tab */}
          {activeTab === 'stats' && (
            <Card className="bg-gradient-to-br from-slate-800/50 to-purple-800/30 backdrop-blur-sm border-purple-500/30">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <BarChart3 className="mr-2 h-5 w-5" />
                  Platform Statistics
                </CardTitle>
                <CardDescription className="text-gray-300">
                  Track recovery progress and platform activity
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-slate-700/30 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-green-400">
                      {stats?.totalUsers || 0}
                    </div>
                    <div className="text-sm text-gray-300">Total Users</div>
                  </div>
                  <div className="bg-slate-700/30 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-yellow-400">
                      {stats?.totalSolRecovered || '0.0000'} SOL
                    </div>
                    <div className="text-sm text-gray-300">SOL Recovered</div>
                  </div>
                  <div className="bg-slate-700/30 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-blue-400">
                      {stats?.totalTransactions || 0}
                    </div>
                    <div className="text-sm text-gray-300">Transactions</div>
                  </div>
                  <div className="bg-slate-700/30 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-purple-400">
                      {stats?.totalNftsBurned || 0}
                    </div>
                    <div className="text-sm text-gray-300">NFTs Burned</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
