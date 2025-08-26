import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Copy, ExternalLink, Users, DollarSign, TrendingUp, Globe } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

type ReferralCode = {
  id: string;
  code: string;
  walletAddress: string;
  websiteUrl?: string;
  totalEarnings: string;
  totalReferrals: number;
  isActive: boolean;
  createdAt: string;
  stats?: {
    totalEarnings: string;
    totalReferrals: number;
  };
};

type ReferralTransaction = {
  id: string;
  transactionSignature: string;
  referredWalletAddress: string;
  originalFeeAmount: string;
  referralFeeAmount: string;
  platformFeeAmount: string;
  paidAt: string;
};

export default function Referrals() {
  const { connected, publicKey } = useWallet();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [websiteUrl, setWebsiteUrl] = useState("");

  // Fetch referral code for connected wallet
  const { data: referralData, isLoading: isLoadingReferral } = useQuery({
    queryKey: ["/api/referrals/wallet", publicKey?.toString()],
    queryFn: () => fetch(`/api/referrals/wallet/${publicKey?.toString()}`).then(res => res.json()),
    enabled: !!publicKey,
    retry: false,
  });

  // Fetch referral transactions
  const { data: transactionsData, isLoading: isLoadingTransactions } = useQuery({
    queryKey: ["/api/referrals/transactions", referralData?.referralCode?.id],
    queryFn: () => fetch(`/api/referrals/${referralData?.referralCode?.id}/transactions`).then(res => res.json()),
    enabled: !!referralData?.referralCode?.id,
    retry: false,
  });

  // Create referral code mutation
  const createReferralMutation = useMutation({
    mutationFn: async (data: { walletAddress: string; websiteUrl?: string }) => {
      const response = await fetch("/api/referrals/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/referrals/wallet"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateReferralCode = () => {
    if (!publicKey) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    createReferralMutation.mutate({
      walletAddress: publicKey.toString(),
      websiteUrl: websiteUrl || undefined,
    });
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${type} copied to clipboard`,
    });
  };

  const getReferralLink = (code: string) => {
    return `${window.location.origin}?ref=${code}`;
  };

  if (!connected) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold">Referral Program</h1>
          <p className="text-muted-foreground">
            Connect your wallet to create and manage your referral codes
          </p>
        </div>
      </div>
    );
  }

  const referralCode = referralData?.referralCode;
  const hasReferralCode = !!referralCode;
  const stats = referralCode?.stats || { totalEarnings: "0", totalReferrals: 0 };
  const transactions = transactionsData?.transactions || [];

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Referral Program
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Earn 20% of fees from users you refer. Share your referral link and start earning SOL!
          </p>
        </div>

        {/* How It Works */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              How It Works
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto">
                  <span className="text-blue-600 dark:text-blue-400 font-bold">1</span>
                </div>
                <h3 className="font-semibold">Create Your Link</h3>
                <p className="text-sm text-muted-foreground">
                  Generate your unique referral code and link
                </p>
              </div>
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto">
                  <span className="text-green-600 dark:text-green-400 font-bold">2</span>
                </div>
                <h3 className="font-semibold">Share & Promote</h3>
                <p className="text-sm text-muted-foreground">
                  Share your link on your website, social media, or directly
                </p>
              </div>
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center mx-auto">
                  <span className="text-purple-600 dark:text-purple-400 font-bold">3</span>
                </div>
                <h3 className="font-semibold">Earn 20%</h3>
                <p className="text-sm text-muted-foreground">
                  Get 20% of fees (3% of total transaction) instantly
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {!hasReferralCode ? (
          /* Create Referral Code */
          <Card>
            <CardHeader>
              <CardTitle>Create Your Referral Code</CardTitle>
              <CardDescription>
                Generate a unique referral code to start earning from referrals
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="website">Website URL (Optional)</Label>
                <Input
                  id="website"
                  type="url"
                  placeholder="https://yourwebsite.com"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  data-testid="input-website-url"
                />
                <p className="text-sm text-muted-foreground">
                  Add your website to help track where referrals come from
                </p>
              </div>
              <Button 
                onClick={handleCreateReferralCode}
                disabled={createReferralMutation.isPending}
                data-testid="button-create-referral"
              >
                {createReferralMutation.isPending ? "Creating..." : "Create Referral Code"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          /* Referral Dashboard */
          <>
            {/* Stats Cards */}
            <div className="grid md:grid-cols-3 gap-6">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center space-x-2">
                    <DollarSign className="w-8 h-8 text-green-500" />
                    <div>
                      <p className="text-2xl font-bold">{parseFloat(stats.totalEarnings).toFixed(6)} SOL</p>
                      <p className="text-sm text-muted-foreground">Total Earnings</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center space-x-2">
                    <Users className="w-8 h-8 text-blue-500" />
                    <div>
                      <p className="text-2xl font-bold">{stats.totalReferrals}</p>
                      <p className="text-sm text-muted-foreground">Total Referrals</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center space-x-2">
                    <TrendingUp className="w-8 h-8 text-purple-500" />
                    <div>
                      <p className="text-2xl font-bold">
                        {stats.totalReferrals > 0 
                          ? (parseFloat(stats.totalEarnings) / stats.totalReferrals).toFixed(6)
                          : "0.000000"
                        } SOL
                      </p>
                      <p className="text-sm text-muted-foreground">Avg per Referral</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Referral Code & Link */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Your Referral Information
                  <Badge variant={referralCode.isActive ? "default" : "secondary"}>
                    {referralCode.isActive ? "Active" : "Inactive"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Referral Link</Label>
                  <div className="flex space-x-2">
                    <Input 
                      value={getReferralLink(referralCode.code)} 
                      readOnly
                      data-testid="input-referral-link"
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => copyToClipboard(getReferralLink(referralCode.code), "Referral link")}
                      data-testid="button-copy-link"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => window.open(getReferralLink(referralCode.code), "_blank")}
                      data-testid="button-open-link"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

              </CardContent>
            </Card>

            {/* Recent Transactions */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Referral Transactions</CardTitle>
                <CardDescription>
                  Track your recent referral earnings
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingTransactions ? (
                  <div className="text-center py-4">Loading transactions...</div>
                ) : transactions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No referral transactions yet</p>
                    <p className="text-sm">Share your referral link to start earning!</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {transactions.map((tx: ReferralTransaction, index: number) => (
                      <div key={tx.id} className="border rounded-lg p-4 space-y-2">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <p className="font-mono text-sm">
                              {tx.referredWalletAddress.slice(0, 8)}...{tx.referredWalletAddress.slice(-8)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(tx.paidAt).toLocaleString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-green-600">
                              +{parseFloat(tx.referralFeeAmount).toFixed(6)} SOL
                            </p>
                            <p className="text-xs text-muted-foreground">
                              From {parseFloat(tx.originalFeeAmount).toFixed(6)} SOL fee
                            </p>
                          </div>
                        </div>
                        <Separator />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Transaction: {tx.transactionSignature.slice(0, 12)}...</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(`https://solscan.io/tx/${tx.transactionSignature}`, "_blank")}
                            data-testid={`button-view-transaction-${index}`}
                          >
                            View on Solscan
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}