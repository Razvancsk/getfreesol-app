import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Code, ArrowLeft, Copy, Check, Info, ExternalLink } from 'lucide-react';
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
  const [vanityPrefix, setVanityPrefix] = useState('');
  
  const walletAddress = publicKey?.toBase58();

  // Fetch developer account
  const { data: accountData } = useQuery({
    queryKey: ["/api/developer/account", walletAddress],
    enabled: !!walletAddress,
  });

  const developer = accountData?.developer;

  // Auto-populate from developer account (unless manually edited)
  useEffect(() => {
    if (developer?.feeAccountAddress && !manuallyEditedWallet) {
      setFeeWallet(developer.feeAccountAddress);
    }
    if (developer?.feePercentage !== undefined && !manuallyEditedFee) {
      setFeePercentage(developer.feePercentage.toString());
    }
  }, [developer, manuallyEditedWallet, manuallyEditedFee]);

  // Create account mutation
  const createAccount = useMutation({
    mutationFn: async () => {
      if (!publicKey || !signMessage || !projectName.trim()) {
        throw new Error("Missing wallet or project name");
      }

      const message = `Create developer fee account for project: ${projectName}`;
      const encodedMessage = new TextEncoder().encode(message);
      const signature = await signMessage(encodedMessage);

      return await apiRequest('POST', '/api/developer/create-account', {
        walletAddress: publicKey.toBase58(),
        signature: bs58.encode(signature),
        message,
        projectName: projectName.trim(),
        vanityPrefix: vanityPrefix.trim() || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/developer/account", walletAddress] });
      toast({
        title: "Success!",
        description: "Your developer account has been created. You can now access the API documentation.",
      });
      setProjectName("");
      setVanityPrefix("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

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

  // Check if developer account exists
  const hasAccount = accountData?.exists;

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
                Use your project name
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="project-name" className="text-white">Name</Label>
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

              <div className="space-y-2">
                <Label htmlFor="vanity-prefix-docs" className="text-white text-sm text-muted-foreground">
                  Vanity Prefix (Optional)
                </Label>
                <Input
                  id="vanity-prefix-docs"
                  data-testid="input-vanity-prefix-docs"
                  placeholder="3 letters (optional)"
                  value={vanityPrefix}
                  onChange={(e) => setVanityPrefix(e.target.value.toUpperCase().slice(0, 3))}
                  maxLength={3}
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
                  "Create"
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

          {/* Configuration */}
          <Card className="bg-gradient-to-br from-purple-600/60 to-pink-600/60 border-purple-500 backdrop-blur">
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
              {developer && (
                <div className="p-3 bg-green-500/20 border border-green-400/30 rounded-lg space-y-2">
                  <p className="text-sm text-green-100 font-semibold">Developer Account Detected</p>
                  <p className="text-xs text-green-200">
                    Your fee collection settings are automatically loaded from your account. You can still edit them below to test different configurations.
                  </p>
                  <Link href="/developer">
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 bg-green-500/10 border-green-400/50 text-green-100 hover:bg-green-500/20"
                      data-testid="link-developer-dashboard"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Manage Account
                    </Button>
                  </Link>
                </div>
              )}

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
                    Fee Collection Account
                    {developer && <Badge className="ml-2 bg-green-500/20 text-green-100 border-green-400/30">Auto-loaded</Badge>}
                  </Label>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-purple-300" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>The Solana account that will receive fees from user transactions</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="fee-wallet"
                  type="text"
                  placeholder="Your Solana fee collection address"
                  value={feeWallet}
                  onChange={(e) => setFeeWallet(e.target.value)}
                  className="bg-slate-900/50 border-purple-400/30 text-white placeholder:text-purple-300/50 font-mono text-sm"
                  data-testid="input-fee-wallet"
                />
                {developer && (
                  <p className="text-xs text-green-200">
                    Using your managed fee account (you don't need the private key!)
                  </p>
                )}
              </div>

              {/* Fee Percentage */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="fee-percentage" className="text-white font-semibold">
                    Fee to Charge (%)
                    {developer && <Badge className="ml-2 bg-green-500/20 text-green-100 border-green-400/30">Auto-loaded</Badge>}
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
                <Input
                  id="fee-percentage"
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  placeholder="10"
                  value={feePercentage}
                  onChange={(e) => setFeePercentage(e.target.value)}
                  className="bg-slate-900/50 border-purple-400/30 text-white placeholder:text-purple-300/50"
                  data-testid="input-fee-percentage"
                />
                {developer && (
                  <p className="text-xs text-green-200">
                    Current fee configured in your developer account
                  </p>
                )}
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

              {/* Build Claim Transaction */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-600">POST</Badge>
                  <code className="text-purple-200">/api/sol-refund/build-claim-transaction</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(`${baseUrl}/api/sol-refund/build-claim-transaction`, 'claim-tx')}
                    className="ml-auto text-purple-300 hover:text-white"
                  >
                    {copiedId === 'claim-tx' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-purple-200 text-sm">Build a transaction to close empty accounts and recover SOL rent</p>
                <div className="bg-slate-900/50 p-4 rounded-lg">
                  <p className="text-purple-300 text-sm mb-2">Example Request:</p>
                  <pre className="text-green-400 text-sm overflow-x-auto">
{`POST ${baseUrl}/api/sol-refund/build-claim-transaction
Content-Type: application/json

{
  "walletAddress": "YOUR_WALLET_ADDRESS",
  "accountAddresses": ["account1", "account2"],
  "feeReceiverAddress": "${feeWallet || 'YOUR_FEE_WALLET'}",
  "feePercentage": ${feePercentage || '10'}
}`}
                  </pre>
                </div>
                {feeWallet && feePercentage && (
                  <div className="bg-blue-900/30 p-3 rounded-lg border border-blue-500/30">
                    <p className="text-blue-200 text-sm">
                      ℹ️ With your settings: Users pay {feePercentage}% fee. You receive {developerReceives}% 
                      ({feeWallet.substring(0, 8)}...), platform receives {platformReceives}%
                    </p>
                  </div>
                )}
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

              {/* Build Burn Transaction */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-600">POST</Badge>
                  <code className="text-purple-200">/api/tokens/build-burn-transaction</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(`${baseUrl}/api/tokens/build-burn-transaction`, 'burn-tx')}
                    className="ml-auto text-purple-300 hover:text-white"
                  >
                    {copiedId === 'burn-tx' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-purple-200 text-sm">Build a transaction to burn tokens and close the account</p>
                <div className="bg-slate-900/50 p-4 rounded-lg">
                  <p className="text-purple-300 text-sm mb-2">Example Request:</p>
                  <pre className="text-green-400 text-sm overflow-x-auto">
{`POST ${baseUrl}/api/tokens/build-burn-transaction
Content-Type: application/json

{
  "walletAddress": "YOUR_WALLET_ADDRESS",
  "tokenMints": ["mint1", "mint2"],
  "feeReceiverAddress": "${feeWallet || 'YOUR_FEE_WALLET'}",
  "feePercentage": ${feePercentage || '10'}
}`}
                  </pre>
                </div>
                {feeWallet && feePercentage && (
                  <div className="bg-blue-900/30 p-3 rounded-lg border border-blue-500/30">
                    <p className="text-blue-200 text-sm">
                      ℹ️ With your settings: Users pay {feePercentage}% fee. You receive {developerReceives}% 
                      ({feeWallet.substring(0, 8)}...), platform receives {platformReceives}%
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* NFT Burning */}
          <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white">🖼️ NFT Burning</CardTitle>
              <CardDescription className="text-purple-200">
                Scan and burn unwanted NFTs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
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
            </CardContent>
          </Card>

          {/* Usage Example */}
          <Card className="bg-purple-800/50 border-purple-600 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white">💻 Usage Example</CardTitle>
              <CardDescription className="text-purple-200">
                Sample JavaScript code to integrate SOL recovery
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-900/50 p-4 rounded-lg">
                <pre className="text-green-400 text-sm overflow-x-auto">
{`// Example: Scan wallet and recover SOL
const scanWallet = async (walletAddress) => {
  const response = await fetch(
    '${baseUrl}/api/sol-refund/scan/' + walletAddress
  );
  const data = await response.json();
  
  if (data.success && data.emptyAccounts > 0) {
    console.log(\`Found \${data.emptyAccounts} empty accounts\`);
    console.log(\`Can recover \${data.totalReclaimable} SOL\`);
    
    // Build claim transaction with your fee settings
    const txResponse = await fetch(
      '${baseUrl}/api/sol-refund/build-claim-transaction',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: walletAddress,
          accountAddresses: data.accounts.map(a => a.accountAddress),
          feeReceiverAddress: '${feeWallet || 'YOUR_FEE_WALLET'}',
          feePercentage: ${feePercentage || '10'}
        })
      }
    );
    
    const txData = await txResponse.json();
    // Sign and send the transaction...
    // You'll receive ${developerReceives}% of recovered SOL
    // Platform receives ${platformReceives}%
  }
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
