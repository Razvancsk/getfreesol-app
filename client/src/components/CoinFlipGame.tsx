import { useState, useCallback } from 'react';
import { triggerFeedbackCard } from '@/components/FeedbackWidget';
import { useWalletAdapter } from '@/hooks/useWalletAdapter';
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createTransferInstruction, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import lossGif from '@assets/tenor_1773011576032.gif';

const GSOL_MINT = new PublicKey('GSoLRcWKQE5nbWTYFr83Ei3HGjnp9YzQNAFK6VAATg3');
const GSOL_DECIMALS = 9;

const TOKEN_ICONS: Record<string, string> = {
  sol: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
  gsol: '/gsol-token-logo.png?v=6',
};

const BET_AMOUNTS = [0.002, 0.01, 0.05, 0.1, 0.5, 1];
const ADMIN_ONLY_BET_AMOUNTS = new Set([0.1, 0.5, 1]);
const ADMIN_WALLET = 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT';

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff} sec ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)} day ago`;
}



const LOSS_MEMES = [
  "Better luck next time fucker.",
  "You absolute clown.",
  "Skill issue.",
  "Your ancestors are disappointed.",
  "ngmi.",
  "Bro really thought.",
  "Touch grass, then try again.",
  "The coin said no lmaooo",
  "Delete your wallet.",
  "It's not the coin's fault.",
  "Have you tried being less poor?",
  "Rekt. Stay rekt.",
  "Even the vault feels bad for you.",
  "L + ratio + no SOL.",
  "Imagine losing 50/50. Couldn't be me.",
];

function getLossMeme(): string {
  return LOSS_MEMES[Math.floor(Math.random() * LOSS_MEMES.length)];
}

function playWinSound() {
  try {
    const ctx = new AudioContext();
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.12 + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.3);
    });
  } catch {}
}

function playLoseSound() {
  try {
    const ctx = new AudioContext();
    const notes = [400, 300, 200];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.25);
    });
  } catch {}
}

export function CoinFlipGame() {
  const { publicKey, signTransaction, connected, connection } = useWalletAdapter();
  const { toast } = useToast();
  const [choice, setChoice] = useState<'heads' | 'tails'>('heads');
  const [betToken, setBetToken] = useState<'sol' | 'gsol'>('sol');
  const [betAmount, setBetAmount] = useState<number | null>(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipResult, setFlipResult] = useState<{ result: string; won: boolean; payoutAmount: number } | null>(null);
  const [coinRotation, setCoinRotation] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [ledgerTab, setLedgerTab] = useState<'recent' | 'top'>('recent');

  const vaultQuery = useQuery<{ success: boolean; address: string; balance: number }>({
    queryKey: ['/api/coinflip/vault'],
    refetchInterval: 30000,
  });

  const topQuery = useQuery<{ success: boolean; top: { walletAddress: string; totalDoubled: string; wins: number }[] }>({
    queryKey: ['/api/coinflip/top'],
    refetchInterval: 5000,
  });

  const recentQuery = useQuery<{ success: boolean; flips: any[] }>({
    queryKey: ['/api/coinflip/recent'],
    refetchInterval: 5000,
  });

  const rakebackQuery = useQuery<{ pendingGsol: number; totalEarned: number; totalClaimed: number }>({
    queryKey: ['/api/rakeback', publicKey?.toString()],
    queryFn: async () => {
      if (!publicKey) return { pendingGsol: 0, totalEarned: 0, totalClaimed: 0 };
      const res = await fetch(`/api/rakeback/${publicKey.toString()}`);
      return res.json();
    },
    enabled: !!publicKey,
    refetchInterval: 15000,
  });

  const [isClaiming, setIsClaiming] = useState(false);

  const handleClaimRakeback = async () => {
    if (!publicKey || isClaiming) return;
    setIsClaiming(true);
    try {
      const res = await fetch('/api/rakeback/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: publicKey.toString() }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: `✅ Claimed ${data.claimedGsol.toFixed(6)} GSOL rakeback!` });
        queryClient.invalidateQueries({ queryKey: ['/api/rakeback', publicKey.toString()] });
      } else {
        toast({ title: 'Claim failed', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Network error', variant: 'destructive' });
    } finally {
      setIsClaiming(false);
    }
  };

  const vaultAddress = (vaultQuery.data as any)?.address || '';
  const vaultBalance = (vaultQuery.data as any)?.balance || 0;
  const vaultGsolBalance = (vaultQuery.data as any)?.gsolBalance || 0;
  const feesWallet = (vaultQuery.data as any)?.feesWallet || '';
  const displayBalance = betToken === 'gsol' ? vaultGsolBalance : vaultBalance;

  const flipMutation = useMutation({
    mutationFn: async ({ walletAddress, betAmount, choice, betTxSignature, betToken }: any) => {
      const resp = await apiRequest('POST', '/api/coinflip/play', {
        walletAddress,
        betAmount,
        choice,
        betTxSignature,
        betToken,
      });
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/coinflip/recent'] });
      queryClient.invalidateQueries({ queryKey: ['/api/coinflip/top'] });
      queryClient.invalidateQueries({ queryKey: ['/api/coinflip/vault'] });
    },
  });

  const handleFlip = useCallback(async () => {
    if (!publicKey || !connected) {
      toast({ title: 'Connect your wallet first', variant: 'destructive' });
      return;
    }

    if (!vaultAddress) {
      toast({ title: 'Game vault loading, please wait...', variant: 'destructive' });
      return;
    }

    if (betAmount === null) {
      toast({ title: 'Select a bet amount first', variant: 'destructive' });
      return;
    }

    const FEE_RATE = 0.035;
    const feeAmount = betAmount * FEE_RATE;
    const maxPayout = betAmount * 2; // win = full 2x bet

    if (displayBalance > 0 && displayBalance < maxPayout) {
      toast({ title: 'Vault balance too low for this bet', description: `Vault has ${displayBalance.toFixed(4)} ${betToken.toUpperCase()} but needs ${maxPayout.toFixed(4)} ${betToken.toUpperCase()} to cover a win. Try a smaller bet.`, variant: 'destructive' });
      return;
    }

    setIsFlipping(true);
    setFlipResult(null);
    setShowResult(false);

    let spinInterval: ReturnType<typeof setInterval> | null = null;

    try {
      const vaultPubkey = new PublicKey(vaultAddress);
      let transaction: Transaction;

      if (betToken === 'gsol') {
        // ── GSOL bet: bet to vault + 3.5% fee to fees wallet ─────────────────
        const userGsolATA  = getAssociatedTokenAddressSync(GSOL_MINT, publicKey);
        const vaultGsolATA = getAssociatedTokenAddressSync(GSOL_MINT, vaultPubkey);
        const betTokenAmount = BigInt(Math.floor(betAmount * 10 ** GSOL_DECIMALS));
        const feeTokenAmount = BigInt(Math.floor(feeAmount * 10 ** GSOL_DECIMALS));
        transaction = new Transaction().add(
          createTransferInstruction(userGsolATA, vaultGsolATA, publicKey, betTokenAmount, [], TOKEN_PROGRAM_ID)
        );
        if (feesWallet && feeTokenAmount > 0n) {
          const feesWalletPubkey = new PublicKey(feesWallet);
          const feesGsolATA = getAssociatedTokenAddressSync(GSOL_MINT, feesWalletPubkey);
          transaction
            .add(createAssociatedTokenAccountIdempotentInstruction(publicKey, feesGsolATA, feesWalletPubkey, GSOL_MINT))
            .add(createTransferInstruction(userGsolATA, feesGsolATA, publicKey, feeTokenAmount, [], TOKEN_PROGRAM_ID));
        }
      } else {
        // ── SOL bet: SOL + fee transfers ──────────────────────────────────────
        const betLamports = Math.floor(betAmount * LAMPORTS_PER_SOL);
        const feeLamports = Math.floor(feeAmount * LAMPORTS_PER_SOL);
        transaction = new Transaction().add(SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: vaultPubkey, lamports: betLamports }));
        if (feesWallet) {
          transaction.add(SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: new PublicKey(feesWallet), lamports: feeLamports }));
        }
      }

      const bhResp = await fetch('/api/blockhash');
      if (!bhResp.ok) throw new Error('Failed to get blockhash from server');
      const { blockhash } = await bhResp.json();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      console.log('Signing bet transaction to vault:', vaultAddress);
      let signature: string;
      try {
        const signed = await signTransaction(transaction);
        console.log('Transaction signed, sending...');
        const serialized = signed.serialize();
        const sendResp = await fetch('/api/send-transaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transaction: Buffer.from(serialized).toString('base64') }),
        });
        const sendData = await sendResp.json();
        if (!sendData.signature) throw new Error(sendData.error || 'Failed to send transaction');
        signature = sendData.signature;
      } catch (signErr: any) {
        console.error('Sign/send error:', signErr);
        if (signErr?.message?.includes('User rejected') || signErr?.message?.includes('cancelled')) {
          throw new Error('Transaction cancelled by user');
        }
        throw new Error(signErr?.message || 'Failed to sign or send transaction');
      }
      console.log(`Bet transaction sent: ${signature}`);

      let rotations = 0;
      spinInterval = setInterval(() => {
        rotations += 30;
        setCoinRotation(rotations);
      }, 50);

      const resultPromise = flipMutation.mutateAsync({
        walletAddress: publicKey.toString(),
        betAmount,
        choice,
        betTxSignature: signature,
        betToken,
      });

      const minAnimMs = 1500;
      const animStart = Date.now();
      const result = await resultPromise;
      const elapsed = Date.now() - animStart;
      if (elapsed < minAnimMs) {
        await new Promise(r => setTimeout(r, minAnimMs - elapsed));
      }

      clearInterval(spinInterval);

      setIsFlipping(false);
      const finalRotation = result.result === 'heads' ? 3600 : 3780;
      setCoinRotation(finalRotation);

      setTimeout(() => {
        if (result.won) {
          playWinSound();
        } else {
          playLoseSound();
        }
        setFlipResult(result);
        setShowResult(true);
        triggerFeedbackCard(publicKey?.toString());
      }, 800);
    } catch (err: any) {
      console.error('Coin flip error:', err);
      setIsFlipping(false);
      const errorMsg = err?.message || 'Transaction failed';
      const shortMsg = errorMsg.length > 120 ? errorMsg.substring(0, 120) + '...' : errorMsg;
      toast({
        title: 'Flip failed',
        description: shortMsg,
        variant: 'destructive',
      });
    } finally {
      if (spinInterval) clearInterval(spinInterval);
      setIsFlipping(false);
    }
  }, [publicKey, connected, betAmount, choice, signTransaction, connection, toast, flipMutation, vaultAddress, vaultBalance]);

  const headsBg = 'conic-gradient(from 0deg, #7c3aed, #a78bfa, #6d28d9, #a78bfa, #7c3aed, #5b21b6, #a78bfa, #7c3aed)';
  const headsInner = 'conic-gradient(from 180deg, #6d28d9, #a78bfa, #5b21b6, #a78bfa, #6d28d9, #7c3aed, #a78bfa, #6d28d9)';
  const headsCenter = 'radial-gradient(ellipse at 40% 35%, #c084fc 0%, #a855f7 30%, #8b5cf6 55%, #7c3aed 100%)';
  const coinShadow = '0 6px 20px rgba(0,0,0,0.6), 0 0 30px rgba(124, 58, 237, 0.4)';

  return (
    <div className="max-w-lg mx-auto space-y-4">

      {/* Coin */}
      <div className="flex flex-col items-center py-6">
        <div
          className="w-40 h-40 relative mb-4"
          style={{ perspective: '600px', WebkitPerspective: '600px' }}
        >
          <div
            className="w-full h-full rounded-full relative"
            style={{
              transform: `rotateY(${coinRotation}deg)`,
              WebkitTransform: `rotateY(${coinRotation}deg)`,
              transition: isFlipping ? 'none' : 'transform 2s cubic-bezier(0.22, 0.8, 0.36, 1)',
              transformStyle: 'preserve-3d',
              WebkitTransformStyle: 'preserve-3d',
              willChange: 'transform',
            }}
          >
            {/* HEADS face */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: headsBg,
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                transform: 'translateZ(1px)',
                WebkitTransform: 'translateZ(1px)',
                boxShadow: coinShadow,
              }}
            >
              <div className="absolute inset-0 rounded-full" style={{
                background: 'linear-gradient(145deg, rgba(255,255,255,0.3) 0%, transparent 35%, transparent 65%, rgba(0,0,0,0.3) 100%)',
              }} />
              <div className="absolute rounded-full" style={{
                inset: '10px',
                background: headsInner,
                boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.25), inset 0 -2px 4px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.4)',
              }}>
                <div className="absolute rounded-full flex items-center justify-center" style={{
                  inset: '6px',
                  background: headsCenter,
                  boxShadow: 'inset 0 3px 6px rgba(255,255,255,0.15), inset 0 -3px 8px rgba(0,0,0,0.25)',
                }}>
                  <div className="absolute inset-0 rounded-full" style={{
                    background: 'linear-gradient(150deg, rgba(255,255,255,0.2) 0%, transparent 45%)',
                  }} />
                  <svg className="w-20 h-20 relative z-10" viewBox="0 0 397.7 311.7" style={{ fill: '#00FFA3', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}>
                    <path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"/>
                    <path d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1L333.1,73.8c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"/>
                    <path d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z"/>
                  </svg>
                </div>
              </div>
            </div>
            {/* TAILS face */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: headsBg,
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                transform: 'rotateY(180deg) translateZ(1px)',
                WebkitTransform: 'rotateY(180deg) translateZ(1px)',
                boxShadow: coinShadow,
              }}
            >
              <div className="absolute inset-0 rounded-full" style={{
                background: 'linear-gradient(145deg, rgba(255,255,255,0.3) 0%, transparent 35%, transparent 65%, rgba(0,0,0,0.3) 100%)',
              }} />
              <div className="absolute rounded-full" style={{
                inset: '10px',
                background: headsInner,
                boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.25), inset 0 -2px 4px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.4)',
              }}>
                <div className="absolute rounded-full flex items-center justify-center" style={{
                  inset: '6px',
                  background: headsCenter,
                  boxShadow: 'inset 0 3px 6px rgba(255,255,255,0.15), inset 0 -3px 8px rgba(0,0,0,0.25)',
                }}>
                  <div className="absolute inset-0 rounded-full" style={{
                    background: 'linear-gradient(150deg, rgba(255,255,255,0.2) 0%, transparent 45%)',
                  }} />
                  <svg className="w-20 h-20 relative z-10" viewBox="0 0 397.7 311.7" style={{ fill: '#ef4444', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}>
                    <path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"/>
                    <path d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1L333.1,73.8c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"/>
                    <path d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Result */}
        {showResult && flipResult && (
          <div className="text-center space-y-2">
            <div className={`text-2xl font-black uppercase tracking-wider ${flipResult.won ? 'text-green-400' : 'text-red-400'}`}>
              {flipResult.won ? 'YOU WON' : 'YOU LOST'}
            </div>
            <div className={`text-xl font-bold ${flipResult.won ? 'text-green-400' : 'text-red-400'}`}>
              {flipResult.won
                ? `${flipResult.payoutAmount.toFixed(4)} ${betToken.toUpperCase()}`
                : `-${((betAmount ?? 0) * (betToken === 'sol' ? 1.035 : 1)).toFixed(6)} ${betToken.toUpperCase()}`}
            </div>
          </div>
        )}
      </div>

      {/* Token selector */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-xl border border-purple-500/30 bg-purple-900/30 p-1 gap-1">
          {(['sol', 'gsol'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setBetToken(t); setBetAmount(null); }}
              disabled={isFlipping}
              className={`px-5 py-2 rounded-lg font-bold text-sm uppercase tracking-wider transition-all ${
                betToken === t
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-500/30'
                  : 'text-purple-300 hover:text-white hover:bg-purple-800/40'
              }`}
            >
              <img src={TOKEN_ICONS[t]} alt={t.toUpperCase()} className="w-7 h-7 rounded-full object-cover" />
            </button>
          ))}
        </div>
      </div>

      {/* I LIKE */}
      <div className="text-center">
        <p className="text-gray-300 font-bold text-lg tracking-widest uppercase mb-3">I Like</p>
        <div className="flex gap-3 justify-center max-w-xs mx-auto">
          <button
            onClick={() => setChoice('heads')}
            disabled={isFlipping}
            className={`flex-1 py-3 rounded-xl font-black text-lg uppercase tracking-wider transition-all border-2 ${
              choice === 'heads'
                ? 'bg-green-600 text-white border-green-400 shadow-lg shadow-green-500/30'
                : 'bg-green-900/30 text-green-300 border-green-500/30 hover:bg-green-800/40 hover:border-green-400/60'
            }`}
          >
            Green
          </button>
          <button
            onClick={() => setChoice('tails')}
            disabled={isFlipping}
            className={`flex-1 py-3 rounded-xl font-black text-lg uppercase tracking-wider transition-all border-2 ${
              choice === 'tails'
                ? 'bg-red-600 text-white border-red-400 shadow-lg shadow-red-500/30'
                : 'bg-red-900/30 text-red-300 border-red-500/30 hover:bg-red-800/40 hover:border-red-400/60'
            }`}
          >
            Red
          </button>
        </div>
      </div>

      {/* FOR */}
      <div className="text-center">
        <p className="text-gray-300 font-bold text-lg tracking-widest uppercase mb-3">For</p>
        <div className="grid grid-cols-3 gap-2 max-w-sm mx-auto">
          {BET_AMOUNTS.filter(a => !ADMIN_ONLY_BET_AMOUNTS.has(a) || publicKey?.toBase58() === ADMIN_WALLET).map((amount) => {
            const tooHighForVault = displayBalance > 0 && displayBalance < amount * 2;
            return (
              <button
                key={amount}
                onClick={() => setBetAmount(amount)}
                disabled={isFlipping || tooHighForVault}
                className={`py-3 px-2 rounded-xl font-bold text-sm uppercase transition-all border-2 ${
                  tooHighForVault
                    ? 'bg-gray-800/50 text-gray-500 border-gray-600/30 cursor-not-allowed opacity-50'
                    : betAmount === amount
                    ? 'bg-purple-600 text-white border-purple-400 shadow-lg shadow-purple-500/30'
                    : 'bg-purple-900/30 text-purple-300 border-purple-500/30 hover:bg-purple-800/40 hover:border-purple-400/60'
                }`}
                title={tooHighForVault && betToken === 'sol' ? `Vault needs ${(amount * 2).toFixed(2)} SOL to cover this bet` : ''}
              >
                {amount} {betToken.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      {/* DOUBLE OR NOTHING button */}
      <div className="pt-2">
        <button
          onClick={handleFlip}
          disabled={isFlipping || !connected || betAmount === null}
          className={`w-full py-4 rounded-xl font-black text-xl uppercase tracking-wider transition-all border-2 ${
            isFlipping
              ? 'bg-purple-600/50 text-white/50 border-purple-400/50 cursor-not-allowed'
              : betAmount === null
              ? 'bg-gradient-to-r from-purple-600 to-purple-500 text-white border-purple-400 opacity-40 cursor-not-allowed'
              : connected
              ? 'bg-gradient-to-r from-purple-600 to-purple-500 text-white border-purple-400 hover:from-purple-500 hover:to-purple-400 hover:shadow-lg hover:shadow-purple-500/40 active:scale-[0.98]'
              : 'bg-gray-700 text-gray-400 border-gray-600 cursor-not-allowed'
          }`}
        >
          {isFlipping ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin" /> Flipping...
            </span>
          ) : !connected ? (
            'Connect Wallet'
          ) : (
            'Double or Nothing'
          )}
        </button>
      </div>

      {/* Bankroll */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-gray-300 font-bold text-sm">Total Bankroll Value</p>
          {publicKey?.toString() === 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT' && (
            <a href="/admin/vault" className="text-purple-400 text-sm font-bold hover:text-purple-300">Manage</a>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-purple-500/30 bg-[#1a1035] px-4 py-3">
          <div className="w-10 h-10 rounded-lg bg-purple-700 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" viewBox="0 0 16 15" fill="white" xmlns="http://www.w3.org/2000/svg">
              <path d="M0 3.34646C0 3.13804 0.129286 2.95148 0.324438 2.8783L7.67842 0.120556C7.88683 0.0424007 8.11536 0.036013 8.32782 0.102405L15.6491 2.39032C15.8579 2.45555 16 2.64887 16 2.86756V4.49996C16 4.7761 15.7761 4.99996 15.5 4.99996H0.5C0.223858 4.99996 0 4.7761 0 4.49996V3.34646Z" />
              <path d="M9 7.49996C9 7.22382 9.22386 6.99996 9.5 6.99996H10.5C10.7761 6.99996 11 7.22382 11 7.49996V12H13V7.49996C13 7.22382 13.2239 6.99996 13.5 6.99996H14.5C14.7761 6.99996 15 7.22382 15 7.49996V13H15.5C15.7761 13 16 13.2238 16 13.5V14.5C16 14.7761 15.7761 15 15.5 15H0.5C0.223858 15 0 14.7761 0 14.5V13.5C0 13.2238 0.223858 13 0.5 13H1V7.49996C1 7.22382 1.22386 6.99996 1.5 6.99996H2.5C2.77614 6.99996 3 7.22382 3 7.49996V12H5V7.49996C5 7.22382 5.22386 6.99996 5.5 6.99996H6.5C6.77614 6.99996 7 7.22382 7 7.49996V12H9V7.49996Z" />
            </svg>
          </div>
          <span className="text-white font-bold text-xl flex-1">{displayBalance.toFixed(4)} {betToken.toUpperCase()}</span>
          <svg className="w-6 h-6" viewBox="0 0 397.7 311.7" style={{ fill: '#14F195' }}>
            <path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"/>
            <path d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1L333.1,73.8c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"/>
            <path d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z"/>
          </svg>
        </div>
        <p className="text-center text-xs text-white mt-2">Win = 2x your bet · 3.5% fee charged upfront</p>
      </div>

      {/* Rakeback */}
      {publicKey && (
        <div className="rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-900/40 to-purple-800/20 px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-white font-bold text-sm uppercase tracking-widest">Rakeback</p>
            <div className="flex items-center gap-1.5">
              <img src={TOKEN_ICONS['gsol']} className="w-4 h-4 rounded-full" alt="GSOL" />
              <span className="text-green-400 font-black text-lg">
                {(rakebackQuery.data?.pendingGsol ?? 0).toFixed(6)} GSOL
              </span>
            </div>
          </div>
          <button
            onClick={handleClaimRakeback}
            disabled={isClaiming || !rakebackQuery.data?.pendingGsol || rakebackQuery.data.pendingGsol < 0.001}
            className="w-full py-2.5 rounded-lg font-bold text-sm uppercase tracking-wider transition-all bg-green-400 text-black hover:bg-green-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isClaiming ? 'Claiming…' : (rakebackQuery.data?.pendingGsol ?? 0) >= 0.001 ? 'Claim' : 'Minimum 0.001 GSOL to claim'}
          </button>
        </div>
      )}

      {/* Plays Ledger with Tabs */}
      <div className="mt-6 bg-gradient-to-br from-purple-800/20 to-purple-900/30 border border-purple-500/20 backdrop-blur-sm rounded-xl p-6">
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setLedgerTab('recent')}
            className={`flex-1 py-2 px-4 rounded-lg font-bold text-sm uppercase tracking-wider transition-colors ${
              ledgerTab === 'recent'
                ? 'bg-purple-600 text-white'
                : 'bg-purple-900/40 text-purple-300 hover:bg-purple-800/40'
            }`}
            data-testid="button-tab-recent"
          >
            Recent Plays
          </button>
          <button
            onClick={() => setLedgerTab('top')}
            className={`flex-1 py-2 px-4 rounded-lg font-bold text-sm uppercase tracking-wider transition-colors ${
              ledgerTab === 'top'
                ? 'bg-purple-600 text-white'
                : 'bg-purple-900/40 text-purple-300 hover:bg-purple-800/40'
            }`}
            data-testid="button-tab-top"
          >
            Top
          </button>
        </div>

        {ledgerTab === 'recent' ? (
          <div className="overflow-x-auto">
            <div className="min-w-full">
              <div className="grid grid-cols-4 gap-4 mb-4 pb-3 border-b border-purple-500/30">
                <div className="text-sm font-semibold uppercase tracking-wider text-purple-200">WALLET/TX</div>
                <div className="text-sm font-semibold uppercase tracking-wider text-purple-200 text-center">BET</div>
                <div className="text-sm font-semibold uppercase tracking-wider text-purple-200 text-center">RESULT</div>
                <div className="text-sm font-semibold uppercase tracking-wider text-purple-200 text-center">AGE</div>
              </div>
              {recentQuery.isLoading && (
                <div className="text-center text-purple-300 py-8">Loading...</div>
              )}
              {!recentQuery.isLoading && (recentQuery.data?.flips ?? []).length === 0 && (
                <div className="text-center text-purple-300 py-8">No flips yet — be the first!</div>
              )}
              {(recentQuery.data?.flips ?? []).slice(0, 10).map((flip: any) => (
                <div key={flip.id}>
                  <div
                    className="grid grid-cols-4 gap-4 py-3 transition-colors cursor-pointer hover:bg-purple-800/20 rounded-lg border border-transparent hover:border-purple-500/30"
                    onClick={() => flip.betTxSignature && window.open(`https://solscan.io/tx/${flip.betTxSignature}`, '_blank')}
                    title="Click to view on Solscan"
                  >
                    <div className="text-white font-mono text-sm truncate" title={flip.walletAddress}>
                      {flip.walletAddress.slice(0, 8)}...{flip.walletAddress.slice(-8)}
                    </div>
                    <div className="text-white text-center text-sm font-semibold">
                      {parseFloat(flip.betAmount).toFixed(4)} {(flip.betToken || 'sol').toUpperCase()}
                    </div>
                    <div className={`text-center text-sm font-bold ${flip.won ? 'text-green-400' : 'text-red-400'}`}>
                      {flip.won ? 'Doubled' : 'Rugged'}
                    </div>
                    <div className="text-white text-center text-sm">
                      {timeAgo(flip.createdAt)}
                    </div>
                  </div>
                  <div className="border-b border-purple-500/10" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-full">
              <div className="grid grid-cols-12 gap-2 mb-4 pb-3 border-b border-purple-500/30">
                <div className="col-span-1 text-sm font-semibold uppercase tracking-wider text-purple-200">#</div>
                <div className="col-span-6 text-sm font-semibold uppercase tracking-wider text-purple-200">WALLET</div>
                <div className="col-span-3 text-sm font-semibold uppercase tracking-wider text-purple-200 text-center">DOUBLED</div>
                <div className="col-span-2 text-sm font-semibold uppercase tracking-wider text-purple-200 text-center">WINS</div>
              </div>
              {topQuery.isLoading && (
                <div className="text-center text-purple-300 py-8">Loading...</div>
              )}
              {!topQuery.isLoading && (topQuery.data?.top ?? []).length === 0 && (
                <div className="text-center text-purple-300 py-8">No doublers yet — be the first!</div>
              )}
              {(topQuery.data?.top ?? []).map((u, i) => (
                <div key={u.walletAddress}>
                  <div className="grid grid-cols-12 gap-2 py-3 items-center">
                    <div className="col-span-1 text-white font-bold text-sm">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </div>
                    <div className="col-span-6 text-white font-mono text-sm truncate" title={u.walletAddress}>
                      {u.walletAddress.slice(0, 8)}...{u.walletAddress.slice(-6)}
                    </div>
                    <div className="col-span-3 text-green-400 text-center text-sm font-bold">
                      {parseFloat(u.totalDoubled).toFixed(4)} SOL
                    </div>
                    <div className="col-span-2 text-white text-center text-sm">
                      {u.wins}
                    </div>
                  </div>
                  <div className="border-b border-purple-500/10" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
