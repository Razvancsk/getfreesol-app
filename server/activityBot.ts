import {
  Connection, Keypair, PublicKey, Transaction, SystemProgram,
  LAMPORTS_PER_SOL, sendAndConfirmTransaction, VersionedTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { getVaultKeypair } from './coinflipVault';

function getHeliusConnection(): Connection {
  const key = process.env.HELIUS_API_KEY;
  if (!key) throw new Error('HELIUS_API_KEY is required');
  return new Connection(`https://mainnet.helius-rpc.com/?api-key=${key}`, 'confirmed');
}

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export interface ActivityWallet {
  address: string;
  txCount: number;
  lastTxSig: string | null;
  lastTxTime: string | null;
  lastError: string | null;
  balance: number;
  direction: 'sol_to_usdc' | 'usdc_to_sol';
}

export interface BotStatus {
  running: boolean;
  walletCount: number;
  intervalMinutes: number;
  solPerWallet: number;
  totalTxCount: number;
  wallets: ActivityWallet[];
  nextRunIn: number | null;
  fundingTxSigs: string[];
  drainTxSigs: string[];
  phase: 'idle' | 'funding' | 'running' | 'draining';
  phaseMessage: string;
}

let activityKeypairs: Keypair[] = [];
let activityWallets: ActivityWallet[] = [];
let isRunning = false;
let isBusy = false;
let intervalHandle: NodeJS.Timeout | null = null;
let configIntervalMinutes = 10;
let configWalletCount = 5;
let configSolPerWallet = 0.02;
let totalTxCount = 0;
let nextRunAt: number | null = null;
let fundingTxSigs: string[] = [];
let drainTxSigs: string[] = [];
let phase: BotStatus['phase'] = 'idle';
let phaseMessage = '';

async function jupiterSwap(keypair: Keypair, inputMint: string, outputMint: string, amountLamports: number): Promise<string> {
  const connection = getHeliusConnection();
  const quoteRes = await fetch(
    `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=150`
  );
  if (!quoteRes.ok) throw new Error(`Jupiter quote failed: ${quoteRes.status}`);
  const quote = await quoteRes.json();
  if (quote.error) throw new Error(`Jupiter quote error: ${quote.error}`);

  const swapRes = await fetch('https://quote-api.jup.ag/v6/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 1000,
    }),
  });
  if (!swapRes.ok) throw new Error(`Jupiter swap API failed: ${swapRes.status}`);
  const swapData = await swapRes.json();
  if (!swapData.swapTransaction) throw new Error('No swap transaction returned');

  const tx = VersionedTransaction.deserialize(Buffer.from(swapData.swapTransaction, 'base64'));
  tx.sign([keypair]);

  const sig = await connection.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
  await connection.confirmTransaction(sig, 'confirmed');
  return sig;
}

async function runActivityForWallet(idx: number): Promise<void> {
  if (!activityKeypairs[idx] || !activityWallets[idx]) return;
  const keypair = activityKeypairs[idx];
  const wallet = activityWallets[idx];
  const connection = getHeliusConnection();

  try {
    const balance = await connection.getBalance(keypair.publicKey);
    wallet.balance = balance / LAMPORTS_PER_SOL;

    if (balance < 5000) {
      wallet.lastError = 'Balance too low for activity';
      return;
    }

    // Alternate between SOL→USDC and USDC→SOL each tick
    if (wallet.direction === 'sol_to_usdc') {
      // Swap ~20% of balance to USDC (keep fees)
      const swapAmount = Math.floor(balance * 0.2);
      if (swapAmount < 100000) { // at least 0.0001 SOL
        wallet.direction = 'usdc_to_sol';
        return;
      }
      const sig = await jupiterSwap(keypair, SOL_MINT, USDC_MINT, swapAmount);
      wallet.lastTxSig = sig;
      wallet.lastTxTime = new Date().toISOString();
      wallet.txCount++;
      wallet.lastError = null;
      wallet.direction = 'usdc_to_sol';
      totalTxCount++;
    } else {
      // Try to swap USDC back to SOL
      // Check USDC balance via Jupiter Holdings
      const holdingsRes = await fetch(
        `https://api.jup.ag/ultra/v1/balances/${keypair.publicKey.toBase58()}`
      );
      if (holdingsRes.ok) {
        const holdings = await holdingsRes.json();
        const usdcBalance = holdings[USDC_MINT];
        if (usdcBalance && parseInt(usdcBalance.amount) > 0) {
          const sig = await jupiterSwap(keypair, USDC_MINT, SOL_MINT, parseInt(usdcBalance.amount));
          wallet.lastTxSig = sig;
          wallet.lastTxTime = new Date().toISOString();
          wallet.txCount++;
          wallet.lastError = null;
          totalTxCount++;
        }
      }
      wallet.direction = 'sol_to_usdc';
    }
  } catch (err: any) {
    wallet.lastError = err?.message || String(err);
    wallet.direction = 'sol_to_usdc'; // reset on error
  }
}

function scheduleNextRun(): void {
  if (!isRunning) return;
  nextRunAt = Date.now() + configIntervalMinutes * 60 * 1000;
  intervalHandle = setTimeout(async () => {
    if (!isRunning) return;
    // Run all wallets in parallel
    await Promise.allSettled(activityWallets.map((_, i) => runActivityForWallet(i)));
    scheduleNextRun();
  }, configIntervalMinutes * 60 * 1000);
}

export async function startActivityBot(walletCount: number, solPerWallet: number, intervalMins: number): Promise<{ success: boolean; error?: string }> {
  if (isRunning || isBusy) return { success: false, error: 'Bot is already running or busy.' };
  isBusy = true;
  phase = 'funding';
  phaseMessage = 'Generating wallets and sending SOL from vault...';
  fundingTxSigs = [];
  drainTxSigs = [];
  totalTxCount = 0;

  try {
    const connection = getHeliusConnection();
    const vaultKeypair = getVaultKeypair();
    configWalletCount = Math.min(10, Math.max(1, walletCount));
    configSolPerWallet = Math.max(0.005, solPerWallet);
    configIntervalMinutes = Math.max(1, intervalMins);

    const vaultBalance = await connection.getBalance(vaultKeypair.publicKey);
    const needed = configWalletCount * (configSolPerWallet * LAMPORTS_PER_SOL + 10000);
    if (vaultBalance < needed + 50000) {
      phase = 'idle';
      phaseMessage = '';
      isBusy = false;
      return {
        success: false,
        error: `Vault needs at least ${(needed / LAMPORTS_PER_SOL + 0.001).toFixed(4)} SOL. Current balance: ${(vaultBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`,
      };
    }

    // Generate fresh wallets
    activityKeypairs = Array.from({ length: configWalletCount }, () => Keypair.generate());
    activityWallets = activityKeypairs.map(kp => ({
      address: kp.publicKey.toBase58(),
      txCount: 0,
      lastTxSig: null,
      lastTxTime: null,
      lastError: null,
      balance: 0,
      direction: 'sol_to_usdc' as const,
    }));

    // Fund wallets from vault - batch into one tx per wallet to avoid tx size limits
    const amountLamports = Math.floor(configSolPerWallet * LAMPORTS_PER_SOL);
    for (let i = 0; i < activityKeypairs.length; i++) {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: vaultKeypair.publicKey,
          toPubkey: activityKeypairs[i].publicKey,
          lamports: amountLamports,
        })
      );
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = vaultKeypair.publicKey;
      const sig = await sendAndConfirmTransaction(connection, tx, [vaultKeypair], { commitment: 'confirmed' });
      fundingTxSigs.push(sig);
      activityWallets[i].balance = configSolPerWallet;
    }

    isRunning = true;
    phase = 'running';
    phaseMessage = `${configWalletCount} wallets funded and active`;
    isBusy = false;

    // Run first round immediately
    await Promise.allSettled(activityWallets.map((_, i) => runActivityForWallet(i)));
    scheduleNextRun();

    return { success: true };
  } catch (err: any) {
    isRunning = false;
    phase = 'idle';
    phaseMessage = '';
    isBusy = false;
    return { success: false, error: err?.message || String(err) };
  }
}

export async function stopActivityBot(): Promise<{ success: boolean; drainSigs: string[]; error?: string }> {
  if (!isRunning && activityKeypairs.length === 0) {
    return { success: true, drainSigs: [] };
  }
  if (isBusy) return { success: false, drainSigs: [], error: 'Bot is busy, try again in a moment.' };

  isRunning = false;
  if (intervalHandle) { clearTimeout(intervalHandle); intervalHandle = null; }
  nextRunAt = null;
  phase = 'draining';
  phaseMessage = 'Draining wallets back to vault...';
  isBusy = true;
  drainTxSigs = [];

  try {
    const connection = getHeliusConnection();
    const vaultKeypair = getVaultKeypair();

    // Swap ALL tokens back to SOL for every wallet (sequential per wallet to avoid blockhash expiry)
    for (let i = 0; i < activityKeypairs.length; i++) {
      const kp = activityKeypairs[i];
      try {
        const holdingsRes = await fetch(`https://api.jup.ag/ultra/v1/balances/${kp.publicKey.toBase58()}`);
        if (!holdingsRes.ok) continue;
        const holdings = await holdingsRes.json();
        // Swap every non-SOL token that has a balance
        for (const [mint, info] of Object.entries(holdings as Record<string, any>)) {
          if (mint === SOL_MINT) continue;
          const amount = parseInt(info?.amount ?? '0');
          if (amount < 100) continue; // dust, skip
          try {
            console.log(`[ActivityBot] Swapping token ${mint} → SOL for wallet ${i}: ${amount} units`);
            await jupiterSwap(kp, mint, SOL_MINT, amount);
          } catch (swapErr: any) {
            console.error(`[ActivityBot] Swap ${mint}→SOL failed for wallet ${i}:`, swapErr?.message || swapErr);
          }
        }
      } catch (err: any) {
        console.error(`[ActivityBot] Token scan failed for wallet ${i}:`, err?.message || err);
      }
    }

    // Brief pause so all swap confirmations settle before checking SOL balances
    await new Promise(r => setTimeout(r, 3000));

    // Drain all SOL back to vault
    for (let i = 0; i < activityKeypairs.length; i++) {
      const kp = activityKeypairs[i];
      try {
        const balance = await connection.getBalance(kp.publicKey);
        console.log(`[ActivityBot] Wallet ${i} balance: ${balance} lamports`);
        if (balance < 5001) {
          console.log(`[ActivityBot] Wallet ${i} too low to drain (${balance} lamports), skipping`);
          continue;
        }

        // Build a dummy tx to calculate the exact fee
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        const feeTx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: kp.publicKey,
            toPubkey: vaultKeypair.publicKey,
            lamports: balance - 5000,
          })
        );
        feeTx.recentBlockhash = blockhash;
        feeTx.feePayer = kp.publicKey;
        feeTx.sign(kp);

        const feeResult = await connection.getFeeForMessage(feeTx.compileMessage(), 'confirmed');
        const actualFee = feeResult.value ?? 5000;
        const sendLamports = balance - actualFee;

        console.log(`[ActivityBot] Draining wallet ${i}: ${sendLamports} lamports (fee: ${actualFee})`);
        if (sendLamports <= 0) continue;

        // Build final tx with correct amount
        const drainTx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: kp.publicKey,
            toPubkey: vaultKeypair.publicKey,
            lamports: sendLamports,
          })
        );
        drainTx.recentBlockhash = blockhash;
        drainTx.feePayer = kp.publicKey;
        drainTx.sign(kp);

        const sig = await connection.sendRawTransaction(drainTx.serialize(), { skipPreflight: false });
        await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
        console.log(`[ActivityBot] Drained wallet ${i}: ${sig}`);
        drainTxSigs.push(sig);
      } catch (err: any) {
        console.error(`[ActivityBot] Failed to drain wallet ${i}:`, err?.message || err);
      }
    }

    activityKeypairs = [];
    activityWallets = [];
    phase = 'idle';
    phaseMessage = '';
    isBusy = false;
    return { success: true, drainSigs: drainTxSigs };
  } catch (err: any) {
    phase = 'idle';
    phaseMessage = '';
    isBusy = false;
    return { success: false, drainSigs: drainTxSigs, error: err?.message || String(err) };
  }
}

export function getActivityBotStatus(): BotStatus {
  return {
    running: isRunning,
    walletCount: activityKeypairs.length,
    intervalMinutes: configIntervalMinutes,
    solPerWallet: configSolPerWallet,
    totalTxCount,
    wallets: [...activityWallets],
    nextRunIn: nextRunAt ? Math.max(0, Math.round((nextRunAt - Date.now()) / 1000)) : null,
    fundingTxSigs: [...fundingTxSigs],
    drainTxSigs: [...drainTxSigs],
    phase,
    phaseMessage,
  };
}
