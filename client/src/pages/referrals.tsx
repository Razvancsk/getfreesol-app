import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Copy, ExternalLink, Users, DollarSign, TrendingUp, Globe, Wallet } from "lucide-react";
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="text-center space-y-4">
            <h1 className="text-3xl font-bold text-white">Referral Program</h1>
            <p className="text-purple-200">
              Connect your wallet to create and manage your referral codes
            </p>
          </div>
        </div>
      </div>
    );
  }

  const referralCode = referralData?.referralCode;
  const hasReferralCode = !!referralCode;
  const stats = referralCode?.stats || { totalEarnings: "0", totalReferrals: 0 };
  const transactions = transactionsData?.transactions || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Referral Program
          </h1>
          <p className="text-xl text-purple-200 max-w-2xl mx-auto">
            Earn 20% of fees from users you refer. Share your referral link and start earning SOL!
          </p>
        </div>

        {/* How It Works */}
        <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
          <div className="mb-6">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              How It Works
            </h3>
          </div>
          <div className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-blue-500/20 border border-blue-500/30 rounded-full flex items-center justify-center mx-auto">
                  <Wallet className="w-6 h-6 text-blue-400" />
                </div>
                <h3 className="font-semibold text-white">Connect Wallet</h3>
                <p className="text-sm text-purple-200">
                  Connect your wallet to automatically generate your referral link
                </p>
              </div>
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-green-500/20 border border-green-500/30 rounded-full flex items-center justify-center mx-auto">
                  <Users className="w-6 h-6 text-green-400" />
                </div>
                <h3 className="font-semibold text-white">Share & Promote</h3>
                <p className="text-sm text-purple-200">
                  Share with your friends
                </p>
                <p className="text-sm text-purple-200">
                  Share your link on your website, social media, or directly
                </p>
              </div>
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-purple-500/20 border border-purple-500/30 rounded-full flex items-center justify-center mx-auto">
                  <DollarSign className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="font-semibold text-white">Earn 20%</h3>
                <p className="text-sm text-purple-200">
                  Earn 20% of platform fee from every referral transaction
                </p>
              </div>
            </div>
          </div>
        </div>

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
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6 text-center">
                <div className="text-3xl font-bold text-white mb-2">
                  {parseFloat(stats.totalEarnings).toFixed(6)} SOL
                </div>
                <div className="text-sm text-purple-200 uppercase tracking-wider">
                  Total Earnings
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6 text-center">
                <div className="text-3xl font-bold text-white mb-2">
                  {stats.totalReferrals}
                </div>
                <div className="text-sm text-purple-200 uppercase tracking-wider">
                  Total Referrals
                </div>
              </div>
            </div>

            {/* Referral Code & Link */}
            <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
              <div className="mb-6">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Your Referral Information
                  <Badge variant={referralCode.isActive ? "default" : "secondary"}>
                    {referralCode.isActive ? "Active" : "Inactive"}
                  </Badge>
                </h3>
              </div>
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-purple-200">Referral Link</Label>
                  <div className="flex space-x-2">
                    <Input 
                      value={getReferralLink(referralCode.code)} 
                      readOnly
                      data-testid="input-referral-link"
                      className="bg-purple-900/30 border-purple-500/30 text-white"
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => copyToClipboard(getReferralLink(referralCode.code), "Referral link")}
                      data-testid="button-copy-link"
                      className="bg-purple-800/20 border-purple-500/30 text-purple-300 hover:bg-purple-700/30 hover:text-white"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

              </div>
            </div>

            {/* Recent Transactions */}
            <div className="bg-gradient-to-br from-purple-800/20 to-purple-900/30 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
              <div className="mb-6">
                <h3 className="text-xl font-bold text-white">Recent Referral Transactions</h3>
                <p className="text-purple-200 text-sm mt-2">
                  Track your recent referral earnings
                </p>
              </div>
              <div>
                {isLoadingTransactions ? (
                  <div className="text-center py-4 text-purple-200">Loading transactions...</div>
                ) : transactions.length === 0 ? (
                  <div className="text-center py-8 text-purple-200">
                    <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No referral transactions yet</p>
                    <p className="text-sm">Share your referral link to start earning!</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {transactions.map((tx: ReferralTransaction, index: number) => (
                      <div key={tx.id} className="border border-purple-500/30 bg-purple-900/20 rounded-lg p-4 space-y-2">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <p className="font-mono text-sm text-white">
                              {tx.referredWalletAddress.slice(0, 8)}...{tx.referredWalletAddress.slice(-8)}
                            </p>
                            <p className="text-xs text-purple-300">
                              {new Date(tx.paidAt).toLocaleString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-green-400">
                              +{parseFloat(tx.referralFeeAmount).toFixed(6)} SOL
                            </p>
                            <p className="text-xs text-purple-300">
                              From {parseFloat(tx.originalFeeAmount).toFixed(6)} SOL fee
                            </p>
                          </div>
                        </div>
                        <Separator className="bg-purple-500/30" />
                        <div className="flex justify-between text-xs text-purple-300">
                          <span>Transaction: {tx.transactionSignature.slice(0, 12)}...</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(`https://solscan.io/tx/${tx.transactionSignature}`, "_blank")}
                            data-testid={`button-view-transaction-${index}`}
                            className="text-purple-300 hover:text-white hover:bg-purple-700/30"
                          >
                            View on Solscan
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}