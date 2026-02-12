import { useState, useCallback } from 'react';
import { useWalletAdapter } from '@/hooks/useWalletAdapter';
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const BET_AMOUNTS = [0.01, 0.05, 0.1, 0.25, 0.5, 1];

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

      try {
        await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
        console.log(`Bet transaction confirmed: ${signature}`);
      } catch (confirmErr: any) {
        console.warn('Confirm warning (continuing):', confirmErr?.message);
      }

      toast({ title: 'Bet placed! Flipping...', className: 'bg-yellow-500 text-black border-yellow-500 font-bold' });

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
            title: `YOU WON ${result.payoutAmount.toFixed(4)} SOL!`,
            description: 'Double or nothing baby!',
            className: 'bg-green-500 text-black border-green-500 font-bold',
          });
        } else {
          toast({
            title: 'RUGGED!',
            description: `Coin landed on ${result.result}`,
            className: 'bg-red-600 text-white border-red-600 font-bold',
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
    <div className="max-w-lg mx-auto space-y-4">
      {/* Coin */}
      <div className="flex flex-col items-center py-6">
        <div
          className="w-36 h-36 relative mb-4"
          style={{ perspective: '600px' }}
        >
          <div
            className="w-full h-full rounded-full relative"
            style={{
              transform: `rotateY(${coinRotation}deg)`,
              transition: isFlipping ? 'none' : 'transform 1.5s cubic-bezier(0.25, 0.1, 0.25, 1)',
              transformStyle: 'preserve-3d',
            }}
          >
            <div
              className="absolute inset-0 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #FFD700, #FFA500, #FFD700)',
                backfaceVisibility: 'hidden',
                border: '4px solid #B8860B',
                boxShadow: '0 0 30px rgba(255, 215, 0, 0.4), inset 0 2px 6px rgba(255,255,255,0.4)',
              }}
            >
              <span className="text-5xl">:)</span>
            </div>
            <div
              className="absolute inset-0 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #FFD700, #FFA500, #FFD700)',
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
                border: '4px solid #B8860B',
                boxShadow: '0 0 30px rgba(255, 215, 0, 0.4), inset 0 2px 6px rgba(255,255,255,0.4)',
              }}
            >
              <span className="text-5xl">:(</span>
            </div>
          </div>
        </div>

        {showResult && flipResult && (
          <div className={`text-2xl font-black uppercase tracking-wider animate-bounce ${flipResult.won ? 'text-green-400' : 'text-red-400'}`}>
            {flipResult.won ? `+${flipResult.payoutAmount.toFixed(4)} SOL` : `RUGGED -${betAmount} SOL`}
          </div>
        )}
      </div>

      {/* I LIKE */}
      <div className="text-center">
        <p className="text-white font-bold text-lg tracking-widest uppercase mb-3">I Like</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => setChoice('heads')}
            disabled={isFlipping}
            className={`px-8 py-3 rounded-lg font-black text-lg uppercase tracking-wider transition-all border-2 ${
              choice === 'heads'
                ? 'bg-yellow-400 text-black border-yellow-600 shadow-lg shadow-yellow-400/30'
                : 'bg-transparent text-yellow-400 border-yellow-400/50 hover:bg-yellow-400/10'
            }`}
          >
            Heads
          </button>
          <button
            onClick={() => setChoice('tails')}
            disabled={isFlipping}
            className={`px-8 py-3 rounded-lg font-black text-lg uppercase tracking-wider transition-all border-2 ${
              choice === 'tails'
                ? 'bg-yellow-400 text-black border-yellow-600 shadow-lg shadow-yellow-400/30'
                : 'bg-transparent text-yellow-400 border-yellow-400/50 hover:bg-yellow-400/10'
            }`}
          >
            Tails
          </button>
        </div>
      </div>

      {/* FOR */}
      <div className="text-center">
        <p className="text-white font-bold text-lg tracking-widest uppercase mb-3">For</p>
        <div className="grid grid-cols-3 gap-2 max-w-sm mx-auto">
          {BET_AMOUNTS.map((amount) => (
            <button
              key={amount}
              onClick={() => setBetAmount(amount)}
              disabled={isFlipping}
              className={`py-3 px-2 rounded-lg font-bold text-sm uppercase transition-all border-2 ${
                betAmount === amount
                  ? 'bg-yellow-400 text-black border-yellow-600 shadow-lg shadow-yellow-400/30'
                  : 'bg-transparent text-yellow-400 border-yellow-400/50 hover:bg-yellow-400/10'
              }`}
            >
              {amount} SOL
            </button>
          ))}
        </div>
      </div>

      {/* DOUBLE OR NOTHING button */}
      <div className="pt-2">
        <button
          onClick={handleFlip}
          disabled={isFlipping || !connected}
          className={`w-full py-4 rounded-lg font-black text-xl uppercase tracking-wider transition-all border-2 ${
            isFlipping
              ? 'bg-yellow-400/50 text-black/50 border-yellow-600/50 cursor-not-allowed'
              : connected
              ? 'bg-yellow-400 text-black border-yellow-600 hover:bg-yellow-300 hover:shadow-lg hover:shadow-yellow-400/40 active:scale-[0.98]'
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

      {/* Recent Flips */}
      <div className="bg-black/30 rounded-xl border border-yellow-400/20 p-4">
        <h3 className="text-sm font-bold text-yellow-400 uppercase tracking-wider mb-3">Recent Flips</h3>
        {flips.length === 0 ? (
          <p className="text-gray-500 text-center py-3 text-sm">No flips yet. Be the first!</p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {flips.map((flip: any) => (
              <div key={flip.id} className="flex items-center justify-between py-1.5 border-b border-yellow-400/10 last:border-0">
                <div className="text-xs">
                  <span className="text-gray-400 font-mono">
                    {flip.walletAddress.slice(0, 4)}...{flip.walletAddress.slice(-4)}
                  </span>
                  {' '}
                  <span className="text-white font-bold">{parseFloat(flip.betAmount).toFixed(2)} SOL</span>
                  {' '}
                  {flip.won ? (
                    <span className="text-green-400 font-bold">WON</span>
                  ) : (
                    <span className="text-red-400 font-bold">LOST</span>
                  )}
                </div>
                <span className="text-[10px] text-gray-600">{timeAgo(flip.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
