import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { ArrowLeft, TrendingUp, Users, Vault, Coins, ArrowDownToLine, ArrowUpFromLine, BadgeDollarSign, Clock, CheckCircle2, RefreshCw } from "lucide-react";

const VAULT_WALLET = "GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY || ""}`;

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
    case "fee_credit": return "Fee Credit";
    case "fee_claim": return "Fee Claim";
    default: return type;
  }
}

function txColor(type: string) {
  switch (type) {
    case "deposit": return "text-green-400";
    case "withdraw": return "text-red-400";
    case "fee_credit": return "text-yellow-400";
    case "fee_claim": return "text-purple-400";
    default: return "text-gray-400";
  }
}

export default function PartnersPage() {
  const { publicKey, signTransaction } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [depositAmount, setDepositAmount] = useState("");
  const [depositLoading, setDepositLoading] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery<{ totalDeposited: string; partnerCount: number }>({
    queryKey: ["/api/vault/stats"],
    refetchInterval: 30000,
  });

  const { data: partnerData, isLoading: partnerLoading } = useQuery<{
    partner: { depositedSol: string; claimableFees: string; totalEarned: string } | null;
    sharePercent: string;
    totalDeposited: string;
    partnerCount: number;
  }>({
    queryKey: ["/api/vault/partner", wallet],
    enabled: !!wallet,
    refetchInterval: 15000,
  });

  const { data: txHistory } = useQuery<Array<{
    id: string; txType: string; amountSol: string; signature: string | null; createdAt: string;
  }>>({
    queryKey: ["/api/vault/transactions", wallet],
    enabled: !!wallet,
    refetchInterval: 30000,
  });

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
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    setDepositLoading(true);
    try {
      const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${import.meta.env.VITE_HELIUS_API_KEY || ""}`;
      const connection = new Connection(rpcUrl, "confirmed");
      const lamports = BigInt(Math.floor(amount * LAMPORTS_PER_SOL));
      const tx = new Transaction();
      tx.add(SystemProgram.transfer({
        fromPubkey: new PublicKey(wallet),
        toPubkey: new PublicKey(VAULT_WALLET),
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
            {/* My Stats */}
            <div className="bg-gradient-to-br from-purple-900/30 to-indigo-900/20 border border-purple-600/30 rounded-2xl p-5 space-y-4">
              <h2 className="font-semibold text-gray-200 flex items-center gap-2">
                <BadgeDollarSign className="w-4 h-4 text-purple-400" />
                Your Position
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-black/30 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-400 mb-1">Deposited</div>
                  <div className="font-bold text-white">{partnerLoading ? "…" : `${fmt(partner?.depositedSol ?? "0", 3)} SOL`}</div>
                </div>
                <div className="bg-black/30 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-400 mb-1">Your Share</div>
                  <div className="font-bold text-purple-300">{partnerLoading ? "…" : `${parseFloat(sharePercent).toFixed(2)}%`}</div>
                </div>
                <div className="bg-black/30 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-400 mb-1">Claimable Fees</div>
                  <div className={`font-bold ${claimable > 0 ? "text-yellow-400" : "text-gray-400"}`}>
                    {partnerLoading ? "…" : `${fmt(partner?.claimableFees ?? "0", 5)} SOL`}
                  </div>
                </div>
                <div className="bg-black/30 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-400 mb-1">Total Earned</div>
                  <div className="font-bold text-green-400">{partnerLoading ? "…" : `${fmt(partner?.totalEarned ?? "0", 5)} SOL`}</div>
                </div>
              </div>
            </div>

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

              {/* Claim Fees */}
              <div className={`bg-[#1a0f2e] border rounded-2xl p-5 space-y-3 ${claimable > 0 ? "border-yellow-500/50 shadow-[0_0_20px_rgba(234,179,8,0.1)]" : "border-purple-700/30"}`}>
                <h3 className="font-semibold flex items-center gap-2 text-gray-200">
                  <Coins className={`w-4 h-4 ${claimable > 0 ? "text-yellow-400" : "text-gray-500"}`} />
                  Claim Fees
                </h3>
                <p className="text-xs text-gray-400">Claim your accumulated fee earnings. Fees are distributed every 24 hours.</p>
                <div className={`rounded-lg p-3 text-center ${claimable > 0 ? "bg-yellow-900/20 border border-yellow-700/30" : "bg-black/30"}`}>
                  <div className="text-xs text-gray-500 mb-0.5">Claimable</div>
                  <div className={`font-bold text-lg ${claimable > 0 ? "text-yellow-400" : "text-gray-500"}`}>
                    {fmt(partner?.claimableFees ?? "0", 6)} SOL
                  </div>
                </div>
                <Button
                  onClick={() => claimFeesMutation.mutate()}
                  disabled={claimFeesMutation.isPending || claimable <= 0}
                  className={`w-full font-semibold rounded-xl ${claimable > 0 ? "bg-yellow-600 hover:bg-yellow-500 text-black" : "bg-gray-700 text-gray-500 cursor-not-allowed"}`}
                >
                  {claimFeesMutation.isPending ? <><RefreshCw className="w-3 h-3 animate-spin mr-1" /> Processing…</> : claimable > 0 ? "Claim Fees" : "No Fees Yet"}
                </Button>
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
                    <div className="text-gray-500 text-xs">Send any amount to the vault. Your share percentage is calculated proportionally.</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-purple-700/60 text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">2</div>
                  <div>
                    <div className="text-gray-200 font-medium mb-0.5">Earn Daily</div>
                    <div className="text-gray-500 text-xs">Every 24 hours, 20% of all platform fees are split among partners proportionally.</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-purple-700/60 text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">3</div>
                  <div>
                    <div className="text-gray-200 font-medium mb-0.5">Claim Anytime</div>
                    <div className="text-gray-500 text-xs">Press Claim Fees and the bot instantly sends your earned SOL to your wallet.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Transaction History */}
            {txHistory && txHistory.length > 0 && (
              <div className="bg-[#1a0f2e] border border-purple-700/30 rounded-2xl p-5">
                <h3 className="font-semibold text-gray-300 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-purple-400" />
                  Transaction History
                </h3>
                <div className="space-y-2">
                  {txHistory.map(tx => (
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
