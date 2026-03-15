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

const SOL_MINT        = 'So11111111111111111111111111111111111111112';
const USDC_MINT       = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const PLATFORM_WALLET = new PublicKey('GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT');
const PLATFORM_FEE    = 0.20; // 20%

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
  step:       string;
}

export interface BotStatus {
  running:           boolean;
  walletCount:       number;
  intervalSeconds:   number;
  solPerWallet:      number;
  tokensPerCycle:    number;
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
let isRunning          = false;
let isBusy             = false;
let configInterval     = 60;   // cooldown in SECONDS between rounds
let configSolPerWallet = 0.02;
let configTokensPerCycle = 20; // how many different random tokens per cycle
let totalTxCount       = 0;
let nextRunAt:         number | null  = null;
let fundingTxSigs:     string[]       = [];
let drainTxSigs:       string[]       = [];
let phase:             BotStatus['phase'] = 'idle';
let phaseMessage       = '';

// ── Random token list ─────────────────────────────────────────────────────────
// Liquid Solana tokens available on Jupiter — bot picks randomly each cycle

// Only high-liquidity tokens confirmed active on Jupiter mainnet
const RANDOM_TOKENS: Array<{ mint: string; symbol: string }> = [
  { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC'   },
  { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT'   },
  { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'BONK'   },
  { mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', symbol: 'WIF'    },
  { mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',  symbol: 'JUP'    },
  { mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', symbol: 'RAY'    },
  { mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',  symbol: 'mSOL'   },
  { mint: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3', symbol: 'PYTH'   },
  { mint: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',  symbol: 'ORCA'   },
  { mint: 'DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7', symbol: 'DRIFT'  },
  { mint: 'MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey',  symbol: 'MNDE'   },
  { mint: 'nosXBVoaCTtYdLvKY6Csb4AC8JCdQKKAaWYtx2ZMoo7',  symbol: 'NOS'    },
  { mint: '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj',  symbol: 'stSOL'  },
  { mint: 'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1',   symbol: 'bSOL'   },
  { mint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',  symbol: 'jitoSOL'},
  { mint: 'WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk',    symbol: 'WEN'    },
  { mint: 'jtojtomepa8b1trahX9S2RmD79m37LjXBKKpGrBDzC',     symbol: 'JTO'    },
  { mint: 'w1oKSHD3ZwGHbUWnAjt9koujJoXwKJnvHFZXFLwmYqT',   symbol: 'W'      },
  { mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',   symbol: 'ETH'    },
  { mint: 'MEFNBXixkEbait3xn9bkfu8xAN26sVgyvzzn6FCAgfY',    symbol: 'ME'     },
  { mint: 'METAewgxyPbgwsseH8T16a39CQ5VyVxZi9zXiDPY18m',    symbol: 'META'   },
  { mint: 'TNSRxcUxoT9xBG3de7A9Ed1RNYpzxhbTHfEVnBmakS7',   symbol: 'TNSR'   },
  { mint: 'EchesyfXePKdLtoiZSL8pBe8Myagyy8ZRqsACNCFGnvp',   symbol: 'FIDA'   },
  { mint: 'So11111111111111111111111111111111111111112',      symbol: 'wSOL'   },
  { mint: 'mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6',    symbol: 'MOBILE' },
];

// Cost model per token bought in a cycle:
//   0.002 SOL   → swap amount (fixed per token)
//   0.00203928  → ATA creation rent (recovered when closed)
// RESERVE kept for tx fees (≈ numTokens × 3 txs × 5000 lamports + padding)
const SWAP_PER_TOKEN   = 2_000_000;   // 0.002 SOL
const ATA_RENT         = 2_039_280;   // standard SPL ATA rent
const COST_PER_TOKEN   = SWAP_PER_TOKEN + ATA_RENT; // ~0.00404 SOL
const BASE_RESERVE     = 5_000_000;   // 0.005 SOL base fee reserve
const MAX_TOKENS_CYCLE = 20;

/** Shuffle array in-place (Fisher-Yates) */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Generic swap: SOL → any token ────────────────────────────────────────────

async function swapSolToToken(keypair: Keypair, tokenMint: string, lamports: number): Promise<string> {
  const connection = getHeliusConnection();
  const headers    = jupiterHeaders();

  const quoteRes = await fetch(
    `https://api.jup.ag/swap/v1/quote` +
    `?inputMint=${SOL_MINT}&outputMint=${tokenMint}` +
    `&amount=${lamports}&slippageBps=300&restrictIntermediateTokens=true`,
    { headers }
  );
  if (!quoteRes.ok) throw new Error(`SOL→${tokenMint.slice(0,8)} quote failed (${quoteRes.status}): ${(await quoteRes.text()).slice(0, 150)}`);
  const quote = await quoteRes.json();
  if (quote.error) throw new Error(`SOL→token quote error: ${quote.error}`);

  const swapRes = await fetch('https://api.jup.ag/swap/v1/swap', {
    method: 'POST', headers,
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 5000,
    }),
  });
  if (!swapRes.ok) throw new Error(`SOL→token swap failed (${swapRes.status}): ${(await swapRes.text()).slice(0, 150)}`);
  const swapData = await swapRes.json();
  if (!swapData.swapTransaction) throw new Error(`No swapTransaction in response`);

  const tx = VersionedTransaction.deserialize(Buffer.from(swapData.swapTransaction, 'base64'));
  tx.sign([keypair]);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const sig = await connection.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

// ── Generic swap: any token → SOL (NO close) ─────────────────────────────────

async function swapTokenToSol(keypair: Keypair, tokenMint: string, tokenAmount: number): Promise<string> {
  const connection = getHeliusConnection();
  const headers    = jupiterHeaders();

  const quoteRes = await fetch(
    `https://api.jup.ag/swap/v1/quote` +
    `?inputMint=${tokenMint}&outputMint=${SOL_MINT}` +
    `&amount=${tokenAmount}&slippageBps=300&restrictIntermediateTokens=true`,
    { headers }
  );
  if (!quoteRes.ok) throw new Error(`token→SOL quote failed (${quoteRes.status}): ${(await quoteRes.text()).slice(0, 150)}`);
  const quote = await quoteRes.json();
  if (quote.error) throw new Error(`token→SOL quote error: ${quote.error}`);

  const swapRes = await fetch('https://api.jup.ag/swap/v1/swap', {
    method: 'POST', headers,
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 5000,
    }),
  });
  if (!swapRes.ok) throw new Error(`token→SOL swap failed (${swapRes.status}): ${(await swapRes.text()).slice(0, 150)}`);
  const swapData = await swapRes.json();
  if (!swapData.swapTransaction) throw new Error(`No swapTransaction in response`);

  const tx = VersionedTransaction.deserialize(Buffer.from(swapData.swapTransaction, 'base64'));
  tx.sign([keypair]);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const sig = await connection.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

// ── Generic close ATA + pay 15% platform fee in same tx ──────────────────────

async function closeTokenAta(
  keypair:   Keypair,
  tokenMint: string,
  prog:      PublicKey = TOKEN_PROGRAM_ID
): Promise<string> {
  const connection = getHeliusConnection();
  const ata = getAssociatedTokenAddressSync(new PublicKey(tokenMint), keypair.publicKey, false, prog);

  const feeLamports  = Math.floor(ATA_RENT * PLATFORM_FEE);   // 305 892
  const netLamports  = ATA_RENT - feeLamports;
  const solRecovered = ATA_RENT / 1e9;
  const feeAmount    = feeLamports / 1e9;
  const netAmount    = netLamports / 1e9;

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction()
    .add(createCloseAccountInstruction(ata, keypair.publicKey, keypair.publicKey, [], prog))
    .add(SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey: PLATFORM_WALLET, lamports: feeLamports }));
  tx.recentBlockhash = blockhash;
  tx.feePayer        = keypair.publicKey;
  tx.sign(keypair);

  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  console.log(`[ActivityBot] ATA closed + 20% fee paid → ${sig.slice(0, 30)}…`);

  // Record in app stats
  fetch('https://getfreesol.xyz/api/sol-refund/record-success', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      signature: sig, walletAddress: keypair.publicKey.toBase58(),
      accountsClosed: 1, solRecovered, netAmount, feeAmount,
      platformFeeAmount: feeAmount, source: 'activity_bot',
    }),
  }).catch(() => {});

  return sig;
}

// ── Batch-close ATAs (up to 20 per tx) + pay 20% fee + record ─────────────────

async function batchCloseATAs(keypair: Keypair, emptyAccounts: Array<{ accountAddress: string; rentAmount: string }>): Promise<string[]> {
  const connection = getHeliusConnection();
  const sigs: string[] = [];
  const BATCH = 20;

  for (let i = 0; i < emptyAccounts.length; i += BATCH) {
    const chunk = emptyAccounts.slice(i, i + BATCH);
    try {
      // Total rent for this batch and 20% fee
      const totalRentLamports = chunk.reduce((s, a) => s + Math.round(parseFloat(a.rentAmount) * 1e9), 0);
      const feeLamports       = Math.floor(totalRentLamports * PLATFORM_FEE);
      const netLamports       = totalRentLamports - feeLamports;

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      const tx = new Transaction();

      for (const acct of chunk) {
        const ataAddr  = new PublicKey(acct.accountAddress);
        const acctInfo = await connection.getAccountInfo(ataAddr);
        const prog     = acctInfo?.owner?.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
        tx.add(createCloseAccountInstruction(ataAddr, keypair.publicKey, keypair.publicKey, [], prog));
      }
      // One platform fee transfer covering the whole batch
      tx.add(SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey: PLATFORM_WALLET, lamports: feeLamports }));

      tx.recentBlockhash = blockhash;
      tx.feePayer        = keypair.publicKey;
      tx.sign(keypair);

      const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      sigs.push(sig);
      console.log(`[ActivityBot] Batch-close ${chunk.length} ATAs + 20% fee → ${sig.slice(0, 30)}…`);

      // Record in app (one entry covers whole batch)
      const solRecovered = totalRentLamports / 1e9;
      const feeAmount    = feeLamports / 1e9;
      const netAmount    = netLamports  / 1e9;
      fetch('https://getfreesol.xyz/api/sol-refund/record-success', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature: sig, walletAddress: keypair.publicKey.toBase58(),
          accountsClosed: chunk.length, solRecovered, netAmount, feeAmount,
          platformFeeAmount: feeAmount, source: 'activity_bot',
        }),
      }).catch(() => {});
    } catch (e: any) {
      console.error(`[ActivityBot] Batch-close error (batch ${i / BATCH}):`, e?.message?.slice(0, 120));
    }
  }
  return sigs;
}

// ── Per-wallet activity cycle ─────────────────────────────────────────────────
// Each round:
//   ① Pick configTokensPerCycle random tokens (shuffled, 0.002 SOL each)
//   ② SOL → each token  (opens ATA per token)
//   ③ token → SOL       (swaps back, leaves ATA empty)
//   ④ App scan → batch-close all empty ATAs (20 per tx) + pay 20% fee

async function runActivityForWallet(idx: number): Promise<void> {
  if (!activityKeypairs[idx] || !activityWallets[idx]) return;
  const keypair    = activityKeypairs[idx];
  const wallet     = activityWallets[idx];
  const connection = getHeliusConnection();
  const port       = getPort();

  try {
    // ── Balance check (RPC-lag retry) ────────────────────────────────────
    let balance = await connection.getBalance(keypair.publicKey);
    if (balance === 0 && wallet.balance > 0) {
      console.log(`[ActivityBot] Wallet ${idx} balance=0 (RPC lag), retrying 4s…`);
      await new Promise(r => setTimeout(r, 4000));
      balance = await connection.getBalance(keypair.publicKey);
    }
    wallet.balance = balance / LAMPORTS_PER_SOL;

    const n = Math.min(configTokensPerCycle, RANDOM_TOKENS.length);
    const minNeeded = n * COST_PER_TOKEN + BASE_RESERVE;
    if (balance < minNeeded) {
      wallet.lastError = `Balance too low: ${wallet.balance.toFixed(6)} SOL (need ≥${(minNeeded / 1e9).toFixed(4)} SOL for ${n} tokens)`;
      return;
    }

    // ── ① Pick random tokens ─────────────────────────────────────────────
    const selected = shuffle([...RANDOM_TOKENS]).slice(0, n);
    console.log(`[ActivityBot] Wallet ${idx} cycle: ${n} tokens — ${selected.map(t => t.symbol).join(', ')}`);
    wallet.step = `buying ${n} tokens`;

    // ── ② SOL → each token (0.002 SOL each) ─────────────────────────────
    const boughtMints: string[] = [];
    for (const token of selected) {
      try {
        wallet.step = `SOL→${token.symbol}`;
        const sig = await swapSolToToken(keypair, token.mint, SWAP_PER_TOKEN);
        boughtMints.push(token.mint);
        wallet.lastTxSig  = sig;
        wallet.lastTxTime = new Date().toISOString();
        wallet.txCount++;
        totalTxCount++;
        wallet.lastError = null;
        console.log(`[ActivityBot] Wallet ${idx} ② SOL→${token.symbol} ✓ ${sig.slice(0, 28)}…`);
        await new Promise(r => setTimeout(r, 1500));
      } catch (e: any) {
        console.error(`[ActivityBot] Wallet ${idx} ② SOL→${token.symbol} FAILED:`, e?.message?.slice(0, 100));
      }
    }

    if (boughtMints.length === 0) {
      wallet.lastError = 'All buys failed, skipping sell+close';
      return;
    }

    // Wait for all buys to land on-chain (extra time to avoid RPC lag)
    await new Promise(r => setTimeout(r, 8000));

    // ── ③ token → SOL (no close — leaves ATA empty for scan) ─────────────
    wallet.step = 'selling tokens→SOL';
    for (const token of selected.filter(t => boughtMints.includes(t.mint))) {
      try {
        const accts  = await connection.getParsedTokenAccountsByOwner(keypair.publicKey, { mint: new PublicKey(token.mint) });
        const amount = parseInt(accts.value[0]?.account.data?.parsed?.info?.tokenAmount?.amount ?? '0');
        if (amount < 1) { console.warn(`[ActivityBot] Wallet ${idx} ③ ${token.symbol} amount=0`); continue; }

        wallet.step = `${token.symbol}→SOL`;
        const sig = await swapTokenToSol(keypair, token.mint, amount);
        wallet.lastTxSig  = sig;
        wallet.lastTxTime = new Date().toISOString();
        wallet.txCount++;
        totalTxCount++;
        wallet.lastError = null;
        console.log(`[ActivityBot] Wallet ${idx} ③ ${token.symbol}→SOL ✓ ${sig.slice(0, 28)}…`);
        await new Promise(r => setTimeout(r, 1500));
      } catch (e: any) {
        console.error(`[ActivityBot] Wallet ${idx} ③ ${token.symbol}→SOL FAILED:`, e?.message?.slice(0, 100));
      }
    }

    // Wait for sells to settle on-chain before scanning
    await new Promise(r => setTimeout(r, 7000));

    // ── ④ App scan → batch-close all empty ATAs (up to 20 per tx) ────────
    wallet.step = 'scanning+claiming rent';
    try {
      const scanRes  = await fetch(`http://localhost:${port}/api/sol-refund/scan/${keypair.publicKey.toBase58()}`);
      const scanData = await scanRes.json();

      if (scanRes.ok && scanData.success && scanData.accounts?.length > 0) {
        console.log(`[ActivityBot] Wallet ${idx} ④ scan found ${scanData.emptyAccounts} empty ATAs → batch-closing`);
        const closeSigs = await batchCloseATAs(keypair, scanData.accounts);
        if (closeSigs.length > 0) {
          wallet.lastTxSig  = closeSigs[closeSigs.length - 1];
          wallet.lastTxTime = new Date().toISOString();
          wallet.txCount   += closeSigs.length;
          totalTxCount     += closeSigs.length;
          wallet.lastError  = null;
        }
      } else {
        console.log(`[ActivityBot] Wallet ${idx} ④ scan: no empty ATAs found`);
      }
    } catch (e: any) {
      console.error(`[ActivityBot] Wallet ${idx} ④ scan/close error:`, e?.message?.slice(0, 120));
    }

    wallet.step = 'idle';
    const newBal = await connection.getBalance(keypair.publicKey);
    wallet.balance = newBal / LAMPORTS_PER_SOL;
    console.log(`[ActivityBot] Wallet ${idx} cycle ✓  bal=${wallet.balance.toFixed(6)} SOL`);

  } catch (err: any) {
    const msg = err?.message?.slice(0, 150) || String(err);
    wallet.lastError = msg;
    wallet.step = 'error';
    console.error(`[ActivityBot] Wallet ${idx} cycle error:`, msg);
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
  tokensPerCycle: number = 20,
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
    configSolPerWallet   = Math.max(0.01, solPerWallet);
    configInterval       = Math.max(5, intervalSecs);
    configTokensPerCycle = Math.min(20, Math.max(1, tokensPerCycle));

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

    // Drain order per wallet:
    //   ① Sweep tokens → SOL  (USDC swap, other tokens swap+close)
    //   ② Scan via app API → close all empty ATAs → claim rent → record in app
    //   ③ Drain SOL to vault
    const port = getPort();

    for (let i = 0; i < activityKeypairs.length; i++) {
      const kp      = activityKeypairs[i];
      const address = kp.publicKey.toBase58();

      // ── ①: Swap ALL remaining non-SOL token balances → SOL ───────────────
      //   Uses generic swapTokenToSol for any token the bot may have bought.
      //   Leaves each ATA empty so step ② can scan and close them.
      try {
        const allAccts = await connection.getParsedTokenAccountsByOwner(
          kp.publicKey, { programId: TOKEN_PROGRAM_ID }
        );
        const all2022Accts = await connection.getParsedTokenAccountsByOwner(
          kp.publicKey, { programId: TOKEN_2022_PROGRAM_ID }
        );
        const allTokenAccts = [...allAccts.value, ...all2022Accts.value];

        for (const acct of allTokenAccts) {
          const parsed = acct.account.data?.parsed?.info;
          const mint   = parsed?.mint as string;
          const amount = parseInt(parsed?.tokenAmount?.amount ?? '0');
          if (!mint || amount < 1) continue;
          try {
            console.log(`[ActivityBot] Drain wallet ${i} ①: ${mint.slice(0,12)}… (${amount}) → swap to SOL`);
            await swapTokenToSol(kp, mint, amount);
            await new Promise(r => setTimeout(r, 2000));
          } catch (e: any) {
            console.error(`[ActivityBot] Drain wallet ${i} ① swap error (${mint.slice(0,8)}):`, e?.message?.slice(0, 100));
          }
        }
      } catch (e: any) {
        console.error(`[ActivityBot] Drain wallet ${i} sweep-tokens error:`, e?.message);
      }
    }

    // ── ②: Scan via app API → close all empty ATAs → record rent claims ─────
    //   Runs AFTER all swaps so swapped-out ATAs are now empty and catchable.
    await new Promise(r => setTimeout(r, 3000)); // let swaps settle on-chain

    for (let i = 0; i < activityKeypairs.length; i++) {
      const kp      = activityKeypairs[i];
      const address = kp.publicKey.toBase58();
      try {
        console.log(`[ActivityBot] Drain wallet ${i} ②: scanning for empty ATAs via app API…`);
        const scanRes  = await fetch(`http://localhost:${port}/api/sol-refund/scan/${address}`);
        const scanData = await scanRes.json();

        if (scanRes.ok && scanData.success && scanData.accounts?.length > 0) {
          console.log(`[ActivityBot] Drain wallet ${i} ②: ${scanData.emptyAccounts} empty accounts, ${scanData.totalReclaimable} SOL reclaimable`);

          for (const acct of scanData.accounts as Array<{ accountAddress: string; mintAddress: string; rentAmount: string }>) {
            try {
              const ataAddr  = new PublicKey(acct.accountAddress);
              const acctInfo = await connection.getAccountInfo(ataAddr);
              const prog     = acctInfo?.owner?.equals(TOKEN_2022_PROGRAM_ID)
                               ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

              // Rent the ATA holds; pay 20% to platform wallet on-chain (same as regular users)
              const rentLamports = Math.round(parseFloat(acct.rentAmount) * 1e9);
              const feeLamports  = Math.floor(rentLamports * PLATFORM_FEE);
              const solRecovered = rentLamports / 1e9;
              const feeAmount    = feeLamports  / 1e9;
              const netAmount    = solRecovered - feeAmount;

              const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
              const closeTx = new Transaction()
                // ① Close ATA — rent returned to kp.publicKey
                .add(createCloseAccountInstruction(ataAddr, kp.publicKey, kp.publicKey, [], prog))
                // ② Pay 20% fee to platform wallet in same tx
                .add(SystemProgram.transfer({
                  fromPubkey: kp.publicKey,
                  toPubkey:   PLATFORM_WALLET,
                  lamports:   feeLamports,
                }));
              closeTx.recentBlockhash = blockhash;
              closeTx.feePayer        = kp.publicKey;
              closeTx.sign(kp);
              const closeSig = await connection.sendRawTransaction(closeTx.serialize(), { skipPreflight: false, maxRetries: 3 });
              await connection.confirmTransaction({ signature: closeSig, blockhash, lastValidBlockHeight }, 'confirmed');
              console.log(`[ActivityBot] Drain wallet ${i} ②: rent claimed + 20% fee paid → ${closeSig.slice(0,20)}…`);

              await fetch('https://getfreesol.xyz/api/sol-refund/record-success', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  signature: closeSig, walletAddress: address,
                  accountsClosed: 1, solRecovered, netAmount, feeAmount,
                  platformFeeAmount: feeAmount, source: 'activity_bot',
                }),
              }).catch(() => {});
            } catch (e: any) {
              console.error(`[ActivityBot] Drain wallet ${i} ② close ATA error:`, e?.message);
            }
          }
        } else {
          console.log(`[ActivityBot] Drain wallet ${i} ②: no empty accounts found`);
        }
      } catch (e: any) {
        console.error(`[ActivityBot] Drain wallet ${i} ② scan error:`, e?.message);
      }
    }

    // Wait for everything to settle before draining SOL
    await new Promise(r => setTimeout(r, 3000));

    // ── ③: Drain all SOL back to vault ────────────────────────────────────────
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
    intervalSeconds: configInterval, solPerWallet: configSolPerWallet, tokensPerCycle: configTokensPerCycle,
    totalTxCount, wallets: [...activityWallets],
    nextRunIn: nextRunAt ? Math.max(0, Math.round((nextRunAt - Date.now()) / 1000)) : null,
    fundingTxSigs: [...fundingTxSigs], drainTxSigs: [...drainTxSigs],
    phase, phaseMessage,
  };
}
