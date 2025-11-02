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
                <CardTitle className="text-white">Getting Started</CardTitle>
                <CardDescription className="text-purple-200">
                  Use our API to integrate SOL rent recovery and token burning into your applications
                </CardDescription>
              </CardHeader>
              <CardContent className="text-purple-100 space-y-2">
                <p>Base URL: <code className="bg-purple-900/50 px-2 py-1 rounded text-purple-200">{baseUrl}/api</code></p>
                <p>All endpoints return JSON responses with a <code className="bg-purple-900/50 px-2 py-1 rounded text-purple-200">success</code> field</p>
              </CardContent>
            </Card>

            {/* Your PDA Address - Prominent Display */}
            {referralAccount && (
              <Card className="bg-gradient-to-r from-purple-600/50 to-pink-600/50 border-purple-400 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    🔑 Your Platform-Managed Wallet (PDA)
                  </CardTitle>
                  <CardDescription className="text-purple-100">
                    This wallet collects fees from all transactions. Use this address in your integration.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-white text-sm mb-2 block">PDA Address:</Label>
                    <div className="flex gap-2">
                      <div className="flex-1 p-3 bg-black/40 rounded text-sm font-mono break-all text-green-400 border border-purple-400/30">
                        {referralAccount.referralPda}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(referralAccount.referralPda, 'pda-address')}
                        className="bg-purple-700/50 hover:bg-purple-700 text-white border-purple-400/50"
                        data-testid="button-copy-pda"
                      >
                        {copiedId === 'pda-address' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="bg-purple-900/30 p-3 rounded-lg border border-purple-400/30">
                    <p className="text-purple-100 text-sm">
                      ✅ <strong>Project:</strong> {referralAccount.projectName}
                    </p>
                    <p className="text-purple-100 text-sm mt-1">
                      💰 <strong>Fee Flow:</strong> 100% of fees → Your PDA wallet
                    </p>
                    <p className="text-purple-100 text-sm mt-1">
                      💵 <strong>When you claim:</strong> {developerReceives}% to you, {platformReceives}% to platform
                    </p>
                  </div>
                  <p className="text-purple-200 text-xs">
                    ℹ️ This address is automatically included in all code examples below
                  </p>
                </CardContent>
              </Card>
            )}

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

          {/* SOL Rent Recovery */}
          <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white">🔍 SOL Rent Recovery</CardTitle>
              <CardDescription className="text-purple-200">
                Scan wallets for empty token accounts and reclaim rent deposits
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Scan Endpoint */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-600">GET</Badge>
                  <code className="text-purple-200">/api/sol-refund/scan/:address</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(`${baseUrl}/api/sol-refund/scan/YOUR_WALLET_ADDRESS`, 'scan')}
                    className="ml-auto text-purple-300 hover:text-white"
                  >
                    {copiedId === 'scan' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-purple-200 text-sm">Scan a wallet for empty token accounts that can be closed to recover rent</p>
                <div className="bg-slate-900/50 p-4 rounded-lg">
                  <p className="text-purple-300 text-sm mb-2">Example Request:</p>
                  <pre className="text-green-400 text-sm overflow-x-auto">
{`GET ${baseUrl}/api/sol-refund/scan/YOUR_WALLET_ADDRESS`}
                  </pre>
                </div>
                <div className="bg-slate-900/50 p-4 rounded-lg">
                  <p className="text-purple-300 text-sm mb-2">Example Response:</p>
                  <pre className="text-green-400 text-sm overflow-x-auto">
{`{
  "success": true,
  "walletAddress": "...",
  "totalAccounts": 15,
  "emptyAccounts": 8,
  "totalReclaimable": "0.0162",
  "accounts": [...]
}`}
                  </pre>
                </div>
              </div>

              <Separator className="bg-purple-600/30" />

              {/* Prepare Transaction */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-600">POST</Badge>
                  <code className="text-purple-200">/api/sol-refund/prepare-transaction</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(`${baseUrl}/api/sol-refund/prepare-transaction`, 'prepare-tx')}
                    className="ml-auto text-purple-300 hover:text-white"
                  >
                    {copiedId === 'prepare-tx' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-purple-200 text-sm">Build a transaction to close empty accounts and recover SOL rent</p>
                <div className="bg-slate-900/50 p-4 rounded-lg">
                  <p className="text-purple-300 text-sm mb-2">Example Request:</p>
                  <pre className="text-green-400 text-sm overflow-x-auto">
{`POST ${baseUrl}/api/sol-refund/prepare-transaction
Content-Type: application/json

{
  "walletAddress": "USER_WALLET_ADDRESS",
  "selectedAccounts": ["account1", "account2"],
  "donationPercentage": ${feePercentage || '10'},
  "feeReceiverAddress": "${referralAccount?.referralPda || 'YOUR_PDA_ADDRESS'}"
}`}
                  </pre>
                  <p className="text-purple-300 text-xs mt-2">
                    💰 <strong>feeReceiverAddress</strong>: Your PDA where fees are sent (${referralAccount ? 'auto-filled with your PDA' : 'shown in purple box above'})
                  </p>
                </div>
                {referralAccount && (
                  <div className="bg-green-900/30 p-3 rounded-lg border border-green-500/50">
                    <p className="text-green-200 text-sm font-semibold">
                      ✅ Fee Flow: User claims {feePercentage}% → <strong>100%</strong> goes to your PDA: <code className="text-green-400">{referralAccount.referralPda.substring(0, 12)}...</code>
                    </p>
                    <p className="text-green-200 text-xs mt-1">
                      When you claim from PDA: {developerReceives}% to your wallet, {platformReceives}% to platform
                    </p>
                  </div>
                )}
                <div className="bg-slate-900/50 p-4 rounded-lg">
                  <p className="text-purple-300 text-sm mb-2">Example Response:</p>
                  <pre className="text-green-400 text-sm overflow-x-auto">
{`{
  "transaction": "base64_encoded_transaction",
  "message": "Prepared transaction to close 8 accounts",
  "totalSolReclaimed": 0.0162,
  "feeAmount": 0.00162,
  "netAmount": 0.01458
}`}
                  </pre>
                </div>
              </div>

              <Separator className="bg-purple-600/30" />

              {/* Record Success - CRITICAL */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-orange-600">POST</Badge>
                  <code className="text-purple-200">/api/sol-refund/record-success</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(`${baseUrl}/api/sol-refund/record-success`, 'record-success')}
                    className="ml-auto text-purple-300 hover:text-white"
                  >
                    {copiedId === 'record-success' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-purple-200 text-sm font-semibold">⚠️ CRITICAL: Call this after transaction confirmation to update platform stats and record fees</p>
                <div className="bg-orange-900/30 p-3 rounded-lg border border-orange-500/50">
                  <p className="text-orange-200 text-sm">
                    <strong>Required:</strong> You MUST call this endpoint after the transaction is confirmed. This updates global statistics (TOTAL SOL RECOVERED, TOTAL ACCOUNTS CLOSED) and records your referral earnings.
                  </p>
                </div>
                <div className="bg-slate-900/50 p-4 rounded-lg">
                  <p className="text-purple-300 text-sm mb-2">Example Request:</p>
                  <pre className="text-green-400 text-sm overflow-x-auto">
{`POST ${baseUrl}/api/sol-refund/record-success
Content-Type: application/json

{
  "signature": "TRANSACTION_SIGNATURE",
  "walletAddress": "USER_WALLET_ADDRESS",
  "selectedAccounts": ["account1", "account2"],
  "accountsClosed": 8,
  "solRecovered": 0.0162,
  "netAmount": 0.01458,
  "feeAmount": 0.00162,
  "platformFeeAmount": 0.000324,
  "referralFeeAmount": 0.001296
}`}
                  </pre>
                </div>
                <div className="bg-slate-900/50 p-4 rounded-lg">
                  <p className="text-purple-300 text-sm mb-2">Example Response:</p>
                  <pre className="text-green-400 text-sm overflow-x-auto">
{`{
  "success": true,
  "message": "Successfully processed 8 accounts and recovered 0.01458 SOL!"
}`}
                  </pre>
                </div>
              </div>

              <Separator className="bg-purple-600/30" />

              {/* Stats Endpoint */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-600">GET</Badge>
                  <code className="text-purple-200">/api/sol-refund/stats</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(`${baseUrl}/api/sol-refund/stats`, 'stats')}
                    className="ml-auto text-purple-300 hover:text-white"
                  >
                    {copiedId === 'stats' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-purple-200 text-sm">Get platform-wide statistics for SOL recovery</p>
                <div className="bg-slate-900/50 p-4 rounded-lg">
                  <p className="text-purple-300 text-sm mb-2">Example Response:</p>
                  <pre className="text-green-400 text-sm overflow-x-auto">
{`{
  "success": true,
  "totalSolRecovered": "342.156",
  "totalAccountsClosed": 45678,
  "totalTransactions": 1234
}`}
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Token Burning */}
          <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white">🔥 Token Burning</CardTitle>
              <CardDescription className="text-purple-200">
                Scan and burn unwanted tokens from wallets
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Token Scan */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-600">GET</Badge>
                  <code className="text-purple-200">/api/tokens/scan/:address</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(`${baseUrl}/api/tokens/scan/YOUR_WALLET_ADDRESS`, 'token-scan')}
                    className="ml-auto text-purple-300 hover:text-white"
                  >
                    {copiedId === 'token-scan' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-purple-200 text-sm">Scan a wallet for all SPL tokens</p>
                <div className="bg-slate-900/50 p-4 rounded-lg">
                  <p className="text-purple-300 text-sm mb-2">Example Response:</p>
                  <pre className="text-green-400 text-sm overflow-x-auto">
{`{
  "success": true,
  "tokens": [
    {
      "mint": "...",
      "symbol": "TOKEN",
      "balance": "1000",
      "decimals": 6
    }
  ]
}`}
                  </pre>
                </div>
              </div>

              <Separator className="bg-purple-600/30" />

              {/* Bulk Burn Tokens */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-600">POST</Badge>
                  <code className="text-purple-200">/api/tokens/bulk-burn</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(`${baseUrl}/api/tokens/bulk-burn`, 'bulk-burn-tx')}
                    className="ml-auto text-purple-300 hover:text-white"
                  >
                    {copiedId === 'bulk-burn-tx' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-purple-200 text-sm">Build a transaction to burn multiple tokens and close accounts</p>
                <div className="bg-slate-900/50 p-4 rounded-lg">
                  <p className="text-purple-300 text-sm mb-2">Example Request:</p>
                  <pre className="text-green-400 text-sm overflow-x-auto">
{`POST ${baseUrl}/api/tokens/bulk-burn
Content-Type: application/json

{
  "ownerPublicKey": "USER_WALLET_ADDRESS",
  "selectedTokens": [
    { "mint": "mint1", "tokenAccount": "account1" },
    { "mint": "mint2", "tokenAccount": "account2" }
  ],
  "donationPercentage": ${feePercentage || '10'},
  "feeReceiverAddress": "${referralAccount?.referralPda || 'YOUR_PDA_ADDRESS'}"
}`}
                  </pre>
                  <p className="text-purple-300 text-xs mt-2">
                    💰 <strong>feeReceiverAddress</strong>: Your PDA where fees are sent
                  </p>
                </div>
                {referralAccount && (
                  <div className="bg-green-900/30 p-3 rounded-lg border border-green-500/50">
                    <p className="text-green-200 text-sm font-semibold">
                      ✅ 100% of token burn fees → Your PDA: <code className="text-green-400">{referralAccount.referralPda.substring(0, 12)}...</code>
                    </p>
                  </div>
                )}
              </div>

              <Separator className="bg-purple-600/30" />

              {/* Record Token Burn Success */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-orange-600">POST</Badge>
                  <code className="text-purple-200">/api/tokens/record-burn-success</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(`${baseUrl}/api/tokens/record-burn-success`, 'record-token-burn')}
                    className="ml-auto text-purple-300 hover:text-white"
                  >
                    {copiedId === 'record-token-burn' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-purple-200 text-sm font-semibold">⚠️ CRITICAL: Call this after token burn confirmation</p>
                <div className="bg-orange-900/30 p-3 rounded-lg border border-orange-500/50">
                  <p className="text-orange-200 text-sm">
                    <strong>Required:</strong> Call this to update global stats and record your referral earnings from token burns.
                  </p>
                </div>
                <div className="bg-slate-900/50 p-4 rounded-lg">
                  <p className="text-purple-300 text-sm mb-2">Example Request:</p>
                  <pre className="text-green-400 text-sm overflow-x-auto">
{`POST ${baseUrl}/api/tokens/record-burn-success
Content-Type: application/json

{
  "signature": "TRANSACTION_SIGNATURE",
  "walletAddress": "USER_WALLET_ADDRESS",
  "tokensBurned": 5,
  "solRecovered": 0.01,
  "netAmount": 0.009,
  "feeAmount": 0.001
}`}
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* NFT Burning */}
          <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white">🖼️ NFT Burning</CardTitle>
              <CardDescription className="text-purple-200">
                Scan and burn unwanted NFTs (including compressed NFTs)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* NFT Scan */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-600">GET</Badge>
                  <code className="text-purple-200">/api/nfts/scan/:address</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(`${baseUrl}/api/nfts/scan/YOUR_WALLET_ADDRESS`, 'nft-scan')}
                    className="ml-auto text-purple-300 hover:text-white"
                  >
                    {copiedId === 'nft-scan' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-purple-200 text-sm">Scan a wallet for all NFTs (including compressed NFTs)</p>
              </div>

              <Separator className="bg-purple-600/30" />

              {/* Build NFT Burn Transaction */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-600">POST</Badge>
                  <code className="text-purple-200">/api/nfts/burn/build</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(`${baseUrl}/api/nfts/burn/build`, 'nft-burn-build')}
                    className="ml-auto text-purple-300 hover:text-white"
                  >
                    {copiedId === 'nft-burn-build' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-purple-200 text-sm">Build a transaction to burn NFTs and close accounts</p>
                <div className="bg-slate-900/50 p-4 rounded-lg">
                  <p className="text-purple-300 text-sm mb-2">Example Request:</p>
                  <pre className="text-green-400 text-sm overflow-x-auto">
{`POST ${baseUrl}/api/nfts/burn/build
Content-Type: application/json

{
  "ownerPublicKey": "USER_WALLET_ADDRESS",
  "nfts": [
    { "mint": "nft_mint_1", "isCompressed": false },
    { "mint": "nft_mint_2", "isCompressed": true }
  ],
  "donationPercentage": ${feePercentage || '10'},
  "feeReceiverAddress": "${referralAccount?.referralPda || 'YOUR_PDA_ADDRESS'}"
}`}
                  </pre>
                  <p className="text-purple-300 text-xs mt-2">
                    💰 <strong>feeReceiverAddress</strong>: Your PDA where fees are sent
                  </p>
                </div>
                {referralAccount && (
                  <div className="bg-green-900/30 p-3 rounded-lg border border-green-500/50">
                    <p className="text-green-200 text-sm font-semibold">
                      ✅ 100% of NFT burn fees → Your PDA: <code className="text-green-400">{referralAccount.referralPda.substring(0, 12)}...</code>
                    </p>
                  </div>
                )}
              </div>

              <Separator className="bg-purple-600/30" />

              {/* Record NFT Burn Success */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-orange-600">POST</Badge>
                  <code className="text-purple-200">/api/nfts/burn/record</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(`${baseUrl}/api/nfts/burn/record`, 'record-nft-burn')}
                    className="ml-auto text-purple-300 hover:text-white"
                  >
                    {copiedId === 'record-nft-burn' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-purple-200 text-sm font-semibold">⚠️ CRITICAL: Call this after NFT burn confirmation</p>
                <div className="bg-orange-900/30 p-3 rounded-lg border border-orange-500/50">
                  <p className="text-orange-200 text-sm">
                    <strong>Required:</strong> Call this to update global stats and record your referral earnings from NFT burns.
                  </p>
                </div>
                <div className="bg-slate-900/50 p-4 rounded-lg">
                  <p className="text-purple-300 text-sm mb-2">Example Request:</p>
                  <pre className="text-green-400 text-sm overflow-x-auto">
{`POST ${baseUrl}/api/nfts/burn/record
Content-Type: application/json

{
  "signature": "TRANSACTION_SIGNATURE",
  "walletAddress": "USER_WALLET_ADDRESS",
  "nftsBurned": 3,
  "solRecovered": 0.015,
  "netAmount": 0.0135,
  "feeAmount": 0.0015
}`}
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Usage Example */}
          <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white">💻 Complete Integration Example</CardTitle>
              <CardDescription className="text-purple-200">
                Full workflow: Scan → Prepare → Sign → Submit → Record
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-900/50 p-4 rounded-lg">
                <pre className="text-green-400 text-sm overflow-x-auto">
{`// Complete SOL Recovery Integration
const recoverSOL = async (walletAddress, wallet) => {
  // Step 1: Scan for empty accounts
  const scanRes = await fetch(
    '${baseUrl}/api/sol-refund/scan/' + walletAddress
  );
  const scanData = await scanRes.json();
  
  if (scanData.emptyAccounts === 0) {
    return console.log('No empty accounts found');
  }
  
  console.log(\`Found \${scanData.emptyAccounts} empty accounts\`);
  console.log(\`Can recover \${scanData.totalReclaimable} SOL\`);
  
  // Step 2: Prepare transaction with your referral code
  const prepareRes = await fetch(
    '${baseUrl}/api/sol-refund/prepare-transaction',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress,
        selectedAccounts: scanData.accounts.map(a => a.accountAddress),
        donationPercentage: ${feePercentage || '10'},
        feeReceiverAddress: '${referralAccount?.referralPda || 'YOUR_PDA_ADDRESS'}'
      })
    }
  );
  const { transaction, totalSolReclaimed, feeAmount, 
          netAmount, platformFeeAmount, referralFeeAmount } = await prepareRes.json();
  
  // Step 3: Sign and send transaction
  const tx = Transaction.from(Buffer.from(transaction, 'base64'));
  const signed = await wallet.signTransaction(tx);
  const signature = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(signature);
  
  // Step 4: ⚠️ CRITICAL - Record success to update global stats
  await fetch('${baseUrl}/api/sol-refund/record-success', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      signature,
      walletAddress,
      selectedAccounts: scanData.accounts.map(a => a.accountAddress),
      accountsClosed: scanData.emptyAccounts,
      solRecovered: totalSolReclaimed,
      netAmount,
      feeAmount,
      platformFeeAmount,
      referralFeeAmount
    })
  });
  
  console.log('Success! SOL recovered and sent to user!');
  // Global stats (TOTAL SOL RECOVERED, TOTAL ACCOUNTS CLOSED) now updated!
};`}
                </pre>
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
