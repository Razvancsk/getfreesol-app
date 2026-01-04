import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Copy, Users, Globe, ArrowLeft } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useWalletAdapter } from "@/hooks/useWalletAdapter";
import logoPath from "@assets/image_1757882056840.png";

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
  const { connected, publicKey } = useWalletAdapter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [websiteUrl, setWebsiteUrl] = useState("");

  const { data: referralData, isLoading: isLoadingReferral } = useQuery({
    queryKey: ["/api/referrals/wallet", publicKey?.toString()],
    queryFn: () => fetch(`/api/referrals/wallet/${publicKey?.toString()}`).then(res => res.json()),
    enabled: !!publicKey,
    retry: false,
  });

  const { data: transactionsData, isLoading: isLoadingTransactions } = useQuery({
    queryKey: ["/api/referrals/transactions", referralData?.referralCode?.id],
    queryFn: () => fetch(`/api/referrals/${referralData?.referralCode?.id}/transactions`).then(res => res.json()),
    enabled: !!referralData?.referralCode?.id,
    retry: false,
  });

  const createReferralMutation = useMutation({
    mutationFn: async (data: { walletAddress: string; websiteUrl?: string }) => {
      const response = await fetch("/api/referrals/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return await response.json();
    },
    onSuccess: (data) => {
      toast({ title: "Success", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/referrals/wallet"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleCreateReferralCode = () => {
    if (!publicKey) {
      toast({ title: "Wallet Not Connected", description: "Please connect your wallet first", variant: "destructive" });
      return;
    }
    createReferralMutation.mutate({
      walletAddress: publicKey.toString(),
      websiteUrl: websiteUrl || undefined,
    });
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: `${type} copied to clipboard` });
  };

  const getReferralLink = (code: string) => {
    return `https://getfreesol.xyz/${code}`;
  };

  if (!connected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <header className="sticky top-0 z-50 border-b border-purple-700/50 bg-slate-900/80 backdrop-blur-md">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <Link href="/">
                <div className="flex items-center space-x-3 cursor-pointer">
                  <img src={logoPath} alt="GetFreeSol Logo" className="h-8 w-8" />
                  <span className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                    GetFreeSol
                  </span>
                </div>
              </Link>
            </div>
          </div>
        </header>
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="text-center space-y-4">
            <h1 className="text-3xl font-bold text-white">Referral Program</h1>
            <p className="text-purple-200">Connect your wallet to view your referral dashboard</p>
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
      <header className="sticky top-0 z-50 border-b border-purple-700/50 bg-slate-900/80 backdrop-blur-md">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <Link href="/">
              <div className="flex items-center space-x-3 cursor-pointer">
                <img src={logoPath} alt="GetFreeSol Logo" className="h-8 w-8" />
                <span className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  GetFreeSol
                </span>
              </div>
            </Link>
            <Link href="/">
              <Button
                variant="outline"
                className="bg-purple-700/50 hover:bg-purple-600 text-white border-purple-500/30"
                data-testid="button-back-to-app"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to App
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-lg md:max-w-4xl">
        <div className="space-y-4">
          {!hasReferralCode ? (
            <div className="bg-gradient-to-br from-purple-800/30 to-purple-900/40 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6 space-y-4 max-w-lg mx-auto">
              <h3 className="text-xl font-bold text-white">Create Your Referral Code</h3>
              <p className="text-purple-200 text-sm">Generate a unique referral code to start earning from referrals</p>
              <div className="space-y-2">
                <Label htmlFor="website" className="text-purple-200">Website URL (Optional)</Label>
                <Input
                  id="website"
                  type="url"
                  placeholder="https://yourwebsite.com"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  className="bg-purple-900/30 border-purple-500/30 text-white"
                  data-testid="input-website-url"
                />
              </div>
              <Button 
                onClick={handleCreateReferralCode}
                disabled={createReferralMutation.isPending}
                className="w-full bg-purple-600 hover:bg-purple-700"
                data-testid="button-create-referral"
              >
                {createReferralMutation.isPending ? "Creating..." : "Create Referral Code"}
              </Button>
            </div>
          ) : (
            <>
              {/* Stats Row - side by side on desktop */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Total Earnings */}
                <div className="bg-gradient-to-br from-purple-800/30 to-purple-900/40 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6 text-center">
                  <div className="text-3xl font-bold text-white mb-1">
                    {parseFloat(stats.totalEarnings).toFixed(9)} SOL
                  </div>
                  <div className="text-sm text-purple-200 uppercase tracking-wider">
                    Total Earnings
                  </div>
                </div>

                {/* Total Referrals */}
                <div className="bg-gradient-to-br from-purple-800/30 to-purple-900/40 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6 text-center">
                  <div className="text-3xl font-bold text-white mb-1">
                    {stats.totalReferrals}
                  </div>
                  <div className="text-sm text-purple-200 uppercase tracking-wider">
                    Total Referrals
                  </div>
                </div>
              </div>

              {/* Your Referral Information */}
              <div className="bg-gradient-to-br from-purple-800/30 to-purple-900/40 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
                <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                  <Globe className="w-5 h-5" />
                  Your Referral Information
                </h3>
                <div className="space-y-2">
                  <Label className="text-purple-200 text-sm">Referral Link</Label>
                  <div className="flex space-x-2">
                    <Input 
                      value={getReferralLink(referralCode.code)} 
                      readOnly
                      className="bg-purple-900/30 border-purple-500/30 text-white text-sm"
                      data-testid="input-referral-link"
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => copyToClipboard(getReferralLink(referralCode.code), "Referral link")}
                      className="bg-purple-800/30 border-purple-500/30 text-purple-300 hover:bg-purple-700/30 hover:text-white flex-shrink-0"
                      data-testid="button-copy-link"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Recent Referral Transactions */}
              <div className="bg-gradient-to-br from-purple-800/30 to-purple-900/40 backdrop-blur-sm rounded-xl border border-purple-500/20 p-6">
                <h3 className="text-lg font-bold text-white mb-1">Recent Referral Transactions</h3>
                <p className="text-purple-200 text-sm mb-4">Track your recent referral earnings</p>
                
                {isLoadingTransactions ? (
                  <div className="text-center py-4 text-purple-200">Loading transactions...</div>
                ) : transactions.length === 0 ? (
                  <div className="text-center py-6 text-purple-200">
                    <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p>No referral transactions yet</p>
                    <p className="text-sm">Share your referral link to start earning!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {transactions.map((tx: ReferralTransaction, index: number) => (
                      <div key={tx.id} className="border border-purple-500/30 bg-purple-900/20 rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-mono text-sm text-white">
                              {tx.referredWalletAddress.slice(0, 8)}...{tx.referredWalletAddress.slice(-8)}
                            </p>
                            <p className="text-xs text-purple-300">
                              {new Date(tx.paidAt).toLocaleDateString()}, {new Date(tx.paidAt).toLocaleTimeString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-green-400">
                              +{parseFloat(tx.referralFeeAmount).toFixed(9)} SOL
                            </p>
                            <p className="text-xs text-purple-300">
                              From {parseFloat(tx.originalFeeAmount).toFixed(9)} SOL fee
                            </p>
                          </div>
                        </div>
                        <Separator className="bg-purple-500/30 my-2" />
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-purple-300">
                            Transaction: {tx.transactionSignature.slice(0, 12)}...
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(`https://solscan.io/tx/${tx.transactionSignature}`, "_blank")}
                            className="text-purple-300 hover:text-white hover:bg-purple-700/30 h-auto py-1 px-2"
                            data-testid={`button-view-tx-${index}`}
                          >
                            View on Solscan
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
