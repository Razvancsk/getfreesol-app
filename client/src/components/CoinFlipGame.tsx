import { useState, useCallback, useRef } from 'react';
import { useWalletAdapter } from '@/hooks/useWalletAdapter';
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const BET_AMOUNTS = [0.00176, 0.01, 0.05, 0.10, 0.25, 0.50];

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

function playBonusSound() {
  try {
    const ctx = new AudioContext();
    const notes = [523, 659, 784, 1047, 1319, 1568];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.35, ctx.currentTime + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.1 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.1);
      osc.stop(ctx.currentTime + i * 0.1 + 0.4);
    });
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'square';
    osc2.frequency.value = 1568;
    gain2.gain.setValueAtTime(0.1, ctx.currentTime + 0.6);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.2);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.6);
    osc2.stop(ctx.currentTime + 1.2);
  } catch {}
}

function playBonusSpinWin() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  } catch {}
}


export function CoinFlipGame() {
  const { publicKey, signTransaction, connected, connection } = useWalletAdapter();
  const { toast } = useToast();
  const [choice, setChoice] = useState<'heads' | 'tails'>('heads');
  const [betAmount, setBetAmount] = useState(0.00176);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipResult, setFlipResult] = useState<{ result: string; won: boolean; payoutAmount: number } | null>(null);
  const [coinRotation, setCoinRotation] = useState(0);
  const [showResult, setShowResult] = useState(false);

  const [bonusMode, setBonusMode] = useState(false);
  const [bonusSessionId, setBonusSessionId] = useState<string | null>(null);
  const [bonusSpinsLeft, setBonusSpinsLeft] = useState(0);
  const [bonusTotalWon, setBonusTotalWon] = useState(0);
  const [bonusInstantWin, setBonusInstantWin] = useState(0);
  const [bonusBetAmount, setBonusBetAmount] = useState(0);
  const [bonusSpinResult, setBonusSpinResult] = useState<{ result: string; won: boolean; spinPayout: number } | null>(null);
  const [showBonusSpinResult, setShowBonusSpinResult] = useState(false);
  const [bonusComplete, setBonusComplete] = useState(false);
  const [bonusPayoutTx, setBonusPayoutTx] = useState<string | null>(null);
  const [isBonusSpinning, setIsBonusSpinning] = useState(false);
  const [showBonusIntro, setShowBonusIntro] = useState(false);
  const spinIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const vaultQuery = useQuery<{ success: boolean; address: string; balance: number }>({
    queryKey: ['/api/coinflip/vault'],
    refetchInterval: 30000,
  });

  const vaultAddress = (vaultQuery.data as any)?.address || '';
  const vaultBalance = (vaultQuery.data as any)?.balance || 0;

  const flipMutation = useMutation({
    mutationFn: async ({ walletAddress, betAmount, choice, betTxSignature }: any) => {
      const resp = await apiRequest('POST', '/api/coinflip/play', {
        walletAddress,
        betAmount,
        choice,
        betTxSignature,
      });
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/coinflip/recent'] });
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

    const maxPayout = betAmount * 2;
    if (vaultBalance < maxPayout) {
      toast({ title: 'Vault balance too low for this bet', description: `Vault has ${vaultBalance.toFixed(4)} SOL but needs ${maxPayout.toFixed(4)} SOL to cover a win. Try a smaller bet.`, variant: 'destructive' });
      return;
    }

    setIsFlipping(true);
    setFlipResult(null);
    setShowResult(false);

    try {
      const lamports = Math.floor(betAmount * LAMPORTS_PER_SOL);
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(vaultAddress),
          lamports,
        })
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      console.log('Signing bet transaction to vault:', vaultAddress);
      let signature: string;
      try {
        const signed = await signTransaction(transaction);
        console.log('Transaction signed, sending...');
        const serialized = signed.serialize();
        signature = await connection.sendRawTransaction(serialized, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
      } catch (signErr: any) {
        console.error('Sign/send error:', signErr);
        if (signErr?.message?.includes('User rejected') || signErr?.message?.includes('cancelled')) {
          throw new Error('Transaction cancelled by user');
        }
        throw new Error(signErr?.message || 'Failed to sign or send transaction');
      }
      console.log(`Bet transaction sent: ${signature}`);

      let rotations = 0;
      const spinInterval = setInterval(() => {
        rotations += 30;
        setCoinRotation(rotations);
      }, 50);

      const resultPromise = flipMutation.mutateAsync({
        walletAddress: publicKey.toString(),
        betAmount,
        choice,
        betTxSignature: signature,
      });

      const minAnimMs = 1500;
      const animStart = Date.now();
      const result = await resultPromise;
      const elapsed = Date.now() - animStart;
      if (elapsed < minAnimMs) {
        await new Promise(r => setTimeout(r, minAnimMs - elapsed));
      }

      clearInterval(spinInterval);

      if (result.bonus) {
        setIsFlipping(false);
        setCoinRotation(0);
        playBonusSound();
        setBonusMode(true);
        setShowBonusIntro(true);
        setBonusSessionId(result.bonusSessionId);
        setBonusSpinsLeft(result.freeSpins);
        setBonusTotalWon(0);
        setBonusInstantWin(result.instantWin || 0);
        setBonusBetAmount(result.betAmount);
        setBonusComplete(false);
        setBonusPayoutTx(null);
        setBonusSpinResult(null);
        setShowBonusSpinResult(false);
        return;
      }

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
    }
  }, [publicKey, connected, betAmount, choice, signTransaction, connection, toast, flipMutation, vaultAddress, vaultBalance]);

  const handleBonusSpin = useCallback(async () => {
    if (!bonusSessionId || bonusSpinsLeft <= 0 || isBonusSpinning) return;

    setIsBonusSpinning(true);
    setBonusSpinResult(null);
    setShowBonusSpinResult(false);

    let rotations = 0;
    spinIntervalRef.current = setInterval(() => {
      rotations += 30;
      setCoinRotation(rotations);
    }, 50);

    try {
      const resp = await apiRequest('POST', '/api/coinflip/free-spin', {
        bonusSessionId,
        choice,
        walletAddress: publicKey?.toString(),
      });
      const result = await resp.json();

      await new Promise(r => setTimeout(r, 1200));

      if (spinIntervalRef.current) clearInterval(spinIntervalRef.current);
      spinIntervalRef.current = null;

      const finalRotation = result.result === 'heads' ? 3600 : 3780;
      setCoinRotation(finalRotation);

      setTimeout(() => {
        if (result.won) {
          playBonusSpinWin();
        }
        setBonusSpinResult({ result: result.result, won: result.won, spinPayout: result.spinPayout });
        setShowBonusSpinResult(true);
        setBonusSpinsLeft(result.spinsLeft);
        setBonusTotalWon(result.totalWon);
        setIsBonusSpinning(false);

        if (result.isLastSpin) {
          setBonusPayoutTx(result.payoutTxSignature);
          if (result.payoutError) {
            toast({ title: 'Bonus payout issue', description: result.payoutError, variant: 'destructive' });
          }
          setTimeout(() => {
            if (result.totalWon > 0 && !result.payoutError) playWinSound();
            setBonusComplete(true);
          }, 1500);
        }
      }, 600);
    } catch (err: any) {
      if (spinIntervalRef.current) clearInterval(spinIntervalRef.current);
      spinIntervalRef.current = null;
      setIsBonusSpinning(false);
      console.error('Free spin error:', err);
      const errMsg = err?.message || '';
      if (errMsg.includes('Invalid') || errMsg.includes('expired')) {
        toast({ title: 'Bonus session expired', description: 'Returning to normal mode.', variant: 'destructive' });
        exitBonus();
        return;
      }
      toast({ title: 'Free spin failed', variant: 'destructive' });
    }
  }, [bonusSessionId, bonusSpinsLeft, choice, isBonusSpinning, toast]);

  const exitBonus = () => {
    setBonusMode(false);
    setBonusSessionId(null);
    setBonusSpinsLeft(0);
    setBonusTotalWon(0);
    setBonusInstantWin(0);
    setBonusComplete(false);
    setBonusPayoutTx(null);
    setBonusSpinResult(null);
    setShowBonusSpinResult(false);
    setShowBonusIntro(false);
    setCoinRotation(0);
    setFlipResult(null);
    setShowResult(false);
    queryClient.invalidateQueries({ queryKey: ['/api/coinflip/vault'] });
  };

  const isGold = bonusMode;

  const headsBg = isGold
    ? 'conic-gradient(from 0deg, #d4a017, #ffd700, #b8860b, #ffd700, #d4a017, #8b6914, #ffd700, #d4a017)'
    : 'conic-gradient(from 0deg, #7c3aed, #a78bfa, #6d28d9, #a78bfa, #7c3aed, #5b21b6, #a78bfa, #7c3aed)';
  const headsInner = isGold
    ? 'conic-gradient(from 180deg, #b8860b, #ffd700, #8b6914, #ffd700, #b8860b, #d4a017, #ffd700, #b8860b)'
    : 'conic-gradient(from 180deg, #6d28d9, #a78bfa, #5b21b6, #a78bfa, #6d28d9, #7c3aed, #a78bfa, #6d28d9)';
  const headsCenter = isGold
    ? 'radial-gradient(ellipse at 40% 35%, #ffe066 0%, #ffd700 30%, #d4a017 55%, #b8860b 100%)'
    : 'radial-gradient(ellipse at 40% 35%, #c084fc 0%, #a855f7 30%, #8b5cf6 55%, #7c3aed 100%)';
  const coinShadow = isGold
    ? '0 6px 20px rgba(0,0,0,0.6), 0 0 30px rgba(255, 215, 0, 0.5)'
    : '0 6px 20px rgba(0,0,0,0.6), 0 0 30px rgba(124, 58, 237, 0.4)';
  const coinShadowGlow = '';

  return (
    <div className="max-w-lg mx-auto space-y-4">

      {bonusMode && !bonusComplete && (
        <div className="text-center mb-2">
          <div className="inline-block px-6 py-2 rounded-full font-black text-xl uppercase tracking-widest animate-pulse"
            style={{ background: 'linear-gradient(135deg, #ffd700, #ff8c00)', color: '#1a0a00', boxShadow: '0 0 20px rgba(255, 215, 0, 0.5)' }}>
            BONUS - FREE SPINS!
          </div>
          {showBonusIntro && !showBonusSpinResult && bonusSpinsLeft === 5 && (
            <div className="mt-2 space-y-1">
              <p className="text-green-400 font-black text-xl">YOU WON {bonusInstantWin} SOL</p>
              <p className="text-yellow-300 font-bold text-sm">+ 5 FREE SPINS!</p>
            </div>
          )}
          <p className="text-yellow-300 font-bold mt-2 text-lg">
            {bonusSpinsLeft} spin{bonusSpinsLeft !== 1 ? 's' : ''} left · Bet: {bonusBetAmount} SOL
          </p>
          {bonusInstantWin > 0 && (
            <p className="text-green-400 font-bold text-sm">
              Instant Win: {bonusInstantWin} SOL
            </p>
          )}
          {bonusTotalWon > 0 && (
            <p className="text-green-400 font-bold text-lg">
              Free Spin Wins: {bonusTotalWon} SOL
            </p>
          )}
          {(bonusInstantWin + bonusTotalWon) > 0 && (
            <p className="text-yellow-300 font-black text-lg">
              Total: {bonusInstantWin + bonusTotalWon} SOL
            </p>
          )}
        </div>
      )}

      {/* Coin */}
      <div className="flex flex-col items-center py-6">
        <div
          className="w-40 h-40 relative mb-4"
          style={{ perspective: '600px' }}
        >
          <div
            className="w-full h-full rounded-full relative"
            style={{
              transform: `rotateY(${coinRotation}deg)`,
              transition: (isFlipping || isBonusSpinning) ? 'none' : 'transform 2s cubic-bezier(0.22, 0.8, 0.36, 1)',
              transformStyle: 'preserve-3d',
            }}
          >
            {/* HEADS */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: headsBg,
                backfaceVisibility: 'hidden',
                boxShadow: `${coinShadow}${coinShadowGlow ? ', ' + coinShadowGlow : ''}`,
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
            {/* TAILS */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: headsBg,
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
                boxShadow: `${coinShadow}${coinShadowGlow ? ', ' + coinShadowGlow : ''}`,
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

        {/* Normal result */}
        {!bonusMode && showResult && flipResult && (
          <div className="text-center space-y-1">
            <div className={`text-2xl font-black uppercase tracking-wider ${flipResult.won ? 'text-green-400' : 'text-red-400'}`}>
              {flipResult.won ? 'YOU WON' : 'YOU LOST'}
            </div>
            <div className={`text-xl font-bold ${flipResult.won ? 'text-green-400' : 'text-red-400'}`}>
              {flipResult.won ? `${flipResult.payoutAmount.toFixed(4)} SOL` : `${betAmount} SOL`}
            </div>
          </div>
        )}

        {/* Bonus spin result */}
        {bonusMode && !bonusComplete && showBonusSpinResult && bonusSpinResult && (
          <div className="text-center space-y-1">
            <div className={`text-2xl font-black uppercase tracking-wider ${bonusSpinResult.won ? 'text-yellow-300' : 'text-gray-400'}`}>
              {bonusSpinResult.won ? 'FREE WIN!' : 'MISS'}
            </div>
            {bonusSpinResult.won && (
              <div className="text-xl font-bold text-yellow-300">
                +{bonusSpinResult.spinPayout.toFixed(4)} SOL
              </div>
            )}
          </div>
        )}

        {/* Bonus complete summary */}
        {bonusMode && bonusComplete && (
          <div className="text-center space-y-2 animate-in fade-in duration-500">
            <div className="text-3xl font-black uppercase tracking-wider"
              style={{ background: 'linear-gradient(135deg, #ffd700, #ff8c00)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              BONUS COMPLETE!
            </div>
            <div className="text-2xl font-black" style={{ background: 'linear-gradient(135deg, #ffd700, #ff8c00)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Total: {bonusInstantWin + bonusTotalWon} SOL
            </div>
            {bonusInstantWin + bonusTotalWon === 0 && (
              <div className="text-xl font-bold text-gray-400">
                No wins this time. Better luck next time!
              </div>
            )}
            <button onClick={exitBonus}
              className="mt-3 px-8 py-3 rounded-xl font-black text-lg uppercase tracking-wider bg-gradient-to-r from-purple-600 to-purple-500 text-white border-2 border-purple-400 hover:from-purple-500 hover:to-purple-400 hover:shadow-lg hover:shadow-purple-500/40 active:scale-[0.98] transition-all">
              Continue Playing
            </button>
          </div>
        )}
      </div>

      {/* Bonus mode: pick color + spin */}
      {bonusMode && !bonusComplete && (
        <>
          <div className="text-center">
            <p className="text-yellow-300 font-bold text-lg tracking-widest uppercase mb-3">Pick Your Color</p>
            <div className="flex gap-3 justify-center max-w-xs mx-auto">
              <button
                onClick={() => setChoice('heads')}
                disabled={isBonusSpinning}
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
                disabled={isBonusSpinning}
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

          <div className="pt-2">
            <button
              onClick={handleBonusSpin}
              disabled={isBonusSpinning}
              className={`w-full py-4 rounded-xl font-black text-xl uppercase tracking-wider transition-all border-2 ${
                isBonusSpinning
                  ? 'cursor-not-allowed opacity-50'
                  : 'hover:shadow-lg active:scale-[0.98]'
              }`}
              style={{
                background: isBonusSpinning ? 'rgba(212, 160, 23, 0.3)' : 'linear-gradient(135deg, #ffd700, #ff8c00)',
                color: isBonusSpinning ? 'rgba(255,255,255,0.5)' : '#1a0a00',
                borderColor: isBonusSpinning ? 'rgba(255, 215, 0, 0.3)' : '#ffd700',
                boxShadow: isBonusSpinning ? 'none' : '0 0 20px rgba(255, 215, 0, 0.3)',
              }}
            >
              {isBonusSpinning ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin" /> Spinning...
                </span>
              ) : (
                `Free Spin (${bonusSpinsLeft} left)`
              )}
            </button>
          </div>
        </>
      )}

      {/* Normal mode: I LIKE / FOR / DOUBLE OR NOTHING */}
      {!bonusMode && (
        <>
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
              {BET_AMOUNTS.map((amount) => {
                const tooHighForVault = vaultBalance > 0 && vaultBalance < amount * 2;
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
                    title={tooHighForVault ? `Vault needs ${(amount * 2).toFixed(2)} SOL to cover this bet` : ''}
                  >
                    {amount} SOL
                  </button>
                );
              })}
            </div>
          </div>

          {/* DOUBLE OR NOTHING button */}
          <div className="pt-2">
            <button
              onClick={handleFlip}
              disabled={isFlipping || !connected}
              className={`w-full py-4 rounded-xl font-black text-xl uppercase tracking-wider transition-all border-2 ${
                isFlipping
                  ? 'bg-purple-600/50 text-white/50 border-purple-400/50 cursor-not-allowed'
                  : connected
                  ? 'bg-gradient-to-r from-purple-600 to-purple-500 text-white border-purple-400 hover:from-purple-500 hover:to-purple-400 hover:shadow-lg hover:shadow-purple-500/40 active:scale-[0.98]'
                  : 'bg-gray-700 text-gray-400 border-gray-600 cursor-not-allowed'
              }`}
            >
              {isFlipping ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin" /> Flipping...
                </span>
              ) : connected ? (
                'Double or Nothing'
              ) : (
                'Connect Wallet'
              )}
            </button>
          </div>

          {/* Vault info */}
          <div className="text-center text-xs text-gray-400 space-y-0.5">
            <p>50/50 odds. Win = 2x your bet.</p>
            <p className="text-purple-400">
              Vault: {vaultBalance.toFixed(4)} SOL
              {' · '}
              <a href="/admin/vault" className="underline hover:text-purple-300">Manage</a>
            </p>
          </div>

        </>
      )}


    </div>
  );
}
