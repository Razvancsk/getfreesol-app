import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Code, ArrowLeft, Copy, Check, Info, ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from 'wouter';
import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
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
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-2">
                <Code className="h-8 w-8" />
                API Documentation
              </h1>
              <p className="text-purple-200">Build apps that recover SOL rent and burn tokens</p>
            </div>
          </div>
        </div>

        {/* Show account creation form if no account exists */}
        {!publicKey ? (
          <Card className="bg-purple-800/50 border-purple-600 backdrop-blur max-w-2xl mx-auto mt-12">
            <CardHeader>
              <CardTitle className="text-white text-center">Connect Wallet to Continue</CardTitle>
              <CardDescription className="text-purple-200 text-center">
                Connect your wallet to create a developer account and access API documentation
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center text-purple-100">
              <p>Please connect your Solana wallet using the button in the top right corner to get started.</p>
            </CardContent>
          </Card>
        ) : !hasAccount ? (
          <Card className="bg-black/50 border-purple-500 backdrop-blur max-w-md mx-auto mt-12">
            <CardHeader>
              <CardTitle className="text-white text-2xl">Create Ultra Referral Account</CardTitle>
              <CardDescription className="text-purple-200">
                Sign to create your fee collection account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                <p className="text-xs text-purple-300">
                  A unique fee collection account will be created for your wallet
                </p>
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
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Introduction */}
            <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-white">🚀 Getting Started</CardTitle>
                <CardDescription className="text-purple-200">
                  Integrate SOL rent recovery and token burning directly into your application
                </CardDescription>
              </CardHeader>
              <CardContent className="text-purple-100 space-y-4">
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
                
                <div className="space-y-2">
                  <p className="text-sm"><strong>Base URL:</strong> <code className="bg-purple-900/50 px-2 py-1 rounded text-purple-200">{baseUrl}/api</code></p>
                  <p className="text-sm"><strong>Response Format:</strong> All endpoints return JSON with <code className="bg-purple-900/50 px-2 py-1 rounded text-purple-200">success</code> field</p>
                  <p className="text-sm"><strong>Your PDA:</strong> <code className="bg-purple-900/50 px-2 py-1 rounded text-purple-200">{referralAccount?.referralPda || 'Create account to see your PDA'}</code></p>
                </div>
              </CardContent>
            </Card>

          {/* Balance Card - Only show for developers */}
          {developer && (
            <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
              <CardContent className="pt-6">
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
              </CardContent>
            </Card>
          )}

          {/* Configuration */}
          <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white">⚙️ Configure Your Integration</CardTitle>
              <CardDescription className="text-purple-100">
                {developer ? (
                  <span className="flex items-center gap-2">
                    ✅ Auto-populated from your developer account: <strong>{developer.projectName}</strong>
                  </span>
                ) : (
                  "Set your wallet address and fee percentage to see customized examples"
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
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
                  <div className="p-2 bg-gray-100 dark:bg-gray-200 rounded text-sm font-mono break-all text-gray-800">
                    {feeWallet}
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
            </CardContent>
          </Card>

          {/* CORS Warning */}
          <Card className="bg-orange-900/50 border-orange-600 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white">⚠️ Important: CORS & Backend Proxy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-orange-200 text-sm">
                <strong>Browser Security:</strong> Direct API calls from your frontend to <code className="bg-slate-900/50 px-1 py-0.5 rounded">getfreesol.xyz</code> will be blocked by CORS (Cross-Origin Resource Sharing) browser security.
              </p>
              <p className="text-orange-200 text-sm">
                <strong>Solution:</strong> Create backend proxy routes in your server that forward requests to our API. This is a standard practice for production apps.
              </p>
              <div className="bg-slate-900/50 p-4 rounded-lg">
                <p className="text-purple-300 text-sm font-semibold mb-2">Example Backend Proxy (Express.js)</p>
                <pre className="text-green-400 text-xs overflow-x-auto">
{`// In your backend (server.js / api/routes.js)
app.get('/api/proxy/scan/:address', async (req, res) => {
  try {
    const response = await fetch(
      \`${baseUrl}/api/sol-refund/scan/\${req.params.address}\`
    );
    const data = await response.json();
    
    // Forward upstream status code
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/proxy/prepare', async (req, res) => {
  try {
    const response = await fetch('${baseUrl}/api/sol-refund/prepare-transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    
    // Forward upstream status code
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/proxy/record', async (req, res) => {
  try {
    const response = await fetch('${baseUrl}/api/sol-refund/record-success', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    
    // Forward upstream status code
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});`}
                </pre>
              </div>
              <p className="text-orange-200 text-sm">
                💡 The examples below assume you've set up these proxy routes. Replace <code className="bg-slate-900/50 px-1 py-0.5 rounded">/api/proxy/*</code> with your actual backend endpoints.
              </p>
            </CardContent>
          </Card>

          {/* Complete Implementation Files */}
          <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white">📁 Complete Implementation Files</CardTitle>
              <CardDescription className="text-purple-200">
                Copy-paste ready files for your full-stack integration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              {/* File 1: Recovery Logic */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-purple-300 text-sm font-semibold">1️⃣ Frontend - Recovery Logic</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(`import { Transaction, PublicKey } from '@solana/web3.js';

export async function recoverSOLRent(walletPublicKey: PublicKey, wallet: any) {
  try {
    const walletAddress = walletPublicKey.toBase58();
    
    // STEP 1: Scan for empty token accounts
    const scanResponse = await fetch(
      \`/api/sol-refund/scan/\${walletAddress}\`
    );
    
    if (!scanResponse.ok) {
      const errorData = await scanResponse.json();
      throw new Error(errorData.error || 'Failed to scan wallet');
    }
    
    const scanData = await scanResponse.json();
    
    if (!scanData.accounts || scanData.emptyAccounts === 0) {
      throw new Error('No empty accounts found to close');
    }
    
    // STEP 2: Prepare transaction
    const prepareResponse = await fetch('/api/sol-refund/prepare-transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress,
        selectedAccounts: scanData.accounts.map((acc: any) => acc.accountAddress),
        donationPercentage: ${feePercentage || '10'},
        feeReceiverAddress: '${referralAccount?.referralPda || 'YOUR_PDA_ADDRESS'}'
      })
    });
    
    if (!prepareResponse.ok) {
      const errorData = await prepareResponse.json();
      throw new Error(errorData.error || 'Failed to prepare transaction');
    }
    
    const prepareData = await prepareResponse.json();
    
    if (!prepareData.transaction) {
      throw new Error(prepareData.error || 'Failed to prepare transaction');
    }
    
    // STEP 3: Deserialize transaction from base64
    const binaryString = atob(prepareData.transaction);
    const transactionBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      transactionBytes[i] = binaryString.charCodeAt(i);
    }
    const transaction = Transaction.from(transactionBytes);
    
    // STEP 4 & 5: Wallet signs and sends
    const signature = await wallet.signAndSendTransaction(transaction);
    
    // STEP 6: Record success (CRITICAL - updates platform stats)
    const recordResponse = await fetch('/api/sol-refund/record-success', {
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
    
    if (!recordResponse.ok) {
      const errorData = await recordResponse.json();
      throw new Error(
        \`Transaction succeeded (signature: \${signature}) but failed to record stats: \${errorData.error || 'Unknown error'}. Please contact support to manually record this transaction.\`
      );
    }
    
    return signature;
  } catch (error: any) {
    throw error;
  }
}`, 'recovery-logic')}
                    className="text-purple-300 hover:text-white"
                  >
                    {copiedId === 'recovery-logic' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-purple-300/70">File: <code>client/src/lib/recoverSol.ts</code></p>
              </div>

              {/* File 2: Wallet Adapter */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-purple-300 text-sm font-semibold">2️⃣ Frontend - Wallet Adapter</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(`import { PublicKey, Transaction } from '@solana/web3.js';

class SolanaWallet {
  publicKey: PublicKey | null = null;
  connected: boolean = false;
  private solana: any = null;
  
  constructor() {
    if (typeof window !== 'undefined') {
      this.solana = (window as any).solana || (window as any).phantom?.solana;
    }
  }
  
  async connect(): Promise<string> {
    if (!this.solana) {
      throw new Error('Please install Phantom, Solflare, or another Solana wallet.');
    }
    const response = await this.solana.connect();
    this.publicKey = response.publicKey;
    this.connected = true;
    
    if (!this.publicKey) {
      throw new Error('Failed to get public key from wallet');
    }
    
    this.solana.on('disconnect', () => {
      this.publicKey = null;
      this.connected = false;
    });
    return this.publicKey.toBase58();
  }
  
  async disconnect(): Promise<void> {
    if (this.solana) {
      await this.solana.disconnect();
    }
    this.publicKey = null;
    this.connected = false;
  }
  
  async signTransaction(transaction: Transaction): Promise<Transaction> {
    if (!this.solana || !this.connected) {
      throw new Error('Wallet not connected');
    }
    return await this.solana.signTransaction(transaction);
  }
  
  async signAndSendTransaction(transaction: Transaction): Promise<string> {
    if (!this.solana || !this.connected) {
      throw new Error('Wallet not connected');
    }
    const { signature } = await this.solana.signAndSendTransaction(transaction);
    return signature;
  }
  
  isInstalled(): boolean {
    return !!this.solana;
  }
}

export const wallet = new SolanaWallet();`, 'wallet-adapter')}
                    className="text-purple-300 hover:text-white"
                  >
                    {copiedId === 'wallet-adapter' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-purple-300/70">File: <code>client/src/lib/walletAdapter.ts</code></p>
              </div>

              {/* File 3: Backend Proxy */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-purple-300 text-sm font-semibold">3️⃣ Backend - API Proxy Routes</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(`// Backend proxy routes (Express.js)
app.get("/api/sol-refund/scan/:address", async (req, res) => {
  try {
    const { address } = req.params;
    const response = await fetch(\`${baseUrl}/api/sol-refund/scan/\${address}\`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error("Scan error:", error);
    res.status(500).json({ error: "Failed to scan wallet" });
  }
});

app.post("/api/sol-refund/prepare-transaction", async (req, res) => {
  try {
    const response = await fetch('${baseUrl}/api/sol-refund/prepare-transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error("Prepare error:", error);
    res.status(500).json({ error: "Failed to prepare transaction" });
  }
});

app.post("/api/sol-refund/record-success", async (req, res) => {
  try {
    const response = await fetch('${baseUrl}/api/sol-refund/record-success', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error("Record error:", error);
    res.status(500).json({ error: "Failed to record success" });
  }
});`, 'backend-proxy')}
                    className="text-purple-300 hover:text-white"
                  >
                    {copiedId === 'backend-proxy' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-purple-300/70">File: <code>server/routes.ts</code> or <code>server.js</code></p>
              </div>

              <div className="bg-blue-900/30 p-3 rounded-lg border border-blue-500/50">
                <p className="text-blue-200 text-xs mb-2">
                  💡 <strong>Usage:</strong> Create these files in your project, then call <code className="bg-slate-900/50 px-1 py-0.5 rounded">recoverSOLRent(wallet.publicKey, wallet)</code> from your UI components.
                </p>
                <p className="text-blue-200 text-xs">
                  ⚠️ <strong>Error Handling:</strong> If the record-success call fails after the transaction succeeds, the error message will include the transaction signature. Show this to users and optionally retry the stats recording or contact support.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Integration Example */}
          <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white">📦 Full Integration Example</CardTitle>
              <CardDescription className="text-purple-200">
                Frontend code calling your backend proxy routes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-slate-900/50 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-purple-300 text-sm font-semibold">Copy-Paste Ready Functions</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(`// STEP 1: SCAN WALLET (finds all closeable accounts)
const handleScan = async () => {
  // Call YOUR backend proxy (not getfreesol.xyz directly)
  const response = await fetch(\`/api/proxy/scan/\${walletAddress}\`);
  const data = await response.json();
  
  console.log('Found accounts:', data.emptyAccounts);
  console.log('Total reclaimable:', data.totalReclaimable, 'SOL');
  
  setAccounts(data.accounts); // Show in UI
};

// STEP 2: RECOVER RENT (for each account)
const handleRecover = async (address: string) => {
  // Prepare transaction via YOUR backend proxy
  const prepareResponse = await fetch('/api/proxy/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      walletAddress: walletAddress,
      selectedAccounts: [address],
      donationPercentage: ${feePercentage || '10'},
      feeReceiverAddress: '${referralAccount?.referralPda || 'YOUR_PDA_ADDRESS'}'
    }),
  });
  const prepareData = await prepareResponse.json();

  // Validate response (API returns transaction field, not success field)
  if (!prepareData.transaction) {
    throw new Error('Failed to prepare transaction');
  }

  // User signs
  const { signature } = await wallet.signAndSendTransaction(prepareData.transaction);

  // Record success via YOUR backend proxy
  await fetch('/api/proxy/record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      signature,
      walletAddress: walletAddress,
      selectedAccounts: [address],
      accountsClosed: 1,
      solRecovered: parseFloat(account?.rentAmount || "0"),
      feeReceiverAddress: '${referralAccount?.referralPda || 'YOUR_PDA_ADDRESS'}',
      donationPercentage: ${feePercentage || '10'},
      ...prepareData
    }),
  });
};`, 'integration-example')}
                    className="text-purple-300 hover:text-white"
                  >
                    {copiedId === 'integration-example' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <pre className="text-green-400 text-xs overflow-x-auto">
{`// STEP 1: SCAN WALLET (finds all closeable accounts)
const handleScan = async () => {
  // Call YOUR backend proxy (not getfreesol.xyz directly)
  const response = await fetch(\`/api/proxy/scan/\${walletAddress}\`);
  const data = await response.json();
  
  console.log('Found accounts:', data.emptyAccounts);
  console.log('Total reclaimable:', data.totalReclaimable, 'SOL');
  
  setAccounts(data.accounts); // Show in UI
};

// STEP 2: RECOVER RENT (for each account)
const handleRecover = async (address: string) => {
  // Prepare transaction via YOUR backend proxy
  const prepareResponse = await fetch('/api/proxy/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      walletAddress: walletAddress,
      selectedAccounts: [address],
      donationPercentage: ${feePercentage || '10'},
      feeReceiverAddress: '${referralAccount?.referralPda || 'YOUR_PDA_ADDRESS'}'
    }),
  });
  const prepareData = await prepareResponse.json();

  // Validate response (API returns transaction field, not success field)
  if (!prepareData.transaction) {
    throw new Error('Failed to prepare transaction');
  }

  // User signs
  const { signature } = await wallet.signAndSendTransaction(prepareData.transaction);

  // Record success via YOUR backend proxy
  await fetch('/api/proxy/record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      signature,
      walletAddress: walletAddress,
      selectedAccounts: [address],
      accountsClosed: 1,
      solRecovered: parseFloat(account?.rentAmount || "0"),
      feeReceiverAddress: '${referralAccount?.referralPda || 'YOUR_PDA_ADDRESS'}',
      donationPercentage: ${feePercentage || '10'},
      ...prepareData
    }),
  });
};`}
                </pre>
              </div>
              
              <div className="bg-green-900/30 p-3 rounded-lg border border-green-500/50">
                <p className="text-green-200 text-sm">
                  💡 <strong>Key Point:</strong> Users never leave your app. They see your UI, your branding. Our API just handles the Solana blockchain logic. Fees go directly to your PDA!
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Solana Web3.js Integration */}
          <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white">⚙️ @solana/web3.js Integration</CardTitle>
              <CardDescription className="text-purple-200">
                Complete integration using Solana's Web3.js SDK for full control
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Installation */}
              <div className="bg-slate-900/50 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-purple-300 text-sm font-semibold">Installation</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard('npm install @solana/web3.js', 'install-web3js')}
                    className="text-purple-300 hover:text-white"
                  >
                    {copiedId === 'install-web3js' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <pre className="text-green-400 text-sm overflow-x-auto">
{`npm install @solana/web3.js`}
                </pre>
              </div>

              {/* Complete Implementation */}
              <div className="bg-slate-900/50 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-purple-300 text-sm font-semibold">Complete Implementation with Web3.js</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(`import { Connection, Transaction, PublicKey } from '@solana/web3.js';

// Setup Solana connection
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

// Browser-compatible base64 to Uint8Array conversion
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  return Uint8Array.from(binaryString, char => char.charCodeAt(0));
}

// Your integration function
async function recoverSOLRent(walletPublicKey: PublicKey, wallet: any) {
  try {
    const walletAddress = walletPublicKey.toBase58();
    
    // STEP 1: Scan for empty token accounts (via YOUR backend proxy)
    const scanResponse = await fetch(
      \`/api/proxy/scan/\${walletAddress}\`
    );
    const scanData = await scanResponse.json();
    
    if (scanData.emptyAccounts === 0) {
      console.log('No empty accounts found');
      return;
    }
    
    console.log(\`Found \${scanData.emptyAccounts} empty accounts\`);
    console.log(\`Total SOL to recover: \${scanData.totalReclaimable}\`);
    
    // STEP 2: Prepare transaction (via YOUR backend proxy)
    const prepareResponse = await fetch('/api/proxy/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress,
        selectedAccounts: scanData.accounts.map(acc => acc.accountAddress),
        donationPercentage: ${feePercentage || '10'},
        feeReceiverAddress: '${referralAccount?.referralPda || 'YOUR_PDA_ADDRESS'}'
      })
    });
    
    const prepareData = await prepareResponse.json();
    
    // Validate response (API returns transaction field, not success field)
    if (!prepareData.transaction) {
      throw new Error('Failed to prepare transaction');
    }
    
    console.log(\`Net amount to user: \${prepareData.netAmount} SOL\`);
    console.log(\`Fee amount: \${prepareData.feeAmount} SOL\`);
    
    // STEP 3: Deserialize transaction from base64 (browser-compatible)
    const transactionBytes = base64ToUint8Array(prepareData.transaction);
    const transaction = Transaction.from(transactionBytes);
    
    // STEP 4: Sign transaction with wallet
    const signedTransaction = await wallet.signTransaction(transaction);
    
    // STEP 5: Send transaction to Solana network
    const signature = await connection.sendRawTransaction(
      signedTransaction.serialize(),
      {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      }
    );
    
    console.log('Transaction sent:', signature);
    
    // STEP 6: Confirm transaction
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error('Transaction failed: ' + JSON.stringify(confirmation.value.err));
    }
    
    console.log('Transaction confirmed!');
    
    // STEP 7: Record success (CRITICAL - updates platform stats, via YOUR backend proxy)
    await fetch('/api/proxy/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signature,
        walletAddress,
        selectedAccounts: scanData.accounts.map(acc => acc.accountAddress),
        accountsClosed: scanData.emptyAccounts,
        solRecovered: prepareData.totalSolReclaimed,
        netAmount: prepareData.netAmount,
        feeAmount: prepareData.feeAmount,
        platformFeeAmount: prepareData.platformFeeAmount,
        referralFeeAmount: prepareData.referralFeeAmount
      })
    });
    
    console.log('✅ Success! SOL recovered and stats updated');
    return signature;
    
  } catch (error) {
    console.error('Error recovering SOL:', error);
    throw error;
  }
}

// Usage example
// recoverSOLRent(wallet.publicKey, wallet);`, 'web3js-integration')}
                    className="text-purple-300 hover:text-white"
                  >
                    {copiedId === 'web3js-integration' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <pre className="text-green-400 text-xs overflow-x-auto">
{`import { Connection, Transaction, PublicKey } from '@solana/web3.js';

// Setup Solana connection
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

// Browser-compatible base64 to Uint8Array conversion
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  return Uint8Array.from(binaryString, char => char.charCodeAt(0));
}

// Your integration function
async function recoverSOLRent(walletPublicKey: PublicKey, wallet: any) {
  try {
    const walletAddress = walletPublicKey.toBase58();
    
    // STEP 1: Scan for empty token accounts (via YOUR backend proxy)
    const scanResponse = await fetch(
      \`/api/proxy/scan/\${walletAddress}\`
    );
    const scanData = await scanResponse.json();
    
    if (scanData.emptyAccounts === 0) {
      console.log('No empty accounts found');
      return;
    }
    
    console.log(\`Found \${scanData.emptyAccounts} empty accounts\`);
    console.log(\`Total SOL to recover: \${scanData.totalReclaimable}\`);
    
    // STEP 2: Prepare transaction (via YOUR backend proxy)
    const prepareResponse = await fetch('/api/proxy/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress,
        selectedAccounts: scanData.accounts.map(acc => acc.accountAddress),
        donationPercentage: ${feePercentage || '10'},
        feeReceiverAddress: '${referralAccount?.referralPda || 'YOUR_PDA_ADDRESS'}'
      })
    });
    
    const prepareData = await prepareResponse.json();
    
    // Validate response (API returns transaction field, not success field)
    if (!prepareData.transaction) {
      throw new Error('Failed to prepare transaction');
    }
    
    console.log(\`Net amount to user: \${prepareData.netAmount} SOL\`);
    console.log(\`Fee amount: \${prepareData.feeAmount} SOL\`);
    
    // STEP 3: Deserialize transaction from base64 (browser-compatible)
    const transactionBytes = base64ToUint8Array(prepareData.transaction);
    const transaction = Transaction.from(transactionBytes);
    
    // STEP 4: Sign transaction with wallet
    const signedTransaction = await wallet.signTransaction(transaction);
    
    // STEP 5: Send transaction to Solana network
    const signature = await connection.sendRawTransaction(
      signedTransaction.serialize(),
      {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      }
    );
    
    console.log('Transaction sent:', signature);
    
    // STEP 6: Confirm transaction
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error('Transaction failed: ' + JSON.stringify(confirmation.value.err));
    }
    
    console.log('Transaction confirmed!');
    
    // STEP 7: Record success (CRITICAL - updates platform stats, via YOUR backend proxy)
    await fetch('/api/proxy/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signature,
        walletAddress,
        selectedAccounts: scanData.accounts.map(acc => acc.accountAddress),
        accountsClosed: scanData.emptyAccounts,
        solRecovered: prepareData.totalSolReclaimed,
        netAmount: prepareData.netAmount,
        feeAmount: prepareData.feeAmount,
        platformFeeAmount: prepareData.platformFeeAmount,
        referralFeeAmount: prepareData.referralFeeAmount
      })
    });
    
    console.log('✅ Success! SOL recovered and stats updated');
    return signature;
    
  } catch (error) {
    console.error('Error recovering SOL:', error);
    throw error;
  }
}

// Usage example
// recoverSOLRent(wallet.publicKey, wallet);`}
                </pre>
              </div>

              <div className="bg-blue-900/30 p-3 rounded-lg border border-blue-500/50">
                <p className="text-blue-200 text-sm">
                  💡 <strong>Pro Tip:</strong> This example uses @solana/web3.js for full transaction control. Perfect for developers who need low-level access to Solana transactions and want to customize the signing and submission process.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Support */}
          <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white">📞 Support</CardTitle>
            </CardHeader>
            <CardContent className="text-purple-200 space-y-2">
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
            </CardContent>
          </Card>
          </div>
        )}
      </div>
    </div>
  );
}
