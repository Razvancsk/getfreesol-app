import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Code, ArrowLeft, Copy, Check, Info, ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from 'wouter';
import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import logoImage from '@assets/image_1757882056840.png';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2 } from 'lucide-react';
import bs58 from 'bs58';

export default function ApiDocs() {
  const { publicKey, signMessage } = useWallet();
  const { toast } = useToast();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feeWallet, setFeeWallet] = useState('');
  const [feePercentage, setFeePercentage] = useState('10');
  const [manuallyEditedWallet, setManuallyEditedWallet] = useState(false);
  const [manuallyEditedFee, setManuallyEditedFee] = useState(false);
  
  // Account creation form state
  const [projectName, setProjectName] = useState('');
  
  const walletAddress = publicKey?.toBase58();

  // Fetch referral account (PDA-based)
  const { data: accountData, refetch: refetchAccount } = useQuery<any>({
    queryKey: ["/api/referral/account", walletAddress],
    enabled: !!walletAddress,
    retry: false,
    refetchInterval: 10000, // Auto-refresh every 10 seconds
    refetchOnMount: true, // Refresh when component mounts
    refetchOnWindowFocus: true, // Refresh when window gains focus
  });

  const referralAccount = accountData?.account;
  const developer = referralAccount; // Alias for backward compatibility

  // Auto-populate from referral account (unless manually edited)
  useEffect(() => {
    if (referralAccount?.referralPda && !manuallyEditedWallet) {
      setFeeWallet(referralAccount.referralPda);
    }
    if (referralAccount?.feePercentage !== undefined && !manuallyEditedFee) {
      setFeePercentage(referralAccount.feePercentage.toString());
    }
  }, [referralAccount, manuallyEditedWallet, manuallyEditedFee]);

  // Create account mutation
  const createAccount = useMutation({
    mutationFn: async () => {
      if (!publicKey || !signMessage || !projectName.trim()) {
        throw new Error("Missing wallet or project name");
      }

      const message = `Create developer fee account for project: ${projectName}`;
      const encodedMessage = new TextEncoder().encode(message);
      const signature = await signMessage(encodedMessage);

      return await apiRequest('POST', '/api/referral/create-account', {
        walletAddress: publicKey.toBase58(),
        signature: bs58.encode(signature),
        message,
        projectName: projectName.trim(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/referral/account", walletAddress] });
      toast({
        title: "Success!",
        description: `Referral account created for "${projectName.trim()}". You can now access the API documentation.`,
      });
      setProjectName("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle setting fee for documentation preview
  const handleSetFee = () => {
    if (feePercentage && parseFloat(feePercentage) > 0) {
      setManuallyEditedFee(true);
      toast({
        title: "Documentation Updated",
        description: `Examples now show ${feePercentage}% fee.`,
      });
    }
  };

  // Claim mutation
  const claimMutation = useMutation({
    mutationFn: async () => {
      if (!walletAddress) {
        throw new Error("Wallet not connected");
      }
      
      return await apiRequest('POST', '/api/referral/claim', {
        walletAddress
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/referral/account", walletAddress] });
      toast({
        title: "Claim Successful! 🎉",
        description: (
          <div className="space-y-1">
            <p>Amount: {data.amountSol}</p>
            <a 
              href={`https://solscan.io/tx/${data.signature}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:underline flex items-center gap-1"
            >
              View on Solscan <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ),
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Claim Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle claim button click
  const handleClaim = () => {
    claimMutation.mutate();
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const baseUrl = window.location.origin;
  
  // Calculate fee splits
  const developerFee = parseFloat(feePercentage) || 0;
  const developerReceives = (developerFee * 0.8).toFixed(2);
  const platformReceives = (developerFee * 0.2).toFixed(2);

  // Check if referral account exists
  const hasAccount = accountData?.success && accountData?.account;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button
                variant="ghost"
                size="icon"
                className="text-purple-300 hover:text-white hover:bg-purple-700/50"
                data-testid="button-back-home"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <img 
              src={logoImage}
              alt="Get Free SOL"
              className="h-16 w-16"
            />
          </div>
          <WalletMultiButton />
        </div>

        {/* Connect wallet prompt - shown if wallet not connected */}
        {!publicKey && (
          <div className="max-w-md mx-auto mb-8 p-6 bg-gradient-to-r from-purple-900/50 to-blue-900/50 border border-purple-500/50 rounded-xl text-center">
            <h3 className="text-white text-xl font-bold mb-3">🔐 Connect Your Wallet</h3>
            <p className="text-purple-200 mb-4">
              Connect your wallet to create a Developer API account and start earning fees from your integrations.
            </p>
            <WalletMultiButton />
          </div>
        )}

        {/* Developer account section - only shown if wallet connected but no account */}
        {publicKey && !hasAccount && (
          <div className="max-w-md mx-auto mb-8 p-4 bg-blue-900/30 border border-blue-500/30 rounded-lg">
            <div className="space-y-4">
              <h3 className="text-white text-lg font-semibold">Create Developer Account</h3>
              <p className="text-sm text-purple-200">Create an account to earn fees from API integrations</p>
            </div>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="project-name" className="text-white">Project Name</Label>
                <Input
                  id="project-name"
                  data-testid="input-project-name-docs"
                  placeholder="E.g: Birdeye, Meteora, Solend"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  maxLength={50}
                  className="bg-slate-900/50 border-purple-400/30 text-white placeholder:text-purple-300/50"
                />
              </div>
              <Button
                data-testid="button-create-account-docs"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => createAccount.mutate()}
                disabled={!projectName.trim() || createAccount.isPending}
              >
                {createAccount.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Account"
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Documentation content - always visible */}
        <div className="space-y-6">
            {/* Introduction */}
            <div className="space-y-4">
              <div className="space-y-2">
                <h2 className="text-white text-2xl font-semibold">🚀 Getting Started</h2>
                <p className="text-purple-200">
                  Integrate SOL rent recovery and token burning directly into your application
                </p>
              </div>
              <div className="text-purple-100 space-y-4">
                <div className="bg-blue-900/30 p-4 rounded-lg border border-blue-500/50">
                  <p className="text-blue-100 font-semibold mb-2">🎯 How It Works:</p>
                  <ol className="text-sm text-blue-200 space-y-2 list-decimal list-inside">
                    <li>Build your own UI in your application</li>
                    <li>Call our API endpoints from your backend/frontend</li>
                    <li>Pass your <code className="bg-blue-950/50 px-1 rounded">feeReceiverAddress</code> (your PDA) to collect fees</li>
                    <li>Display results in your app with your branding</li>
                    <li>Earn 80% of fees collected - claim anytime!</li>
                  </ol>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-white mb-1">Base URL:</p>
                    <code className="block bg-purple-900/50 px-2 py-1 rounded text-purple-200 text-xs break-all">{baseUrl}/api</code>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white mb-1">Response Format:</p>
                    <p className="text-sm text-purple-200">All endpoints return JSON with <code className="bg-purple-900/50 px-2 py-1 rounded text-purple-200 text-xs">success</code> field</p>
                  </div>
                </div>
              </div>
            </div>

          {/* Balance Card - Only show for developers */}
          {developer && (
            <div className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-purple-200 mb-1">Your Earnings</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => refetchAccount()}
                        className="h-6 w-6 p-0 text-purple-300 hover:text-white"
                        data-testid="button-refresh-balance"
                      >
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="text-2xl font-bold text-white" data-testid="text-pda-balance">
                      {referralAccount?.pdaBalance?.toFixed(6) || '0.000000'} SOL
                    </p>
                    <p className="text-xs text-purple-200 mt-1">{developer.projectName}</p>
                  </div>
                  <Button
                    onClick={handleClaim}
                    disabled={!referralAccount?.pdaBalance || referralAccount.pdaBalance === 0 || claimMutation.isPending}
                    className="bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50"
                    data-testid="button-claim-earnings"
                  >
                    {claimMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Claiming...
                      </>
                    ) : (
                      'Claim'
                    )}
                  </Button>
                </div>
            </div>
          )}

          {/* Configuration */}
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-white text-2xl font-semibold">⚙️ Configure Your Integration</h2>
              <p className="text-purple-100">
                {developer ? (
                  <span className="flex items-center gap-2">
                    ✅ Auto-populated from your developer account: <strong>{developer.projectName}</strong>
                  </span>
                ) : (
                  "Set your wallet address and fee percentage to see customized examples"
                )}
              </p>
            </div>
            <div className="space-y-6">
              {!developer && walletAddress && (
                <div className="p-3 bg-blue-500/20 border border-blue-400/30 rounded-lg space-y-2">
                  <p className="text-sm text-blue-100 font-semibold">No Developer Account</p>
                  <p className="text-xs text-blue-200">
                    Create a developer account to automatically manage your fee collection settings and earn from integrations.
                  </p>
                  <Link href="/developer">
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 bg-blue-500/10 border-blue-400/50 text-blue-100 hover:bg-blue-500/20"
                      data-testid="link-create-account"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Create Developer Account
                    </Button>
                  </Link>
                </div>
              )}

              {/* Fee Receiver Wallet */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="fee-wallet" className="text-white font-semibold">
                    Referral PDA (Program Derived Address)
                  </Label>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-purple-300" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Use this PDA address in your integration to collect referral fees</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                {developer ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 p-2 bg-gray-100 dark:bg-gray-200 rounded text-sm font-mono break-all text-gray-800">
                      {feeWallet}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(feeWallet, 'pda-address')}
                      className="text-purple-300 hover:text-white hover:bg-purple-700/50 h-9 px-3"
                      data-testid="button-copy-pda"
                    >
                      {copiedId === 'pda-address' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                ) : (
                  <Input
                    id="fee-wallet"
                    type="text"
                    placeholder="Your Solana referral PDA address"
                    value={feeWallet}
                    onChange={(e) => {
                      setFeeWallet(e.target.value);
                      setManuallyEditedWallet(true);
                    }}
                    className="bg-slate-900/50 border-purple-400/30 text-white placeholder:text-purple-300/50 font-mono text-sm"
                    data-testid="input-fee-wallet"
                  />
                )}
              </div>

              {/* Important Note for Developers */}
              {developer && (
                <div className="p-3 bg-yellow-500/20 border border-yellow-400/30 rounded-lg space-y-1">
                  <p className="text-sm text-yellow-100 font-semibold">⚠️ Important: Activate Your PDA</p>
                  <p className="text-xs text-yellow-200">
                    To start receiving fees, you must first deposit at least <strong>0.001 SOL</strong> to your PDA address above. This activates the account on Solana and enables fee collection.
                  </p>
                </div>
              )}

              {/* Fee Percentage */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="fee-percentage" className="text-white font-semibold">
                    Fee to Charge (%)
                  </Label>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-purple-300" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Total fee percentage you'll charge users. Platform takes 20% of this.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex gap-2">
                  <Input
                    id="fee-percentage"
                    type="number"
                    min="0"
                    max="10"
                    step="0.1"
                    placeholder="10"
                    value={feePercentage}
                    onChange={(e) => {
                      setFeePercentage(e.target.value);
                      setManuallyEditedFee(true);
                    }}
                    className="bg-slate-900/50 border-purple-400/30 text-white placeholder:text-purple-300/50"
                    data-testid="input-fee-percentage"
                  />
                  <Button
                    onClick={handleSetFee}
                    disabled={!feePercentage || parseFloat(feePercentage) <= 0}
                    className="bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap"
                    data-testid="button-set-fee"
                  >
                    Set
                  </Button>
                </div>
              </div>

              {/* Fee Breakdown */}
              {feePercentage && parseFloat(feePercentage) > 0 && (
                <div className="bg-slate-900/50 p-4 rounded-lg border border-purple-400/30">
                  <p className="text-purple-300 text-sm mb-3 font-semibold">Fee Breakdown:</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-purple-200">Total fee charged to users:</span>
                      <span className="text-white font-semibold">{feePercentage}%</span>
                    </div>
                    <Separator className="bg-purple-600/30" />
                    <div className="flex justify-between items-center">
                      <span className="text-green-300">You receive:</span>
                      <span className="text-green-400 font-semibold">{developerReceives}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-purple-300">Platform receives:</span>
                      <span className="text-purple-400 font-semibold">{platformReceives}%</span>
                    </div>
                  </div>
                </div>
              )}

              <p className="text-sm text-purple-200 italic">
                💡 The examples below will update based on your settings
              </p>
            </div>
          </div>

          {/* Step 1: Integration Code */}
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-white text-2xl font-semibold">1️⃣ Recovery Function</h2>
              <p className="text-purple-200">
                Copy this function to your project
              </p>
            </div>
            <div className="space-y-4">
              <div className="bg-slate-900/50 p-4 rounded-lg">
                <div className="flex items-center justify-end mb-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(`import { Transaction, PublicKey } from '@solana/web3.js';

export async function recoverSOLRent(
  walletPublicKey: PublicKey, 
  wallet: any,
  feePercentage: number = ${feePercentage || '15'}  // Customize your fee here
) {
  const walletAddress = walletPublicKey.toBase58();
  
  // Step 1: Scan for empty accounts
  const scanResponse = await fetch(\`/api/sol-refund/scan/\${walletAddress}\`);
  const scanData = await scanResponse.json();
  
  if (!scanData.accounts || scanData.emptyAccounts === 0) {
    throw new Error('No empty accounts found');
  }
  
  // Step 2: Prepare transaction
  const prepareResponse = await fetch('/api/sol-refund/prepare-transaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      walletAddress,
      selectedAccounts: scanData.accounts.map((acc: any) => acc.accountAddress),
      feeReceiverAddress: '${referralAccount?.referralPda || 'HH6gU6V6A3ee2V5vaaY1qmEChkpKqUWnR4szNkf39vV3'}',
      feePercentage: feePercentage
    })
  });
  
  const prepareData = await prepareResponse.json();
  
  // Step 3: Decode transaction (browser-safe, no Buffer!)
  const binaryString = atob(prepareData.transaction);
  const transactionBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    transactionBytes[i] = binaryString.charCodeAt(i);
  }
  const transaction = Transaction.from(transactionBytes);
  
  // Step 4: Sign and send
  const signature = await wallet.signAndSendTransaction(transaction);
  
  // Step 5: Record success - Send ALL data to getfreesol.xyz
  await fetch('/api/sol-refund/record-success', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      signature,
      walletAddress,
      selectedAccounts: scanData.accounts.map((acc: any) => acc.accountAddress),
      accountsClosed: scanData.emptyAccounts,
      solRecovered: prepareData.totalSolReclaimed,
      netAmount: prepareData.netAmount,
      feeAmount: prepareData.feeAmount,
      platformFeeAmount: prepareData.platformFeeAmount,
      referralFeeAmount: prepareData.referralFeeAmount
    })
  });
  
  return signature;
}`, 'recovery-function')}
                    className="text-purple-300 hover:text-white"
                  >
                    {copiedId === 'recovery-function' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <pre className="text-green-400 text-xs overflow-x-auto">
{`import { Transaction, PublicKey } from '@solana/web3.js';

export async function recoverSOLRent(
  walletPublicKey: PublicKey, 
  wallet: any,
  feePercentage: number = ${feePercentage || '15'}  // Customize your fee here
) {
  const walletAddress = walletPublicKey.toBase58();
  
  // Step 1: Scan for empty accounts
  const scanResponse = await fetch(\`/api/sol-refund/scan/\${walletAddress}\`);
  const scanData = await scanResponse.json();
  
  if (!scanData.accounts || scanData.emptyAccounts === 0) {
    throw new Error('No empty accounts found');
  }
  
  // Step 2: Prepare transaction
  const prepareResponse = await fetch('/api/sol-refund/prepare-transaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      walletAddress,
      selectedAccounts: scanData.accounts.map((acc: any) => acc.accountAddress),
      feeReceiverAddress: '${referralAccount?.referralPda || 'HH6gU6V6A3ee2V5vaaY1qmEChkpKqUWnR4szNkf39vV3'}',
      feePercentage: feePercentage
    })
  });
  
  const prepareData = await prepareResponse.json();
  
  // Step 3: Decode transaction (browser-safe, no Buffer!)
  const binaryString = atob(prepareData.transaction);
  const transactionBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    transactionBytes[i] = binaryString.charCodeAt(i);
  }
  const transaction = Transaction.from(transactionBytes);
  
  // Step 4: Sign and send
  const signature = await wallet.signAndSendTransaction(transaction);
  
  // Step 5: Record success - Send ALL data to getfreesol.xyz
  await fetch('/api/sol-refund/record-success', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      signature,
      walletAddress,
      selectedAccounts: scanData.accounts.map((acc: any) => acc.accountAddress),
      accountsClosed: scanData.emptyAccounts,
      solRecovered: prepareData.totalSolReclaimed,
      netAmount: prepareData.netAmount,
      feeAmount: prepareData.feeAmount,
      platformFeeAmount: prepareData.platformFeeAmount,
      referralFeeAmount: prepareData.referralFeeAmount
    })
  });
  
  return signature;
}`}
                </pre>
              </div>
            </div>
          </div>

          {/* Step 2: Backend Proxy */}
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-white text-2xl font-semibold">2️⃣ Backend Proxy (Required to avoid CORS errors)</h2>
              <p className="text-purple-200">
                Add these routes to your backend server (Node.js/Express)
              </p>
            </div>
            <div className="space-y-4">
              <div className="bg-slate-900/50 p-4 rounded-lg">
                <div className="flex items-center justify-end mb-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(`app.get("/api/sol-refund/scan/:address", async (req, res) => {
  const response = await fetch(\`${baseUrl}/api/sol-refund/scan/\${req.params.address}\`);
  res.json(await response.json());
});

app.post("/api/sol-refund/prepare-transaction", async (req, res) => {
  const response = await fetch('${baseUrl}/api/sol-refund/prepare-transaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body),
  });
  res.json(await response.json());
});

app.post("/api/sol-refund/record-success", async (req, res) => {
  const response = await fetch('${baseUrl}/api/sol-refund/record-success', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body),
  });
  res.json(await response.json());
});`, 'backend-proxy')}
                    className="text-purple-300 hover:text-white"
                  >
                    {copiedId === 'backend-proxy' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <pre className="text-green-400 text-xs overflow-x-auto">
{`app.get("/api/sol-refund/scan/:address", async (req, res) => {
  const response = await fetch(\`${baseUrl}/api/sol-refund/scan/\${req.params.address}\`);
  res.json(await response.json());
});

app.post("/api/sol-refund/prepare-transaction", async (req, res) => {
  const response = await fetch('${baseUrl}/api/sol-refund/prepare-transaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body),
  });
  res.json(await response.json());
});

app.post("/api/sol-refund/record-success", async (req, res) => {
  const response = await fetch('${baseUrl}/api/sol-refund/record-success', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body),
  });
  res.json(await response.json());
});`}
                </pre>
              </div>
            </div>
          </div>

          {/* Step 3: Usage Example */}
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-white text-2xl font-semibold">3️⃣ Usage Example</h2>
              <p className="text-purple-200">
                How to call the recovery function in your app
              </p>
            </div>
            <div className="space-y-4">
              <div className="bg-slate-900/50 p-4 rounded-lg">
                <div className="flex items-center justify-end mb-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(`import { wallet } from './walletAdapter'; // Your Phantom/Solflare wallet
import { recoverSOLRent } from './recoverSol';

// Connect wallet first
await wallet.connect();

// Default ${feePercentage || '15'}% fee
const signature = await recoverSOLRent(wallet.publicKey, wallet);

// Custom 10% fee
const signature = await recoverSOLRent(wallet.publicKey, wallet, 10);

// Custom 5% fee
const signature = await recoverSOLRent(wallet.publicKey, wallet, 5);

console.log('Success! Transaction:', signature);`, 'usage-example')}
                    className="text-purple-300 hover:text-white"
                  >
                    {copiedId === 'usage-example' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <pre className="text-green-400 text-xs overflow-x-auto">
{`import { wallet } from './walletAdapter'; // Your Phantom/Solflare wallet
import { recoverSOLRent } from './recoverSol';

// Connect wallet first
await wallet.connect();

// Default ${feePercentage || '15'}% fee
const signature = await recoverSOLRent(wallet.publicKey, wallet);

// Custom 10% fee
const signature = await recoverSOLRent(wallet.publicKey, wallet, 10);

// Custom 5% fee
const signature = await recoverSOLRent(wallet.publicKey, wallet, 5);

console.log('Success! Transaction:', signature);`}
                </pre>
              </div>
            </div>
          </div>

          {/* Support */}
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-white text-2xl font-semibold">📞 Support</h2>
            </div>
            <div className="text-purple-200 space-y-2">
              <p>Need help? Join our community:</p>
              <div className="flex gap-3">
                <a
                  href="https://discord.gg/tSBMgYcZaK"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-300 hover:text-white underline"
                >
                  Discord
                </a>
                <a
                  href="https://x.com/getfreesol_xyz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-300 hover:text-white underline"
                >
                  X (Twitter)
                </a>
              </div>
            </div>
          </div>
          </div>
      </div>
    </div>
  );
}
