import type { Express } from "express";
import {
  marketList as vulcanMarketList,
  marketTicker as vulcanMarketTicker,
  marketOrderbook as vulcanMarketOrderbook,
  marketCandles as vulcanMarketCandles,
  taReport as vulcanTaReport,
  paperInit as vulcanPaperInit,
  paperStatus as vulcanPaperStatus,
  paperPositions as vulcanPaperPositions,
  paperFills as vulcanPaperFills,
  paperBuy as vulcanPaperBuy,
  paperSell as vulcanPaperSell,
} from './vulcanCli';
import { createServer, type Server } from "http";
import { startActivityBot, stopActivityBot, getActivityBotStatus } from './activityBot';
import { computeWalletPnl, remainingCostSol, remainingQty } from './heliusPnl';
import { computeGsolLstPnl } from './gsolLstPnl';
import { getSignals as getGmgnSignals, getSmartMoneyWallets as getGmgnSmartMoney, getKolWallets as getGmgnKol, getWalletStats as getGmgnWalletStats, getWalletActivity as getGmgnWalletActivity, getTokenPoolInfo as getGmgnTokenPool, getWalletTokenBalance as getGmgnTokenBalance, getCreatedTokens as getGmgnCreatedTokens, getUserInfo as getGmgnUserInfo, getFollowWalletActivity as getGmgnFollowWallet } from './gmgnService';
import { storage } from "./storage";
import { insertTransactionRecordSchema, insertEmptyTokenAccountSchema, insertScanResultSchema, insertTransactionLedgerSchema, insertTokenBurnRecordSchema, insertNftBurnRecordSchema, insertReferralCodeSchema, insertReferralTransactionSchema, referralCodes, createAutoClaimPermitRequestSchema, revokeAutoClaimPermitRequestSchema, autoClaimPermitMessageSchema, autoClaimRevokeMessageSchema, jupiterLendDeposits, xAuthTokens, xPosts, xSchedules, xEngagement, swapRecords } from "@shared/schema";
import { nanoid } from "nanoid";
import { eq, sql, and, gte, notInArray, inArray, isNotNull } from 'drizzle-orm';
import { transactionLedger, userPoints, feedback, insertFeedbackSchema } from '@shared/schema';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';
import axios from 'axios';
import { db } from './db';
import { Connection, PublicKey, Transaction, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction, ComputeBudgetProgram, LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createBurnInstruction, createBurnCheckedInstruction, createCloseAccountInstruction, createSetAuthorityInstruction, AuthorityType, getAccount, createAssociatedTokenAccountInstruction, createSyncNativeInstruction, NATIVE_MINT, getAssociatedTokenAddressSync, createTransferInstruction, getMint, getPermanentDelegate, ExtensionType, getExtensionData, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import { getDepositIx, getWithdrawIx } from "@jup-ag/lend/earn";
import { BN } from "bn.js";
// Metaplex Core burning - server-side UMI implementation
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore, burn, fetchAsset, collectionAddress, fetchCollection } from '@metaplex-foundation/mpl-core';
import { publicKey as umiPublicKey, createNoopSigner, TransactionBuilder } from '@metaplex-foundation/umi';
import { transferSol } from '@metaplex-foundation/mpl-toolbox';
import { toWeb3JsTransaction } from '@metaplex-foundation/umi-web3js-adapters';
// Metaplex Token Metadata for pNFT burning
import { burnV1, fetchDigitalAssetWithAssociatedToken, findMetadataPda, findMasterEditionPda, TokenStandard, mplTokenMetadata, fetchDigitalAsset, fetchMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { unwrapOption, base58 } from '@metaplex-foundation/umi';
import { z } from 'zod';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { xApiService } from './xApiService';
import { xOAuthService } from './xOAuthService';
import cron from 'node-cron';
import { backpackApiService } from './backpackApiService';
import { backpackWebSocketService } from './backpackWebSocketService';

// Helius RPC — used for all reads/scans
function getHeliusRpcUrl(): string {
  const key = process.env.HELIUS_API_KEY;
  if (!key) throw new Error('HELIUS_API_KEY is required');
  return `https://mainnet.helius-rpc.com/?api-key=${key}`;
}

function getHeliusConnection(commitment: 'confirmed' | 'finalized' | 'processed' = 'confirmed'): Connection {
  return new Connection(getHeliusRpcUrl(), commitment);
}

// Extend global for temporary OAuth token storage
declare global {
  var pendingOAuthTokens: Record<string, string>;
}

// Helper: Verify Ed25519 signature
function verifySignature(message: string, signature: string, publicKey: string): boolean {
  try {
    console.log('🔐 Verifying signature...');
    console.log('  Message length:', message.length);
    console.log('  Signature length:', signature.length);
    console.log('  PublicKey:', publicKey);
    
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = bs58.decode(signature);
    const publicKeyBytes = bs58.decode(publicKey);
    
    console.log('  Message bytes length:', messageBytes.length);
    console.log('  Signature bytes length:', signatureBytes.length);
    console.log('  PublicKey bytes length:', publicKeyBytes.length);
    
    const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    console.log('  Verification result:', isValid);
    
    return isValid;
  } catch (error) {
    console.error('❌ Signature verification error:', error);
    return false;
  }
}

// Helper: Get fee rates based on wallet status
// Top 10 leaderboard users: 20% platform fee, 70% referral commission
// Regular users: 20% platform fee, 50% referral commission
const GFS_MINT = '6y7kd9qn8pNFM22F483kfRiNJntS3puoGGGZLRtMpump';
const GFS_HOLDER_THRESHOLD = 1_000_000; // 1M tokens

async function checkGfsHolder(walletAddress: string): Promise<boolean> {
  try {
    const { Connection, PublicKey } = await import('@solana/web3.js');
    const heliusKey = process.env.HELIUS_API_KEY;
    if (!heliusKey) return false;
    const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${heliusKey}`, 'confirmed');
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(walletAddress),
      { mint: new PublicKey(GFS_MINT) }
    );
    if (tokenAccounts.value.length === 0) return false;
    const uiAmount = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
    return uiAmount !== null && uiAmount >= GFS_HOLDER_THRESHOLD;
  } catch (e) {
    return false;
  }
}

const PLATFORM_WALLET = 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT';

async function getGfsPriceInSol(): Promise<number | null> {
  // 1) DexScreener (works after token graduates to Raydium)
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${GFS_MINT}`);
    const text = await res.text();
    const data = JSON.parse(text);
    const pairs: any[] = data?.pairs || [];
    if (pairs.length > 0) {
      const sorted = pairs.sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
      const priceNative = parseFloat(sorted[0]?.priceNative);
      if (priceNative > 0) {
        console.log(`[GFS Cashback] DexScreener price: ${priceNative} SOL/GFS`);
        return priceNative;
      }
    }
    console.log('[GFS Cashback] DexScreener: no pairs found');
  } catch (e: any) {
    console.log('[GFS Cashback] DexScreener error:', e.message?.slice(0, 80));
  }

  // 2) Pump.fun API (works while token is on bonding curve)
  try {
    const res = await fetch(`https://frontend-api.pump.fun/coins/${GFS_MINT}`);
    const text = await res.text();
    const data = JSON.parse(text);
    // market_cap_sol and total_supply give us price in SOL
    const usdMarketCap: number = data?.usd_market_cap;
    const solPrice: number = data?.sol_price_usd; // SOL price in USD from pump.fun
    const totalSupply = 1_000_000_000; // pump.fun tokens always have 1B supply
    if (usdMarketCap > 0 && solPrice > 0) {
      const priceUsd = usdMarketCap / totalSupply;
      const priceInSol = priceUsd / solPrice;
      console.log(`[GFS Cashback] Pump.fun price: ${priceInSol} SOL/GFS (mcap=$${usdMarketCap})`);
      return priceInSol;
    }
    console.log('[GFS Cashback] Pump.fun: no price data');
  } catch (e: any) {
    console.log('[GFS Cashback] Pump.fun error:', e.message?.slice(0, 80));
  }

  // 3) Jupiter Price API v3
  try {
    const WSOL = 'So11111111111111111111111111111111111111112';
    const res = await fetch(`https://api.jup.ag/price/v3?ids=${GFS_MINT},${WSOL}`);
    const text = await res.text();
    const data = JSON.parse(text);
    const gfsUsd: number = data?.data?.[GFS_MINT]?.price;
    const solUsd: number = data?.data?.[WSOL]?.price;
    if (gfsUsd > 0 && solUsd > 0) {
      console.log(`[GFS Cashback] Jupiter price: gfs=$${gfsUsd} sol=$${solUsd}`);
      return gfsUsd / solUsd;
    }
    console.log('[GFS Cashback] Jupiter: GFS not priced');
  } catch (e: any) {
    console.log('[GFS Cashback] Jupiter price error:', e.message?.slice(0, 80));
  }

  return null;
}

async function sendGfsCashback(walletAddress: string, feeAmountSol: number): Promise<void> {
  return; // GFS cashback disabled
  console.log(`[GFS Cashback] Starting for ${walletAddress?.slice(0, 8)}… fee=${feeAmountSol}`);
  try {
    if (!walletAddress || walletAddress === PLATFORM_WALLET) {
      console.log('[GFS Cashback] Skipped: platform wallet or missing address');
      return;
    }
    const fee = Number(feeAmountSol);
    if (!fee || fee <= 0 || isNaN(fee)) {
      console.log(`[GFS Cashback] Skipped: fee is zero/invalid (${feeAmountSol})`);
      return;
    }

    const gfsPriceInSol = await getGfsPriceInSol();
    if (!gfsPriceInSol || gfsPriceInSol <= 0) {
      console.log('[GFS Cashback] Could not get GFS price from any source, skipping');
      return;
    }
    console.log(`[GFS Cashback] GFS price: ${gfsPriceInSol} SOL/GFS`);

    // 30% of fee in SOL → converted to GFS
    const cashbackSol = fee * 0.30;
    const gfsAmount = cashbackSol / gfsPriceInSol;
    const GFS_DECIMALS = 6;
    const gfsAmountRaw = Math.floor(gfsAmount * Math.pow(10, GFS_DECIMALS));

    if (gfsAmountRaw < 1) {
      console.log(`[GFS Cashback] Amount too small (${gfsAmount.toFixed(6)} GFS), skipping`);
      return;
    }
    console.log(`[GFS Cashback] Sending ${gfsAmount.toFixed(2)} $GFS (${cashbackSol.toFixed(6)} SOL value, 30% of ${fee.toFixed(6)} SOL fee)`);

    const { Keypair, PublicKey, Transaction } = await import('@solana/web3.js');
    const splToken = await import('@solana/spl-token');
    const { getAssociatedTokenAddressSync, createTransferInstruction, createAssociatedTokenAccountInstruction, getAccount, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } = splToken;

    const connection = getHeliusConnection('confirmed');
    const relayerKey = process.env.RELAYER_PRIVATE_KEY;
    if (!relayerKey) { console.log('[GFS Cashback] No RELAYER_PRIVATE_KEY set'); return; }

    const senderKeypair = Keypair.fromSecretKey(bs58.decode(relayerKey));
    const mintPubkey = new PublicKey(GFS_MINT);
    const userPubkey = new PublicKey(walletAddress);

    // Detect whether GFS uses Token or Token-2022 program
    const mintAccountInfo = await connection.getAccountInfo(mintPubkey);
    const tokenProgramId = mintAccountInfo?.owner.toBase58() === TOKEN_2022_PROGRAM_ID.toBase58()
      ? TOKEN_2022_PROGRAM_ID
      : TOKEN_PROGRAM_ID;
    console.log(`[GFS Cashback] Token program: ${tokenProgramId.toBase58() === TOKEN_2022_PROGRAM_ID.toBase58() ? 'Token-2022' : 'SPL Token'}`);

    const senderAta = getAssociatedTokenAddressSync(mintPubkey, senderKeypair.publicKey, false, tokenProgramId);
    const recipientAta = getAssociatedTokenAddressSync(mintPubkey, userPubkey, false, tokenProgramId);

    const tx = new Transaction();

    // Create recipient ATA if it doesn't exist yet
    try {
      await getAccount(connection, recipientAta, 'confirmed', tokenProgramId);
    } catch {
      console.log('[GFS Cashback] Creating recipient ATA...');
      tx.add(createAssociatedTokenAccountInstruction(senderKeypair.publicKey, recipientAta, userPubkey, mintPubkey, tokenProgramId));
    }

    tx.add(createTransferInstruction(senderAta, recipientAta, senderKeypair.publicKey, gfsAmountRaw, [], tokenProgramId));

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = senderKeypair.publicKey;
    tx.sign(senderKeypair);

    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

    console.log(`[GFS Cashback] ✅ Sent ${gfsAmount.toFixed(2)} $GFS to ${walletAddress.slice(0, 8)}… tx=${sig.slice(0, 20)}…`);
  } catch (e: any) {
    console.error(`[GFS Cashback] ❌ Error for ${walletAddress?.slice(0, 8)}:`, e.message?.slice(0, 200));
  }
}

async function getWalletFeeRates(walletAddress: string): Promise<{ feePercent: number; referralPercent: number; isTop10: boolean; gfsHolder: boolean }> {
  const gfsHolder = await checkGfsHolder(walletAddress);
  const baseFee = 10;
  try {
    const isTop10 = await storage.isTop10Wallet(walletAddress);
    if (isTop10) {
      return { feePercent: baseFee, referralPercent: 70, isTop10: true, gfsHolder };
    }
  } catch (error) {
    console.error('Error checking top 10 status:', error);
  }
  return { feePercent: baseFee, referralPercent: 50, isTop10: false, gfsHolder };
}

// Helper: Check if wallet holds >= 1 GSOL (grants 0% fee on claim & burn)
const GSOL_MINT = 'GSoLRcWKQE5nbWTYFr83Ei3HGjnp9YzQNAFK6VAATg3';
async function isGsolHolder(walletAddress: string, connection: any): Promise<boolean> {
  try {
    const { getAssociatedTokenAddress } = await import('@solana/spl-token');
    const walletPubkey = new PublicKey(walletAddress);
    const gsolMint = new PublicKey(GSOL_MINT);
    const gsolAta = await getAssociatedTokenAddress(gsolMint, walletPubkey);
    const info = await connection.getTokenAccountBalance(gsolAta);
    const amount = info?.value?.uiAmount ?? 0;
    const holds = amount >= 1;
    if (holds) console.log(`[GSOL Holder] ${walletAddress.slice(0,8)}… holds ${amount} GSOL → 0% fee`);
    return holds;
  } catch {
    return false;
  }
}

// Helper: Get referrer commission rate based on wallet status
async function getReferrerCommissionRate(referrerWalletAddress: string): Promise<number> {
  try {
    const isTop10 = await storage.isTop10Wallet(referrerWalletAddress);
    if (isTop10) {
      return 70; // Top 10 referrers get 70% commission
    }
  } catch (error) {
    console.error('Error checking top 10 status for referrer:', error);
  }
  return 50; // Regular referrers get 50% commission
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Platform wallet auth middleware — must be defined first so all routes below can use it
  const requirePlatformWallet = (req: any, res: any, next: any) => {
    const { walletAddress, signature, message } = req.body;
    if (!walletAddress || !signature || !message) {
      return res.status(401).json({ error: 'Missing authentication credentials' });
    }
    if (walletAddress !== PLATFORM_WALLET) {
      return res.status(403).json({ error: 'Access denied: Platform wallet required' });
    }
    const isValid = verifySignature(message, signature, walletAddress);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    try {
      const messageData = JSON.parse(message);
      const timestamp = messageData.timestamp;
      if (!timestamp) return res.status(401).json({ error: 'Message must include timestamp' });
      const now = Date.now();
      const messageTime = new Date(timestamp).getTime();
      const fiveMinutes = 5 * 60 * 1000;
      if (now - messageTime > fiveMinutes) return res.status(401).json({ error: 'Signature expired (>5 minutes old)' });
      if (messageTime > now + 60000) return res.status(401).json({ error: 'Invalid timestamp (future)' });
    } catch {
      return res.status(401).json({ error: 'Invalid message format (must be JSON with timestamp)' });
    }
    next();
  };

  // In-memory cache of last known real SOL price
  let cachedSolPriceUsd: number = 0;

  // Shared helper: fetch live SOL price in USD, always returns a real value
  async function fetchSolPriceUsd(): Promise<number> {
    const WSOL = 'So11111111111111111111111111111111111111112';

    // 1st source: Jupiter
    try {
      const res = await fetch(`https://api.jup.ag/price/v3?ids=${WSOL}`);
      const data = await res.json();
      const price = data?.data?.[WSOL]?.price;
      if (price > 0) { cachedSolPriceUsd = price; return price; }
    } catch { /* try next */ }

    // 2nd source: CoinGecko
    try {
      const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      const data = await res.json();
      const price = data?.solana?.usd;
      if (price > 0) { cachedSolPriceUsd = price; return price; }
    } catch { /* fall through */ }

    // Use last successfully cached real price if APIs are temporarily down
    if (cachedSolPriceUsd > 0) {
      console.warn(`⚠️ SOL price APIs down — using last cached price: $${cachedSolPriceUsd}`);
      return cachedSolPriceUsd;
    }

    console.warn('⚠️ No SOL price available yet — XP will not be awarded this time');
    return 0;
  }

  // Token search endpoint - uses Jupiter Ultra Search API
  app.get("/api/client-config", (_req, res) => {
    const key = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY || '';
    res.json({ rpcUrl: key ? `https://mainnet.helius-rpc.com/?api-key=${key}` : '' });
  });

  app.get("/api/blockhash", async (_req, res) => {
    try {
      const conn = getHeliusConnection('confirmed');
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
      res.json({ blockhash, lastValidBlockHeight });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/send-transaction", async (req, res) => {
    try {
      const { transaction } = req.body;
      if (!transaction) return res.status(400).json({ error: 'Missing transaction' });
      const conn = getHeliusConnection('confirmed');
      const buf = Buffer.from(transaction, 'base64');
      const signature = await conn.sendRawTransaction(buf, { skipPreflight: false, preflightCommitment: 'confirmed' });
      res.json({ signature });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/tokens/search", async (req, res) => {
    try {
      const { q, limit = '50' } = req.query;
      
      console.log('Token search request:', q);
      
      if (!q || typeof q !== 'string') {
        return res.json({ tokens: [] });
      }

      // Use Jupiter Ultra Search API with API key
      const jupiterApiKey = process.env.JUPITER_API_KEY;
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (jupiterApiKey) {
        headers['x-api-key'] = jupiterApiKey;
      }
      
      const response = await fetch(`https://api.jup.ag/ultra/v1/search?query=${encodeURIComponent(q)}`, { headers });
      if (!response.ok) {
        console.error('Failed to fetch token list:', response.status);
        return res.json({ tokens: [] });
      }

      const data = await response.json();
      const limitNum = parseInt(limit as string, 10);
      
      // Jupiter Ultra search returns array directly with id, symbol, name, icon fields
      const rawTokens = Array.isArray(data) ? data : [];
      
      // Map Jupiter's response to our format - include all stats from Ultra Search
      const tokens = rawTokens
        .slice(0, limitNum)
        .map((t: any) => ({
          address: t.id || t.mint || t.address,
          symbol: t.symbol,
          name: t.name,
          decimals: t.decimals || 9,
          logoURI: t.icon || t.logoURI,
          // Include stats from Jupiter Ultra Search
          price: t.usdPrice || 0,
          price_change_24h: t.priceChange24h || 0,
          market_cap: t.mcap || t.marketCap || 0,
          daily_volume: t.volume24h || ((t.stats24h?.buyVolume || 0) + (t.stats24h?.sellVolume || 0)) || 0,
          liquidity: t.liquidity || 0,
          num_transactions: t.numTransactions || ((t.stats24h?.numBuys || 0) + (t.stats24h?.numSells || 0)) || 0
        }));

      console.log(`Found ${tokens.length} tokens for query "${q}"`);
      res.json({ tokens });
    } catch (error) {
      console.error('Token search error:', error);
      res.json({ tokens: [] });
    }
  });

  // Jupiter Price API v3 proxy - for frontend token price lookups
  app.get("/api/tokens/prices", async (req, res) => {
    try {
      const { ids } = req.query;
      
      if (!ids || typeof ids !== 'string') {
        return res.status(400).json({ error: 'Missing ids parameter' });
      }

      // Validate and limit addresses (max 100 to prevent abuse)
      const addresses = ids.split(',').slice(0, 100).filter((addr: string) => {
        // Basic Solana address validation (base58, 32-44 chars)
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr.trim());
      });

      if (addresses.length === 0) {
        return res.json({ data: {} });
      }

      const jupiterApiKey = process.env.JUPITER_API_KEY;
      const priceResponse = await fetch(`https://api.jup.ag/price/v3?ids=${addresses.join(',')}`, {
        headers: jupiterApiKey ? { 'x-api-key': jupiterApiKey } : {}
      });

      if (!priceResponse.ok) {
        console.error('Jupiter price API error:', priceResponse.status);
        return res.status(priceResponse.status).json({ error: 'Failed to fetch prices' });
      }

      const priceData = await priceResponse.json();
      res.json({ data: priceData });
    } catch (error) {
      console.error('Price fetch error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Jupiter API - Get Recent Tokens (newly created pools)
  app.get("/api/tokens/recent", async (req, res) => {
    try {
      const jupiterApiKey = process.env.JUPITER_API_KEY;
      if (!jupiterApiKey) {
        return res.status(500).json({ error: 'Jupiter API key not configured' });
      }

      const response = await fetch('https://api.jup.ag/tokens/v2/recent', {
        headers: { 'x-api-key': jupiterApiKey }
      });

      if (!response.ok) {
        console.error('Failed to fetch recent tokens:', response.status);
        return res.status(response.status).json({ error: 'Failed to fetch recent tokens' });
      }

      const rawData = await response.json();
      // Transform Jupiter API v2 response to frontend format
      const tokens = (Array.isArray(rawData) ? rawData : []).map((t: any) => ({
        address: t.id,
        symbol: t.symbol,
        name: t.name,
        logoURI: t.icon,
        decimals: t.decimals,
        price: t.usdPrice,
        market_cap: t.mcap,
        liquidity: t.liquidity,
        daily_volume: (t.stats24h?.buyVolume || 0) + (t.stats24h?.sellVolume || 0),
        num_transactions: (t.stats24h?.numBuys || 0) + (t.stats24h?.numSells || 0),
        price_change_24h: t.stats24h?.priceChange,
        created_at: t.firstPool?.createdAt
      }));
      console.log(`Found ${tokens.length} recent tokens`);
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.json({ tokens });
    } catch (error) {
      console.error('Recent tokens error:', error);
      res.status(500).json({ error: 'Failed to fetch recent tokens' });
    }
  });

  // Jupiter API - Get Trending/Top Tokens by category
  app.get("/api/tokens/category/:category/:interval", async (req, res) => {
    try {
      const { category, interval } = req.params;
      const { limit = '100' } = req.query;
      
      // Validate category: toporganicscore, toptraded, toptrending
      const validCategories = ['toporganicscore', 'toptraded', 'toptrending'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: `Invalid category. Valid: ${validCategories.join(', ')}` });
      }
      
      // Validate interval: 5m, 1h, 6h, 24h
      const validIntervals = ['5m', '1h', '6h', '24h'];
      if (!validIntervals.includes(interval)) {
        return res.status(400).json({ error: `Invalid interval. Valid: ${validIntervals.join(', ')}` });
      }

      const jupiterApiKey = process.env.JUPITER_API_KEY;
      if (!jupiterApiKey) {
        return res.status(500).json({ error: 'Jupiter API key not configured' });
      }

      const url = `https://api.jup.ag/tokens/v2/${category}/${interval}?limit=${limit}`;
      console.log(`Fetching ${category} tokens (${interval}):`, url);

      const response = await fetch(url, {
        headers: { 'x-api-key': jupiterApiKey }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to fetch ${category} tokens:`, response.status, errorText);
        return res.status(response.status).json({ error: `Failed to fetch ${category} tokens` });
      }

      const rawData = await response.json();
      // Get stats based on interval
      const getStats = (t: any, interval: string) => {
        const statsKey = `stats${interval}` as keyof typeof t;
        return t[statsKey] || t.stats24h || {};
      };
      // Transform Jupiter API v2 response to frontend format
      const tokens = (Array.isArray(rawData) ? rawData : []).map((t: any) => {
        const stats = getStats(t, interval);
        return {
          address: t.id,
          symbol: t.symbol,
          name: t.name,
          logoURI: t.icon,
          decimals: t.decimals,
          price: t.usdPrice,
          market_cap: t.mcap,
          liquidity: t.liquidity,
          daily_volume: (stats?.buyVolume || 0) + (stats?.sellVolume || 0),
          num_transactions: (stats?.numBuys || 0) + (stats?.numSells || 0),
          price_change: stats?.priceChange,
          organic_score: t.organicScore,
          created_at: t.firstPool?.createdAt
        };
      });
      console.log(`Found ${tokens.length} ${category} tokens (${interval})`);
      res.json({ tokens });
    } catch (error) {
      console.error('Category tokens error:', error);
      res.status(500).json({ error: 'Failed to fetch category tokens' });
    }
  });

  // Helius API - Get wallet token balances
  app.get("/api/tokens/holdings/:walletAddress", async (req, res) => {
    try {
      const { walletAddress } = req.params;
      
      console.log('Fetching holdings for wallet:', walletAddress);
      
      if (!walletAddress) {
        return res.status(400).json({ error: 'Wallet address is required' });
      }

      const heliusApiKey = process.env.HELIUS_API_KEY;
      if (!heliusApiKey) {
        return res.status(500).json({ error: 'Helius API key not configured' });
      }

      // Fetch token accounts using Helius RPC
      const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
      
      // Get both standard SPL and Token-2022 token accounts
      const [splResponse, token2022Response] = await Promise.all([
        // Standard SPL tokens
        fetch(heliusUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getTokenAccountsByOwner',
            params: [
              walletAddress,
              { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
              { encoding: 'jsonParsed' }
            ]
          })
        }),
        // Token-2022 tokens
        fetch(heliusUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'getTokenAccountsByOwner',
            params: [
              walletAddress,
              { programId: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' },
              { encoding: 'jsonParsed' }
            ]
          })
        })
      ]);

      if (!splResponse.ok || !token2022Response.ok) {
        console.error('Failed to fetch token accounts from Helius');
        return res.status(500).json({ error: 'Failed to fetch token holdings' });
      }

      const [splData, token2022Data] = await Promise.all([
        splResponse.json(),
        token2022Response.json()
      ]);

      // Combine token accounts from both programs
      const allAccounts = [
        ...(splData.result?.value || []).map((acc: any) => ({ ...acc, programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' })),
        ...(token2022Data.result?.value || []).map((acc: any) => ({ ...acc, programId: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' }))
      ];

      // Group by mint and aggregate balances
      const tokenMap = new Map<string, any>();
      
      for (const account of allAccounts) {
        const parsed = account.account.data.parsed;
        const info = parsed.info;
        const mint = info.mint;
        const balance = parseFloat(info.tokenAmount.uiAmountString || '0');
        const amount = info.tokenAmount.amount;
        const decimals = info.tokenAmount.decimals;

        if (balance > 0) {
          if (!tokenMap.has(mint)) {
            tokenMap.set(mint, {
              mint,
              balance: 0,
              decimals,
              amount: '0',
              accounts: [],
              programId: account.programId
            });
          }

          const token = tokenMap.get(mint);
          token.balance += balance;
          token.amount = (BigInt(token.amount) + BigInt(amount)).toString();
          token.accounts.push({
            address: account.pubkey,
            amount,
            uiAmount: balance,
            isAssociatedTokenAccount: true,
            isFrozen: info.state === 'frozen',
            programId: account.programId
          });
        }
      }

      // Fetch metadata for all tokens
      const tokenList: any[] = [];
      for (const token of tokenMap.values()) {
        let symbol = 'Unknown';
        let name = token.mint.slice(0, 8) + '...';
        let logo = null;

        try {
          const searchUrl = `https://lite-api.jup.ag/tokens/v2/search?query=${token.mint}`;
          const response = await fetch(searchUrl);
          
          if (response.ok) {
            const data = await response.json();
            const tokens = Array.isArray(data) ? data : [];
            
            if (tokens.length > 0) {
              const exactMatch = tokens.find((t: any) => t.id === token.mint);
              if (exactMatch) {
                symbol = exactMatch.symbol || 'Unknown';
                name = exactMatch.name || token.mint.slice(0, 8) + '...';
                logo = exactMatch.icon || null;
              }
            }
          }
        } catch (e) {
          console.log(`Metadata fetch failed for ${token.mint}, using fallback`);
        }

        tokenList.push({
          ...token,
          symbol,
          name,
          logo
        });
      }

      console.log(`Found ${tokenList.length} tokens with balance for wallet ${walletAddress}`);
      res.json(tokenList);
    } catch (error) {
      console.error('Token holdings error:', error);
      res.status(500).json({ error: 'Failed to fetch token holdings' });
    }
  });

  // Jupiter Portfolio API - Get positions (incl. PnL where available)
  app.get("/api/jupiter/portfolio/:address", async (req, res) => {
    try {
      const { address } = req.params;
      if (!address) return res.status(400).json({ error: 'Missing wallet address' });

      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (process.env.JUPITER_API_KEY) headers['x-api-key'] = process.env.JUPITER_API_KEY;

      const r = await fetch(`https://api.jup.ag/portfolio/v1/positions/${address}`, { headers });
      if (!r.ok) {
        const t = await r.text();
        console.error('Jupiter Portfolio API error:', r.status, t);
        return res.status(r.status).json({ error: 'Failed to fetch portfolio' });
      }
      const data = await r.json();
      res.json(data);
    } catch (e: any) {
      console.error('Jupiter Portfolio proxy error:', e);
      res.status(500).json({ error: 'Failed to fetch portfolio' });
    }
  });

  // Wallet PnL - computed from our swap_records using FIFO cost basis + current Jupiter prices
  app.get("/api/wallet-pnl/:address", async (req, res) => {
    try {
      const { address } = req.params;
      if (!address) return res.status(400).json({ error: 'Missing wallet address' });

      // Cost-basis from on-site swap records is unreliable (incomplete history,
      // missing transfers/mints). Show real holdings only; PnL is sourced via Jupiter link.
      const symbols: Record<string, string> = {};

      // Fetch ACTUAL on-chain holdings via Jupiter Ultra Holdings
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (process.env.JUPITER_API_KEY) headers['x-api-key'] = process.env.JUPITER_API_KEY;
      const WSOL = 'So11111111111111111111111111111111111111112';
      type Holding = { mint: string; qty: number };
      const byMint: Record<string, number> = {};
      try {
        const hr = await fetch(`https://api.jup.ag/ultra/v1/holdings/${address}`, { headers });
        if (hr.ok) {
          const hd: any = await hr.json();
          const solQty = Number(hd?.uiAmount ?? 0);
          if (solQty > 0) byMint[WSOL] = (byMint[WSOL] || 0) + solQty;
          const tokens = hd?.tokens || {};
          for (const [mint, accs] of Object.entries<any>(tokens)) {
            if (!Array.isArray(accs)) continue;
            const qty = accs.reduce((a: number, v: any) => a + Number(v?.uiAmount ?? 0), 0);
            if (qty > 0) byMint[mint] = (byMint[mint] || 0) + qty;
          }
        }
      } catch (e) {
        console.error('Holdings fetch failed:', e);
      }
      const heldTokens: Holding[] = Object.entries(byMint).map(([mint, qty]) => ({ mint, qty }));

      // Symbol fallback for held tokens not in our swap records
      const knownSymbols: Record<string, string> = {
        [WSOL]: 'SOL',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
        'GSoLRcWKQE5nbWTYFr83Ei3HGjnp9YzQNAFK6VAATg3': 'GSOL',
        'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'BONK',
        'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': 'JUP',
      };

      // Fetch current prices for everything held
      let prices: Record<string, { usdPrice?: number }> = {};
      if (heldTokens.length > 0) {
        const ids = heldTokens.map(h => h.mint).join(',');
        try {
          const r = await fetch(`https://api.jup.ag/price/v3?ids=${ids}`, { headers });
          if (r.ok) prices = await r.json();
        } catch {}
      }

      const pnl: any = null; // Cost-basis PnL removed (no Helius on portfolio page)

      const solPx = Number(prices[WSOL]?.usdPrice ?? 0);

      let currentValue = 0;
      let pnl24h = 0;
      let valueYesterday = 0;
      let unrealizedSolTotal = 0;
      let costBasisSolTotal = 0;
      const positions: any[] = [];
      for (const h of heldTokens) {
        const p: any = prices[h.mint] || {};
        const px = Number(p.usdPrice ?? 0);
        const chg = Number(p.priceChange24h);
        const val = px * h.qty;
        if (val < 0.01) continue;
        let tokenPnl24h: number | null = null;
        let pxYesterday: number | null = null;
        if (Number.isFinite(chg)) {
          pxYesterday = px / (1 + chg / 100);
          const valYesterday = pxYesterday * h.qty;
          tokenPnl24h = val - valYesterday;
          pnl24h += tokenPnl24h;
          valueYesterday += valYesterday;
        }
        currentValue += val;

        // Cost basis from Helius FIFO lots
        const lots = pnl?.lots?.[h.mint];
        const costSol = remainingCostSol(lots);
        const trackedQty = remainingQty(lots);
        let unrealizedSol: number | null = null;
        let unrealizedUsd: number | null = null;
        let unrealizedPct: number | null = null;
        let avgCostUsd: number | null = null;
        if (h.mint === WSOL) {
          // SOL itself: no cost basis tracking, skip unrealized
        } else if (costSol > 0 && trackedQty > 0 && solPx > 0) {
          const proportionalCost = costSol * Math.min(1, h.qty / trackedQty);
          const currentValSol = px > 0 ? (val / solPx) : 0;
          unrealizedSol = currentValSol - proportionalCost;
          unrealizedUsd = unrealizedSol * solPx;
          const costUsd = proportionalCost * solPx;
          unrealizedPct = costUsd > 0 ? (unrealizedUsd / costUsd) * 100 : null;
          avgCostUsd = trackedQty > 0 ? (costSol * solPx) / trackedQty : null;
          unrealizedSolTotal += unrealizedSol;
          costBasisSolTotal += proportionalCost;
        }

        positions.push({
          mint: h.mint,
          symbol: symbols[h.mint] || knownSymbols[h.mint],
          qty: h.qty,
          currentPrice: px,
          currentValue: val,
          priceChange24h: Number.isFinite(chg) ? chg : null,
          pnl24h: tokenPnl24h,
          pnl24hPct: tokenPnl24h !== null && pxYesterday ? ((px - pxYesterday) / pxYesterday) * 100 : null,
          avgCostUsd,
          unrealizedUsd,
          unrealizedPct,
        });
      }
      positions.sort((a, b) => b.currentValue - a.currentValue);

      const GSOL_MINT = 'GSoLRcWKQE5nbWTYFr83Ei3HGjnp9YzQNAFK6VAATg3';
      const gsolPos = positions.find((p: any) => p.mint === GSOL_MINT);

      // GSOL is an LST: PnL = current SOL value of holdings - SOL value at acquisition
      // (using historical GSOL/SOL exchange rate at each acquisition timestamp).
      const currentGsolRate = solPx > 0 && gsolPos ? Number(gsolPos.currentPrice) / solPx : 1.0;
      const lst: any = null; // GSOL LST PnL removed (no Helius on portfolio page)

      const hasLstData = lst && lst.movements > 0 && solPx > 0;
      const realizedUsd = hasLstData ? lst.realizedSol * solPx : null;
      const unrealizedUsdTotal = hasLstData && lst.qty > 0 ? lst.unrealizedSol * solPx : null;
      const totalUsd = hasLstData
        ? (lst.realizedSol + (lst.qty > 0 ? lst.unrealizedSol : 0)) * solPx
        : null;

      if (gsolPos && lst && solPx > 0 && lst.qty > 0) {
        gsolPos.unrealizedUsd = lst.unrealizedSol * solPx;
        gsolPos.unrealizedPct = lst.costSol > 0 ? (lst.unrealizedSol / lst.costSol) * 100 : null;
        gsolPos.avgCostUsd = lst.avgCostRate !== null ? lst.avgCostRate * solPx : null;
      }

      res.json({
        wallet: address,
        currentValue,
        valueYesterday,
        pnl24h,
        pnl24hPct: valueYesterday > 0 ? (pnl24h / valueYesterday) * 100 : null,
        realized: realizedUsd,
        unrealized: unrealizedUsdTotal,
        total: totalUsd,
        costBasisUsd: solPx > 0 ? costBasisSolTotal * solPx : null,
        swapsCount: pnl?.txCount ?? 0,
        cached: pnl?.cached ?? false,
        reachedLimit: pnl?.reachedLimit ?? false,
        untrackedSells: pnl?.untrackedSells ?? 0,
        positions,
      });
    } catch (e: any) {
      console.error('Wallet PnL error:', e);
      res.status(500).json({ error: 'Failed to compute wallet PnL' });
    }
  });

  // Jupiter Ultra Holdings API - Get token balances
  app.get("/api/jupiter/ultra/holdings/:address", async (req, res) => {
    try {
      const { address } = req.params;
      if (!address) return res.status(400).json({ error: 'Missing wallet address' });

      const apiKey = process.env.JUPITER_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'Jupiter API key not configured' });

      const response = await fetch(`https://api.jup.ag/ultra/v1/holdings/${address}`, {
        headers: { 'Accept': 'application/json', 'x-api-key': apiKey }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Jupiter Holdings API error:', response.status, errorText);
        return res.status(response.status).json({ error: 'Failed to fetch holdings' });
      }

      const data = await response.json();
      // data.nativeBalance: { amount, uiAmount }
      // data.tokens: { [mint]: { amount, decimals, isFrozen, isAssociatedTokenAccount, programId } }
      res.json(data);
    } catch (error) {
      console.error('Holdings proxy error:', error);
      res.status(500).json({ error: 'Failed to fetch holdings' });
    }
  });

  app.get("/api/jupiter/ultra/holdings/:address/native", async (req, res) => {
    try {
      const { address } = req.params;
      if (!address) return res.status(400).json({ error: 'Missing wallet address' });

      const apiKey = process.env.JUPITER_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'Jupiter API key not configured' });

      const response = await fetch(`https://api.jup.ag/ultra/v1/holdings/${address}/native`, {
        headers: { 'Accept': 'application/json', 'x-api-key': apiKey }
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: 'Failed to fetch native balance' });
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch native balance' });
    }
  });

  // Jupiter Metis Swap with Close Account + Fee - ONE TRANSACTION
  // Uses /swap-instructions to get individual instructions, then adds close account + fee
  app.get("/api/jupiter/swap-with-close", async (req, res) => {
    try {
      const { inputMint, outputMint, amount, taker } = req.query;
      
      if (!inputMint || !outputMint || !amount || !taker) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      const takerPubkey = new PublicKey(taker as string);
      const inputMintPubkey = new PublicKey(inputMint as string);
      const PLATFORM_WALLET = new PublicKey('GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT');
      const RENT_FEE_LAMPORTS = 203928; // 10% of ~0.00203928 SOL rent
      
      const connection = getHeliusConnection();

      // Step 1: Get quote from Jupiter Swap API v1
      console.log(`🔄 Getting Jupiter quote for ${inputMint} -> ${outputMint}, amount: ${amount}`);
      const quoteUrl = new URL('https://api.jup.ag/swap/v1/quote');
      quoteUrl.searchParams.append('inputMint', inputMint as string);
      quoteUrl.searchParams.append('outputMint', outputMint as string);
      quoteUrl.searchParams.append('amount', amount as string);
      quoteUrl.searchParams.append('slippageBps', '100'); // 1% slippage
      quoteUrl.searchParams.append('restrictIntermediateTokens', 'true');
      
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (process.env.JUPITER_API_KEY) {
        headers['x-api-key'] = process.env.JUPITER_API_KEY;
      }
      
      const quoteResponse = await fetch(quoteUrl.toString(), { headers });
      if (!quoteResponse.ok) {
        const error = await quoteResponse.text();
        console.error('Quote failed:', error);
        return res.status(400).json({ error: 'Failed to get quote: ' + error });
      }
      const quoteData = await quoteResponse.json();
      console.log(`✅ Got quote: ${quoteData.inAmount} -> ${quoteData.outAmount}`);

      // Step 2: Get swap instructions from Jupiter Swap API v1
      console.log(`🔄 Getting swap instructions from Jupiter...`);
      const swapInstructionsResponse = await fetch('https://api.jup.ag/swap/v1/swap-instructions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userPublicKey: taker,
          quoteResponse: quoteData,
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: {
            priorityLevelWithMaxLamports: {
              maxLamports: 1000000,
              priorityLevel: "veryHigh"
            }
          }
        })
      });

      if (!swapInstructionsResponse.ok) {
        const error = await swapInstructionsResponse.text();
        console.error('Swap instructions failed:', error);
        return res.status(400).json({ error: 'Failed to get swap instructions: ' + error });
      }
      const swapData = await swapInstructionsResponse.json();
      
      if (swapData.error) {
        console.error('Swap instructions error:', swapData.error);
        return res.status(400).json({ error: swapData.error });
      }
      console.log(`✅ Got swap instructions`);

      // Step 3: Build transaction with swap + close account + fee transfer
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      
      // Helper to deserialize instruction from API response
      const deserializeInstruction = (ix: any) => ({
        programId: new PublicKey(ix.programId),
        keys: ix.accounts.map((acc: any) => ({
          pubkey: new PublicKey(acc.pubkey),
          isSigner: acc.isSigner,
          isWritable: acc.isWritable,
        })),
        data: Buffer.from(ix.data, 'base64'),
      });

      // Collect all instructions
      const instructions: any[] = [];

      // Add compute budget instructions
      if (swapData.computeBudgetInstructions) {
        for (const ix of swapData.computeBudgetInstructions) {
          instructions.push(deserializeInstruction(ix));
        }
      }

      // Add setup instructions (create ATAs if needed)
      if (swapData.setupInstructions) {
        for (const ix of swapData.setupInstructions) {
          instructions.push(deserializeInstruction(ix));
        }
      }

      // Add the main swap instruction
      if (swapData.swapInstruction) {
        instructions.push(deserializeInstruction(swapData.swapInstruction));
      }

      // Add cleanup instruction if present
      if (swapData.cleanupInstruction) {
        instructions.push(deserializeInstruction(swapData.cleanupInstruction));
      }

      // Step 4: Add close account instruction (reclaim rent)
      // Detect if token is Token-2022 by checking mint account owner
      let tokenProgramId = TOKEN_PROGRAM_ID;
      try {
        const mintInfo = await connection.getAccountInfo(inputMintPubkey);
        if (mintInfo && mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
          tokenProgramId = TOKEN_2022_PROGRAM_ID;
          console.log(`🔄 Detected Token-2022 program for ${inputMint}`);
        }
      } catch (e) {
        console.log(`⚠️ Could not detect token program, defaulting to TOKEN_PROGRAM`);
      }
      
      const ata = getAssociatedTokenAddressSync(inputMintPubkey, takerPubkey, false, tokenProgramId);
      instructions.push(
        createCloseAccountInstruction(ata, takerPubkey, takerPubkey, [], tokenProgramId)
      );
      console.log(`📦 Added close account instruction for ATA: ${ata.toString()} (program: ${tokenProgramId.equals(TOKEN_2022_PROGRAM_ID) ? 'Token-2022' : 'SPL Token'})`);

      // Step 5: Add platform fee transfer (20% of rent)
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: takerPubkey,
          toPubkey: PLATFORM_WALLET,
          lamports: RENT_FEE_LAMPORTS,
        })
      );
      console.log(`💰 Added fee transfer: ${RENT_FEE_LAMPORTS / 1e9} SOL to platform`);

      // Step 6: Build the versioned transaction with lookup tables
      let lookupTableAccounts: any[] = [];
      if (swapData.addressLookupTableAddresses && swapData.addressLookupTableAddresses.length > 0) {
        const lookupTablePromises = swapData.addressLookupTableAddresses.map(async (addr: string) => {
          const result = await connection.getAddressLookupTable(new PublicKey(addr));
          return result.value;
        });
        lookupTableAccounts = (await Promise.all(lookupTablePromises)).filter(Boolean);
      }

      const messageV0 = new TransactionMessage({
        payerKey: takerPubkey,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message(lookupTableAccounts);

      const transaction = new VersionedTransaction(messageV0);
      const serializedTx = Buffer.from(transaction.serialize()).toString('base64');

      console.log(`✅ Built combined transaction: swap + close + fee (${instructions.length} instructions)`);

      res.json({
        success: true,
        transaction: serializedTx,
        blockhash,
        lastValidBlockHeight,
        quoteData: {
          inAmount: quoteData.inAmount,
          outAmount: quoteData.outAmount,
          priceImpactPct: quoteData.priceImpactPct
        },
        rentFeeLamports: RENT_FEE_LAMPORTS,
        instructionCount: instructions.length
      });

    } catch (error: any) {
      console.error('Swap with close error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Jupiter Ultra Swap - Get Order endpoint (replaces quote + swap)
  app.get("/api/jupiter/ultra/order", async (req, res) => {
    try {
      if (!process.env.JUPITER_API_KEY) {
        console.error('❌ JUPITER_API_KEY not configured');
        return res.status(500).json({ error: 'Jupiter API key not configured' });
      }

      const { inputMint, outputMint, amount, taker, addRentFee } = req.query;
      
      if (!inputMint || !outputMint || !amount) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      // Ultra Swap Referral Configuration
      // Referral account: 5fiaP6GJBixn5N1pZT5dUer1MUkdAiKMg7tBMPbFyZdB
      // Token account for fees: 6F75HBoQ64GRXnUXAxeWMcJVax5dUgeBnY96sWSNzXdD
      const referralAccount = "5fiaP6GJBixn5N1pZT5dUer1MUkdAiKMg7tBMPbFyZdB";
      const referralFee = 50; // 0.50% (50 bps)

      // Build order URL with referral params
      const orderUrl = new URL('https://api.jup.ag/ultra/v1/order');
      orderUrl.searchParams.append('inputMint', inputMint as string);
      orderUrl.searchParams.append('outputMint', outputMint as string);
      orderUrl.searchParams.append('amount', amount as string);
      if (taker) {
        orderUrl.searchParams.append('taker', taker as string);
      }
      orderUrl.searchParams.append('referralAccount', referralAccount);
      orderUrl.searchParams.append('referralFee', referralFee.toString());
      
      console.log('🚀 Ultra Swap Order URL:', orderUrl.toString());
      
      const response = await fetch(orderUrl.toString(), {
        headers: { 
          'Accept': 'application/json',
          'x-api-key': process.env.JUPITER_API_KEY || ''
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Jupiter Ultra order error:', response.status, errorText);
        return res.status(response.status).json({ error: errorText || 'Failed to get order' });
      }

      const orderData = await response.json();
      
      // Log complete fee information
      console.log('✅ Ultra Order received:', {
        requestId: orderData.requestId,
        feeMint: orderData.feeMint,
        feeBps: orderData.feeBps,
        platformFee: orderData.platformFee,
        router: orderData.router,
        hasTransaction: !!orderData.transaction
      });

      // Modify Jupiter's transaction to add close account + fee transfer (ONE TRANSACTION)
      if (addRentFee === 'true' && orderData.transaction && taker) {
        try {
          const { VersionedTransaction, TransactionMessage, SystemProgram, PublicKey: SolanaPublicKey, TransactionInstruction } = await import('@solana/web3.js');
          const { Connection, AddressLookupTableAccount } = await import('@solana/web3.js');
          const { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createCloseAccountInstruction } = await import('@solana/spl-token');
          
          const PLATFORM_WALLET = new SolanaPublicKey('GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT');
          const RENT_FEE_LAMPORTS = 203928; // 10% of ~0.00203928 SOL rent
          
          const txBuffer = Buffer.from(orderData.transaction, 'base64');
          const jupiterTx = VersionedTransaction.deserialize(txBuffer);
          const message = jupiterTx.message;
          
          const takerPubkey = new SolanaPublicKey(taker as string);
          const inputMintPubkey = new SolanaPublicKey(inputMint as string);
          
          // Get the user's token account (ATA)
          const userTokenAccount = getAssociatedTokenAddressSync(inputMintPubkey, takerPubkey);
          
          const connection = getHeliusConnection();
          
          // Fetch address lookup tables
          const lookupTableAccounts: AddressLookupTableAccount[] = [];
          for (const lookup of message.addressTableLookups) {
            try {
              const accountInfo = await connection.getAccountInfo(lookup.accountKey);
              if (accountInfo) {
                const state = AddressLookupTableAccount.deserialize(accountInfo.data);
                lookupTableAccounts.push(new AddressLookupTableAccount({
                  key: lookup.accountKey,
                  state: state,
                }));
              }
            } catch (e) {
              console.warn('Could not fetch lookup table:', lookup.accountKey.toString());
            }
          }
          
          // Decompile to get instructions
          const decompiled = TransactionMessage.decompile(message, {
            addressLookupTableAccounts: lookupTableAccounts,
          });
          
          // Check if Jupiter included a close account instruction (Token Program with close instruction)
          const TOKEN_PROGRAM_STR = TOKEN_PROGRAM_ID.toString();
          const hasCloseInstruction = decompiled.instructions.some(ix => {
            return ix.programId.toString() === TOKEN_PROGRAM_STR && ix.data.length > 0 && ix.data[0] === 9; // 9 = CloseAccount
          });
          
          // If no close instruction, add our own
          if (!hasCloseInstruction) {
            console.log('📦 Jupiter did not include close account, adding our own');
            const closeInstruction = createCloseAccountInstruction(
              userTokenAccount,
              takerPubkey, // destination for rent
              takerPubkey, // owner
              [],
              TOKEN_PROGRAM_ID
            );
            decompiled.instructions.push(closeInstruction);
          } else {
            console.log('✅ Jupiter already includes close account instruction');
          }
          
          // Add fee transfer instruction
          const feeInstruction = SystemProgram.transfer({
            fromPubkey: takerPubkey,
            toPubkey: PLATFORM_WALLET,
            lamports: RENT_FEE_LAMPORTS,
          });
          decompiled.instructions.push(feeInstruction);
          
          // Recompile with lookup tables
          const newMessage = decompiled.compileToV0Message(lookupTableAccounts);
          const newTx = new VersionedTransaction(newMessage);
          
          orderData.transaction = Buffer.from(newTx.serialize()).toString('base64');
          orderData.rentFeeAdded = true;
          orderData.rentFeeLamports = RENT_FEE_LAMPORTS;
          orderData.closeAccountAdded = !hasCloseInstruction;
          
          console.log('💰 Added rent fee transfer to Jupiter transaction:', RENT_FEE_LAMPORTS / 1e9, 'SOL to', PLATFORM_WALLET.toString().slice(0, 8));
        } catch (modifyErr: any) {
          console.error('⚠️ Could not add rent fee to transaction:', modifyErr.message);
          orderData.rentFeeAdded = false;
        }
      }
      
      res.json(orderData);
    } catch (error) {
      console.error('Jupiter Ultra order proxy error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Jupiter Legacy API - Swap with Close Account + Platform Fee (ONE TRANSACTION)
  // Uses v6 API which produces simpler transactions that can be modified
  app.get('/api/jupiter/legacy/swap-with-fee', async (req, res) => {
    try {
      const { inputMint, outputMint, amount, taker, slippageBps } = req.query;
      
      if (!inputMint || !outputMint || !amount || !taker) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      console.log('🔄 Legacy swap with fee:', { inputMint, outputMint, amount, taker });

      // Call Jupiter v6 quote API (using api.jup.ag, quote-api is deprecated)
      const quoteUrl = `https://api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps || 100}`;
      const quoteResponse = await fetch(quoteUrl);
      
      if (!quoteResponse.ok) {
        const errText = await quoteResponse.text();
        console.error('Jupiter quote error:', errText);
        return res.status(500).json({ error: 'Failed to get quote from Jupiter' });
      }

      const quoteData = await quoteResponse.json();
      console.log('📊 Jupiter quote:', { 
        inAmount: quoteData.inAmount, 
        outAmount: quoteData.outAmount,
        priceImpactPct: quoteData.priceImpactPct 
      });

      // Call Jupiter v6 swap API to get transaction (using api.jup.ag)
      const swapResponse = await fetch('https://api.jup.ag/swap/v1/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quoteData,
          userPublicKey: taker,
          wrapAndUnwrapSol: true,
          computeUnitPriceMicroLamports: 'auto',
          dynamicComputeUnitLimit: true,
        })
      });

      if (!swapResponse.ok) {
        const errText = await swapResponse.text();
        console.error('Jupiter swap error:', errText);
        return res.status(500).json({ error: 'Failed to get swap transaction' });
      }

      const swapData = await swapResponse.json();
      
      // Now modify the transaction to add close account + fee transfer
      const { VersionedTransaction, TransactionMessage, SystemProgram, PublicKey: SolanaPublicKey, ComputeBudgetProgram } = await import('@solana/web3.js');
      const { Connection, AddressLookupTableAccount } = await import('@solana/web3.js');
      const { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createCloseAccountInstruction } = await import('@solana/spl-token');
      
      const PLATFORM_WALLET = new SolanaPublicKey('GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT');
      const RENT_FEE_LAMPORTS = 203928; // 10% of ~0.00203928 SOL rent
      
      const txBuffer = Buffer.from(swapData.swapTransaction, 'base64');
      const jupiterTx = VersionedTransaction.deserialize(txBuffer);
      const message = jupiterTx.message;
      
      const takerPubkey = new SolanaPublicKey(taker as string);
      const inputMintPubkey = new SolanaPublicKey(inputMint as string);
      const userTokenAccount = getAssociatedTokenAddressSync(inputMintPubkey, takerPubkey);
      
      const connection = getHeliusConnection();
      
      // Fetch address lookup tables if any
      const lookupTableAccounts: AddressLookupTableAccount[] = [];
      for (const lookup of message.addressTableLookups) {
        try {
          const accountInfo = await connection.getAccountInfo(lookup.accountKey);
          if (accountInfo) {
            const state = AddressLookupTableAccount.deserialize(accountInfo.data);
            lookupTableAccounts.push(new AddressLookupTableAccount({
              key: lookup.accountKey,
              state: state,
            }));
          }
        } catch (e) {
          console.warn('Could not fetch lookup table:', lookup.accountKey.toString());
        }
      }
      
      // Decompile transaction to get instructions
      const decompiled = TransactionMessage.decompile(message, {
        addressLookupTableAccounts: lookupTableAccounts,
      });
      
      // Check if Jupiter already included close account instruction
      const TOKEN_PROGRAM_STR = TOKEN_PROGRAM_ID.toString();
      const hasCloseInstruction = decompiled.instructions.some(ix => {
        return ix.programId.toString() === TOKEN_PROGRAM_STR && ix.data.length > 0 && ix.data[0] === 9;
      });
      
      // Add close account if not present
      if (!hasCloseInstruction) {
        console.log('📦 Adding close account instruction');
        const closeInstruction = createCloseAccountInstruction(
          userTokenAccount,
          takerPubkey,
          takerPubkey,
          [],
          TOKEN_PROGRAM_ID
        );
        decompiled.instructions.push(closeInstruction);
      } else {
        console.log('✅ Jupiter already includes close account');
      }
      
      // Add platform fee transfer
      console.log('💰 Adding platform fee transfer:', RENT_FEE_LAMPORTS / 1e9, 'SOL');
      const feeInstruction = SystemProgram.transfer({
        fromPubkey: takerPubkey,
        toPubkey: PLATFORM_WALLET,
        lamports: RENT_FEE_LAMPORTS,
      });
      decompiled.instructions.push(feeInstruction);
      
      // Increase compute budget to handle extra instructions
      const computeIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 });
      decompiled.instructions.unshift(computeIx);
      
      // Get fresh blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      decompiled.recentBlockhash = blockhash;
      
      // Recompile transaction
      const newMessage = decompiled.compileToV0Message(lookupTableAccounts);
      const newTx = new VersionedTransaction(newMessage);
      
      const modifiedTxBase64 = Buffer.from(newTx.serialize()).toString('base64');
      
      console.log('✅ Created swap+close+fee transaction');
      
      res.json({
        success: true,
        transaction: modifiedTxBase64,
        outAmount: quoteData.outAmount,
        inAmount: quoteData.inAmount,
        priceImpactPct: quoteData.priceImpactPct,
        rentFeeLamports: RENT_FEE_LAMPORTS,
        blockhash,
        lastValidBlockHeight,
      });
    } catch (error: any) {
      console.error('Legacy swap with fee error:', error);
      res.status(500).json({ error: error.message || 'Failed to create swap transaction' });
    }
  });

  // Jupiter Legacy API - Get real network fee by simulating transaction
  app.get('/api/jupiter/legacy/get-fee', async (req, res) => {
    try {
      const { inputMint, outputMint, amount, taker, slippageBps } = req.query;

      // Call Jupiter v6 quote API
      const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps || 50}`;
      const quoteResponse = await fetch(quoteUrl);
      
      if (!quoteResponse.ok) {
        return res.status(500).json({ error: 'Failed to get quote from Jupiter' });
      }

      const quoteData = await quoteResponse.json();

      // Call Jupiter v6 swap API to get transaction with compute budget
      const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quoteData,
          userPublicKey: taker,
          wrapAndUnwrapSol: true,
          computeUnitPriceMicroLamports: 'auto',
        })
      });

      if (!swapResponse.ok) {
        return res.status(500).json({ error: 'Failed to simulate swap' });
      }

      const swapData = await swapResponse.json();
      
      // Return the transaction for frontend parsing
      res.json({
        success: true,
        transaction: swapData.swapTransaction,
        prioritizationFeeLamports: swapData.prioritizationFeeLamports || 0,
      });
    } catch (error: any) {
      console.error('Jupiter Legacy fee simulation error:', error);
      res.status(500).json({ error: 'Failed to get network fee' });
    }
  });

  // Jupiter Ultra Swap - Execute Order endpoint with Helius Backrun Rebates
  // Users earn 50% of MEV their trades create via Helius private auction
  app.post("/api/jupiter/ultra/execute", async (req, res) => {
    try {
      if (!process.env.JUPITER_API_KEY) {
        console.error('❌ JUPITER_API_KEY not configured');
        return res.status(500).json({ error: 'Jupiter API key not configured' });
      }

      const { 
        signedTransaction, 
        requestId,
        // Additional swap details for recording
        walletAddress,
        inputMint,
        outputMint,
        inputAmount,
        outputAmount,
        inputSymbol,
        outputSymbol,
        usdValue,
        platformFee,
        referralCode
      } = req.body;
      
      if (!signedTransaction || !requestId) {
        return res.status(400).json({ error: 'Missing required parameters: signedTransaction, requestId' });
      }

      console.log('🚀 Executing Ultra Swap with requestId:', requestId);
      
      let executeData: any = null;
      let rebatesEnabled = false;
      const heliusApiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
      
      // Try Helius Backrun Rebates first if we have wallet address and Helius key
      if (heliusApiKey && walletAddress) {
        try {
          // Build Helius RPC URL with rebate-address for MEV rebates
          const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}&rebate-address=${walletAddress}`;
          
          console.log(`💰 Attempting swap with Helius Backrun Rebates enabled`);
          console.log(`   MEV rebates will be paid to: ${walletAddress}`);
          
          const heliusResponse = await fetch(heliusUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'sendTransaction',
              params: [
                signedTransaction,
                {
                  skipPreflight: true,
                  preflightCommitment: 'processed',
                  maxRetries: 3
                }
              ]
            })
          });

          const heliusResult = await heliusResponse.json();
          
          if (heliusResult.result && !heliusResult.error) {
            const signature = heliusResult.result;
            console.log(`✅ Transaction sent via Helius with rebates: ${signature}`);
            
            const connection = getHeliusConnection();
            
            // Poll for confirmation with timeout
            let confirmed = false;
            let attempts = 0;
            const maxAttempts = 30; // 30 seconds max
            
            while (!confirmed && attempts < maxAttempts) {
              try {
                const status = await connection.getSignatureStatus(signature);
                if (status.value?.confirmationStatus === 'confirmed' || status.value?.confirmationStatus === 'finalized') {
                  if (!status.value.err) {
                    confirmed = true;
                    executeData = {
                      status: 'Success',
                      signature,
                      rebatesEnabled: true
                    };
                    rebatesEnabled = true;
                    console.log(`✅ Swap confirmed with Helius Backrun Rebates! Signature: ${signature}`);
                  } else {
                    throw new Error('Transaction failed on-chain');
                  }
                } else {
                  await new Promise(r => setTimeout(r, 1000));
                  attempts++;
                }
              } catch (pollError) {
                await new Promise(r => setTimeout(r, 1000));
                attempts++;
              }
            }
            
            if (!confirmed) {
              console.log('⏳ Helius confirmation timeout, falling back to Jupiter execute');
              executeData = null;
            }
          } else {
            console.log('⚠️ Helius send failed, falling back to Jupiter execute:', heliusResult.error?.message);
          }
        } catch (heliusError: any) {
          console.log('⚠️ Helius rebate attempt failed, falling back to Jupiter:', heliusError.message);
        }
      }
      
      // Fallback to Jupiter Ultra execute if Helius didn't work
      if (!executeData) {
        const response = await fetch('https://api.jup.ag/ultra/v1/execute', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'x-api-key': process.env.JUPITER_API_KEY || ''
          },
          body: JSON.stringify({
            signedTransaction,
            requestId
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Jupiter Ultra execute error:', response.status, errorText);
          return res.status(response.status).json({ error: errorText || 'Failed to execute order' });
        }

        executeData = await response.json();
      }
      
      if (executeData.status === "Success") {
        console.log('✅ Ultra Swap successful:', JSON.stringify(executeData, null, 2));
        console.log(`   https://solscan.io/tx/${executeData.signature}`);
        
        // Record swap and award points if wallet address is provided
        if (walletAddress && inputMint && outputMint && executeData.signature) {
          try {
            // Calculate USD value server-side using Jupiter Price API
            let swapUsdValue = 0;
            
            // Known stablecoins - if input or output is a stablecoin, use that as USD value
            const STABLECOINS = [
              'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
              'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
            ];
            
            const parsedInputAmount = parseFloat(inputAmount) || 0;
            const parsedOutputAmount = parseFloat(outputAmount) || 0;
            
            if (STABLECOINS.includes(inputMint)) {
              // Swapping FROM stablecoin - use input amount as USD value
              swapUsdValue = parsedInputAmount;
            } else if (STABLECOINS.includes(outputMint)) {
              // Swapping TO stablecoin - use output amount as USD value
              swapUsdValue = parsedOutputAmount;
            } else {
              // Fetch price from Jupiter Price API v3 for input token
              try {
                const priceResponse = await fetch(
                  `https://api.jup.ag/price/v3?ids=${inputMint}`,
                  { 
                    headers: { 
                      'x-api-key': process.env.JUPITER_API_KEY || '',
                      'Accept': 'application/json'
                    } 
                  }
                );
                
                if (priceResponse.ok) {
                  const priceData = await priceResponse.json();
                  // v3 returns data directly under mint key with 'usdPrice' field (number)
                  const tokenPrice = priceData?.[inputMint]?.usdPrice || 0;
                  swapUsdValue = parsedInputAmount * tokenPrice;
                  console.log(`📊 Token price for ${inputMint}: $${tokenPrice}, USD value: $${swapUsdValue.toFixed(2)}`);
                } else {
                  console.error('Price API v3 returned error:', await priceResponse.text());
                }
              } catch (priceError) {
                console.error('Failed to fetch token price:', priceError);
              }
            }
            
            // Award 1 point per $1 traded (tiered: 1x up to $1K, 1.5x up to $10K, 2x above $10K)
            let pointsAwarded = 0;
            if (swapUsdValue >= 1) {
              if (swapUsdValue <= 1000) {
                pointsAwarded = Math.floor(swapUsdValue * 1);
              } else if (swapUsdValue <= 10000) {
                pointsAwarded = Math.floor(1000 + (swapUsdValue - 1000) * 1.5);
              } else {
                pointsAwarded = Math.floor(1000 + 13500 + (swapUsdValue - 10000) * 2);
              }
            }
            // Upsert points into userPoints table
            if (pointsAwarded > 0) {
              try {
                await db
                  .insert(userPoints)
                  .values({ walletAddress, points: pointsAwarded, accountsClosed: 0 })
                  .onConflictDoUpdate({
                    target: userPoints.walletAddress,
                    set: { points: sql`${userPoints.points} + ${pointsAwarded}`, lastUpdated: new Date() }
                  });
              } catch (ptErr) {
                console.error('Failed to award swap points:', ptErr);
              }
            }
            
            // Record the swap
            // platformFee might be an object from Jupiter, extract the fee amount
            let feeAmount = "0";
            if (platformFee) {
              if (typeof platformFee === 'object' && platformFee.amount) {
                feeAmount = platformFee.amount.toString();
              } else if (typeof platformFee === 'number' || typeof platformFee === 'string') {
                feeAmount = platformFee.toString();
              }
            }
            
            await storage.createSwapRecord({
              walletAddress,
              txSignature: executeData.signature,
              inputMint,
              outputMint,
              inputAmount: inputAmount?.toString() || "0",
              outputAmount: outputAmount?.toString() || "0",
              inputSymbol: inputSymbol || null,
              outputSymbol: outputSymbol || null,
              usdValue: swapUsdValue.toFixed(2),
              pointsAwarded,
              platformFee: feeAmount,
              referralCode: referralCode || null
            });
            
            console.log(`🎯 Swap recorded: ${walletAddress} swapped $${swapUsdValue.toFixed(2)} USD, earned ${pointsAwarded} points`);
            
            // Add points info to response
            executeData.pointsAwarded = pointsAwarded;
            executeData.usdValue = swapUsdValue.toFixed(2);
          } catch (recordError) {
            console.error('Failed to record swap:', recordError);
            // Don't fail the response, swap was still successful
          }
        }
      } else {
        console.error('❌ Ultra Swap failed:', JSON.stringify(executeData, null, 2));
        if (executeData.signature) {
          console.log(`   View failed tx: https://solscan.io/tx/${executeData.signature}`);
        }
        console.log('   Note: You can retry with same signedTransaction + requestId for up to 2 minutes to poll status');
      }
      
      res.json(executeData);
      
    } catch (error: any) {
      console.error('❌ Ultra execute error:', error);
      res.status(500).json({ 
        error: 'Failed to execute swap',
        details: error?.message || 'Unknown error'
      });
    }
  });

  // Get all wallet token accounts with metadata using Jupiter Holdings API
  app.get("/api/wallet/all-tokens", async (req, res) => {
    try {
      if (!process.env.JUPITER_API_KEY) {
        console.error('❌ JUPITER_API_KEY not configured');
        return res.status(500).json({ error: 'Jupiter API key not configured' });
      }

      const { address } = req.query;
      
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ error: 'Missing address parameter' });
      }

      // Use Jupiter Ultra Holdings API - returns ALL tokens (standard + Token-2022)
      const holdingsResponse = await fetch(`https://api.jup.ag/ultra/v1/holdings/${address}`, {
        headers: {
          'x-api-key': process.env.JUPITER_API_KEY
        }
      });
      
      if (!holdingsResponse.ok) {
        const errorText = await holdingsResponse.text();
        console.error('Jupiter Holdings API error:', holdingsResponse.status, errorText);
        return res.status(holdingsResponse.status).json({ error: 'Failed to fetch token holdings' });
      }

      const holdings = await holdingsResponse.json();
      
      if (holdings.error) {
        return res.status(400).json({ error: holdings.error });
      }

      const tokensWithMetadata: any[] = [];

      // Add native SOL if balance > 0
      const solBalance = parseFloat(holdings.nativeBalance?.uiAmount || holdings.uiAmount || '0');
      if (solBalance > 0) {
        tokensWithMetadata.push({
          address: 'So11111111111111111111111111111111111111112',
          symbol: 'SOL',
          name: 'Solana',
          decimals: 9,
          logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
          balance: solBalance,
          balanceRaw: holdings.nativeBalance?.amount || holdings.amount
        });
      }

      // Process all token holdings (includes both standard and Token-2022)
      if (holdings.tokens) {
        const tokenEntries = Object.entries(holdings.tokens);
        const mintAddresses = tokenEntries.map(([mint]) => mint);
        
        // Batch fetch metadata for all tokens using Jupiter Tokens API v2 (requires API key)
        let tokenMetadata: Record<string, any> = {};
        if (mintAddresses.length > 0 && process.env.JUPITER_API_KEY) {
          try {
            // Use v2 search endpoint with comma-separated mints (up to 100 per request)
            const batchSize = 100;
            for (let i = 0; i < mintAddresses.length; i += batchSize) {
              const batch = mintAddresses.slice(i, i + batchSize);
              const metaResponse = await fetch(
                `https://api.jup.ag/tokens/v2/search?query=${batch.join(',')}`,
                {
                  headers: {
                    'x-api-key': process.env.JUPITER_API_KEY
                  }
                }
              );
              if (metaResponse.ok) {
                const metaData = await metaResponse.json();
                if (Array.isArray(metaData)) {
                  for (const t of metaData) {
                    if (t && t.id) {
                      tokenMetadata[t.id] = t;
                    }
                  }
                }
              }
            }
          } catch (err) {
            console.error('Error batch fetching token metadata:', err);
          }
        }
        
        for (const [mintAddress, tokenAccounts] of tokenEntries) {
          // Sum all token accounts for this mint (some tokens may have multiple accounts)
          const totalBalance = (tokenAccounts as any[]).reduce((sum, acc) => 
            sum + parseFloat(acc.uiAmount || '0'), 0
          );
          
          if (totalBalance > 0) {
            const firstAccount = (tokenAccounts as any[])[0];
            const metadata = tokenMetadata[mintAddress];
            
            tokensWithMetadata.push({
              address: mintAddress,
              symbol: metadata?.symbol || mintAddress.slice(0, 4),
              name: metadata?.name || 'Unknown Token',
              decimals: firstAccount.decimals,
              logoURI: metadata?.icon || '',
              balance: totalBalance,
              balanceRaw: (tokenAccounts as any[]).reduce((sum, acc) => 
                sum + BigInt(acc.amount || '0'), BigInt(0)
              ).toString()
            });
          }
        }
      }

      // Fetch USD prices for all tokens using Jupiter v3 API
      if (tokensWithMetadata.length > 0) {
        try {
          const mintAddresses = tokensWithMetadata.map(t => t.address).join(',');
          const jupiterApiKey = process.env.JUPITER_API_KEY;
          const priceResponse = await fetch(`https://api.jup.ag/price/v3?ids=${mintAddresses}`, {
            headers: jupiterApiKey ? { 'x-api-key': jupiterApiKey } : {}
          });
          
          if (priceResponse.ok) {
            const priceData = await priceResponse.json();
            
            // Add USD price to each token
            tokensWithMetadata.forEach(token => {
              const priceInfo = priceData[token.address];
              if (priceInfo && priceInfo.usdPrice) {
                token.usdPrice = priceInfo.usdPrice;
                token.usdValue = token.balance * priceInfo.usdPrice;
              } else {
                token.usdPrice = 0;
                token.usdValue = 0;
              }
            });
          }
        } catch (err) {
          console.error('Error fetching USD prices:', err);
          // If price fetch fails, set default values
          tokensWithMetadata.forEach(token => {
            token.usdPrice = 0;
            token.usdValue = 0;
          });
        }
      }

      return res.json({ 
        success: true, 
        tokens: tokensWithMetadata
      });
    } catch (error: any) {
      console.error('All tokens fetch error:', error);
      return res.status(500).json({ error: error.message || 'Failed to fetch tokens' });
    }
  });

  // Get wallet token balance
  app.get("/api/wallet/token-balance", async (req, res) => {
    try {
      const { address, mint } = req.query;
      
      if (!address || !mint || typeof address !== 'string' || typeof mint !== 'string') {
        return res.status(400).json({ error: 'Missing address or mint parameter' });
      }

      // Use Jupiter Ultra Holdings API for consistent balance data
      if (process.env.JUPITER_API_KEY) {
        try {
          const holdingsResponse = await fetch(`https://api.jup.ag/ultra/v1/holdings/${address}`, {
            headers: {
              'x-api-key': process.env.JUPITER_API_KEY
            }
          });
          
          if (holdingsResponse.ok) {
            const holdings = await holdingsResponse.json();
            
            // Check for SOL
            if (mint === 'So11111111111111111111111111111111111111112') {
              return res.json({ 
                success: true, 
                balance: holdings.uiAmount || 0,
                balanceRaw: holdings.amount || '0'
              });
            }
            
            // Check token holdings
            if (holdings.tokens && holdings.tokens[mint]) {
              const tokenAccounts = holdings.tokens[mint];
              // Sum all token accounts for this mint
              const totalBalance = tokenAccounts.reduce((sum: number, acc: any) => 
                sum + parseFloat(acc.uiAmount || '0'), 0
              );
              const totalRaw = tokenAccounts.reduce((sum: bigint, acc: any) => 
                sum + BigInt(acc.amount || '0'), BigInt(0)
              );
              
              return res.json({ 
                success: true, 
                balance: totalBalance,
                balanceRaw: totalRaw.toString()
              });
            }
            
            // Token not found in holdings
            return res.json({ 
              success: true, 
              balance: 0,
              balanceRaw: '0'
            });
          }
        } catch (holdingsErr) {
          console.error('Holdings API error, falling back to RPC:', holdingsErr);
        }
      }

      const connection = getHeliusConnection();
      const walletPubkey = new PublicKey(address);

      // Check if it's SOL
      if (mint === 'So11111111111111111111111111111111111111112') {
        const balance = await connection.getBalance(walletPubkey);
        return res.json({ 
          success: true, 
          balance: balance / 1e9,
          balanceRaw: balance.toString()
        });
      }

      // SPL Token balance using getParsedTokenAccountsByOwner
      const mintPubkey = new PublicKey(mint);
      
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        walletPubkey,
        { mint: mintPubkey }
      );

      if (tokenAccounts.value.length > 0) {
        const accountData = tokenAccounts.value[0].account.data.parsed.info;
        const balance = parseFloat(accountData.tokenAmount.uiAmount || '0');
        
        return res.json({ 
          success: true, 
          balance,
          balanceRaw: accountData.tokenAmount.amount,
          decimals: accountData.tokenAmount.decimals
        });
      } else {
        return res.json({ 
          success: true, 
          balance: 0,
          balanceRaw: '0',
          decimals: 0
        });
      }
    } catch (error: any) {
      console.error('Balance fetch error:', error);
      return res.status(500).json({ error: error.message || 'Failed to fetch balance' });
    }
  });

  // Check if Helius is configured (without exposing the key)
  app.get("/api/helius-config", async (req, res) => {
    const apiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY || "";
    res.json({
      success: !!apiKey,
      configured: !!apiKey
    });
  });

  // Get latest blockhash via backend (avoids CORS issues)
  app.get("/api/rpc/blockhash", async (req, res) => {
    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      res.json({ success: true, blockhash, lastValidBlockHeight });
    } catch (error: any) {
      console.error('Failed to get blockhash:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Send signed transaction via backend (keeps Helius key secure)
  // Supports Helius Backrun Rebates - users earn SOL from MEV their trades create
  app.post("/api/rpc/send-transaction", async (req, res) => {
    try {
      const { signedTransaction, rebateAddress } = req.body;
      
      if (!signedTransaction) {
        return res.status(400).json({ error: "Missing signed transaction" });
      }

      const heliusApiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
      
      // Use Helius with Backrun Rebates if available
      if (heliusApiKey && rebateAddress) {
        try {
          // Build Helius RPC URL with rebate-address for MEV rebates
          const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}&rebate-address=${rebateAddress}`;
          
          console.log(`🔄 Sending transaction with Helius Backrun Rebates enabled`);
          console.log(`💰 MEV rebates will be paid to: ${rebateAddress}`);
          
          const response = await fetch(heliusUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'sendTransaction',
              params: [
                signedTransaction,
                {
                  skipPreflight: true,
                  preflightCommitment: 'processed',
                  maxRetries: 3
                }
              ]
            })
          });

          const result = await response.json();
          
          if (result.error) {
            console.error('Helius sendTransaction error:', result.error);
            throw new Error(result.error.message || 'Transaction failed');
          }

          const signature = result.result;
          console.log(`✅ Transaction sent with rebates: ${signature}`);
          
          const connection = getHeliusConnection();
          const confirmation = await connection.confirmTransaction(signature, 'confirmed');
          
          if (confirmation.value.err) {
            console.error('Transaction failed on-chain:', confirmation.value.err);
            // Parse the error to give a more helpful message
            let userMessage = "Transaction failed on blockchain";
            const errStr = JSON.stringify(confirmation.value.err);
            if (errStr.includes('AccountNotFound') || errStr.includes('InvalidAccountData')) {
              userMessage = "Some accounts were already closed. Please re-scan your wallet to get fresh data.";
            } else if (errStr.includes('InsufficientFunds')) {
              userMessage = "Insufficient SOL for transaction fees. Please add more SOL to your wallet.";
            } else if (errStr.includes('OwnerMismatch') || errStr.includes('InvalidOwner')) {
              userMessage = "Account ownership mismatch. Please re-scan your wallet and try again.";
            }
            return res.status(400).json({ 
              error: userMessage,
              details: confirmation.value.err,
              signature,
              suggestion: "Try re-scanning your wallet to get the latest account data."
            });
          }

          return res.json({ 
            success: true, 
            signature,
            confirmed: true,
            rebatesEnabled: true,
            rebateAddress
          });
        } catch (heliusError: any) {
          console.error('Helius rebate transaction failed, falling back:', heliusError.message);
        }
      }

      const connection = getHeliusConnection();

      // Send the signed transaction
      const txBuffer = Buffer.from(signedTransaction, 'base64');
      const signature = await connection.sendRawTransaction(txBuffer, {
        skipPreflight: true,
        maxRetries: 3
      });

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        console.error('Transaction failed on-chain:', confirmation.value.err);
        // Parse the error to give a more helpful message
        let userMessage = "Transaction failed on blockchain";
        const errStr = JSON.stringify(confirmation.value.err);
        if (errStr.includes('AccountNotFound') || errStr.includes('InvalidAccountData')) {
          userMessage = "Some accounts were already closed. Please re-scan your wallet to get fresh data.";
        } else if (errStr.includes('InsufficientFunds')) {
          userMessage = "Insufficient SOL for transaction fees. Please add more SOL to your wallet.";
        } else if (errStr.includes('OwnerMismatch') || errStr.includes('InvalidOwner')) {
          userMessage = "Account ownership mismatch. Please re-scan your wallet and try again.";
        }
        return res.status(400).json({ 
          error: userMessage,
          details: confirmation.value.err,
          signature,
          suggestion: "Try re-scanning your wallet to get the latest account data."
        });
      }

      res.json({ 
        success: true, 
        signature,
        confirmed: true,
        rebatesEnabled: false
      });

    } catch (error: any) {
      console.error('Send transaction error:', error);
      res.status(500).json({ error: error.message || 'Failed to send transaction' });
    }
  });

  // Check for MEV rebates in a transaction (Helius Backrun Rebates)
  app.get("/api/rpc/check-rebates/:signature/:walletAddress", async (req, res) => {
    try {
      const { signature, walletAddress } = req.params;
      
      if (!signature || !walletAddress) {
        return res.status(400).json({ error: "Missing signature or wallet address" });
      }

      const heliusApiKey = process.env.HELIUS_API_KEY;
      if (!heliusApiKey) {
        return res.json({ success: true, rebateAmount: 0, message: "Helius not configured" });
      }

      // Fetch parsed transaction to find rebate transfers
      const heliusUrl = `https://api.helius.xyz/v0/transactions/?api-key=${heliusApiKey}`;
      
      const response = await fetch(heliusUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactions: [signature]
        })
      });

      if (!response.ok) {
        console.error('Helius transaction parse failed:', response.status);
        return res.json({ success: true, rebateAmount: 0 });
      }

      const transactions = await response.json();
      
      if (!transactions || transactions.length === 0) {
        return res.json({ success: true, rebateAmount: 0 });
      }

      const tx = transactions[0];
      
      // Look for SOL transfers TO the wallet that are rebates
      // Rebates come from Helius's MEV arbitrage bots
      let rebateAmount = 0;
      
      if (tx.nativeTransfers && Array.isArray(tx.nativeTransfers)) {
        for (const transfer of tx.nativeTransfers) {
          // Rebates are transfers TO the user's wallet
          // that are NOT from the user themselves (not refunds)
          if (transfer.toUserAccount === walletAddress && 
              transfer.fromUserAccount !== walletAddress) {
            // Check if this looks like a rebate (small amount, from MEV bot)
            const amount = transfer.amount / LAMPORTS_PER_SOL;
            // Rebates are typically small (0.0001 - 0.01 SOL range)
            if (amount > 0 && amount < 0.1) {
              rebateAmount += amount;
              console.log(`💰 Detected MEV rebate: ${amount} SOL from ${transfer.fromUserAccount}`);
            }
          }
        }
      }

      if (rebateAmount > 0) {
        console.log(`✅ Total MEV rebate for ${signature}: ${rebateAmount} SOL`);
      }

      res.json({ 
        success: true, 
        rebateAmount,
        rebateAmountLamports: Math.floor(rebateAmount * LAMPORTS_PER_SOL)
      });

    } catch (error: any) {
      console.error('Check rebates error:', error);
      res.json({ success: true, rebateAmount: 0 });
    }
  });

  // Scan wallet for empty token accounts
  app.get("/api/sol-refund/scan/:address", async (req, res) => {
    try {
      const { address } = req.params;
      
      // Validate address
      try {
        new PublicKey(address);
      } catch (error) {
        return res.status(400).json({ error: "Invalid wallet address" });
      }

      const connection = getHeliusConnection();

      const walletPublicKey = new PublicKey(address);
      
      // Get all token accounts for the wallet - BOTH standard Token Program AND Token-2022
      const [tokenAccounts, token2022Accounts] = await Promise.all([
        connection.getParsedTokenAccountsByOwner(walletPublicKey, {
          programId: TOKEN_PROGRAM_ID,
        }),
        connection.getParsedTokenAccountsByOwner(walletPublicKey, {
          programId: TOKEN_2022_PROGRAM_ID,
        })
      ]);

      // Combine both standard and Token-2022 accounts
      const allTokenAccounts = [
        ...tokenAccounts.value,
        ...token2022Accounts.value
      ];

      console.log(`📊 Found ${tokenAccounts.value.length} standard token accounts + ${token2022Accounts.value.length} Token-2022 accounts`);

      const emptyAccounts = [];
      let totalReclaimable = 0;

      // Note: Permanent delegate extension only affects transfers/burns, NOT account closure
      // The account owner can still close their own empty Token-2022 accounts
      // So we include ALL empty accounts regardless of permanent delegate status

      for (const accountInfo of allTokenAccounts) {
        const account = accountInfo.account;
        const parsedInfo = account.data.parsed.info;
        
        // Check if account has zero balance
        if (parseFloat(parsedInfo.tokenAmount.amount) === 0) {
          const rentAmount = account.lamports / 1e9; // Convert lamports to SOL
          
          emptyAccounts.push({
            accountAddress: accountInfo.pubkey.toString(),
            mintAddress: parsedInfo.mint,
            walletAddress: address,
            tokenSymbol: parsedInfo.mint.substring(0, 8) + "...", // Simplified symbol
            tokenName: null,
            rentAmount: rentAmount.toString(),
            balance: "0",
            decimals: parsedInfo.tokenAmount.decimals
          });

          totalReclaimable += rentAmount;
        }
      }

      // Store scan result
      const scanResult = await storage.createScanResult({
        walletAddress: address,
        totalAccounts: allTokenAccounts.length,
        emptyAccounts: emptyAccounts.length,
        totalReclaimable: totalReclaimable.toString()
      });

      // Store empty accounts
      for (const account of emptyAccounts) {
        await storage.createEmptyTokenAccount(account);
      }

      // Send Discord alert for wallet scan
      if (emptyAccounts.length > 0) {
        try {
          const { sendWalletCheckAlert } = await import('./discordWebhookService.js');
          await sendWalletCheckAlert({
            walletAddress: address,
            emptyAccountsFound: emptyAccounts.length,
            estimatedSOL: totalReclaimable
          });
        } catch (e) {
          console.error('Discord wallet check alert failed:', e);
        }
      }

      const response = {
        success: true,
        walletAddress: address,
        totalAccounts: allTokenAccounts.length,
        emptyAccounts: emptyAccounts.length,
        totalReclaimable: totalReclaimable.toFixed(9),
        accounts: emptyAccounts,
        scannedAt: scanResult.scannedAt.toISOString()
      };

      res.json(response);
    } catch (error) {
      console.error("Scan error:", error);
      res.status(500).json({ error: "Failed to scan wallet for empty accounts" });
    }
  });

  // Scan wallet for program buffer accounts (failed deploys/upgrades)
  app.get("/api/buffer-accounts/scan/:address", async (req, res) => {
    try {
      const { address } = req.params;
      
      // Validate address
      try {
        new PublicKey(address);
      } catch (error) {
        return res.status(400).json({ error: "Invalid wallet address" });
      }

      // Get RPC endpoint
      const heliusApiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
      const rpcEndpoint = getHeliusRpcUrl();

      const connection = getHeliusConnection();
      const walletPublicKey = new PublicKey(address);
      
      // BPF Loader Upgradeable Program ID
      const BPF_LOADER_UPGRADEABLE = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
      
      console.log(`🔍 Scanning for buffer accounts owned by: ${address}`);
      
      // Get all accounts owned by the BPF Loader Upgradeable program
      // Filter by: Buffer state (discriminator [1,0,0,0]) and authority = wallet
      const accounts = await connection.getProgramAccounts(BPF_LOADER_UPGRADEABLE, {
        filters: [
          {
            // Buffer accounts have minimum size of 37 bytes (4 byte discriminator + 1 byte option + 32 byte pubkey)
            // But typically larger for actual program data
            dataSize: 37, // Minimum buffer metadata size (authority only, no data)
          },
          {
            memcmp: {
              offset: 0,
              // Buffer state discriminator = 1 (little-endian u32)
              bytes: 'WCa6jL', // bs58 encoded [1, 0, 0, 0, 1] - Buffer with Some(authority)
            },
          },
          {
            memcmp: {
              offset: 5, // Authority pubkey starts after 4-byte discriminator + 1-byte option tag
              bytes: walletPublicKey.toBase58(),
            },
          },
        ],
      });

      // Also try to find larger buffer accounts (with program data)
      // These won't match the dataSize: 37 filter, so we do a separate query
      const largerAccounts = await connection.getProgramAccounts(BPF_LOADER_UPGRADEABLE, {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: 'WCa6jL', // Buffer with Some(authority)
            },
          },
          {
            memcmp: {
              offset: 5,
              bytes: walletPublicKey.toBase58(),
            },
          },
        ],
      });

      // Deduplicate and combine results
      const accountMap = new Map();
      [...accounts, ...largerAccounts].forEach(acc => {
        accountMap.set(acc.pubkey.toString(), acc);
      });
      
      const allBufferAccounts = Array.from(accountMap.values());
      
      console.log(`📊 Found ${allBufferAccounts.length} buffer accounts for ${address}`);

      const bufferAccounts = allBufferAccounts.map(({ pubkey, account }) => ({
        address: pubkey.toString(),
        lamports: account.lamports,
        rentAmount: (account.lamports / 1e9).toFixed(6),
        dataSize: account.data.length,
      }));

      const totalReclaimable = bufferAccounts.reduce((sum, acc) => sum + acc.lamports, 0) / 1e9;

      res.json({
        success: true,
        walletAddress: address,
        bufferAccounts,
        totalAccounts: bufferAccounts.length,
        totalReclaimable: totalReclaimable.toFixed(6),
        scannedAt: new Date().toISOString()
      });

    } catch (error) {
      console.error("Buffer scan error:", error);
      res.status(500).json({ error: "Failed to scan for buffer accounts" });
    }
  });

  // Close buffer accounts to reclaim SOL
  app.post("/api/buffer-accounts/prepare-close", async (req, res) => {
    try {
      const { walletAddress, bufferAddresses, referralCode } = req.body;

      if (!walletAddress || !bufferAddresses || !Array.isArray(bufferAddresses) || bufferAddresses.length === 0) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Validate addresses
      try {
        new PublicKey(walletAddress);
        bufferAddresses.forEach((addr: string) => new PublicKey(addr));
      } catch (error) {
        return res.status(400).json({ error: "Invalid address format" });
      }

      // Get RPC endpoint
      const heliusApiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
      const rpcEndpoint = getHeliusRpcUrl();

      const connection = getHeliusConnection();
      const walletPubkey = new PublicKey(walletAddress);
      const BPF_LOADER_UPGRADEABLE = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
      
      // Check referral for fee split
      let referralCodeData = null;
      const permanentAssociation = await storage.getWalletReferralAssociation(walletAddress);
      if (permanentAssociation) {
        referralCodeData = await storage.getReferralCodeByCode(permanentAssociation.referralCode);
      } else if (referralCode) {
        referralCodeData = await storage.getReferralCodeByCode(referralCode);
      }

      // Platform wallet
      const platformWalletAddress = 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT';
      
      // Calculate total lamports to recover
      let totalLamports = 0;
      for (const bufferAddr of bufferAddresses) {
        try {
          const bufferPubkey = new PublicKey(bufferAddr);
          const accountInfo = await connection.getAccountInfo(bufferPubkey);
          if (accountInfo) {
            totalLamports += accountInfo.lamports;
          }
        } catch (e) {
          console.log(`Could not get info for buffer ${bufferAddr}`);
        }
      }

      // Fee: 10% platform fee on rent reclaimed (user gets 90%)
      const PLATFORM_FEE_BPS = 1000; // 10%
      const totalFeeLamports = Math.floor(totalLamports * PLATFORM_FEE_BPS / 10000);
      const userPayoutLamports = totalLamports - totalFeeLamports;
      
      // Split: 50% platform, 50% referral (if exists)
      const referralFeeLamports = referralCodeData ? Math.floor(totalFeeLamports * 0.5) : 0;
      const platformFeeLamports = totalFeeLamports - referralFeeLamports;

      // Build transaction
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      
      const transaction = new Transaction();
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = walletPubkey;

      // Add priority fee
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10000 })
      );

      // Add close instruction for each buffer account
      // Close instruction = discriminator 5
      for (const bufferAddr of bufferAddresses) {
        const bufferPubkey = new PublicKey(bufferAddr);
        
        const closeInstruction = new TransactionInstruction({
          keys: [
            { pubkey: bufferPubkey, isSigner: false, isWritable: true },      // Buffer to close
            { pubkey: walletPubkey, isSigner: false, isWritable: true },      // Recipient of lamports
            { pubkey: walletPubkey, isSigner: true, isWritable: false },       // Authority (signer)
          ],
          programId: BPF_LOADER_UPGRADEABLE,
          data: Buffer.from([5]), // Close instruction discriminator
        });
        
        transaction.add(closeInstruction);
      }

      // Add platform fee transfer
      if (platformFeeLamports > 0) {
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: walletPubkey,
            toPubkey: new PublicKey(platformWalletAddress),
            lamports: platformFeeLamports,
          })
        );
      }

      // Add referral fee transfer
      if (referralFeeLamports > 0 && referralCodeData) {
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: walletPubkey,
            toPubkey: new PublicKey(referralCodeData.walletAddress),
            lamports: referralFeeLamports,
          })
        );
      }

      // Serialize transaction
      const serializedTransaction = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
      const base64Transaction = serializedTransaction.toString('base64');

      const netRecovery = (totalLamports - totalFeeLamports) / 1e9;

      res.json({
        success: true,
        transaction: base64Transaction,
        bufferCount: bufferAddresses.length,
        totalRecoverable: (totalLamports / 1e9).toFixed(6),
        platformFee: (platformFeeLamports / 1e9).toFixed(6),
        referralFee: (referralFeeLamports / 1e9).toFixed(6),
        netRecovery: netRecovery.toFixed(6),
        feePercentage: 'flat 0.002 SOL/account',
      });

    } catch (error) {
      console.error("Buffer close error:", error);
      res.status(500).json({ error: "Failed to prepare buffer close transaction" });
    }
  });

  // Prepare transaction for SOL refund
  app.post("/api/sol-refund/prepare-transaction", async (req, res) => {
    try {
      const { walletAddress, selectedAccounts, donationPercentage, referralCode, feeReceiverAddress, feePercentage } = req.body;
      
      // Check for permanent wallet association first (first referral wins forever)
      let referralCodeData = null;
      let permanentAssociation = await storage.getWalletReferralAssociation(walletAddress);
      
      // Developer API Platform: If feeReceiverAddress is provided, use it directly (no referral code needed)
      let useDirectFeeAddress = false;
      if (feeReceiverAddress) {
        // SECURITY: Validate that the feeReceiverAddress is a valid PDA wallet from our system
        const validReferralAccount = await storage.getReferralAccountByPda(feeReceiverAddress);
        if (!validReferralAccount) {
          console.log('❌ Developer API: Rejected - wallet is not a valid PDA from our system:', feeReceiverAddress);
          return res.status(400).json({ 
            error: 'Invalid fee receiver address. Only PDA wallets generated by our system are accepted. Personal wallets are not allowed.',
            code: 'INVALID_PDA_WALLET'
          });
        }
        
        // SECURITY: Validate minimum 4% fee
        const requestedFee = parseFloat(feePercentage) || 0;
        if (requestedFee < 4) {
          console.log(`❌ Developer API: Rejected - fee ${requestedFee}% is below minimum 4%`);
          return res.status(400).json({ 
            error: 'Minimum 4% fee is required. Please set fee percentage to 4 or higher.',
            code: 'FEE_TOO_LOW'
          });
        }
        
        console.log('💼 Developer API: Validated PDA wallet:', feeReceiverAddress);
        useDirectFeeAddress = true;
      } else if (permanentAssociation) {
        // Use permanent association (old affiliate system)
        referralCodeData = await storage.getReferralCodeByCode(permanentAssociation.referralCode);
        console.log('Using permanent referral association:', permanentAssociation.referralCode);
      } else if (referralCode) {
        // No permanent association exists, check if referral code is valid
        const tempReferralData = await storage.getReferralCodeByCode(referralCode);
        if (tempReferralData) {
          // Create permanent association (first referral wins)
          try {
            permanentAssociation = await storage.createWalletReferralAssociation({
              walletAddress,
              referralCodeId: tempReferralData.id,
              referralCode: referralCode
            });
            referralCodeData = tempReferralData;
            console.log('Created new permanent referral association:', referralCode, 'for wallet:', walletAddress);
          } catch (error) {
            console.log('Failed to create association (might already exist):', error);
            // Try to get existing association
            permanentAssociation = await storage.getWalletReferralAssociation(walletAddress);
            if (permanentAssociation) {
              referralCodeData = await storage.getReferralCodeByCode(permanentAssociation.referralCode);
            }
          }
        }
      }

      // Get RPC connection
      const heliusApiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
      const rpcUrl = getHeliusRpcUrl();
      
      const connection = getHeliusConnection();

      // Verify selected accounts exist on blockchain and get fresh data
      console.log(`🔍 Verifying ${selectedAccounts.length} selected accounts on blockchain...`);
      const accountsToClose = [];
      let totalRecoveredLamports = 0;
      const accountInfos = [];
      
      for (const accountAddress of selectedAccounts) {
        try {
          const accountPublicKey = new PublicKey(accountAddress);
          const accountInfo = await connection.getAccountInfo(accountPublicKey);
          
          if (accountInfo) {
            console.log(`✅ Account ${accountAddress.substring(0, 8)}... exists with ${accountInfo.lamports} lamports`);
            totalRecoveredLamports += accountInfo.lamports;
            accountInfos.push({ 
              accountAddress,
              lamports: accountInfo.lamports 
            });
            accountsToClose.push({ accountAddress });
          } else {
            console.log(`❌ Account ${accountAddress.substring(0, 8)}... does NOT exist on blockchain (already closed or invalid)`);
          }
        } catch (error) {
          console.log(`⚠️ Error getting account info for ${accountAddress.substring(0, 8)}...:`, error);
        }
      }
      
      console.log(`📊 Found ${accountsToClose.length} valid accounts to close out of ${selectedAccounts.length} selected`);
      
      if (accountsToClose.length === 0) {
        return res.status(400).json({ error: "No valid accounts to close - all selected accounts are already closed or don't exist" });
      }

      // Check transaction size limit - Solana has a 1232 byte limit
      // Each close instruction is ~40 bytes, plus fee transfers ~70 bytes each
      // Safe limit is 20 accounts per transaction to reliably stay under 1232 bytes
      const MAX_ACCOUNTS_PER_TX = 20;
      if (accountsToClose.length > MAX_ACCOUNTS_PER_TX) {
        return res.status(400).json({ 
          error: `Too many accounts in a single transaction. The limit is ${MAX_ACCOUNTS_PER_TX} accounts per transaction to stay within Solana's size limits. Please process accounts in smaller batches.`,
          maxAccounts: MAX_ACCOUNTS_PER_TX,
          selectedAccounts: accountsToClose.length,
          suggestion: `Split your ${accountsToClose.length} accounts into ${Math.ceil(accountsToClose.length / MAX_ACCOUNTS_PER_TX)} batches of ${MAX_ACCOUNTS_PER_TX} accounts each.`
        });
      }

      // Create transaction to close token accounts
      const transaction = new Transaction();
      
      // Add close account instructions for each empty account with validation
      const { createCloseAccountInstruction, AccountLayout } = await import('@solana/spl-token');
      
      const validAccountsForTx = [];
      const skippedAccounts = [];
      
      for (const account of accountsToClose) {
        const accountPublicKey = new PublicKey(account.accountAddress);
        const ownerPublicKey = new PublicKey(walletAddress);
        
        try {
          // Get account info and validate it can be closed
          const accountInfo = await connection.getAccountInfo(accountPublicKey);
          
          if (!accountInfo) {
            console.log(`⚠️ Skipping ${account.accountAddress.substring(0, 8)}... - account no longer exists`);
            skippedAccounts.push({ address: account.accountAddress, reason: 'Account does not exist' });
            continue;
          }
          
          // Detect program ID
          let programId = TOKEN_PROGRAM_ID;
          const isToken2022 = accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID);
          if (isToken2022) {
            programId = TOKEN_2022_PROGRAM_ID;
            console.log(`Account ${account.accountAddress.substring(0, 8)}... uses Token-2022`);
          } else if (!accountInfo.owner.equals(TOKEN_PROGRAM_ID)) {
            console.log(`⚠️ Skipping ${account.accountAddress.substring(0, 8)}... - not a token account (owner: ${accountInfo.owner.toString()})`);
            skippedAccounts.push({ address: account.accountAddress, reason: 'Not a token account' });
            continue;
          }
          
          // Use getAccount for proper parsing (handles both Token and Token-2022)
          try {
            const tokenAccount = await getAccount(connection, accountPublicKey, 'confirmed', programId);
            
            // Verify the account owner matches the wallet
            if (!tokenAccount.owner.equals(ownerPublicKey)) {
              console.log(`⚠️ Skipping ${account.accountAddress.substring(0, 8)}... - owner mismatch (expected ${walletAddress.substring(0, 8)}..., got ${tokenAccount.owner.toString().substring(0, 8)}...)`);
              skippedAccounts.push({ address: account.accountAddress, reason: 'Account owner does not match wallet' });
              continue;
            }
            
            // Verify balance is actually 0
            if (tokenAccount.amount !== BigInt(0)) {
              console.log(`⚠️ Skipping ${account.accountAddress.substring(0, 8)}... - balance is not 0 (has ${tokenAccount.amount} tokens)`);
              skippedAccounts.push({ address: account.accountAddress, reason: `Has ${tokenAccount.amount} tokens, not empty` });
              continue;
            }
            
            // For Token-2022, check if closeAuthority is different from owner
            // If closeAuthority is set to someone else, the owner cannot close it
            if (isToken2022 && tokenAccount.closeAuthority && !tokenAccount.closeAuthority.equals(ownerPublicKey)) {
              console.log(`⚠️ Skipping ${account.accountAddress.substring(0, 8)}... - close authority is ${tokenAccount.closeAuthority.toString().substring(0, 8)}... (not owner)`);
              skippedAccounts.push({ address: account.accountAddress, reason: 'Close authority is not the owner' });
              continue;
            }
            
            console.log(`✅ Validated ${account.accountAddress.substring(0, 8)}... - can be closed`);
          } catch (parseError: any) {
            console.log(`⚠️ Skipping ${account.accountAddress.substring(0, 8)}... - could not parse account data:`, parseError.message);
            skippedAccounts.push({ address: account.accountAddress, reason: 'Invalid account data structure' });
            continue;
          }
          
          // Account is valid, add close instruction
          const closeInstruction = createCloseAccountInstruction(
            accountPublicKey,
            ownerPublicKey, // destination (user receives SOL)
            ownerPublicKey, // authority (owner or closeAuthority)
            [],             // no multisig
            programId       // correct program ID
          );
          
          transaction.add(closeInstruction);
          validAccountsForTx.push(account);
          
        } catch (error: any) {
          console.log(`⚠️ Error validating ${account.accountAddress.substring(0, 8)}...:`, error.message);
          skippedAccounts.push({ address: account.accountAddress, reason: `Validation error: ${error.message}` });
        }
      }
      
      console.log(`📊 Transaction will close ${validAccountsForTx.length} accounts, skipped ${skippedAccounts.length} problematic accounts`);
      
      if (validAccountsForTx.length === 0) {
        return res.status(400).json({ 
          error: "None of the selected accounts can be closed",
          skippedAccounts,
          details: "All accounts were skipped due to validation errors. They may already be closed, have the wrong owner, or contain tokens."
        });
      }

      // IMPORTANT: Recalculate totalRecoveredLamports based only on VALID accounts
      // If some accounts were skipped, we need to update the total
      let actualRecoveredLamports = 0;
      for (const accountInfo of accountInfos) {
        // Check if this account is in the validAccountsForTx list
        if (validAccountsForTx.some(va => va.accountAddress === accountInfo.accountAddress)) {
          actualRecoveredLamports += accountInfo.lamports;
        }
      }
      
      console.log(`💰 Actual SOL to recover: ${actualRecoveredLamports} lamports (originally ${totalRecoveredLamports} from all selected accounts)`);

      // Get recent blockhash for fee estimation
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = new PublicKey(walletAddress);

      // Estimate transaction fee
      let estimatedTxFeeLamports = 5000; // Default 5k lamports
      try {
        const message = transaction.compileMessage();
        const feeForMessage = await connection.getFeeForMessage(message);
        if (feeForMessage.value) {
          estimatedTxFeeLamports = feeForMessage.value;
        }
      } catch (error) {
        console.log('Failed to estimate transaction fee, using default:', error);
      }

      // Check user's current SOL balance for network fee validation
      let userBalanceLamports = 0;
      try {
        const userBalance = await connection.getBalance(new PublicKey(walletAddress));
        userBalanceLamports = userBalance;
      } catch (error) {
        console.log('Failed to get user balance:', error);
      }
      
      // Check if user has enough SOL to cover network transaction fee
      if (userBalanceLamports < estimatedTxFeeLamports + 10000) { // 10k lamport buffer
        const neededSol = (estimatedTxFeeLamports + 10000) / 1e9;
        const currentSol = userBalanceLamports / 1e9;
        return res.status(400).json({
          error: `Insufficient SOL for transaction fee. You have ${currentSol.toFixed(6)} SOL but need at least ${neededSol.toFixed(6)} SOL. Please add more SOL to your wallet.`
        });
      }
      
      // Fee: 10% platform fee on rent reclaimed (user gets 90%)
      const walletFeeRates = await getWalletFeeRates(walletAddress);
      const REFERRAL_SPLIT_PERCENT = walletFeeRates.referralPercent;
      const PLATFORM_FEE_BPS = 1000; // 10%
      const numAccountsClosed = validAccountsForTx.length;
      const totalFeeLamports = Math.floor(actualRecoveredLamports * PLATFORM_FEE_BPS / 10000);
      const userPayoutTotal = actualRecoveredLamports - totalFeeLamports;

      let referralFeeLamports = 0;
      let platformFeeLamports = totalFeeLamports;

      if (walletFeeRates.isTop10) {
        console.log(`🏆 TOP 10 USER DETECTED: ${walletAddress} - 70% referral commission!`);
      }
      console.log(`Fee calculation: user gets ${userPayoutTotal} lamports (${numAccountsClosed}×0.002 SOL), platform fee=${totalFeeLamports} lamports, actualRecovered=${actualRecoveredLamports} lamports`);
      
      // Check referral/developer fee wallet BEFORE calculating final fees
      let referralWalletExists = false;
      let developerWalletAddress = null;
      
      // Developer API Platform: Use direct fee receiver address (100% to PDA, split happens on claim)
      if (useDirectFeeAddress && feeReceiverAddress && totalFeeLamports > 0) {
        try {
          developerWalletAddress = new PublicKey(feeReceiverAddress);
          const developerBalance = await connection.getBalance(developerWalletAddress);
          referralWalletExists = developerBalance >= 0; // Accept even 0 balance for Developer API
          
          if (referralWalletExists) {
            // Developer API Platform: 100% goes to partner's PDA wallet
            // Split (80/20) happens later when partner claims from PDA
            referralFeeLamports = totalFeeLamports;
            platformFeeLamports = 0;
            console.log(`💼 Developer API Platform - 100% (${totalFeeLamports} lamports) to partner PDA: ${feeReceiverAddress}`);
          } else {
            console.log(`❌ Developer fee receiver ${feeReceiverAddress} is invalid - platform gets all`);
            platformFeeLamports = totalFeeLamports;
            referralFeeLamports = 0;
          }
        } catch (error) {
          console.log('Failed to validate developer fee receiver:', error);
          platformFeeLamports = totalFeeLamports;
          referralFeeLamports = 0;
        }
      }
      // Old affiliate system: Use referral code (50/50 split)
      else if (referralCodeData && totalFeeLamports > 0) {
        const referralWalletPublicKey = new PublicKey(referralCodeData.walletAddress);
        
        // Check if referral wallet has SOL balance
        try {
          const referralBalance = await connection.getBalance(referralWalletPublicKey);
          // Only send referral commission if referrer has SOL in wallet
          referralWalletExists = referralBalance > 0;
          console.log(`Referral wallet ${referralCodeData.walletAddress} balance: ${referralBalance} lamports, exists: ${referralWalletExists}`);
        } catch (error) {
          console.log('Failed to check referral wallet balance:', error);
          referralWalletExists = false;
        }
        
        if (referralWalletExists) {
          // Referrers get commission based on their leaderboard status (50% regular, 70% top 10)
          const referrerSplitPercent = await getReferrerCommissionRate(referralCodeData.walletAddress);
          referralFeeLamports = Math.floor(totalFeeLamports * (referrerSplitPercent / 100));
          platformFeeLamports = totalFeeLamports - referralFeeLamports;
          console.log(`✅ Referral wallet exists - platform=${platformFeeLamports} (${100 - referrerSplitPercent}%), referral=${referralFeeLamports} (${referrerSplitPercent}%${referrerSplitPercent === 70 ? ' TOP 10' : ''})`);
        } else {
          // Referral wallet doesn't exist, all fees go to platform
          platformFeeLamports = totalFeeLamports;
          referralFeeLamports = 0;
          console.log(`❌ Referral wallet ${referralCodeData.walletAddress} doesn't exist - platform gets all: ${platformFeeLamports} lamports`);
        }
      }
      
      // Calculate net amount after platform fees (using actual recovered lamports)
      const netLamports = Math.max(0, actualRecoveredLamports - totalFeeLamports);
      
      // Add fee transfer instructions AFTER close instructions
      // Fees are paid from SOL recovered by closing accounts
      if (platformFeeLamports > 0) {
        const feeCollectorPublicKey = new PublicKey('GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT');
        
        const platformFeeTransferInstruction = SystemProgram.transfer({
          fromPubkey: new PublicKey(walletAddress),
          toPubkey: feeCollectorPublicKey,
          lamports: platformFeeLamports,
        });
        
        transaction.add(platformFeeTransferInstruction);
        console.log(`Platform fee transfer added: ${platformFeeLamports} lamports`);
      }
      
      // Add developer/referral fee transfer
      if (referralFeeLamports > 0 && referralWalletExists) {
        // Developer API Platform: Use direct fee receiver address
        if (useDirectFeeAddress && developerWalletAddress) {
          const developerFeeTransferInstruction = SystemProgram.transfer({
            fromPubkey: new PublicKey(walletAddress),
            toPubkey: developerWalletAddress,
            lamports: referralFeeLamports,
          });
          
          transaction.add(developerFeeTransferInstruction);
          console.log(`💼 Developer fee transfer added: ${referralFeeLamports} lamports to ${feeReceiverAddress}`);
        }
        // Old affiliate system: Use referral code wallet
        else if (referralCodeData) {
          const referralWalletPublicKey = new PublicKey(referralCodeData.walletAddress);
          
          const referralFeeTransferInstruction = SystemProgram.transfer({
            fromPubkey: new PublicKey(walletAddress),
            toPubkey: referralWalletPublicKey,
            lamports: referralFeeLamports,
          });
          
          transaction.add(referralFeeTransferInstruction);
          console.log(`Referral fee transfer added: ${referralFeeLamports} lamports to ${referralCodeData.walletAddress}`);
        }
      }
      

      // Serialize transaction
      const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
      const transactionBase64 = serializedTransaction.toString('base64');

      // Convert lamports to SOL for response (use ACTUAL recovered amount from valid accounts)
      const totalSolReclaimed = actualRecoveredLamports / 1e9;
      const totalFeeAmount = totalFeeLamports / 1e9;
      const platformFeeAmount = platformFeeLamports / 1e9;
      const referralFeeAmount = referralFeeLamports / 1e9;
      const netAmount = netLamports / 1e9;
      

      res.json({
        transaction: transactionBase64,
        message: `Prepared transaction to close ${validAccountsForTx.length} accounts` + 
                 (skippedAccounts.length > 0 ? ` (${skippedAccounts.length} accounts skipped due to validation errors)` : ''),
        totalSolReclaimed: totalSolReclaimed,
        feeAmount: totalFeeAmount,
        platformFeeAmount: platformFeeAmount,
        referralFeeAmount: referralFeeAmount,
        netAmount: netAmount,
        referralCodeUsed: referralCode || null,
        accountsProcessed: validAccountsForTx.length,
        accountsSkipped: skippedAccounts.length,
        skippedAccounts: skippedAccounts.length > 0 ? skippedAccounts : undefined,
        feeInfo: {
          feePercentage: 'flat 0.002 SOL/account',
          totalFeeLamports: totalFeeLamports,
          platformFeeLamports: platformFeeLamports,
          referralFeeLamports: referralFeeLamports,
          estimatedTxFeeLamports: estimatedTxFeeLamports
        }
      });

    } catch (error) {
      console.error("Prepare transaction error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to prepare transaction";
      res.status(500).json({ 
        error: "Failed to prepare transaction",
        details: errorMessage 
      });
    }
  });

  // Record successful transaction
  app.post("/api/sol-refund/record-success", async (req, res) => {
    try {
      const { signature, walletAddress, selectedAccounts, accountsClosed, solRecovered, netAmount, feeAmount, referralCodeUsed, platformFeeAmount, referralFeeAmount, source, skipXPost } = req.body;

      // Validate required fields
      if (!signature || !walletAddress || !accountsClosed || !solRecovered) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Check if transaction already recorded
      const existingRecord = await storage.getTransactionRecordBySignature(signature);
      if (existingRecord) {
        return res.json({ 
          success: true, 
          message: `Successfully processed ${accountsClosed} accounts and recovered ${netAmount.toFixed(6)} SOL!`
        });
      }
      
      // Mark accounts as claimed in the database
      if (selectedAccounts && Array.isArray(selectedAccounts) && selectedAccounts.length > 0) {
        await storage.markAccountsAsClaimed(selectedAccounts);
      }

      // Record transaction (legacy)
      const transactionRecord = await storage.createTransactionRecord({
        signature,
        walletAddress,
        solRecovered: solRecovered.toString(),
        netAmount: netAmount.toString(),
        feeAmount: feeAmount.toString(),
        accountsClosed
      });

      // Record in comprehensive transaction ledger
      await storage.createTransactionLedgerEntry({
        signature,
        walletAddress,
        transactionType: 'sol_reclaim',
        source: source === 'auto' ? 'auto' : 'manual',
        solRecovered: solRecovered.toString(),
        netAmount: netAmount.toString(),
        feeAmount: feeAmount.toString(),
        itemsProcessed: accountsClosed,
        itemDetails: JSON.stringify({ 
          type: 'sol_reclaim',
          accountsClosed: accountsClosed,
          description: `Closed ${accountsClosed} empty token accounts`,
          referralCodeUsed: referralCodeUsed || null
        })
      });
      
      // Award points: 1 XP per dollar claimed - skip platform wallet
      const PLATFORM_WALLET_POINTS = 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT';
      if (walletAddress !== PLATFORM_WALLET_POINTS) {
        const claimedSol = Number(netAmount) > 0 ? Number(netAmount) : Number(solRecovered);
        const solPriceUsd = await fetchSolPriceUsd();
        await storage.awardRentClaimPoints(walletAddress, claimedSol, accountsClosed, solPriceUsd);
      }
      await storage.markTransactionXpAwarded(signature);

      // GFS Cashback: send 30% of fee back as $GFS tokens (fire and forget)
      sendGfsCashback(walletAddress, Number(feeAmount)).catch(() => {});

      // Record referral transaction using permanent association (first referral wins forever)
      const permanentAssociation = await storage.getWalletReferralAssociation(walletAddress);
      if (permanentAssociation && referralFeeAmount > 0) {
        const referralCodeData = await storage.getReferralCodeByCode(permanentAssociation.referralCode);
        if (referralCodeData) {
          console.log('Recording referral transaction for permanent association:', permanentAssociation.referralCode);
          await storage.createReferralTransaction({
            referralCodeId: referralCodeData.id,
            transactionSignature: signature,
            referredWalletAddress: walletAddress,
            originalFeeAmount: feeAmount.toString(),
            referralFeeAmount: referralFeeAmount.toString(),
            platformFeeAmount: platformFeeAmount.toString()
          });
          
          // Note: referral earnings are calculated dynamically in getReferralStats()
          // No need to manually update - the stats come from summing all referral transactions
        }
      }

      // Send ALL claims to Discord (no minimum threshold)
      try {
        const { sendClaimAlert } = await import('./discordWebhookService.js');
        await sendClaimAlert({
          walletAddress,
          solAmount: netAmount,  // Use NET amount (what user actually received after fees)
          accountsClosed,
          signature
        });
      } catch (discordError) {
        // Don't fail the whole request if Discord post fails
        console.error('Failed to send Discord alert:', discordError);
      }

      // X claim posting DISABLED — re-enable by changing false → !skipXPost
      let xPostId: string | null = null;
      if (false) try {
        const xResult = await xApiService.announceTransactionOnX({
          transactionType: 'sol_reclaim',
          netAmount,
          walletAddress,
          signature,
          itemsProcessed: accountsClosed
        });

        if (xResult.success && xResult.postId) {
          xPostId = xResult.postId;
          await storage.markTransactionPostedToX(signature, xPostId);
        }
      } catch (xError) {
        console.error('Failed to post claim alert to X (exception):', xError);
      }

      res.json({
        success: true,
        transactionRecord,
        message: `Successfully processed ${accountsClosed} accounts and recovered ${netAmount.toFixed(6)} SOL!`
      });

    } catch (error) {
      console.error("Record success error:", error);
      res.status(500).json({ error: "Failed to record transaction" });
    }
  });

  // Post batch-claim total to X (Twitter) — platform wallet only
  app.post("/api/sol-refund/post-batch-to-x", requirePlatformWallet, async (req, res) => {
    try {
      const { walletAddress, totalNetAmount, totalAccountsClosed, signature, transactionType } = req.body;
      if (!walletAddress || !totalNetAmount || !signature) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const txType = (transactionType === 'token_burn' || transactionType === 'nft_burn') ? transactionType : 'sol_reclaim';
      const xResult = await xApiService.announceTransactionOnX({
        transactionType: txType,
        netAmount: Number(totalNetAmount),
        walletAddress,
        signature,
        itemsProcessed: Number(totalAccountsClosed) || 1
      });
      if (xResult.success && xResult.postId) {
        await storage.markTransactionPostedToX(signature, xResult.postId);
      }
      res.json({ success: xResult.success, postId: xResult.postId, error: xResult.error });
    } catch (error: any) {
      console.error("post-batch-to-x error:", error);
      res.status(500).json({ error: "Failed to post to X" });
    }
  });

  // Get SOL refund statistics
  app.get("/api/sol-refund/stats", async (req, res) => {
    try {
      const BASE_SOL = 418.19;
      const BASE_ACCOUNTS = 202667;
      const dbSol = await storage.getTotalSolRecovered();
      const dbAccounts = await storage.getTotalAccountsClaimed();
      const totalSolRecovered = BASE_SOL + dbSol;
      const totalAccountsClaimed = BASE_ACCOUNTS + dbAccounts;
      const recentTransactions = await storage.getTransactionRecords(20);

      const stats = {
        success: true,
        totalSolRecovered,
        totalAccountsClaimed,
        recentTransactions: recentTransactions.map(tx => ({
          signature: tx.signature,
          solRecovered: parseFloat(tx.solRecovered),
          netAmount: parseFloat(tx.netAmount),
          feeAmount: parseFloat(tx.feeAmount),
          accountsClosed: tx.accountsClosed,
          processedAt: tx.processedAt.toISOString()
        }))
      };

      res.json(stats);
    } catch (error) {
      console.error("Stats error:", error);
      res.status(500).json({ error: "Failed to get statistics" });
    }
  });

  // === REFERRAL SYSTEM ENDPOINTS ===
  
  // Create referral code
  app.post("/api/referrals/create", async (req, res) => {
    try {
      const { walletAddress, websiteUrl } = req.body;
      
      if (!walletAddress) {
        return res.status(400).json({ error: "Wallet address is required" });
      }
      
      // Check if user already has a referral code
      const existingCode = await storage.getReferralCodeByWallet(walletAddress);
      if (existingCode) {
        // Check if existing code is old format (8 chars, all uppercase) - if so, update it
        const isOldFormat = existingCode.code.length === 8 && existingCode.code === existingCode.code.toUpperCase();
        
        if (isOldFormat) {
          // Generate new random code and update the existing record
          const newCode = nanoid(16); // 16 characters, mixed case letters and numbers
          
          // Update the code in database
          await db.update(referralCodes)
            .set({ code: newCode })
            .where(eq(referralCodes.id, existingCode.id));
          
          // Return updated code
          const updatedCode = { ...existingCode, code: newCode };
          return res.json({ 
            success: true, 
            referralCode: updatedCode,
            message: "Referral code updated to new format" 
          });
        }
        
        return res.json({ 
          success: true, 
          referralCode: existingCode,
          message: "Referral code already exists for this wallet" 
        });
      }
      
      // Generate unique referral code - truly random mix of letters and numbers
      const code = nanoid(16); // 16 characters, mixed case letters and numbers
      
      const referralCode = await storage.createReferralCode({
        code,
        walletAddress,
        websiteUrl: websiteUrl || null
      });
      
      res.json({
        success: true,
        referralCode,
        message: "Referral code created successfully"
      });
      
    } catch (error) {
      console.error("Create referral code error:", error);
      res.status(500).json({ error: "Failed to create referral code" });
    }
  });

  // Fix existing records with real transaction amounts
  app.post('/api/burns/fix-amounts', async (req, res) => {
    try {
      const { signatures } = req.body;
      
      if (!signatures || !Array.isArray(signatures)) {
        return res.status(400).json({ error: 'Signatures array required' });
      }

      const results = [];
      
      for (const signature of signatures) {
        try {
          // Get existing record
          const existingRecord = await storage.getTransactionLedgerBySignature(signature);
          if (!existingRecord) {
            results.push({ signature, status: 'not_found' });
            continue;
          }

          // Analyze real transaction 
          const heliusApiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
          const rpcUrl = getHeliusRpcUrl();
          const { Connection } = await import('@solana/web3.js');
          const connection = getHeliusConnection();

          const txInfo = await connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
          });

          if (!txInfo || txInfo.meta?.err) {
            results.push({ signature, status: 'transaction_failed' });
            continue;
          }

          // Calculate real amounts
          const preBalances = txInfo.meta?.preBalances || [];
          const postBalances = txInfo.meta?.postBalances || [];
          const accounts = txInfo.transaction.message.accountKeys;
          
          let userAccountIndex = -1;
          for (let i = 0; i < accounts.length; i++) {
            const account = accounts[i];
            const accountPubkey = typeof account === 'string' ? account : account.pubkey.toString();
            if (accountPubkey === existingRecord.walletAddress) {
              userAccountIndex = i;
              break;
            }
          }

          if (userAccountIndex === -1) {
            results.push({ signature, status: 'wallet_not_found' });
            continue;
          }

          const preBalance = preBalances[userAccountIndex] || 0;
          const postBalance = postBalances[userAccountIndex] || 0;
          const userDelta = postBalance - preBalance;
          const networkFeeLamports = txInfo.meta?.fee || 0;

          let outgoingTransfersFromUser = 0;
          const instructions = txInfo.meta?.innerInstructions || [];
          instructions.forEach(innerInstruction => {
            innerInstruction.instructions.forEach(instruction => {
              if ('parsed' in instruction && instruction.programId.toString() === '11111111111111111111111111111112') {
                const parsed = instruction.parsed as any;
                if (parsed?.type === 'transfer') {
                  const transferInfo = parsed.info;
                  if (transferInfo?.source === existingRecord.walletAddress) {
                    outgoingTransfersFromUser += transferInfo.lamports || 0;
                  }
                }
              }
            });
          });

          const realNetAmount = userDelta / 1e9;
          const realGrossAmount = (userDelta + networkFeeLamports + outgoingTransfersFromUser) / 1e9;
          const realFeeAmount = outgoingTransfersFromUser / 1e9;

          // Update with real amounts
          await storage.updateTransactionLedgerBySig(signature, {
            solRecovered: realGrossAmount.toString(),
            netAmount: realNetAmount.toString(),
            feeAmount: realFeeAmount.toString(),
            itemDetails: JSON.stringify({
              ...JSON.parse(existingRecord.itemDetails || '{}'),
              realAmountCalculated: true,
              realNetAmount,
              realGrossAmount,
              realFeeAmount,
              correctedAt: new Date().toISOString()
            })
          });

          results.push({ 
            signature, 
            status: 'updated',
            oldAmount: parseFloat(existingRecord.netAmount),
            newAmount: realNetAmount
          });

        } catch (error) {
          results.push({ 
            signature, 
            status: 'error', 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      }

      res.json({ success: true, results });
    } catch (error) {
      console.error('Error fixing amounts:', error);
      res.status(500).json({ error: 'Failed to fix amounts' });
    }
  });

  // Settlement endpoint to analyze confirmed transactions and get exact SOL amounts
  app.post('/api/burns/settlement', async (req, res) => {
    console.log('🚀 Settlement endpoint called with body:', JSON.stringify(req.body, null, 2));
    
    try {
      const { signature, walletAddress } = req.body;
      
      if (!signature || !walletAddress) {
        console.log('❌ Missing fields - returning 400 error');
        return res.status(400).json({ 
          error: 'Missing required fields: signature and walletAddress' 
        });
      }

      console.log(`🔍 Analyzing transaction ${signature} for wallet ${walletAddress}`);

      // Connect to RPC
      const heliusApiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
      const rpcUrl = getHeliusRpcUrl();
      const connection = getHeliusConnection();

      // Fetch the confirmed transaction
      const txInfo = await connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });

      if (!txInfo) {
        return res.status(404).json({ 
          error: 'Transaction not found or not yet confirmed' 
        });
      }

      if (txInfo.meta?.err) {
        return res.status(400).json({ 
          error: 'Transaction failed on-chain',
          details: txInfo.meta.err 
        });
      }

      // Extract balance data
      const preBalances = txInfo.meta?.preBalances || [];
      const postBalances = txInfo.meta?.postBalances || [];
      const accounts = txInfo.transaction.message.accountKeys;
      
      // Find the user's account index
      let userAccountIndex = -1;
      for (let i = 0; i < accounts.length; i++) {
        const account = accounts[i];
        const accountPubkey = typeof account === 'string' ? account : account.pubkey.toString();
        if (accountPubkey === walletAddress) {
          userAccountIndex = i;
          break;
        }
      }

      if (userAccountIndex === -1) {
        return res.status(400).json({ 
          error: 'Wallet address not found in transaction accounts' 
        });
      }

      // Calculate exact amounts
      const preBalance = preBalances[userAccountIndex] || 0;
      const postBalance = postBalances[userAccountIndex] || 0;
      const userDelta = postBalance - preBalance; // Net change to user (can be negative)
      const networkFeeLamports = txInfo.meta?.fee || 0;

      // Calculate outgoing transfers from user (platform fees, etc.)
      let outgoingTransfersFromUser = 0;
      const instructions = txInfo.meta?.innerInstructions || [];
      instructions.forEach(innerInstruction => {
        innerInstruction.instructions.forEach(instruction => {
          // Check if it's a parsed system instruction
          if ('parsed' in instruction && instruction.programId.toString() === '11111111111111111111111111111112') {
            const parsed = instruction.parsed as any;
            if (parsed?.type === 'transfer') {
              const transferInfo = parsed.info;
              if (transferInfo?.source === walletAddress) {
                outgoingTransfersFromUser += transferInfo.lamports || 0;
              }
            }
          }
        });
      });

      // Exact amounts calculation
      const netToUserLamports = userDelta; // What user actually received/paid
      const grossRentRecoveredLamports = userDelta + networkFeeLamports + outgoingTransfersFromUser;

      // Convert to SOL
      const netToUserSOL = netToUserLamports / 1e9;
      const grossRentRecoveredSOL = grossRentRecoveredLamports / 1e9;
      const networkFeeSOL = networkFeeLamports / 1e9;
      const platformFeeSOL = outgoingTransfersFromUser / 1e9;

      console.log(`✅ Transaction analysis complete:`);
      console.log(`   Net to user: ${netToUserSOL} SOL`);
      console.log(`   Gross rent recovered: ${grossRentRecoveredSOL} SOL`);
      console.log(`   Network fee: ${networkFeeSOL} SOL`);
      console.log(`   Platform fee: ${platformFeeSOL} SOL`);

      // Return exact amounts
      res.type('application/json');
      return res.status(200).json({
        success: true,
        signature,
        walletAddress,
        analysis: {
          netToUser: netToUserSOL,
          grossRentRecovered: grossRentRecoveredSOL,
          networkFee: networkFeeSOL,
          platformFee: platformFeeSOL,
          blockTime: txInfo.blockTime ? new Date(txInfo.blockTime * 1000).toISOString() : null
        }
      });

    } catch (error) {
      console.error('Error analyzing transaction:', error);
      return res.status(500).json({ 
        error: 'Failed to analyze transaction',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Get referral code by wallet
  app.get("/api/referrals/wallet/:address", async (req, res) => {
    try {
      const { address } = req.params;
      
      let referralCode = await storage.getReferralCodeByWallet(address);
      if (!referralCode) {
        return res.status(404).json({ error: "No referral code found for this wallet" });
      }
      
      // Check if existing code is old format (8 chars, all uppercase) - if so, update it
      const isOldFormat = referralCode.code.length === 8 && referralCode.code === referralCode.code.toUpperCase();
      
      if (isOldFormat) {
        // Generate new random code and update the existing record
        const newCode = nanoid(16); // 16 characters, mixed case letters and numbers
        
        // Update the code in database
        await db.update(referralCodes)
          .set({ code: newCode })
          .where(eq(referralCodes.id, referralCode.id));
        
        // Update the local object
        referralCode = { ...referralCode, code: newCode };
      }
      
      const stats = await storage.getReferralStats(referralCode.id);
      
      res.json({
        success: true,
        referralCode: {
          ...referralCode,
          stats
        }
      });
      
    } catch (error) {
      console.error("Get referral code error:", error);
      res.status(500).json({ error: "Failed to get referral code" });
    }
  });
  
  // Validate referral code
  app.get("/api/referrals/validate/:code", async (req, res) => {
    try {
      const { code } = req.params;
      
      const referralCode = await storage.getReferralCodeByCode(code);
      if (!referralCode || !referralCode.isActive) {
        return res.status(404).json({ 
          success: false,
          error: "Invalid or inactive referral code" 
        });
      }
      
      res.json({
        success: true,
        referralCode: {
          code: referralCode.code,
          walletAddress: referralCode.walletAddress,
          websiteUrl: referralCode.websiteUrl
        }
      });
      
    } catch (error) {
      console.error("Validate referral code error:", error);
      res.status(500).json({ error: "Failed to validate referral code" });
    }
  });
  
  // Get referral transactions
  app.get("/api/referrals/:codeId/transactions", async (req, res) => {
    try {
      const { codeId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const transactions = await storage.getReferralTransactionsByCode(codeId, limit);
      
      res.json({
        success: true,
        transactions
      });
      
    } catch (error) {
      console.error("Get referral transactions error:", error);
      res.status(500).json({ error: "Failed to get referral transactions" });
    }
  });
  
  // Get all referral codes (admin)
  app.get("/api/referrals/all", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      
      const referralCodes = await storage.getAllReferralCodes(limit);
      
      res.json({
        success: true,
        referralCodes
      });
      
    } catch (error) {
      console.error("Get all referral codes error:", error);
      res.status(500).json({ error: "Failed to get referral codes" });
    }
  });

  // Check wallet's permanent referral association (for debugging)
  app.get("/api/referrals/association/:walletAddress", async (req, res) => {
    try {
      const { walletAddress } = req.params;
      
      const association = await storage.getWalletReferralAssociation(walletAddress);
      
      if (!association) {
        return res.json({
          success: false,
          message: "No permanent referral association found for this wallet"
        });
      }

      const referralCodeData = await storage.getReferralCodeByCode(association.referralCode);
      
      res.json({
        success: true,
        association: {
          ...association,
          referrerWallet: referralCodeData?.walletAddress
        }
      });
      
    } catch (error) {
      console.error("Get wallet association error:", error);
      res.status(500).json({ error: "Failed to get wallet association" });
    }
  });

  // Scan wallet for tokens (for burning)
  app.get("/api/tokens/scan/:address", async (req, res) => {
    try {
      const { address } = req.params;
      
      // Validate address
      try {
        new PublicKey(address);
      } catch (error) {
        return res.status(400).json({ error: "Invalid wallet address" });
      }

      const connection = getHeliusConnection();

      const walletPublicKey = new PublicKey(address);

      // Use Helius DAS API to get all assets with metadata
      let tokens: any[] = [];

      try {
        const heliusRpcUrl = getHeliusRpcUrl();
        const heliusResponse = await fetch(heliusRpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'token-scan',
            method: 'getAssetsByOwner',
            params: {
              ownerAddress: address,
              page: 1,
              limit: 1000,
              displayOptions: {
                showFungible: true,
                showNativeBalance: false
              }
            }
          })
        });
        
        if (heliusResponse.ok) {
          const heliusData = await heliusResponse.json();
          console.log(`Found ${heliusData.result?.items?.length || 0} assets from Helius DAS`);
          
          if (heliusData.result?.items) {
            // Filter for fungible tokens with meaningful balances only
            const fungibleTokens = heliusData.result.items
              .filter((asset: any) => 
                asset.interface === 'FungibleToken' || 
                asset.interface === 'FungibleAsset'
              )
              .filter((asset: any) => {
                const balance = asset.token_info?.balance || 0;
                // Show ALL tokens with any balance (no minimum threshold) - let users burn dust tokens
                return balance > 0;
              });

            console.log(`Found ${fungibleTokens.length} fungible tokens with meaningful balances`);

            // Use Solana RPC to check if tokens are actually burnable
            const { Connection, PublicKey } = await import('@solana/web3.js');
            const { getAssociatedTokenAddress, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } = await import('@solana/spl-token');
            
            const connection = getHeliusConnection();
            const ownerPublicKey = new PublicKey(address);
            
            const burnableTokens = [];
            
            for (const asset of fungibleTokens) {
              try {
                const mintPublicKey = new PublicKey(asset.id);
                
                // Try both Token Program and Token-2022 Program
                let tokenAccount = null;
                let accountInfo = null;
                let programType = 'TOKEN_PROGRAM';
                
                // First try standard Token Program
                try {
                  tokenAccount = await getAssociatedTokenAddress(
                    mintPublicKey,
                    ownerPublicKey,
                    false,
                    TOKEN_PROGRAM_ID
                  );
                  accountInfo = await connection.getParsedAccountInfo(tokenAccount);
                } catch (error) {
                  // Silent fail, will try Token-2022 next
                }
                
                // If not found, try Token-2022 Program
                if (!accountInfo?.value) {
                  try {
                    tokenAccount = await getAssociatedTokenAddress(
                      mintPublicKey,
                      ownerPublicKey,
                      false,
                      TOKEN_2022_PROGRAM_ID
                    );
                    accountInfo = await connection.getParsedAccountInfo(tokenAccount);
                    if (accountInfo?.value) {
                      programType = 'TOKEN_2022_PROGRAM';
                      console.log(`✨ Found Token-2022: ${asset.content?.metadata?.symbol || 'Unknown'}`);
                    }
                  } catch (error) {
                    // Both failed
                  }
                }
                
                // Check if the token account actually exists and is accessible
                if (accountInfo?.value && accountInfo.value.data) {
                  const parsedInfo = accountInfo.value.data as any;
                  if (parsedInfo.parsed && parsedInfo.parsed.info) {
                    const tokenState = parsedInfo.parsed.info.state;
                    
                    // Only include tokens that are not frozen
                    if (tokenState !== 'frozen') {
                      burnableTokens.push({
                        ...asset,
                        programType // Store which program this token uses
                      });
                      console.log(`Token ${asset.content?.metadata?.symbol || 'Unknown'}: BURNABLE (state=${tokenState}, program=${programType})`);
                    } else {
                      console.log(`Token ${asset.content?.metadata?.symbol || 'Unknown'}: FROZEN - excluded`);
                    }
                  }
                }
              } catch (error) {
                console.log(`Error checking token ${asset.content?.metadata?.symbol || 'Unknown'}:`, error instanceof Error ? error.message : String(error));
              }
            }

            // Helper function to fetch logo from Jupiter API V2 search endpoint
            async function fetchJupiterLogo(mintAddress: string): Promise<string | null> {
              try {
                const searchUrl = `https://lite-api.jup.ag/tokens/v2/search?query=${mintAddress}`;
                console.log(`🔍 Fetching Jupiter metadata for ${mintAddress}...`);
                const response = await fetch(searchUrl);
                
                if (response.ok) {
                  const data = await response.json();
                  // Jupiter API V2 returns an array directly, not wrapped in {tokens: [...]}
                  const tokens = Array.isArray(data) ? data : [];
                  
                  console.log(`📊 Jupiter API response for ${mintAddress}:`, {
                    tokensCount: tokens.length,
                    tokens: tokens.map((t: any) => ({ id: t.id, symbol: t.symbol, hasIcon: !!t.icon }))
                  });
                  
                  // The API returns an array of matching tokens
                  if (tokens.length > 0) {
                    // Find exact match by id (not address)
                    const exactMatch = tokens.find((t: any) => t.id === mintAddress);
                    if (exactMatch?.icon) {
                      console.log(`✅ Jupiter API V2 found logo for ${mintAddress}: ${exactMatch.icon}`);
                      return exactMatch.icon;
                    } else {
                      console.log(`⚠️  Jupiter found token ${mintAddress} but no icon available`);
                    }
                  } else {
                    console.log(`ℹ️  Token ${mintAddress} not found in Jupiter registry`);
                  }
                } else {
                  console.log(`❌ Jupiter API error for ${mintAddress}: ${response.status} ${response.statusText}`);
                }
              } catch (error) {
                console.log(`⚠️ Failed to fetch Jupiter logo for ${mintAddress}:`, error);
              }
              return null;
            }

            // Process tokens and fetch logos from Jupiter API ONLY
            const tokenPromises = burnableTokens.map(async (asset: any) => {
              const balance = (asset.token_info?.balance || 0) / Math.pow(10, asset.token_info?.decimals || 0);
              const isEmpty = balance === 0;
              
              // Fetch logo from Jupiter API V2 ONLY
              const logo = await fetchJupiterLogo(asset.id);
              
              console.log(`🖼️ Token ${asset.content?.metadata?.symbol || 'Unknown'}:`, {
                mint: asset.id,
                logo: logo,
                source: logo ? 'Jupiter API V2' : 'No logo found'
              });
              
              return {
                mint: asset.id,
                balance: balance,
                decimals: asset.token_info?.decimals || 0,
                name: asset.content?.metadata?.name || 'Unknown Token',
                symbol: asset.content?.metadata?.symbol || 'TOKEN',
                logo: logo,
                isFrozen: false,
                isEmpty: isEmpty,
                status: isEmpty ? 'Empty' : 'Active'
              };
            });

            tokens = await Promise.all(tokenPromises);
            
            console.log(`Processed ${tokens.length} truly burnable tokens (excluded ${fungibleTokens.length - tokens.length} frozen/inaccessible tokens)`);
          }
        }
      } catch (error) {
        console.log(`Failed to fetch assets from Helius DAS:`, error instanceof Error ? error.message : String(error));
        return res.status(500).json({ error: "Failed to fetch tokens from Helius API" });
      }

      // Fetch USD prices for all tokens
      if (tokens.length > 0) {
        try {
          const mintAddresses = tokens.map(t => t.mint).join(',');
          const jupiterApiKey = process.env.JUPITER_API_KEY;
          const priceResponse = await fetch(`https://api.jup.ag/price/v3?ids=${mintAddresses}`, {
            headers: jupiterApiKey ? { 'x-api-key': jupiterApiKey } : {}
          });
          
          if (priceResponse.ok) {
            const priceData = await priceResponse.json();
            console.log('💰 Jupiter price response:', JSON.stringify(priceData, null, 2));
            
            // Add USD price to each token
            tokens.forEach(token => {
              const priceInfo = priceData[token.mint];
              if (priceInfo && priceInfo.usdPrice) {
                token.usdPrice = priceInfo.usdPrice;
                token.usdValue = token.balance * priceInfo.usdPrice;
                console.log(`💵 ${token.symbol}: $${priceInfo.usdPrice} × ${token.balance} = $${token.usdValue.toFixed(2)}`);
              } else {
                token.usdPrice = 0;
                token.usdValue = 0;
              }
            });
          }
        } catch (err) {
          console.error('Error fetching USD prices:', err);
          // If price fetch fails, set default values
          tokens.forEach(token => {
            token.usdPrice = 0;
            token.usdValue = 0;
          });
        }
      }

      // No fallback - only use Helius DAS API results
      console.log(`Final token count: ${tokens.length}`);

      res.json(tokens);
    } catch (error) {
      console.error('Error scanning tokens:', error);
      res.status(500).json({ error: "Failed to scan tokens" });
    }
  });



  // Bulk Burn Tokens API
  app.post("/api/tokens/bulk-burn", async (req, res) => {
    try {
      const { walletAddress, tokenMints, referralCode } = req.body;
      
      if (!walletAddress || !tokenMints || !Array.isArray(tokenMints) || tokenMints.length === 0) {
        return res.status(400).json({ error: "Wallet address and token mints array are required" });
      }

      // Handle referral code logic (first referral wins forever)
      let referralCodeData = null;
      let permanentAssociation = await storage.getWalletReferralAssociation(walletAddress);
      
      if (permanentAssociation) {
        // Use existing permanent association
        referralCodeData = await storage.getReferralCodeByCode(permanentAssociation.referralCode);
        console.log('Using existing permanent referral association:', permanentAssociation.referralCode, 'for wallet:', walletAddress);
      } else if (referralCode) {
        // Try to find the temp referral code
        const tempReferralData = await storage.getReferralCodeByCode(referralCode);
        if (tempReferralData) {
          // Create permanent association (first referral wins forever)
          try {
            permanentAssociation = await storage.createWalletReferralAssociation({
              walletAddress,
              referralCodeId: tempReferralData.id,
              referralCode: referralCode
            });
            referralCodeData = tempReferralData;
            console.log('Created new permanent referral association:', referralCode, 'for wallet:', walletAddress);
          } catch (error) {
            console.log('Failed to create association (might already exist):', error);
            // Try to get existing association
            permanentAssociation = await storage.getWalletReferralAssociation(walletAddress);
            if (permanentAssociation) {
              referralCodeData = await storage.getReferralCodeByCode(permanentAssociation.referralCode);
            }
          }
        }
      }

      // Use Helius RPC if available
      const heliusApiKey = process.env.HELIUS_API_KEY;
      const rpcUrl = getHeliusRpcUrl();
      
      console.log(`Creating bulk token burn transaction for ${tokenMints.length} tokens...`);
      console.log('Referral code data:', referralCodeData);
      console.log('Permanent association:', permanentAssociation);
      
      const connection = getHeliusConnection();
      const ownerPublicKey = new PublicKey(walletAddress);
      
      // Get actual rent amounts from the token accounts for precise calculations
      let totalRecoveredLamports = 0;
      const validTokens = [];
      
      for (const tokenMint of tokenMints) {
        try {
          const mintPublicKey = new PublicKey(tokenMint);
          
          // Try both Token Program and Token-2022 Program
          let tokenAccount = null;
          let tokenAccountInfo = null;
          let foundAccount = false;
          
          // First try standard Token Program
          try {
            tokenAccount = await getAssociatedTokenAddress(
              mintPublicKey,
              ownerPublicKey,
              false,
              TOKEN_PROGRAM_ID
            );
            tokenAccountInfo = await connection.getParsedAccountInfo(tokenAccount);
            if (tokenAccountInfo?.value?.data) {
              foundAccount = true;
            }
          } catch (error) {
            // Will try Token-2022 next
          }
          
          // If not found, try Token-2022 Program
          if (!foundAccount) {
            try {
              tokenAccount = await getAssociatedTokenAddress(
                mintPublicKey,
                ownerPublicKey,
                false,
                TOKEN_2022_PROGRAM_ID
              );
              tokenAccountInfo = await connection.getParsedAccountInfo(tokenAccount);
              if (tokenAccountInfo?.value?.data) {
                foundAccount = true;
                console.log(`✨ Token ${tokenMint} is Token-2022`);
              }
            } catch (error) {
              console.log(`Error checking Token-2022 for ${tokenMint}:`, error);
            }
          }
          
          const parsedInfo = tokenAccountInfo?.value?.data as any;
          
          if (!parsedInfo?.parsed?.info) {
            console.log(`Skipping ${tokenMint} - token account not found (tried both TOKEN_PROGRAM and TOKEN_2022)`);
            continue;
          }
          
          // Get actual account lamports and detect program type by checking the MINT
          const accountInfo = await connection.getAccountInfo(tokenAccount!);
          if (accountInfo) {
            totalRecoveredLamports += accountInfo.lamports;
            
            // Check if the MINT belongs to Token-2022 Program
            const mintAccountInfo = await connection.getAccountInfo(mintPublicKey);
            const isToken2022 = mintAccountInfo?.owner.equals(TOKEN_2022_PROGRAM_ID) || false;
            
            if (isToken2022) {
              console.log(`🔵 MINT ${tokenMint} is Token-2022 Program`);
            }
            
            validTokens.push({
              mint: tokenMint,
              account: tokenAccount!,
              balance: parsedInfo.parsed.info.tokenAmount.amount,
              decimals: parsedInfo.parsed.info.tokenAmount.decimals,
              lamports: accountInfo.lamports,
              programId: isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID
            });
          }
        } catch (error) {
          console.log(`Error processing token ${tokenMint}:`, error);
          continue;
        }
      }
      
      if (validTokens.length === 0) {
        return res.status(400).json({ error: "No valid tokens found to burn" });
      }

      // Batch tokens: max 15 per transaction
      const TOKENS_PER_BATCH = 15;
      const batches: any[] = [];
      const { blockhash } = await connection.getLatestBlockhash();
      const { ComputeBudgetProgram } = await import('@solana/web3.js');
      
      // Check referral wallet once for all batches
      let referralWalletExists = false;
      if (referralCodeData) {
        const referralWalletPublicKey = new PublicKey(referralCodeData.walletAddress);
        try {
          const referralBalance = await connection.getBalance(referralWalletPublicKey);
          referralWalletExists = referralBalance > 0;
          console.log(`TOKEN BURN - Referral wallet ${referralCodeData.walletAddress} balance: ${referralBalance} lamports, exists: ${referralWalletExists}`);
        } catch (error) {
          console.log('TOKEN BURN - Failed to check referral wallet balance:', error);
          referralWalletExists = false;
        }
      }
      
      // Calculate fee rates once (Top 10 get 70% referral commission)
      const tokenBurnFeeRates = await getWalletFeeRates(walletAddress);
      const gsolHolderBurn = await isGsolHolder(walletAddress, connection);
      const donationFactor = gsolHolderBurn ? 0 : tokenBurnFeeRates.feePercent / 100; // 0% for GSOL holders
      const REFERRAL_SPLIT_PERCENT = tokenBurnFeeRates.referralPercent; // 50% (70% for top 10)
      console.log(`TOKEN BURN - Fee rates: ${tokenBurnFeeRates.feePercent}% fee, ${REFERRAL_SPLIT_PERCENT}% referral${tokenBurnFeeRates.isTop10 ? ' (TOP 10)' : ''}`);

      // Create batches of up to 10 tokens each
      for (let i = 0; i < validTokens.length; i += TOKENS_PER_BATCH) {
        const batchTokens = validTokens.slice(i, i + TOKENS_PER_BATCH);
        const batchIndex = Math.floor(i / TOKENS_PER_BATCH) + 1;
        const totalBatches = Math.ceil(validTokens.length / TOKENS_PER_BATCH);
        
        // Calculate batch-specific rent recovery
        const batchRecoveredLamports = batchTokens.reduce((sum, t) => sum + t.lamports, 0);
        
        // Create transaction for this batch
        const transaction = new Transaction();
        
        // Add priority fee instruction
        transaction.add(
          ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: 10000
          })
        );
        
        // Add burn and close instructions for each token in batch
        for (const token of batchTokens) {
          const mintPublicKey = new PublicKey(token.mint);
          const isToken2022 = token.programId.equals(TOKEN_2022_PROGRAM_ID);
          
          // Burn tokens (if balance > 0)
          if (token.balance > 0) {
            const burnInstruction = isToken2022
              ? createBurnCheckedInstruction(
                  token.account,
                  mintPublicKey,
                  ownerPublicKey,
                  token.balance,
                  token.decimals,
                  [],
                  TOKEN_2022_PROGRAM_ID
                )
              : createBurnInstruction(
                  token.account,
                  mintPublicKey,
                  ownerPublicKey,
                  token.balance
                );
            transaction.add(burnInstruction);
          }
          
          // Close the account
          const closeInstruction = createCloseAccountInstruction(
            token.account,
            ownerPublicKey,
            ownerPublicKey,
            [],
            token.programId
          );
          transaction.add(closeInstruction);
        }
        
        // Estimate transaction fee for this batch
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = ownerPublicKey;
        
        let estimatedTxFeeLamports = 5000;
        try {
          const message = transaction.compileMessage();
          const feeForMessage = await connection.getFeeForMessage(message);
          if (feeForMessage.value) {
            estimatedTxFeeLamports = feeForMessage.value;
          }
        } catch (error) {
          console.log('Failed to estimate transaction fee, using default:', error);
        }
        
        // Calculate fees for this batch
        const safetyBufferLamports = 50000;
        const requestedFeeLamports = Math.floor(batchRecoveredLamports * donationFactor);
        const maxAllowedFeeLamports = Math.max(0, batchRecoveredLamports - estimatedTxFeeLamports - safetyBufferLamports);
        const totalFeeLamports = Math.min(requestedFeeLamports, maxAllowedFeeLamports);
        
        let batchReferralFeeLamports = 0;
        let batchPlatformFeeLamports = totalFeeLamports;
        
        if (referralWalletExists && referralCodeData && totalFeeLamports > 0) {
          const referrerSplitPercent = await getReferrerCommissionRate(referralCodeData.walletAddress);
          batchReferralFeeLamports = Math.floor(totalFeeLamports * (referrerSplitPercent / 100));
          batchPlatformFeeLamports = totalFeeLamports - batchReferralFeeLamports;
        }
        
        const batchNetLamports = Math.max(0, batchRecoveredLamports - totalFeeLamports);
        
        // Add fee transfer instructions
        if (batchPlatformFeeLamports > 0) {
          const feeCollectorPublicKey = new PublicKey('GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT');
          transaction.add(SystemProgram.transfer({
            fromPubkey: ownerPublicKey,
            toPubkey: feeCollectorPublicKey,
            lamports: batchPlatformFeeLamports,
          }));
        }
        
        if (batchReferralFeeLamports > 0 && referralCodeData && referralWalletExists) {
          const referralWalletPublicKey = new PublicKey(referralCodeData.walletAddress);
          transaction.add(SystemProgram.transfer({
            fromPubkey: ownerPublicKey,
            toPubkey: referralWalletPublicKey,
            lamports: batchReferralFeeLamports,
          }));
        }
        
        // Serialize transaction
        const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
        
        batches.push({
          batchIndex,
          totalBatches,
          transaction: serializedTransaction.toString('base64'),
          tokenMints: batchTokens.map(t => t.mint),
          tokenCount: batchTokens.length,
          solRecovered: batchRecoveredLamports / 1e9,
          netAmount: batchNetLamports / 1e9,
          feeAmount: totalFeeLamports / 1e9,
          platformFee: batchPlatformFeeLamports / 1e9,
          referralFee: batchReferralFeeLamports / 1e9
        });
        
        console.log(`TOKEN BURN - Batch ${batchIndex}/${totalBatches}: ${batchTokens.length} tokens, ${(batchRecoveredLamports / 1e9).toFixed(6)} SOL recovered`);
      }
      
      // Calculate totals across all batches
      const totalSolRecovered = totalRecoveredLamports / 1e9;
      const totalFeeAmount = batches.reduce((sum, b) => sum + b.feeAmount, 0);
      const totalNetAmount = batches.reduce((sum, b) => sum + b.netAmount, 0);
      
      console.log(`TOKEN BURN - Prepared ${batches.length} batches for ${validTokens.length} tokens, ${totalSolRecovered.toFixed(8)} SOL total`);
      
      res.json({
        success: true,
        batches,
        totalBatches: batches.length,
        totalTokens: validTokens.length,
        totalSolRecovered: totalSolRecovered.toFixed(8),
        totalNetAmount: totalNetAmount.toFixed(8),
        totalFeeAmount: totalFeeAmount.toFixed(8),
        referralCodeUsed: referralCode || null,
        message: `Prepared ${batches.length} batch${batches.length > 1 ? 'es' : ''} for ${validTokens.length} tokens (max 10 per signature)`
      });
      
    } catch (error) {
      console.error('Error preparing bulk token burn:', error);
      res.status(500).json({ error: "Failed to prepare bulk token burn transaction" });
    }
  });



  // Single Burn Token API (for individual burns)
  app.post("/api/tokens/burn", async (req, res) => {
    try {
      const { walletAddress, tokenMint } = req.body;
      
      if (!walletAddress || !tokenMint) {
        return res.status(400).json({ error: "Wallet address and token mint are required" });
      }

      // Use Helius RPC if available
      const heliusApiKey = process.env.HELIUS_API_KEY;
      const rpcUrl = getHeliusRpcUrl();
      
      console.log('Creating token burn transaction...');
      
      const connection = getHeliusConnection();
      const ownerPublicKey = new PublicKey(walletAddress);
      const mintPublicKey = new PublicKey(tokenMint);
      
      // Get associated token account - try both Token Program and Token-2022
      let tokenAccount = null;
      let tokenAccountInfo = null;
      
      // First try standard Token Program
      try {
        tokenAccount = await getAssociatedTokenAddress(
          mintPublicKey,
          ownerPublicKey,
          false,
          TOKEN_PROGRAM_ID
        );
        tokenAccountInfo = await connection.getParsedAccountInfo(tokenAccount);
      } catch (error) {
        // Will try Token-2022 next
      }
      
      // If not found, try Token-2022 Program
      if (!tokenAccountInfo?.value) {
        tokenAccount = await getAssociatedTokenAddress(
          mintPublicKey,
          ownerPublicKey,
          false,
          TOKEN_2022_PROGRAM_ID
        );
        tokenAccountInfo = await connection.getParsedAccountInfo(tokenAccount);
        if (tokenAccountInfo?.value) {
          console.log(`Token ${tokenMint} is Token-2022`);
        }
      }
      
      const parsedInfo = tokenAccountInfo?.value?.data as any;
      
      if (!parsedInfo?.parsed?.info) {
        throw new Error('Token account not found or invalid');
      }
      
      const balance = parsedInfo.parsed.info.tokenAmount.amount;
      const decimals = parsedInfo.parsed.info.tokenAmount.decimals;
      
      // Type guard
      if (!tokenAccount) {
        throw new Error('Token account not found');
      }
      
      // Detect Token-2022 by checking the MINT (not the token account)
      const accountInfo = await connection.getAccountInfo(tokenAccount);
      if (!accountInfo) {
        throw new Error('Token account not found');
      }
      
      // Check if the MINT belongs to Token-2022 Program
      const mintAccountInfo = await connection.getAccountInfo(mintPublicKey);
      const isToken2022 = mintAccountInfo?.owner.equals(TOKEN_2022_PROGRAM_ID) || false;
      const programId = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
      
      if (isToken2022) {
        console.log(`🔵 MINT ${tokenMint} is Token-2022 Program`);
      }
      
      // Create transaction
      const transaction = new Transaction();
      
      // Step 1: Burn all tokens (if balance > 0)
      if (balance > 0) {
        // Use BurnChecked for Token-2022 (required for extensions like transfer fees)
        const burnInstruction = isToken2022
          ? createBurnCheckedInstruction(
              tokenAccount,           // Token account to burn from
              mintPublicKey,          // Token mint
              ownerPublicKey,         // Owner
              balance,                // Amount to burn (full balance)
              decimals,               // Decimals (required for checked instruction)
              [],                     // Additional signers
              TOKEN_2022_PROGRAM_ID   // Token-2022 program
            )
          : createBurnInstruction(
              tokenAccount,     // Token account to burn from
              mintPublicKey,    // Token mint
              ownerPublicKey,   // Owner
              balance           // Amount to burn (full balance)
            );
        transaction.add(burnInstruction);
        console.log(`Added ${isToken2022 ? 'BurnChecked' : 'Burn'} instruction for ${tokenMint}`);
      }
      
      // Step 2: Close the now-empty account to reclaim SOL
      const closeInstruction = createCloseAccountInstruction(
        tokenAccount,
        ownerPublicKey,     // destination (receives SOL)
        ownerPublicKey,     // owner
        [],                 // no multisig
        programId           // correct program ID
      );
      
      transaction.add(closeInstruction);
      
      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = ownerPublicKey;
      
      // Serialize transaction
      const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
      const transactionBase64 = serializedTransaction.toString('base64');
      
      console.log(`Token burn transaction prepared: ${balance > 0 ? 'burn + close' : 'close only'} for mint ${tokenMint}`);
      
      res.json({
        transaction: transactionBase64,
        solRecovered: '0.00203928', // Standard rent-exempt amount
        message: `Token burn transaction prepared successfully (${balance > 0 ? 'burn + close' : 'close only'})`
      });
      
    } catch (error) {
      console.error('Error preparing token burn:', error);
      res.status(500).json({ error: "Failed to prepare token burn transaction" });
    }
  });



  // Record successful token burn transaction
  app.post("/api/tokens/record-burn-success", async (req, res) => {
    try {
      const { signature, walletAddress, tokenMints, tokensProcessed, solRecovered, netAmount, feeAmount, referralCodeUsed, platformFeeAmount, referralFeeAmount, skipXPost } = req.body;

      // Validate required fields
      if (!signature || !walletAddress || !tokenMints || !tokensProcessed || !solRecovered) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Validate that tokensProcessed is greater than zero to prevent division by zero
      if (tokensProcessed <= 0) {
        return res.status(400).json({ error: "tokensProcessed must be greater than zero" });
      }

      // Check if transaction already recorded
      const existingRecord = await storage.getTransactionLedgerBySignature(signature);
      if (existingRecord) {
        return res.json({ 
          success: true, 
          message: `Successfully burned ${tokensProcessed} tokens and recovered ${netAmount.toFixed(6)} SOL!`
        });
      }

      // Record in comprehensive transaction ledger
      await storage.createTransactionLedgerEntry({
        signature,
        walletAddress,
        transactionType: 'token_burn',
        solRecovered: solRecovered.toString(),
        netAmount: netAmount.toString(),
        feeAmount: feeAmount.toString(),
        itemsProcessed: tokensProcessed,
        itemDetails: JSON.stringify({
          type: 'token_burn',
          tokenMints: tokenMints,
          tokensProcessed: tokensProcessed,
          description: `Burned ${tokensProcessed} tokens`,
          referralCodeUsed: referralCodeUsed || null
        })
      });
      
      // Award points: 1 XP per dollar of SOL recovered - skip platform wallet
      const PLATFORM_WALLET_POINTS_TOKEN = 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT';
      if (walletAddress !== PLATFORM_WALLET_POINTS_TOKEN) {
        const solPriceUsdToken = await fetchSolPriceUsd();
        await storage.awardRentClaimPoints(walletAddress, Number(netAmount) || Number(solRecovered), tokensProcessed, solPriceUsdToken);
      }
      await storage.markTransactionXpAwarded(signature);

      // GFS Cashback: send 30% of fee back as $GFS tokens (fire and forget)
      sendGfsCashback(walletAddress, Number(feeAmount)).catch(() => {});

      
      // Record referral transaction using permanent association (first referral wins forever)
      const permanentAssociation = await storage.getWalletReferralAssociation(walletAddress);
      if (permanentAssociation && referralFeeAmount > 0) {
        const referralCodeData = await storage.getReferralCodeByCode(permanentAssociation.referralCode);
        if (referralCodeData) {
          console.log('Recording referral transaction for permanent association:', permanentAssociation.referralCode);
          await storage.createReferralTransaction({
            referralCodeId: referralCodeData.id,
            transactionSignature: signature,
            referredWalletAddress: walletAddress,
            originalFeeAmount: feeAmount.toString(),
            referralFeeAmount: referralFeeAmount.toString(),
            platformFeeAmount: platformFeeAmount.toString()
          });
          
          // Note: referral earnings are calculated dynamically in getReferralStats()
          // No need to manually update - the stats come from summing all referral transactions
        }
      }

      // Record individual token burn records
      for (const tokenMint of tokenMints) {
        await storage.createTokenBurnRecord({
          signature,
          walletAddress,
          tokenMint,
          tokenSymbol: 'TOKEN',
          tokenName: 'Unknown Token',
          amountBurned: '1.0',
          solRecovered: tokensProcessed > 0 ? (solRecovered / tokensProcessed).toString() : '0'
        });
      }

      // Send Discord alert for token burn
      try {
        const { sendTokenBurnAlert } = await import('./discordWebhookService.js');
        await sendTokenBurnAlert({
          walletAddress,
          solAmount: Number(netAmount || 0),
          tokensBurned: tokensProcessed,
          signature
        });
      } catch (discordError) {
        console.error('Failed to send Discord token burn alert:', discordError);
      }

      // X claim posting DISABLED — re-enable by changing false → !skipXPost
      if (false) try {
        const netAmountNumber = Number(netAmount || 0);
        const xResult = await xApiService.announceTransactionOnX({
          transactionType: 'token_burn',
          netAmount: netAmountNumber,
          walletAddress,
          signature,
          itemsProcessed: tokensProcessed
        });

        if (xResult.success && xResult.postId) {
          await storage.markTransactionPostedToX(signature, xResult.postId);
        }
      } catch (xError) {
        console.error('Failed to post token burn to X:', xError);
      }

      res.json({
        success: true,
        message: `Successfully burned ${tokensProcessed} tokens and recovered ${Number(netAmount || 0).toFixed(6)} SOL!`
      });

    } catch (error) {
      console.error("Record token burn success error:", error);
      res.status(500).json({ error: "Failed to record token burn transaction" });
    }
  });

  // Scan wallet for NFTs
  app.get("/api/nfts/scan/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const { type } = req.query; // standard, pnft, ocp, core, cnft
      
      // Validate address
      try {
        new PublicKey(address);
      } catch (error) {
        return res.status(400).json({ error: "Invalid wallet address" });
      }

      // Get RPC connection
      const heliusApiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
      if (!heliusApiKey) {
        return res.status(500).json({ error: "Helius API key is required for NFT scanning" });
      }

      console.log(`Using RPC endpoint: https://mainnet.helius-rpc.com/?api-key=****${heliusApiKey ? heliusApiKey.slice(-4) : 'none'}`);

      const heliusRpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;

      // Get all NFT assets owned by this wallet
      const heliusResponse = await fetch(heliusRpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'nft-scan',
          method: 'getAssetsByOwner',
          params: {
            ownerAddress: address,
            page: 1,
            limit: 1000,
            displayOptions: {
              showFungible: false,
              showNativeBalance: false
            }
          }
        })
      });

      if (!heliusResponse.ok) {
        throw new Error(`Helius API error: ${heliusResponse.statusText}`);
      }

      const heliusData = await heliusResponse.json();
      console.log(`Found ${heliusData.result?.items?.length || 0} assets from Helius DAS`);

      let nfts: any[] = [];
      const items = heliusData.result?.items || [];

      // Get locally burned asset IDs to filter them out (handles DAS lag)
      const burnedAssetIds = new Set<string>();
      try {
        const localBurnRecords = await storage.getNftBurnRecordsByWallet(address);
        for (const record of localBurnRecords) {
          if (record.success) {
            burnedAssetIds.add(record.nftMint);
          }
        }
        console.log(`📋 Found ${burnedAssetIds.size} locally burned assets to filter out`);
      } catch (error) {
        console.warn('⚠️ Could not load local burn records:', error);
      }

      // Programmable NFT program IDs
      const PROGRAMMABLE_NFT_PROGRAM_IDS = [
        'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s', // Token Metadata Program
        'F6fmDVCQfvnEq2KR8hhfZSEczfM9JK9fWbCsYJNbTGn7'  // pNFT Authorization Program
      ];

      for (const asset of items) {
        const { interface: assetInterface, compression, burnt } = asset;
        
        // Log burn status for debugging
        console.log(`🔍 Asset ${asset.content?.metadata?.name || asset.content?.metadata?.symbol || asset.id}: burnt=${burnt}, interface=${assetInterface}`);
        
        // Skip burned NFTs using multiple checks
        // Check 1: DAS burnt flag
        if (burnt === true) {
          console.log(`Skipping burned NFT: ${asset.content?.metadata?.name || asset.id}`);
          continue;
        }
        
        // Check 2: Ownership is null (burned assets lose ownership)
        if (!asset.ownership?.owner) {
          console.log(`Skipping NFT with no owner (likely burned): ${asset.content?.metadata?.name || asset.id}`);
          continue;
        }
        
        let nftType: string;
        let isCompressed = false;
        
        // Check if it's a compressed NFT
        if (compression?.compressed) {
          nftType = 'cnft';
          isCompressed = true;
          console.log(`📦 Found Compressed NFT: ${asset.content?.metadata?.name || asset.id}`);
        }
        // Identify NFT type based on interface and ownership
        else if (assetInterface === 'MplCoreAsset') {
          nftType = 'core';
        } else if (assetInterface === 'ProgrammableNFT' || 
                   (asset.ownership?.owner && PROGRAMMABLE_NFT_PROGRAM_IDS.includes(asset.ownership.owner)) ||
                   (asset.authorities && asset.authorities.some((auth: any) => PROGRAMMABLE_NFT_PROGRAM_IDS.includes(auth.address)))) {
          nftType = 'pnft';
          console.log(`📋 Found Programmable NFT: ${asset.content?.metadata?.name || asset.id}`);
        } else if (assetInterface === 'V1_NFT' || assetInterface === 'Legacy') {
          nftType = 'standard';
        } else {
          // Skip unsupported NFT types
          console.log(`⚠️ Skipping unsupported NFT type: ${assetInterface} - ${asset.content?.metadata?.name || asset.id}`);
          continue;
        }

        // Check 3: Locally burned assets (handles DAS lag) - check after NFT type is determined
        let assetIdentifier;
        if (nftType === 'core') {
          assetIdentifier = asset.id; // Core NFTs use asset.id
        } else {
          assetIdentifier = asset.mint || asset.id; // Standard/pNFT use mint address
        }
        
        if (burnedAssetIds.has(assetIdentifier)) {
          console.log(`Skipping locally burned NFT: ${asset.content?.metadata?.name || asset.id}`);
          continue;
        }

        // Filter by type if specified
        if (type && type !== nftType) {
          continue;
        }

        // Filter out NFTs that should not be burned
        const name = asset.content?.metadata?.name || '';
        const description = asset.content?.metadata?.description || '';
        
        // Check for "DO NOT BURN" indicators
        const doNotBurnPatterns = [
          /do\s*not\s*burn/i,
          /don\'?t\s*burn/i,
          /no\s*burn/i,
          /keep/i,
          /hold/i
        ];
        
        const shouldNotBurn = doNotBurnPatterns.some(pattern => 
          pattern.test(name) || pattern.test(description)
        );
        
        if (shouldNotBurn) {
          continue;
        }
        
        // Filter out position/utility NFTs
        const positionPatterns = [
          /position/i,
          /meteora/i,
          /liquidity/i,
          /lp\s*token/i,
          /utility/i,
          /staking/i,
          /vault/i,
          /receipt/i
        ];
        
        const isPositionNft = positionPatterns.some(pattern => 
          pattern.test(name) || pattern.test(description)
        );
        
        if (isPositionNft) {
          continue;
        }

        // Use proper identifiers based on NFT type
        let mintAddress, assetId, identifier;
        
        if (nftType === 'core') {
          // Core NFTs: use asset.id as primary identifier (no SPL mint)
          identifier = asset.id;
          assetId = asset.id;
          mintAddress = asset.id; // For compatibility, though Core NFTs don't have SPL mints
        } else {
          // Standard/pNFT: use asset.mint (SPL mint address) as primary identifier  
          identifier = asset.mint || asset.id;
          assetId = asset.id;
          mintAddress = asset.mint || asset.id;
        }

        // Try to get accurate metadata using Helius getAsset endpoint instead of slow IPFS
        let nftName = asset.content?.metadata?.name;
        let nftImage = asset.content?.files?.[0]?.uri || asset.content?.metadata?.image || '';
        let nftDescription = asset.content?.metadata?.description || '';
        
        // Skip slow IPFS metadata fetching for better performance
        // Just use basic metadata that's already available from Helius DAS
        console.log(`⚡ Using fast metadata from Helius DAS (skipping slow IPFS)`);
        // NFT name and image are already populated from initial DAS response above
        
        // Final fallback logic if still no name after fetching metadata
        if (!nftName || nftName.trim() === '') {
          const hasCollection = asset.grouping?.find((g: any) => g.group_key === 'collection')?.group_value;
          
          if (hasCollection) {
            // For collection NFTs, just use collection name from description (no number from image URL)
            let collectionName = '';
            
            // Extract collection name from description
            if (nftDescription) {
              const collectionMatch = nftDescription.match(/it needs (.+)\./);
              if (collectionMatch) {
                collectionName = collectionMatch[1];
              }
            }
            
            // Use collection name without trying to extract wrong number from image URL
            if (collectionName) {
              nftName = collectionName;
            } else {
              nftName = asset.content?.metadata?.symbol || 'Collection NFT';
            }
          } else {
            // Non-collection NFT fallbacks
            nftName = asset.content?.metadata?.symbol || 'Unknown NFT';
          }
        }

        // Check if NFT is frozen - use Helius DAS ownership.frozen field
        const isFrozen = asset.ownership?.frozen === true || 
                        asset.token_info?.state === 'frozen' || 
                        asset.ownership?.delegate_role === 'freeze';
        
        if (isFrozen) {
          console.log(`❄️ FROZEN NFT detected: ${nftName} (${mintAddress})`);
        }

        const nftInfo: any = {
          mint: mintAddress,
          id: identifier, 
          assetId: assetId,
          name: nftName,
          symbol: asset.content?.metadata?.symbol || '',
          image: nftImage,
          description: nftDescription,
          type: nftType,
          interface: assetInterface,
          tokenStandard: asset.token_info?.token_standard || '',
          compressed: compression?.compressed || false,
          creators: asset.creators || [],
          collection: asset.grouping?.find((g: any) => g.group_key === 'collection')?.group_value || null,
          attributes: asset.content?.metadata?.attributes || [],
          isFrozen: isFrozen || false
        };

        // Add compression data for cNFTs (needed for burning)
        if (isCompressed && compression) {
          nftInfo.compression = {
            eligible: compression.eligible || false,
            compressed: compression.compressed || false,
            data_hash: compression.data_hash || '',
            creator_hash: compression.creator_hash || '',
            asset_hash: compression.asset_hash || '',
            tree: compression.tree || '',
            seq: compression.seq || 0,
            leaf_id: compression.leaf_id || 0
          };
        }

        nfts.push(nftInfo);
      }


      // Count NFTs by type
      const counts = nfts.reduce((acc: any, nft: any) => {
        acc[nft.type] = (acc[nft.type] || 0) + 1;
        return acc;
      }, {});

      res.json({
        success: true,
        nfts,
        counts,
        total: nfts.length
      });
    } catch (error) {
      console.error('Error scanning NFTs:', error);
      res.status(500).json({ error: "Failed to scan NFTs" });
    }
  });

  // NEW HYBRID API - Build Core NFT burn transactions (TEMPORARILY DISABLED)
  app.post('/api/nfts/burn/build', async (req, res) => {
    // Core NFT burning temporarily disabled - being rebuilt with official Metaplex Core
    return res.status(501).json({
      success: false,
      error: 'Core NFT burning is being rebuilt using official Metaplex implementation. Please check back soon!'
    });
    try {
      const { walletAddress, nftMints, nftType } = req.body;
      
      if (!walletAddress || !nftMints || !Array.isArray(nftMints) || nftType !== 'core') {
        return res.status(400).json({
          success: false, 
          error: 'Invalid request - requires walletAddress, nftMints array, and nftType="core"'
        });
      }

      if (nftMints.length === 0 || nftMints.length > 50) {
        return res.status(400).json({
          success: false,
          error: 'Invalid NFT count - must be between 1 and 50 NFTs'
        });
      }

      console.log('🔧 Building Core NFT burn transactions for', nftMints.length, 'NFTs');
      
      const userPubkey = new PublicKey(walletAddress);
      const CORE_PROGRAM_ID = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');
      
      const builtTransactions = [];
      let totalExpectedRentLamports = 0;
      
      // Get fresh blockhash for all transactions
      const heliusApiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
      const rpcUrl = getHeliusRpcUrl();
      const connection = getHeliusConnection();
      const { blockhash } = await connection.getLatestBlockhash();
      
      for (const mintAddress of nftMints) {
        try {
          console.log(`🔍 Building transaction for Core NFT: ${mintAddress}`);
          const assetPubkey = new PublicKey(mintAddress);
          
          // Verify account exists and get rent amount
          const accountInfo = await connection.getAccountInfo(assetPubkey);
          if (!accountInfo) {
            console.log(`⚠️ Asset ${mintAddress} not found, skipping`);
            continue;
          }
          
          if (!accountInfo.owner.equals(CORE_PROGRAM_ID)) {
            console.log(`⚠️ Asset ${mintAddress} not owned by Core program, skipping`);
            continue;
          }
          
          const rentLamports = accountInfo.lamports;
          totalExpectedRentLamports += rentLamports;
          console.log(`💰 Expected rent recovery: ${rentLamports / 1e9} SOL`);
          
          // 🚀 ENHANCED CORE BURN with better rent reclamation
          const { TransactionInstruction, ComputeBudgetProgram, SystemProgram } = await import('@solana/web3.js');
          
          console.log(`🔍 Building enhanced Core burn for proper rent reclamation: ${mintAddress}`);
          
          // 🔥 CORE NFT: Just burn + close the asset account (that's all!)
          console.log(`🔥 Core NFT: burn + close asset account for rent recovery`);
          console.log(`🔍 Core Asset: ${assetPubkey.toString()}`);
          console.log(`💰 Account rent: ${rentLamports / 1e9} SOL`);
          
          // STEP 1: Burn Core NFT (clears the NFT data)
          const burnInstructionData = Buffer.from([7]); // Burn discriminator
          const burnInstruction = new TransactionInstruction({
            keys: [
              { pubkey: assetPubkey, isSigner: false, isWritable: true },
              { pubkey: userPubkey, isSigner: true, isWritable: true },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            programId: CORE_PROGRAM_ID,
            data: burnInstructionData,
          });
          
          // STEP 2: Close asset account (user receives rent)
          const closeInstructionData = Buffer.from([1]); // Close discriminator
          const closeInstruction = new TransactionInstruction({
            keys: [
              { pubkey: assetPubkey, isSigner: false, isWritable: true },   // Asset to close
              { pubkey: userPubkey, isSigner: true, isWritable: false },   // Authority (signer)
              { pubkey: userPubkey, isSigner: false, isWritable: true },   // Recipient (USER gets rent!)
            ],
            programId: CORE_PROGRAM_ID,
            data: closeInstructionData,
          });
          
          // Build transaction
          const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 });
          const transaction = new Transaction({
            recentBlockhash: blockhash,
            feePayer: userPubkey
          });
          
          transaction.add(computeBudgetIx);
          transaction.add(burnInstruction);  // 1. Burn Core NFT
          transaction.add(closeInstruction); // 2. Close asset → rent to user
          
          console.log(`✅ Enhanced Core burn transaction built for ${mintAddress}`);
          console.log(`💰 Expected rent recovery: ${rentLamports / 1e9} SOL (rent from closed account)`);
          
          // Serialize unsigned transaction for frontend signing
          const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
          
          builtTransactions.push({
            mint: mintAddress,
            transaction: serialized.toString('base64'),
            expectedRentLamports: rentLamports
          });
          
          console.log(`✅ Enhanced burn transaction built for ${mintAddress} - rent will be reclaimed to user wallet`);
          
        } catch (error: any) {
          console.error(`❌ Failed to build transaction for ${mintAddress}:`, error);
          continue;
        }
      }
      
      if (builtTransactions.length === 0) {
        return res.status(400).json({ success: false, error: 'No valid Core NFTs found to burn' });
      }
      
      console.log(`🎯 Built ${builtTransactions.length} burn transactions`);
      console.log(`💰 Total expected rent recovery: ${totalExpectedRentLamports / 1e9} SOL`);
      
      res.json({
        success: true,
        message: `Built ${builtTransactions.length} Core NFT burn transactions`,
        transactions: builtTransactions,
        totalExpectedRentLamports,
        totalExpectedRentSol: totalExpectedRentLamports / 1e9
      });
      
    } catch (error: any) {
      console.error('❌ Error building Core NFT burn transactions:', error);
      res.status(500).json({ success: false, error: 'Failed to build burn transactions: ' + (error.message || 'Unknown error') });
    }
  });

  // NEW HYBRID API - Submit signed Core NFT burn transactions
  app.post('/api/nfts/burn/submit', async (req, res) => {
    try {
      const { signedTransactions, walletAddress } = req.body;
      
      if (!signedTransactions || !Array.isArray(signedTransactions) || !walletAddress) {
        return res.status(400).json({ success: false, error: 'Invalid request - requires signedTransactions array and walletAddress' });
      }
      
      console.log(`🚀 Submitting ${signedTransactions.length} signed Core NFT burn transactions`);
      
      const heliusApiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
      const rpcUrl = getHeliusRpcUrl();
      const connection = getHeliusConnection();
      
      const results = [];
      let totalActualRecoveredLamports = 0;
      
      for (const { mint, signedTransaction } of signedTransactions) {
        try {
          console.log(`📤 Submitting burn transaction for ${mint}`);
          
          // Send the signed transaction
          const signature = await connection.sendRawTransaction(Buffer.from(signedTransaction, 'base64'));
          console.log(`🚀 Transaction submitted: ${signature}`);
          
          // Confirm the transaction
          const confirmation = await connection.confirmTransaction(signature);
          if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
          }
          
          // Get transaction details for rent calculation
          const txDetails = await connection.getTransaction(signature, { commitment: 'confirmed' });
          
          let rentRecoveredLamports = 0;
          if (txDetails?.meta) {
            const preBalances = txDetails.meta.preBalances;
            const postBalances = txDetails.meta.postBalances;
            const walletIndex = txDetails.transaction.message.accountKeys.findIndex(key => key.toString() === walletAddress);
            
            if (walletIndex >= 0) {
              const balanceChange = postBalances[walletIndex] - preBalances[walletIndex];
              rentRecoveredLamports = balanceChange + txDetails.meta.fee; // Add back transaction fee
            }
          }
          
          totalActualRecoveredLamports += rentRecoveredLamports;
          
          results.push({
            mint,
            signature,
            success: true,
            rentRecoveredLamports,
            rentRecoveredSol: rentRecoveredLamports / 1e9
          });
          
          console.log(`✅ ${mint} burned successfully! Recovered: ${rentRecoveredLamports / 1e9} SOL`);
          
        } catch (error: any) {
          console.error(`❌ Failed to submit transaction for ${mint}:`, error);
          results.push({ mint, success: false, error: error.message || 'Transaction submission failed' });
        }
      }
      
      const successfulBurns = results.filter(r => r.success).length;
      console.log(`🎉 Completed: ${successfulBurns}/${results.length} burns successful`);
      console.log(`💰 Total actual rent recovered: ${totalActualRecoveredLamports / 1e9} SOL`);
      
      res.json({
        success: true,
        message: `Processed ${results.length} transactions, ${successfulBurns} successful`,
        results,
        summary: {
          totalProcessed: results.length,
          successful: successfulBurns,
          failed: results.length - successfulBurns,
          totalRentRecoveredLamports: totalActualRecoveredLamports,
          totalRentRecoveredSol: totalActualRecoveredLamports / 1e9
        }
      });
      
    } catch (error: any) {
      console.error('❌ Error submitting Core NFT burn transactions:', error);
      res.status(500).json({ success: false, error: 'Failed to submit transactions: ' + (error.message || 'Unknown error') });
    }
  });

  // LEGACY API - Burn NFTs (for non-Core NFTs)
  app.post("/api/nfts/burn", async (req, res) => {
    try {
      const { walletAddress, nftMints, nftType, referralCode } = req.body;
      
      if (!walletAddress || !nftMints || !Array.isArray(nftMints) || nftMints.length === 0) {
        return res.status(400).json({ error: "Wallet address and NFT mints array are required" });
      }

      if (!nftType || nftType !== 'core') {
        return res.status(400).json({ error: "Only Metaplex Core NFTs are supported" });
      }

      // Core NFT burning with official Metaplex Core implementation  
      // The client now handles Core NFT burning directly using the official mpl-core library
      // This endpoint is kept for compatibility but Core NFTs are burned client-side
      return res.status(200).json({
        success: true,
        message: 'Core NFT burning is now handled client-side with official Metaplex Core implementation',
        burnTransactions: [],
        totalExpectedRentSol: 0
      });

      // Handle referral code logic (same as token burning)
      let referralCodeData = null;
      let permanentAssociation = await storage.getWalletReferralAssociation(walletAddress);
      
      if (permanentAssociation) {
        referralCodeData = await storage.getReferralCodeByCode(permanentAssociation.referralCode);
      } else if (referralCode) {
        const tempReferralData = await storage.getReferralCodeByCode(referralCode);
        if (tempReferralData) {
          try {
            permanentAssociation = await storage.createWalletReferralAssociation({
              walletAddress,
              referralCodeId: tempReferralData.id,
              referralCode: referralCode
            });
            referralCodeData = tempReferralData;
          } catch (error) {
            permanentAssociation = await storage.getWalletReferralAssociation(walletAddress);
            if (permanentAssociation) {
              referralCodeData = await storage.getReferralCodeByCode(permanentAssociation.referralCode);
            }
          }
        }
      }

      const heliusApiKey = process.env.HELIUS_API_KEY;
      const rpcUrl = getHeliusRpcUrl();
      
      
      const connection = getHeliusConnection();
      const ownerPublicKey = new PublicKey(walletAddress);
      
      // Create transaction based on NFT type
      const transaction = new Transaction();
      
      // Metaplex Core NFTs burning - REAL IMPLEMENTATION
      if (nftType === 'core') {
        console.log(`🔥 Preparing REAL Core NFT burn transactions for ${nftMints.length} NFTs`);
        console.log('🔧 NFT mints to burn:', nftMints);
        
        try {
          // Direct Solana approach - bypass UMI entirely
          const { Transaction, TransactionInstruction, ComputeBudgetProgram } = await import('@solana/web3.js');
          const bs58 = await import('bs58');
          
          console.log('✅ Using direct Solana transaction approach (bypassing UMI)');
          
          const burnTransactions = [];
          let totalExpectedRent = 0;
          
          // Metaplex Core program ID
          const CORE_PROGRAM_ID = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');
          
          // Build burn transaction for each Core NFT using direct instructions
          for (const assetAddress of nftMints) {
            try {
              console.log(`🔍 Processing Core NFT: ${assetAddress}`);
              
              const assetPubkey = new PublicKey(assetAddress);
              const userPubkey = new PublicKey(walletAddress);
              
              // Get account info to estimate rent recovery
              const accountInfo = await connection.getAccountInfo(assetPubkey);
              if (!accountInfo) {
                console.log(`⚠️ Asset ${assetAddress} not found or already burned`);
                continue;
              }
              
              const rentLamports = accountInfo.lamports;
              totalExpectedRent += rentLamports;
              console.log(`💰 Expected rent recovery: ${rentLamports / 1e9} SOL`);
              
              // Check if account is owned by Core program
              if (!accountInfo.owner.equals(CORE_PROGRAM_ID)) {
                console.log(`⚠️ Asset ${assetAddress} not owned by Core program, skipping`);
                continue;
              }
              
              // Build PROPER Core burn instruction according to Metaplex Core spec
              // Burn discriminator is [7] for Core program
              const instructionData = Buffer.from([7]);
              
              const burnInstruction = new TransactionInstruction({
                keys: [
                  { pubkey: assetPubkey, isSigner: false, isWritable: true },    // Asset to burn
                  { pubkey: userPubkey, isSigner: true, isWritable: true },     // Owner/authority
                  { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // System program
                ],
                programId: CORE_PROGRAM_ID,
                data: instructionData,
              });
              
              // Add compute budget to ensure transaction has enough compute
              const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
                units: 200_000, // Enough compute for Core burn
              });
              
              // Build transaction using proper Transaction class
              const { blockhash } = await connection.getLatestBlockhash();
              
              const transaction = new Transaction({
                recentBlockhash: blockhash,
                feePayer: userPubkey
              });
              
              // Add compute budget and burn instructions
              transaction.add(computeBudgetIx);
              transaction.add(burnInstruction);
              
              // Serialize the transaction (unsigned)
              const serializedTx = transaction.serialize({
                requireAllSignatures: false, // We don't want to sign on server
                verifySignatures: false
              });
              const base64Tx = Buffer.from(serializedTx).toString('base64');
              
              console.log(`✅ Built DIRECT Core burn transaction for ${assetAddress}`);
              
              burnTransactions.push({
                asset: assetAddress,
                name: `Core NFT ${assetAddress.slice(0, 8)}...`,
                transaction: base64Tx,
                expectedRentSol: rentLamports / 1e9
              });
              
            } catch (assetError) {
              console.error(`❌ Failed to process asset ${assetAddress}:`, assetError);
              // Continue with other assets
            }
          }
          
          if (burnTransactions.length === 0) {
            return res.status(400).json({
              success: false,
              error: 'No valid Core NFTs found to burn'
            });
          }
          
          console.log(`🎯 Prepared ${burnTransactions.length} REAL burn transactions`);
          console.log(`💰 Total expected rent recovery: ${totalExpectedRent / 1e9} SOL`);
          
          // Return prepared transactions for client to sign and submit
          return res.json({
            success: true,
            message: "Real Core NFT burn transactions prepared",
            burnTransactions: burnTransactions,
            totalExpectedRentSol: totalExpectedRent / 1e9,
            instructions: "These are REAL transactions that will DESTROY your NFTs and recover rent. Sign and submit each transaction to complete the burn."
          });
          
        } catch (error) {
          console.error('❌ Failed to prepare Core NFT burn transactions:', error);
          return res.status(500).json({
            success: false,
            error: 'Failed to prepare burn transactions: ' + (error as Error).message
          });
        }
        
      } else {
        // For other NFT types (pNFT, OCP), return a placeholder transaction for now
        return res.status(501).json({ 
          error: `${nftType.toUpperCase()} burning is not yet implemented. Coming soon!` 
        });
      }
      
      if (transaction.instructions.length === 0) {
        return res.status(400).json({ error: "No valid NFTs found to burn" });
      }

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = ownerPublicKey;
      
      // Calculate platform fee (flat 20% of estimated SOL recovery)
      // All users: 20% platform fee (Top 10 get 70% referral commission, regular users get 50%)
      const nftBurnFeeRates = await getWalletFeeRates(walletAddress);
      // Standard NFTs estimate 0.002 SOL per NFT (others provide no recovery yet)
      const estimatedSolRecovery = nftType === 'standard' ? nftMints.length * 0.002 : 0;
      const platformFeeAmount = estimatedSolRecovery * (nftBurnFeeRates.feePercent / 100); // 20% fee
      // All referrers get 50% commission
      let referralFeeAmount = 0;
      if (referralCodeData) {
        const referrerSplitPercent = await getReferrerCommissionRate(referralCodeData.walletAddress);
        referralFeeAmount = platformFeeAmount * (referrerSplitPercent / 100);
        console.log(`NFT BURN - Referrer commission: ${referrerSplitPercent}%${referrerSplitPercent === 65 ? ' (TOP 10)' : ''}`);
      }
      const finalPlatformFeeAmount = platformFeeAmount - referralFeeAmount;
      console.log(`NFT BURN - Fee rates: ${nftBurnFeeRates.feePercent}% fee, ${nftBurnFeeRates.referralPercent}% referral`);
      
      // Add platform fee transfer
      const platformWallet = new PublicKey('GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT');
      if (finalPlatformFeeAmount > 0.001) { // Only add if significant
        const platformFeeInstruction = SystemProgram.transfer({
          fromPubkey: ownerPublicKey,
          toPubkey: platformWallet,
          lamports: Math.floor(finalPlatformFeeAmount * 1_000_000_000)
        });
        transaction.add(platformFeeInstruction);
      }

      // Add referral fee transfer if applicable
      if (referralCodeData && referralFeeAmount > 0.001) {
        const referralWallet = new PublicKey(referralCodeData.walletAddress);
        const referralFeeInstruction = SystemProgram.transfer({
          fromPubkey: ownerPublicKey,
          toPubkey: referralWallet,
          lamports: Math.floor(referralFeeAmount * 1_000_000_000)
        });
        transaction.add(referralFeeInstruction);
      }
      
      // Serialize transaction
      const serializedTransaction = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false
      });
      
      const base64Transaction = Buffer.from(serializedTransaction).toString('base64');
      
      res.json({
        success: true,
        transaction: base64Transaction,
        message: nftType === 'standard' 
          ? `Prepared ${nftType.toUpperCase()} burn transaction for ${nftMints.length} NFTs`
          : `Prepared ${nftType.toUpperCase()} burn transaction for ${nftMints.length} NFTs (no rent recovery yet)`,
        nftsProcessed: nftMints.length,
        solRecovered: estimatedSolRecovery.toString(),
        netAmount: (estimatedSolRecovery * (1 - nftBurnFeeRates.feePercent / 100)).toString(), // After tier-based fee
        feeAmount: platformFeeAmount.toString(),
        platformFee: finalPlatformFeeAmount,
        referralFee: referralFeeAmount,
        referralCode: referralCodeData?.code || null
      });
    } catch (error) {
      console.error('Error creating NFT burn transaction:', error);
      res.status(500).json({ error: "Failed to create NFT burn transaction" });
    }
  });

  // Record Core NFT burn results
  app.post("/api/nfts/burn/record", async (req, res) => {
    try {
      // Validate request body with Zod
      const burnRecordSchema = z.object({
        signature: z.string().optional(),
        nftMint: z.string().min(1, "NFT mint address is required"),
        rentRecovered: z.number().min(0).optional().default(0),
        netAmount: z.number().min(0).optional().default(0),
        feeAmount: z.number().min(0).optional().default(0),
        platformFeeAmount: z.number().min(0).optional().default(0),
        referralFeeAmount: z.number().min(0).optional().default(0),
        walletAddress: z.string().min(1, "Wallet address is required"),
        nftType: z.string().min(1, "NFT type is required"),
        error: z.string().optional(),
        success: z.boolean().default(true),
        skipXPost: z.boolean().optional().default(false)
      });

      const validatedData = burnRecordSchema.parse(req.body);
      const { signature, nftMint, rentRecovered, netAmount, feeAmount, platformFeeAmount, referralFeeAmount, walletAddress, nftType, error, success, skipXPost } = validatedData;

      // Record the NFT burn transaction in our ledger
      if (success && signature) {
        // Get REAL amounts from actual transaction analysis instead of estimates
        let realRentRecovered = rentRecovered;
        let realNetAmount = netAmount;
        let realFeeAmount = feeAmount;

        try {
          console.log(`🔍 Analyzing actual transaction ${signature} to get real amounts instead of estimates...`);
          
          // Connect to RPC for settlement analysis
          const heliusApiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
          const rpcUrl = getHeliusRpcUrl();
          const { Connection } = await import('@solana/web3.js');
          const connection = getHeliusConnection();

          // Fetch the confirmed transaction
          const txInfo = await connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
          });

          if (txInfo && !txInfo.meta?.err) {
            // Extract balance data
            const preBalances = txInfo.meta?.preBalances || [];
            const postBalances = txInfo.meta?.postBalances || [];
            const accounts = txInfo.transaction.message.accountKeys;
            
            // Find the user's account index
            let userAccountIndex = -1;
            for (let i = 0; i < accounts.length; i++) {
              const account = accounts[i];
              const accountPubkey = typeof account === 'string' ? account : account.pubkey.toString();
              if (accountPubkey === walletAddress) {
                userAccountIndex = i;
                break;
              }
            }

            if (userAccountIndex !== -1) {
              // Calculate exact amounts from actual transaction
              const preBalance = preBalances[userAccountIndex] || 0;
              const postBalance = postBalances[userAccountIndex] || 0;
              const userDelta = postBalance - preBalance; // Net change to user
              const networkFeeLamports = txInfo.meta?.fee || 0;

              // Calculate outgoing transfers from user (platform fees, etc.)
              let outgoingTransfersFromUser = 0;
              const instructions = txInfo.meta?.innerInstructions || [];
              instructions.forEach(innerInstruction => {
                innerInstruction.instructions.forEach(instruction => {
                  // Check if it's a parsed system instruction
                  if ('parsed' in instruction && instruction.programId.toString() === '11111111111111111111111111111112') {
                    const parsed = instruction.parsed as any;
                    if (parsed?.type === 'transfer') {
                      const transferInfo = parsed.info;
                      if (transferInfo?.source === walletAddress) {
                        outgoingTransfersFromUser += transferInfo.lamports || 0;
                      }
                    }
                  }
                });
              });

              // Exact amounts calculation
              const netToUserLamports = userDelta; // What user actually received/paid
              const grossRentRecoveredLamports = userDelta + networkFeeLamports + outgoingTransfersFromUser;

              // Convert to SOL and update with real amounts
              realNetAmount = netToUserLamports / 1e9;
              realRentRecovered = grossRentRecoveredLamports / 1e9;
              realFeeAmount = outgoingTransfersFromUser / 1e9;

              console.log(`✅ Real transaction analysis complete for ${signature}:`);
              console.log(`   Estimated: ${rentRecovered} SOL recovered, ${netAmount} SOL net`);
              console.log(`   REAL: ${realRentRecovered} SOL recovered, ${realNetAmount} SOL net`);
              console.log(`   Real platform fee: ${realFeeAmount} SOL`);
            } else {
              console.log(`⚠️ Could not find wallet ${walletAddress} in transaction accounts - using estimates`);
            }
          } else {
            console.log(`⚠️ Transaction ${signature} not found or failed - using estimates`);
          }
        } catch (settlementError) {
          console.error('❌ Failed to analyze real transaction amounts, using estimates:', settlementError);
          // Keep original estimates if analysis fails
        }

        // Successful burn with REAL amounts
        const transactionData = {
          walletAddress,
          signature,
          transactionType: 'nft_burn' as const,
          solRecovered: realRentRecovered.toString(),
          netAmount: realNetAmount.toString(), // REAL amount user received
          feeAmount: realFeeAmount.toString(), // REAL platform + referral fees
          itemsProcessed: 1, // One NFT burned
          itemDetails: JSON.stringify({
            nftMint,
            nftType,
            rentRecovered: realRentRecovered, // Store real amounts in details too
            netAmount: realNetAmount,
            platformFeeAmount: realFeeAmount,
            referralFeeAmount: 0,
            originalEstimate: rentRecovered, // Keep original estimate for comparison
            settlementAnalyzed: true
          })
        };

        // Check if transaction already exists (to avoid duplicate key error)
        try {
          await storage.createTransactionLedgerEntry(transactionData);
          // Award points: 1 XP per dollar of SOL recovered - skip platform wallet
          const PLATFORM_WALLET_POINTS_NFT = 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT';
          if (walletAddress !== PLATFORM_WALLET_POINTS_NFT) {
            const solPriceUsdNft = await fetchSolPriceUsd();
            await storage.awardRentClaimPoints(walletAddress, realNetAmount, 1, solPriceUsdNft);
          }
          await storage.markTransactionXpAwarded(signature);
          // GFS Cashback: send 30% of fee back as $GFS tokens (fire and forget)
          sendGfsCashback(walletAddress, realFeeAmount).catch(() => {});
        } catch (insertError: any) {
          // If it's a duplicate key error, update the existing record with real amounts
          if (insertError?.code === '23505' && insertError?.constraint === 'transaction_ledger_signature_unique') {
            console.log(`🔄 Transaction ${signature} already exists, updating with real amounts...`);
            
            // Update existing record with real amounts
            const updateResult = await storage.updateTransactionLedgerBySig(signature, {
              solRecovered: realRentRecovered.toString(),
              netAmount: realNetAmount.toString(),
              feeAmount: realFeeAmount.toString(),
              itemDetails: JSON.stringify({
                nftMint,
                nftType,
                rentRecovered: realRentRecovered,
                netAmount: realNetAmount,
                platformFeeAmount: realFeeAmount,
                referralFeeAmount: 0,
                originalEstimate: rentRecovered,
                settlementAnalyzed: true,
                correctedAt: new Date().toISOString()
              })
            });
            
            console.log(`✅ Updated existing record with real amounts for ${signature}`);
          } else {
            throw insertError; // Re-throw if it's a different error
          }
        }

        console.log(`✅ Recorded NFT burn with REAL amounts: ${nftMint} (${realRentRecovered} SOL gross, ${realNetAmount} SOL net after fees)`);
        
        // Send Discord alert for NFT burn
        try {
          const { sendNFTBurnAlert } = await import('./discordWebhookService.js');
          await sendNFTBurnAlert({
            walletAddress,
            solAmount: realNetAmount,
            nftType: nftType || 'NFT',
            signature
          });
        } catch (discordError) {
          console.error('Failed to send Discord NFT burn alert:', discordError);
        }

        // X claim posting DISABLED — re-enable by changing false → !skipXPost
        if (false) try {
          const xResult = await xApiService.announceTransactionOnX({
            transactionType: 'nft_burn',
            netAmount: realNetAmount,
            walletAddress,
            signature,
            itemsProcessed: 1
          });

          if (xResult.success && xResult.postId) {
            await storage.markTransactionPostedToX(signature, xResult.postId);
          }
        } catch (xError) {
          console.error('Failed to post NFT burn to X:', xError);
        }
      } else {
        // Failed burn attempt
        console.log(`❌ Recorded failed Core NFT burn attempt: ${nftMint} - ${error || 'Unknown error'}`);
      }

      res.json({
        success: true,
        message: success ? 'NFT burn recorded successfully' : 'Failed NFT burn attempt recorded'
      });

    } catch (recordError) {
      console.error('Error recording NFT burn:', recordError);
      res.status(500).json({ error: "Failed to record NFT burn" });
    }
  });

  // Prepare Core NFT burn transactions (server-side UMI)
  app.post("/api/core-nfts/prepare-burn", async (req, res) => {
    try {
      // Validate request body
      const prepareBurnSchema = z.object({
        coreNftIds: z.array(z.string().min(1, "NFT ID is required")),
        walletAddress: z.string().min(1, "Wallet address is required"),
        referralCode: z.string().optional()
      });

      const { coreNftIds, walletAddress, referralCode } = prepareBurnSchema.parse(req.body);

      // Check for referral data (similar to token burning)
      let referralCodeData = null;
      let permanentAssociation = await storage.getWalletReferralAssociation(walletAddress);
      
      if (permanentAssociation) {
        referralCodeData = await storage.getReferralCodeByCode(permanentAssociation.referralCode);
        console.log('CORE NFT BURN - Using permanent referral association:', permanentAssociation.referralCode);
      } else if (referralCode) {
        const tempReferralData = await storage.getReferralCodeByCode(referralCode);
        if (tempReferralData) {
          try {
            permanentAssociation = await storage.createWalletReferralAssociation({
              walletAddress,
              referralCodeId: tempReferralData.id,
              referralCode: referralCode
            });
            referralCodeData = tempReferralData;
            console.log('CORE NFT BURN - Created new permanent referral association:', referralCode, 'for wallet:', walletAddress);
          } catch (error) {
            console.log('CORE NFT BURN - Failed to create association (might already exist):', error);
            permanentAssociation = await storage.getWalletReferralAssociation(walletAddress);
            if (permanentAssociation) {
              referralCodeData = await storage.getReferralCodeByCode(permanentAssociation.referralCode);
            }
          }
        }
      }

      // Get RPC configuration
      const apiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
      const rpcUrl = getHeliusRpcUrl();

      console.log(`🔥 Preparing ${coreNftIds.length} Core NFT burn transactions...`);

      // Initialize UMI with bundle defaults (works in Node.js)
      const umi = createUmi(rpcUrl).use(mplCore());
      
      // Use a no-op signer - we'll return unsigned transactions
      const noopSigner = createNoopSigner(umiPublicKey(walletAddress));
      umi.use({ install: (ctx) => { ctx.identity = noopSigner; ctx.payer = noopSigner; }});

      // 🚀 VALIDATE AND PREPARE NFTs FOR BATCHING
      const validAssets = [];
      const failedNfts = [];

      // First pass: Validate all NFTs and collect valid assets
      for (const nftId of coreNftIds) {
        try {
          console.log(`🔍 Validating Core NFT: ${nftId}`);
          
          // Fetch asset to validate it exists and is Core
          const asset = await fetchAsset(umi, umiPublicKey(nftId));
          console.log(`✅ Core asset validated: ${asset.publicKey}`);

          // Check if wallet is asset authority (owner or update authority)
          // UMI public keys are strings, so we can use direct === comparison
          const isOwner = String(asset.owner) === walletAddress;
          
          let isUpdateAuthority = false;
          if (asset.updateAuthority?.type === 'Address') {
            isUpdateAuthority = String(asset.updateAuthority.address) === walletAddress;
          }
          
          if (!isOwner && !isUpdateAuthority) {
            throw new Error(`Wallet ${walletAddress} is not authorized to burn Core NFT ${nftId}. Owner: ${asset.owner}, Update Authority: ${asset.updateAuthority?.type === 'Address' ? asset.updateAuthority.address : 'N/A'}`);
          }
          console.log(`✅ Authority validated - wallet ${walletAddress} can burn Core NFT ${nftId}`);

          // Get collection if it exists
          const collectionId = collectionAddress(asset);
          let collection = undefined;

          if (collectionId) {
            try {
              collection = await fetchCollection(umi, collectionId);
              console.log(`✅ Collection fetched: ${collectionId}`);
            } catch (collectionError) {
              console.log(`⚠️ Could not fetch collection ${collectionId}, proceeding without it`);
            }
          }

          // Estimate rent (will be calculated exactly after transaction)
          const actualRentSol = 0.001; // Temporary estimate

          validAssets.push({
            nftId,
            asset,
            collection,
            expectedRent: actualRentSol
          });

          console.log(`✅ Core NFT ${nftId} validated for batching`);

        } catch (nftError) {
          console.error(`❌ Failed to validate Core NFT ${nftId}:`, nftError);
          failedNfts.push({
            nftId,
            error: nftError instanceof Error ? nftError.message : 'Unknown error',
            expectedRent: 0
          });
        }
      }

      if (validAssets.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid Core NFTs found to burn',
          failedNfts
        });
      }

      // 🚀 CHUNK INTO BATCHES OF 5 NFTs MAX
      const MAX_NFTS_PER_BATCH = 5;
      const batchChunks = [];
      for (let i = 0; i < validAssets.length; i += MAX_NFTS_PER_BATCH) {
        batchChunks.push(validAssets.slice(i, i + MAX_NFTS_PER_BATCH));
      }

      console.log(`🔥 Splitting ${validAssets.length} Core NFTs into ${batchChunks.length} batches (max ${MAX_NFTS_PER_BATCH} NFTs per signature)...`);

      // Check referral wallet once before processing batches
      let referralWalletExists = false;
      let referralPubkey = null;
      if (referralCodeData) {
        try {
          referralPubkey = new PublicKey(referralCodeData.walletAddress);
          const heliusApiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
          const rpcUrl = getHeliusRpcUrl();
          const connection = getHeliusConnection();
          
          const referralBalance = await connection.getBalance(referralPubkey);
          referralWalletExists = referralBalance > 0;
          console.log(`CORE NFT BURN - Referral wallet ${referralCodeData.walletAddress} balance: ${referralBalance} lamports, exists: ${referralWalletExists}`);
        } catch (error) {
          console.log('CORE NFT BURN - Failed to check referral wallet:', error);
          referralWalletExists = false;
        }
      }

      const allBurnTransactions = [];
      const platformWalletAddress = 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT';
      
      // All users: 20% platform fee (Top 10 get 70% referral commission, regular users get 50%)
      const coreNftFeeRates = await getWalletFeeRates(walletAddress);
      // Referrers get commission based on their leaderboard status (50% regular, 70% top 10)
      const referrerCommissionPercent = referralCodeData ? await getReferrerCommissionRate(referralCodeData.walletAddress) : null;
      console.log(`CORE NFT BURN - Fee: ${coreNftFeeRates.feePercent}%${coreNftFeeRates.isTop10 ? ' (TOP 10)' : ''}, Referrer commission: ${referrerCommissionPercent ? referrerCommissionPercent + '%' : 'N/A'}`);

      // Process each batch separately  
      for (let batchIndex = 0; batchIndex < batchChunks.length; batchIndex++) {
        const batchAssets = batchChunks[batchIndex];
        console.log(`🔥 Building batch ${batchIndex + 1}/${batchChunks.length} with ${batchAssets.length} Core NFTs...`);

        // Calculate batch-specific fees (flat 20%)
        const batchExpectedRentLamports = batchAssets.reduce((sum, asset) => sum + Math.floor(asset.expectedRent * 1e9), 0);
        const requestedFeeLamports = Math.floor(batchExpectedRentLamports * (coreNftFeeRates.feePercent / 100));
        const NETWORK_BUFFER = 10000; // Small buffer for network fees
        const maxAllowedFeeLamports = Math.max(0, batchExpectedRentLamports - NETWORK_BUFFER);
        const batchFeeLamports = Math.min(requestedFeeLamports, maxAllowedFeeLamports);

        // Split fees per batch (referrers get 50% or 70% if top 10)
        const batchReferrerCommission = referrerCommissionPercent ?? 50;
        const referralFeeLamports = referralWalletExists ? Math.floor(batchFeeLamports * (batchReferrerCommission / 100)) : 0;
        const platformFeeLamports = batchFeeLamports - referralFeeLamports;

        console.log(`BATCH ${batchIndex + 1} - Expected rent: ${batchExpectedRentLamports/1e9} SOL, Fees: platform=${platformFeeLamports/1e9}, referral=${referralFeeLamports/1e9}`);

        // Build transaction for this batch only
        const coreProgram = umiPublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');
        const additionalProgram = umiPublicKey('F6fmDVCQfvnEq2KR8hhfZSEczfM9JK9fWbCsYJNbTGn7');
        
        // Import setComputeUnitPrice from @metaplex-foundation/mpl-toolbox
        const { setComputeUnitPrice } = await import('@metaplex-foundation/mpl-toolbox');
        
        let batchTransaction = new TransactionBuilder()
          .add(setComputeUnitPrice(umi, { microLamports: 10000 })) // Fixed priority fee: 0.00001 SOL
          .addRemainingAccounts([
            { pubkey: coreProgram, isSigner: false, isWritable: false },
            { pubkey: additionalProgram, isSigner: false, isWritable: false }
          ]);

        // Add burn instructions for this batch only
        for (const { nftId, asset, collection } of batchAssets) {
          const burnInstruction = burn(umi, {
            asset: asset,
            collection: collection,
            authority: umi.identity,
          });
          
          batchTransaction = batchTransaction.add(burnInstruction);
          console.log(`🔥 Added burn instruction for Core NFT: ${nftId}`);
        }

        // Add fee transfers for this batch
        if (platformFeeLamports > 0) {
          const platformTransfer = transferSol(umi, {
            source: umi.identity,
            destination: umiPublicKey(platformWalletAddress),
            amount: { 
              basisPoints: BigInt(platformFeeLamports), 
              identifier: 'SOL', 
              decimals: 9 
            },
          });
          batchTransaction = batchTransaction.add(platformTransfer);
          console.log(`💰 Added platform fee transfer: ${platformFeeLamports / 1e9} SOL to ${platformWalletAddress}`);
        }

        if (referralFeeLamports > 0 && referralWalletExists && referralCodeData) {
          const referralTransfer = transferSol(umi, {
            source: umi.identity,
            destination: umiPublicKey(referralCodeData.walletAddress),
            amount: { 
              basisPoints: BigInt(referralFeeLamports), 
              identifier: 'SOL', 
              decimals: 9 
            },
          });
          batchTransaction = batchTransaction.add(referralTransfer);
          console.log(`💰 Added referral fee transfer: ${referralFeeLamports / 1e9} SOL to ${referralCodeData.walletAddress}`);
        }

        // Build and serialize this batch transaction
        const umiTransaction = await batchTransaction.buildWithLatestBlockhash(umi);
        const { toWeb3JsLegacyTransaction } = await import('@metaplex-foundation/umi-web3js-adapters');
        const legacyTransaction = toWeb3JsLegacyTransaction(umiTransaction);
        
        const base64Transaction = Buffer.from(legacyTransaction.serialize({ 
          requireAllSignatures: false,
          verifySignatures: false 
        })).toString('base64');

        // Calculate net amount for this batch
        const batchExpectedRentSOL = batchExpectedRentLamports / 1e9;
        const batchNetAmount = batchExpectedRentSOL - (batchFeeLamports / 1e9);

        // Add this batch to the array
        allBurnTransactions.push({
          transaction: base64Transaction,
          batchIndex: batchIndex + 1,
          nftIds: batchAssets.map(a => a.nftId),
          nftCount: batchAssets.length,
          expectedRent: batchExpectedRentSOL,
          platformFee: platformFeeLamports / 1e9,
          referralFee: referralFeeLamports / 1e9,
          netAmount: batchNetAmount
        });

        console.log(`✅ Batch ${batchIndex + 1} prepared: ${batchAssets.length} NFTs, net: ${batchNetAmount} SOL`);
      }

      // Calculate totals across all batches
      const totalExpectedRent = validAssets.reduce((sum, asset) => sum + asset.expectedRent, 0);
      const totalNfts = validAssets.length;

      const responseData = {
        success: true,
        totalNfts,
        totalBatches: batchChunks.length,
        batches: allBurnTransactions,
        totalExpectedRentSOL: totalExpectedRent,
        failedNfts,
        message: `Prepared ${allBurnTransactions.length} batches for ${totalNfts} NFTs (max 5 per signature)`
      };
      
      console.log(`🎉 All batches prepared: ${allBurnTransactions.length} batches for ${totalNfts} Core NFTs`);

      res.json(responseData);

    } catch (error) {
      console.error('Error preparing Core NFT burn transactions:', error);
      res.status(500).json({ 
        error: "Failed to prepare Core NFT burn transactions",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Prepare Programmable NFT burn transactions (server-side UMI)
  app.post("/api/pnfts/prepare-burn", async (req, res) => {
    try {
      // Validate request body
      const prepareBurnSchema = z.object({
        pNftIds: z.array(z.string().min(1, "pNFT ID is required")),
        walletAddress: z.string().min(1, "Wallet address is required"),
        referralCode: z.string().optional()
      });

      const { pNftIds, walletAddress, referralCode } = prepareBurnSchema.parse(req.body);

      // Check for referral data (similar to token burning)
      let referralCodeData = null;
      let permanentAssociation = await storage.getWalletReferralAssociation(walletAddress);
      
      if (permanentAssociation) {
        referralCodeData = await storage.getReferralCodeByCode(permanentAssociation.referralCode);
        console.log('PROGRAMMABLE NFT BURN - Using permanent referral association:', permanentAssociation.referralCode);
      } else if (referralCode) {
        const tempReferralData = await storage.getReferralCodeByCode(referralCode);
        if (tempReferralData) {
          try {
            permanentAssociation = await storage.createWalletReferralAssociation({
              walletAddress,
              referralCodeId: tempReferralData.id,
              referralCode: referralCode
            });
            referralCodeData = tempReferralData;
            console.log('PROGRAMMABLE NFT BURN - Created new permanent referral association:', referralCode, 'for wallet:', walletAddress);
          } catch (error) {
            console.log('PROGRAMMABLE NFT BURN - Failed to create association (might already exist):', error);
            permanentAssociation = await storage.getWalletReferralAssociation(walletAddress);
            if (permanentAssociation) {
              referralCodeData = await storage.getReferralCodeByCode(permanentAssociation.referralCode);
            }
          }
        }
      }

      // Get RPC configuration
      const apiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
      const rpcUrl = getHeliusRpcUrl();

      console.log(`🔥 Preparing ${pNftIds.length} Programmable NFT burn transactions...`);

      // Initialize UMI with token metadata support
      const umi = createUmi(rpcUrl).use(mplTokenMetadata());
      
      // Use a no-op signer - we'll return unsigned transactions
      const noopSigner = createNoopSigner(umiPublicKey(walletAddress));
      umi.use({ install: (ctx) => { ctx.identity = noopSigner; ctx.payer = noopSigner; }});

      // ✅ NEW: Implement chunking system for PNFTs (5 NFTs max per signature)
      const MAX_NFTS_PER_BATCH = 5;
      const validNfts = [];
      const failedNfts = [];
      const connection = getHeliusConnection();

      // First pass: Validate and prepare all PNFTs
      for (const nftId of pNftIds) {
        try {
          console.log(`🔍 Processing Programmable NFT: ${nftId}`);
          
          // Fetch the pNFT Asset with the Token Account
          const mintId = umiPublicKey(nftId);
          const assetWithToken = await fetchDigitalAssetWithAssociatedToken(
            umi,
            mintId,
            umi.identity.publicKey
          );
          console.log(`✅ pNFT asset validated: ${assetWithToken.publicKey}`);

          // Determine if the pNFT Asset is in a collection
          const collectionMint = unwrapOption(assetWithToken.metadata.collection);
          
          // If there's a collection find the collection metadata PDAs
          const collectionMetadata = collectionMint
            ? findMetadataPda(umi, { mint: collectionMint.key })
            : null;

          console.log(`📋 Collection metadata: ${collectionMetadata ? 'Found' : 'None'}`);

          // Use placeholder - real amount will be calculated from confirmed transaction
          const expectedRentSol = 0.009; // Placeholder estimate - REAL amount calculated after transaction confirmation
          console.log(`💰 pNFT placeholder: ${expectedRentSol} SOL (REAL amount calculated from actual transaction)`);

          // Store validated PNFT data for batch processing
          validNfts.push({
            nftId,
            mintId,
            assetWithToken,
            collectionMetadata,
            expectedRent: expectedRentSol
          });

        } catch (nftError) {
          console.error(`❌ Failed to validate Programmable NFT ${nftId}:`, nftError);
          failedNfts.push({
            nftId,
            error: nftError instanceof Error ? nftError.message : 'Unknown error'
          });
        }
      }

      if (validNfts.length === 0) {
        return res.status(400).json({
          error: "No valid Programmable NFTs found",
          failedNfts
        });
      }

      // ✅ Second pass: Create batched transactions
      const batchChunks = [];
      for (let i = 0; i < validNfts.length; i += MAX_NFTS_PER_BATCH) {
        batchChunks.push(validNfts.slice(i, i + MAX_NFTS_PER_BATCH));
      }

      console.log(`🔥 Creating ${batchChunks.length} batches for ${validNfts.length} Programmable NFTs (max ${MAX_NFTS_PER_BATCH} per batch)`);

      // Check referral wallet availability once
      let referralWalletExists = false;
      if (referralCodeData) {
        try {
          const referralBalance = await connection.getBalance(new PublicKey(referralCodeData.walletAddress));
          referralWalletExists = referralBalance > 0;
          console.log(`PROGRAMMABLE NFT BURN - Referral wallet ${referralCodeData.walletAddress} exists: ${referralWalletExists}`);
        } catch (error) {
          console.log('PROGRAMMABLE NFT BURN - Failed to check referral wallet:', error);
          referralWalletExists = false;
        }
      }

      const allBatchTransactions = [];
      const platformWalletAddress = 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT';

      // Process each batch separately  
      for (let batchIndex = 0; batchIndex < batchChunks.length; batchIndex++) {
        const batchNfts = batchChunks[batchIndex];
        console.log(`🔥 Building batch ${batchIndex + 1}/${batchChunks.length} with ${batchNfts.length} Programmable NFTs...`);

        // Calculate batch-specific fees
        const batchExpectedRentLamports = batchNfts.reduce((sum, nft) => sum + Math.floor(nft.expectedRent * 1e9), 0);
        const requestedFeeLamports = Math.floor(batchExpectedRentLamports * 0.10); // 10% fee
        const NETWORK_BUFFER = 10000; // Small buffer for network fees
        const maxAllowedFeeLamports = Math.max(0, batchExpectedRentLamports - NETWORK_BUFFER);
        const batchFeeLamports = Math.min(requestedFeeLamports, maxAllowedFeeLamports);

        // Split fees per batch
        const referralFeeLamports = referralWalletExists ? Math.floor(batchFeeLamports * 0.5) : 0;
        const platformFeeLamports = batchFeeLamports - referralFeeLamports;

        console.log(`BATCH ${batchIndex + 1} - Expected rent: ${batchExpectedRentLamports/1e9} SOL, Fees: platform=${platformFeeLamports/1e9}, referral=${referralFeeLamports/1e9}`);

        // Build transaction for this batch only
        // Import setComputeUnitPrice from @metaplex-foundation/mpl-toolbox
        const { setComputeUnitPrice } = await import('@metaplex-foundation/mpl-toolbox');
        
        let batchTransaction = new TransactionBuilder()
          .add(setComputeUnitPrice(umi, { microLamports: 10000 })); // Fixed priority fee: 0.00001 SOL

        // Add burn instructions for each PNFT in this batch
        for (const nft of batchNfts) {
          const burnInstruction = burnV1(umi, {
            mint: nft.mintId,
            collectionMetadata: nft.collectionMetadata || undefined,
            token: nft.assetWithToken.token.publicKey,
            tokenRecord: nft.assetWithToken.tokenRecord?.publicKey,
            tokenStandard: TokenStandard.ProgrammableNonFungible,
          });
          
          batchTransaction = batchTransaction.add(burnInstruction);
        }

        // Add platform fee transfer if there are fees to collect
        if (platformFeeLamports > 0) {
          const platformTransfer = transferSol(umi, {
            source: umi.identity,
            destination: umiPublicKey(platformWalletAddress),
            amount: { 
              basisPoints: BigInt(platformFeeLamports), 
              identifier: 'SOL', 
              decimals: 9 
            },
          });
          batchTransaction = batchTransaction.add(platformTransfer);
          console.log(`💰 Added platform fee transfer: ${platformFeeLamports / 1e9} SOL to ${platformWalletAddress}`);
        }

        // Add referral fee transfer if applicable
        if (referralFeeLamports > 0 && referralWalletExists && referralCodeData) {
          const referralTransfer = transferSol(umi, {
            source: umi.identity,
            destination: umiPublicKey(referralCodeData.walletAddress),
            amount: { 
              basisPoints: BigInt(referralFeeLamports), 
              identifier: 'SOL', 
              decimals: 9 
            },
          });
          batchTransaction = batchTransaction.add(referralTransfer);
          console.log(`💰 Added referral fee transfer: ${referralFeeLamports / 1e9} SOL to ${referralCodeData.walletAddress}`);
        }

        // Build the batch transaction
        const umiTransaction = await batchTransaction.buildWithLatestBlockhash(umi);
        const web3jsTransaction = toWeb3JsTransaction(umiTransaction);
        const base64Transaction = Buffer.from(web3jsTransaction.serialize()).toString('base64');

        // Calculate net amount for this batch (PNFTs use exact amount user receives)
        const batchExpectedRentSOL = batchExpectedRentLamports / 1e9;
        const batchNetAmount = batchExpectedRentSOL; // For PNFTs, net amount equals expected (placeholders)

        // Add this batch to the array
        allBatchTransactions.push({
          transaction: base64Transaction,
          batchIndex: batchIndex + 1,
          nftIds: batchNfts.map(nft => nft.nftId),
          nftCount: batchNfts.length,
          expectedRent: batchExpectedRentSOL,
          platformFee: platformFeeLamports / 1e9,
          referralFee: referralFeeLamports / 1e9,
          netAmount: batchNetAmount
        });

        console.log(`✅ Batch ${batchIndex + 1} prepared: ${batchNfts.length} PNFTs, net: ${batchNetAmount} SOL`);
      }

      // Calculate totals across all batches
      const totalExpectedRent = validNfts.reduce((sum, nft) => sum + nft.expectedRent, 0);
      const totalNfts = validNfts.length;

      const responseData = {
        success: true,
        totalNfts,
        totalBatches: batchChunks.length,
        batches: allBatchTransactions,
        totalExpectedRentSOL: totalExpectedRent,
        failedNfts,
        message: `Prepared ${allBatchTransactions.length} batches for ${totalNfts} Programmable NFTs (max 5 per signature)`
      };
      
      console.log(`🔧 pNFT Server returning response:`, {
        success: responseData.success,
        totalNfts: responseData.totalNfts,
        totalBatches: responseData.totalBatches,
        batchesCount: responseData.batches.length,
        firstBatch: responseData.batches[0] || 'none',
        failedNfts: responseData.failedNfts.length
      });

      res.json(responseData);

    } catch (error) {
      console.error('Error preparing Programmable NFT burn transactions:', error);
      res.status(500).json({ 
        error: "Failed to prepare Programmable NFT burn transactions",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Prepare Compressed NFT burn transactions (cNFTs using Bubblegum)
  app.post("/api/cnfts/prepare-burn", async (req, res) => {
    try {
      // Validate request body
      const prepareBurnSchema = z.object({
        cnftIds: z.array(z.string().min(1, "cNFT asset ID is required")),
        walletAddress: z.string().min(1, "Wallet address is required")
      });

      const { cnftIds, walletAddress } = prepareBurnSchema.parse(req.body);

      console.log(`🔥 Preparing burn for ${cnftIds.length} compressed NFTs (cNFTs)`);
      console.log(`⚠️ Note: cNFTs do NOT recover SOL - this is for cleanup/burning only`);

      // Initialize UMI with DAS API
      const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
      const { getAssetWithProof, burn } = await import('@metaplex-foundation/mpl-bubblegum');
      const { publicKey: umiPublicKey, TransactionBuilder, createNoopSigner } = await import('@metaplex-foundation/umi');
      const { setComputeUnitPrice } = await import('@metaplex-foundation/mpl-toolbox');
      const { dasApi } = await import('@metaplex-foundation/digital-asset-standard-api');
      
      const heliusApiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
      const rpcUrl = getHeliusRpcUrl();
      
      const umi = createUmi(rpcUrl).use(dasApi());

      // Create a noop signer with the user's actual wallet address
      const ownerSigner = createNoopSigner(umiPublicKey(walletAddress));
      umi.use({ install: (umi) => { umi.payer = ownerSigner; umi.identity = ownerSigner; } });

      const allBatchTransactions = [];
      const failedNfts = [];
      const assetsByTree: Map<string, Array<{assetId: string, assetWithProof: any}>> = new Map();

      // Fetch all proofs and group by Merkle tree using UMI
      for (const assetId of cnftIds) {
        try {
          console.log(`📦 Fetching proof for cNFT: ${assetId}`);
          
          const assetWithProof = await getAssetWithProof(umi, umiPublicKey(assetId), {
            truncateCanopy: true
          });

          const treeKey = assetWithProof.merkleTree.toString();
          console.log(`✅ Got proof for cNFT ${assetId} (tree: ${treeKey.slice(0,8)}...)`);
          
          if (!assetsByTree.has(treeKey)) {
            assetsByTree.set(treeKey, []);
          }
          assetsByTree.get(treeKey)!.push({ assetId, assetWithProof });

        } catch (error) {
          console.error(`❌ Failed to fetch proof for cNFT ${assetId}:`, error);
          failedNfts.push({
            assetId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      console.log(`📊 Grouped ${cnftIds.length} cNFTs into ${assetsByTree.size} trees`);
      console.log(`⚠️ Note: cNFTs from different trees MUST be in separate transactions (Solana 1232-byte limit)`);

      // Build ONE transaction per tree (same tree = shared accounts = smaller tx)
      for (const [treeKey, assets] of assetsByTree.entries()) {
        console.log(`🌳 Building transaction for tree ${treeKey.slice(0,8)}... with ${assets.length} cNFTs`);
        
        try {
          let transaction = new TransactionBuilder()
            .add(setComputeUnitPrice(umi, { microLamports: 10000 }));

          const treeNftIds: string[] = [];

          for (const { assetId, assetWithProof } of assets) {
            const burnInstruction = burn(umi, {
              ...assetWithProof,
              leafOwner: umiPublicKey(walletAddress)
            });

            transaction = transaction.add(burnInstruction);
            treeNftIds.push(assetId);
            console.log(`  ✅ Added burn for cNFT ${assetId}`);
          }

          // Build the UMI transaction
          const builtTx = await transaction.buildWithLatestBlockhash(umi);
          
          // Serialize directly using UMI
          const serializedTx = umi.transactions.serialize(builtTx);
          const base64Tx = Buffer.from(serializedTx).toString('base64');

          allBatchTransactions.push({
            transaction: base64Tx,
            nftIds: treeNftIds,
            expectedRentSol: 0,
            warning: 'Compressed NFTs do not recover SOL'
          });

          console.log(`✅ Built transaction with ${treeNftIds.length} cNFTs from tree ${treeKey.slice(0,8)}...`);

        } catch (error) {
          console.error(`❌ Tree batch failed for ${treeKey.slice(0,8)}, trying individually...`, error);
          
          // Fallback: try each cNFT individually
          for (const { assetId, assetWithProof } of assets) {
            try {
              let singleTx = new TransactionBuilder()
                .add(setComputeUnitPrice(umi, { microLamports: 10000 }));
              
              const burnInstruction = burn(umi, {
                ...assetWithProof,
                leafOwner: umiPublicKey(walletAddress)
              });
              singleTx = singleTx.add(burnInstruction);
              
              const builtSingleTx = await singleTx.buildWithLatestBlockhash(umi);
              const serializedSingleTx = umi.transactions.serialize(builtSingleTx);
              const base64SingleTx = Buffer.from(serializedSingleTx).toString('base64');

              allBatchTransactions.push({
                transaction: base64SingleTx,
                nftIds: [assetId],
                expectedRentSol: 0,
                warning: 'Compressed NFTs do not recover SOL'
              });
              console.log(`✅ Built single transaction for cNFT ${assetId}`);
            } catch (singleError) {
              console.error(`❌ Failed single cNFT ${assetId}:`, singleError);
              failedNfts.push({
                assetId,
                error: singleError instanceof Error ? singleError.message : 'Single transaction failed'
              });
            }
          }
        }
      }

      const responseData = {
        success: true,
        totalNfts: cnftIds.length,
        totalBatches: allBatchTransactions.length,
        batches: allBatchTransactions,
        totalExpectedRentSOL: 0, // cNFTs never recover SOL
        failedNfts,
        message: `Prepared ${allBatchTransactions.length} burn transactions for compressed NFTs (NO SOL RECOVERY)`,
        warning: {
          severity: 'high',
          message: 'Compressed NFTs do not have rent deposits and will NOT recover any SOL',
          reason: 'cNFTs store data in Merkle trees with no on-chain rent - burning is for cleanup only'
        }
      };

      res.json(responseData);

    } catch (error) {
      console.error('Error preparing compressed NFT burn transactions:', error);
      res.status(500).json({
        error: "Failed to prepare compressed NFT burn transactions",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Prepare Traditional/Standard NFT burn transactions (server-side UMI)
  app.post("/api/standard-nfts/prepare-burn", async (req, res) => {
    try {
      // Validate request body
      const prepareBurnSchema = z.object({
        standardNftIds: z.array(z.string().min(1, "Standard NFT ID is required")),
        walletAddress: z.string().min(1, "Wallet address is required"),
        referralCode: z.string().optional()
      });

      const { standardNftIds, walletAddress, referralCode } = prepareBurnSchema.parse(req.body);

      // Check for referral data (similar to token burning)
      let referralCodeData = null;
      let permanentAssociation = await storage.getWalletReferralAssociation(walletAddress);
      
      if (permanentAssociation) {
        referralCodeData = await storage.getReferralCodeByCode(permanentAssociation.referralCode);
        console.log('TRADITIONAL NFT BURN - Using permanent referral association:', permanentAssociation.referralCode);
      } else if (referralCode) {
        const tempReferralData = await storage.getReferralCodeByCode(referralCode);
        if (tempReferralData) {
          try {
            permanentAssociation = await storage.createWalletReferralAssociation({
              walletAddress,
              referralCodeId: tempReferralData.id,
              referralCode: referralCode
            });
            referralCodeData = tempReferralData;
            console.log('TRADITIONAL NFT BURN - Created new permanent referral association:', referralCode, 'for wallet:', walletAddress);
          } catch (error) {
            console.log('TRADITIONAL NFT BURN - Failed to create association (might already exist):', error);
            permanentAssociation = await storage.getWalletReferralAssociation(walletAddress);
            if (permanentAssociation) {
              referralCodeData = await storage.getReferralCodeByCode(permanentAssociation.referralCode);
            }
          }
        }
      }

      // Get RPC configuration
      const apiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
      const rpcUrl = getHeliusRpcUrl();

      console.log(`🔥 Preparing ${standardNftIds.length} Traditional NFT burn transactions...`);

      // Initialize UMI with token metadata support
      const umi = createUmi(rpcUrl).use(mplTokenMetadata());
      
      // Use a no-op signer - we'll return unsigned transactions
      const noopSigner = createNoopSigner(umiPublicKey(walletAddress));
      umi.use({ install: (ctx) => { ctx.identity = noopSigner; ctx.payer = noopSigner; }});

      // ✅ NEW: Implement chunking system for Standard NFTs (5 NFTs max per signature)
      const MAX_NFTS_PER_BATCH = 5;
      const validNfts = [];
      const failedNfts = [];
      const connection = getHeliusConnection();

      // First pass: Validate and prepare all NFTs
      for (const nftId of standardNftIds) {
        try {
          console.log(`🔍 Processing Traditional NFT: ${nftId}`);
          
          // For traditional NFTs, we need to validate it's actually a traditional NFT
          const mintId = umiPublicKey(nftId);
          
          // 1. Check for metadata account at findMetadataPda(mint)
          const metadataPda = findMetadataPda(umi, { mint: mintId });
          const metadataAccountInfo = await connection.getAccountInfo(new PublicKey(metadataPda[0].toString()));
          
          if (!metadataAccountInfo) {
            throw new Error(`Not a traditional NFT: No metadata account found at ${metadataPda[0].toString()}`);
          }
          console.log(`✅ Traditional NFT metadata account confirmed: ${metadataPda[0].toString()}`);
          
          // 2. Check for master edition account at findMasterEditionPda(mint)  
          const masterEditionPda = findMasterEditionPda(umi, { mint: mintId });
          const masterEditionAccountInfo = await connection.getAccountInfo(new PublicKey(masterEditionPda[0].toString()));
          
          if (!masterEditionAccountInfo) {
            throw new Error(`Not a traditional NFT: No master edition account found at ${masterEditionPda[0].toString()}`);
          }
          console.log(`✅ Traditional NFT master edition confirmed: ${masterEditionPda[0].toString()}`);
          
          // 3. Detect collection metadata for verified collection NFTs
          let collectionMetadataPda = undefined;
          try {
            // Fetch the NFT's digital asset to check for collection metadata
            const digitalAsset = await fetchDigitalAsset(umi, mintId);
            const collectionOption = digitalAsset.metadata.collection;
            
            if (collectionOption && collectionOption.__option === 'Some') {
              const { key: collectionMint, verified } = unwrapOption(collectionOption);
              if (verified) {
                // Generate collection metadata PDA for verified collections
                collectionMetadataPda = findMetadataPda(umi, { mint: collectionMint });
                console.log(`✅ Verified collection detected for ${nftId}: ${collectionMint.toString()}`);
              } else {
                console.log(`ℹ️ Collection present but unverified for ${nftId}; skipping collectionMetadata`);
              }
            } else {
              console.log(`ℹ️ No collection field for ${nftId}; standalone NFT`);
            }
          } catch (collectionError) {
            console.log(`📋 Collection detection failed for ${nftId}:`, collectionError);
            // Continue without collection metadata - will work for standalone NFTs
          }

          // Calculate expected rent (traditional NFTs close multiple accounts)
          let expectedRent = 0;
          
          // 1. Metadata account rent
          try {
            const metadataInfo = await connection.getAccountInfo(new PublicKey(metadataPda[0].toString()));
            if (metadataInfo) {
              expectedRent += metadataInfo.lamports;
              console.log(`📊 Metadata account rent: ${(metadataInfo.lamports / 1e9).toFixed(6)} SOL`);
            }
          } catch (rentError) {
            console.log(`⚠️ Could not get metadata rent info for ${nftId}, using estimate`);
            expectedRent += 2039280; // Typical metadata account rent
          }
          
          // 2. Token account rent (where the NFT sits)
          try {
            const ownerPublicKey = new PublicKey(walletAddress);
            const mintPublicKey = new PublicKey(nftId);
            const tokenAccount = await getAssociatedTokenAddress(mintPublicKey, ownerPublicKey);
            const tokenAccountInfo = await connection.getAccountInfo(tokenAccount);
            if (tokenAccountInfo) {
              expectedRent += tokenAccountInfo.lamports;
              console.log(`📊 Token account rent: ${(tokenAccountInfo.lamports / 1e9).toFixed(6)} SOL`);
            }
          } catch (tokenError) {
            console.log(`⚠️ Could not get token account rent info for ${nftId}, using estimate`);
            expectedRent += 2039280; // Typical token account rent
          }
          
          // 3. Master Edition account rent (if it gets closed)
          try {
            const masterEditionInfo = await connection.getAccountInfo(new PublicKey(masterEditionPda[0].toString()));
            if (masterEditionInfo) {
              expectedRent += masterEditionInfo.lamports;
              console.log(`📊 Master Edition account rent: ${(masterEditionInfo.lamports / 1e9).toFixed(6)} SOL`);
            }
          } catch (masterError) {
            console.log(`⚠️ Could not get master edition rent info for ${nftId}, using estimate`);
            expectedRent += 1461600; // Typical master edition rent (smaller)
          }

          const expectedRentSol = expectedRent / 1e9;

          // Store validated NFT data for batch processing
          validNfts.push({
            nftId,
            mintId,
            metadataPda,
            masterEditionPda,
            collectionMetadataPda,
            expectedRent: expectedRentSol
          });

        } catch (nftError) {
          console.error(`❌ Failed to validate Traditional NFT ${nftId}:`, nftError);
          failedNfts.push({
            nftId,
            error: nftError instanceof Error ? nftError.message : 'Unknown error'
          });
        }
      }

      if (validNfts.length === 0) {
        return res.status(400).json({
          error: "No valid Traditional NFTs found",
          failedNfts
        });
      }

      // ✅ Second pass: Create batched transactions
      const batchChunks = [];
      for (let i = 0; i < validNfts.length; i += MAX_NFTS_PER_BATCH) {
        batchChunks.push(validNfts.slice(i, i + MAX_NFTS_PER_BATCH));
      }

      console.log(`🔥 Creating ${batchChunks.length} batches for ${validNfts.length} Traditional NFTs (max ${MAX_NFTS_PER_BATCH} per batch)`);

      // Check referral wallet availability once
      let referralWalletExists = false;
      if (referralCodeData) {
        try {
          const referralBalance = await connection.getBalance(new PublicKey(referralCodeData.walletAddress));
          referralWalletExists = referralBalance > 0;
          console.log(`TRADITIONAL NFT BURN - Referral wallet ${referralCodeData.walletAddress} exists: ${referralWalletExists}`);
        } catch (error) {
          console.log('TRADITIONAL NFT BURN - Failed to check referral wallet:', error);
          referralWalletExists = false;
        }
      }

      const allBatchTransactions = [];
      const platformWalletAddress = 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT';

      // Process each batch separately  
      for (let batchIndex = 0; batchIndex < batchChunks.length; batchIndex++) {
        const batchNfts = batchChunks[batchIndex];
        console.log(`🔥 Building batch ${batchIndex + 1}/${batchChunks.length} with ${batchNfts.length} Traditional NFTs...`);

        // Calculate batch-specific fees
        const batchExpectedRentLamports = batchNfts.reduce((sum, nft) => sum + Math.floor(nft.expectedRent * 1e9), 0);
        const requestedFeeLamports = Math.floor(batchExpectedRentLamports * 0.10); // 10% fee
        const NETWORK_BUFFER = 10000; // Small buffer for network fees
        const maxAllowedFeeLamports = Math.max(0, batchExpectedRentLamports - NETWORK_BUFFER);
        const batchFeeLamports = Math.min(requestedFeeLamports, maxAllowedFeeLamports);

        // Split fees per batch
        const referralFeeLamports = referralWalletExists ? Math.floor(batchFeeLamports * 0.5) : 0;
        const platformFeeLamports = batchFeeLamports - referralFeeLamports;

        console.log(`BATCH ${batchIndex + 1} - Expected rent: ${batchExpectedRentLamports/1e9} SOL, Fees: platform=${platformFeeLamports/1e9}, referral=${referralFeeLamports/1e9}`);

        // Build transaction for this batch only
        // Import setComputeUnitPrice from @metaplex-foundation/mpl-toolbox
        const { setComputeUnitPrice } = await import('@metaplex-foundation/mpl-toolbox');
        
        let batchTransaction = new TransactionBuilder()
          .add(setComputeUnitPrice(umi, { microLamports: 10000 })) // Fixed priority fee: 0.00001 SOL
          .addRemainingAccounts([
            { pubkey: umiPublicKey("abrn446KXzKZxSowJdHN9XumbGfQi4DdAfWHBT7X81r"), isSigner: false, isWritable: false }, // Authorization Rules Program
            { pubkey: umiPublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"), isSigner: false, isWritable: false }  // Token Metadata Program
          ]);

        // Add burn instructions for each NFT in this batch
        for (const nft of batchNfts) {
          const burnInstruction = burnV1(umi, {
            mint: nft.mintId,
            authority: umi.identity,
            tokenOwner: umi.identity.publicKey,
            tokenStandard: TokenStandard.NonFungible,
            collectionMetadata: nft.collectionMetadataPda,
          });
          
          batchTransaction = batchTransaction.add(burnInstruction);
        }

        // Add platform fee transfer if there are fees to collect
        if (platformFeeLamports > 0) {
          const platformTransfer = transferSol(umi, {
            source: umi.identity,
            destination: umiPublicKey(platformWalletAddress),
            amount: { 
              basisPoints: BigInt(platformFeeLamports), 
              identifier: 'SOL', 
              decimals: 9 
            },
          });
          batchTransaction = batchTransaction.add(platformTransfer);
          console.log(`💰 Added platform fee transfer: ${platformFeeLamports / 1e9} SOL to ${platformWalletAddress}`);
        }

        // Add referral fee transfer if applicable
        if (referralFeeLamports > 0 && referralWalletExists && referralCodeData) {
          const referralTransfer = transferSol(umi, {
            source: umi.identity,
            destination: umiPublicKey(referralCodeData.walletAddress),
            amount: { 
              basisPoints: BigInt(referralFeeLamports), 
              identifier: 'SOL', 
              decimals: 9 
            },
          });
          batchTransaction = batchTransaction.add(referralTransfer);
          console.log(`💰 Added referral fee transfer: ${referralFeeLamports / 1e9} SOL to ${referralCodeData.walletAddress}`);
        }

        // Build the batch transaction
        const umiTransaction = await batchTransaction.buildWithLatestBlockhash(umi);
        const web3jsTransaction = toWeb3JsTransaction(umiTransaction);
        const base64Transaction = Buffer.from(web3jsTransaction.serialize()).toString('base64');

        // Calculate net amount for this batch
        const batchExpectedRentSOL = batchExpectedRentLamports / 1e9;
        const batchNetAmount = batchExpectedRentSOL - (batchFeeLamports / 1e9);

        // Add this batch to the array
        allBatchTransactions.push({
          transaction: base64Transaction,
          batchIndex: batchIndex + 1,
          nftIds: batchNfts.map(nft => nft.nftId),
          nftCount: batchNfts.length,
          expectedRent: batchExpectedRentSOL,
          platformFee: platformFeeLamports / 1e9,
          referralFee: referralFeeLamports / 1e9,
          netAmount: batchNetAmount
        });

        console.log(`✅ Batch ${batchIndex + 1} prepared: ${batchNfts.length} NFTs, net: ${batchNetAmount} SOL`);
      }

      // Calculate totals across all batches
      const totalExpectedRent = validNfts.reduce((sum, nft) => sum + nft.expectedRent, 0);
      const totalNfts = validNfts.length;

      const responseData = {
        success: true,
        totalNfts,
        totalBatches: batchChunks.length,
        batches: allBatchTransactions,
        totalExpectedRentSOL: totalExpectedRent,
        failedNfts,
        message: `Prepared ${allBatchTransactions.length} batches for ${totalNfts} Traditional NFTs (max 5 per signature)`
      };
      
      console.log(`🔧 Traditional NFT Server returning response:`, {
        success: responseData.success,
        totalNfts: responseData.totalNfts,
        totalBatches: responseData.totalBatches,
        batchesCount: responseData.batches.length,
        firstBatch: responseData.batches[0] || 'none',
        failedNfts: responseData.failedNfts.length
      });

      res.json(responseData);

    } catch (error) {
      console.error('Error preparing Traditional NFT burn transactions:', error);
      res.status(500).json({ 
        error: "Failed to prepare Traditional NFT burn transactions",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get comprehensive transaction history
  app.get("/api/transactions/history", async (req, res) => {
    try {
      const { wallet, limit = 10, offset = 0, source } = req.query;
      
      let transactionHistory;
      if (wallet) {
        transactionHistory = await storage.getTransactionLedgerByWallet(
          wallet as string, 
          parseInt(limit as string), 
          parseInt(offset as string),
          source as string | undefined
        );
      } else {
        transactionHistory = await storage.getTransactionLedger(
          parseInt(limit as string), 
          parseInt(offset as string),
          source as string | undefined
        );
      }

      const formattedHistory = transactionHistory.map(tx => ({
        id: tx.id,
        signature: tx.signature,
        walletAddress: tx.walletAddress,
        type: tx.transactionType,
        solRecovered: parseFloat(tx.solRecovered),
        netAmount: parseFloat(tx.netAmount),
        feeAmount: parseFloat(tx.feeAmount),
        itemsProcessed: tx.itemsProcessed,
        details: tx.itemDetails ? JSON.parse(tx.itemDetails) : null,
        processedAt: tx.processedAt.toISOString()
      }));

      res.json({
        success: true,
        transactions: formattedHistory,
        count: formattedHistory.length,
        hasMore: formattedHistory.length === parseInt(limit as string)
      });

    } catch (error) {
      console.error("Transaction history error:", error);
      res.status(500).json({ error: "Failed to get transaction history" });
    }
  });

  // Get enhanced statistics including all transaction types
  app.get("/api/transactions/stats", async (req, res) => {
    try {
      const [
        totalSolRecovered,
        totalAccountsClaimed,
        totalTokensBurned,
        totalNftsBurned,
        recentTransactions
      ] = await Promise.all([
        storage.getTotalSolRecovered(),
        storage.getTotalAccountsClaimed(),
        storage.getTotalTokensBurned(),
        storage.getTotalNftsBurned(),
        storage.getTransactionLedger(20)
      ]);

      const stats = {
        success: true,
        totalSolRecovered,
        totalAccountsClaimed,
        totalTokensBurned,
        totalNftsBurned,
        recentTransactions: recentTransactions.map(tx => ({
          signature: tx.signature,
          type: tx.transactionType,
          walletAddress: tx.walletAddress,
          solRecovered: parseFloat(tx.solRecovered),
          netAmount: parseFloat(tx.netAmount),
          itemsProcessed: tx.itemsProcessed,
          processedAt: tx.processedAt.toISOString()
        }))
      };

      res.json(stats);
    } catch (error) {
      console.error("Enhanced stats error:", error);
      res.status(500).json({ error: "Failed to get enhanced statistics" });
    }
  });

  // Get comprehensive user stats by wallet address
  app.get("/api/user/gfs-discount/:walletAddress", async (req, res) => {
    try {
      const { walletAddress } = req.params;
      const isGfsHolder = await checkGfsHolder(walletAddress);
      res.json({ isGfsHolder, feePercent: 10, discount: 0 });
    } catch (error) {
      res.json({ isGfsHolder: false, feePercent: 10, discount: 0 });
    }
  });

  app.get("/api/user/stats/:walletAddress", async (req, res) => {
    try {
      const { walletAddress } = req.params;
      
      // Get user points (includes totalSolClaimed and accountsClosed)
      const points = await storage.getUserPoints(walletAddress);
      
      // Get SOL recovered from transaction ledger — includes rent reclaim, token burns, and NFT burns
      const solReclaimResult = await db
        .select({
          totalSolRecovered: sql<string>`COALESCE(sum(${transactionLedger.netAmount}), 0)`
        })
        .from(transactionLedger)
        .where(
          and(
            eq(transactionLedger.walletAddress, walletAddress),
            inArray(transactionLedger.transactionType, ['sol_reclaim', 'token_burn', 'nft_burn'])
          )
        );
      const totalSolFromLedger = parseFloat(solReclaimResult[0]?.totalSolRecovered || '0');
      
      // Get token burn count from transaction ledger
      const tokenBurnRecords = await storage.getTokenBurnRecordsByWallet(walletAddress);
      const totalTokensBurned = tokenBurnRecords.length;
      
      // Get NFT burn count from transaction ledger
      const nftBurnRecords = await storage.getNftBurnRecordsByWallet(walletAddress);
      const totalNftsBurned = nftBurnRecords.length;
      
      // Get referral info
      const referralCode = await storage.getReferralCodeByWallet(walletAddress);
      let referralEarnings = 0;
      if (referralCode) {
        const referralStats = await storage.getReferralStats(referralCode.id);
        referralEarnings = parseFloat(referralStats.totalEarnings) || 0;
      }
      
      // Platform wallet should always show 0 points (creator shouldn't earn points)
      const PLATFORM_WALLET_STATS = 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT';
      const displayPoints = walletAddress === PLATFORM_WALLET_STATS ? 0 : (points?.points || 0);
      
      // Use the higher value between user_points and transaction_ledger
      const totalSolClaimed = Math.max(totalSolFromLedger, parseFloat(String(points?.totalSolClaimed || 0)));
      
      // Get user's rank in weekly (7 days) and all-time leaderboards
      const now = new Date();
      const weeklyTimestamp = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      // Get weekly leaderboard (large limit to find user's position)
      const weeklyLeaderboard = await storage.getLeaderboard(weeklyTimestamp, 1000);
      const weeklyRankIndex = weeklyLeaderboard.findIndex(entry => entry.walletAddress === walletAddress);
      const weeklyRank = weeklyRankIndex >= 0 ? weeklyRankIndex + 1 : null;
      const weeklySol = weeklyRankIndex >= 0 ? parseFloat(weeklyLeaderboard[weeklyRankIndex].totalRecovered) : 0;
      
      // Get all-time leaderboard
      const allTimeLeaderboard = await storage.getLeaderboard(null, 1000);
      const allTimeRankIndex = allTimeLeaderboard.findIndex(entry => entry.walletAddress === walletAddress);
      const allTimeRank = allTimeRankIndex >= 0 ? allTimeRankIndex + 1 : null;
      const allTimeSol = allTimeRankIndex >= 0 ? parseFloat(allTimeLeaderboard[allTimeRankIndex].totalRecovered) : 0;
      
      res.json({
        totalSolClaimed,
        totalAccountsClosed: points?.accountsClosed || 0,
        totalTokensBurned,
        totalNftsBurned,
        totalPoints: displayPoints,
        referralCode: referralCode?.code || null,
        referralEarnings,
        weeklyRank,
        weeklySol,
        allTimeRank,
        allTimeSol
      });
    } catch (error) {
      console.error("Get user stats error:", error);
      res.status(500).json({ error: "Failed to get user stats" });
    }
  });

  // Transaction Relay - Submit signed transactions via server to bypass domain restrictions
  app.post("/api/tx/relay", async (req, res) => {
    try {
      // Validate request body
      const relaySchema = z.object({
        signedTxBase64: z.string().min(1, "Signed transaction is required"),
        description: z.string().optional().default("Transaction relay"),
        skipPreflight: z.boolean().optional().default(false),
        maxRetries: z.number().min(0).max(5).optional().default(2)
      });

      const { signedTxBase64, description, skipPreflight, maxRetries } = relaySchema.parse(req.body);

      console.log(`🔗 Relaying transaction: ${description}`);

      // Get server RPC connection with Helius API key
      const heliusApiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
      const rpcUrl = getHeliusRpcUrl();

      const connection = getHeliusConnection();

      // Convert base64 back to Buffer
      const txBuffer = Buffer.from(signedTxBase64, 'base64');

      console.log(`📡 Submitting transaction via server RPC: ${rpcUrl.includes('api-key=') ? rpcUrl.replace(/api-key=[^&]*/, 'api-key=****') : rpcUrl}`);

      // Submit the signed transaction
      const signature = await connection.sendRawTransaction(txBuffer, {
        skipPreflight,
        maxRetries
      });

      console.log(`✅ Transaction submitted successfully: ${signature}`);

      // Poll for transaction confirmation with timeout (30 seconds max)
      const startTime = Date.now();
      const timeout = 30000; // 30 seconds
      let confirmed = false;
      let confirmationError: any = null;

      while (Date.now() - startTime < timeout) {
        const status = await connection.getSignatureStatus(signature);
        
        if (status?.value?.confirmationStatus === 'confirmed' || 
            status?.value?.confirmationStatus === 'finalized') {
          confirmed = true;
          confirmationError = status.value.err;
          break;
        }
        
        // Wait 500ms before next check
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (!confirmed) {
        console.warn(`⏱️ Transaction confirmation timeout: ${signature} (may still process)`);
        // Return success anyway - transaction was submitted successfully
        return res.json({
          success: true,
          signature,
          confirmed: false,
          message: "Transaction submitted (confirmation pending)"
        });
      }

      if (confirmationError) {
        console.error(`❌ Transaction failed on-chain:`, confirmationError);
        return res.status(400).json({ 
          error: "Transaction failed on-chain",
          signature,
          details: confirmationError
        });
      }

      console.log(`🎉 Transaction confirmed: ${signature}`);

      res.json({
        success: true,
        signature,
        confirmed: true,
        message: "Transaction submitted and confirmed via server relay"
      });

    } catch (error) {
      console.error('Transaction relay error:', error);
      res.status(500).json({ 
        error: "Failed to relay transaction",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // AUTO-CLAIM PERMIT ENDPOINTS
  // ============================================================================

  // Create Auto-Claim Permit (user signs once to authorize)
  app.post("/api/auto-claim/permit/create", async (req, res) => {
    try {
      // Validate request body with Zod
      const validationResult = createAutoClaimPermitRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid request body",
          details: validationResult.error.errors
        });
      }

      const { walletAddress, permitSignature, permitMessage, permitNonce, scopes } = validationResult.data;

      // Parse and validate permit message
      let parsedMessage;
      try {
        parsedMessage = JSON.parse(permitMessage);
      } catch (error) {
        return res.status(400).json({ error: "Invalid permit message format" });
      }

      // Validate message structure
      const messageValidation = autoClaimPermitMessageSchema.safeParse(parsedMessage);
      if (!messageValidation.success) {
        return res.status(400).json({ 
          error: "Invalid permit message structure",
          details: messageValidation.error.errors
        });
      }

      // Verify message matches wallet and nonce
      if (parsedMessage.wallet !== walletAddress) {
        return res.status(400).json({ error: "Wallet address mismatch in permit message" });
      }
      if (parsedMessage.nonce !== permitNonce) {
        return res.status(400).json({ error: "Nonce mismatch in permit message" });
      }

      // Verify signature
      const isValid = verifySignature(permitMessage, permitSignature, walletAddress);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid signature" });
      }

      // Check if permit already exists
      const existing = await storage.getAutoClaimPermitByWallet(walletAddress);
      
      let permit;
      if (existing) {
        if (existing.status === 'active') {
          // Already active, return existing
          return res.json({
            success: true,
            permit: existing,
            message: "Active permit already exists"
          });
        } else {
          // Reactivate revoked permit with new signature
          permit = await storage.reactivateAutoClaimPermit(walletAddress, {
            permitSignature,
            permitMessage,
            permitNonce,
            scopes: scopes || 'claim_empty_accounts'
          });
          console.log(`🔄 Auto-Claim permit reactivated for wallet: ${walletAddress}`);
        }
      } else {
        // Create new permit
        permit = await storage.createAutoClaimPermit({
          walletAddress,
          permitSignature,
          permitMessage,
          permitNonce,
          scopes: scopes || 'claim_empty_accounts'
        });
        console.log(`✅ Auto-Claim permit created for wallet: ${walletAddress}`);
      }

      res.json({
        success: true,
        permit,
        message: "Auto-Claim permit created successfully"
      });

    } catch (error) {
      console.error("Create permit error:", error);
      res.status(500).json({ error: "Failed to create permit" });
    }
  });

  // Get permit status
  app.get("/api/auto-claim/permit/status/:walletAddress", async (req, res) => {
    try {
      const { walletAddress } = req.params;

      const permit = await storage.getAutoClaimPermitByWallet(walletAddress);

      if (!permit) {
        return res.json({
          success: true,
          hasPermit: false,
          status: 'none'
        });
      }

      res.json({
        success: true,
        hasPermit: true,
        permit: {
          status: permit.status,
          scopes: permit.scopes,
          createdAt: permit.createdAt,
          lastUsedAt: permit.lastUsedAt,
          permitPda: permit.permitPda
        }
      });

    } catch (error) {
      console.error("Get permit status error:", error);
      res.status(500).json({ error: "Failed to get permit status" });
    }
  });

  // In-memory store for used revoke nonces (prevent replay attacks)
  const usedRevokeNonces = new Set<string>();

  // Revoke Auto-Claim Permit
  app.post("/api/auto-claim/permit/revoke", async (req, res) => {
    try {
      // Validate request body with Zod
      const validationResult = revokeAutoClaimPermitRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid request body",
          details: validationResult.error.errors
        });
      }

      const { walletAddress, revokeSignature, revokeMessage } = validationResult.data;

      // Parse and validate revoke message
      let parsedRevoke;
      try {
        parsedRevoke = JSON.parse(revokeMessage);
      } catch (error) {
        return res.status(400).json({ error: "Invalid revoke message format" });
      }

      // Validate message structure with schema
      const messageValidation = autoClaimRevokeMessageSchema.safeParse(parsedRevoke);
      if (!messageValidation.success) {
        return res.status(400).json({ 
          error: "Invalid revoke message structure",
          details: messageValidation.error.errors
        });
      }

      // Verify message matches wallet
      if (parsedRevoke.wallet !== walletAddress) {
        return res.status(400).json({ error: "Wallet address mismatch in revoke message" });
      }

      // Check timestamp is recent (within 5 minutes) - INSIDE signed message
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - parsedRevoke.timestamp) > 300) {
        return res.status(400).json({ error: "Revoke request expired (timestamp too old/new)" });
      }

      // Prevent replay: check if nonce was already used
      if (usedRevokeNonces.has(parsedRevoke.nonce)) {
        return res.status(400).json({ error: "Revoke nonce already used (replay attack prevented)" });
      }

      // Verify signature over the EXACT signed message
      const isValid = verifySignature(revokeMessage, revokeSignature, walletAddress);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid revoke signature" });
      }

      const permit = await storage.getAutoClaimPermitByWallet(walletAddress);
      if (!permit) {
        return res.status(404).json({ error: "No permit found" });
      }

      if (permit.status === 'revoked') {
        return res.json({
          success: true,
          message: "Permit already revoked"
        });
      }

      // Mark nonce as used BEFORE revoking (prevent race conditions)
      usedRevokeNonces.add(parsedRevoke.nonce);

      await storage.updateAutoClaimPermitStatus(walletAddress, 'revoked');

      console.log(`🔴 Auto-Claim permit revoked for wallet: ${walletAddress}`);

      res.json({
        success: true,
        message: "Auto-Claim permit revoked successfully"
      });

    } catch (error) {
      console.error("Revoke permit error:", error);
      res.status(500).json({ error: "Failed to revoke permit" });
    }
  });

  // Get relayer job history for a wallet
  app.get("/api/auto-claim/jobs/:walletAddress", async (req, res) => {
    try {
      const { walletAddress } = req.params;
      const { limit = 20 } = req.query;

      const jobs = await storage.getRelayerJobsByWallet(
        walletAddress,
        parseInt(limit as string)
      );

      res.json({
        success: true,
        jobs
      });

    } catch (error) {
      console.error("Get relayer jobs error:", error);
      res.status(500).json({ error: "Failed to get relayer jobs" });
    }
  });

  // Get relayer costs for a wallet
  app.get("/api/auto-claim/costs/:walletAddress", async (req, res) => {
    try {
      const { walletAddress } = req.params;
      const { limit = 20 } = req.query;

      const costs = await storage.getRelayerCostsByWallet(
        walletAddress,
        parseInt(limit as string)
      );

      res.json({
        success: true,
        costs
      });

    } catch (error) {
      console.error("Get relayer costs error:", error);
      res.status(500).json({ error: "Failed to get relayer costs" });
    }
  });

  // Get total relayer statistics
  app.get("/api/auto-claim/stats", async (req, res) => {
    try {
      const stats = await storage.getTotalRelayerCosts();

      res.json({
        success: true,
        stats
      });

    } catch (error) {
      console.error("Get relayer stats error:", error);
      res.status(500).json({ error: "Failed to get relayer stats" });
    }
  });

  // Delegate close authority for auto-claim
  app.post("/api/auto-claim/delegate-authority", async (req, res) => {
    try {
      const { walletAddress } = req.body;
      
      if (!walletAddress) {
        return res.status(400).json({ error: "Wallet address is required" });
      }

      // Get relayer public key from environment
      const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY;
      if (!relayerPrivateKey) {
        return res.status(500).json({ error: "Relayer not configured" });
      }

      // Derive public key from private key
      const { Keypair } = await import("@solana/web3.js");
      const secretKey = bs58.decode(relayerPrivateKey);
      const relayerKeypair = Keypair.fromSecretKey(secretKey);
      const relayerPublicKey = relayerKeypair.publicKey.toBase58();

      // Connect to Solana
      const heliusRpc = getHeliusRpcUrl();
      const connection = getHeliusConnection();

      // Get user's token accounts (BOTH SPL and Token-2022)
      const userPubkey = new PublicKey(walletAddress);
      const accountsNeedingDelegation: Array<{address: string; mint: string; programId: PublicKey}> = [];
      
      // Scan both programs
      const programIds = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
      let totalAccounts = 0;
      
      for (const programId of programIds) {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          userPubkey,
          { programId }
        );

        totalAccounts += tokenAccounts.value.length;

        // Filter for empty accounts that need delegation
        for (const { pubkey, account } of tokenAccounts.value) {
          const parsedInfo = account.data.parsed.info;
          const balance = parsedInfo.tokenAmount?.uiAmount || 0;

          // Only delegate empty accounts
          if (balance === 0) {
            // Normalize close authority (can be string or object with pubkey property)
            const closeAuthority = parsedInfo.closeAuthority;
            const closeAuthorityPubkey = closeAuthority?.pubkey ?? closeAuthority;
            
            // Only delegate if close authority is still the user (or not set)
            if (!closeAuthorityPubkey || closeAuthorityPubkey === walletAddress) {
              accountsNeedingDelegation.push({
                address: pubkey.toBase58(),
                mint: parsedInfo.mint,
                programId  // Store which program owns this account
              });
            }
          }
        }
      }

      console.log(`📋 Found ${totalAccounts} token accounts (SPL + Token-2022) for ${walletAddress.slice(0, 8)}...`);

      console.log(`🔑 Found ${accountsNeedingDelegation.length} accounts needing delegation`);

      if (accountsNeedingDelegation.length === 0) {
        return res.json({
          success: true,
          transactions: [],
          accountsToDelegate: 0,
          message: "No accounts need delegation"
        });
      }

      // Batch into transactions (15-20 accounts per tx)
      const BATCH_SIZE = 15;
      const transactions = [];
      
      for (let i = 0; i < accountsNeedingDelegation.length; i += BATCH_SIZE) {
        const batch = accountsNeedingDelegation.slice(i, i + BATCH_SIZE);
        const transaction = new Transaction();

        // Add SetAuthority instruction for each account in batch
        for (const account of batch) {
          const accountPubkey = new PublicKey(account.address);
          const setAuthorityIx = createSetAuthorityInstruction(
            accountPubkey,                           // Token account
            userPubkey,                              // Current authority (user)
            AuthorityType.CloseAccount,              // Authority type
            new PublicKey(relayerPublicKey),         // New authority (relayer)
            [],                                      // No multisig
            account.programId                        // Use correct program for this account
          );
          
          transaction.add(setAuthorityIx);
        }

        // Set RELAYER as fee payer (sponsored transaction)
        transaction.feePayer = relayerKeypair.publicKey;
        const { blockhash } = await connection.getLatestBlockhash("confirmed");
        transaction.recentBlockhash = blockhash;

        // Relayer signs first (pays fees)
        transaction.partialSign(relayerKeypair);

        // Serialize transaction to base64
        const serialized = transaction.serialize({
          requireAllSignatures: false,
          verifySignatures: false
        });
        
        transactions.push(serialized.toString('base64'));
      }

      console.log(`📦 Created ${transactions.length} delegation transaction(s)`);

      res.json({
        success: true,
        transactions,
        accountsCount: accountsNeedingDelegation.length,
        relayerPublicKey
      });

    } catch (error: any) {
      console.error("Delegate authority error:", error);
      res.status(500).json({ 
        error: "Failed to create delegation transactions",
        details: error.message 
      });
    }
  });

  // Get platform statistics (overview)
  app.get("/api/statistics/overview", async (req, res) => {
    try {
      const { period = 'all' } = req.query;
      
      // Calculate timestamp based on period
      let sinceTimestamp: Date | null = null;
      const now = new Date();
      
      switch (period) {
        case '24h':
          sinceTimestamp = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'weekly':
          sinceTimestamp = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'monthly':
          sinceTimestamp = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'all':
          sinceTimestamp = null; // No time filter - get all data
          break;
        default:
          sinceTimestamp = null;
      }

      const stats = await storage.getStatisticsOverview(sinceTimestamp);

      res.json({
        success: true,
        period,
        stats
      });

    } catch (error) {
      console.error("Get statistics overview error:", error);
      res.status(500).json({ error: "Failed to get statistics overview" });
    }
  });

  // Get leaderboard of top addresses by rent recovery
  app.get("/api/statistics/leaderboard", async (req, res) => {
    try {
      const { period = 'all', limit = '10' } = req.query;
      
      // Calculate timestamp based on period
      let sinceTimestamp: Date | null = null;
      const now = new Date();
      
      switch (period) {
        case '24h':
          sinceTimestamp = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'weekly':
          sinceTimestamp = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'monthly':
          sinceTimestamp = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'all':
          sinceTimestamp = null; // No time filter - get all data
          break;
        default:
          sinceTimestamp = null;
      }

      const limitNum = parseInt(limit as string, 10) || 10;
      const leaderboard = await storage.getLeaderboard(sinceTimestamp, limitNum);

      // Prevent caching to ensure fresh data for each time period
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      res.json({
        success: true,
        period,
        leaderboard
      });

    } catch (error) {
      console.error("Get leaderboard error:", error);
      res.status(500).json({ error: "Failed to get leaderboard" });
    }
  });

  // XP Points Leaderboard - top users by accumulated XP
  app.get("/api/statistics/xp-leaderboard", async (req, res) => {
    try {
      const { limit = '10' } = req.query;
      const limitNum = Math.min(parseInt(limit as string, 10) || 10, 100);
      const PLATFORM_WALLET = 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT';

      const results = await db
        .select({
          walletAddress: userPoints.walletAddress,
          totalPoints: userPoints.points,
        })
        .from(userPoints)
        .where(sql`${userPoints.walletAddress} != ${PLATFORM_WALLET} AND ${userPoints.points} > 0`)
        .orderBy(sql`${userPoints.points} DESC`)
        .limit(limitNum);

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.json({ success: true, leaderboard: results });
    } catch (error) {
      console.error("Get XP leaderboard error:", error);
      res.status(500).json({ error: "Failed to get XP leaderboard" });
    }
  });

  app.get("/api/statistics/trading-leaderboard", async (req, res) => {
    try {
      const { limit = '50', period = 'all' } = req.query;
      const limitNum = Math.min(parseInt(limit as string, 10) || 50, 200);
      let since: Date | null = null;
      if (period === '7d') since = new Date(Date.now() - 7 * 86400000);
      else if (period === '30d') since = new Date(Date.now() - 30 * 86400000);
      else if (period === '24h') since = new Date(Date.now() - 86400000);

      const EXCLUDED_WALLETS = [
        process.env.FEES_WALLET,
        'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT',
        '8SDc57qmSJypVz3qwHK4ijgJAjsKduyHbFr6Yow1hBRc',
      ].filter(Boolean) as string[];

      const positiveUsd = sql`${swapRecords.usdValue}::numeric > 0`;
      const notExcluded = notInArray(swapRecords.walletAddress, EXCLUDED_WALLETS);
      const baseWhere = since
        ? and(gte(swapRecords.swappedAt, since), positiveUsd, notExcluded)
        : and(positiveUsd, notExcluded);

      const results = await db
        .select({
          walletAddress: swapRecords.walletAddress,
          totalVolume: sql<string>`SUM(${swapRecords.usdValue}::numeric)`,
          tradeCount: sql<number>`COUNT(*)`,
          lastTrade: sql<string>`MAX(${swapRecords.swappedAt})`,
        })
        .from(swapRecords)
        .where(baseWhere)
        .groupBy(swapRecords.walletAddress)
        .orderBy(sql`SUM(${swapRecords.usdValue}::numeric) DESC`)
        .limit(limitNum);

      const leaderboard = results.map((r, i) => ({
        rank: i + 1,
        walletAddress: r.walletAddress,
        totalVolumeUsd: parseFloat(r.totalVolume || '0'),
        tradeCount: Number(r.tradeCount),
        lastTrade: r.lastTrade,
      }));

      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, leaderboard, period });
    } catch (error) {
      console.error("Trading leaderboard error:", error);
      res.status(500).json({ error: "Failed to get trading leaderboard" });
    }
  });

  // Mass Transfer - Record a transfer transaction
  app.post("/api/mass-transfer/record", async (req, res) => {
    try {
      const { signature, walletAddress, destinationWallet, tokensCount, tokenDetails, totalPlatformFees } = req.body;
      
      if (!signature || !walletAddress || !destinationWallet || !tokensCount || totalPlatformFees === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const record = await storage.createMassTransferRecord({
        signature,
        walletAddress,
        destinationWallet,
        tokensCount,
        tokenDetails: typeof tokenDetails === 'string' ? tokenDetails : JSON.stringify(tokenDetails),
        totalPlatformFees
      });

      res.json({
        success: true,
        record
      });
    } catch (error: any) {
      console.error("Record mass transfer error:", error);
      res.status(500).json({ error: "Failed to record mass transfer" });
    }
  });

  // Mass Transfer - Get usage statistics
  app.get("/api/mass-transfer/stats", async (req, res) => {
    try {
      const stats = await storage.getMassTransferStats();

      res.json({
        success: true,
        stats
      });
    } catch (error: any) {
      console.error("Get mass transfer stats error:", error);
      res.status(500).json({ error: "Failed to get mass transfer statistics" });
    }
  });

  // Backpack Borrow/Lend - Get markets with rates (authenticated)
  app.get("/api/jupiter-lend/earn-pools", async (req, res) => {
    try {
      console.log('🎒 Fetching Backpack borrow/lend markets...');

      if (!backpackApiService) {
        throw new Error('Backpack API service not initialized');
      }

      // Fetch borrow/lend markets from Backpack API
      const markets = await backpackApiService.getBorrowLendMarkets();
      console.log(`✅ Found ${markets.length} Backpack borrow/lend markets`);

      // Transform the data to match our frontend format
      const reserves = markets.map((market: any) => {
        const symbol = market.asset || market.symbol || 'Unknown';
        
        // APY rates are already converted to percentage in the service
        const lendAPY = parseFloat(market.lendApy || 0);
        const borrowAPY = parseFloat(market.borrowApy || 0);
        
        return {
          address: symbol,
          symbol: symbol,
          name: symbol,
          mint: market.mint || symbol,
          logoUrl: '',
          depositAPY: lendAPY,
          borrowAPY: borrowAPY,
          tvl: market.totalLiquidity || '0',
          deposited: '0.00',
          earnings: '0.00',
          decimals: market.decimals || 9,
          utilization: parseFloat(market.utilizationRate || 0) * 100,
          available: market.availableLiquidity || '0',
          price: market.price || '0',
          hasLending: market.hasLending || false,
          marketType: market.marketType || 'SPOT',
          orderBookState: market.orderBookState || 'Open'
        };
      });

      const lendingMarkets = reserves.filter((r: any) => r.hasLending);
      console.log(`📊 Showing ${reserves.length} total markets (${lendingMarkets.length} with lending)`);

      // Sort reserves: lending markets first, then by highest APY
      const sortedReserves = reserves.sort((a: any, b: any) => {
        // Lending markets come first
        if (a.hasLending && !b.hasLending) return -1;
        if (!a.hasLending && b.hasLending) return 1;
        
        // Within each group, sort by deposit APY (highest first)
        return b.depositAPY - a.depositAPY;
      });

      res.json({
        success: true,
        programId: 'backpack-exchange',
        reserves: sortedReserves,
        totalPools: markets.length,
        lendingPools: lendingMarkets.length
      });
    } catch (error: any) {
      console.error("Backpack borrow/lend markets error:", error);
      res.status(500).json({ error: "Failed to load Backpack borrow/lend markets", details: error.message });
    }
  });

  // Backpack Borrow/Lend - Get user positions (authenticated)
  app.get("/api/jupiter-lend/user-positions/:walletAddress", async (req, res) => {
    try {
      const { walletAddress } = req.params;

      if (!walletAddress) {
        return res.status(400).json({ error: 'Wallet address is required' });
      }

      console.log(`📊 Fetching Backpack borrow/lend positions...`);

      if (!backpackApiService) {
        throw new Error('Backpack API service not initialized');
      }

      // Fetch user positions from Backpack API
      const positionsData = await backpackApiService.getBorrowLendPositions();
      console.log('📊 Backpack positions data:', JSON.stringify(positionsData, null, 2));

      if (!positionsData || positionsData.length === 0) {
        console.log('⚠️ No positions found');
        return res.json({
          success: true,
          hasPositions: false,
          deposits: [],
          totalDepositValue: '0'
        });
      }

      // Transform positions data and filter out zero balances
      const deposits = positionsData
        .map((position: any) => ({
          asset: position.token?.assetAddress || position.asset || position.mint,
          symbol: position.token?.asset?.symbol || position.symbol,
          amount: position.underlyingAssets || position.balance || position.shares,
          shares: position.shares,
          convertToShares: position.token?.convertToShares,
          convertToAssets: position.token?.convertToAssets,
          decimals: position.token?.decimals || position.token?.asset?.decimals || 6,
          amountUSD: position.balanceUsd || '0',
          apy: position.apy || 0,
          jlTokenAddress: position.token?.address // jlToken address (e.g., jlUSDC, jlWSOL)
        }))
        .filter((dep: any) => parseFloat(dep.amount) > 0);

      console.log('✅ Transformed deposits (non-zero only):', JSON.stringify(deposits, null, 2));

      // Fetch earnings data from Jupiter Earnings API using jlToken addresses
      let earningsData: any = {};
      if (deposits.length > 0) {
        try {
          // Use jlToken addresses (not asset addresses)
          const jlTokenAddresses = deposits.map((d: any) => d.jlTokenAddress).join(',');
          console.log(`📈 Fetching earnings for jlTokens: ${jlTokenAddresses}`);
          
          const earningsResponse = await fetch(
            `https://lite-api.jup.ag/lend/v1/earn/earnings?user=${walletAddress}&positions=${jlTokenAddresses}`
          );
          
          if (earningsResponse.ok) {
            const earnings = await earningsResponse.json();
            console.log('💰 Raw earnings data from Jupiter API:', JSON.stringify(earnings, null, 2));
            
            // Map earnings by jlToken address, then map back to asset address
            if (Array.isArray(earnings)) {
              earnings.forEach((e: any) => {
                const jlTokenAddress = e.address;
                const deposit = deposits.find((d: any) => d.jlTokenAddress === jlTokenAddress);
                if (deposit) {
                  earningsData[deposit.asset] = e.earnings || '0';
                  console.log(`✅ Earnings for ${deposit.symbol}: ${e.earnings} raw units`);
                }
              });
            }
          } else {
            console.warn('⚠️ Failed to fetch earnings:', earningsResponse.status);
          }
        } catch (error) {
          console.warn('⚠️ Error fetching earnings:', error);
        }
      }

      // Merge earnings into deposits
      const depositsWithEarnings = deposits.map((dep: any) => ({
        ...dep,
        earnings: earningsData[dep.asset] || '0'
      }));

      res.json({
        success: true,
        hasPositions: true,
        deposits: depositsWithEarnings,
        totalDepositValue: depositsWithEarnings.reduce((sum: number, d: any) => sum + parseFloat(d.amountUSD || 0), 0).toString()
      });
    } catch (error: any) {
      console.error("Jupiter Lend user positions error:", error);
      res.json({
        success: true,
        hasPositions: false,
        deposits: [],
        totalDepositValue: '0'
      });
    }
  });

  // Backpack Borrow/Lend - Disabled (requires Backpack Exchange account)
  // Users must create a Backpack Exchange account and manage lending there
  app.post("/api/jupiter-lend/build-deposit", async (req, res) => {
    res.status(501).json({ 
      error: "Backpack lending requires a Backpack Exchange account",
      message: "Please visit https://backpack.exchange to create an account and manage your lending positions."
    });
  });

  app.post("/api/jupiter-lend/build-withdraw", async (req, res) => {
    res.status(501).json({ 
      error: "Backpack lending requires a Backpack Exchange account",
      message: "Please visit https://backpack.exchange to create an account and manage your lending positions."
    });
  });

  app.post("/api/jupiter-lend/record-deposit", async (req, res) => {
    res.status(501).json({ 
      error: "Backpack lending analytics not available",
      message: "Backpack manages lending positions directly on their platform."
    });
  });

  // Get Backpack Lend statistics (placeholder)
  app.get("/api/jupiter-lend/statistics", async (req, res) => {
    res.json({
      success: true,
      totalDepositsUsd: '0.00',
      totalEarningsUsd: '0.00',
      totalDeposits: 0,
    });
  });

  // Backpack Borrow/Lend - Get borrow history (authenticated)
  app.get("/api/backpack/borrow-history", async (req, res) => {
    try {
      const { symbol } = req.query;
      const history = await backpackApiService.getBorrowHistory(
        symbol ? { symbol: symbol as string } : undefined
      );
      res.json({ success: true, history });
    } catch (error: any) {
      console.error('Backpack borrow history error:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch borrow history' });
    }
  });

  // Backpack Borrow/Lend - Get interest history (authenticated)
  app.get("/api/backpack/interest-history", async (req, res) => {
    try {
      const { symbol } = req.query;
      const history = await backpackApiService.getInterestHistory(
        symbol ? { symbol: symbol as string } : undefined
      );
      res.json({ success: true, history });
    } catch (error: any) {
      console.error('Backpack interest history error:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch interest history' });
    }
  });

  // Backpack Borrow/Lend - Get market history (public)
  app.get("/api/backpack/market-history", async (req, res) => {
    try {
      const { symbol } = req.query;
      const history = await backpackApiService.getMarketHistory(symbol as string | undefined);
      res.json({ success: true, history });
    } catch (error: any) {
      console.error('Backpack market history error:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch market history' });
    }
  });

  // Backpack Borrow/Lend - Execute borrow/lend transaction (authenticated)
  app.post("/api/backpack/execute", async (req, res) => {
    try {
      const { symbol, side, quantity } = req.body;
      
      if (!symbol || !side || !quantity) {
        return res.status(400).json({ error: 'Missing required parameters: symbol, side, quantity' });
      }

      const result = await backpackApiService.executeBorrowLend({ symbol, side, quantity });
      res.json({ success: true, result });
    } catch (error: any) {
      console.error('Backpack execute error:', error);
      if (error.message?.includes('Invalid X-API-Key') || error.message?.includes('INVALID_CLIENT_REQUEST')) {
        return res.status(401).json({ 
          error: 'Backpack API authentication failed. Please configure valid API credentials to use lending features.',
          requiresAuth: true 
        });
      }
      res.status(500).json({ error: error.message || 'Failed to execute transaction' });
    }
  });

  // Backpack Borrow/Lend - Get estimated liquidation price (authenticated)
  app.get("/api/backpack/liquidation-price", async (req, res) => {
    try {
      const { symbol, side, quantity } = req.query;
      
      if (!symbol || !side || !quantity) {
        return res.status(400).json({ error: 'Missing required parameters: symbol, side, quantity' });
      }

      const result = await backpackApiService.getEstimatedLiquidationPrice({
        symbol: symbol as string,
        side: side as 'Lend' | 'Borrow',
        quantity: quantity as string
      });
      res.json({ success: true, liquidationPrice: result });
    } catch (error: any) {
      console.error('Backpack liquidation price error:', error);
      res.status(500).json({ error: error.message || 'Failed to get liquidation price' });
    }
  });

  // Backpack Capital - Get balances (authenticated)
  app.get("/api/backpack/balances", async (req, res) => {
    try {
      const balances = await backpackApiService.getBalances();
      res.json({ success: true, balances });
    } catch (error: any) {
      console.error('Backpack balances error:', error);
      if (error.message?.includes('Invalid X-API-Key') || error.message?.includes('INVALID_CLIENT_REQUEST')) {
        return res.status(401).json({ 
          error: 'Backpack API authentication failed. Please configure valid API credentials.',
          requiresAuth: true 
        });
      }
      res.status(500).json({ error: error.message || 'Failed to fetch balances' });
    }
  });

  // Backpack Capital - Get collateral (authenticated)
  app.get("/api/backpack/collateral", async (req, res) => {
    try {
      const collateral = await backpackApiService.getCollateral();
      res.json({ success: true, collateral });
    } catch (error: any) {
      console.error('Backpack collateral error:', error);
      if (error.message?.includes('Invalid X-API-Key') || error.message?.includes('INVALID_CLIENT_REQUEST')) {
        return res.status(401).json({ 
          error: 'Backpack API authentication failed. Please configure valid API credentials.',
          requiresAuth: true 
        });
      }
      res.status(500).json({ error: error.message || 'Failed to fetch collateral' });
    }
  });

  // ============================================
  // BACKPACK WEBSOCKET ENDPOINTS
  // ============================================

  // Get WebSocket connection status
  app.get("/api/backpack/ws/status", async (req, res) => {
    try {
      res.json({ 
        connected: backpackWebSocketService.isConnected(),
        subscriptions: backpackWebSocketService.getSubscriptions()
      });
    } catch (error: any) {
      console.error('WebSocket status error:', error);
      res.status(500).json({ error: error.message || 'Failed to get WebSocket status' });
    }
  });

  // Server-Sent Events for order updates
  app.get("/api/backpack/ws/orders", async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const { symbol } = req.query;
    const stream = symbol ? `account.orderUpdate.${symbol}` : 'account.orderUpdate';

    // Keep connection alive with heartbeat
    const heartbeat = setInterval(() => {
      res.write(`:heartbeat\n\n`);
    }, 15000);

    try {
      // Connect and wait for it to be ready
      if (!backpackWebSocketService.isConnected()) {
        await backpackWebSocketService.connect();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      await backpackWebSocketService.subscribe(stream);
      
      // Send initial connection success message
      res.write(`data: ${JSON.stringify({ type: 'connected', stream })}\n\n`);

      const orderHandler = (data: any) => {
        res.write(`data: ${JSON.stringify({ type: 'update', data })}\n\n`);
      };

      const errorHandler = (msg: any) => {
        if (msg.error) {
          res.write(`data: ${JSON.stringify({ type: 'error', error: msg.error })}\n\n`);
        }
      };

      backpackWebSocketService.on('orderUpdate', orderHandler);
      backpackWebSocketService.on('message', errorHandler);

      req.on('close', () => {
        clearInterval(heartbeat);
        backpackWebSocketService.off('orderUpdate', orderHandler);
        backpackWebSocketService.off('message', errorHandler);
        backpackWebSocketService.unsubscribe(stream);
      });

    } catch (error: any) {
      console.error('Order stream error:', error);
      clearInterval(heartbeat);
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    }
  });

  // Server-Sent Events for position updates
  app.get("/api/backpack/ws/positions", async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const { symbol } = req.query;
    const stream = symbol ? `account.positionUpdate.${symbol}` : 'account.positionUpdate';

    // Keep connection alive with heartbeat
    const heartbeat = setInterval(() => {
      res.write(`:heartbeat\n\n`);
    }, 15000);

    try {
      // Connect and wait for it to be ready
      if (!backpackWebSocketService.isConnected()) {
        await backpackWebSocketService.connect();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      await backpackWebSocketService.subscribe(stream);
      
      // Send initial connection success message
      res.write(`data: ${JSON.stringify({ type: 'connected', stream })}\n\n`);

      const positionHandler = (data: any) => {
        res.write(`data: ${JSON.stringify({ type: 'update', data })}\n\n`);
      };

      const errorHandler = (msg: any) => {
        if (msg.error) {
          res.write(`data: ${JSON.stringify({ type: 'error', error: msg.error })}\n\n`);
        }
      };

      backpackWebSocketService.on('positionUpdate', positionHandler);
      backpackWebSocketService.on('message', errorHandler);

      req.on('close', () => {
        clearInterval(heartbeat);
        backpackWebSocketService.off('positionUpdate', positionHandler);
        backpackWebSocketService.off('message', errorHandler);
        backpackWebSocketService.unsubscribe(stream);
      });

    } catch (error: any) {
      console.error('Position stream error:', error);
      clearInterval(heartbeat);
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    }
  });

  // Server-Sent Events for RFQ updates
  app.get("/api/backpack/ws/rfq", async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const { symbol } = req.query;
    const stream = symbol ? `account.rfqUpdate.${symbol}` : 'account.rfqUpdate';

    try {
      await backpackWebSocketService.connect();
      await backpackWebSocketService.subscribe(stream);

      const rfqHandler = (data: any) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      backpackWebSocketService.on('rfqUpdate', rfqHandler);

      req.on('close', () => {
        backpackWebSocketService.off('rfqUpdate', rfqHandler);
        backpackWebSocketService.unsubscribe(stream);
      });

    } catch (error: any) {
      console.error('RFQ stream error:', error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  });

  // Server-Sent Events for market depth updates
  app.get("/api/backpack/ws/depth/:symbol", async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const { symbol } = req.params;
    const stream = `depth.${symbol}`;

    try {
      await backpackWebSocketService.connect();
      await backpackWebSocketService.subscribe(stream);

      const depthHandler = (data: any) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      backpackWebSocketService.on('depth', depthHandler);

      req.on('close', () => {
        backpackWebSocketService.off('depth', depthHandler);
        backpackWebSocketService.unsubscribe(stream);
      });

    } catch (error: any) {
      console.error('Depth stream error:', error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  });

  // Server-Sent Events for ticker updates
  app.get("/api/backpack/ws/ticker/:symbol", async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const { symbol } = req.params;
    const stream = `ticker.${symbol}`;

    try {
      await backpackWebSocketService.connect();
      await backpackWebSocketService.subscribe(stream);

      const tickerHandler = (data: any) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      backpackWebSocketService.on('ticker', tickerHandler);

      req.on('close', () => {
        backpackWebSocketService.off('ticker', tickerHandler);
        backpackWebSocketService.unsubscribe(stream);
      });

    } catch (error: any) {
      console.error('Ticker stream error:', error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  });

  // ============================================
  // X (TWITTER) OAUTH ENDPOINTS
  // ============================================

  // Get OAuth connection status
  app.get("/api/x/oauth/status", async (req, res) => {
    try {
      const account = await xOAuthService.getActiveAccount();
      
      if (!account) {
        return res.json({ connected: false });
      }

      res.json({
        connected: true,
        accountName: account.accountName,
        accountId: account.accountId,
      });
    } catch (error) {
      console.error('Failed to get OAuth status:', error);
      res.status(500).json({ error: 'Failed to get connection status' });
    }
  });

  // Initiate OAuth flow (PIN-based for Desktop apps)
  app.post("/api/x/oauth/request", async (req, res) => {
    try {
      const { authUrl, oauthToken } = await xOAuthService.getRequestToken();

      res.json({ 
        success: true, 
        authUrl, 
        oauthToken 
      });
    } catch (error: any) {
      console.error('OAuth request error:', error);
      res.status(500).json({ error: error.message || 'Failed to initiate OAuth' });
    }
  });

  // Verify PIN and complete OAuth
  app.post("/api/x/oauth/verify-pin", async (req, res) => {
    try {
      const { oauthToken, pin } = req.body;

      if (!oauthToken || !pin) {
        return res.status(400).json({ error: 'OAuth token and PIN are required' });
      }

      const accessTokenData = await xOAuthService.getAccessToken(
        oauthToken,
        pin.trim()
      );

      await xOAuthService.saveCredentials(accessTokenData);

      res.json({ 
        success: true, 
        accountName: accessTokenData.screen_name 
      });
    } catch (error: any) {
      console.error('OAuth PIN verification error:', error);
      res.status(500).json({ error: error.message || 'Failed to verify PIN' });
    }
  });

  // Disconnect X account
  app.post("/api/x/oauth/disconnect", async (req, res) => {
    try {
      await xOAuthService.disconnect();

      res.json({ 
        success: true, 
        message: 'X account disconnected successfully' 
      });
    } catch (error: any) {
      console.error('OAuth disconnect error:', error);
      res.status(500).json({ error: error.message || 'Failed to disconnect' });
    }
  });

  // Preview card banner (GET)
  app.get("/api/x/preview-card", async (req, res) => {
    try {
      const solAmount = req.query.solAmount as string || "0.0208";
      const walletAddress = req.query.walletAddress as string || "58AzpFr9...c6ByezPf8";

      const { generateClaimCardBanner } = await import('./cardBannerGenerator.js');
      const cardImage = await generateClaimCardBanner({
        solAmount,
        walletAddress
      });

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(cardImage);
    } catch (error: any) {
      console.error('Preview card generation error:', error);
      res.status(500).json({ error: error.message || 'Failed to generate preview' });
    }
  });

  // Test post to X (manual trigger)
  app.post("/api/x/test-post", async (req, res) => {
    try {
      const { solAmount, walletAddress } = req.body;

      if (!solAmount || !walletAddress) {
        return res.status(400).json({ error: 'solAmount and walletAddress are required' });
      }

      const tweetContent = `🔥 Hot drop! ${Number(solAmount).toFixed(4)} SOL just got claimed. #GetFreeSol #ClaimSOL #Solana #DeFi #sol

Claimer: ${walletAddress}`;

      console.log(`📢 Test posting to X: ${solAmount} SOL...`);
      
      const { generateClaimCardBanner } = await import('./cardBannerGenerator.js');
      const cardImage = await generateClaimCardBanner({
        solAmount,
        walletAddress
      });
      
      const uploadResult = await xApiService.uploadMedia(cardImage);
      
      let mediaIds: string[] = [];
      if (uploadResult.success && uploadResult.mediaId) {
        mediaIds = [uploadResult.mediaId];
      }
      
      const result = await xApiService.postTweet({ 
        content: tweetContent, 
        postType: 'test_post',
        mediaIds 
      });

      if (result.success) {
        res.json({ 
          success: true, 
          tweetId: result.tweetId,
          message: 'Test post sent successfully' 
        });
      } else {
        res.status(500).json({ error: result.error || 'Failed to post tweet' });
      }
    } catch (error: any) {
      console.error('Test post error:', error);
      res.status(500).json({ error: error.message || 'Failed to post test tweet' });
    }
  });

  // ============================================
  // X (TWITTER) BOT API ENDPOINTS
  // ============================================
  
  const PLATFORM_WALLET = 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT';
  
  // Middleware to verify platform wallet signature (POST requests)
  
  // Helper to verify platform wallet for GET requests
  const verifyPlatformWalletQuery = (req: any, res: any): boolean => {
    const { walletAddress, signature, message } = req.query;
    
    if (!walletAddress || !signature || !message) {
      res.status(401).json({ error: 'Missing authentication credentials' });
      return false;
    }
    
    if (walletAddress !== PLATFORM_WALLET) {
      res.status(403).json({ error: 'Access denied: Platform wallet required' });
      return false;
    }
    
    // Verify signature
    const isValid = verifySignature(message as string, signature as string, walletAddress as string);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid signature' });
      return false;
    }
    
    // Prevent replay attacks: message must include timestamp within last 5 minutes
    try {
      const messageData = JSON.parse(message as string);
      const timestamp = messageData.timestamp;
      
      if (!timestamp) {
        res.status(401).json({ error: 'Message must include timestamp' });
        return false;
      }
      
      const now = Date.now();
      const messageTime = new Date(timestamp).getTime();
      const fiveMinutes = 5 * 60 * 1000;
      
      if (now - messageTime > fiveMinutes) {
        res.status(401).json({ error: 'Signature expired (>5 minutes old)' });
        return false;
      }
      
      if (messageTime > now + 60000) { // Allow 1 minute clock skew
        res.status(401).json({ error: 'Invalid timestamp (future)' });
        return false;
      }
    } catch (error) {
      res.status(401).json({ error: 'Invalid message format (must be JSON with timestamp)' });
      return false;
    }
    
    return true;
  };
  
  // Preview daily report banner (Style 4 is default)
  app.get("/api/x-bot/preview-daily-report", async (req, res) => {
    try {
      const { generateDailyReportBanner } = await import('./cardBannerGenerator.js');
      const totalSolRecovered = await storage.getTotalSolRecovered();
      const totalAccountsClosed = await storage.getTotalAccountsClaimed();
      const style = parseInt(req.query.style as string) || 4;
      const validStyle = Math.min(5, Math.max(1, style)) as 1 | 2 | 3 | 4 | 5;
      
      const imageBuffer = await generateDailyReportBanner({
        totalSolClaimed: totalSolRecovered.toString(),
        totalAccountsClosed,
        periodLabel: 'Since Launch',
        style: validStyle
      });
      
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', 'inline; filename="daily-report.png"');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.send(imageBuffer);
    } catch (error: any) {
      console.error("Daily report preview error:", error);
      res.status(500).json({ error: "Failed to generate preview", details: error.message });
    }
  });

  // Get X bot status and stats
  app.get("/api/x-bot/status", async (req, res) => {
    try {
      // Check if X credentials exist
      const authTokens = await db.select().from(xAuthTokens).where(eq(xAuthTokens.isActive, true)).limit(1);
      
      const hasAppCredentials = authTokens.length > 0 && !!(authTokens[0].apiKey && authTokens[0].apiKeySecret);
      const isConnected = authTokens.length > 0 && !!(authTokens[0].accessToken && authTokens[0].accessTokenSecret);
      const isAuthenticated = isConnected;
      
      // Get post stats
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const postsThisMonth = await db.select().from(xPosts)
        .where(sql`${xPosts.postedAt} >= ${firstDayOfMonth.toISOString()}`);
      
      // Calculate total engagement
      let totalEngagement = 0;
      for (const post of postsThisMonth) {
        totalEngagement += (post.likes || 0) + (post.retweets || 0) + (post.replies || 0);
      }
      
      // Get active schedules
      const activeSchedules = await db.select().from(xSchedules).where(eq(xSchedules.isActive, true));
      
      res.json({
        success: true,
        isAuthenticated,
        hasAppCredentials,
        isConnected,
        accountName: isAuthenticated ? authTokens[0].accountName : null,
        postsThisMonth: postsThisMonth.length,
        monthlyLimit: 1500, // Free tier limit
        totalEngagement,
        activeSchedules: activeSchedules.length,
        botStatus: isAuthenticated ? 'active' : 'not_configured',
      });
    } catch (error: any) {
      console.error("X bot status error:", error);
      res.status(500).json({ error: "Failed to get X bot status", details: error.message });
    }
  });
  
  // Initialize X API credentials from environment variables on startup
  async function initializeXApiCredentials() {
    try {
      const apiKey = process.env.X_API_KEY;
      const apiSecret = process.env.X_API_SECRET;
      
      if (!apiKey || !apiSecret) {
        console.log('⚠️ X API credentials not found in environment variables');
        return;
      }
      
      // Check if credentials already exist
      const existing = await db.select().from(xAuthTokens).limit(1);
      
      if (existing.length > 0) {
        // Update existing record with env credentials
        await db.update(xAuthTokens)
          .set({ 
            apiKey, 
            apiKeySecret: apiSecret,
            isActive: true
          })
          .where(eq(xAuthTokens.id, existing[0].id));
        console.log('✅ X API credentials updated from environment');
      } else {
        // Create new record
        await db.insert(xAuthTokens).values({
          apiKey,
          apiKeySecret: apiSecret,
          accessToken: '',
          accessTokenSecret: '',
          accountName: 'Not connected',
          isActive: true,
        });
        console.log('✅ X API credentials initialized from environment');
      }
    } catch (error: any) {
      console.error('❌ Failed to initialize X API credentials:', error);
    }
  }
  
  // Initialize on server start
  initializeXApiCredentials();
  
  // OAuth 1.0a flow - Step 1: Get request token and redirect to X
  app.get("/api/x-bot/oauth/request-token", async (req, res) => {
    try {
      // Check if we have API keys stored
      const existingCreds = await db.select().from(xAuthTokens).limit(1);
      if (existingCreds.length === 0) {
        return res.status(400).send('X API keys not configured. Please contact administrator.');
      }
      
      const { apiKey, apiKeySecret } = existingCreds[0];
      
      // Create OAuth client
      const oauth = new OAuth({
        consumer: {
          key: apiKey,
          secret: apiKeySecret,
        },
        signature_method: 'HMAC-SHA1',
        hash_function(base_string, key) {
          return crypto.createHmac('sha1', key).update(base_string).digest('base64');
        },
      });
      
      const callbackUrl = `${req.protocol}://${req.get('host')}/api/x-bot/oauth/callback`;
      const requestData = {
        url: 'https://api.twitter.com/oauth/request_token',
        method: 'POST' as const,
        data: { oauth_callback: callbackUrl },
      };
      
      const authHeader = oauth.toHeader(oauth.authorize(requestData));
      
      console.log('🔐 Requesting OAuth token from X...');
      
      const response = await axios.post(requestData.url, `oauth_callback=${encodeURIComponent(callbackUrl)}`, {
        headers: {
          ...authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      
      const params = new URLSearchParams(response.data);
      const oauthToken = params.get('oauth_token');
      const oauthTokenSecret = params.get('oauth_token_secret');
      
      if (!oauthToken) {
        throw new Error('Failed to get OAuth token from X');
      }
      
      // Store token secret temporarily (we'll need it in callback)
      // In production, use Redis or session storage
      global.pendingOAuthTokens = global.pendingOAuthTokens || {};
      global.pendingOAuthTokens[oauthToken] = oauthTokenSecret;
      
      console.log('✅ Got request token, redirecting to X authorization...');
      
      // Redirect user to X authorization page
      res.redirect(`https://api.twitter.com/oauth/authorize?oauth_token=${oauthToken}`);
    } catch (error: any) {
      console.error('❌ OAuth request token error:', error.response?.data || error.message);
      res.status(500).send(`OAuth failed: ${error.message}`);
    }
  });
  
  // OAuth 1.0a flow - Step 2: Handle callback and exchange for access token
  app.get("/api/x-bot/oauth/callback", async (req, res) => {
    try {
      const { oauth_token, oauth_verifier } = req.query;
      
      if (!oauth_token || !oauth_verifier) {
        return res.status(400).send('Missing OAuth parameters');
      }
      
      console.log('🔐 Received OAuth callback from X...');
      
      // Retrieve token secret
      const oauthTokenSecret = global.pendingOAuthTokens?.[oauth_token as string];
      if (!oauthTokenSecret) {
        return res.status(400).send('Invalid or expired OAuth token');
      }
      
      // Get API keys
      const existingCreds = await db.select().from(xAuthTokens).limit(1);
      if (existingCreds.length === 0) {
        return res.status(400).send('X API keys not configured');
      }
      
      const { apiKey, apiKeySecret } = existingCreds[0];
      
      // Create OAuth client
      const oauth = new OAuth({
        consumer: {
          key: apiKey,
          secret: apiKeySecret,
        },
        signature_method: 'HMAC-SHA1',
        hash_function(base_string, key) {
          return crypto.createHmac('sha1', key).update(base_string).digest('base64');
        },
      });
      
      const requestData = {
        url: 'https://api.twitter.com/oauth/access_token',
        method: 'POST' as const,
      };
      
      const token = {
        key: oauth_token as string,
        secret: oauthTokenSecret,
      };
      
      const authHeader = oauth.toHeader(oauth.authorize(requestData, token));
      
      console.log('🔐 Exchanging verifier for access token...');
      
      const response = await axios.post(
        requestData.url,
        `oauth_verifier=${oauth_verifier}`,
        {
          headers: {
            ...authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );
      
      const params = new URLSearchParams(response.data);
      const accessToken = params.get('oauth_token');
      const accessTokenSecret = params.get('oauth_token_secret');
      const screenName = params.get('screen_name');
      const userId = params.get('user_id');
      
      if (!accessToken || !accessTokenSecret) {
        throw new Error('Failed to get access token from X');
      }
      
      console.log(`✅ OAuth successful for @${screenName}`);
      
      // Deactivate old tokens
      await db.update(xAuthTokens).set({ isActive: false });
      
      // Save new tokens
      await db.insert(xAuthTokens).values({
        apiKey,
        apiKeySecret,
        accessToken,
        accessTokenSecret,
        accountName: `@${screenName}`,
        accountId: userId,
        isActive: true,
      });
      
      // Clean up pending token
      delete global.pendingOAuthTokens[oauth_token as string];
      
      // Redirect to admin page with success message
      res.redirect('/admin/x-bot?connected=true');
    } catch (error: any) {
      console.error('❌ OAuth callback error:', error.response?.data || error.message);
      res.redirect('/admin/x-bot?error=oauth_failed');
    }
  });
  
  // Save X OAuth credentials (manual entry fallback)
  app.post("/api/x-bot/save-credentials", requirePlatformWallet, async (req, res) => {
    try {
      const { apiKey, apiKeySecret, accessToken, accessTokenSecret, accountName } = req.body;
      
      // Deactivate old tokens
      await db.update(xAuthTokens).set({ isActive: false });
      
      // Save new tokens
      await db.insert(xAuthTokens).values({
        apiKey,
        apiKeySecret,
        accessToken,
        accessTokenSecret,
        accountName: accountName || 'Unknown',
        isActive: true,
      });
      
      console.log(`✅ X credentials saved for ${accountName}`);
      
      res.json({
        success: true,
        message: 'X credentials saved successfully',
      });
    } catch (error: any) {
      console.error("Save X credentials error:", error);
      res.status(500).json({ error: "Failed to save credentials", details: error.message });
    }
  });
  
  // Get recent posts
  app.get("/api/x-bot/posts", async (req, res) => {
    try {
      if (!verifyPlatformWalletQuery(req, res)) return;
      
      const { limit = '20' } = req.query;
      
      const posts = await db.select().from(xPosts)
        .orderBy(sql`${xPosts.createdAt} DESC`)
        .limit(parseInt(limit as string));
      
      res.json({
        success: true,
        posts,
      });
    } catch (error: any) {
      console.error("Get X posts error:", error);
      res.status(500).json({ error: "Failed to get posts", details: error.message });
    }
  });
  
  // Get schedules
  app.get("/api/x-bot/schedules", async (req, res) => {
    try {
      if (!verifyPlatformWalletQuery(req, res)) return;
      
      const schedules = await db.select().from(xSchedules);
      
      res.json({
        success: true,
        schedules,
      });
    } catch (error: any) {
      console.error("Get X schedules error:", error);
      res.status(500).json({ error: "Failed to get schedules", details: error.message });
    }
  });
  
  // Create or update schedule
  app.post("/api/x-bot/schedule", requirePlatformWallet, async (req, res) => {
    try {
      const { scheduleType, timeOfDay, frequency, isActive } = req.body;
      
      // Check if schedule exists
      const existing = await db.select().from(xSchedules)
        .where(eq(xSchedules.scheduleType, scheduleType))
        .limit(1);
      
      if (existing.length > 0) {
        // Update existing
        await db.update(xSchedules)
          .set({ timeOfDay, frequency, isActive })
          .where(eq(xSchedules.scheduleType, scheduleType));
      } else {
        // Create new
        await db.insert(xSchedules).values({
          scheduleType,
          timeOfDay,
          frequency,
          isActive,
        });
      }
      
      console.log(`✅ Schedule ${scheduleType} updated: ${timeOfDay} (${frequency})`);
      
      res.json({
        success: true,
        message: 'Schedule saved successfully',
      });
    } catch (error: any) {
      console.error("Save X schedule error:", error);
      res.status(500).json({ error: "Failed to save schedule", details: error.message });
    }
  });
  
  // Manual post tweet endpoint (for testing)
  app.post("/api/x-bot/post-tweet", requirePlatformWallet, async (req, res) => {
    try {
      const { content, postType } = req.body;
      
      const result = await xApiService.postTweet({ content, postType: postType || 'manual' });
      
      if (result.success) {
        res.json({
          success: true,
          tweetId: result.tweetId,
          message: 'Tweet posted successfully',
        });
      } else {
        res.status(500).json({ error: result.error });
      }
    } catch (error: any) {
      console.error("Post tweet error:", error);
      res.status(500).json({ error: "Failed to post tweet", details: error.message });
    }
  });
  
  // Quick post endpoint (simpler auth - for admin dashboard)
  app.post("/api/x-bot/quick-post", requirePlatformWallet, async (req, res) => {
    try {
      const { content, includeImage, imageType, dailyReportStyle } = req.body;
      
      if (!content || content.trim().length === 0) {
        return res.status(400).json({ error: 'Content is required' });
      }
      
      if (content.length > 280) {
        return res.status(400).json({ error: 'Content exceeds 280 character limit' });
      }
      
      console.log(`📢 Quick post to X: "${content.substring(0, 50)}..." (includeImage: ${includeImage})`);
      
      let mediaIds: string[] = [];
      
      if (includeImage) {
        try {
          let cardImage: Buffer;
          
          if (imageType === 'daily_report') {
            // Use special daily report banner with real stats
            const { generateDailyReportBanner } = await import('./cardBannerGenerator.js');
            const totalSolRecovered = await storage.getTotalSolRecovered();
            const totalAccountsClosed = await storage.getTotalAccountsClaimed();
            const style = Math.min(5, Math.max(1, dailyReportStyle || 1)) as 1 | 2 | 3 | 4 | 5;
            cardImage = await generateDailyReportBanner({
              totalSolClaimed: totalSolRecovered.toString(),
              totalAccountsClosed,
              periodLabel: 'Since Launch',
              style
            });
          } else {
            const { generatePostCardBanner } = await import('./cardBannerGenerator.js');
            cardImage = await generatePostCardBanner(imageType || 'promo');
          }
          
          const uploadResult = await xApiService.uploadMedia(cardImage);
          if (uploadResult.success && uploadResult.mediaId) {
            mediaIds = [uploadResult.mediaId];
            console.log(`✅ Media uploaded: ${uploadResult.mediaId}`);
          }
        } catch (imgError: any) {
          console.error('Failed to generate/upload image:', imgError.message);
        }
      }
      
      const result = await xApiService.postTweet({ content, postType: 'quick_post', mediaIds });
      
      if (result.success) {
        res.json({
          success: true,
          tweetId: result.tweetId,
          message: 'Posted successfully',
          hasImage: mediaIds.length > 0,
        });
      } else {
        res.status(500).json({ error: result.error || 'Failed to post' });
      }
    } catch (error: any) {
      console.error("Quick post error:", error);
      res.status(500).json({ error: error.message || "Failed to post tweet" });
    }
  });
  
  // Generate card for preview
  app.get("/api/x/generate-card", async (req, res) => {
    try {
      const imageType = (req.query.type as string) || 'promo';
      console.log(`[generate-card] Generating type: ${imageType}`);
      
      const { generatePostCardBanner } = await import('./cardBannerGenerator.js');
      const cardImage = await generatePostCardBanner(imageType);
      
      console.log(`[generate-card] Generated ${imageType}, size: ${cardImage.length} bytes`);
      
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(cardImage);
    } catch (error: any) {
      console.error('Generate card error:', error);
      res.status(500).json({ error: error.message || 'Failed to generate card' });
    }
  });

  // Generate share card image for Twitter/X sharing
  app.get("/api/share/card", async (req, res) => {
    try {
      const solAmount = (req.query.sol as string) || '0.0000';
      const itemCount = parseInt(req.query.count as string) || 1;
      const claimType = (req.query.type as 'accounts' | 'tokens' | 'nfts') || 'accounts';
      
      const { generateShareCardStyle2 } = await import('./cardBannerGenerator.js');
      const cardImage = await generateShareCardStyle2({ solAmount, itemCount, claimType });
      
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(cardImage);
    } catch (error: any) {
      console.error('Generate share card error:', error);
      res.status(500).json({ error: error.message || 'Failed to generate share card' });
    }
  });
  
  // Post user claim to X with image - DISABLED
  app.post("/api/share/tweet", async (req, res) => {
    return res.status(403).json({ error: 'Posting to X is currently disabled' });
    try {
      const { txSignature, walletAddress, referralCode } = req.body;
      
      if (!txSignature || !walletAddress) {
        return res.status(400).json({ error: 'txSignature and walletAddress are required' });
      }

      // Verify the transaction exists in the ledger and belongs to this wallet
      const [ledgerRecord] = await db
        .select()
        .from(transactionLedger)
        .where(
          and(
            eq(transactionLedger.signature, txSignature),
            eq(transactionLedger.walletAddress, walletAddress)
          )
        )
        .limit(1);

      if (!ledgerRecord) {
        return res.status(403).json({ error: 'Transaction not found or does not belong to this wallet' });
      }

      if (ledgerRecord.postedToX) {
        return res.status(409).json({ error: 'This transaction has already been shared' });
      }

      const formattedSol = parseFloat(ledgerRecord.netAmount).toFixed(4);
      const count = ledgerRecord.itemsProcessed || 1;
      const type = (ledgerRecord.transactionType === 'token_burn' ? 'tokens' : ledgerRecord.transactionType === 'nft_burn' ? 'nfts' : 'accounts') as 'accounts' | 'tokens' | 'nfts';
      
      // Generate claim card image
      const { generateShareCardStyle2 } = await import('./cardBannerGenerator.js');
      const cardImage = await generateShareCardStyle2({ 
        solAmount: formattedSol, 
        itemCount: count, 
        claimType: type 
      });
      
      // Upload image to X
      const uploadResult = await xApiService.uploadMedia(cardImage);
      if (!uploadResult.success || !uploadResult.mediaId) {
        return res.status(500).json({ error: 'Failed to upload image to X' });
      }
      
      // Build tweet text
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : 'https://getfreesol.xyz';
      const shareUrl = referralCode 
        ? `${baseUrl}?ref=${referralCode}`
        : baseUrl;
      
      const shortWallet = walletAddress ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}` : 'A user';
      
      const tweetText = `${shortWallet} just reclaimed ${formattedSol} $SOL using @getfreesol_xyz\n\nReclaim your locked SOL 👇\n${shareUrl}`;
      
      // Post tweet with image
      const result = await xApiService.postTweet({
        content: tweetText,
        postType: 'user_claim',
        mediaIds: [uploadResult.mediaId]
      });
      
      if (result.success) {
        // Mark transaction as posted to X so it can't be re-posted
        await db
          .update(transactionLedger)
          .set({ postedToX: true, xPostId: result.tweetId || null })
          .where(eq(transactionLedger.signature, txSignature));

        res.json({ 
          success: true, 
          tweetId: result.tweetId,
          tweetUrl: `https://twitter.com/getfreesol_xyz/status/${result.tweetId}`
        });
      } else {
        res.status(500).json({ error: result.error || 'Failed to post tweet' });
      }
    } catch (error: any) {
      console.error('Share tweet error:', error);
      res.status(500).json({ error: error.message || 'Failed to post tweet' });
    }
  });
  
  // ============================================
  // X BOT SCHEDULED POSTING SYSTEM
  // ============================================
  
  async function generateDailyReportContent(): Promise<{ text: string; imageBuffer: Buffer | null }> {
    // Get total stats (since launch)
    const totalSolRecovered = await storage.getTotalSolRecovered();
    const totalAccountsClosed = await storage.getTotalAccountsClaimed();
    
    const solFormatted = totalSolRecovered.toFixed(2);
    const accountsFormatted = totalAccountsClosed >= 1000 
      ? `${(totalAccountsClosed / 1000).toFixed(1)}k` 
      : totalAccountsClosed.toString();
    
    const messages = [
      `Gn Solana fam 🌃\n\nHere is GetFreeSol Daily Report (since launch):\n\ni) ${solFormatted} SOL claimed\n\nii) ${accountsFormatted} accounts closed\n\niii) claim yours 👇\n\ngetfreesol.xyz\n\n#ClaimSOL #Solana #DeFi #GetFreeSol`,
      `📊 GetFreeSol Daily Report\n\n✅ ${solFormatted} SOL recovered\n✅ ${accountsFormatted} accounts closed\n\nReclaim your SOL rent 👇\ngetfreesol.xyz\n\n#ClaimSOL #Solana #DeFi #GetFreeSol`,
      `GM Solana! ☀️\n\nDaily stats update:\n\n💰 ${solFormatted} SOL claimed\n🗑️ ${accountsFormatted} empty accounts closed\n\nClaim yours: getfreesol.xyz\n\n#ClaimSOL #Solana #DeFi #GetFreeSol`,
    ];
    
    const text = messages[Math.floor(Math.random() * messages.length)];
    
    // Generate banner image (Style 4 - Two Column Card Layout)
    let imageBuffer: Buffer | null = null;
    try {
      const { generateDailyReportBanner } = await import('./cardBannerGenerator.js');
      imageBuffer = await generateDailyReportBanner({
        totalSolClaimed: totalSolRecovered.toString(),
        totalAccountsClosed,
        periodLabel: 'Since Launch',
        style: 4
      });
      console.log('📊 Generated daily report banner image (Style 4)');
    } catch (error) {
      console.error('Failed to generate daily report banner:', error);
    }
    
    return { text, imageBuffer };
  }
  
  function generatePromoContent(): string {
    const promos = [
      `Did you know? Solana stores rent deposits in every token account.\n\nIf you're not using an account, you can close it and get your SOL back! 💰\n\nCheck now: getyoursolback.app`,
      `🔓 Free up locked SOL from your empty token accounts\n\n✅ Safe & secure\n✅ No fees on reclaimed SOL\n✅ Works with all wallets\n\nStart now: getyoursolback.app`,
      `💡 Solana Tip: Every token account holds ~0.002 SOL in rent\n\nGot old tokens you don't use anymore? Close those accounts and reclaim your SOL!\n\ngetyoursolback.app`,
      `Thousands of Solana users have recovered their locked SOL 🚀\n\nDon't leave money on the table - check your wallet for empty accounts:\n\ngetyoursolback.app`,
      `Your Solana wallet might be holding more SOL than you think! 💎\n\nEmpty token accounts = locked rent deposits\n\nReclaim yours in seconds: getyoursolback.app`,
    ];
    
    return promos[Math.floor(Math.random() * promos.length)];
  }
  
  // Initialize scheduled jobs
  let scheduledJobsStarted = false;
  
  function startScheduledJobs() {
    if (scheduledJobsStarted) return;
    scheduledJobsStarted = true;
    
    console.log('🤖 Starting X bot scheduled jobs...');
    
    // GM Post - 8:00 AM UTC
    cron.schedule('0 8 * * *', async () => {
      try {
        const schedule = await db.select().from(xSchedules)
          .where(eq(xSchedules.scheduleType, 'gm'))
          .limit(1);
        
        if (schedule.length > 0 && schedule[0].isActive) {
          console.log('☀️ Posting GM tweet...');
          const gmMessages = [
            'GM Solana! ☀️\n\nReady to reclaim some SOL today?',
            'GM Solana fam! 🌅\n\nDon\'t forget to check for empty token accounts 👀',
            'GM! ☕️\n\nAnother day, another opportunity to free up locked SOL 💰',
            'GM Solana! 🚀\n\nLet\'s make today count - reclaim that SOL!',
          ];
          const content = gmMessages[Math.floor(Math.random() * gmMessages.length)];
          await xApiService.postTweet({ content, postType: 'gm' });
          await db.update(xSchedules)
            .set({ lastRun: new Date() })
            .where(eq(xSchedules.scheduleType, 'gm'));
        }
      } catch (error) {
        console.error('Failed to post GM tweet:', error);
      }
    });
    
    // GN Post - 22:00 (10 PM) UTC
    cron.schedule('0 22 * * *', async () => {
      try {
        const schedule = await db.select().from(xSchedules)
          .where(eq(xSchedules.scheduleType, 'gn'))
          .limit(1);
        
        if (schedule.length > 0 && schedule[0].isActive) {
          console.log('🌙 Posting GN tweet...');
          const gnMessages = [
            'GN Solana! 🌙\n\nSweet dreams and may your SOL be unl...I mean, well-secured! 😴',
            'GN fam! 🌃\n\nTomorrow is a new day to optimize your Solana wallet 💎',
            'GN Solana! ✨\n\nRest well, tomorrow we reclaim more SOL 🚀',
            'GN! 🌟\n\nWhile you sleep, your empty accounts are waiting to be closed 👀\n\nSee you tomorrow!',
          ];
          const content = gnMessages[Math.floor(Math.random() * gnMessages.length)];
          await xApiService.postTweet({ content, postType: 'gn' });
          await db.update(xSchedules)
            .set({ lastRun: new Date() })
            .where(eq(xSchedules.scheduleType, 'gn'));
        }
      } catch (error) {
        console.error('Failed to post GN tweet:', error);
      }
    });
    
    // Daily Report - 16:00 (4 PM) UTC
    cron.schedule('0 16 * * *', async () => {
      try {
        const schedule = await db.select().from(xSchedules)
          .where(eq(xSchedules.scheduleType, 'daily_report'))
          .limit(1);
        
        if (schedule.length > 0 && schedule[0].isActive) {
          console.log('📊 Posting daily report with banner...');
          const { text, imageBuffer } = await generateDailyReportContent();
          
          let mediaIds: string[] | undefined;
          if (imageBuffer) {
            const uploadResult = await xApiService.uploadMedia(imageBuffer);
            if (uploadResult.success && uploadResult.mediaId) {
              mediaIds = [uploadResult.mediaId];
              console.log('📸 Daily report banner uploaded successfully');
            }
          }
          
          await xApiService.postTweet({ content: text, postType: 'daily_report', mediaIds });
          await db.update(xSchedules)
            .set({ lastRun: new Date() })
            .where(eq(xSchedules.scheduleType, 'daily_report'));
          console.log('✅ Daily report posted with banner image');
        }
      } catch (error) {
        console.error('Failed to post daily report:', error);
      }
    });
    
    // Promotional Content - 12:00 PM and 18:00 (6 PM) UTC
    cron.schedule('0 12,18 * * *', async () => {
      try {
        const schedule = await db.select().from(xSchedules)
          .where(eq(xSchedules.scheduleType, 'promotional'))
          .limit(1);
        
        if (schedule.length > 0 && schedule[0].isActive) {
          console.log('📢 Posting promotional content...');
          const content = generatePromoContent();
          await xApiService.postTweet({ content, postType: 'promotional' });
          await db.update(xSchedules)
            .set({ lastRun: new Date() })
            .where(eq(xSchedules.scheduleType, 'promotional'));
        }
      } catch (error) {
        console.error('Failed to post promotional content:', error);
      }
    });
    
    console.log('✅ X bot scheduled jobs started');
  }
  
  // ============================================
  // X BOT ENGAGEMENT SYSTEM
  // ============================================
  
  // Search and engage with Solana content
  app.post("/api/x-bot/engage", requirePlatformWallet, async (req, res) => {
    try {
      const { query, maxResults } = req.body;
      
      const tweets = await xApiService.searchTweets({ query: query || 'Solana', maxResults: maxResults || 10 });
      
      res.json({
        success: true,
        tweets,
        message: `Found ${tweets.length} tweets`,
      });
    } catch (error: any) {
      console.error("Search tweets error:", error);
      res.status(500).json({ error: "Failed to search tweets", details: error.message });
    }
  });
  
  // Reply to a tweet
  app.post("/api/x-bot/reply", requirePlatformWallet, async (req, res) => {
    try {
      const { tweetId, content } = req.body;
      
      const result = await xApiService.replyToTweet(tweetId, content);
      
      if (result.success) {
        // Save engagement record
        await db.insert(xEngagement).values({
          sourceTweetId: tweetId,
          engagementType: 'reply',
          ourTweetId: result.replyTweetId,
          ourContent: content,
          status: 'completed',
          engagedAt: new Date(),
        });
        
        res.json({
          success: true,
          replyTweetId: result.replyTweetId,
          message: 'Reply posted successfully',
        });
      } else {
        res.status(500).json({ error: result.error });
      }
    } catch (error: any) {
      console.error("Reply to tweet error:", error);
      res.status(500).json({ error: "Failed to reply to tweet", details: error.message });
    }
  });
  
  // Generate AI meme image for funny posts
  app.post("/api/x-bot/generate-ai-meme", requirePlatformWallet, async (req, res) => {
    try {
      const { generateMemeFunnyImage } = await import('./aiMemeGenerator');
      
      console.log('🎨 Generating AI meme image...');
      const result = await generateMemeFunnyImage();
      
      if (result && result.imageBuffer) {
        res.set('Content-Type', 'image/png');
        res.send(result.imageBuffer);
      } else {
        res.status(500).json({ error: 'Failed to generate meme image' });
      }
    } catch (error: any) {
      console.error("AI meme generation error:", error);
      res.status(500).json({ error: "Failed to generate AI meme", details: error.message });
    }
  });
  
  // Post tweet with AI-generated meme image
  app.post("/api/x-bot/post-ai-meme", requirePlatformWallet, async (req, res) => {
    try {
      const { content } = req.body;
      
      if (!content) {
        return res.status(400).json({ error: 'Content is required' });
      }
      
      const { generateMemeFunnyImage } = await import('./aiMemeGenerator');
      
      console.log('🎨 Generating AI meme for post...');
      const memeResult = await generateMemeFunnyImage();
      
      if (!memeResult || !memeResult.imageBuffer) {
        return res.status(500).json({ error: 'Failed to generate meme image' });
      }
      
      console.log('📤 Posting tweet with AI meme...');
      const result = await xApiService.postTweetWithMedia(content, memeResult.imageBuffer);
      
      if (result.success) {
        await db.insert(xPosts).values({
          content,
          imageType: 'ai_meme',
          postType: 'ai_meme',
          status: 'posted',
          tweetId: result.tweetId,
          postedAt: new Date(),
        });
        
        res.json({
          success: true,
          tweetId: result.tweetId,
          message: 'AI meme posted successfully!',
          prompt: memeResult.prompt,
        });
      } else {
        res.status(500).json({ error: result.error });
      }
    } catch (error: any) {
      console.error("Post AI meme error:", error);
      res.status(500).json({ error: "Failed to post AI meme", details: error.message });
    }
  });
  
  // Auto-engagement cron job (runs every 2 hours)
  cron.schedule('0 */2 * * *', async () => {
    try {
      const authTokens = await db.select().from(xAuthTokens).where(eq(xAuthTokens.isActive, true)).limit(1);
      if (authTokens.length === 0) return;
      
      console.log('🤖 Running auto-engagement...');
      
      const searchQueries = [
        'Solana #NFT',
        'Solana rent deposits',
        'Solana token accounts',
        '#Solana development',
        'Solana DeFi',
      ];
      
      const query = searchQueries[Math.floor(Math.random() * searchQueries.length)];
      const tweets = await xApiService.searchTweets({ query, maxResults: 5 });
      
      for (const tweet of tweets.slice(0, 2)) { // Engage with max 2 tweets per run
        const replyMessages = [
          `Interesting! Did you know you can reclaim SOL from empty token accounts? 💰\n\nCheck it out: getyoursolback.app`,
          `Great point! Speaking of Solana, make sure you're not leaving SOL locked in empty accounts 👀\n\ngetyoursolback.app`,
          `Love the Solana community! 🚀\n\nBTW, if you have old token accounts you're not using, you might have SOL waiting to be reclaimed:\n\ngetyoursolback.app`,
        ];
        
        const content = replyMessages[Math.floor(Math.random() * replyMessages.length)];
        const result = await xApiService.replyToTweet(tweet.id, content);
        
        if (result.success) {
          await db.insert(xEngagement).values({
            sourceTweetId: tweet.id,
            sourceTweetAuthor: tweet.author_id,
            sourceTweetContent: tweet.text,
            engagementType: 'reply',
            ourTweetId: result.replyTweetId,
            ourContent: content,
            status: 'completed',
            engagedAt: new Date(),
          });
        }
        
        // Wait 30 seconds between replies to avoid spam detection
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    } catch (error) {
      console.error('Auto-engagement error:', error);
    }
  });
  
  // Start scheduled jobs
  // Jobs will only run if X credentials are configured in database
  startScheduledJobs();

  // ===== Developer Fee Account Management =====
  // Import vanity address service
  const { generateRandomKeypair, generateVanityKeypair, encryptPrivateKey, decryptPrivateKey, keypairFromEncrypted } = await import('./vanityAddressService.js');
  
  // Create developer fee account (requires wallet signature)
  app.post("/api/developer/create-account", async (req, res) => {
    try {
      const { walletAddress, signature, message, projectName } = req.body;
      
      console.log('🏗️ Creating developer fee account...');
      console.log('  Wallet:', walletAddress);
      console.log('  Project:', projectName);
      
      // Validate required fields
      if (!walletAddress || !signature || !message || !projectName) {
        return res.status(400).json({ 
          error: 'Missing required fields: walletAddress, signature, message, projectName' 
        });
      }
      
      // Verify signature
      if (!verifySignature(message, signature, walletAddress)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
      
      // Check if developer already has an account
      const existingDeveloper = await storage.getDeveloperByPayoutWallet(walletAddress);
      if (existingDeveloper) {
        // Get the fee account for this developer
        const feeAccounts = await storage.getFeeAccountsByDeveloperId(existingDeveloper.id);
        const feeAccount = feeAccounts[0];
        
        return res.status(400).json({ 
          error: 'Developer account already exists for this wallet',
          existingAccount: {
            feeAccount: feeAccount?.publicKey || 'none',
            projectName: existingDeveloper.projectName
          }
        });
      }
      
      // Generate random fee collection account with WSOL ATA (instant)
      console.log('  Generating random fee account with WSOL ATA...');
      const result = generateRandomKeypair();
      const feeKeypair = result.keypair;
      const wsolAta = result.wsolAta;
      console.log(`  ✅ Generated random fee account: ${result.publicKey}`);
      console.log(`  ✅ WSOL ATA address: ${wsolAta}`);
      
      // Encrypt the fee account private key
      const encryptedPrivateKey = encryptPrivateKey(feeKeypair.secretKey);
      const feeAccountPublicKey = feeKeypair.publicKey.toBase58();
      
      // Create developer record
      const developer = await storage.createDeveloper({
        payoutWalletAddress: walletAddress,
        projectName,
        vanityPrefix: null,
        status: 'active',
      });
      
      // Create fee account record
      const feeAccount = await storage.createFeeAccount({
        developerId: developer.id,
        publicKey: feeAccountPublicKey,
        encryptedPrivateKey,
        wsolAta: wsolAta,
        generationType: 'random',
        vanityPrefix: null,
      });
      
      // Initialize balance record
      await storage.createFeeBalance({
        developerId: developer.id,
        feeAccountId: feeAccount.id,
      });
      
      console.log('✅ Developer fee account created successfully');
      
      res.json({
        success: true,
        developer: {
          id: developer.id,
          walletAddress: developer.payoutWalletAddress,
          projectName: developer.projectName,
          feeAccountAddress: feeAccount.publicKey,
          wsolAtaAddress: feeAccount.wsolAta,
          feePercentage: parseFloat(developer.feePercentage),
          status: developer.status,
          createdAt: developer.createdAt,
        },
        message: 'Developer account created successfully with WSOL fee collection address'
      });
    } catch (error: any) {
      console.error('❌ Create developer account error:', error);
      res.status(500).json({ 
        error: 'Failed to create developer account', 
        details: error.message 
      });
    }
  });
  
  // Get developer account info and balance
  app.get("/api/developer/account/:walletAddress", async (req, res) => {
    try {
      const { walletAddress } = req.params;
      
      const developer = await storage.getDeveloperByPayoutWallet(walletAddress);
      if (!developer) {
        return res.json({ 
          exists: false,
          message: 'No developer account found for this wallet'
        });
      }
      
      const balance = await storage.getFeeBalanceByDeveloperId(developer.id);
      const feeAccounts = await storage.getFeeAccountsByDeveloperId(developer.id);
      const feeAccount = feeAccounts[0];
      
      res.json({
        exists: true,
        developer: {
          id: developer.id,
          walletAddress: developer.payoutWalletAddress,
          projectName: developer.projectName,
          feeAccountAddress: feeAccount?.publicKey || 'none',
          feePercentage: parseFloat(developer.feePercentage),
          vanityPrefix: developer.vanityPrefix,
          status: developer.status,
          createdAt: developer.createdAt,
          updatedAt: developer.updatedAt,
        },
        balance: balance ? {
          unclaimedLamports: parseFloat(balance.unclaimedLamports),
          unclaimedUsd: parseFloat(balance.unclaimedUsd),
          lastUsdUpdate: balance.lastUsdUpdate,
        } : {
          unclaimedLamports: 0,
          unclaimedUsd: 0,
          lastUsdUpdate: null,
        }
      });
    } catch (error: any) {
      console.error('Get developer account error:', error);
      res.status(500).json({ 
        error: 'Failed to get developer account', 
        details: error.message 
      });
    }
  });
  
  // Set developer fee percentage
  app.post("/api/developer/set-fee", async (req, res) => {
    try {
      const { walletAddress, signature, message, feePercentage } = req.body;
      
      // Validate required fields
      if (!walletAddress || !signature || !message || feePercentage === undefined) {
        return res.status(400).json({ 
          error: 'Missing required fields: walletAddress, signature, message, feePercentage' 
        });
      }
      
      // Verify signature
      if (!verifySignature(message, signature, walletAddress)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
      
      // Validate fee percentage (minimum 4%, maximum 10%)
      const feeNum = parseFloat(feePercentage);
      if (isNaN(feeNum) || feeNum < 4 || feeNum > 10) {
        return res.status(400).json({ 
          error: 'Fee percentage must be between 4% and 10%. Minimum 4% fee is required.' 
        });
      }
      
      // Get developer account
      const developer = await storage.getDeveloperByPayoutWallet(walletAddress);
      if (!developer) {
        return res.status(404).json({ error: 'Developer account not found' });
      }
      
      // Update fee percentage
      await storage.updateDeveloper(developer.id, { feePercentage: feeNum.toString() });
      
      console.log(`✅ Developer ${walletAddress} set fee to ${feeNum}%`);
      
      res.json({
        success: true,
        feePercentage: feeNum,
        message: `Fee percentage updated to ${feeNum}%`
      });
    } catch (error: any) {
      console.error('Set developer fee error:', error);
      res.status(500).json({ 
        error: 'Failed to set fee percentage', 
        details: error.message 
      });
    }
  });
  
  // Get developer transaction history
  app.get("/api/developer/transactions/:walletAddress", async (req, res) => {
    try {
      const { walletAddress } = req.params;
      const { limit = '50' } = req.query;
      
      const developer = await storage.getDeveloperByPayoutWallet(walletAddress);
      if (!developer) {
        return res.json({ transactions: [] });
      }
      
      const transactions = await storage.getFeeTransactionsByDeveloperId(
        developer.id, 
        parseInt(limit as string, 10)
      );
      
      res.json({
        success: true,
        transactions
      });
    } catch (error: any) {
      console.error('Get developer transactions error:', error);
      res.status(500).json({ 
        error: 'Failed to get transactions', 
        details: error.message 
      });
    }
  });
  
  // Claim developer earnings (80/20 split)
  app.post("/api/developer/claim", async (req, res) => {
    try {
      const { walletAddress, signature, message } = req.body;
      
      // Validate required fields
      if (!walletAddress || !signature || !message) {
        return res.status(400).json({ 
          error: 'Missing required fields: walletAddress, signature, message' 
        });
      }
      
      // Verify signature
      if (!verifySignature(message, signature, walletAddress)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
      
      // Get developer account
      const developer = await storage.getDeveloperByPayoutWallet(walletAddress);
      if (!developer) {
        return res.status(404).json({ error: 'Developer account not found' });
      }
      
      // Get fee accounts
      const feeAccounts = await storage.getFeeAccountsByDeveloperId(developer.id);
      const feeAccount = feeAccounts[0];
      
      if (!feeAccount) {
        return res.status(404).json({ error: 'Fee account not found' });
      }
      
      // Get current balance
      const balance = await storage.getFeeBalanceByDeveloperId(developer.id);
      const unclaimedLamports = balance ? parseFloat(balance.unclaimedLamports) : 0;
      
      if (unclaimedLamports === 0) {
        return res.status(400).json({ 
          error: 'No pending balance to claim',
          unclaimed: 0
        });
      }
      
      // Calculate split (80% to developer, 20% to platform)
      const developerAmount = Math.floor(unclaimedLamports * 0.8);
      const platformAmount = unclaimedLamports - developerAmount;
      
      console.log(`💰 Processing claim for ${walletAddress}`);
      console.log(`  Unclaimed: ${unclaimedLamports} lamports`);
      console.log(`  Developer (80%): ${developerAmount} lamports`);
      console.log(`  Platform (20%): ${platformAmount} lamports`);
      
      // Reconstruct fee account keypair
      const { keypairFromEncrypted, WSOL_MINT } = await import('./vanityAddressService.js');
      const feeKeypair = keypairFromEncrypted(feeAccount.encryptedPrivateKey);
      
      // Platform wallet
      const platformWallet = new PublicKey('GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT');
      const developerWallet = new PublicKey(walletAddress);
      
      const connection = getHeliusConnection();
      
      const transaction = new Transaction();
      
      // Get the fee account's WSOL ATA (source)
      const feeAccountWsolAta = new PublicKey(feeAccount.wsolAta!);
      
      // Get or create developer's WSOL ATA
      const developerWsolAta = getAssociatedTokenAddressSync(
        WSOL_MINT,
        developerWallet,
        true
      );
      
      // Get or create platform's WSOL ATA
      const platformWsolAta = getAssociatedTokenAddressSync(
        WSOL_MINT,
        platformWallet,
        true
      );
      
      // Check if developer's WSOL ATA exists, create if not
      try {
        await getAccount(connection, developerWsolAta);
      } catch {
        console.log('  Creating developer WSOL ATA...');
        transaction.add(
          createAssociatedTokenAccountInstruction(
            feeKeypair.publicKey,
            developerWsolAta,
            developerWallet,
            WSOL_MINT
          )
        );
      }
      
      // Check if platform's WSOL ATA exists, create if not
      try {
        await getAccount(connection, platformWsolAta);
      } catch {
        console.log('  Creating platform WSOL ATA...');
        transaction.add(
          createAssociatedTokenAccountInstruction(
            feeKeypair.publicKey,
            platformWsolAta,
            platformWallet,
            WSOL_MINT
          )
        );
      }
      
      // Transfer WSOL to developer (80%)
      if (developerAmount > 0) {
        transaction.add(
          createTransferInstruction(
            feeAccountWsolAta,
            developerWsolAta,
            feeKeypair.publicKey,
            developerAmount,
            [],
            TOKEN_PROGRAM_ID
          )
        );
      }
      
      // Transfer WSOL to platform (20%)
      if (platformAmount > 0) {
        transaction.add(
          createTransferInstruction(
            feeAccountWsolAta,
            platformWsolAta,
            feeKeypair.publicKey,
            platformAmount,
            [],
            TOKEN_PROGRAM_ID
          )
        );
      }
      
      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = feeKeypair.publicKey;
      
      // Sign and send
      transaction.sign(feeKeypair);
      const txSignature = await connection.sendRawTransaction(transaction.serialize());
      await connection.confirmTransaction(txSignature, 'confirmed');
      
      console.log(`✅ Claim transaction sent: ${txSignature}`);
      
      // Update balance - reset unclaimed to 0
      await storage.updateFeeBalance(developer.id, {
        unclaimedLamports: '0',
      });
      
      // Update developer total claimed
      const newTotalClaimed = parseFloat(developer.totalClaimed) + developerAmount;
      await storage.updateDeveloper(developer.id, {
        totalClaimed: newTotalClaimed.toString()
      });
      
      // Record the claim
      await storage.createFeeClaim({
        developerId: developer.id,
        feeAccountId: feeAccount.id,
        claimSignature: txSignature,
        amountClaimed: unclaimedLamports.toString(),
        developerReceived: developerAmount.toString(),
        platformReceived: platformAmount.toString(),
      });
      
      res.json({
        success: true,
        signature: txSignature,
        developerAmount,
        platformAmount,
        totalClaimed: unclaimedLamports,
        message: 'Claim processed successfully'
      });
    } catch (error: any) {
      console.error('Claim earnings error:', error);
      res.status(500).json({ 
        error: 'Failed to process claim', 
        details: error.message 
      });
    }
  });

  // ============================================================================
  // PDA-based Referral System (Jupiter-style)
  // ============================================================================
  
  // Temporary storage for pending account creations (in-memory, expires after 10 min)
  const pendingAccounts = new Map<string, { pdaAddress: string, encryptedPrivateKey: string, projectName: string, createdAt: number }>();
  
  // Step 1: Prepare account - generates PDA without requiring signature
  app.post("/api/referral/prepare-account", async (req, res) => {
    try {
      const { walletAddress, projectName } = req.body;
      
      if (!walletAddress || !projectName) {
        return res.status(400).json({ error: 'Missing walletAddress or projectName' });
      }
      
      // Check if account already exists
      const existing = await storage.getReferralAccountByWallet(walletAddress);
      if (existing) {
        return res.status(400).json({ 
          error: 'Referral account already exists',
          pdaAddress: existing.referralPda
        });
      }
      
      // Check if there's already a pending account for this wallet
      const pendingKey = `${walletAddress}`;
      if (pendingAccounts.has(pendingKey)) {
        const pending = pendingAccounts.get(pendingKey)!;
        // Return existing pending PDA
        return res.json({ 
          success: true, 
          pdaAddress: pending.pdaAddress,
          message: 'Pending account found, complete the transaction to activate'
        });
      }
      
      // Generate new keypair for the referral account
      const { generateReferralKeypair } = await import('./pdaService.js');
      const { publicKey, encryptedPrivateKey } = generateReferralKeypair();
      
      // Store pending account (expires after 10 minutes)
      pendingAccounts.set(pendingKey, {
        pdaAddress: publicKey,
        encryptedPrivateKey,
        projectName: projectName.trim(),
        createdAt: Date.now()
      });
      
      // Clean up expired pending accounts (older than 10 minutes)
      const now = Date.now();
      for (const [key, value] of pendingAccounts.entries()) {
        if (now - value.createdAt > 10 * 60 * 1000) {
          pendingAccounts.delete(key);
        }
      }
      
      console.log(`📝 Prepared referral account for ${walletAddress}`);
      console.log(`   Pending PDA: ${publicKey}`);
      
      res.json({ 
        success: true, 
        pdaAddress: publicKey,
        message: 'Send 0.002 SOL to this address to activate your account'
      });
    } catch (error: any) {
      console.error('Prepare account error:', error);
      res.status(500).json({ error: 'Failed to prepare account', details: error.message });
    }
  });
  
  // Step 2: Confirm account - verifies tx and creates the account
  app.post("/api/referral/confirm-account", async (req, res) => {
    try {
      const { walletAddress, txSignature, projectName } = req.body;
      
      if (!walletAddress || !txSignature) {
        return res.status(400).json({ error: 'Missing walletAddress or txSignature' });
      }
      
      // Check if account already exists
      const existing = await storage.getReferralAccountByWallet(walletAddress);
      if (existing) {
        return res.json({ 
          success: true,
          account: {
            referralPda: existing.referralPda,
            projectName: existing.projectName,
            status: existing.status
          }
        });
      }
      
      // Get pending account
      const pendingKey = `${walletAddress}`;
      const pending = pendingAccounts.get(pendingKey);
      if (!pending) {
        return res.status(400).json({ error: 'No pending account found. Please start the account creation process again.' });
      }
      
      // Get project account
      const project = await storage.getProjectAccount();
      if (!project) {
        return res.status(500).json({ error: 'Platform not initialized' });
      }
      
      // Create the referral account
      const account = await storage.createReferralAccount({
        projectAccountId: project.id,
        developerWallet: walletAddress,
        referralPda: pending.pdaAddress,
        encryptedPrivateKey: pending.encryptedPrivateKey,
        bump: 0,
        projectName: pending.projectName || projectName || 'Unnamed Project',
        feePercentage: '0'
      });
      
      // Remove from pending
      pendingAccounts.delete(pendingKey);
      
      console.log(`✅ Confirmed referral account for ${walletAddress}`);
      console.log(`   Referral Wallet: ${pending.pdaAddress}`);
      console.log(`   Funding TX: ${txSignature}`);
      
      res.json({
        success: true,
        account: {
          id: account.id,
          referralPda: account.referralPda,
          projectName: account.projectName,
          feePercentage: account.feePercentage,
          status: account.status,
          createdAt: account.createdAt
        }
      });
    } catch (error: any) {
      console.error('Confirm account error:', error);
      res.status(500).json({ error: 'Failed to confirm account', details: error.message });
    }
  });
  
  // Create referral account (legacy - PDA-based, no keypairs)
  app.post("/api/referral/create-account", async (req, res) => {
    try {
      const { walletAddress, signature, message, projectName } = req.body;
      
      if (!walletAddress || !signature || !message) {
        return res.status(400).json({ 
          error: 'Missing required fields: walletAddress, signature, message' 
        });
      }
      
      // Verify signature
      if (!verifySignature(message, signature, walletAddress)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
      
      // Check if account already exists
      const existing = await storage.getReferralAccountByWallet(walletAddress);
      if (existing) {
        return res.status(400).json({ 
          error: 'Referral account already exists',
          account: {
            referralPda: existing.referralPda,
            projectName: existing.projectName,
            feePercentage: existing.feePercentage,
            status: existing.status
          }
        });
      }
      
      // Get project account
      const project = await storage.getProjectAccount();
      if (!project) {
        return res.status(500).json({ error: 'Platform not initialized' });
      }
      
      // Generate a new keypair for the referral account
      const { generateReferralKeypair } = await import('./pdaService.js');
      const { publicKey, encryptedPrivateKey } = generateReferralKeypair();
      
      // Create referral account
      const account = await storage.createReferralAccount({
        projectAccountId: project.id,
        developerWallet: walletAddress,
        referralPda: publicKey, // Now a regular wallet address, not a PDA
        encryptedPrivateKey, // Store encrypted private key
        bump: 0, // No longer used, but kept for schema compatibility
        projectName: projectName || 'Unnamed Project',
        feePercentage: '0' // Can be set later by admin
      });
      
      console.log(`✅ Created referral account for ${walletAddress}`);
      console.log(`   Referral Wallet: ${publicKey}`);
      
      res.json({
        success: true,
        account: {
          id: account.id,
          referralPda: account.referralPda,
          projectName: account.projectName,
          feePercentage: account.feePercentage,
          status: account.status,
          createdAt: account.createdAt
        }
      });
    } catch (error: any) {
      console.error('Create referral account error:', error);
      res.status(500).json({ 
        error: 'Failed to create referral account', 
        details: error.message 
      });
    }
  });
  
  // Create token account for a specific mint
  app.post("/api/referral/create-token-account", async (req, res) => {
    try {
      const { walletAddress, signature, message, tokenMint } = req.body;
      
      if (!walletAddress || !signature || !message || !tokenMint) {
        return res.status(400).json({ 
          error: 'Missing required fields: walletAddress, signature, message, tokenMint' 
        });
      }
      
      // Verify signature
      if (!verifySignature(message, signature, walletAddress)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
      
      // Get referral account
      const referralAccount = await storage.getReferralAccountByWallet(walletAddress);
      if (!referralAccount) {
        return res.status(404).json({ error: 'Referral account not found. Create one first.' });
      }
      
      // Check if token account already exists
      const existing = await storage.getTokenAccountByMint(referralAccount.id, tokenMint);
      if (existing) {
        return res.status(400).json({ 
          error: 'Token account already exists for this mint',
          tokenAccount: {
            tokenAccountAddress: existing.tokenAccountAddress,
            tokenMint: existing.tokenMint,
            unclaimedBalance: existing.unclaimedBalance
          }
        });
      }
      
      // Derive token account address (ATA)
      const { getTokenAccountAddress } = await import('./pdaService.js');
      const referralPDA = new PublicKey(referralAccount.referralPda);
      const mint = new PublicKey(tokenMint);
      const tokenAccountAddress = await getTokenAccountAddress(mint, referralPDA);
      
      // Create token account record
      const tokenAccount = await storage.createTokenAccount({
        referralAccountId: referralAccount.id,
        tokenMint,
        tokenAccountAddress: tokenAccountAddress.toBase58()
      });
      
      console.log(`✅ Created token account for ${walletAddress}`);
      console.log(`   Mint: ${tokenMint}`);
      console.log(`   Token Account: ${tokenAccountAddress.toBase58()}`);
      
      res.json({
        success: true,
        tokenAccount: {
          id: tokenAccount.id,
          tokenMint: tokenAccount.tokenMint,
          tokenAccountAddress: tokenAccount.tokenAccountAddress,
          unclaimedBalance: tokenAccount.unclaimedBalance,
          totalEarned: tokenAccount.totalEarned,
          totalClaimed: tokenAccount.totalClaimed
        }
      });
    } catch (error: any) {
      console.error('Create token account error:', error);
      res.status(500).json({ 
        error: 'Failed to create token account', 
        details: error.message 
      });
    }
  });
  
  // Get all token accounts for a developer
  app.get("/api/referral/token-accounts/:walletAddress", async (req, res) => {
    try {
      const { walletAddress } = req.params;
      
      const referralAccount = await storage.getReferralAccountByWallet(walletAddress);
      if (!referralAccount) {
        return res.json({ tokenAccounts: [] });
      }
      
      const tokenAccounts = await storage.getTokenAccountsByReferralId(referralAccount.id);
      
      res.json({
        success: true,
        referralAccount: {
          referralPda: referralAccount.referralPda,
          projectName: referralAccount.projectName,
          feePercentage: referralAccount.feePercentage
        },
        tokenAccounts
      });
    } catch (error: any) {
      console.error('Get token accounts error:', error);
      res.status(500).json({ 
        error: 'Failed to get token accounts', 
        details: error.message 
      });
    }
  });
  
  // Get referral account info
  app.get("/api/referral/account/:walletAddress", async (req, res) => {
    try {
      const { walletAddress } = req.params;
      
      const referralAccount = await storage.getReferralAccountByWallet(walletAddress);
      if (!referralAccount) {
        // Return 200 with success: false so frontend can handle gracefully
        return res.json({ success: false, account: null, tokenAccounts: [] });
      }
      
      const tokenAccounts = await storage.getTokenAccountsByReferralId(referralAccount.id);
      
      // Fetch SOL balance of the referral PDA
      let pdaBalance = 0;
      if (referralAccount.referralPda) {
        try {
          const heliusApiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
          const rpcUrl = getHeliusRpcUrl();
          const connection = getHeliusConnection();
          const pdaPubkey = new PublicKey(referralAccount.referralPda);
          const balance = await connection.getBalance(pdaPubkey);
          pdaBalance = balance / LAMPORTS_PER_SOL;
        } catch (balanceError) {
          console.error("Error fetching PDA balance:", balanceError);
        }
      }
      
      res.json({
        success: true,
        account: {
          id: referralAccount.id,
          referralPda: referralAccount.referralPda,
          projectName: referralAccount.projectName,
          feePercentage: referralAccount.feePercentage,
          status: referralAccount.status,
          createdAt: referralAccount.createdAt,
          pdaBalance
        },
        tokenAccounts
      });
    } catch (error: any) {
      console.error('Get referral account error:', error);
      res.status(500).json({ 
        error: 'Failed to get referral account', 
        details: error.message 
      });
    }
  });

  // Claim earnings from referral account
  app.post("/api/referral/claim", async (req, res) => {
    try {
      const { walletAddress } = req.body;
      
      if (!walletAddress) {
        return res.status(400).json({ error: 'Wallet address required' });
      }
      
      // Get referral account
      const referralAccount = await storage.getReferralAccountByWallet(walletAddress);
      if (!referralAccount) {
        return res.status(404).json({ error: 'Referral account not found' });
      }
      
      // Check if encrypted private key exists
      if (!referralAccount.encryptedPrivateKey) {
        return res.status(400).json({ 
          error: 'This referral account does not have a managed wallet. Please contact support.' 
        });
      }
      
      // Get fee collection wallet balance
      const heliusApiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
      const rpcUrl = getHeliusRpcUrl();
      const connection = getHeliusConnection();
      
      const feeWalletPubkey = new PublicKey(referralAccount.referralPda);
      const balance = await connection.getBalance(feeWalletPubkey);
      
      if (balance === 0) {
        return res.status(400).json({ error: 'No balance to claim' });
      }
      
      // Minimum claimable amount (0.0001 SOL)
      const MIN_CLAIM_AMOUNT = 100000; // 0.0001 SOL in lamports
      
      // Calculate claimable amount (leave rent exempt amount + transaction fee for TWO transfers)
      const minRent = await connection.getMinimumBalanceForRentExemption(0);
      const estimatedFee = 10000; // 0.00001 SOL for transaction fee (2 transfers)
      const transferAmount = balance - minRent - estimatedFee;
      
      if (transferAmount < MIN_CLAIM_AMOUNT) {
        return res.status(400).json({ 
          error: 'Minimum 0.0001 SOL required for claim',
          details: {
            balance: balance / 1e9,
            claimable: transferAmount / 1e9,
            minimum: MIN_CLAIM_AMOUNT / 1e9
          }
        });
      }
      
      // Calculate platform/developer splits (80% to developer, 20% to platform)
      const developerAmount = Math.floor(transferAmount * 0.8);
      const platformAmount = Math.floor(transferAmount * 0.2);
      
      // Decrypt private key and create keypair
      const { decryptPrivateKey } = await import('./pdaService.js');
      const secretKey = decryptPrivateKey(referralAccount.encryptedPrivateKey);
      const feeWalletKeypair = Keypair.fromSecretKey(secretKey);
      
      // Setup pubkeys
      const developerPubkey = new PublicKey(walletAddress);
      const platformPubkey = new PublicKey('GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT');
      
      console.log(`📤 Sending claim transaction for ${walletAddress}...`);
      console.log(`   Developer (80%): ${(developerAmount / 1e9).toFixed(9)} SOL`);
      console.log(`   Platform (20%): ${(platformAmount / 1e9).toFixed(9)} SOL`);
      
      // Retry logic for blockhash expiration
      let signature = '';
      let blockhash = '';
      let lastValidBlockHeight = 0;
      const maxRetries = 3;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // Get FRESH blockhash right before sending
          console.log(`🔄 Attempt ${attempt}/${maxRetries}: Fetching fresh blockhash...`);
          const blockhashData = await connection.getLatestBlockhash('confirmed');
          blockhash = blockhashData.blockhash;
          lastValidBlockHeight = blockhashData.lastValidBlockHeight;
          
          // Create transaction with fresh blockhash
          const transaction = new Transaction();
          transaction.recentBlockhash = blockhash;
          transaction.feePayer = feeWalletKeypair.publicKey;
          
          // Add transfer to developer (80%)
          transaction.add(
            SystemProgram.transfer({
              fromPubkey: feeWalletKeypair.publicKey,
              toPubkey: developerPubkey,
              lamports: developerAmount,
            })
          );
          
          // Add transfer to platform (20%)
          transaction.add(
            SystemProgram.transfer({
              fromPubkey: feeWalletKeypair.publicKey,
              toPubkey: platformPubkey,
              lamports: platformAmount,
            })
          );
          
          // Sign transaction with platform-managed key
          transaction.sign(feeWalletKeypair);
          
          // Send transaction immediately
          signature = await connection.sendRawTransaction(transaction.serialize(), {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
            maxRetries: 3
          });
          
          console.log(`✅ Transaction sent! Signature: ${signature}`);
          break; // Success, exit retry loop
          
        } catch (sendError: any) {
          console.error(`❌ Attempt ${attempt} failed:`, sendError.message);
          
          if (attempt === maxRetries) {
            throw sendError; // Throw on final attempt
          }
          
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      // Wait for confirmation
      console.log(`⏳ Waiting for confirmation...`);
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      }, 'confirmed');
      
      console.log(`✅ Claim successful! Signature: ${signature}`);
      
      // Convert to SOL for database
      const amountClaimed = transferAmount / 1e9;
      const developerReceived = developerAmount / 1e9;
      const platformReceived = platformAmount / 1e9;
      
      // Record claim in database
      await storage.createReferralClaim({
        referralAccountId: referralAccount.id,
        claimSignature: signature,
        amountClaimed: amountClaimed.toString(),
        developerReceived: developerReceived.toString(),
        platformReceived: platformReceived.toString(),
      });
      
      res.json({
        success: true,
        signature,
        amount: amountClaimed,
        amountSol: `${amountClaimed.toFixed(9)} SOL`,
        message: `Claim successful! ${amountClaimed.toFixed(6)} SOL has been transferred to your wallet.`,
        explorerUrl: `https://solscan.io/tx/${signature}`
      });
    } catch (error: any) {
      console.error('Claim error:', error);
      res.status(500).json({ 
        error: 'Failed to prepare claim transaction', 
        details: error.message 
      });
    }
  });

  // Admin endpoint: Migrate existing referral accounts to add encrypted keypairs
  app.post("/api/referral/admin/migrate-accounts", async (req, res) => {
    try {
      const { adminWallet, signature, message } = req.body;
      
      // Verify admin wallet
      const PLATFORM_ADMIN = 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT';
      if (adminWallet !== PLATFORM_ADMIN) {
        return res.status(403).json({ error: 'Unauthorized - admin only' });
      }
      
      // Verify signature
      if (!verifySignature(message, signature, adminWallet)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
      
      // Get all referral accounts without encrypted keys
      const { db } = await import('./db.js');
      const { referralAccounts } = await import('../shared/schema.js');
      const { sql } = await import('drizzle-orm');
      
      const accountsToMigrate = await db.select()
        .from(referralAccounts)
        .where(sql`${referralAccounts.encryptedPrivateKey} IS NULL`);
      
      if (accountsToMigrate.length === 0) {
        return res.json({
          success: true,
          message: 'No accounts need migration',
          migrated: 0
        });
      }
      
      console.log(`🔄 Migrating ${accountsToMigrate.length} referral accounts...`);
      
      const { generateReferralKeypair } = await import('./pdaService.js');
      const { eq } = await import('drizzle-orm');
      
      let migratedCount = 0;
      const results = [];
      
      for (const account of accountsToMigrate) {
        try {
          // Generate new keypair and encrypt
          const { publicKey, encryptedPrivateKey } = generateReferralKeypair();
          
          // Update the account
          await db.update(referralAccounts)
            .set({ 
              referralPda: publicKey, // Update to new wallet address
              encryptedPrivateKey 
            })
            .where(eq(referralAccounts.id, account.id));
          
          migratedCount++;
          results.push({
            developerId: account.id,
            oldAddress: account.referralPda,
            newAddress: publicKey,
            projectName: account.projectName
          });
          
          console.log(`  ✅ Migrated ${account.projectName || 'Unknown'}: ${publicKey}`);
        } catch (error: any) {
          console.error(`  ❌ Failed to migrate account ${account.id}:`, error.message);
          results.push({
            developerId: account.id,
            error: error.message,
            projectName: account.projectName
          });
        }
      }
      
      console.log(`✅ Migration complete: ${migratedCount}/${accountsToMigrate.length} accounts`);
      
      res.json({
        success: true,
        migrated: migratedCount,
        total: accountsToMigrate.length,
        results
      });
    } catch (error: any) {
      console.error('Migration error:', error);
      res.status(500).json({ 
        error: 'Migration failed', 
        details: error.message 
      });
    }
  });

  // ===== ALERT SYSTEM ROUTES =====

  // Get all alerts for a wallet
  app.get("/api/alerts/:walletAddress", async (req, res) => {
    try {
      const { walletAddress } = req.params;
      const { eq } = await import('drizzle-orm');
      const { alertConfigs } = await import('@shared/schema');
      
      const alerts = await db.select()
        .from(alertConfigs)
        .where(eq(alertConfigs.walletAddress, walletAddress));
      
      res.json({ success: true, alerts });
    } catch (error: any) {
      console.error('Error fetching alerts:', error);
      res.status(500).json({ error: 'Failed to fetch alerts' });
    }
  });

  // Create a new alert
  app.post("/api/alerts", async (req, res) => {
    try {
      const { walletAddress, alertType, enabled, conditions, notificationChannels } = req.body;
      const { alertConfigs } = await import('@shared/schema');
      
      const newAlert = await db.insert(alertConfigs).values({
        walletAddress,
        alertType,
        enabled,
        conditions: JSON.stringify(conditions),
        notificationChannels: JSON.stringify(notificationChannels),
      }).returning();
      
      res.json({ success: true, alert: newAlert[0] });
    } catch (error: any) {
      console.error('Error creating alert:', error);
      res.status(500).json({ error: 'Failed to create alert' });
    }
  });

  // Update an alert
  app.patch("/api/alerts/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { enabled, conditions, notificationChannels } = req.body;
      const { eq, sql } = await import('drizzle-orm');
      const { alertConfigs } = await import('@shared/schema');
      
      const updateData: any = { updatedAt: sql`CURRENT_TIMESTAMP` };
      if (enabled !== undefined) updateData.enabled = enabled;
      if (conditions) updateData.conditions = JSON.stringify(conditions);
      if (notificationChannels) updateData.notificationChannels = JSON.stringify(notificationChannels);
      
      const updatedAlert = await db.update(alertConfigs)
        .set(updateData)
        .where(eq(alertConfigs.id, id))
        .returning();
      
      res.json({ success: true, alert: updatedAlert[0] });
    } catch (error: any) {
      console.error('Error updating alert:', error);
      res.status(500).json({ error: 'Failed to update alert' });
    }
  });

  // Delete an alert
  app.delete("/api/alerts/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { eq } = await import('drizzle-orm');
      const { alertConfigs } = await import('@shared/schema');
      
      await db.delete(alertConfigs).where(eq(alertConfigs.id, id));
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting alert:', error);
      res.status(500).json({ error: 'Failed to delete alert' });
    }
  });

  // Get alert history
  app.get("/api/alerts/history/:walletAddress", async (req, res) => {
    try {
      const { walletAddress } = req.params;
      const { dismissed } = req.query;
      const { eq, and, desc } = await import('drizzle-orm');
      const { alertHistory } = await import('@shared/schema');
      
      let query = db.select().from(alertHistory).where(eq(alertHistory.walletAddress, walletAddress));
      
      if (dismissed === 'false') {
        query = db.select().from(alertHistory).where(
          and(
            eq(alertHistory.walletAddress, walletAddress),
            eq(alertHistory.dismissed, false)
          )
        );
      }
      
      const history = await query.orderBy(desc(alertHistory.triggeredAt)).limit(100);
      
      res.json({ success: true, history });
    } catch (error: any) {
      console.error('Error fetching alert history:', error);
      res.status(500).json({ error: 'Failed to fetch alert history' });
    }
  });

  // Dismiss an alert notification
  app.post("/api/alerts/history/:id/dismiss", async (req, res) => {
    try {
      const { id } = req.params;
      const { eq } = await import('drizzle-orm');
      const { alertHistory } = await import('@shared/schema');
      
      await db.update(alertHistory)
        .set({ dismissed: true })
        .where(eq(alertHistory.id, id));
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error dismissing alert:', error);
      res.status(500).json({ error: 'Failed to dismiss alert' });
    }
  });

  // Get notification preferences
  app.get("/api/alerts/preferences/:walletAddress", async (req, res) => {
    try {
      const { walletAddress } = req.params;
      const { eq } = await import('drizzle-orm');
      const { notificationPreferences } = await import('@shared/schema');
      
      const prefs = await db.select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.walletAddress, walletAddress))
        .limit(1);
      
      if (prefs.length === 0) {
        // Return default preferences
        res.json({
          success: true,
          preferences: {
            walletAddress,
            inAppEnabled: true,
            discordEnabled: false,
            pushEnabled: false,
          }
        });
      } else {
        res.json({ success: true, preferences: prefs[0] });
      }
    } catch (error: any) {
      console.error('Error fetching preferences:', error);
      res.status(500).json({ error: 'Failed to fetch preferences' });
    }
  });

  // Update notification preferences
  app.put("/api/alerts/preferences", async (req, res) => {
    try {
      const { walletAddress, inAppEnabled, discordWebhookUrl, discordEnabled, pushEnabled, pushSubscription } = req.body;
      const { eq, sql } = await import('drizzle-orm');
      const { notificationPreferences } = await import('@shared/schema');
      
      // Check if preferences exist
      const existing = await db.select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.walletAddress, walletAddress))
        .limit(1);
      
      let result;
      if (existing.length === 0) {
        // Create new preferences
        result = await db.insert(notificationPreferences).values({
          walletAddress,
          inAppEnabled: inAppEnabled ?? true,
          discordWebhookUrl,
          discordEnabled: discordEnabled ?? false,
          pushEnabled: pushEnabled ?? false,
          pushSubscription: pushSubscription ? JSON.stringify(pushSubscription) : null,
        }).returning();
      } else {
        // Update existing preferences
        const updateData: any = { updatedAt: sql`CURRENT_TIMESTAMP` };
        if (inAppEnabled !== undefined) updateData.inAppEnabled = inAppEnabled;
        if (discordWebhookUrl !== undefined) updateData.discordWebhookUrl = discordWebhookUrl;
        if (discordEnabled !== undefined) updateData.discordEnabled = discordEnabled;
        if (pushEnabled !== undefined) updateData.pushEnabled = pushEnabled;
        if (pushSubscription) updateData.pushSubscription = JSON.stringify(pushSubscription);
        
        result = await db.update(notificationPreferences)
          .set(updateData)
          .where(eq(notificationPreferences.walletAddress, walletAddress))
          .returning();
      }
      
      res.json({ success: true, preferences: result[0] });
    } catch (error: any) {
      console.error('Error updating preferences:', error);
      res.status(500).json({ error: 'Failed to update preferences' });
    }
  });

  // ============================================
  // Community Social Tasks API Routes
  // ============================================

  // Get all active social tasks
  app.get("/api/social-tasks", async (req, res) => {
    try {
      const { status = 'active', limit = '50' } = req.query;
      const tasks = await storage.getSocialTasks(status as string, parseInt(limit as string));
      res.json({ success: true, tasks });
    } catch (error: any) {
      console.error('Error fetching social tasks:', error);
      res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  });

  // Get tasks by creator wallet
  app.get("/api/social-tasks/creator/:walletAddress", async (req, res) => {
    try {
      const { walletAddress } = req.params;
      const tasks = await storage.getSocialTasksByCreator(walletAddress);
      res.json({ success: true, tasks });
    } catch (error: any) {
      console.error('Error fetching creator tasks:', error);
      res.status(500).json({ error: 'Failed to fetch creator tasks' });
    }
  });

  // Get single task by ID
  app.get("/api/social-tasks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const task = await storage.getSocialTaskById(id);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }
      res.json({ success: true, task });
    } catch (error: any) {
      console.error('Error fetching task:', error);
      res.status(500).json({ error: 'Failed to fetch task' });
    }
  });

  // Create a new social task (requires SOL deposit)
  app.post("/api/social-tasks", async (req, res) => {
    try {
      const { 
        creatorWallet, 
        platform, 
        taskType, 
        title, 
        description, 
        targetUrl, 
        targetHandle,
        rewardLamports,
        totalBudgetLamports,
        maxCompletions,
        depositTxSignature,
        expiresAt
      } = req.body;

      // Validate required fields
      if (!creatorWallet || !platform || !taskType || !title || !targetUrl || !rewardLamports || !totalBudgetLamports || !maxCompletions) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Verify the deposit transaction on Solana
      if (depositTxSignature) {
        try {
          const connection = getHeliusConnection();
          const txInfo = await connection.getTransaction(depositTxSignature, { 
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0 
          });
          
          if (!txInfo) {
            return res.status(400).json({ error: 'Deposit transaction not found' });
          }
          console.log(`Verified deposit tx: ${depositTxSignature}`);
        } catch (txError) {
          console.error('Error verifying deposit:', txError);
          // Continue anyway for now - can be made stricter later
        }
      }

      const task = await storage.createSocialTask({
        creatorWallet,
        platform,
        taskType,
        title,
        description,
        targetUrl,
        targetHandle,
        rewardLamports: rewardLamports.toString(),
        totalBudgetLamports: totalBudgetLamports.toString(),
        remainingBudgetLamports: totalBudgetLamports.toString(),
        maxCompletions,
        depositTxSignature,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined
      });

      res.json({ success: true, task });
    } catch (error: any) {
      console.error('Error creating social task:', error);
      res.status(500).json({ error: 'Failed to create task' });
    }
  });

  // Submit a task completion
  app.post("/api/social-tasks/:taskId/submit", async (req, res) => {
    try {
      const { taskId } = req.params;
      const { workerWallet, workerHandle, proofUrl } = req.body;

      if (!workerWallet) {
        return res.status(400).json({ error: 'Worker wallet is required' });
      }

      // Check if task exists and is active
      const task = await storage.getSocialTaskById(taskId);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }
      if (task.status !== 'active') {
        return res.status(400).json({ error: 'Task is not active' });
      }
      if (task.creatorWallet === workerWallet) {
        return res.status(400).json({ error: 'Cannot complete your own task' });
      }

      // Check if worker already submitted for this task
      const existingSubmission = await storage.getWorkerSubmissionForTask(taskId, workerWallet);
      if (existingSubmission) {
        return res.status(400).json({ error: 'You have already submitted for this task' });
      }

      // Check if task has remaining budget
      const remainingBudget = BigInt(task.remainingBudgetLamports);
      const rewardAmount = BigInt(task.rewardLamports);
      if (remainingBudget < rewardAmount) {
        return res.status(400).json({ error: 'Task budget exhausted' });
      }

      // Check if max completions reached
      if (task.completedCount >= task.maxCompletions) {
        return res.status(400).json({ error: 'Task max completions reached' });
      }

      // Create submission
      const submission = await storage.createSocialTaskSubmission({
        taskId,
        workerWallet,
        workerHandle,
        proofUrl,
        rewardLamports: task.rewardLamports
      });

      // Reserve budget (decrement remaining)
      await storage.decrementSocialTaskBudget(taskId, task.rewardLamports);

      res.json({ success: true, submission });
    } catch (error: any) {
      console.error('Error submitting task:', error);
      res.status(500).json({ error: 'Failed to submit task' });
    }
  });

  // Get submissions for a task (for task creator to review)
  app.get("/api/social-tasks/:taskId/submissions", async (req, res) => {
    try {
      const { taskId } = req.params;
      const submissions = await storage.getSocialTaskSubmissionsByTask(taskId);
      res.json({ success: true, submissions });
    } catch (error: any) {
      console.error('Error fetching submissions:', error);
      res.status(500).json({ error: 'Failed to fetch submissions' });
    }
  });

  // Get worker's submissions
  app.get("/api/social-tasks/worker/:walletAddress/submissions", async (req, res) => {
    try {
      const { walletAddress } = req.params;
      const submissions = await storage.getSocialTaskSubmissionsByWorker(walletAddress);
      res.json({ success: true, submissions });
    } catch (error: any) {
      console.error('Error fetching worker submissions:', error);
      res.status(500).json({ error: 'Failed to fetch submissions' });
    }
  });

  // Approve or reject a submission (task creator only)
  app.patch("/api/social-tasks/submissions/:submissionId", async (req, res) => {
    try {
      const { submissionId } = req.params;
      const { status, reviewerWallet, rejectionReason } = req.body;

      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const submission = await storage.getSocialTaskSubmissionById(submissionId);
      if (!submission) {
        return res.status(404).json({ error: 'Submission not found' });
      }

      // Verify reviewer is the task creator
      const task = await storage.getSocialTaskById(submission.taskId);
      if (!task || task.creatorWallet !== reviewerWallet) {
        return res.status(403).json({ error: 'Only task creator can review submissions' });
      }

      await storage.updateSocialTaskSubmissionStatus(submissionId, status, reviewerWallet, rejectionReason);

      // If approved, increment task completions
      if (status === 'approved') {
        await storage.incrementSocialTaskCompletions(submission.taskId);
        
        // Check if task should be marked complete
        const updatedTask = await storage.getSocialTaskById(submission.taskId);
        if (updatedTask && updatedTask.completedCount >= updatedTask.maxCompletions) {
          await storage.updateSocialTaskStatus(submission.taskId, 'completed');
        }
      } else if (status === 'rejected') {
        // Return budget if rejected
        await storage.decrementSocialTaskBudget(submission.taskId, `-${submission.rewardLamports}`);
      }

      res.json({ success: true, message: `Submission ${status}` });
    } catch (error: any) {
      console.error('Error reviewing submission:', error);
      res.status(500).json({ error: 'Failed to review submission' });
    }
  });

  // Claim reward for approved submission (returns transaction to sign)
  app.post("/api/social-tasks/submissions/:submissionId/claim", async (req, res) => {
    try {
      const { submissionId } = req.params;
      const { workerWallet } = req.body;

      const submission = await storage.getSocialTaskSubmissionById(submissionId);
      if (!submission) {
        return res.status(404).json({ error: 'Submission not found' });
      }
      if (submission.workerWallet !== workerWallet) {
        return res.status(403).json({ error: 'Not your submission' });
      }
      if (submission.status !== 'approved') {
        return res.status(400).json({ error: 'Submission not approved' });
      }

      const task = await storage.getSocialTaskById(submission.taskId);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // Build transaction to transfer SOL from creator to worker
      const connection = getHeliusConnection();
      const { Transaction, SystemProgram, PublicKey } = await import('@solana/web3.js');
      
      const rewardLamports = BigInt(submission.rewardLamports);
      const platformFee = rewardLamports * 5n / 100n; // 5% platform fee
      const workerReward = rewardLamports - platformFee;

      const transaction = new Transaction();
      
      // Add transfer from task creator to worker
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(task.creatorWallet),
          toPubkey: new PublicKey(workerWallet),
          lamports: workerReward
        })
      );

      // Add platform fee
      if (platformFee > 0n) {
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: new PublicKey(task.creatorWallet),
            toPubkey: new PublicKey('GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT'),
            lamports: platformFee
          })
        );
      }

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = new PublicKey(task.creatorWallet);

      const serializedTx = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false
      }).toString('base64');

      res.json({ 
        success: true, 
        transaction: serializedTx,
        rewardLamports: workerReward.toString(),
        platformFee: platformFee.toString()
      });
    } catch (error: any) {
      console.error('Error claiming reward:', error);
      res.status(500).json({ error: 'Failed to claim reward' });
    }
  });

  // Record successful payout
  app.post("/api/social-tasks/payouts", async (req, res) => {
    try {
      const { submissionId, workerWallet, taskId, txSignature, paidLamports } = req.body;

      // Mark submission as claimed
      await storage.updateSocialTaskSubmissionStatus(submissionId, 'claimed');

      // Record payout
      const payout = await storage.createSocialTaskPayout({
        submissionId,
        workerWallet,
        taskId,
        txSignature,
        paidLamports: paidLamports.toString()
      });

      res.json({ success: true, payout });
    } catch (error: any) {
      console.error('Error recording payout:', error);
      res.status(500).json({ error: 'Failed to record payout' });
    }
  });

  // Get worker's payouts history
  app.get("/api/social-tasks/payouts/:walletAddress", async (req, res) => {
    try {
      const { walletAddress } = req.params;
      const payouts = await storage.getSocialTaskPayoutsByWorker(walletAddress);
      res.json({ success: true, payouts });
    } catch (error: any) {
      console.error('Error fetching payouts:', error);
      res.status(500).json({ error: 'Failed to fetch payouts' });
    }
  });

  // ============================================
  // Giveaway System Routes
  // ============================================

  // Get active giveaway
  app.get("/api/giveaways/active", async (req, res) => {
    try {
      const giveaway = await storage.getActiveGiveaway();
      if (!giveaway) {
        return res.json({ success: true, giveaway: null });
      }
      const entryCount = await storage.getGiveawayEntryCount(giveaway.id);
      res.json({ success: true, giveaway, entryCount });
    } catch (error: any) {
      console.error('Error fetching active giveaway:', error);
      res.status(500).json({ error: 'Failed to fetch giveaway' });
    }
  });

  // Check if wallet is eligible and has already entered
  app.get("/api/giveaways/:id/check/:walletAddress", async (req, res) => {
    try {
      const { id, walletAddress } = req.params;
      const isEligible = await storage.isWalletEligibleForGiveaway(walletAddress);
      const existingEntry = await storage.getGiveawayEntryByWallet(id, walletAddress);
      res.json({ 
        success: true, 
        isEligible, 
        hasEntered: !!existingEntry,
        enteredAt: existingEntry?.enteredAt || null
      });
    } catch (error: any) {
      console.error('Error checking giveaway eligibility:', error);
      res.status(500).json({ error: 'Failed to check eligibility' });
    }
  });

  // Enter giveaway (requires wallet signature)
  app.post("/api/giveaways/:id/enter", async (req, res) => {
    try {
      const { id } = req.params;
      const { walletAddress, signature, message } = req.body;

      if (!walletAddress || !signature || !message) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Verify giveaway exists and is active
      const giveaway = await storage.getGiveawayById(id);
      if (!giveaway) {
        return res.status(404).json({ error: 'Giveaway not found' });
      }
      if (giveaway.status !== 'active') {
        return res.status(400).json({ error: 'Giveaway is not active' });
      }

      // Check if giveaway period is valid
      const now = new Date();
      if (now < giveaway.startAt || now > giveaway.endAt) {
        return res.status(400).json({ error: 'Giveaway period has ended or not started' });
      }

      // Verify wallet signature
      if (!verifySignature(message, signature, walletAddress)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Check eligibility (must have claimed SOL)
      const isEligible = await storage.isWalletEligibleForGiveaway(walletAddress);
      if (!isEligible) {
        return res.status(403).json({ error: 'You must claim SOL at least once to enter the giveaway' });
      }

      // Check if already entered
      const existingEntry = await storage.getGiveawayEntryByWallet(id, walletAddress);
      if (existingEntry) {
        return res.status(400).json({ error: 'You have already entered this giveaway' });
      }

      // Create entry
      const entry = await storage.createGiveawayEntry({
        giveawayId: id,
        walletAddress
      });

      res.json({ success: true, entry });
    } catch (error: any) {
      console.error('Error entering giveaway:', error);
      res.status(500).json({ error: 'Failed to enter giveaway' });
    }
  });

  // Get giveaway winners
  app.get("/api/giveaways/:id/winners", async (req, res) => {
    try {
      const { id } = req.params;
      const winners = await storage.getGiveawayWinners(id);
      res.json({ success: true, winners });
    } catch (error: any) {
      console.error('Error fetching winners:', error);
      res.status(500).json({ error: 'Failed to fetch winners' });
    }
  });

  // Admin: Create giveaway
  app.post("/api/giveaways", async (req, res) => {
    try {
      const { title, description, totalPrizeUsd, prizePerWinnerUsd, totalWinners, startAt, endAt } = req.body;

      const giveaway = await storage.createGiveaway({
        title,
        description,
        totalPrizeUsd: totalPrizeUsd.toString(),
        prizePerWinnerUsd: prizePerWinnerUsd.toString(),
        totalWinners,
        startAt: new Date(startAt),
        endAt: new Date(endAt)
      });

      // Auto-activate if start time is now or in past
      if (new Date(startAt) <= new Date()) {
        await storage.updateGiveawayStatus(giveaway.id, 'active');
        giveaway.status = 'active';
      }

      res.json({ success: true, giveaway });
    } catch (error: any) {
      console.error('Error creating giveaway:', error);
      res.status(500).json({ error: 'Failed to create giveaway' });
    }
  });

  // Admin: Activate giveaway
  app.post("/api/giveaways/:id/activate", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.updateGiveawayStatus(id, 'active');
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error activating giveaway:', error);
      res.status(500).json({ error: 'Failed to activate giveaway' });
    }
  });

  // Admin: Select winners (call when giveaway ends)
  app.post("/api/giveaways/:id/select-winners", async (req, res) => {
    try {
      const { id } = req.params;

      const giveaway = await storage.getGiveawayById(id);
      if (!giveaway) {
        return res.status(404).json({ error: 'Giveaway not found' });
      }

      // Get all entries
      const entries = await storage.getGiveawayEntries(id);
      if (entries.length === 0) {
        return res.status(400).json({ error: 'No entries to select from' });
      }

      // Filter entries to only include wallets that have claimed SOL rent on our website
      const eligibleEntries = [];
      for (const entry of entries) {
        const isEligible = await storage.isWalletEligibleForGiveaway(entry.walletAddress);
        if (isEligible) {
          eligibleEntries.push(entry);
        }
      }

      if (eligibleEntries.length === 0) {
        return res.status(400).json({ error: 'No eligible entries (users must have claimed SOL rent)' });
      }

      // Shuffle eligible entries using Fisher-Yates algorithm
      const shuffled = [...eligibleEntries];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      // Select winners (up to totalWinners or all eligible entries if less)
      const winnerCount = Math.min(giveaway.totalWinners, shuffled.length);
      const selectedWinners = shuffled.slice(0, winnerCount);

      // Create winner records
      const winners = [];
      for (const entry of selectedWinners) {
        const winner = await storage.createGiveawayWinner({
          giveawayId: id,
          walletAddress: entry.walletAddress,
          prizeUsd: giveaway.prizePerWinnerUsd
        });
        winners.push(winner);
      }

      // Update giveaway status
      await storage.updateGiveawayStatus(id, 'completed');

      res.json({ success: true, winners, totalEntries: entries.length });
    } catch (error: any) {
      console.error('Error selecting winners:', error);
      res.status(500).json({ error: 'Failed to select winners' });
    }
  });

  // Get all giveaways (for admin)
  app.get("/api/giveaways", async (req, res) => {
    try {
      const giveaways = await storage.getAllGiveaways();
      res.json({ success: true, giveaways });
    } catch (error: any) {
      console.error('Error fetching giveaways:', error);
      res.status(500).json({ error: 'Failed to fetch giveaways' });
    }
  });

  // ============ COIN FLIP GAME ============

  const { getVaultKeypair, getVaultAddress, getVaultBalance, getVaultPrivateKey, withdrawFromVault } = await import('./coinflipVault');

  app.get("/api/coinflip/vault", async (_req, res) => {
    try {
      const vaultPrivKey = process.env.COINFLIP_VAULT_KEY || process.env.RELAYER_PRIVATE_KEY || '';
      const feesWallet = process.env.FEES_WALLET || 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT';
      const kp = Keypair.fromSecretKey(bs58.decode(vaultPrivKey));
      const address = kp.publicKey.toBase58();
      const conn = getHeliusConnection('confirmed');
      const bal = await conn.getBalance(kp.publicKey);
      const balance = bal / LAMPORTS_PER_SOL;
      res.json({ success: true, address, balance, feesWallet });
    } catch (error: any) {
      console.error('Error fetching vault info:', error);
      res.status(500).json({ error: 'Failed to fetch vault info' });
    }
  });

  app.post("/api/coinflip/vault/verify", async (req, res) => {
    try {
      const { adminSecret } = req.body;
      const expectedSecret = process.env.VAULT_ADMIN_SECRET;
      if (!expectedSecret) {
        return res.status(503).json({ error: 'Vault admin secret not configured' });
      }
      if (!adminSecret || adminSecret !== expectedSecret) {
        return res.status(403).json({ error: 'Invalid admin secret' });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Verification failed' });
    }
  });

  app.post("/api/coinflip/vault/export-key", async (req, res) => {
    try {
      const { adminSecret } = req.body;
      const expectedSecret = process.env.VAULT_ADMIN_SECRET;
      if (!expectedSecret) {
        return res.status(503).json({ error: 'Vault admin secret not configured. Set VAULT_ADMIN_SECRET in environment.' });
      }
      if (!adminSecret || adminSecret !== expectedSecret) {
        return res.status(403).json({ error: 'Invalid admin secret' });
      }
      const privateKey = getVaultPrivateKey();
      const address = getVaultAddress();
      res.json({ success: true, address, privateKey });
    } catch (error: any) {
      console.error('Error exporting vault key:', error);
      res.status(500).json({ error: 'Failed to export vault key' });
    }
  });

  app.post("/api/coinflip/vault/withdraw", async (req, res) => {
    try {
      const { adminSecret, destinationAddress, amount } = req.body;
      const expectedSecret = process.env.VAULT_ADMIN_SECRET;
      if (!expectedSecret) {
        return res.status(503).json({ error: 'Vault admin secret not configured. Set VAULT_ADMIN_SECRET in environment.' });
      }
      if (!adminSecret || adminSecret !== expectedSecret) {
        return res.status(403).json({ error: 'Invalid admin secret' });
      }
      if (!destinationAddress || !amount) {
        return res.status(400).json({ error: 'Missing destinationAddress or amount' });
      }
      const amountSOL = parseFloat(amount);
      if (isNaN(amountSOL) || amountSOL <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
      }
      const signature = await withdrawFromVault(destinationAddress, amountSOL);
      const balance = await getVaultBalance();
      res.json({ success: true, signature, remainingBalance: balance });
    } catch (error: any) {
      console.error('Error withdrawing from vault:', error);
      res.status(500).json({ error: error.message || 'Failed to withdraw from vault' });
    }
  });

  // Activity Bot routes
  app.get("/api/admin/activity-bot/status", async (req, res) => {
    const { adminSecret } = req.query as { adminSecret?: string };
    const expectedSecret = process.env.VAULT_ADMIN_SECRET;
    if (!expectedSecret || adminSecret !== expectedSecret) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    res.json(getActivityBotStatus());
  });

  app.post("/api/admin/activity-bot/start", async (req, res) => {
    const { adminSecret, walletCount, solPerWallet, intervalSeconds, tokensPerCycle } = req.body;
    const expectedSecret = process.env.VAULT_ADMIN_SECRET;
    if (!expectedSecret || adminSecret !== expectedSecret) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const result = await startActivityBot(
      parseInt(walletCount) || 5,
      parseFloat(solPerWallet) || 0.02,
      parseInt(intervalSeconds) || 60,
      parseInt(tokensPerCycle) || 20
    );
    res.json(result);
  });

  app.post("/api/admin/activity-bot/stop", async (req, res) => {
    const { adminSecret } = req.body;
    const expectedSecret = process.env.VAULT_ADMIN_SECRET;
    if (!expectedSecret || adminSecret !== expectedSecret) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const result = await stopActivityBot();
    res.json(result);
  });

  app.get("/api/admin/activity-bot/wallet", async (req, res) => {
    const { adminSecret } = req.query as { adminSecret?: string };
    const expectedSecret = process.env.VAULT_ADMIN_SECRET;
    if (!expectedSecret || adminSecret !== expectedSecret) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    try {
      const address = '4YhdLvaRZxHgEFGpN9Jq5duMQtAx4qXTCZTAAdCiKVxR';
      const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
      const rpcRes = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address] }),
      });
      const rpcData = await rpcRes.json();
      const lamports = rpcData?.result?.value ?? 0;
      const balance = lamports / 1e9;
      console.log(`[BotWallet] address=${address} lamports=${lamports} balance=${balance}`);
      res.json({ success: true, address, balance });
    } catch (e: any) {
      console.error('[BotWallet] error:', e?.message);
      res.status(500).json({ error: e?.message || 'Failed to load bot wallet' });
    }
  });

  // ── User Feedback ────────────────────────────────────────────────────────

  app.post("/api/feedback", async (req, res) => {
    try {
      const parsed = insertFeedbackSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid feedback data' });
      await db.insert(feedback).values(parsed.data);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to save feedback' });
    }
  });

  app.get("/api/admin/feedback", async (req, res) => {
    const { adminSecret } = req.query as { adminSecret?: string };
    if (!process.env.VAULT_ADMIN_SECRET || adminSecret !== process.env.VAULT_ADMIN_SECRET) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    try {
      const { desc: descFn } = await import('drizzle-orm');
      const rows = await db.select().from(feedback).orderBy(descFn(feedback.createdAt)).limit(100);
      res.json({ success: true, feedback: rows });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to fetch feedback' });
    }
  });

  // ── GFS Token Distribution ───────────────────────────────────────────────

  app.get("/api/admin/gfs-distribution/holders", async (req, res) => {
    const { adminSecret } = req.query as { adminSecret?: string };
    if (!process.env.VAULT_ADMIN_SECRET || adminSecret !== process.env.VAULT_ADMIN_SECRET)
      return res.status(403).json({ error: 'Unauthorized' });
    try {
      const heliusKey = process.env.HELIUS_API_KEY;
      const GFS_DECIMALS = 6;
      const THRESHOLD = 1_000_000;
      const holders: Array<{ wallet: string; balance: number }> = [];
      let cursor: string | null = null;
      do {
        const body: any = { jsonrpc: '2.0', id: '1', method: 'getTokenAccounts', params: { mint: GFS_MINT, limit: 1000, displayOptions: {} } };
        if (cursor) body.params.cursor = cursor;
        const r = await fetch(`https://mainnet.helius-rpc.com/?api-key=${heliusKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await r.json();
        const accounts: any[] = data.result?.token_accounts || [];
        for (const acct of accounts) {
          const uiAmount = acct.amount / Math.pow(10, GFS_DECIMALS);
          if (uiAmount >= THRESHOLD) holders.push({ wallet: acct.owner, balance: uiAmount });
        }
        cursor = accounts.length === 1000 ? (data.result?.cursor || null) : null;
      } while (cursor);
      res.json({ success: true, holders, count: holders.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/gfs-distribution/distribute", async (req, res) => {
    const { adminSecret, totalTokens } = req.body;
    if (!process.env.VAULT_ADMIN_SECRET || adminSecret !== process.env.VAULT_ADMIN_SECRET)
      return res.status(403).json({ error: 'Unauthorized' });
    try {
      const { Connection, Keypair, PublicKey, Transaction } = await import('@solana/web3.js');
      const { getAssociatedTokenAddressSync, createTransferInstruction, TOKEN_PROGRAM_ID } = await import('@solana/spl-token');
      const connection = getHeliusConnection('confirmed');
      const relayerKey = process.env.RELAYER_PRIVATE_KEY;
      if (!relayerKey) return res.status(500).json({ error: 'RELAYER_PRIVATE_KEY not set' });
      const senderKeypair = Keypair.fromSecretKey(bs58.decode(relayerKey));
      const GFS_DECIMALS = 6;
      const THRESHOLD = 1_000_000;
      const BATCH_SIZE = 10;

      // Fetch holders
      const holders: Array<{ wallet: string; balance: number }> = [];
      let cursor: string | null = null;
      do {
        const body: any = { jsonrpc: '2.0', id: '1', method: 'getTokenAccounts', params: { mint: GFS_MINT, limit: 1000, displayOptions: {} } };
        if (cursor) body.params.cursor = cursor;
        const r = await fetch(`https://mainnet.helius-rpc.com/?api-key=${heliusKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await r.json();
        const accounts: any[] = data.result?.token_accounts || [];
        for (const acct of accounts) {
          if (acct.owner === senderKeypair.publicKey.toBase58()) continue; // skip self
          const uiAmount = acct.amount / Math.pow(10, GFS_DECIMALS);
          if (uiAmount >= THRESHOLD) holders.push({ wallet: acct.owner, balance: uiAmount });
        }
        cursor = accounts.length === 1000 ? (data.result?.cursor || null) : null;
      } while (cursor);

      if (holders.length === 0) return res.status(400).json({ error: 'No eligible holders found' });

      const perHolderTokens = totalTokens / holders.length;
      const perHolderRaw = Math.floor(perHolderTokens * Math.pow(10, GFS_DECIMALS));
      if (perHolderRaw < 1) return res.status(400).json({ error: 'Amount too small to distribute' });

      const senderAta = getAssociatedTokenAddressSync(new PublicKey(GFS_MINT), senderKeypair.publicKey);
      const signatures: string[] = [];
      const errors: string[] = [];

      // Process in batches
      for (let i = 0; i < holders.length; i += BATCH_SIZE) {
        const batch = holders.slice(i, i + BATCH_SIZE);
        try {
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
          const tx = new Transaction();
          tx.recentBlockhash = blockhash;
          tx.feePayer = senderKeypair.publicKey;
          for (const holder of batch) {
            const recipientAta = getAssociatedTokenAddressSync(new PublicKey(GFS_MINT), new PublicKey(holder.wallet));
            tx.add(createTransferInstruction(senderAta, recipientAta, senderKeypair.publicKey, perHolderRaw, [], TOKEN_PROGRAM_ID));
          }
          tx.sign(senderKeypair);
          const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
          await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
          signatures.push(sig);
          console.log(`[GFS Dist] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} holders → ${sig.slice(0, 20)}…`);
        } catch (e: any) {
          errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${e.message?.slice(0, 80)}`);
          console.error(`[GFS Dist] Batch error:`, e.message);
        }
        if (i + BATCH_SIZE < holders.length) await new Promise(r => setTimeout(r, 1000));
      }

      res.json({ success: true, totalHolders: holders.length, perHolderTokens, signatures, errors });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/coinflip/play", async (req, res) => {
    try {
      const { walletAddress, betAmount, choice, betTxSignature } = req.body;

      if (!walletAddress || !betAmount || !choice || !betTxSignature) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (!['heads', 'tails'].includes(choice)) {
        return res.status(400).json({ error: 'Choice must be heads or tails' });
      }

      const bet = parseFloat(betAmount);
      if (isNaN(bet) || bet < 0.001 || bet > 5) {
        return res.status(400).json({ error: 'Bet must be between 0.001 and 5 SOL' });
      }

      const { coinFlips } = await import('@shared/schema');
      const existingFlip = await db.select().from(coinFlips).where(eq(coinFlips.betTxSignature, betTxSignature)).limit(1);
      if (existingFlip.length > 0) {
        return res.json({
          success: true,
          result: existingFlip[0].result,
          won: existingFlip[0].won,
          betAmount: parseFloat(existingFlip[0].betAmount),
          payoutAmount: existingFlip[0].payoutAmount ? parseFloat(existingFlip[0].payoutAmount) : 0,
          platformFee: existingFlip[0].platformFee ? parseFloat(existingFlip[0].platformFee) : 0,
          payoutTxSignature: existingFlip[0].payoutTxSignature,
          replay: true,
        });
      }

      const PLATFORM_FEE_RATE = 0.035;
      const VAULT_ADDRESS = getVaultAddress();
      const rpcUrl = getHeliusRpcUrl();
      const connection = getHeliusConnection();

      let txInfo: any = null;
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          txInfo = await connection.getTransaction(betTxSignature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
          });
          if (txInfo && !txInfo.meta?.err) {
            break;
          }
          txInfo = null;
        } catch (e) {}
        await new Promise(r => setTimeout(r, 500));
      }

      if (!txInfo) {
        return res.status(400).json({ error: 'Could not confirm bet transaction on-chain' });
      }

      const accountKeys = txInfo.transaction.message.staticAccountKeys
        ? txInfo.transaction.message.staticAccountKeys.map((k: any) => k.toBase58())
        : txInfo.transaction.message.accountKeys.map((k: any) => k.toBase58());

      const senderIndex = 0;
      const senderAddress = accountKeys[senderIndex];
      if (senderAddress !== walletAddress) {
        return res.status(400).json({ error: 'Transaction sender does not match wallet address' });
      }

      const preBalances = txInfo.meta.preBalances;
      const postBalances = txInfo.meta.postBalances;
      const FEES_WALLET_ADDRESS = process.env.FEES_WALLET ?? 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT';

      const vaultIndex = accountKeys.indexOf(VAULT_ADDRESS);
      if (vaultIndex === -1) {
        return res.status(400).json({ error: 'Transaction does not transfer to game vault' });
      }

      const feesWalletIndex = accountKeys.indexOf(FEES_WALLET_ADDRESS);

      // Vault must receive the full bet amount
      const vaultReceived = postBalances[vaultIndex] - preBalances[vaultIndex];
      const expectedBetLamports = Math.floor(bet * LAMPORTS_PER_SOL);
      if (vaultReceived < expectedBetLamports * 0.99) {
        return res.status(400).json({ error: 'Vault did not receive the correct bet amount' });
      }

      // Fees wallet must receive the 3.5% fee (if present in the tx)
      const expectedFeeLamports = Math.floor(bet * PLATFORM_FEE_RATE * LAMPORTS_PER_SOL);
      if (feesWalletIndex !== -1) {
        const feesReceived = postBalances[feesWalletIndex] - preBalances[feesWalletIndex];
        if (feesReceived < expectedFeeLamports * 0.99) {
          return res.status(400).json({ error: 'Fees wallet did not receive the correct 3.5% fee' });
        }
      } else {
        // Fallback: accept old-style single transfer where vault got bet + fee
        const totalReceived = vaultReceived;
        const expectedTotal = Math.floor(bet * (1 + PLATFORM_FEE_RATE) * LAMPORTS_PER_SOL);
        if (totalReceived < expectedTotal * 0.99) {
          return res.status(400).json({ error: 'Transaction amount does not match bet + fee' });
        }
      }

      const vaultKeypair = getVaultKeypair();
      const maxPossiblePayout = Math.floor(bet * 2 * LAMPORTS_PER_SOL); // Win = full 2x bet
      const recipientPubkey = new PublicKey(walletAddress);

      const heliusKey = process.env.HELIUS_API_KEY;
      const payoutRpcUrl = getHeliusRpcUrl();
      const payoutConnection = getHeliusConnection();

      const vaultBalance = await connection.getBalance(vaultKeypair.publicKey);
      if (vaultBalance < maxPossiblePayout + 10000) {
        console.error(`🎰 Vault balance too low: ${vaultBalance / LAMPORTS_PER_SOL} SOL, need ${maxPossiblePayout / LAMPORTS_PER_SOL} SOL. Refunding bet.`);
        try {
          const refundLamports = Math.floor(bet * LAMPORTS_PER_SOL);
          const refundTx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: vaultKeypair.publicKey,
              toPubkey: recipientPubkey,
              lamports: refundLamports,
            })
          );
          const { blockhash: refundBlockhash } = await payoutConnection.getLatestBlockhash('confirmed');
          refundTx.recentBlockhash = refundBlockhash;
          refundTx.feePayer = vaultKeypair.publicKey;
          refundTx.sign(vaultKeypair);
          const refundSig = await payoutConnection.sendRawTransaction(refundTx.serialize(), { skipPreflight: true, maxRetries: 5 });
          console.log(`🎰 Refunded ${bet} SOL to ${walletAddress}, tx: ${refundSig}`);
          return res.status(400).json({ error: `Vault balance too low for this bet. Your ${bet} SOL has been refunded.`, refundTx: refundSig });
        } catch (refundErr: any) {
          console.error('❌ Refund failed:', refundErr.message);
          return res.status(500).json({ error: 'Vault balance too low and refund failed. Please contact support.' });
        }
      }

      const txSlot = txInfo.slot;
      const seedData = `${betTxSignature}:${txSlot}:${choice}`;
      const hashBuffer = crypto.createHash('sha256').update(seedData).digest();
      const hashValue = hashBuffer.readUInt32BE(0);


      // House edge: player wins 40% of the time (0-3 out of 0-9)
      const playerWins = (hashValue % 10) < 4;
      const result: 'heads' | 'tails' = playerWins ? choice as 'heads' | 'tails' : (choice === 'heads' ? 'tails' : 'heads');
      const won = playerWins;

      let payoutAmount = 0;
      const platformFee = bet * PLATFORM_FEE_RATE; // 3.5% of bet — collected directly on-chain by player tx
      let payoutTxSignature: string | null = null;

      if (won) {
        payoutAmount = bet * 2; // Full 2x — fee was paid upfront

        try {
          const payoutLamports = Math.floor(payoutAmount * LAMPORTS_PER_SOL);

          const transaction = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: vaultKeypair.publicKey,
              toPubkey: recipientPubkey,
              lamports: payoutLamports,
            })
          );

          const { blockhash } = await payoutConnection.getLatestBlockhash('confirmed');
          transaction.recentBlockhash = blockhash;
          transaction.feePayer = vaultKeypair.publicKey;
          transaction.sign(vaultKeypair);

          payoutTxSignature = await payoutConnection.sendRawTransaction(transaction.serialize(), {
            skipPreflight: true,
            maxRetries: 5,
          });

          console.log(`🎰 Coin flip WIN: ${walletAddress} bet ${bet} SOL, payout ${payoutAmount} SOL, tx: ${payoutTxSignature}`);
        } catch (payoutError: any) {
          console.error('❌ Coin flip payout failed:', payoutError.message);
          try {
            const refundLamports = Math.floor(bet * LAMPORTS_PER_SOL);
            const refundTx = new Transaction().add(
              SystemProgram.transfer({
                fromPubkey: vaultKeypair.publicKey,
                toPubkey: recipientPubkey,
                lamports: refundLamports,
              })
            );
            const { blockhash: rb } = await payoutConnection.getLatestBlockhash('confirmed');
            refundTx.recentBlockhash = rb;
            refundTx.feePayer = vaultKeypair.publicKey;
            refundTx.sign(vaultKeypair);
            const refundSig = await payoutConnection.sendRawTransaction(refundTx.serialize(), { skipPreflight: true, maxRetries: 5 });
            console.log(`🎰 Payout failed, refunded ${bet} SOL to ${walletAddress}, tx: ${refundSig}`);
            return res.status(500).json({ error: `Payout failed. Your ${bet} SOL has been refunded.`, refundTx: refundSig });
          } catch (refundErr: any) {
            console.error('❌ Refund after payout failure also failed:', refundErr.message);
            return res.status(500).json({ error: 'Payout and refund both failed. Please contact support.' });
          }
        }
      } else {
        console.log(`🎰 Coin flip LOSS: ${walletAddress} bet ${bet} SOL, result: ${result}`);
      }

      // 3.5% fee was sent directly to the fees wallet by the player's transaction (on-chain)
      console.log(`🎰 Fee ${platformFee} SOL collected directly to fees wallet by player tx`);

      await db.insert(coinFlips).values({
        walletAddress,
        betAmount: bet.toString(),
        choice,
        result,
        won,
        payoutAmount: payoutAmount > 0 ? payoutAmount.toString() : null,
        platformFee: platformFee > 0 ? platformFee.toString() : null,
        betTxSignature,
        payoutTxSignature,
      });

      res.json({
        success: true,
        result,
        won,
        betAmount: bet,
        payoutAmount: won ? payoutAmount : 0,
        platformFee: won ? platformFee : 0,
        payoutTxSignature,
      });

      // Fire-and-forget: automatically distribute this flip's fee to partners and auto-pay on-chain
      if (platformFee > 0) {
        distributeFlipFee(platformFee).catch(e => console.error('❌ Auto-pay distribution failed:', e.message));
      }
    } catch (error: any) {
      console.error('Error in coin flip:', error);
      res.status(500).json({ error: 'Coin flip failed' });
    }
  });


  app.get("/api/coinflip/recent", async (req, res) => {
    try {
      const { coinFlips } = await import('@shared/schema');
      const { desc } = await import('drizzle-orm');
      const recentFlips = await db.select().from(coinFlips).orderBy(desc(coinFlips.createdAt)).limit(20);
      res.json({ success: true, flips: recentFlips });
    } catch (error: any) {
      console.error('Error fetching recent flips:', error);
      res.status(500).json({ error: 'Failed to fetch recent flips' });
    }
  });

  app.get("/api/coinflip/top", async (_req, res) => {
    try {
      const { coinFlips } = await import('@shared/schema');
      const EXCLUDED_WALLETS = new Set([
        'GETjtmGryhn2NvQovweRVU4RZHZDURoQWcioTZGcbRQS',
        'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT',
      ]);
      const all = await db.select().from(coinFlips);
      const wins = all.filter((f: any) => f.won && !EXCLUDED_WALLETS.has(f.walletAddress));
      const map = new Map<string, { walletAddress: string; totalDoubled: number; wins: number }>();
      for (const f of wins as any[]) {
        const w = f.walletAddress;
        const payout = parseFloat(f.payoutAmount || '0') || parseFloat(f.betAmount || '0') * 2;
        const e = map.get(w) || { walletAddress: w, totalDoubled: 0, wins: 0 };
        e.totalDoubled += payout;
        e.wins += 1;
        map.set(w, e);
      }
      const top = Array.from(map.values())
        .sort((a, b) => b.totalDoubled - a.totalDoubled)
        .slice(0, 10)
        .map(e => ({ ...e, totalDoubled: e.totalDoubled.toFixed(4) }));
      res.json({ success: true, top });
    } catch (error: any) {
      console.error('Error fetching top doublers:', error);
      res.status(500).json({ error: 'Failed to fetch top doublers' });
    }
  });

  app.get("/api/coinflip/stats", async (req, res) => {
    try {
      const { coinFlips } = await import('@shared/schema');
      const allFlips = await db.select().from(coinFlips);
      const totalFlips = allFlips.length;
      const totalWins = allFlips.filter(f => f.won).length;
      const totalBet = allFlips.reduce((sum, f) => sum + parseFloat(f.betAmount), 0);
      const totalPayout = allFlips.filter(f => f.won).reduce((sum, f) => sum + parseFloat(f.payoutAmount || '0'), 0);
      
      res.json({
        success: true,
        totalFlips,
        totalWins,
        totalLosses: totalFlips - totalWins,
        totalBet: totalBet.toFixed(4),
        totalPayout: totalPayout.toFixed(4),
        houseEdge: totalBet > 0 ? ((totalBet - totalPayout) / totalBet * 100).toFixed(2) : '0',
      });
    } catch (error: any) {
      console.error('Error fetching coin flip stats:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  // ─── GSOL Staking via Jupiter Ultra ──────────────────────────────────────
  // Pool: 5YWBPjgVBzfkHTLZea33n7xg9qiEakwauvHpe4ixHH9N (Sanctum single-pool program)
  // Jupiter Ultra routes through all pool types; no need to call SPL Stake Pool directly.
  const GSOL_MINT_ADDR  = 'GSoLRcWKQE5nbWTYFr83Ei3HGjnp9YzQNAFK6VAATg3';

  // Cache staking info for 5 minutes to reduce RPC calls
  let _stakingInfoCache: { apy: string; solValue: string; tvl: string; holders: number; source: string; cachedAt: number } | null = null;
  const STAKING_INFO_CACHE_MS = 5 * 60 * 1000;

  // ── /api/staking/rate-history — per-epoch GSOL/SOL exchange rate ──
  let _rateHistoryCache: { epochs: any[]; currentRate: number; cachedAt: number } | null = null;
  const RATE_HISTORY_CACHE_MS = 60 * 60 * 1000; // 1 hour
  app.get('/api/staking/rate-history', async (_req, res) => {
    try {
      if (_rateHistoryCache && Date.now() - _rateHistoryCache.cachedAt < RATE_HISTORY_CACHE_MS) {
        return res.json(_rateHistoryCache);
      }
      const [sanctumRes, latestRes] = await Promise.all([
        fetch(`https://sanctum-api.ironforge.network/lsts/${GSOL_MINT_ADDR}/apys?apiKey=${process.env.SANCTUM_API_KEY}&limit=500`),
        fetch(`https://sanctum-api.ironforge.network/lsts/${GSOL_MINT_ADDR}?apiKey=${process.env.SANCTUM_API_KEY}`),
      ]);
      if (!sanctumRes.ok) throw new Error(`Sanctum apys ${sanctumRes.status}`);
      const sanctumData = await sanctumRes.json();
      let latestApy: number | null = null;
      if (latestRes.ok) {
        const ld = await latestRes.json();
        const v = ld?.data?.[0]?.latestApy;
        if (typeof v === 'number' && v > 0 && v < 1) latestApy = v;
      }
      const apyRows: { epoch: number; epochEndTs: number; apy: number }[] = (sanctumData?.data ?? [])
        .map((r: any) => ({
          epoch: r.epoch,
          epochEndTs: r.epochEndTs,
          // Zero out only Sanctum API bugs (impossible APY values); keep all real values exact
          apy: !Number.isFinite(r.apy) || r.apy > 1 || r.apy < 0 ? 0 : r.apy,
        }));
      apyRows.sort((a, b) => a.epoch - b.epoch);

      const epochs: { epoch: number; rate: number; apy: number; date: string }[] = [];
      let compound = 1.0;
      // Seed with first epoch
      if (apyRows.length > 0) {
        const seedDate = new Date(apyRows[0].epochEndTs - 2 * 86400000);
        epochs.push({ epoch: apyRows[0].epoch - 1, rate: 1.0, apy: 0, date: seedDate.toISOString() });
      }
      for (let i = 0; i < apyRows.length; i++) {
        const row = apyRows[i];
        const prevTs = i > 0 ? apyRows[i - 1].epochEndTs : row.epochEndTs - 2 * 86400000;
        const epochDays = Math.max(0, (row.epochEndTs - prevTs) / 86400000);
        // Per-epoch growth from annualized APY
        if (row.apy > 0 && epochDays > 0) {
          compound *= Math.pow(1 + row.apy, epochDays / 365);
        }
        epochs.push({
          epoch: row.epoch,
          rate: parseFloat(compound.toFixed(6)),
          apy: row.apy,
          date: new Date(row.epochEndTs).toISOString(),
        });
      }

      const result = { epochs, currentRate: compound, latestApy, cachedAt: Date.now() };
      _rateHistoryCache = result;
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.get('/api/staking/info', async (_req, res) => {
    try {
      // Serve from cache if fresh
      if (_stakingInfoCache && Date.now() - _stakingInfoCache.cachedAt < STAKING_INFO_CACHE_MS) {
        return res.json(_stakingInfoCache);
      }

      const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
      const jupKey = process.env.JUPITER_API_KEY;

      // ── 1. Fetch GSOL/SOL exchange rate ──────────────────────────────────
      let solValue: number | undefined;
      let sanctumTvl: number | undefined;
      let sanctumHolders: number | undefined;
      if (jupKey) {
        try {
          const priceUrl = `https://api.jup.ag/price/v2?ids=${GSOL_MINT_ADDR}&vsToken=So11111111111111111111111111111111111111112`;
          const priceResp = await fetch(priceUrl, { headers: { 'x-api-key': jupKey } });
          if (priceResp.ok) {
            const priceData = await priceResp.json();
            const priceEntry = priceData?.data?.[GSOL_MINT_ADDR];
            if (priceEntry?.price) solValue = Number(priceEntry.price);
          }
        } catch (_) {}
      }

      // ── 2. Real GSOL APY — try Sanctum extra-api first, then on-chain ──
      const GSOL_STAKE_ACCT = 'HwzMUGq3C7STPuHgD9UGPKDhqpcmXyN4JzKigwNqavej';
      const GSOL_CREATION_EPOCH = 941;
      let apy: number | undefined;
      let apySource = 'gsol-inception';

      // ── 2a. Sanctum Extra API (public, no key) ───────────────────────────
      try {
        const sanctumRes = await fetch('https://sanctum-extra-api.vercel.app/v1/lst-list');
        if (sanctumRes.ok) {
          const sanctumData = await sanctumRes.json();
          const lstList: any[] = sanctumData?.sanctumLstList ?? sanctumData ?? [];
          const gsol = lstList.find((t: any) =>
            t.mint === GSOL_MINT_ADDR || t.address === GSOL_MINT_ADDR
          );
          if (gsol) {
            if (gsol.apy !== undefined)       { apy = Number(gsol.apy) * 100; apySource = 'sanctum-extra'; }
            if (gsol.solValue !== undefined)  solValue = Number(gsol.solValue);
            if (gsol.tvl !== undefined)       sanctumTvl = Number(gsol.tvl);
            if (gsol.holders !== undefined)   sanctumHolders = Number(gsol.holders);
            console.log(`✅ Sanctum Extra GSOL: apy=${apy}, tvl=${sanctumTvl}, holders=${sanctumHolders}`);
          }
        }
      } catch (_) {}

      // ── 2a-2. Sanctum Ironforge API (fallback, requires key) ─────────────
      if ((apy === undefined || sanctumTvl === undefined) && process.env.SANCTUM_API_KEY) {
        try {
          const sanctumApyRes = await fetch(
            `https://sanctum-api.ironforge.network/lsts/${GSOL_MINT_ADDR}?apiKey=${process.env.SANCTUM_API_KEY}`
          );
          if (sanctumApyRes.ok) {
            const sanctumApyData = await sanctumApyRes.json();
            const lstData = sanctumApyData?.data?.[0];
            const avgApy = lstData?.avgApy;
            if (typeof avgApy === 'number' && avgApy > 0) {
              apy = avgApy * 100; apySource = 'sanctum-api';
              if (lstData?.solValue) solValue = Number(lstData.solValue) / 1e9;
              if (lstData?.tvl)      sanctumTvl = Number(lstData.tvl);
              if (lstData?.holders)  sanctumHolders = Number(lstData.holders);
            }
          }
        } catch (_) {}
      }

      // ── 2a-3. Helius DAS — holder count fallback ─────────────────────────
      if (!sanctumHolders) {
        try {
          const dasRes = await fetch(heliusUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenAccounts',
              params: { mint: GSOL_MINT_ADDR, limit: 1, displayOptions: {} } })
          });
          if (dasRes.ok) {
            const dasData = await dasRes.json();
            if (dasData?.result?.total) sanctumHolders = Number(dasData.result.total);
          }
        } catch (_) {}
      }

      // ── 2b. On-chain inception-to-now APY (fallback if Sanctum doesn't have GSOL) ──
      if (apy === undefined) try {
        const epochJ = await fetch(heliusUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getEpochInfo', params: [] })
        }).then(r => r.json());

        const currentEpoch: number = epochJ.result?.epoch ?? 0;
        const slotsPerEpoch: number = epochJ.result?.slotsInEpoch ?? 432000;
        const epochDurationDays = (slotsPerEpoch * 0.4) / (24 * 3600);

        if (currentEpoch > GSOL_CREATION_EPOCH) {
          // Collect epoch rewards from creation to current (sequential — each epoch builds on last)
          let compoundReturn = 1.0;
          for (let epoch = GSOL_CREATION_EPOCH; epoch < currentEpoch; epoch++) {
            const rewJ = await fetch(heliusUrl, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0', id: 2, method: 'getInflationReward',
                params: [[GSOL_STAKE_ACCT], { epoch }]
              })
            }).then(r => r.json());

            const rew = (rewJ.result ?? [])[0];
            if (rew && rew.amount > 0) {
              const pre = rew.postBalance - rew.amount;
              if (pre > 0) compoundReturn *= (1 + rew.amount / pre);
            }
            // warmup epochs (0 reward) naturally contribute no return
          }

          // Annualize over total elapsed time from creation epoch (including warmup)
          const totalEpochs = currentEpoch - GSOL_CREATION_EPOCH;
          const totalDays = totalEpochs * epochDurationDays;
          if (totalDays > 0 && compoundReturn > 1) {
            apy = (Math.pow(compoundReturn, 365.25 / totalDays) - 1) * 100;
            apy = Math.max(1, Math.min(20, apy));
          }
        }
      } catch (_) {}

      // ── 3. Fallback: on-chain inflation formula (0% commission) ─────────
      if (apy === undefined) {
        try {
          const [inflResp, voteResp, supplyResp] = await Promise.all([
            fetch(heliusUrl, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getInflationRate', params: [] })
            }),
            fetch(heliusUrl, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'getVoteAccounts',
                params: [{ commitment: 'finalized', keepUnstakedDelinquents: false }] })
            }),
            fetch(heliusUrl, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'getSupply',
                params: [{ excludeNonCirculatingAccountsList: true }] })
            }),
          ]);

          const [inflJ, voteJ, supplyJ] = await Promise.all([
            inflResp.json(), voteResp.json(), supplyResp.json()
          ]);

          const inflationValidator: number = inflJ.result?.validator ?? 0;
          const current: any[] = voteJ.result?.current ?? [];
          const totalStakeLamports: number = current.reduce((s: number, v: any) => s + (v.activatedStake ?? 0), 0);
          const totalSupplyLamports: number = supplyJ.result?.value?.total ?? 0;

          if (inflationValidator > 0 && totalSupplyLamports > 0 && totalStakeLamports > 0) {
            const stakingRatio = totalStakeLamports / totalSupplyLamports;
            const epochsPerYear = (365.25 * 24 * 3600) / (432000 * 0.4);
            const epochYield = inflationValidator / epochsPerYear / stakingRatio;
            // 0% commission on GSOL validator = full gross yield to stakers
            apy = (Math.pow(1 + epochYield, epochsPerYear) - 1) * 100;
            apySource = 'solana-inflation';
          }
        } catch (_) {}
      }

      if (apy === undefined) apy = 5.96;
      if (!solValue) solValue = 1.07;

      const result = {
        apy: apy.toFixed(2),
        solValue: solValue.toFixed(6),
        tvl: sanctumTvl !== undefined ? sanctumTvl.toString() : undefined,
        holders: sanctumHolders,
        source: apySource,
        cachedAt: Date.now()
      };
      _stakingInfoCache = result;
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ── /api/staking/quote — real-time Jupiter Ultra quote for SOL ↔ GSOL ──
  const WSOL = 'So11111111111111111111111111111111111111112';
  app.get('/api/staking/quote', async (req, res) => {
    try {
      const inputLamports = Number(req.query.inputLamports);
      const mode = (req.query.mode as string) || 'stake'; // 'stake' | 'unstake'
      if (!inputLamports || inputLamports <= 0) return res.status(400).json({ error: 'inputLamports required' });

      const jupKey = process.env.JUPITER_API_KEY;
      const inputMint  = mode === 'stake' ? WSOL : GSOL_MINT_ADDR;
      const outputMint = mode === 'stake' ? GSOL_MINT_ADDR : WSOL;

      const quoteUrl = `https://api.jup.ag/ultra/v1/order?inputMint=${inputMint}&outputMint=${outputMint}&amount=${inputLamports}`;
      const quoteResp = await fetch(quoteUrl, {
        headers: jupKey ? { 'x-api-key': jupKey } : {},
      });

      if (!quoteResp.ok) {
        const err = await quoteResp.text();
        throw new Error(`Jupiter Ultra quote failed: ${err}`);
      }

      const quoteJson = await quoteResp.json() as any;
      if (quoteJson.error) throw new Error(quoteJson.error);

      const outAmount   = Number(quoteJson.outAmount ?? 0);
      const priceImpact = Number(quoteJson.priceImpact ?? quoteJson.priceImpactPct ?? 0);

      res.json({
        inputLamports,
        outputAmount: outAmount,
        priceImpactPct: priceImpact,
        mode,
      });
    } catch (e: any) {
      console.error('[staking/quote]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Use Jupiter Ultra to build stake/unstake transactions — routes through
  // all Sanctum pool types (including SP12tWFx… single-pool program).
  async function jupiterUltraOrder(
    inputMint: string,
    outputMint: string,
    lamports: number,
    taker: string
  ): Promise<{ transaction: string; requestId: string }> {
    if (!process.env.JUPITER_API_KEY) throw new Error('JUPITER_API_KEY not set');
    const url = new URL('https://api.jup.ag/ultra/v1/order');
    url.searchParams.set('inputMint', inputMint);
    url.searchParams.set('outputMint', outputMint);
    url.searchParams.set('amount', lamports.toString());
    url.searchParams.set('taker', taker);
    const resp = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json', 'x-api-key': process.env.JUPITER_API_KEY }
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Jupiter Ultra order failed (${resp.status}): ${txt}`);
    }
    const data = await resp.json();
    return { transaction: data.transaction, requestId: data.requestId };
  }

  const SOL_MINT = 'So11111111111111111111111111111111111111112';

  /**
   * Queries Helius for recent priority fees and simulates the transaction to get the
   * exact compute units consumed. Returns { microLamports, computeUnits } to build
   * tight, cost-accurate ComputeBudget instructions — same approach as Sanctum's own UI.
   */
  async function getDynamicPriorityFee(
    conn: Connection,
    coreInstructions: TransactionInstruction[],
    payer: PublicKey,
    blockhash: string
  ): Promise<{ microLamports: number; computeUnits: number }> {
    const heliusUrl = process.env.HELIUS_RPC_URL ||
      `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

    try {
      // ── 1. Simulate with max CU limit to measure actual consumption ──────────
      const simIxs = [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 0 }),
        ...coreInstructions,
      ];
      const simMsg = new TransactionMessage({
        payerKey: payer,
        recentBlockhash: blockhash,
        instructions: simIxs,
      }).compileToV0Message();
      const simTx = new VersionedTransaction(simMsg);
      const { value: simResult } = await conn.simulateTransaction(simTx, {
        replaceRecentBlockhash: true,
        sigVerify: false,
      });
      const rawCU = simResult.unitsConsumed ?? 100_000;
      const computeUnits = Math.max(Math.ceil(rawCU * 1.15), 10_000); // 15% buffer, min 10k

      // ── 2. Helius getPriorityFeeEstimate using the serialized transaction ─────
      // Pass the actual serialized tx so Helius can inspect all touched accounts
      const serializedTx = Buffer.from(simTx.serialize()).toString('base64');
      const feeResp = await fetch(heliusUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'priority-fee',
          method: 'getPriorityFeeEstimate',
          params: [{
            transaction: serializedTx,
            options: {
              priorityLevel: 'HIGH',
              recommended: true,
            },
          }],
        }),
      });
      const feeJson = await feeResp.json() as any;
      // Helius returns `priorityFeeEstimate` (specific level) or `priorityFeeLevels.high`
      const heliusFee: number =
        feeJson?.result?.priorityFeeEstimate ??
        feeJson?.result?.priorityFeeLevels?.high ?? 0;

      // Floor at 50k microLamports — ensures fee is always visible in explorer
      const microLamports = Math.max(Math.ceil(heliusFee), 50_000);

      console.log(`[priorityFee] simCU=${rawCU} → limit=${computeUnits} | heliusFee=${heliusFee} → price=${microLamports}`);
      return { microLamports, computeUnits };
    } catch (err) {
      console.warn('[priorityFee] fallback to defaults:', err);
      return { microLamports: 100_000, computeUnits: 200_000 };
    }
  }

  /**
   * Builds a SOL → GSOL direct deposit transaction on-chain without any Sanctum API calls.
   * Structure reverse-engineered from a real Sanctum direct-deposit transaction.
   *
   * Program: stkitrT1Uoy18Dk1fTrgPw8W6MVzoCfYoAFT4MLsmhq
   * Instruction discriminator: 0x00 | u64 LE amount
   *
   * Steps:
   *  1. ComputeBudgetProgram.setComputeUnitLimit
   *  2. ComputeBudgetProgram.setComputeUnitPrice
   *  3. Create user wSOL ATA (idempotent)
   *  4. SystemProgram.transfer → wSOL ATA
   *  5. SyncNative (wrap SOL)
   *  6. Create user GSOL ATA (idempotent)
   *  7. stkitrT1 depositSol instruction
   */
  async function sanctumDirectTx(
    inputMint: string,
    _outputMint: string,
    lamports: number,
    signer: string
  ): Promise<{ transaction: string }> {
    // Only SOL→GSOL is supported via direct deposit.
    // GSOL→SOL goes through Jupiter Ultra (handled at call site).
    if (inputMint !== SOL_MINT) {
      throw new Error('sanctumDirectTx only supports SOL → GSOL');
    }

    const userPubkey = new PublicKey(signer);
    const gSOLMint   = new PublicKey(GSOL_MINT_ADDR);

    // Derive user ATAs
    const wSOLAta = await getAssociatedTokenAddress(NATIVE_MINT, userPubkey);
    const gSOLAta = await getAssociatedTokenAddress(gSOLMint,   userPubkey);

    // ── Hardcoded pool accounts (from decoded transaction) ──────────────────
    // GSOL stake pool account
    const GSOL_POOL        = new PublicKey('5YWBPjgVBzfkHTLZea33n7xg9qiEakwauvHpe4ixHH9N');
    // Pool validator stake account
    const POOL_STAKE       = new PublicKey('Ckx7xiBiN4x7T4DKcxDrANiNGutDrKjULx7piU3MwhsG');
    // Pool manager fee account (SOL)
    const POOL_MANAGER_FEE = new PublicKey('5ZVxc1cQcH9GrLwSB9JapEqMmiGSh5WgQ24LsUS7NZeY');
    // Pool validator list
    const POOL_VALIDATOR_LIST = new PublicKey('EkcTdkQ4G6FnmZr5XdEouSHL7rJsAwRF4m7NuBxcjDWG');
    // Pool reserve stake
    const POOL_RESERVE     = new PublicKey('5kQdTc11recnZzm1bYJXEz1sNQvEUUWqHDBkYkyvptLu');
    // Pool manager fee token account (GSOL) — LUT index 21
    const POOL_FEE_TOKEN   = new PublicKey('7UWZDKjBT1dTvAzdjoSCYKnML3SPt9tfFkANGarEq5r3');
    // Pool withdraw authority — LUT index 19
    const POOL_WITHDRAW    = new PublicKey('75jTZDE78xpBJokeB2BcimRNY5BZ7U45bWhpgUrTzWZC');
    // SP12 single-pool program — LUT index 33
    const SP12_PROGRAM     = new PublicKey('SP12tWFxD9oJsVWNavTTBZvMbA6gkAmxtVgxdqvyvhY');
    // Sanctum stake-pool program
    const STKITR_PROGRAM   = new PublicKey('stkitrT1Uoy18Dk1fTrgPw8W6MVzoCfYoAFT4MLsmhq');

    // ── Instruction 7: stkitrT1 depositSol ─────────────────────────────────
    // data = 0x00 (discriminator) + u64 LE amount
    const depositData = Buffer.alloc(9);
    depositData.writeUInt8(0, 0);
    depositData.writeBigUInt64LE(BigInt(lamports), 1);

    const depositIx = new TransactionInstruction({
      programId: STKITR_PROGRAM,
      data: depositData,
      keys: [
        { pubkey: userPubkey,          isSigner: true,  isWritable: true  }, // 0: user signer
        { pubkey: wSOLAta,             isSigner: false, isWritable: true  }, // 1: user wSOL ATA
        { pubkey: gSOLAta,             isSigner: false, isWritable: true  }, // 2: user GSOL ATA
        { pubkey: POOL_FEE_TOKEN,      isSigner: false, isWritable: true  }, // 3: pool fee token acct
        { pubkey: POOL_WITHDRAW,       isSigner: false, isWritable: true  }, // 4: pool withdraw auth
        { pubkey: POOL_STAKE,          isSigner: false, isWritable: true  }, // 5: pool validator stake
        { pubkey: gSOLMint,            isSigner: false, isWritable: true  }, // 6: GSOL mint
        { pubkey: NATIVE_MINT,         isSigner: false, isWritable: true  }, // 7: wSOL mint
        { pubkey: TOKEN_PROGRAM_ID,    isSigner: false, isWritable: false }, // 8: Token program
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // 9: System program
        { pubkey: SP12_PROGRAM,        isSigner: false, isWritable: false }, // 10: SP12 program
        { pubkey: GSOL_POOL,           isSigner: false, isWritable: true  }, // 11: GSOL stake pool
        { pubkey: POOL_MANAGER_FEE,    isSigner: false, isWritable: true  }, // 12: pool manager fee
        { pubkey: POOL_VALIDATOR_LIST, isSigner: false, isWritable: true  }, // 13: validator list
        { pubkey: POOL_RESERVE,        isSigner: false, isWritable: true  }, // 14: pool reserve
      ],
    });

    const heliusConn = new Connection(
      process.env.HELIUS_RPC_URL || `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
    );
    const { blockhash } = await heliusConn.getLatestBlockhash('finalized');

    const FEE_DEST = new PublicKey('77N86XfcBSAvcGNPYMAVjjyf2feUJwmUoiJ96HzPtySd');
    const STAKING_FEE_LAMPORTS = 50_000; // 0.00005 SOL

    // Core instructions (no ComputeBudget yet — needed for simulation)
    const coreInstructions = [
      createAssociatedTokenAccountIdempotentInstruction(userPubkey, wSOLAta, userPubkey, NATIVE_MINT),
      SystemProgram.transfer({ fromPubkey: userPubkey, toPubkey: wSOLAta, lamports }),
      createSyncNativeInstruction(wSOLAta),
      createAssociatedTokenAccountIdempotentInstruction(userPubkey, gSOLAta, userPubkey, gSOLMint),
      depositIx,
    ];

    // Simulate → get exact CU + Helius priority fee
    const { microLamports, computeUnits } = await getDynamicPriorityFee(
      heliusConn, coreInstructions, userPubkey, blockhash
    );

    const instructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
      ...coreInstructions,
      SystemProgram.transfer({ fromPubkey: userPubkey, toPubkey: FEE_DEST, lamports: STAKING_FEE_LAMPORTS }),
    ];

    const msg = new TransactionMessage({
      payerKey: userPubkey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    const tx = new VersionedTransaction(msg);
    return { transaction: Buffer.from(tx.serialize()).toString('base64') };
  }

  /**
   * Builds a GSOL → SOL direct unstake transaction on-chain without any Sanctum API calls.
   * Structure reverse-engineered from a real Sanctum direct-unstake transaction.
   *
   * Program: stkitrT1Uoy18Dk1fTrgPw8W6MVzoCfYoAFT4MLsmhq
   * Instruction discriminator: 0x08 (WithdrawWrappedSol) | u64 LE amount
   *
   * Steps:
   *  1. ComputeBudgetProgram.setComputeUnitLimit
   *  2. ComputeBudgetProgram.setComputeUnitPrice
   *  3. Create user wSOL ATA (idempotent)  — receives unwrapped SOL
   *  4. stkitrT1 WithdrawWrappedSol — burns GSOL, fills user wSOL ATA
   *  5. Token CloseAccount (0x09) — closes wSOL ATA, user gets native SOL
   */
  async function sanctumDirectUnstakeTx(
    lamports: number,
    signer: string
  ): Promise<{ transaction: string }> {
    const userPubkey = new PublicKey(signer);
    const gSOLMint   = new PublicKey(GSOL_MINT_ADDR);

    const wSOLAta = await getAssociatedTokenAddress(NATIVE_MINT, userPubkey);
    const gSOLAta = await getAssociatedTokenAddress(gSOLMint,    userPubkey);

    // ── Fixed pool accounts (decoded from real unstake transaction) ───────────
    const GSOL_POOL           = new PublicKey('5YWBPjgVBzfkHTLZea33n7xg9qiEakwauvHpe4ixHH9N');
    const POOL_MANAGER_FEE    = new PublicKey('5ZVxc1cQcH9GrLwSB9JapEqMmiGSh5WgQ24LsUS7NZeY');
    const POOL_VALIDATOR_LIST = new PublicKey('EkcTdkQ4G6FnmZr5XdEouSHL7rJsAwRF4m7NuBxcjDWG');
    const POOL_RESERVE        = new PublicKey('5kQdTc11recnZzm1bYJXEz1sNQvEUUWqHDBkYkyvptLu');

    // ── Pool reserve pre-check (SP12 enforces this on-chain, check here first) ─
    // Reserve stake account balance minus minimum rent = max withdrawable lamports
    const MIN_STAKE_RENT = 2_282_880;
    const checkConn = new Connection(
      process.env.HELIUS_RPC_URL || `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
    );
    const reserveBalance = await checkConn.getBalance(POOL_VALIDATOR_LIST);
    const maxWithdrawable = Math.max(0, reserveBalance - MIN_STAKE_RENT);
    if (lamports > maxWithdrawable) {
      throw Object.assign(
        new Error(`Pool reserve insufficient: max ${maxWithdrawable} lamports available`),
        { code: 'POOL_RESERVE_INSUFFICIENT', maxWithdrawable, maxSol: (maxWithdrawable / 1e9).toFixed(9) }
      );
    }

    // wSOL fee vault for this pool (self-owned wSOL token account, fixed address)
    const WSOL_FEE_VAULT      = new PublicKey('D3DxbHp7YvgdD2iH8GfsGWdFE5gp37aoYjp4jW5jNMjH');
    // SP12 single-pool program
    const SP12_PROGRAM        = new PublicKey('SP12tWFxD9oJsVWNavTTBZvMbA6gkAmxtVgxdqvyvhY');
    // Sanctum stake-pool program
    const STKITR_PROGRAM      = new PublicKey('stkitrT1Uoy18Dk1fTrgPw8W6MVzoCfYoAFT4MLsmhq');
    // Solana system accounts needed by WithdrawWrappedSol
    const CLOCK_SYSVAR        = new PublicKey('SysvarC1ock11111111111111111111111111111111');
    const STAKE_HISTORY       = new PublicKey('SysvarStakeHistory1111111111111111111111111');
    const STAKE_PROGRAM       = new PublicKey('Stake11111111111111111111111111111111111111');

    // ── Instruction: WithdrawWrappedSol (disc = 0x08) ────────────────────────
    // data = 0x08 (discriminator) + u64 LE amount (GSOL lamports to burn)
    const withdrawData = Buffer.alloc(9);
    withdrawData.writeUInt8(8, 0);
    withdrawData.writeBigUInt64LE(BigInt(lamports), 1);

    const withdrawIx = new TransactionInstruction({
      programId: STKITR_PROGRAM,
      data: withdrawData,
      keys: [
        { pubkey: userPubkey,       isSigner: true,  isWritable: true  }, // 0: user signer
        { pubkey: gSOLAta,          isSigner: false, isWritable: true  }, // 1: user GSOL ATA (burn)
        { pubkey: wSOLAta,          isSigner: false, isWritable: true  }, // 2: user wSOL ATA (recv)
        { pubkey: WSOL_FEE_VAULT,   isSigner: false, isWritable: true  }, // 3: wSOL fee vault
        { pubkey: gSOLMint,         isSigner: false, isWritable: true  }, // 4: GSOL mint
        { pubkey: NATIVE_MINT,      isSigner: false, isWritable: false }, // 5: wSOL mint
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // 6: Token program
        { pubkey: SP12_PROGRAM,     isSigner: false, isWritable: false }, // 7: SP12 program
        { pubkey: GSOL_POOL,        isSigner: false, isWritable: true  }, // 8: GSOL pool
        { pubkey: POOL_MANAGER_FEE, isSigner: false, isWritable: false }, // 9: withdraw authority (non-writable)
        { pubkey: POOL_VALIDATOR_LIST, isSigner: false, isWritable: true }, // 10: validator list
        { pubkey: POOL_RESERVE,     isSigner: false, isWritable: true  }, // 11: pool reserve
        { pubkey: CLOCK_SYSVAR,     isSigner: false, isWritable: false }, // 12: Clock sysvar
        { pubkey: STAKE_HISTORY,    isSigner: false, isWritable: false }, // 13: StakeHistory sysvar
        { pubkey: STAKE_PROGRAM,    isSigner: false, isWritable: false }, // 14: Stake program
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // 15: Token program (dup)
      ],
    });

    // CloseAccount: closes wSOL ATA → user gets native SOL
    const closeIx = createCloseAccountInstruction(wSOLAta, userPubkey, userPubkey);

    const heliusConn = new Connection(
      process.env.HELIUS_RPC_URL || `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
    );
    const { blockhash } = await heliusConn.getLatestBlockhash('finalized');

    const FEE_DEST = new PublicKey('FzESY59j4xCef1EjqoprVBDXEFTWcrx8hGq6AYYvGH1v');
    const STAKING_FEE_LAMPORTS = 50_000; // 0.00005 SOL

    // Fixed compute budget values taken from a real WithdrawWrappedSol transaction
    const COMPUTE_UNIT_LIMIT  = 87_443;
    const COMPUTE_UNIT_PRICE  = 3_798; // microLamports

    const instructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNIT_LIMIT }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: COMPUTE_UNIT_PRICE }),
      createAssociatedTokenAccountIdempotentInstruction(userPubkey, wSOLAta, userPubkey, NATIVE_MINT),
      withdrawIx,
      closeIx,
      SystemProgram.transfer({ fromPubkey: userPubkey, toPubkey: FEE_DEST, lamports: STAKING_FEE_LAMPORTS }),
    ];

    const msg = new TransactionMessage({
      payerKey: userPubkey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    const tx = new VersionedTransaction(msg);
    return { transaction: Buffer.from(tx.serialize()).toString('base64') };
  }

  app.post('/api/staking/stake-tx', async (req, res) => {
    try {
      const { amount, signerPublicKey, method } = req.body;
      if (!amount || !signerPublicKey) return res.status(400).json({ error: 'amount and signerPublicKey required' });
      if (method === 'direct') {
        // Direct Mint: Sanctum Extra swap API (SOL → GSOL via pool)
        const result = await sanctumDirectTx(SOL_MINT, GSOL_MINT_ADDR, Number(amount), signerPublicKey);
        res.json(result);
      } else {
        // via Jupiter: Jupiter Ultra routes through Sanctum's pool
        const result = await jupiterUltraOrder(SOL_MINT, GSOL_MINT_ADDR, Number(amount), signerPublicKey);
        res.json(result);
      }
    } catch (e: any) {
      console.error('[stake-tx]', e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/staking/unstake-tx', async (req, res) => {
    try {
      const { amount, signerPublicKey, method } = req.body;
      if (!amount || !signerPublicKey) return res.status(400).json({ error: 'amount and signerPublicKey required' });
      if (method === 'direct') {
        try {
          const result = await sanctumDirectUnstakeTx(Number(amount), signerPublicKey);
          return res.json(result);
        } catch (err: any) {
          if (err.code === 'POOL_RESERVE_INSUFFICIENT') {
            return res.status(422).json({
              error: 'POOL_RESERVE_INSUFFICIENT',
              maxWithdrawable: err.maxWithdrawable,
              maxSol: err.maxSol,
            });
          }
          throw err;
        }
      } else {
        // Jupiter method: routes through Sanctum pool via Jupiter Ultra
        const result = await jupiterUltraOrder(GSOL_MINT_ADDR, SOL_MINT, Number(amount), signerPublicKey);
        res.json(result);
      }
    } catch (e: any) {
      console.error('[unstake-tx]', e);
      res.status(500).json({ error: e.message });
    }
  });

  const STAKING_PLATFORM_WALLETS = [
    'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT',
    'GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6'
  ];

  // Award staking points + record position after a successful stake transaction
  app.post('/api/staking/award-points', async (req, res) => {
    try {
      const { walletAddress, solAmount, gsolReceived } = req.body;
      if (!walletAddress || !solAmount || isNaN(Number(solAmount)) || Number(solAmount) <= 0) {
        return res.status(400).json({ error: 'walletAddress and solAmount required' });
      }
      // Check permanent bonus flag — persists even after unstaking
      const existingPts = await storage.getUserPoints(walletAddress);
      const isFirstTime = !existingPts || !existingPts.stakingBonusAwarded;

      // Track GSOL position for daily points (all wallets)
      const gsolAmt = Number(gsolReceived) > 0 ? Number(gsolReceived) : Number(solAmount);
      await storage.upsertStakingPosition(walletAddress, gsolAmt);

      // One-time flat 100 pt welcome bonus — ONLY on the very first stake ever, forever
      // Skip actual point award for platform wallets but still return isFirstTime for the toast UI
      let pointsAwarded = 0;
      const isPlatformWallet = STAKING_PLATFORM_WALLETS.includes(walletAddress);
      if (isFirstTime) {
        const ptsToAdd = isPlatformWallet ? 0 : 100;
        // Mark bonus as used permanently for ALL wallets (platform wallets get 0 pts but flag still sets)
        await db
          .insert(userPoints)
          .values({ walletAddress, points: ptsToAdd, accountsClosed: 0, stakingBonusAwarded: true })
          .onConflictDoUpdate({
            target: userPoints.walletAddress,
            set: { points: sql`${userPoints.points} + ${ptsToAdd}`, stakingBonusAwarded: true, lastUpdated: new Date() }
          });
        pointsAwarded = 100; // always show 100 in toast UI for first-timers
        console.log(`🎯 First-time staker: ${walletAddress} → +${ptsToAdd} pts, bonus flag set permanently`);
      } else {
        console.log(`📍 Returning staker: ${walletAddress} (no bonus, earning daily hold points)`);
      }

      res.json({ success: true, pointsAwarded, isFirstTime });
    } catch (e: any) {
      console.error('[staking/award-points]', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Reduce staking position after unstake
  app.post('/api/staking/reduce-position', async (req, res) => {
    try {
      const { walletAddress, gsolAmount } = req.body;
      if (!walletAddress || !gsolAmount || isNaN(Number(gsolAmount)) || Number(gsolAmount) <= 0) {
        return res.status(400).json({ error: 'walletAddress and gsolAmount required' });
      }
      if (STAKING_PLATFORM_WALLETS.includes(walletAddress)) {
        return res.json({ success: true });
      }
      await storage.reduceStakingPosition(walletAddress, Number(gsolAmount));
      console.log(`📉 Unstake position reduced: ${walletAddress} -${gsolAmount} GSOL`);
      res.json({ success: true });
    } catch (e: any) {
      console.error('[staking/reduce-position]', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Helper: fetch SOL price (USD) and GSOL/SOL rate for daily points calculation
  async function fetchStakingPrices(): Promise<{ solPriceUsd: number; gsolSolRate: number }> {
    let gsolSolRate = 1.07; // fallback

    // Fetch GSOL/SOL rate from Sanctum Ironforge API
    try {
      const GSOL_MINT_ADDR = 'GSoLRcWKQE5nbWTYFr83Ei3HGjnp9YzQNAFK6VAATg3';
      const sanctumRes = await fetch(
        `https://sanctum-api.ironforge.network/lsts/${GSOL_MINT_ADDR}?apiKey=${process.env.SANCTUM_API_KEY}`
      );
      if (sanctumRes.ok) {
        const sanctumData = await sanctumRes.json();
        const lstData = sanctumData?.data?.[0];
        // solValue is in lamports per token (e.g. 1001600160 = 1.0016 SOL per GSOL)
        if (lstData?.solValue) gsolSolRate = Number(lstData.solValue) / 1e9;
      }
    } catch { /* use fallback */ }

    const solPriceUsd = await fetchSolPriceUsd();
    console.log(`💰 Staking prices: SOL=$${solPriceUsd}, GSOL/SOL=${gsolSolRate}`);
    return { solPriceUsd, gsolSolRate };
  }

  // Get staking position + next reward info for a wallet
  app.get('/api/staking/position/:wallet', async (req, res) => {
    try {
      const { wallet } = req.params;
      if (!wallet) return res.status(400).json({ error: 'wallet required' });

      const positions = await storage.getAllActiveStakingPositions();
      const pos = positions.find(p => p.walletAddress === wallet);

      if (!pos || Number(pos.gsolAmount) <= 0) {
        return res.json({ hasPosition: false });
      }

      const { solPriceUsd, gsolSolRate } = await fetchStakingPrices();
      const gsolAmt = Number(pos.gsolAmount);
      const estimatedXP = gsolAmt * gsolSolRate * solPriceUsd;

      const lastPointsAt = pos.lastPointsAt ? new Date(pos.lastPointsAt) : null;
      const nextRewardAt = lastPointsAt ? new Date(lastPointsAt.getTime() + 24 * 60 * 60 * 1000) : new Date();
      const msUntilNext = Math.max(0, nextRewardAt.getTime() - Date.now());
      const hoursUntilNext = Math.floor(msUntilNext / (1000 * 60 * 60));
      const minutesUntilNext = Math.floor((msUntilNext % (1000 * 60 * 60)) / (1000 * 60));
      const readyNow = msUntilNext === 0;

      res.json({
        hasPosition: true,
        gsolAmount: gsolAmt,
        lastPointsAt: lastPointsAt?.toISOString() ?? null,
        nextRewardAt: nextRewardAt.toISOString(),
        hoursUntilNext,
        minutesUntilNext,
        readyNow,
        estimatedXP,
        solPriceUsd,
        gsolSolRate,
      });
    } catch (e: any) {
      console.error('[staking/position]', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Manual trigger for daily staking points (admin only)
  app.post('/api/staking/run-daily-points', async (req, res) => {
    try {
      const { secret } = req.body;
      if (secret !== process.env.VAULT_ADMIN_SECRET) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const { solPriceUsd, gsolSolRate } = await fetchStakingPrices();
      const result = await storage.runDailyStakingPoints(solPriceUsd, gsolSolRate);
      console.log(`⚡ Daily staking points run: ${JSON.stringify(result)}`);
      res.json({ success: true, ...result });
    } catch (e: any) {
      console.error('[staking/run-daily-points]', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Admin: retroactively award XP to all users based on historical transactions
  let xpBackfillRunning = false;
  app.post('/api/admin/backfill-xp', async (req, res) => {
    try {
      const { secret } = req.body;
      if (secret !== process.env.VAULT_ADMIN_SECRET) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (xpBackfillRunning) {
        return res.status(409).json({ error: 'Backfill already in progress' });
      }
      xpBackfillRunning = true;

      const PLATFORM_WALLET_SKIP = 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT';
      const solPriceUsd = await fetchSolPriceUsd();
      const txns = await storage.getAllUnawardedTransactions();
      console.log(`🔄 XP Backfill: processing ${txns.length} unawarded transactions at SOL=$${solPriceUsd}`);

      let walletsProcessed = 0;
      let totalXpAwarded = 0;

      for (const tx of txns) {
        try {
          if (tx.walletAddress === PLATFORM_WALLET_SKIP) {
            await storage.markTransactionXpAwarded(tx.signature);
            continue;
          }

          const solAmount = Number(tx.netAmount);
          if (solAmount > 0 && solPriceUsd > 0) {
            const xp = Math.floor(solAmount * solPriceUsd);
            if (xp > 0) {
              await storage.awardRentClaimPoints(tx.walletAddress, solAmount, tx.itemsProcessed, solPriceUsd);
              totalXpAwarded += xp;
              walletsProcessed++;
            }
          }

          await storage.markTransactionXpAwarded(tx.signature);
        } catch (txErr: any) {
          console.error(`⚠️ Backfill error for tx ${tx.signature}:`, txErr.message);
        }
      }

      console.log(`✅ XP Backfill complete: ${walletsProcessed} txns processed, ${totalXpAwarded} XP awarded`);
      res.json({ success: true, txnsProcessed: walletsProcessed, totalXpAwarded, solPriceUsd });
    } catch (e: any) {
      console.error('[admin/backfill-xp]', e);
      res.status(500).json({ error: e.message });
    } finally {
      xpBackfillRunning = false;
    }
  });

  // Admin: fully recalculate XP from scratch based on total SOL across all transaction types
  let xpRecalcRunning = false;
  app.post('/api/admin/recalculate-xp', async (req, res) => {
    try {
      const { secret } = req.body;
      if (secret !== process.env.VAULT_ADMIN_SECRET) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (xpRecalcRunning) {
        return res.status(409).json({ error: 'Recalculation already in progress' });
      }
      xpRecalcRunning = true;

      const solPriceUsd = await fetchSolPriceUsd();
      console.log(`🔄 XP Recalculate: starting full recalculation at SOL=$${solPriceUsd}`);

      // Get total SOL per wallet across all claimable transaction types
      const walletTotals = await db
        .select({
          walletAddress: transactionLedger.walletAddress,
          totalSol: sql<string>`COALESCE(sum(${transactionLedger.netAmount}), 0)`
        })
        .from(transactionLedger)
        .where(inArray(transactionLedger.transactionType, ['sol_reclaim', 'token_burn', 'nft_burn']))
        .groupBy(transactionLedger.walletAddress);

      const PLATFORM_WALLET_SKIP = 'GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT';
      let walletsUpdated = 0;
      let totalXpSet = 0;

      for (const row of walletTotals) {
        if (row.walletAddress === PLATFORM_WALLET_SKIP) continue;
        const sol = Number(row.totalSol);
        const newXp = Math.floor(sol * solPriceUsd);

        // Upsert: set points to newXp, update totalSolClaimed
        await db
          .insert(userPoints)
          .values({ walletAddress: row.walletAddress, points: newXp, accountsClosed: 0, totalSolClaimed: sol.toFixed(9) })
          .onConflictDoUpdate({
            target: userPoints.walletAddress,
            set: {
              points: newXp,
              totalSolClaimed: sol.toFixed(9),
              lastUpdated: new Date()
            }
          });

        walletsUpdated++;
        totalXpSet += newXp;
      }

      // Mark ALL transactions as xp_awarded so backfill doesn't re-process
      await db
        .update(transactionLedger)
        .set({ xpAwarded: true })
        .where(inArray(transactionLedger.transactionType, ['sol_reclaim', 'token_burn', 'nft_burn']));

      console.log(`✅ XP Recalculate complete: ${walletsUpdated} wallets updated, ${totalXpSet} total XP at $${solPriceUsd}/SOL`);
      res.json({ success: true, walletsUpdated, totalXpSet, solPriceUsd });
    } catch (e: any) {
      console.error('[admin/recalculate-xp]', e);
      res.status(500).json({ error: e.message });
    } finally {
      xpRecalcRunning = false;
    }
  });

  // Daily cron: midnight UTC — award points to all GSOL holders
  cron.schedule('0 0 * * *', async () => {
    try {
      console.log('⏰ Daily staking points cron starting...');
      const { solPriceUsd, gsolSolRate } = await fetchStakingPrices();
      const result = await storage.runDailyStakingPoints(solPriceUsd, gsolSolRate);
      console.log(`✅ Daily staking points done: ${result.walletsAwarded} wallets, ${result.totalPoints} pts, ${result.referralBonus} referral pts`);
    } catch (e: any) {
      console.error('❌ Daily staking points cron failed:', e.message);
    }
  }, { timezone: 'UTC' });

  // ── Vault Partner Routes ────────────────────────────────────────────────

  // GET /api/vault/fee-summary — admin: 3.5% fees collected from all coin flips
  app.get('/api/vault/fee-summary', async (_req, res) => {
    try {
      const { coinFlips: cf } = await import('@shared/schema');
      const now = new Date();
      const last24h = new Date(now.getTime() - 86400000);
      const last7d  = new Date(now.getTime() - 7 * 86400000);

      // Sum platformFee from ALL flips (3.5% collected on every bet regardless of win/loss)
      const [all] = await db.select({
        total: sql<string>`COALESCE(SUM(CAST(${cf.platformFee} AS NUMERIC)), 0)::text`,
        txCount: sql<number>`COUNT(*)`
      }).from(cf).where(isNotNull(cf.platformFee));

      const [day] = await db.select({
        total: sql<string>`COALESCE(SUM(CAST(${cf.platformFee} AS NUMERIC)), 0)::text`,
      }).from(cf).where(and(isNotNull(cf.platformFee), gte(cf.createdAt, last24h)));

      const [week] = await db.select({
        total: sql<string>`COALESCE(SUM(CAST(${cf.platformFee} AS NUMERIC)), 0)::text`,
      }).from(cf).where(and(isNotNull(cf.platformFee), gte(cf.createdAt, last7d)));

      // How much has been credited to partners total
      const { partnerTransactions: pt } = await import('@shared/schema');
      const [distributed] = await db.select({
        total: sql<string>`COALESCE(SUM(CAST(${pt.amountSol} AS NUMERIC)), 0)::text`
      }).from(pt).where(eq(pt.txType, 'fee_credit'));

      const allTimePool = (parseFloat(all?.total ?? '0') * 0.70).toFixed(9);
      const dayPool     = (parseFloat(day?.total  ?? '0') * 0.70).toFixed(9);
      const weekPool    = (parseFloat(week?.total ?? '0') * 0.70).toFixed(9);

      // Live fees wallet balance
      let feesWalletBalance = '0';
      try {
        const feesWalletAddr = process.env.FEES_WALLET ?? '';
        if (feesWalletAddr) {
          const { PublicKey: PK99 } = await import('@solana/web3.js');
          const conn99 = getHeliusConnection();
          const bal = await conn99.getBalance(new PK99(feesWalletAddr));
          feesWalletBalance = (bal / 1e9).toFixed(9);
        }
      } catch (_) {}

      res.json({
        allTimeFees:        all?.total    ?? '0',
        last24hFees:        day?.total    ?? '0',
        last7dFees:         week?.total   ?? '0',
        allTimePartnerPool: allTimePool,
        last24hPartnerPool: dayPool,
        last7dPartnerPool:  weekPool,
        totalDistributed:   distributed?.total ?? '0',
        txCount:            Number(all?.txCount ?? 0),
        feesWalletBalance,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/vault/deposit-address — returns the wallet address partners should deposit to
  app.get('/api/vault/deposit-address', async (_req, res) => {
    try {
      const relayerKey = process.env.RELAYER_PRIVATE_KEY;
      if (!relayerKey) return res.status(500).json({ error: 'Vault not configured' });
      const { Keypair: KPD } = await import('@solana/web3.js');
      const keypair = KPD.fromSecretKey(bs58.decode(relayerKey));
      res.json({ depositAddress: keypair.publicKey.toBase58() });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/vault/stats — public vault totals (+ on-chain vault balance for admin)
  app.get('/api/vault/stats', async (_req, res) => {
    try {
      const stats = await storage.getVaultStats();
      let vaultOnChainBalance = '0';
      try {
        const relayerKey = process.env.RELAYER_PRIVATE_KEY;
        if (relayerKey) {
          const { Keypair: KP } = await import('@solana/web3.js');
          const conn = getHeliusConnection('confirmed');
          const kp = KP.fromSecretKey(bs58.decode(relayerKey));
          const bal = await conn.getBalance(kp.publicKey);
          vaultOnChainBalance = (bal / 1e9).toFixed(9);
        }
      } catch {}
      res.json({ ...stats, vaultOnChainBalance });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/vault/partner/:wallet — get partner record + computed share % + pending uncredited fees
  app.get('/api/vault/partner/:wallet', async (req, res) => {
    try {
      const { wallet } = req.params;
      const partner = await storage.getVaultPartner(wallet);
      const stats = await storage.getVaultStats();
      const totalDeposited = parseFloat(stats.totalDeposited) || 0;
      const myDeposit = partner ? parseFloat(partner.depositedSol) : 0;
      const sharePercent = totalDeposited > 0 ? (myDeposit / totalDeposited) * 100 : 0;

      // Compute pending uncredited fees this partner would receive right now
      let pendingFees = '0';
      try {
        const { coinFlips: cfp, partnerTransactions: ptp } = await import('@shared/schema');
        const { gte: gteP, isNotNull: innP, sql: sqlP, and: andP } = await import('drizzle-orm');
        const [lastDist] = await db.select({ lastTime: sqlP<string>`MAX(${ptp.createdAt})::text` })
          .from(ptp).where(eq(ptp.txType, 'fee_credit'));
        const since = lastDist?.lastTime ? new Date(lastDist.lastTime) : new Date(0);
        const [feeRow] = await db.select({ total: sqlP<string>`COALESCE(SUM(CAST(${cfp.platformFee} AS NUMERIC)), 0)::text` })
          .from(cfp).where(andP(innP(cfp.platformFee), gteP(cfp.createdAt, since)));
        const newFees = parseFloat(feeRow?.total ?? '0');
        const pool = newFees * 0.70;
        const partnerShare = totalDeposited > 0 ? (myDeposit / totalDeposited) * pool : 0;
        pendingFees = partnerShare.toFixed(9);
      } catch (_) {}

      res.json({ partner: partner || null, sharePercent: sharePercent.toFixed(4), totalDeposited: stats.totalDeposited, partnerCount: stats.partnerCount, pendingFees });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/vault/deposit — record a confirmed on-chain deposit
  app.post('/api/vault/deposit', async (req, res) => {
    try {
      const { walletAddress, amountSol, signature } = req.body;
      if (!walletAddress || !amountSol || !signature) return res.status(400).json({ error: 'Missing fields' });
      const amount = parseFloat(amountSol);
      if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
      const partner = await storage.addPartnerDeposit(walletAddress, amount.toString(), signature);
      const stats = await storage.getVaultStats();
      const totalDeposited = parseFloat(stats.totalDeposited) || 0;
      const sharePercent = totalDeposited > 0 ? (parseFloat(partner.depositedSol) / totalDeposited) * 100 : 0;
      res.json({ success: true, partner, sharePercent: sharePercent.toFixed(4) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/vault/withdraw — bot sends deposited SOL back to partner
  // For platform admin wallet: withdraws full vault on-chain balance (minus a small fee reserve)
  app.post('/api/vault/withdraw', async (req, res) => {
    try {
      const { walletAddress, amountSol } = req.body;
      if (!walletAddress) return res.status(400).json({ error: 'Missing walletAddress' });

      const relayerKey = process.env.RELAYER_PRIVATE_KEY;
      if (!relayerKey) return res.status(500).json({ error: 'RELAYER_PRIVATE_KEY not set' });

      const { Keypair: KP2, PublicKey: PK2, Transaction: TX2, SystemProgram: SP2 } = await import('@solana/web3.js');
      const connection = getHeliusConnection('confirmed');
      const senderKeypair = KP2.fromSecretKey(bs58.decode(relayerKey));

      const isAdmin = walletAddress === PLATFORM_WALLET;
      let depositedAmount = 0;
      let lamports: bigint;

      if (isAdmin) {
        const balanceLamports = await connection.getBalance(senderKeypair.publicKey);
        const RESERVE_LAMPORTS = 5_000_000n; // 0.005 SOL kept for tx fees
        const maxAvailable = BigInt(balanceLamports) - RESERVE_LAMPORTS;
        if (maxAvailable <= 0n) return res.status(400).json({ error: 'Vault balance too low to withdraw' });
        if (amountSol && parseFloat(amountSol) > 0) {
          const requested = BigInt(Math.floor(parseFloat(amountSol) * 1e9));
          if (requested > maxAvailable) return res.status(400).json({ error: `Requested amount exceeds available balance (${(Number(maxAvailable) / 1e9).toFixed(6)} SOL)` });
          lamports = requested;
        } else {
          lamports = maxAvailable;
        }
        depositedAmount = Number(lamports) / 1e9;
      } else {
        const partner = await storage.getVaultPartner(walletAddress);
        if (!partner) return res.status(404).json({ error: 'No partner record found' });
        const fullDeposit = parseFloat(partner.depositedSol);
        if (fullDeposit <= 0) return res.status(400).json({ error: 'No deposit to withdraw' });
        if (amountSol && parseFloat(amountSol) > 0) {
          const requested = parseFloat(amountSol);
          if (requested > fullDeposit) return res.status(400).json({ error: `Requested amount exceeds your deposit (${fullDeposit.toFixed(6)} SOL)` });
          depositedAmount = requested;
        } else {
          depositedAmount = fullDeposit;
        }
        lamports = BigInt(Math.floor(depositedAmount * 1e9));
      }

      const transaction = new TX2();
      transaction.add(SP2.transfer({ fromPubkey: senderKeypair.publicKey, toPubkey: new PK2(walletAddress), lamports }));
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = senderKeypair.publicKey;
      transaction.sign(senderKeypair);
      const sig = await connection.sendRawTransaction(transaction.serialize());
      await connection.confirmTransaction(sig, 'confirmed');

      if (!isAdmin) {
        await storage.removePartnerDeposit(walletAddress, depositedAmount.toString());
      }
      res.json({ success: true, signature: sig, amountSol: depositedAmount });
    } catch (e: any) {
      console.error('[Vault Withdraw]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/vault/claim-fees — sends claimable fees to partner from the fees wallet
  app.post('/api/vault/claim-fees', async (req, res) => {
    try {
      const { walletAddress } = req.body;
      if (!walletAddress) return res.status(400).json({ error: 'Missing walletAddress' });
      const partnerBefore = await storage.getVaultPartner(walletAddress);
      if (!partnerBefore) return res.status(404).json({ error: 'No partner record found' });

      // Distribute any pending fees first so partner gets the latest amount
      try { await distributeNewFees(); } catch (_) {}

      // Re-fetch after distribution to get the most up-to-date claimable amount
      const partner = await storage.getVaultPartner(walletAddress);
      if (!partner) return res.status(404).json({ error: 'No partner record found' });
      const claimable = parseFloat(partner.claimableFees);
      if (claimable <= 0) return res.status(400).json({ error: 'No fees to claim — no new coin flip fees have been collected yet' });

      const feesWalletKey = process.env.FEES_WALLET_COINFLIP;
      if (!feesWalletKey) return res.status(500).json({ error: 'FEES_WALLET_COINFLIP not configured' });

      const { Keypair: KP3, PublicKey: PK3, Transaction: TX3, SystemProgram: SP3 } = await import('@solana/web3.js');
      const connection = getHeliusConnection('confirmed');
      const senderKeypair = KP3.fromSecretKey(bs58.decode(feesWalletKey));

      // Check fees wallet has enough balance
      const feesWalletBalance = await connection.getBalance(senderKeypair.publicKey);
      const lamports = Math.floor(claimable * 1e9);
      if (feesWalletBalance < lamports + 10000) {
        return res.status(400).json({ error: `Fees wallet balance too low (${(feesWalletBalance / 1e9).toFixed(6)} SOL). Contact admin.` });
      }

      const transaction = new TX3();
      transaction.add(SP3.transfer({ fromPubkey: senderKeypair.publicKey, toPubkey: new PK3(walletAddress), lamports }));
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = senderKeypair.publicKey;
      transaction.sign(senderKeypair);
      const sig = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false, maxRetries: 5 });
      await connection.confirmTransaction(sig, 'confirmed');

      const claimed = await storage.clearPartnerClaimableFees(walletAddress);
      await storage.createPartnerTransaction({ walletAddress, txType: 'fee_claim', amountSol: claimed, signature: sig });
      console.log(`💰 Partner fee claim: ${claimed} SOL sent to ${walletAddress}, tx: ${sig}`);
      res.json({ success: true, signature: sig, claimedSol: claimed });
    } catch (e: any) {
      console.error('[Vault Claim Fees]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/vault/distribute-fees — admin: distribute fee pool to all partners proportionally
  app.post('/api/vault/distribute-fees', async (req, res) => {
    try {
      const { adminKey, totalFeeSol } = req.body;
      if (adminKey !== process.env.ADMIN_SECRET && adminKey !== process.env.RELAYER_PRIVATE_KEY) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const feeAmount = parseFloat(totalFeeSol);
      if (isNaN(feeAmount) || feeAmount <= 0) return res.status(400).json({ error: 'Invalid fee amount' });

      const partners = await storage.getAllActivePartners();
      const totalDeposited = partners.reduce((sum, p) => sum + parseFloat(p.depositedSol), 0);
      if (totalDeposited <= 0) return res.status(400).json({ error: 'No active partners with deposits' });

      const distributions: { wallet: string; amount: string }[] = [];
      for (const partner of partners) {
        const deposit = parseFloat(partner.depositedSol);
        if (deposit <= 0) continue;
        const share = (deposit / totalDeposited) * feeAmount;
        await storage.creditPartnerFees(partner.walletAddress, share.toFixed(9));
        distributions.push({ wallet: partner.walletAddress, amount: share.toFixed(9) });
      }
      res.json({ success: true, distributed: feeAmount, partners: distributions.length, distributions });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/vault/transactions/:wallet — partner tx history
  app.get('/api/vault/transactions/:wallet', async (req, res) => {
    try {
      const txs = await storage.getPartnerTransactions(req.params.wallet, 30);
      res.json(txs);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Minimum SOL per partner to trigger auto on-chain payout (covers Solana tx fee ~5000 lamports)
  const AUTO_PAY_MIN_SOL = 0.000005;

  // Auto-send claimable fees to each partner's wallet directly from fees wallet (no manual claim needed)
  async function autoPayPartners(): Promise<void> {
    const feesWalletKey = process.env.FEES_WALLET_COINFLIP;
    if (!feesWalletKey) return;

    const partners = await storage.getAllActivePartners();
    if (partners.length === 0) return;

    const { Keypair: KPay, PublicKey: PKay, Transaction: TXpay, SystemProgram: SPay } = await import('@solana/web3.js');
    const payConn = getHeliusConnection('confirmed');
    const senderKeypair = KPay.fromSecretKey(bs58.decode(feesWalletKey));

    for (const partner of partners) {
      const claimable = parseFloat(partner.claimableFees);
      if (claimable < AUTO_PAY_MIN_SOL) continue;

      const lamports = Math.floor(claimable * 1e9);
      // Refresh balance each iteration so we don't over-commit with multiple partners
      const feesWalletBalance = await payConn.getBalance(senderKeypair.publicKey);
      // Leave at least 10000 lamports in fees wallet for future tx fees
      if (feesWalletBalance < lamports + 10000) {
        console.warn(`⚠️ Auto-pay: fees wallet balance insufficient for ${partner.walletAddress} (need ${claimable} SOL, have ${feesWalletBalance / 1e9})`);
        continue;
      }

      try {
        const tx = new TXpay();
        const { blockhash, lastValidBlockHeight } = await payConn.getLatestBlockhash('confirmed');
        tx.recentBlockhash = blockhash;
        tx.feePayer = senderKeypair.publicKey;
        tx.add(SPay.transfer({ fromPubkey: senderKeypair.publicKey, toPubkey: new PKay(partner.walletAddress), lamports }));
        tx.sign(senderKeypair);
        const sig = await payConn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 5 });

        // Wait for confirmation BEFORE clearing — if tx drops, partner keeps their balance
        const confirmation = await payConn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
        if (confirmation.value.err) {
          console.error(`❌ Auto-pay tx failed on-chain for ${partner.walletAddress}:`, confirmation.value.err);
          continue;
        }

        const claimed = await storage.clearPartnerClaimableFees(partner.walletAddress);
        await storage.createPartnerTransaction({ walletAddress: partner.walletAddress, txType: 'fee_auto_pay', amountSol: claimed, signature: sig });
        console.log(`✅ Auto-paid ${claimable} SOL → ${partner.walletAddress}, tx: ${sig}`);
      } catch (err: any) {
        console.error(`❌ Auto-pay failed for ${partner.walletAddress}:`, err.message);
      }
    }
  }

  // Called after each coin flip: credits each partner their share of this flip's fee, then auto-pays
  async function distributeFlipFee(platformFeeSOL: number): Promise<void> {
    if (platformFeeSOL <= 0) return;
    const partners = await storage.getAllActivePartners();
    if (partners.length === 0) return;

    const totalDeposited = partners.reduce((sum, p) => sum + parseFloat(p.depositedSol), 0);
    if (totalDeposited <= 0) return;

    const partnerPool = platformFeeSOL * 0.70;
    if (partnerPool < 0.000000001) return;

    for (const partner of partners) {
      const deposit = parseFloat(partner.depositedSol);
      if (deposit <= 0) continue;
      const share = (deposit / totalDeposited) * partnerPool;
      await storage.creditPartnerFees(partner.walletAddress, share.toFixed(9));
    }
    console.log(`🪙 Flip fee credited: ${partnerPool.toFixed(9)} SOL (70% of ${platformFeeSOL.toFixed(9)}) → ${partners.length} partners`);

    // Immediately attempt on-chain payout to any partner above threshold
    await autoPayPartners();
  }

  // Helper: distribute new coin flip fees to partners (only fees since last distribution)
  async function distributeNewFees(): Promise<{ distributed: number; partners: number }> {
    const partners = await storage.getAllActivePartners();
    const totalDeposited = partners.reduce((sum, p) => sum + parseFloat(p.depositedSol), 0);
    if (totalDeposited <= 0) return { distributed: 0, partners: 0 };

    const { coinFlips: cf2, partnerTransactions: pt2 } = await import('@shared/schema');
    const { gte: gteOp2, isNotNull: isNotNullOp2, sql: sqlOp2, and: andOp2 } = await import('drizzle-orm');

    // Find when fees were last distributed
    const [lastDist] = await db.select({
      lastTime: sqlOp2<string>`MAX(${pt2.createdAt})::text`
    }).from(pt2).where(eq(pt2.txType, 'fee_credit'));
    const since = lastDist?.lastTime ? new Date(lastDist.lastTime) : new Date(Date.now() - 15 * 60 * 1000);

    // Sum platformFee from ALL coin flips since last distribution
    const [feeRow] = await db.select({
      total: sqlOp2<string>`COALESCE(SUM(CAST(${cf2.platformFee} AS NUMERIC)), 0)::text`
    }).from(cf2).where(andOp2(isNotNullOp2(cf2.platformFee), gteOp2(cf2.createdAt, since)));

    const totalFees = parseFloat(feeRow?.total ?? '0');
    const partnerPool = totalFees * 0.70;
    if (partnerPool < 0.000001) return { distributed: 0, partners: 0 };

    for (const partner of partners) {
      const deposit = parseFloat(partner.depositedSol);
      if (deposit <= 0) continue;
      const share = (deposit / totalDeposited) * partnerPool;
      await storage.creditPartnerFees(partner.walletAddress, share.toFixed(9));
    }
    console.log(`✅ Fee distribution: ${partnerPool.toFixed(6)} SOL (70% of ${totalFees.toFixed(6)} SOL) → ${partners.length} partners`);
    return { distributed: partnerPool, partners: partners.length };
  }

  // Safety net: every 15 minutes distribute any missed fees and auto-pay partners
  cron.schedule('*/15 * * * *', async () => {
    try {
      await distributeNewFees();
      await autoPayPartners();
    } catch (e: any) {
      console.error('❌ Vault partner fee cron failed:', e.message);
    }
  });

  // ── /api/perps — Phoenix Perpetuals REST + Vulcan CLI fallback ──────────
  // https://perp-api.phoenix.trade  |  https://ellipsislabs.mintlify.app/api
  const PHOENIX_API = 'https://perp-api.phoenix.trade';

  app.get('/api/perps/markets', async (_req, res) => {
    try {
      // Primary: Phoenix REST /exchange/markets
      const r = await fetch(`${PHOENIX_API}/exchange/markets`);
      if (!r.ok) throw new Error(`Phoenix ${r.status}`);
      res.json(await r.json());
    } catch {
      try { res.json(await vulcanMarketList()); }
      catch (e: any) { res.status(500).json({ error: e.message }); }
    }
  });

  app.get('/api/perps/ticker/:symbol', async (req, res) => {
    const sym = String(req.params.symbol || 'SOL-PERP');
    try {
      // Direct Phoenix API — /v1/market/{symbol}/stats is the real-time stats endpoint
      const r = await fetch(`${PHOENIX_API}/v1/market/${encodeURIComponent(sym)}/stats`);
      if (!r.ok) throw new Error(`Phoenix ${r.status}`);
      res.json(await r.json());
    } catch {
      try {
        const data = await vulcanMarketTicker(sym);
        res.json(data);
      } catch (e: any) { res.status(500).json({ error: e.message }); }
    }
  });

  app.get('/api/perps/orderbook/:symbol', async (req, res) => {
    const sym = String(req.params.symbol || 'SOL-PERP');
    try {
      const depth = Number(req.query.depth) || 15;
      const data = await vulcanMarketOrderbook(sym, depth);
      res.json(data);
    } catch (e: any) {
      try {
        const r = await fetch(`${PHOENIX_API}/v1/view/orderbook/${encodeURIComponent(sym)}`);
        res.json(await r.json());
      } catch { res.status(500).json({ error: e.message }); }
    }
  });

  app.get('/api/perps/candles/:symbol', async (req, res) => {
    const sym     = String(req.params.symbol || 'SOL-PERP');
    const symBase = sym.replace(/-PERP$/i, '');            // "SOL"
    const tfSecs  = Number(req.query.timeframe) || 3600;
    const limit   = Number(req.query.limit) || 120;
    const tfMap: Record<number, string> = {
      60: '1m', 300: '5m', 900: '15m', 1800: '30m', 3600: '1h', 14400: '4h', 86400: '1d',
    };
    const interval = tfMap[tfSecs] ?? '1h';

    function normalizeCandles(data: any): any[] {
      const arr: any[] = Array.isArray(data) ? data : (data?.candles ?? []);
      return arr.map((c: any) => ({
        ...c,
        time: c.time > 1e12 ? Math.floor(c.time / 1000) : (c.time ?? c.t),
        close: c.close ?? c.c, open: c.open ?? c.o,
        high: c.high ?? c.h, low: c.low ?? c.l,
        volume: c.volume ?? c.v ?? 0,
      }));
    }

    // Try 4 sources in order
    const attempts = [
      // 1. Phoenix /candles with full symbol "SOL-PERP"
      () => fetch(`${PHOENIX_API}/candles?symbol=${encodeURIComponent(sym)}&timeframe=${interval}&limit=${limit}`),
      // 2. Phoenix /candles with base symbol "SOL"
      () => fetch(`${PHOENIX_API}/candles?symbol=${encodeURIComponent(symBase)}&timeframe=${interval}&limit=${limit}`),
      // 3. Phoenix /v1/candles (older path)
      () => fetch(`${PHOENIX_API}/v1/candles?symbol=${encodeURIComponent(sym)}&timeframe=${interval}&limit=${limit}`),
    ];

    for (const attempt of attempts) {
      try {
        const r = await attempt();
        if (!r.ok) continue;
        const data = await r.json();
        const candles = normalizeCandles(data);
        if (candles.length > 0) return res.json(candles);
      } catch { /* try next */ }
    }

    // 4. Vulcan CLI fallback
    try {
      const data = await vulcanMarketCandles(sym, interval, limit);
      return res.json(normalizeCandles(data));
    } catch (e: any) {
      return res.status(500).json({ error: `All candle sources failed: ${e.message}` });
    }
  });

  app.get('/api/perps/ta/:symbol', async (req, res) => {
    try {
      const sym = String(req.params.symbol || 'SOL-PERP');
      const tf = String(req.query.timeframe || '1h');
      const data = await vulcanTaReport(sym, tf);
      res.json(data);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Public fills — Phoenix API direct (no Vulcan auth needed)
  app.get('/api/perps/trades/:symbol', async (req, res) => {
    try {
      const sym = encodeURIComponent(String(req.params.symbol || ''));
      const lim = String(req.query.limit || '30');
      const r = await fetch(`${PHOENIX_API}/market/${sym}/fills?limit=${lim}`);
      res.json(await r.json());
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Paper trading (no wallet required) ────────────────────────────────────

  app.post('/api/perps/paper/init', async (req, res) => {
    try {
      const balance = Number(req.body?.balance) || 10000;
      const data = await vulcanPaperInit(balance);
      res.json(data);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/perps/paper/status', async (_req, res) => {
    try { res.json(await vulcanPaperStatus()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/perps/paper/positions', async (_req, res) => {
    try { res.json(await vulcanPaperPositions()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/perps/paper/fills', async (req, res) => {
    try {
      const limit = Number(req.query.limit) || 20;
      res.json(await vulcanPaperFills(limit));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/perps/paper/trade', async (req, res) => {
    try {
      const { symbol, side, notionalUsdc } = req.body || {};
      if (!symbol || !side || !notionalUsdc) {
        return res.status(400).json({ error: 'symbol, side, notionalUsdc required' });
      }
      const data = side === 'buy'
        ? await vulcanPaperBuy(String(symbol), Number(notionalUsdc))
        : await vulcanPaperSell(String(symbol), Number(notionalUsdc));
      res.json(data);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Phoenix REST — Exchange config, Trader state, Registration ───────────

  app.get('/api/perps/exchange', async (_req, res) => {
    try {
      const r = await fetch(`${PHOENIX_API}/exchange`);
      res.json(await r.json());
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/perps/trader/:authority', async (req, res) => {
    try {
      const { authority } = req.params;
      const pdaIndex = String(req.query.pdaIndex || '0');
      const r = await fetch(
        `${PHOENIX_API}/trader/${encodeURIComponent(authority)}/state?pdaIndex=${pdaIndex}`
      );
      res.json(await r.json());
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/perps/register', async (req, res) => {
    try {
      const { authority, code } = req.body || {};
      const r = await fetch(`${PHOENIX_API}/v1/invite/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authority, code }),
      });
      const data = await r.json();
      res.status(r.status).json(data);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /exchange/keys — exchange-level identifiers and authorities
  app.get('/api/perps/exchange/keys', async (_req, res) => {
    try {
      const r = await fetch(`${PHOENIX_API}/exchange/keys`);
      if (!r.ok) throw new Error(`Phoenix ${r.status}`);
      res.json(await r.json());
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /exchange/market/:symbol — single market static config
  app.get('/api/perps/exchange/market/:symbol', async (req, res) => {
    try {
      const sym = encodeURIComponent(String(req.params.symbol || ''));
      const r = await fetch(`${PHOENIX_API}/exchange/market/${sym}`);
      if (!r.ok) throw new Error(`Phoenix ${r.status}`);
      res.json(await r.json());
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /v1/exchange/snapshot — full live snapshot: slot, mark prices, all markets
  app.get('/api/perps/exchange/snapshot', async (_req, res) => {
    try {
      const r = await fetch(`${PHOENIX_API}/v1/exchange/snapshot`);
      if (!r.ok) throw new Error(`Phoenix ${r.status}`);
      res.json(await r.json());
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /v1/market/next-commodity-market-transition — commodity open/afterHours state
  app.get('/api/perps/commodity-transition', async (_req, res) => {
    try {
      const r = await fetch(`${PHOENIX_API}/v1/market/next-commodity-market-transition`);
      if (!r.ok) throw new Error(`Phoenix ${r.status}`);
      res.json(await r.json());
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  const httpServer = createServer(app);
  return httpServer;
}
