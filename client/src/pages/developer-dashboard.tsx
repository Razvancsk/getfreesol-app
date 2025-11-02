import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy, ExternalLink } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import bs58 from "bs58";
import { Slider } from "@/components/ui/slider";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export default function DeveloperDashboard() {
  const { publicKey, signMessage } = useWallet();
  const { toast } = useToast();
  const [projectName, setProjectName] = useState("");
  const [feePercentage, setFeePercentage] = useState(0);

  const walletAddress = publicKey?.toBase58();

  // Fetch referral account (PDA-based)
  const { data: accountData, isLoading } = useQuery<any>({
    queryKey: ["/api/referral/account", walletAddress],
    enabled: !!walletAddress,
    retry: false,
  });

  const accountExists = accountData?.success && accountData?.account;
  const referralAccount = accountData?.account;
  const tokenAccounts = accountData?.tokenAccounts || [];

  // Initialize fee percentage from existing account
  useEffect(() => {
    if (referralAccount?.feePercentage !== undefined) {
      setFeePercentage(parseFloat(referralAccount.feePercentage));
    }
  }, [referralAccount]);

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
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/referral/account", walletAddress] });
      toast({
        title: "Success!",
        description: `Referral account created for "${projectName.trim()}"`,
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "Address copied to clipboard",
    });
  };

  if (!publicKey) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Developer Dashboard</CardTitle>
            <CardDescription>Connect your wallet to get started</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Please connect your wallet to access the developer dashboard.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-purple-900 py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {!accountExists ? (
          // Create Account Form
          <Card className="bg-black/50 border-purple-500/30 backdrop-blur max-w-md mx-auto">
            <CardHeader>
              <CardTitle className="text-white text-2xl">Create Ultra Referral Account</CardTitle>
              <CardDescription className="text-purple-200">
                Use your project name
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="projectName" className="text-white">Name</Label>
                <Input
                  id="projectName"
                  data-testid="input-project-name"
                  placeholder="meg"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  maxLength={50}
                  className="bg-slate-900/50 border-purple-400/30 text-white placeholder:text-purple-300/50"
                />
              </div>

              <Button
                data-testid="button-create-account"
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
          // Account Dashboard
          <>
            {/* Account Info */}
            <Card className="border-border bg-card">
              <CardHeader>
                <div className="space-y-1">
                  <CardTitle className="text-2xl">{referralAccount.projectName}</CardTitle>
                  <CardDescription>Your referral account is active</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Referral PDA (Program Derived Address)</Label>
                  <div className="flex items-center gap-2">
                    <code
                      data-testid="text-referral-pda"
                      className="flex-1 p-2 bg-muted rounded text-sm font-mono break-all"
                    >
                      {referralAccount.referralPda}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      data-testid="button-copy-pda"
                      onClick={() => copyToClipboard(referralAccount.referralPda)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      data-testid="button-view-explorer"
                      onClick={() =>
                        window.open(
                          `https://solscan.io/account/${referralAccount.referralPda}`,
                          "_blank"
                        )
                      }
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Use this PDA address in your integration to collect referral fees
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Your Wallet</Label>
                  <code className="block p-2 bg-muted rounded text-sm font-mono break-all">
                    {walletAddress}
                  </code>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Fee Share</Label>
                  <p className="text-lg">
                    You earn <span className="font-bold text-green-500">80%</span> of fees collected
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Platform retains 20% • Fees collected in multiple token types
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Token Accounts */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle>Fee Collection Token Accounts</CardTitle>
                <CardDescription>
                  Create token accounts for different token types you want to collect fees in
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {tokenAccounts.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-muted-foreground mb-4">
                      No token accounts created yet. Create one to start collecting fees.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Common tokens: SOL, USDC, USDT, BONK, JUP
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {tokenAccounts.map((tokenAccount: any) => (
                      <div
                        key={tokenAccount.id}
                        data-testid={`token-account-${tokenAccount.tokenMint}`}
                        className="p-3 border border-border rounded-lg space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold">{tokenAccount.tokenSymbol || "Unknown Token"}</p>
                            <p className="text-xs text-muted-foreground">{tokenAccount.tokenName || tokenAccount.tokenMint}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold">
                              {parseFloat(tokenAccount.unclaimedBalance || "0").toFixed(6)}
                            </p>
                            <p className="text-xs text-muted-foreground">Unclaimed</p>
                          </div>
                        </div>
                        <div className="text-xs space-y-1">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Total Earned:</span>
                            <span>{parseFloat(tokenAccount.totalEarned || "0").toFixed(6)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Total Claimed:</span>
                            <span>{parseFloat(tokenAccount.totalClaimed || "0").toFixed(6)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-4 border-t border-border">
                  <Button
                    className="w-full"
                    data-testid="button-create-token-account"
                    variant="outline"
                    disabled
                  >
                    Create Token Account (Coming Soon)
                  </Button>
                  <p className="text-xs text-center text-muted-foreground mt-2">
                    Multiple token support for SOL, USDC, USDT, and more
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
