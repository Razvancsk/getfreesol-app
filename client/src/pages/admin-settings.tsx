import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, AlertTriangle, Key, Lock, CheckCircle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function AdminSettings() {
  const [relayerPrivateKey, setRelayerPrivateKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    // This should be set as an environment variable on the server
    // Never store private keys in the database
    alert("⚠️ IMPORTANT: Set this as RELAYER_PRIVATE_KEY environment variable in your deployment settings.\n\nNever commit this to git or store in database.");
    setSaved(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-950 via-purple-900 to-black p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">⚙️ Admin Settings</h1>
          <p className="text-purple-200">Configure Auto-Claim Relayer Wallet</p>
        </div>

        {/* Critical Security Warning */}
        <Alert className="bg-red-900/40 border-red-500/50">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          <AlertDescription className="text-red-100">
            <div className="space-y-2">
              <p className="font-bold text-lg">⚠️ CRITICAL SECURITY INFORMATION</p>
              <ul className="list-disc ml-5 space-y-1 text-sm">
                <li>This is for the <strong>PLATFORM RELAYER WALLET</strong> only</li>
                <li>This wallet pays network fees for auto-claims</li>
                <li>This is <strong>NOT</strong> for user wallets - users never share private keys</li>
                <li>Keep this wallet funded with SOL for network fees</li>
                <li>Store the private key as an environment secret</li>
              </ul>
            </div>
          </AlertDescription>
        </Alert>

        {/* What is the Relayer Wallet */}
        <Card className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm border border-purple-500/20 p-6">
          <div className="flex items-start gap-3 mb-4">
            <Info className="h-6 w-6 text-purple-400 flex-shrink-0 mt-1" />
            <div>
              <h3 className="text-xl font-bold text-white mb-2">What is the Relayer Wallet?</h3>
              <div className="text-purple-200 space-y-2 text-sm">
                <p>
                  The relayer wallet is a <strong>service wallet</strong> controlled by you (the platform owner) that:
                </p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Pays network fees (~0.000005 SOL per transaction)</li>
                  <li>Executes transactions on behalf of users with active permits</li>
                  <li>Recovers fees from the 15% platform fee</li>
                  <li>Never has access to user funds or private keys</li>
                </ul>
              </div>
            </div>
          </div>
        </Card>

        {/* Private Key Input */}
        <Card className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm border border-purple-500/20 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Key className="h-6 w-6 text-purple-400" />
            <h3 className="text-xl font-bold text-white">Relayer Private Key</h3>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="privateKey" className="text-purple-200 mb-2 block">
                Base58 Private Key (from Phantom, Solflare, or solana-keygen)
              </Label>
              <div className="relative">
                <Input
                  id="privateKey"
                  type={showKey ? "text" : "password"}
                  value={relayerPrivateKey}
                  onChange={(e) => setRelayerPrivateKey(e.target.value)}
                  placeholder="Enter base58 private key (e.g., 5Jv...ABC)"
                  className="bg-purple-950/50 border-purple-500/30 text-white pr-24"
                  data-testid="input-relayer-private-key"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-purple-300 hover:text-white"
                >
                  {showKey ? "Hide" : "Show"}
                </Button>
              </div>
            </div>

            {/* Security Checklist */}
            <Alert className="bg-purple-900/40 border-purple-500/30">
              <Shield className="h-4 w-4 text-purple-400" />
              <AlertDescription className="text-purple-100">
                <p className="font-semibold mb-2">Security Checklist:</p>
                <ul className="space-y-1 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 text-green-400" />
                    Create a new dedicated wallet for relayer operations
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 text-green-400" />
                    Fund it with 0.1-1 SOL for network fees
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 text-green-400" />
                    Never reuse a wallet that holds significant funds
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 text-green-400" />
                    Store as RELAYER_PRIVATE_KEY environment secret
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 text-green-400" />
                    Never commit to git or share publicly
                  </li>
                </ul>
              </AlertDescription>
            </Alert>
          </div>
        </Card>

        {/* Instructions */}
        <Card className="bg-gradient-to-br from-blue-900/20 to-purple-900/30 backdrop-blur-sm border border-blue-500/20 p-6">
          <div className="flex items-start gap-3">
            <Lock className="h-6 w-6 text-blue-400 flex-shrink-0 mt-1" />
            <div className="space-y-3">
              <h3 className="text-xl font-bold text-white">How to Set Up Securely</h3>
              
              <div className="space-y-4 text-purple-200 text-sm">
                <div>
                  <p className="font-semibold text-white mb-1">Step 1: Create Relayer Wallet</p>
                  <code className="block bg-black/50 p-2 rounded text-green-400 text-xs">
                    solana-keygen new --outfile ~/.config/solana/relayer.json
                  </code>
                  <p className="mt-1 text-xs text-purple-300">Or export from Phantom/Solflare as base58</p>
                </div>

                <div>
                  <p className="font-semibold text-white mb-1">Step 2: Fund the Wallet</p>
                  <code className="block bg-black/50 p-2 rounded text-green-400 text-xs">
                    solana transfer RELAYER_ADDRESS 0.5 --from YOUR_FUNDING_WALLET
                  </code>
                </div>

                <div>
                  <p className="font-semibold text-white mb-1">Step 3: Set Environment Variable</p>
                  <p className="text-xs text-purple-300 mb-1">In Replit Secrets (left sidebar):</p>
                  <div className="bg-black/50 p-2 rounded space-y-1">
                    <p className="text-green-400 text-xs">Key: <span className="text-yellow-400">RELAYER_PRIVATE_KEY</span></p>
                    <p className="text-green-400 text-xs">Value: <span className="text-yellow-400">[your base58 private key]</span></p>
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-white mb-1">Step 4: Enable Workers</p>
                  <p className="text-xs text-purple-300 mb-1">In Replit Secrets:</p>
                  <div className="bg-black/50 p-2 rounded space-y-1">
                    <p className="text-green-400 text-xs">Key: <span className="text-yellow-400">ENABLE_AUTO_CLAIM_WORKERS</span></p>
                    <p className="text-green-400 text-xs">Value: <span className="text-yellow-400">true</span></p>
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-white mb-1">Step 5: Restart Server</p>
                  <p className="text-xs text-purple-300">Workers will start automatically and begin monitoring permits</p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Current Status */}
        <Card className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm border border-purple-500/20 p-6">
          <h3 className="text-xl font-bold text-white mb-4">Current Status</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-purple-900/40 rounded-lg p-4">
              <p className="text-purple-300 text-sm mb-2">Relayer Configured</p>
              <Badge variant="secondary" className="bg-red-600/80">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Not Set
              </Badge>
            </div>
            <div className="bg-purple-900/40 rounded-lg p-4">
              <p className="text-purple-300 text-sm mb-2">Auto-Claim Workers</p>
              <Badge variant="secondary" className="bg-red-600/80">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Disabled
              </Badge>
            </div>
          </div>
        </Card>

        {/* Final Warning */}
        <Alert className="bg-yellow-900/40 border-yellow-500/50">
          <Shield className="h-5 w-5 text-yellow-400" />
          <AlertDescription className="text-yellow-100">
            <p className="font-bold mb-2">🔒 Security Best Practices</p>
            <ul className="list-disc ml-5 space-y-1 text-sm">
              <li><strong>NEVER</strong> use your personal wallet as the relayer</li>
              <li><strong>NEVER</strong> store private keys in code or database</li>
              <li><strong>ALWAYS</strong> use environment variables/secrets</li>
              <li><strong>MONITOR</strong> the relayer wallet balance regularly</li>
              <li><strong>ROTATE</strong> the key if you suspect it's compromised</li>
            </ul>
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}
