import { useState, useCallback } from 'react';
import { useWalletAdapter } from '@/hooks/useWalletAdapter';
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const BET_AMOUNTS = [0.00176, 0.01, 0.05, 0.10, 0.25, 0.50];


export function CoinFlipGame() {
  const { publicKey, signTransaction, connected, connection } = useWalletAdapter();
  const { toast } = useToast();
  const [choice, setChoice] = useState<'heads' | 'tails'>('heads');
  const [betAmount, setBetAmount] = useState(0.00176);
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

      setFlipResult(result);
      setShowResult(true);
      setIsFlipping(false);
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

  return (
    <div className="max-w-lg mx-auto space-y-4">
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
              transition: isFlipping ? 'none' : 'transform 1.5s cubic-bezier(0.25, 0.1, 0.25, 1)',
              transformStyle: 'preserve-3d',
            }}
          >
            {/* HEADS */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: 'conic-gradient(from 0deg, #b8860b, #ffd700, #daa520, #fff8dc, #daa520, #b8860b, #cd853f, #ffd700, #b8860b)',
                backfaceVisibility: 'hidden',
                boxShadow: '0 8px 25px rgba(0,0,0,0.7), 0 0 40px rgba(255,215,0,0.3), inset 0 1px 2px rgba(255,255,255,0.3)',
              }}
            >
              <div className="absolute inset-0 rounded-full" style={{
                background: 'linear-gradient(140deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.1) 25%, transparent 45%, transparent 60%, rgba(0,0,0,0.25) 100%)',
              }} />
              <div className="absolute rounded-full" style={{
                inset: '8px',
                background: 'conic-gradient(from 120deg, #daa520, #ffd700, #b8860b, #fff8dc, #b8860b, #ffd700, #daa520, #cd853f, #daa520)',
                boxShadow: 'inset 0 2px 5px rgba(255,255,255,0.4), inset 0 -2px 5px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.5)',
              }}>
                <div className="absolute rounded-full" style={{
                  inset: '4px',
                  background: 'conic-gradient(from 240deg, #b8860b, #ffd700, #daa520, #ffd700, #b8860b, #cd853f, #ffd700, #b8860b)',
                  boxShadow: 'inset 0 1px 3px rgba(255,255,255,0.2), inset 0 -1px 3px rgba(0,0,0,0.2)',
                }}>
                  <div className="absolute rounded-full flex items-center justify-center" style={{
                    inset: '8px',
                    background: 'radial-gradient(ellipse at 40% 35%, #a78bfa 0%, #8b5cf6 30%, #7c3aed 55%, #6d28d9 85%, #5b21b6 100%)',
                    boxShadow: 'inset 0 4px 8px rgba(255,255,255,0.15), inset 0 -4px 10px rgba(0,0,0,0.35), 0 0 0 2px #8b6914',
                  }}>
                    <div className="absolute inset-0 rounded-full" style={{
                      background: 'linear-gradient(145deg, rgba(255,255,255,0.25) 0%, transparent 40%)',
                    }} />
                    <svg className="w-14 h-14 relative z-10" viewBox="0 0 397.7 311.7" style={{ fill: '#00FFA3', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>
                      <path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"/>
                      <path d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1L333.1,73.8c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"/>
                      <path d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z"/>
                    </svg>
                  </div>
                </div>
              </div>
            </div>
            {/* TAILS */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: 'conic-gradient(from 0deg, #b8860b, #ffd700, #daa520, #fff8dc, #daa520, #b8860b, #cd853f, #ffd700, #b8860b)',
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
                boxShadow: '0 8px 25px rgba(0,0,0,0.7), 0 0 40px rgba(255,215,0,0.3), inset 0 1px 2px rgba(255,255,255,0.3)',
              }}
            >
              <div className="absolute inset-0 rounded-full" style={{
                background: 'linear-gradient(140deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.1) 25%, transparent 45%, transparent 60%, rgba(0,0,0,0.25) 100%)',
              }} />
              <div className="absolute rounded-full" style={{
                inset: '8px',
                background: 'conic-gradient(from 120deg, #daa520, #ffd700, #b8860b, #fff8dc, #b8860b, #ffd700, #daa520, #cd853f, #daa520)',
                boxShadow: 'inset 0 2px 5px rgba(255,255,255,0.4), inset 0 -2px 5px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.5)',
              }}>
                <div className="absolute rounded-full" style={{
                  inset: '4px',
                  background: 'conic-gradient(from 240deg, #b8860b, #ffd700, #daa520, #ffd700, #b8860b, #cd853f, #ffd700, #b8860b)',
                  boxShadow: 'inset 0 1px 3px rgba(255,255,255,0.2), inset 0 -1px 3px rgba(0,0,0,0.2)',
                }}>
                  <div className="absolute rounded-full flex items-center justify-center" style={{
                    inset: '8px',
                    background: 'radial-gradient(ellipse at 40% 35%, #a78bfa 0%, #8b5cf6 30%, #7c3aed 55%, #6d28d9 85%, #5b21b6 100%)',
                    boxShadow: 'inset 0 4px 8px rgba(255,255,255,0.15), inset 0 -4px 10px rgba(0,0,0,0.35), 0 0 0 2px #8b6914',
                  }}>
                    <div className="absolute inset-0 rounded-full" style={{
                      background: 'linear-gradient(145deg, rgba(255,255,255,0.25) 0%, transparent 40%)',
                    }} />
                    <svg className="w-14 h-14 relative z-10" viewBox="0 0 397.7 311.7" style={{ fill: '#ef4444', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>
                      <path d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"/>
                      <path d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1L333.1,73.8c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"/>
                      <path d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z"/>
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {showResult && flipResult && (
          <div className="text-center space-y-1">
            <div className={`text-2xl font-black uppercase tracking-wider ${flipResult.won ? 'text-green-400' : 'text-red-400'}`}>
              {flipResult.won ? 'YOU WON' : 'YOU LOST'}
            </div>
            <div className={`text-xl font-bold ${flipResult.won ? 'text-green-400' : 'text-red-400'}`}>
              {flipResult.won ? `${flipResult.payoutAmount.toFixed(4)} SOL` : `${betAmount} SOL`}
            </div>
          </div>
        )}
      </div>

      {/* I LIKE */}
      <div className="text-center">
        <p className="text-gray-300 font-bold text-lg tracking-widest uppercase mb-3">I Like</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => setChoice('heads')}
            disabled={isFlipping}
            className={`px-8 py-3 rounded-xl font-black text-lg uppercase tracking-wider transition-all border-2 ${
              choice === 'heads'
                ? 'bg-purple-600 text-white border-purple-400 shadow-lg shadow-purple-500/30'
                : 'bg-purple-900/30 text-purple-300 border-purple-500/30 hover:bg-purple-800/40 hover:border-purple-400/60'
            }`}
          >
            Heads
          </button>
          <button
            onClick={() => setChoice('tails')}
            disabled={isFlipping}
            className={`px-8 py-3 rounded-xl font-black text-lg uppercase tracking-wider transition-all border-2 ${
              choice === 'tails'
                ? 'bg-purple-600 text-white border-purple-400 shadow-lg shadow-purple-500/30'
                : 'bg-purple-900/30 text-purple-300 border-purple-500/30 hover:bg-purple-800/40 hover:border-purple-400/60'
            }`}
          >
            Tails
          </button>
        </div>
      </div>

      {/* FOR */}
      <div className="text-center">
        <p className="text-gray-300 font-bold text-lg tracking-widest uppercase mb-3">For</p>
        <div className="grid grid-cols-3 gap-2 max-w-sm mx-auto">
          {BET_AMOUNTS.map((amount) => (
            <button
              key={amount}
              onClick={() => setBetAmount(amount)}
              disabled={isFlipping}
              className={`py-3 px-2 rounded-xl font-bold text-sm uppercase transition-all border-2 ${
                betAmount === amount
                  ? 'bg-purple-600 text-white border-purple-400 shadow-lg shadow-purple-500/30'
                  : 'bg-purple-900/30 text-purple-300 border-purple-500/30 hover:bg-purple-800/40 hover:border-purple-400/60'
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

    </div>
  );
}
