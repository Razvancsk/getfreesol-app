import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { ArrowLeft, TrendingUp, Users, Vault, Coins, ArrowDownToLine, ArrowUpFromLine, BadgeDollarSign, Clock, CheckCircle2, RefreshCw } from "lucide-react";


function fmt(sol: string | number, decimals = 4) {
  const n = typeof sol === "string" ? parseFloat(sol) : sol;
  if (isNaN(n)) return "0";
  return n.toFixed(decimals);
}

function shortWallet(w: string) {
  return w.slice(0, 4) + "…" + w.slice(-4);
}

function txLabel(type: string) {
  switch (type) {
    case "deposit": return "Deposit";
    case "withdraw": return "Withdrawal";
    case "fee_credit": return "Fee Credited";
    case "fee_claim": return "Manual Claim";
    case "fee_auto_pay": return "Auto-Pay";
    default: return type;
  }
}

function txColor(type: string) {
  switch (type) {
    case "deposit": return "text-green-400";
    case "withdraw": return "text-red-400";
    case "fee_credit": return "text-yellow-400";
    case "fee_claim": return "text-purple-400";
    case "fee_auto_pay": return "text-green-400";
    default: return "text-gray-400";
  }
}

export default function PartnersPage() {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [depositAmount, setDepositAmount] = useState("");
  const [depositLoading, setDepositLoading] = useState(false);
  const [distributeAmount, setDistributeAmount] = useState("");
  const [distributeLoading, setDistributeLoading] = useState(false);
  const PLATFORM_WALLET = "GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT";
  const isAdmin = wallet === PLATFORM_WALLET;

  const { data: depositAddressData } = useQuery<{ depositAddress: string }>({
    queryKey: ["/api/vault/deposit-address"],
  });
  const vaultDepositAddress = depositAddressData?.depositAddress ?? null;

  const { data: stats, isLoading: statsLoading } = useQuery<{ totalDeposited: string; partnerCount: number }>({
    queryKey: ["/api/vault/stats"],
    refetchInterval: 30000,
  });

  const { data: partnerData, isLoading: partnerLoading } = useQuery<{
    partner: { depositedSol: string; claimableFees: string; totalEarned: string } | null;
    sharePercent: string;
    totalDeposited: string;
    partnerCount: number;
    pendingFees: string;
  }>({
    queryKey: ["/api/vault/partner", wallet],
    enabled: !!wallet,
    refetchInterval: 10000,
  });

  const { data: txHistory } = useQuery<Array<{
    id: string; txType: string; amountSol: string; signature: string | null; createdAt: string;
  }>>({
    queryKey: ["/api/vault/transactions", wallet],
    enabled: !!wallet,
    refetchInterval: 30000,
  });

  const { data: feeSummary, refetch: refetchFees } = useQuery<{
    allTimeFees: string; last24hFees: string; last7dFees: string;
    allTimePartnerPool: string; last24hPartnerPool: string; last7dPartnerPool: string;
    totalDistributed: string; txCount: number; feesWalletBalance: string;
  }>({
    queryKey: ["/api/vault/fee-summary"],
    enabled: isAdmin,
    refetchInterval: 60000,
  });

  async function handleDistribute() {
    const amount = parseFloat(distributeAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    setDistributeLoading(true);
    try {
      const relayerKey = prompt("Enter admin key to confirm distribution:");
      if (!relayerKey) return;
      const res = await apiRequest("POST", "/api/vault/distribute-fees", { adminKey: relayerKey, totalFeeSol: amount });
      const data = await res.json();
      toast({ title: "Fees distributed!", description: `${fmt(data.distributed)} SOL split among ${data.partners} partners` });
      setDistributeAmount("");
      refetchFees();
      qc.invalidateQueries({ queryKey: ["/api/vault/partner", wallet] });
    } catch (e: any) {
      toast({ title: "Distribution failed", description: e.message, variant: "destructive" });
    } finally {
      setDistributeLoading(false);
    }
  }

  const withdrawMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/vault/withdraw", { walletAddress: wallet }).then(r => r.json()),
    onSuccess: (data: any) => {
      toast({ title: "Withdrawal successful", description: `${fmt(data.amountSol)} SOL sent to your wallet` });
      qc.invalidateQueries({ queryKey: ["/api/vault/partner", wallet] });
      qc.invalidateQueries({ queryKey: ["/api/vault/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/vault/transactions", wallet] });
    },
    onError: (e: any) => toast({ title: "Withdrawal failed", description: e.message, variant: "destructive" }),
  });

  const claimFeesMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/vault/claim-fees", { walletAddress: wallet }).then(r => r.json()),
    onSuccess: (data: any) => {
      toast({ title: "Fees claimed!", description: `${fmt(data.claimedSol)} SOL sent to your wallet` });
      qc.invalidateQueries({ queryKey: ["/api/vault/partner", wallet] });
      qc.invalidateQueries({ queryKey: ["/api/vault/transactions", wallet] });
    },
    onError: (e: any) => toast({ title: "Claim failed", description: e.message, variant: "destructive" }),
  });

  async function handleDeposit() {
    if (!wallet || !signTransaction) return;
    if (!vaultDepositAddress) {
      toast({ title: "Vault not ready", description: "Could not load deposit address", variant: "destructive" });
      return;
    }
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    setDepositLoading(true);
    try {
      const lamports = BigInt(Math.floor(amount * LAMPORTS_PER_SOL));
      const tx = new Transaction();
      tx.add(SystemProgram.transfer({
        fromPubkey: new PublicKey(wallet),
        toPubkey: new PublicKey(vaultDepositAddress),
        lamports,
      }));
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = new PublicKey(wallet);
      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");
      await apiRequest("POST", "/api/vault/deposit", { walletAddress: wallet, amountSol: amount.toString(), signature: sig });
      toast({ title: "Deposit confirmed!", description: `${amount} SOL added to the vault` });
      setDepositAmount("");
      qc.invalidateQueries({ queryKey: ["/api/vault/partner", wallet] });
      qc.invalidateQueries({ queryKey: ["/api/vault/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/vault/transactions", wallet] });
    } catch (e: any) {
      toast({ title: "Deposit failed", description: e.message, variant: "destructive" });
    } finally {
      setDepositLoading(false);
    }
  }

  const partner = partnerData?.partner;
  const sharePercent = partnerData?.sharePercent ?? "0";
  const claimable = parseFloat(partner?.claimableFees ?? "0");
  const pending = parseFloat(partnerData?.pendingFees ?? "0");
  const totalAvailable = claimable + pending;
  const deposited = parseFloat(partner?.depositedSol ?? "0");

  return (
    <div className="min-h-screen bg-[#0f0a1e] text-white">
      {/* Header */}
      <div className="border-b border-purple-800/40 bg-[#0f0a1e]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="container mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
          <Link href="/">
            <button className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm">
              <ArrowLeft className="w-4 h-4" />
              Back to app
            </button>
          </Link>
          <div className="flex items-center gap-2 font-bold text-lg">
            <Vault className="w-5 h-5 text-purple-400" />
            Partner Vault
          </div>
          <div className="w-24" />
        </div>
      </div>

      <div className="container mx-auto max-w-4xl px-4 py-8 space-y-6">

        {/* Hero */}
        <div className="text-center space-y-2 py-4">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Earn Passive Income
          </h1>
          <p className="text-gray-400 max-w-xl mx-auto text-sm">
            Deposit SOL into the GetFreeSol vault and earn a proportional share of the platform's daily fees — automatically distributed every 24 hours.
          </p>
        </div>

        {/* Vault Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-purple-900/20 border border-purple-700/30 rounded-xl p-4 text-center">
            <div className="text-xs text-gray-400 mb-1 flex items-center justify-center gap-1">
              <Vault className="w-3 h-3" /> Total Vault
            </div>
            <div className="text-xl font-bold text-white">
              {statsLoading ? "…" : `${fmt(stats?.totalDeposited ?? "0", 3)} SOL`}
            </div>
          </div>
          <div className="bg-purple-900/20 border border-purple-700/30 rounded-xl p-4 text-center">
            <div className="text-xs text-gray-400 mb-1 flex items-center justify-center gap-1">
              <Users className="w-3 h-3" /> Partners
            </div>
            <div className="text-xl font-bold text-white">
              {statsLoading ? "…" : stats?.partnerCount ?? 0}
            </div>
          </div>
          <div className="col-span-2 md:col-span-1 bg-purple-900/20 border border-purple-700/30 rounded-xl p-4 text-center">
            <div className="text-xs text-gray-400 mb-1 flex items-center justify-center gap-1">
              <TrendingUp className="w-3 h-3" /> Fee Share
            </div>
            <div className="text-xl font-bold text-green-400">20% Daily</div>
          </div>
        </div>

        {/* Admin Fee Summary Panel */}
        {isAdmin && feeSummary && (
          <div className="bg-gradient-to-br from-orange-900/20 to-red-900/10 border border-orange-500/40 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-orange-300 flex items-center gap-2 text-sm uppercase tracking-wide">
                🛡️ Fees Wallet — Coin Flip 3.5% Collected
              </h2>
              <div className="text-right">
                <div className="text-xs text-gray-400">Live Balance</div>
                <div className="font-bold text-yellow-400 text-lg">{fmt(feeSummary.feesWalletBalance ?? "0", 4)} SOL</div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-black/30 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-400 mb-1">Last 24h Fees</div>
                <div className="font-bold text-white">{fmt(feeSummary.last24hFees, 5)} SOL</div>
                <div className="text-xs text-green-400 mt-0.5">Partners earn {fmt(feeSummary.last24hPartnerPool, 5)} SOL</div>
              </div>
              <div className="bg-black/30 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-400 mb-1">Last 7 Days Fees</div>
                <div className="font-bold text-white">{fmt(feeSummary.last7dFees, 5)} SOL</div>
                <div className="text-xs text-green-400 mt-0.5">Partners earn {fmt(feeSummary.last7dPartnerPool, 5)} SOL</div>
              </div>
              <div className="bg-black/30 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-400 mb-1">All-Time Fees</div>
                <div className="font-bold text-white">{fmt(feeSummary.allTimeFees, 5)} SOL</div>
                <div className="text-xs text-gray-500 mt-0.5">{feeSummary.txCount} bets</div>
              </div>
              <div className="bg-black/30 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-400 mb-1">Total Distributed</div>
                <div className="font-bold text-green-400">{fmt(feeSummary.totalDistributed, 5)} SOL</div>
                <div className="text-xs text-gray-500 mt-0.5">sent to partners</div>
              </div>
            </div>

            <div className="bg-black/20 rounded-xl p-3 text-xs text-gray-400 flex items-center gap-2">
              <span className="text-orange-400 font-bold">Flow:</span>
              Fees wallet receives 3.5% of every bet on-chain → immediately after each flip, 70% is credited to partners proportionally and auto-sent to their wallets → 15-min cron sweeps any missed amounts as fallback
            </div>

            <div className="border-t border-orange-500/20 pt-3 space-y-2">
              <div className="text-xs text-gray-400 font-medium">Manual Distribution</div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="SOL amount to distribute (70% split)"
                  value={distributeAmount}
                  onChange={e => setDistributeAmount(e.target.value)}
                  className="bg-black/40 border-orange-700/40 text-white placeholder:text-gray-600 text-sm"
                  min="0.001"
                  step="0.01"
                />
                <Button
                  onClick={handleDistribute}
                  disabled={distributeLoading || !distributeAmount}
                  className="bg-orange-600 hover:bg-orange-500 text-white font-semibold rounded-xl px-4 whitespace-nowrap text-sm"
                >
                  {distributeLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : "Distribute"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Connect prompt */}
        {!wallet && (
          <div className="bg-purple-900/20 border border-purple-700/40 rounded-2xl p-8 text-center space-y-4">
            <Vault className="w-10 h-10 text-purple-400 mx-auto" />
            <p className="text-gray-300 font-medium">Connect your wallet to join the partner vault</p>
            <div className="flex justify-center">
              <WalletMultiButton style={{ background: "linear-gradient(135deg, #7c3aed, #9d4edd)", borderRadius: "12px", fontSize: "14px" }} />
            </div>
          </div>
        )}

        {/* Partner position */}
        {wallet && (
          <>
            {/* Actions */}
            <div className="grid md:grid-cols-3 gap-4">
              {/* Deposit */}
              <div className="bg-[#1a0f2e] border border-purple-700/30 rounded-2xl p-5 space-y-3">
                <h3 className="font-semibold flex items-center gap-2 text-gray-200">
                  <ArrowDownToLine className="w-4 h-4 text-green-400" />
                  Deposit SOL
                </h3>
                <p className="text-xs text-gray-400">Send SOL to the vault and start earning fees from your next distribution.</p>
                <Input
                  type="number"
                  placeholder="Amount in SOL"
                  value={depositAmount}
                  onChange={e => setDepositAmount(e.target.value)}
                  className="bg-black/40 border-purple-700/40 text-white placeholder:text-gray-600"
                  min="0.01"
                  step="0.1"
                />
                <Button
                  onClick={handleDeposit}
                  disabled={depositLoading || !depositAmount || parseFloat(depositAmount) <= 0}
                  className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold rounded-xl"
                >
                  {depositLoading ? <><RefreshCw className="w-3 h-3 animate-spin mr-1" /> Processing…</> : "Deposit"}
                </Button>
              </div>

              {/* Withdraw */}
              <div className="bg-[#1a0f2e] border border-purple-700/30 rounded-2xl p-5 space-y-3">
                <h3 className="font-semibold flex items-center gap-2 text-gray-200">
                  <ArrowUpFromLine className="w-4 h-4 text-red-400" />
                  Withdraw Deposit
                </h3>
                <p className="text-xs text-gray-400">Withdraw your full deposited amount back to your wallet at any time.</p>
                <div className="bg-black/30 rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-500 mb-0.5">Available</div>
                  <div className="font-bold text-white">{fmt(partner?.depositedSol ?? "0", 4)} SOL</div>
                </div>
                <Button
                  onClick={() => withdrawMutation.mutate()}
                  disabled={withdrawMutation.isPending || deposited <= 0}
                  className="w-full bg-red-700 hover:bg-red-600 text-white font-semibold rounded-xl"
                >
                  {withdrawMutation.isPending ? <><RefreshCw className="w-3 h-3 animate-spin mr-1" /> Processing…</> : "Withdraw All"}
                </Button>
              </div>

              {/* Auto-Pay Status */}
              <div className="bg-[#1a0f2e] border border-green-500/40 rounded-2xl p-5 space-y-3 shadow-[0_0_20px_rgba(34,197,94,0.07)]">
                <h3 className="font-semibold flex items-center gap-2 text-gray-200">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  Auto-Pay Active
                </h3>
                <p className="text-xs text-gray-400">Your share of every coin flip fee is sent directly to your wallet automatically — no action needed.</p>

                <div className="bg-green-900/15 border border-green-700/30 rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-400 mb-1">Total Fees Earned</div>
                  <div className="font-bold text-2xl text-green-400">{fmt(partner?.totalEarned ?? "0", 6)} SOL</div>
                </div>

              </div>
            </div>

            {/* How it works */}
            <div className="bg-purple-900/10 border border-purple-700/20 rounded-2xl p-5">
              <h3 className="font-semibold text-gray-300 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-400" />
                How it works
              </h3>
              <div className="grid md:grid-cols-3 gap-4 text-sm">
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-purple-700/60 text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">1</div>
                  <div>
                    <div className="text-gray-200 font-medium mb-0.5">Deposit SOL</div>
                    <div className="text-gray-500 text-xs">Send any amount to the vault. Your share percentage is calculated proportionally based on your deposit.</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-purple-700/60 text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">2</div>
                  <div>
                    <div className="text-gray-200 font-medium mb-0.5">Earn Per Flip</div>
                    <div className="text-gray-500 text-xs">Every coin flip sends a 3.5% fee to the fees wallet. 70% of that is instantly split among all partners.</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-purple-700/60 text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">3</div>
                  <div>
                    <div className="text-gray-200 font-medium mb-0.5">Auto-Paid to Wallet</div>
                    <div className="text-gray-500 text-xs">Your earnings are sent directly to your wallet automatically after each flip. Nothing to click.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Transaction History */}
            {txHistory && txHistory.filter(tx => tx.txType === "deposit" || tx.txType === "withdraw").length > 0 && (
              <div className="bg-[#1a0f2e] border border-purple-700/30 rounded-2xl p-5">
                <h3 className="font-semibold text-gray-300 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-purple-400" />
                  Transaction History
                </h3>
                <div className="space-y-2">
                  {txHistory.filter(tx => tx.txType === "deposit" || tx.txType === "withdraw").map(tx => (
                    <div key={tx.id} className="flex items-center justify-between py-2 border-b border-purple-900/30 last:border-0">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        <div>
                          <div className={`text-sm font-medium ${txColor(tx.txType)}`}>{txLabel(tx.txType)}</div>
                          <div className="text-xs text-gray-600">{new Date(tx.createdAt).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-white">{fmt(tx.amountSol, 5)} SOL</div>
                        {tx.signature && (
                          <a
                            href={`https://solscan.io/tx/${tx.signature}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-purple-400 hover:text-purple-300"
                          >
                            {tx.signature.slice(0, 8)}…
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
