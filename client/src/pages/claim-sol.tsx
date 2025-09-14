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
import { Coins, Wallet, Search, CheckCircle, ExternalLink, AlertTriangle, RefreshCw, Flame, Image, Trash2, ArrowLeftRight, ArrowUpDown, Copy, Share2, Users, TrendingUp, DollarSign, Globe } from "lucide-react";
import { Connection, VersionedTransaction } from '@solana/web3.js';
import { useWalletAdapter } from '@/hooks/useWalletAdapter';
import logoImage from '@assets/Transparent-09-removebg-preview_1757875608899.png';

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
  const [activeTab, setActiveTab] = useState<'referrals' | 'reclaim' | 'burnTokens'>('reclaim');
  const [selectedTokenMint, setSelectedTokenMint] = useState<string>('So11111111111111111111111111111111111111112'); // Default to SOL
  const [tokenList, setTokenList] = useState<any[]>([]);
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
                  className="h-48 w-auto"
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

          {/* Description */}
          <div className="text-center space-y-4 py-4">
            <p className="text-white max-w-2xl mx-auto text-2xl font-semibold">
{activeTab === 'referrals' ? 'Earn 35% commission from your referrals — just by helping others!' : activeTab === 'burnTokens' ? 'Burn Unwanted Tokens.' : 'Get your SOL back!'}
            </p>
          </div>


          {/* Scan Wallet Section */}
          {isConnected && activeTab !== 'referrals' && (
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
