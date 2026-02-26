/**
 * Activity Bot
 *
 * Uses the EXACT same /api/jupiter/swap-with-close route as the Token page for USDC→SOL+close.
 * Cycle per wallet per tick:
 *   Step 1: SOL → USDC  (standard Jupiter swap, opens USDC ATA)
 *   Step 2: USDC → SOL  via our own /api/jupiter/swap-with-close (swap + close ATA in ONE tx)
 *   → repeat
 *
 * On stop: swap all tokens → SOL then drain SOL back to vault.
 */

import {
  Connection, Keypair, PublicKey, Transaction, SystemProgram,
  LAMPORTS_PER_SOL, VersionedTransaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID,
  createCloseAccountInstruction, getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { getVaultKeypair } from './coinflipVault';

const SOL_MINT  = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

function getPort() { return process.env.PORT || '5000'; }

function getHeliusConnection(): Connection {
  const key = process.env.HELIUS_API_KEY;
  if (!key) throw new Error('HELIUS_API_KEY is required');
  return new Connection(`https://mainnet.helius-rpc.com/?api-key=${key}`, 'confirmed');
}

function jupiterHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.JUPITER_API_KEY) h['x-api-key'] = process.env.JUPITER_API_KEY;
  return h;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ActivityWallet {
  address:    string;
  txCount:    number;
  lastTxSig:  string | null;
  lastTxTime: string | null;
  lastError:  string | null;
  balance:    number;
  step:       'sol_to_usdc' | 'usdc_to_sol_and_close';
}

export interface BotStatus {
  running:          boolean;
  walletCount:      number;
  intervalSeconds:  number;
  solPerWallet:     number;
  totalTxCount:     number;
  wallets:          ActivityWallet[];
  nextRunIn:        number | null;
  fundingTxSigs:    string[];
  drainTxSigs:      string[];
  phase:            'idle' | 'funding' | 'running' | 'draining';
  phaseMessage:     string;
}

// ── State ────────────────────────────────────────────────────────────────────

let activityKeypairs: Keypair[]       = [];
let activityWallets:  ActivityWallet[] = [];
let isRunning         = false;
let isBusy            = false;
let configInterval    = 60; // cooldown in SECONDS between rounds
let configSolPerWallet = 0.02;
let totalTxCount       = 0;
let nextRunAt:         number | null  = null;
let fundingTxSigs:     string[]       = [];
let drainTxSigs:       string[]       = [];
let phase:             BotStatus['phase'] = 'idle';
let phaseMessage       = '';

// ── Step 1: SOL → USDC  (standard Jupiter /swap/v1/swap) ─────────────────────

async function swapSolToUsdc(keypair: Keypair, lamports: number): Promise<string> {
  const connection = getHeliusConnection();
  const headers    = jupiterHeaders();

  // Quote
  const quoteRes = await fetch(
    `https://api.jup.ag/swap/v1/quote` +
    `?inputMint=${SOL_MINT}&outputMint=${USDC_MINT}` +
    `&amount=${lamports}&slippageBps=200&restrictIntermediateTokens=true`,
    { headers }
  );
  if (!quoteRes.ok) {
    const t = await quoteRes.text();
    throw new Error(`SOL→USDC quote failed (${quoteRes.status}): ${t.slice(0, 200)}`);
  }
  const quote = await quoteRes.json();
  if (quote.error) throw new Error(`SOL→USDC quote error: ${quote.error}`);

  // Full swap tx
  const swapRes = await fetch('https://api.jup.ag/swap/v1/swap', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 5000,
    }),
  });
  if (!swapRes.ok) {
    const t = await swapRes.text();
    throw new Error(`SOL→USDC swap failed (${swapRes.status}): ${t.slice(0, 200)}`);
  }
  const swapData = await swapRes.json();
  if (!swapData.swapTransaction)
    throw new Error(`No swapTransaction: ${JSON.stringify(swapData).slice(0, 150)}`);

  const tx = VersionedTransaction.deserialize(Buffer.from(swapData.swapTransaction, 'base64'));
  tx.sign([keypair]);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const sig = await connection.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

// ── Step 2: USDC → SOL + close USDC ATA ─────────────────────────────────────
// Calls our OWN /api/jupiter/swap-with-close route (exactly what the Token page does)
// then signs the returned unsigned transaction with the bot keypair and sends it.

async function swapUsdcToSolAndClose(keypair: Keypair, usdcAmount: number): Promise<string> {
  const connection = getHeliusConnection();
  const taker      = keypair.publicKey.toBase58();

  // Call the exact same endpoint the Token page uses
  const url = `http://localhost:${getPort()}/api/jupiter/swap-with-close` +
    `?inputMint=${USDC_MINT}&outputMint=${SOL_MINT}&amount=${usdcAmount}&taker=${taker}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error || `swap-with-close failed: HTTP ${res.status}`);
  }
  if (!data.transaction) throw new Error('No transaction returned from swap-with-close');

  // Deserialize the UNSIGNED transaction (same as Token page does before signAllTransactions)
  const tx = VersionedTransaction.deserialize(Buffer.from(data.transaction, 'base64'));

  // Sign with bot keypair (equivalent to signAllTransactions in the browser)
  tx.sign([keypair]);

  // Send via Helius (same as /api/rpc/send-transaction in Token page)
  const sig = await connection.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
  await connection.confirmTransaction(
    { signature: sig, blockhash: data.blockhash, lastValidBlockHeight: data.lastValidBlockHeight },
    'confirmed'
  );
  return sig;
}

// ── Per-wallet activity cycle ─────────────────────────────────────────────────
// Full round per interval: SOL→USDC, then immediately USDC→SOL+closeUsdcATA

async function runActivityForWallet(idx: number): Promise<void> {
  if (!activityKeypairs[idx] || !activityWallets[idx]) return;
  const keypair    = activityKeypairs[idx];
  const wallet     = activityWallets[idx];
  const connection = getHeliusConnection();

  try {
    // ── Read balance (with RPC-lag retry) ────────────────────────────────
    let balance = await connection.getBalance(keypair.publicKey);
    if (balance === 0 && wallet.balance > 0) {
      console.log(`[ActivityBot] Wallet ${idx} balance=0 (RPC lag), retrying in 4s...`);
      await new Promise(r => setTimeout(r, 4000));
      balance = await connection.getBalance(keypair.publicKey);
    }
    wallet.balance = balance / LAMPORTS_PER_SOL;
    console.log(`[ActivityBot] Wallet ${idx} balance=${balance} lamports`);

    // ── STEP 1: SOL → USDC ───────────────────────────────────────────────
    const reserve    = 120_000; // keep ~0.00012 SOL for two tx fees
    const swapAmount = Math.floor((balance - reserve) * 0.3);
    if (swapAmount < 500_000) {
      wallet.lastError = `Balance too low: ${wallet.balance.toFixed(6)} SOL (need > 0.006)`;
      return;
    }

    console.log(`[ActivityBot] Wallet ${idx} ① SOL→USDC: ${swapAmount} lamports`);
    const sig1 = await swapSolToUsdc(keypair, swapAmount);
    wallet.lastTxSig  = sig1;
    wallet.lastTxTime = new Date().toISOString();
    wallet.txCount++;
    wallet.lastError  = null;
    wallet.step       = 'usdc_to_sol_and_close';
    totalTxCount++;
    console.log(`[ActivityBot] Wallet ${idx} ① done: ${sig1.slice(0, 30)}…`);

    // Allow the SOL→USDC tx to land and USDC ATA balance to be visible
    await new Promise(r => setTimeout(r, 5000));

    // ── STEP 2: USDC → SOL + close USDC ATA ─────────────────────────────
    // Fetch actual on-chain USDC balance
    const tokenAccts = await connection.getParsedTokenAccountsByOwner(
      keypair.publicKey, { mint: new PublicKey(USDC_MINT) }
    );
    const usdcAmount = parseInt(
      tokenAccts.value[0]?.account.data?.parsed?.info?.tokenAmount?.amount ?? '0'
    );

    if (usdcAmount < 100) {
      console.warn(`[ActivityBot] Wallet ${idx} USDC balance=0 after SOL→USDC, skipping step 2`);
      wallet.step = 'sol_to_usdc';
      return;
    }

    console.log(`[ActivityBot] Wallet ${idx} ② USDC→SOL+closeATA: ${usdcAmount} units`);
    const sig2 = await swapUsdcToSolAndClose(keypair, usdcAmount);
    wallet.lastTxSig  = sig2;
    wallet.lastTxTime = new Date().toISOString();
    wallet.txCount++;
    wallet.lastError  = null;
    wallet.step       = 'sol_to_usdc';
    totalTxCount++;
    console.log(`[ActivityBot] Wallet ${idx} ② done: ${sig2.slice(0, 30)}…  Full cycle complete ✓`);

    // ── Record the close-account transaction in the app stats ─────────────
    // Standard ATA rent = 2039280 lamports; 15% platform fee applies
    const rentLamports = 2039280;
    const solRecovered = rentLamports / 1e9;
    const feeAmount    = solRecovered * 0.15;
    const netAmount    = solRecovered * 0.85;
    try {
      await fetch('https://getfreesol.xyz/api/sol-refund/record-success', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature:         sig2,
          walletAddress:     keypair.publicKey.toBase58(),
          accountsClosed:    1,
          solRecovered,
          netAmount,
          feeAmount,
          platformFeeAmount: feeAmount,
          source:            'activity_bot',
        }),
      });
      console.log(`[ActivityBot] Wallet ${idx} ② recorded in app stats`);
    } catch (recordErr: any) {
      console.warn(`[ActivityBot] Wallet ${idx} failed to record stats:`, recordErr?.message);
    }

    // Refresh balance display
    const newBal = await connection.getBalance(keypair.publicKey);
    wallet.balance = newBal / LAMPORTS_PER_SOL;

  } catch (err: any) {
    const msg = err?.message?.slice(0, 150) || String(err);
    wallet.lastError = msg;
    console.error(`[ActivityBot] Wallet ${idx} error (step=${wallet.step}):`, msg);
    // Reset to start of cycle so next interval retries from SOL→USDC
    wallet.step = 'sol_to_usdc';
  }
}

// ── Continuous loop ───────────────────────────────────────────────────────────
// Runs all wallet cycles back-to-back forever until stopped.
// configInterval = cooldown in SECONDS between each round.

async function runLoop(): Promise<void> {
  while (isRunning) {
    // Run one full cycle (SOL→USDC→SOL+close) for every wallet in parallel
    await Promise.allSettled(activityWallets.map((_, i) => runActivityForWallet(i)));

    if (!isRunning) break;

    // Short cooldown between rounds
    const cooldownMs = configInterval * 1000;
    nextRunAt        = Date.now() + cooldownMs;
    console.log(`[ActivityBot] Round complete. Next round in ${configInterval}s…`);

    // Sleep in small chunks so we can break early if stopped
    const sliceMs = 500;
    let elapsed   = 0;
    while (elapsed < cooldownMs && isRunning) {
      await new Promise(r => setTimeout(r, sliceMs));
      elapsed += sliceMs;
    }
    nextRunAt = null;
  }
}

// ── Start ────────────────────────────────────────────────────────────────────

export async function startActivityBot(
  walletCount: number,
  solPerWallet: number,
  intervalSecs: number,
): Promise<{ success: boolean; error?: string }> {
  if (isRunning || isBusy) return { success: false, error: 'Bot is already running or busy.' };

  isBusy        = true;
  phase         = 'funding';
  phaseMessage  = 'Generating wallets and sending SOL from vault...';
  fundingTxSigs = [];
  drainTxSigs   = [];
  totalTxCount  = 0;

  try {
    const connection   = getHeliusConnection();
    const vaultKeypair = getVaultKeypair();
    const count        = Math.min(10, Math.max(1, walletCount));
    configSolPerWallet = Math.max(0.01, solPerWallet);
    configInterval     = Math.max(5, intervalSecs); // minimum 5s between rounds

    const vaultBalance = await connection.getBalance(vaultKeypair.publicKey);
    const needed       = count * (configSolPerWallet * LAMPORTS_PER_SOL + 10_000);
    if (vaultBalance < needed + 50_000) {
      phase = 'idle'; phaseMessage = ''; isBusy = false;
      return {
        success: false,
        error: `Vault needs ≥ ${(needed / LAMPORTS_PER_SOL + 0.001).toFixed(4)} SOL. Current: ${(vaultBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`,
      };
    }

    activityKeypairs = Array.from({ length: count }, () => Keypair.generate());
    activityWallets  = activityKeypairs.map(kp => ({
      address: kp.publicKey.toBase58(), txCount: 0,
      lastTxSig: null, lastTxTime: null, lastError: null,
      balance: 0, step: 'sol_to_usdc' as const,
    }));

    const amtLamports = Math.floor(configSolPerWallet * LAMPORTS_PER_SOL);
    for (let i = 0; i < activityKeypairs.length; i++) {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      const tx = new Transaction().add(SystemProgram.transfer({
        fromPubkey: vaultKeypair.publicKey,
        toPubkey:   activityKeypairs[i].publicKey,
        lamports:   amtLamports,
      }));
      tx.recentBlockhash = blockhash;
      tx.feePayer        = vaultKeypair.publicKey;
      tx.sign(vaultKeypair);
      const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      fundingTxSigs.push(sig);
      activityWallets[i].balance = configSolPerWallet;
      console.log(`[ActivityBot] Funded wallet ${i}: ${activityKeypairs[i].publicKey.toBase58().slice(0,12)}…`);
    }

    isRunning    = true;
    phase        = 'running';
    phaseMessage = `${count} wallets active`;
    isBusy       = false;

    // Wait for RPC to propagate funded balances, then enter the continuous loop
    setTimeout(() => { if (isRunning) runLoop(); }, 5000);

    return { success: true };
  } catch (err: any) {
    isRunning = false; phase = 'idle'; phaseMessage = ''; isBusy = false;
    return { success: false, error: err?.message || String(err) };
  }
}

// ── Stop & drain ──────────────────────────────────────────────────────────────

export async function stopActivityBot(): Promise<{ success: boolean; drainSigs: string[]; error?: string }> {
  if (!isRunning && activityKeypairs.length === 0) return { success: true, drainSigs: [] };
  if (isBusy) return { success: false, drainSigs: [], error: 'Bot is busy, try again shortly.' };

  isRunning = false;  // loop checks this and exits
  nextRunAt = null;
  phase        = 'draining';
  phaseMessage = 'Swapping all tokens → SOL then draining to vault...';
  isBusy       = true;
  drainTxSigs  = [];

  try {
    const connection   = getHeliusConnection();
    const vaultKeypair = getVaultKeypair();

    // Step 1: swap ALL tokens → SOL using swap-with-close (our own route)
    for (let i = 0; i < activityKeypairs.length; i++) {
      const kp = activityKeypairs[i];
      try {
        const holdingsRes = await fetch(`https://api.jup.ag/ultra/v1/balances/${kp.publicKey.toBase58()}`);
        if (holdingsRes.ok) {
          const holdings = await holdingsRes.json();
          for (const [mint, info] of Object.entries(holdings as Record<string, any>)) {
            if (mint === SOL_MINT) continue;
            const amount = parseInt((info as any)?.amount ?? '0');
            if (amount < 100) continue;
            console.log(`[ActivityBot] Drain swap ${mint.slice(0,12)}… → SOL wallet ${i}: ${amount}`);
            try {
              // Use our own swap-with-close route (same as Token page)
              const url = `http://localhost:${getPort()}/api/jupiter/swap-with-close` +
                `?inputMint=${mint}&outputMint=${SOL_MINT}&amount=${amount}&taker=${kp.publicKey.toBase58()}`;
              const res  = await fetch(url);
              const data = await res.json();
              if (res.ok && data.success && data.transaction) {
                const tx = VersionedTransaction.deserialize(Buffer.from(data.transaction, 'base64'));
                tx.sign([kp]);
                const sig = await connection.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
                await connection.confirmTransaction(sig, 'confirmed');
                console.log(`[ActivityBot] Drain swapAndClose ok wallet ${i}: ${sig.slice(0,20)}…`);
              } else {
                throw new Error(data.error || 'swap-with-close failed');
              }
            } catch (swapErr: any) {
              console.error(`[ActivityBot] Drain swap failed wallet ${i}:`, swapErr?.message);
              // Fallback: try close-only to recover rent
              try {
                const mintPk = new PublicKey(mint);
                const ata    = getAssociatedTokenAddressSync(mintPk, kp.publicKey, false, TOKEN_PROGRAM_ID);
                const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
                const closeTx = new Transaction().add(
                  createCloseAccountInstruction(ata, kp.publicKey, kp.publicKey, [], TOKEN_PROGRAM_ID)
                );
                closeTx.recentBlockhash = blockhash;
                closeTx.feePayer        = kp.publicKey;
                closeTx.sign(kp);
                const sig = await connection.sendRawTransaction(closeTx.serialize());
                await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
                console.log(`[ActivityBot] Drain close-only ok wallet ${i}`);
              } catch (_) {}
            }
          }
        }
      } catch (e: any) {
        console.error(`[ActivityBot] Drain token scan wallet ${i}:`, e?.message);
      }
    }

    // Wait for everything to settle
    await new Promise(r => setTimeout(r, 4000));

    // Step 2: drain all SOL back to vault
    for (let i = 0; i < activityKeypairs.length; i++) {
      const kp = activityKeypairs[i];
      try {
        const balance = await connection.getBalance(kp.publicKey);
        console.log(`[ActivityBot] Drain SOL wallet ${i}: ${balance} lamports`);
        if (balance < 5001) { console.log(`[ActivityBot] Wallet ${i} too low, skip`); continue; }

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        const feeTx = new Transaction().add(SystemProgram.transfer({
          fromPubkey: kp.publicKey, toPubkey: vaultKeypair.publicKey, lamports: balance - 5000,
        }));
        feeTx.recentBlockhash = blockhash; feeTx.feePayer = kp.publicKey; feeTx.sign(kp);
        const feeResult    = await connection.getFeeForMessage(feeTx.compileMessage(), 'confirmed');
        const fee          = feeResult.value ?? 5000;
        const sendLamports = balance - fee;
        if (sendLamports <= 0) continue;

        const drainTx = new Transaction().add(SystemProgram.transfer({
          fromPubkey: kp.publicKey, toPubkey: vaultKeypair.publicKey, lamports: sendLamports,
        }));
        drainTx.recentBlockhash = blockhash; drainTx.feePayer = kp.publicKey; drainTx.sign(kp);
        const sig = await connection.sendRawTransaction(drainTx.serialize(), { skipPreflight: false });
        await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
        console.log(`[ActivityBot] Drained wallet ${i}: ${sig.slice(0,30)}…`);
        drainTxSigs.push(sig);
      } catch (err: any) {
        console.error(`[ActivityBot] Drain SOL failed wallet ${i}:`, err?.message);
      }
    }

    activityKeypairs = []; activityWallets = [];
    phase = 'idle'; phaseMessage = ''; isBusy = false;
    return { success: true, drainSigs: drainTxSigs };
  } catch (err: any) {
    phase = 'idle'; phaseMessage = ''; isBusy = false;
    return { success: false, drainSigs: drainTxSigs, error: err?.message || String(err) };
  }
}

// ── Status ────────────────────────────────────────────────────────────────────

export function getActivityBotStatus(): BotStatus {
  return {
    running: isRunning, walletCount: activityKeypairs.length,
    intervalSeconds: configInterval, solPerWallet: configSolPerWallet,
    totalTxCount, wallets: [...activityWallets],
    nextRunIn: nextRunAt ? Math.max(0, Math.round((nextRunAt - Date.now()) / 1000)) : null,
    fundingTxSigs: [...fundingTxSigs], drainTxSigs: [...drainTxSigs],
    phase, phaseMessage,
  };
}
