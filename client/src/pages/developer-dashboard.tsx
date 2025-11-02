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

  // Fetch developer account
  const { data: accountData, isLoading } = useQuery({
    queryKey: ["/api/developer/account", walletAddress],
    enabled: !!walletAddress,
  });

  const accountExists = accountData?.exists;
  const developer = accountData?.developer;
  const balance = accountData?.balance;

  // Initialize fee percentage from existing account
  useEffect(() => {
    if (developer?.feePercentage !== undefined) {
      setFeePercentage(developer.feePercentage);
    }
  }, [developer]);

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
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/developer/account", walletAddress] });
      toast({
        title: "Success!",
        description: "Your developer account has been created.",
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

  // Set fee mutation
  const setFeeMutation = useMutation({
    mutationFn: async (newFee: number) => {
      if (!publicKey || !signMessage) {
        throw new Error("Wallet not connected");
      }

      const message = `Set fee percentage to ${newFee}%`;
      const encodedMessage = new TextEncoder().encode(message);
      const signature = await signMessage(encodedMessage);

      return await apiRequest("POST", "/api/developer/set-fee", {
        walletAddress: publicKey.toBase58(),
        signature: bs58.encode(signature),
        message,
        feePercentage: newFee,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/developer/account", walletAddress] });
      toast({
        title: "Success!",
        description: "Fee percentage updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Claim mutation
  const claimMutation = useMutation({
    mutationFn: async () => {
      if (!publicKey || !signMessage) {
        throw new Error("Wallet not connected");
      }

      const message = `Claim developer earnings`;
      const encodedMessage = new TextEncoder().encode(message);
      const signature = await signMessage(encodedMessage);

      return await apiRequest("POST", "/api/developer/claim", {
        walletAddress: publicKey.toBase58(),
        signature: bs58.encode(signature),
        message,
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/developer/account", walletAddress] });
      toast({
        title: "Claim Successful!",
        description: `You received ${(data.developerAmount / LAMPORTS_PER_SOL).toFixed(4)} WSOL`,
      });
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
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {!accountExists ? (
          // Create Account Form
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-2xl">Create Developer Account</CardTitle>
              <CardDescription>
                Set up your developer account to start earning fees from user transactions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="projectName">Project Name</Label>
                <Input
                  id="projectName"
                  data-testid="input-project-name"
                  placeholder="e.g., Birdeye, Meteora, Solend"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  maxLength={50}
                />
                <p className="text-xs text-muted-foreground">
                  A unique fee collection account will be created for your wallet
                </p>
              </div>

              <Button
                data-testid="button-create-account"
                className="w-full"
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
                <CardTitle>Developer Account</CardTitle>
                <CardDescription className="text-lg font-semibold text-foreground">
                  {developer.projectName}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Fee Collection Account</Label>
                  <div className="flex items-center gap-2">
                    <code
                      data-testid="text-fee-account"
                      className="flex-1 p-2 bg-muted rounded text-sm font-mono break-all"
                    >
                      {developer.feeAccountAddress}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      data-testid="button-copy-address"
                      onClick={() => copyToClipboard(developer.feeAccountAddress)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      data-testid="button-view-explorer"
                      onClick={() =>
                        window.open(
                          `https://solscan.io/account/${developer.feeAccountAddress}`,
                          "_blank"
                        )
                      }
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {developer.wsolAtaAddress && (
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">WSOL Fee Collection Address</Label>
                    <div className="flex items-center gap-2">
                      <code
                        data-testid="text-wsol-ata"
                        className="flex-1 p-2 bg-muted rounded text-sm font-mono break-all"
                      >
                        {developer.wsolAtaAddress}
                      </code>
                      <Button
                        variant="outline"
                        size="icon"
                        data-testid="button-copy-wsol-ata"
                        onClick={() => copyToClipboard(developer.wsolAtaAddress)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        data-testid="button-view-wsol-explorer"
                        onClick={() =>
                          window.open(
                            `https://solscan.io/account/${developer.wsolAtaAddress}`,
                            "_blank"
                          )
                        }
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-sm text-muted-foreground">Unclaimed Balance</Label>
                    <p data-testid="text-unclaimed-balance" className="text-2xl font-bold">
                      {(balance?.unclaimedLamports / LAMPORTS_PER_SOL || 0).toFixed(6)} WSOL
                    </p>
                    {balance?.unclaimedUsd > 0 && (
                      <p className="text-sm text-muted-foreground">
                        ≈ ${balance.unclaimedUsd.toFixed(2)} USD
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-sm text-muted-foreground">Total Claimed</Label>
                    <p data-testid="text-total-claimed" className="text-2xl font-bold">
                      {(parseFloat(developer.totalClaimed || "0") / LAMPORTS_PER_SOL).toFixed(6)} WSOL
                    </p>
                  </div>
                </div>

                <Button
                  className="w-full"
                  data-testid="button-claim"
                  onClick={() => claimMutation.mutate()}
                  disabled={balance?.unclaimedLamports === 0 || claimMutation.isPending}
                >
                  {claimMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Claiming...
                    </>
                  ) : (
                    `Claim Earnings (80%)`
                  )}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  You receive 80% of fees in WSOL, platform keeps 20%
                </p>
              </CardContent>
            </Card>

            {/* Fee Configuration */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle>Fee Configuration</CardTitle>
                <CardDescription>
                  Set the fee percentage you want to charge users (0-10%)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Fee Percentage</Label>
                    <span data-testid="text-fee-percentage" className="text-2xl font-bold">
                      {feePercentage.toFixed(2)}%
                    </span>
                  </div>
                  
                  <Slider
                    data-testid="slider-fee-percentage"
                    value={[feePercentage]}
                    onValueChange={(values) => setFeePercentage(values[0])}
                    max={10}
                    step={0.1}
                    className="w-full"
                  />

                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0%</span>
                    <span>5%</span>
                    <span>10%</span>
                  </div>
                </div>

                <Button
                  className="w-full"
                  data-testid="button-save-fee"
                  onClick={() => setFeeMutation.mutate(feePercentage)}
                  disabled={
                    feePercentage === developer.feePercentage || setFeeMutation.isPending
                  }
                >
                  {setFeeMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Fee Configuration"
                  )}
                </Button>

                <div className="p-3 bg-muted rounded text-sm space-y-2">
                  <p className="font-semibold">Fee Breakdown:</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>• Users pay: {feePercentage.toFixed(2)}% fee on transactions</li>
                    <li>• You receive: {(feePercentage * 0.8).toFixed(2)}% (80% of fee)</li>
                    <li>• Platform receives: {(feePercentage * 0.2).toFixed(2)}% (20% of fee)</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
