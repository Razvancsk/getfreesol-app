import { useState, useEffect, useCallback } from 'react';
import { useWalletAdapter } from '@/hooks/useWalletAdapter';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

const BET_AMOUNTS = [0.01, 0.05, 0.1];

function timeAgo(date: string | Date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function CoinFlipGame() {
  const { publicKey, signTransaction, connected, connection } = useWalletAdapter();
  const { toast } = useToast();
  const [choice, setChoice] = useState<'heads' | 'tails'>('heads');
  const [betAmount, setBetAmount] = useState(0.01);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipResult, setFlipResult] = useState<{ result: string; won: boolean; payoutAmount: number } | null>(null);
  const [coinRotation, setCoinRotation] = useState(0);
  const [showResult, setShowResult] = useState(false);

  const vaultQuery = useQuery<{ success: boolean; address: string; balance: number }>({
    queryKey: ['/api/coinflip/vault'],
    refetchInterval: 30000,
  });

  const vaultAddress = (vaultQuery.data as any)?.address || '';
  const vaultBalance = (vaultQuery.data as any)?.balance || 0;

  const recentFlipsQuery = useQuery({
    queryKey: ['/api/coinflip/recent'],
    refetchInterval: 10000,
  });

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

      console.log('🎰 Signing bet transaction to vault:', vaultAddress);
      let signature: string;
      try {
        const signed = await signTransaction(transaction);
        console.log('🎰 Transaction signed, sending...');
        const serialized = signed.serialize();
        signature = await connection.sendRawTransaction(serialized, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
      } catch (signErr: any) {
        console.error('🎰 Sign/send error:', signErr);
        if (signErr?.message?.includes('User rejected') || signErr?.message?.includes('cancelled')) {
          throw new Error('Transaction cancelled by user');
        }
        throw new Error(signErr?.message || 'Failed to sign or send transaction');
      }
      console.log(`🎰 Bet transaction sent: ${signature}`);
      
      try {
        await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
        console.log(`🎰 Bet transaction confirmed: ${signature}`);
      } catch (confirmErr: any) {
        console.warn('🎰 Confirm warning (continuing):', confirmErr?.message);
      }

      toast({ title: 'Bet placed! Flipping coin...', className: 'bg-purple-600 text-white border-purple-600' });

      let rotations = 0;
      const spinInterval = setInterval(() => {
        rotations += 30;
        setCoinRotation(rotations);
      }, 50);

      const result = await flipMutation.mutateAsync({
        walletAddress: publicKey.toString(),
        betAmount,
        choice,
        betTxSignature: signature,
      });

      clearInterval(spinInterval);

      const finalRotation = result.result === 'heads' ? 3600 : 3780;
      setCoinRotation(finalRotation);

      setTimeout(() => {
        setFlipResult(result);
        setShowResult(true);
        setIsFlipping(false);

        if (result.won) {
          toast({
            title: `You won ${result.payoutAmount.toFixed(4)} SOL!`,
            description: 'Payout sent to your wallet',
            className: 'bg-green-600 text-white border-green-600',
          });
        } else {
          toast({
            title: 'You lost!',
            description: `The coin landed on ${result.result}`,
            className: 'bg-red-600 text-white border-red-600',
          });
        }
      }, 1500);
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
  }, [publicKey, connected, betAmount, choice, signTransaction, connection, toast, flipMutation, vaultAddress]);

  const flips = (recentFlipsQuery.data as any)?.flips || [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Side - Coin Animation */}
        <div className="relative bg-gradient-to-br from-purple-900/40 to-black/60 rounded-2xl border border-purple-500/30 p-8 flex flex-col items-center justify-center min-h-[360px]">
          <h2 className="text-3xl font-bold text-white mb-2 italic">Click,</h2>
          <h2 className="text-3xl font-bold text-white mb-2 italic">Flip,</h2>
          <h2 className="text-3xl font-bold text-white mb-6 italic">Snatch!</h2>

          <div 
            className="w-40 h-40 relative"
            style={{
              perspective: '600px',
            }}
          >
            <div
              className="w-full h-full rounded-full relative"
              style={{
                transform: `rotateY(${coinRotation}deg)`,
                transition: isFlipping ? 'none' : 'transform 1.5s cubic-bezier(0.25, 0.1, 0.25, 1)',
                transformStyle: 'preserve-3d',
              }}
            >
              {/* Heads side */}
              <div
                className="absolute inset-0 rounded-full flex items-center justify-center text-6xl font-bold"
                style={{
                  background: 'linear-gradient(135deg, #c0c0c0, #808080, #a0a0a0)',
                  backfaceVisibility: 'hidden',
                  border: '4px solid #666',
                  boxShadow: '0 0 20px rgba(128, 128, 128, 0.5), inset 0 2px 4px rgba(255,255,255,0.3)',
                }}
              >
                <svg className="w-20 h-20" viewBox="0 0 397.7 311.7" style={{ fill: '#00FFA3' }}>
                  <path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"/>
                  <path d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1L333.1,73.8c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"/>
                  <path d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z"/>
                </svg>
              </div>
              {/* Tails side */}
              <div
                className="absolute inset-0 rounded-full flex items-center justify-center text-5xl font-bold text-gray-300"
                style={{
                  background: 'linear-gradient(135deg, #a0a0a0, #606060, #808080)',
                  backfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)',
                  border: '4px solid #555',
                  boxShadow: '0 0 20px rgba(128, 128, 128, 0.5), inset 0 2px 4px rgba(255,255,255,0.3)',
                }}
              >
                G
              </div>
            </div>
          </div>

          {showResult && flipResult && (
            <div className={`mt-6 text-2xl font-bold animate-bounce ${flipResult.won ? 'text-green-400' : 'text-red-400'}`}>
              {flipResult.won ? `+${flipResult.payoutAmount.toFixed(4)} SOL` : `Lost ${betAmount} SOL`}
            </div>
          )}
        </div>

        {/* Right Side - Controls */}
        <div className="bg-gradient-to-br from-purple-900/40 to-black/60 rounded-2xl border border-purple-500/30 p-8 space-y-6">
          {/* Step 1: Choose */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">1. Choose</h3>
            <div className="flex gap-3">
              <button
                onClick={() => setChoice('heads')}
                disabled={isFlipping}
                className={`flex-1 px-6 py-3 rounded-lg font-semibold text-sm transition-all border ${
                  choice === 'heads'
                    ? 'bg-purple-600 text-white border-purple-400'
                    : 'bg-black/40 text-gray-300 border-gray-600 hover:border-purple-400/50'
                }`}
              >
                Head <span className="inline-block w-3 h-3 rounded-full border-2 border-current ml-1" style={{ background: choice === 'heads' ? 'currentColor' : 'transparent' }} />
              </button>
              <button
                onClick={() => setChoice('tails')}
                disabled={isFlipping}
                className={`flex-1 px-6 py-3 rounded-lg font-semibold text-sm transition-all border ${
                  choice === 'tails'
                    ? 'bg-purple-600 text-white border-purple-400'
                    : 'bg-black/40 text-gray-300 border-gray-600 hover:border-purple-400/50'
                }`}
              >
                Tail <span className="inline-block w-3 h-3 rounded-full border-2 border-current ml-1" style={{ background: choice === 'tails' ? 'currentColor' : 'transparent' }} />
              </button>
            </div>
          </div>

          {/* Step 2: Commit */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">2. Commit</h3>
            <div className="flex gap-3">
              {BET_AMOUNTS.map((amount) => (
                <button
                  key={amount}
                  onClick={() => setBetAmount(amount)}
                  disabled={isFlipping}
                  className={`flex-1 px-4 py-3 rounded-lg font-semibold text-sm transition-all border flex items-center justify-center gap-1 ${
                    betAmount === amount
                      ? 'bg-purple-600 text-white border-purple-400'
                      : 'bg-black/40 text-gray-300 border-gray-600 hover:border-purple-400/50'
                  }`}
                >
                  {amount} <svg className="w-3 h-3 inline" viewBox="0 0 397.7 311.7" style={{ fill: '#00FFA3' }}><path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"/><path d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1L333.1,73.8c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"/><path d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z"/></svg>
                </button>
              ))}
            </div>
          </div>

          {/* Flip Button */}
          <Button
            onClick={handleFlip}
            disabled={isFlipping || !connected}
            className={`w-full py-4 text-lg font-bold rounded-xl transition-all ${
              connected
                ? 'bg-green-500 hover:bg-green-600 text-black'
                : 'bg-gray-600 text-gray-300'
            }`}
          >
            {isFlipping ? (
              <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Flipping...</>
            ) : connected ? (
              `🪙 FLIP (${betAmount} SOL)`
            ) : (
              'Connect Wallet'
            )}
          </Button>

          <p className="text-center text-xs text-gray-400">
            50/50 odds. Win and double your SOL!
          </p>

          <div className="text-center text-xs text-purple-400 mt-1">
            🏦 Vault: {vaultBalance.toFixed(4)} SOL
            {' · '}
            <a href="/admin/vault" className="underline hover:text-purple-300">Manage</a>
          </div>
        </div>
      </div>

      {/* Recent Flips */}
      <div className="bg-gradient-to-br from-purple-900/40 to-black/60 rounded-2xl border border-purple-500/30 p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          🎰 Recent Flips
        </h3>
        
        {flips.length === 0 ? (
          <p className="text-gray-400 text-center py-4">No flips yet. Be the first!</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {flips.map((flip: any) => (
              <div key={flip.id} className="flex items-center justify-between py-2 border-b border-purple-500/10 last:border-0">
                <div className="text-sm">
                  <span className="text-purple-300 font-mono">
                    {flip.walletAddress.slice(0, 4)}...{flip.walletAddress.slice(-4)}
                  </span>
                  {' '}flipped{' '}
                  <span className="text-white font-bold">{parseFloat(flip.betAmount).toFixed(2)} SOL</span>
                  {' '}and{' '}
                  {flip.won ? (
                    <span className="text-green-400 font-bold">doubled!</span>
                  ) : (
                    <span className="text-red-400 font-bold">got rugged :(</span>
                  )}
                </div>
                <span className="text-xs text-gray-500">{timeAgo(flip.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}