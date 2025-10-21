import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Zap, CheckCircle, AlertTriangle, Info, Shield, ExternalLink, Clock, Coins } from "lucide-react";
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, Transaction, VersionedTransaction } from '@solana/web3.js';
import { v4 as uuidv4 } from 'uuid';
import bs58 from 'bs58';

interface AutoClaimPermit {
  id: string;
  walletAddress: string;
  permitSignature: string;
  permitMessage: string;
  permitNonce: string;
  status: string;
  version: number;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  scopes: string;
}

interface RelayerJob {
  id: string;
  walletAddress: string;
  jobType: string;
  status: string;
  itemsCount: number;
  estimatedNet: string | null;
  txSignature: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export function AutoClaimSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { publicKey, signMessage, sendTransaction, connected } = useWallet();
  const [isProcessing, setIsProcessing] = useState(false);

  const walletAddress = publicKey?.toBase58();

  // Query permit status
  const { data: permitStatus } = useQuery<{ permit: AutoClaimPermit | null }>({
    queryKey: ['/api/auto-claim/permit/status', walletAddress],
    enabled: !!walletAddress,
  });

  // Query job history
  const { data: jobHistory } = useQuery<{ jobs: RelayerJob[] }>({
    queryKey: ['/api/auto-claim/jobs', walletAddress],
    enabled: !!walletAddress,
  });

  const hasActivePermit = permitStatus?.permit?.status === 'active';

  // Enable Auto-Claim mutation (combines permit + delegation)
  const enableAutoClaimMutation = useMutation({
    mutationFn: async () => {
      if (!publicKey || !signMessage || !sendTransaction) {
        throw new Error("Wallet not connected");
      }

      setIsProcessing(true);

      try {
        console.log('🔵 Step 1/2: Signing permit message...');
        // Step 1: Create and sign permit message
        const nonce = uuidv4();
        const message = {
          type: "AUTO_CLAIM_PERMIT",
          wallet: publicKey.toBase58(),
          action: "claim_empty_accounts",
          nonce,
          version: 1,
          created_at: Math.floor(Date.now() / 1000),
          domain: "getyoursolback.app",
          statement: "I authorize this application to automatically claim SOL from my empty token accounts."
        };

        const messageString = JSON.stringify(message);
        const messageBytes = new TextEncoder().encode(messageString);
        
        const signature = await signMessage(messageBytes);
        const signatureBase58 = bs58.encode(signature);
        console.log('✅ Permit signed!');

        // Send permit to backend
        await apiRequest('POST', '/api/auto-claim/permit/create', {
          walletAddress: publicKey.toBase58(),
          permitSignature: signatureBase58,
          permitMessage: messageString,
          permitNonce: nonce,
          scopes: "claim_empty_accounts"
        });
        console.log('✅ Permit saved!');

        console.log('🔵 Step 2/2: Preparing delegation transactions...');
        // Step 2: Delegate authority (relayer pays fees!)
        const delegateResponse: any = await apiRequest('POST', '/api/auto-claim/delegate-authority', {
          walletAddress: publicKey.toBase58()
        });

        if (delegateResponse.transactions && delegateResponse.transactions.length > 0) {
          console.log(`📝 Got ${delegateResponse.transactions.length} delegation transaction(s) to sign`);
          
          // Create connection
          const rpcEndpoint = import.meta.env.VITE_HELIUS_API_KEY 
            ? `https://mainnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY}`
            : 'https://api.mainnet-beta.solana.com';
          const connection = new Connection(rpcEndpoint, 'confirmed');

          // Sign and send all delegation transactions
          const signatures = [];
          for (let i = 0; i < delegateResponse.transactions.length; i++) {
            const txBase64 = delegateResponse.transactions[i];
            console.log(`🔵 Signing delegation transaction ${i + 1}/${delegateResponse.transactions.length}...`);
            
            const txBuffer = Buffer.from(txBase64, 'base64');
            const transaction = Transaction.from(txBuffer);

            // Send transaction (relayer already signed as fee payer!)
            const sig = await sendTransaction(transaction, connection, {
              skipPreflight: false,
              preflightCommitment: 'confirmed'
            });
            signatures.push(sig);
            console.log(`✅ Delegation transaction sent: ${sig}`);
          }
          
          delegateResponse.signatures = signatures;
        } else {
          console.log('⚠️ No accounts need delegation (already delegated or no empty accounts)');
        }

        return delegateResponse;
      } finally {
        setIsProcessing(false);
      }
    },
    onSuccess: (data) => {
      const accountsCount = data?.accountsCount || 0;
      toast({
        title: "✅ Auto-Claim Enabled!",
        description: accountsCount > 0
          ? `Signed 2 transactions: Permit + ${accountsCount} account delegation(s). Auto-claim starting now!`
          : "Permit signed! No empty accounts found yet. Auto-claim will monitor your wallet.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/auto-claim/permit/status', walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['/api/auto-claim/jobs', walletAddress] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to Enable Auto-Claim",
        description: error.message || "Please try again",
      });
    },
  });

  // Revoke Auto-Claim mutation
  const revokeAutoClaimMutation = useMutation({
    mutationFn: async () => {
      if (!publicKey || !signMessage) {
        throw new Error("Wallet not connected");
      }

      setIsProcessing(true);

      try {
        // Create revoke message
        const nonce = uuidv4();
        const message = {
          type: "AUTO_CLAIM_REVOKE",
          wallet: publicKey.toBase58(),
          action: "REVOKE_AUTO_CLAIM",
          nonce,
          timestamp: Math.floor(Date.now() / 1000),
          version: 1,
          domain: "getyoursolback.app"
        };

        const messageString = JSON.stringify(message);
        const messageBytes = new TextEncoder().encode(messageString);
        
        // Sign the message
        const signature = await signMessage(messageBytes);
        const signatureBase58 = bs58.encode(signature);

        // Send to backend
        const response = await apiRequest('POST', '/api/auto-claim/permit/revoke', {
          walletAddress: publicKey.toBase58(),
          revokeSignature: signatureBase58,
          revokeMessage: messageString
        });

        return response;
      } finally {
        setIsProcessing(false);
      }
    },
    onSuccess: () => {
      toast({
        title: "Auto-Claim Disabled",
        description: "Your permit has been revoked successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/auto-claim/permit/status', walletAddress] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to Revoke Auto-Claim",
        description: error.message || "Please try again",
      });
    },
  });

  // Delegate Authority mutation (backup - not used in main flow)
  const delegateAuthorityMutation = useMutation({
    mutationFn: async () => {
      if (!publicKey || !sendTransaction) {
        throw new Error("Wallet not connected");
      }

      setIsProcessing(true);

      try {
        console.log('🔵 Requesting delegation transactions...');
        // Get delegation transactions from backend - DIRECT fetch to debug
        const rawResponse = await fetch('/api/auto-claim/delegate-authority', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: publicKey.toBase58() })
        });
        
        const response = await rawResponse.json();
        console.log('🔵 Raw response:', rawResponse.status, rawResponse.statusText);
        console.log('🔵 Backend response:', response);

        if (!response.transactions || response.transactions.length === 0) {
          throw new Error("No accounts need delegation. Already delegated or no empty accounts found.");
        }

        console.log(`🔵 Got ${response.transactions.length} transaction(s) to send`);

        // Create connection
        const rpcEndpoint = import.meta.env.VITE_HELIUS_API_KEY 
          ? `https://mainnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY}`
          : 'https://api.mainnet-beta.solana.com';
        const connection = new Connection(rpcEndpoint, 'confirmed');

        console.log('🔵 Sending transactions...');

        // Sign and send all transactions
        const signatures = [];
        for (let i = 0; i < response.transactions.length; i++) {
          const txBase64 = response.transactions[i];
          console.log(`🔵 Processing transaction ${i + 1}/${response.transactions.length}`);
          
          // Deserialize transaction
          const txBuffer = Buffer.from(txBase64, 'base64');
          const transaction = Transaction.from(txBuffer);

          console.log('🔵 Sending transaction to wallet...');
          // Send transaction (don't wait for confirmation - scanner will detect it)
          const signature = await sendTransaction(transaction, connection, {
            skipPreflight: false,
            preflightCommitment: 'confirmed'
          });
          console.log(`✅ Transaction sent! Signature: ${signature}`);
          signatures.push(signature);
          
          // Don't wait for confirmation - scanner detects delegated accounts automatically
        }

        console.log(`🎉 All ${signatures.length} transactions completed!`);
        return { ...response, signatures };
      } catch (error: any) {
        console.error('❌ Delegation error:', error);
        throw error;
      } finally {
        setIsProcessing(false);
      }
    },
    onSuccess: (data: any) => {
      toast({
        title: "Authority Delegated!",
        description: `Delegated ${data.accountsCount} account(s). Auto-claim will start automatically.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/auto-claim/jobs', walletAddress] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to Delegate Authority",
        description: error.message || "Please try again",
      });
    },
  });

  if (!connected || !walletAddress) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Alert className="bg-purple-900/40 border-purple-500/30">
          <Info className="h-4 w-4 text-purple-400" />
          <AlertDescription className="text-purple-100">
            Please connect your wallet to enable Auto-Claim functionality.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Status Card */}
      <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Zap className="h-6 w-6 text-purple-400" />
              Auto-Claim Status
            </h3>
            <p className="text-purple-200 mt-2 text-sm">
              Sign once to authorize automatic SOL reclamation from empty SPL and Token-2022 accounts
            </p>
          </div>
          <Badge 
            variant={hasActivePermit ? "default" : "secondary"}
            className={`text-sm px-4 py-2 ${
              hasActivePermit 
                ? 'bg-green-600/80 text-white' 
                : 'bg-purple-700/50 text-purple-200'
            }`}
            data-testid="badge-auto-claim-status"
          >
            {hasActivePermit ? (
              <span className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Active
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Inactive
              </span>
            )}
          </Badge>
        </div>

        {/* How it Works */}
        <Alert className="bg-purple-900/40 border-purple-500/30 mb-6">
          <Shield className="h-4 w-4 text-purple-400" />
          <AlertDescription className="text-purple-100">
            <strong>100% Non-Custodial:</strong> You sign a permit message (not a transaction). 
            Your private keys never leave your wallet. We monitor for empty accounts and claim them automatically. 
            You get 85%, platform gets 15%. Works for BOTH SPL tokens AND Token-2022.
          </AlertDescription>
        </Alert>

        {/* Action Buttons */}
        <div className="flex flex-col gap-4">
          {!hasActivePermit ? (
            <div className="flex justify-center">
              <Button
                onClick={() => enableAutoClaimMutation.mutate()}
                disabled={isProcessing || enableAutoClaimMutation.isPending}
                className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white px-8 py-6 text-lg"
                data-testid="button-enable-auto-claim"
              >
                {isProcessing || enableAutoClaimMutation.isPending ? (
                  <>
                    <Clock className="h-5 w-5 mr-2 animate-spin" />
                    Setting Up Auto-Claim...
                  </>
                ) : (
                  <>
                    <Zap className="h-5 w-5 mr-2" />
                    Enable & Delegate Accounts (1-Click!)
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="flex justify-center gap-4">
              <Button
                onClick={() => delegateAuthorityMutation.mutate()}
                disabled={isProcessing || delegateAuthorityMutation.isPending}
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-8 py-6 text-lg"
                data-testid="button-delegate-now"
              >
                {isProcessing || delegateAuthorityMutation.isPending ? (
                  <>
                    <Clock className="h-5 w-5 mr-2 animate-spin" />
                    Delegating...
                  </>
                ) : (
                  <>
                    <Shield className="h-5 w-5 mr-2" />
                    Delegate Empty Accounts (FREE!)
                  </>
                )}
              </Button>
              
              <Button
                onClick={() => revokeAutoClaimMutation.mutate()}
                disabled={isProcessing || revokeAutoClaimMutation.isPending}
                variant="destructive"
                className="px-8 py-6 text-lg"
                data-testid="button-revoke-auto-claim"
              >
                {isProcessing || revokeAutoClaimMutation.isPending ? (
                  <>
                    <Clock className="h-5 w-5 mr-2 animate-spin" />
                    Revoking...
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-5 w-5 mr-2" />
                    Disable
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Permit Details */}
        {hasActivePermit && permitStatus?.permit && (
          <div className="mt-6 p-4 bg-purple-800/20 rounded-lg border border-purple-500/20">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-purple-300 mb-1">Enabled Since</p>
                <p className="text-white font-medium">
                  {new Date(permitStatus.permit.createdAt).toLocaleDateString()}
                </p>
              </div>
              {permitStatus.permit.lastUsedAt && (
                <div>
                  <p className="text-purple-300 mb-1">Last Auto-Claim</p>
                  <p className="text-white font-medium">
                    {new Date(permitStatus.permit.lastUsedAt).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Features List */}
      <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">How Auto-Claim Works</h3>
        <div className="grid gap-3">
          <div className="flex items-start gap-3 bg-purple-800/20 rounded-lg border border-purple-500/20 p-4">
            <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-white font-medium">Sign Once, Claim Forever</h4>
              <p className="text-sm text-purple-200">
                Sign a permit message (no transaction fees) to authorize automatic claims
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-purple-800/20 rounded-lg border border-purple-500/20 p-4">
            <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-white font-medium">24/7 Monitoring</h4>
              <p className="text-sm text-purple-200">
                Our relayer monitors your wallet for empty SPL and Token-2022 accounts while you're offline
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-purple-800/20 rounded-lg border border-purple-500/20 p-4">
            <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-white font-medium">Zero Network Fees</h4>
              <p className="text-sm text-purple-200">
                We pay all network fees upfront and recover from the 15% platform fee
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-purple-800/20 rounded-lg border border-purple-500/20 p-4">
            <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-white font-medium">You Get 85%</h4>
              <p className="text-sm text-purple-200">
                Keep 85% of all recovered SOL. Platform takes 15% to cover fees and operations
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Job History */}
      {jobHistory && jobHistory.jobs.length > 0 && (
        <div className="bg-gradient-to-br from-purple-900/40 to-purple-950/60 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
          <h3 className="text-xl font-bold text-white mb-6">Auto-Claim History</h3>
          
          <div className="space-y-3">
            {jobHistory.jobs.map((job) => (
              <div 
                key={job.id} 
                className="bg-purple-800/20 rounded-lg border border-purple-500/20 p-4"
                data-testid={`job-history-${job.id}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Badge 
                    variant={job.status === 'completed' ? 'default' : 'secondary'}
                    className={`${
                      job.status === 'completed' ? 'bg-green-600/80' : 
                      job.status === 'processing' ? 'bg-blue-600/80' : 
                      job.status === 'failed' ? 'bg-red-600/80' : 
                      'bg-gray-600/80'
                    }`}
                  >
                    {job.status.toUpperCase()}
                  </Badge>
                  <span className="text-sm text-purple-300">
                    {new Date(job.createdAt).toLocaleString()}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm mt-3">
                  <div>
                    <p className="text-purple-300">Accounts Processed</p>
                    <p className="text-white font-medium">{job.itemsCount}</p>
                  </div>
                  {job.estimatedNet && (
                    <div>
                      <p className="text-purple-300">Estimated Recovery</p>
                      <p className="text-white font-medium flex items-center gap-1">
                        <Coins className="h-4 w-4" />
                        {parseFloat(job.estimatedNet).toFixed(6)} SOL
                      </p>
                    </div>
                  )}
                </div>

                {job.txSignature && (
                  <div className="mt-3">
                    <a
                      href={`https://solscan.io/tx/${job.txSignature}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-400 hover:text-purple-300 text-sm flex items-center gap-1"
                    >
                      View Transaction <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}

                {job.errorMessage && (
                  <div className="mt-3 text-sm text-red-400">
                    Error: {job.errorMessage}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Jobs Yet */}
      {hasActivePermit && (!jobHistory || jobHistory.jobs.length === 0) && (
        <div className="bg-gradient-to-br from-purple-900/40 to-purple-950/60 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
          <div className="text-center text-purple-300 py-8">
            <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <div className="mb-2 text-lg">Monitoring Your Wallet</div>
            <p className="text-sm text-purple-400">
              We'll automatically claim SOL when empty SPL or Token-2022 accounts are detected
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
