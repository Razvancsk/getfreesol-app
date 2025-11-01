import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Code, ArrowLeft, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { useState } from 'react';
import logoImage from '@assets/image_1757882056840.png';

export default function ApiDocs() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const baseUrl = window.location.origin;

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

          {/* Revenue Sharing */}
          <Card className="bg-gradient-to-br from-purple-600/60 to-pink-600/60 border-purple-500 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white">💰 Revenue Sharing Model</CardTitle>
              <CardDescription className="text-purple-100">
                Set your own fees and earn from every transaction
              </CardDescription>
            </CardHeader>
            <CardContent className="text-white space-y-4">
              <div className="space-y-2">
                <p className="font-semibold">How it works:</p>
                <ul className="list-disc list-inside space-y-2 text-purple-100">
                  <li>You set your own fee percentage for each transaction</li>
                  <li>Platform takes 20% of your fee</li>
                  <li>You keep 80% of your fee</li>
                </ul>
              </div>
              
              <div className="bg-slate-900/50 p-4 rounded-lg border border-purple-400/30">
                <p className="text-purple-300 text-sm mb-2">Example:</p>
                <div className="space-y-1 text-sm">
                  <p>• You set fee: <span className="text-green-400 font-semibold">10%</span></p>
                  <p>• You receive: <span className="text-green-400 font-semibold">8%</span> (80% of your fee)</p>
                  <p>• Platform receives: <span className="text-purple-300 font-semibold">2%</span> (20% of your fee)</p>
                </div>
              </div>

              <div className="bg-slate-900/50 p-4 rounded-lg border border-purple-400/30">
                <p className="text-purple-300 text-sm mb-2">Another example:</p>
                <div className="space-y-1 text-sm">
                  <p>• You set fee: <span className="text-green-400 font-semibold">5%</span></p>
                  <p>• You receive: <span className="text-green-400 font-semibold">4%</span> (80% of your fee)</p>
                  <p>• Platform receives: <span className="text-purple-300 font-semibold">1%</span> (20% of your fee)</p>
                </div>
              </div>

              <p className="text-sm text-purple-200 italic">
                The higher fee you set, the more you earn - but make sure to stay competitive!
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
  "accountAddresses": ["account1", "account2"]
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
  "tokenMints": ["mint1", "mint2"]
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
    
    // Build claim transaction
    const txResponse = await fetch(
      '${baseUrl}/api/sol-refund/build-claim-transaction',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: walletAddress,
          accountAddresses: data.accounts.map(a => a.accountAddress)
        })
      }
    );
    
    const txData = await txResponse.json();
    // Sign and send the transaction...
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
      </div>
    </div>
  );
}
