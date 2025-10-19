import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTransactionRecordSchema, insertEmptyTokenAccountSchema, insertScanResultSchema, insertTransactionLedgerSchema, insertTokenBurnRecordSchema, insertNftBurnRecordSchema, insertReferralCodeSchema, insertReferralTransactionSchema, referralCodes } from "@shared/schema";
import { nanoid } from "nanoid";
import { eq } from 'drizzle-orm';
import { db } from './db';
import { Connection, PublicKey, Transaction, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createBurnInstruction, createBurnCheckedInstruction, createCloseAccountInstruction } from "@solana/spl-token";
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

export async function registerRoutes(app: Express): Promise<Server> {
  // Token search endpoint
  app.get("/api/tokens/search", async (req, res) => {
    try {
      const { q, limit = '50' } = req.query;
      
      console.log('Token search request:', q);
      
      if (!q || typeof q !== 'string') {
        return res.json({ tokens: [] });
      }

      // Use Jupiter's search API
      const response = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(q)}`);
      if (!response.ok) {
        console.error('Failed to fetch token list:', response.status);
        return res.json({ tokens: [] });
      }

      const data = await response.json();
      const limitNum = parseInt(limit as string, 10);
      
      // Map Jupiter's response to our format
      const tokens = (data.tokens || [])
        .slice(0, limitNum)
        .map((t: any) => ({
          address: t.address,
          symbol: t.symbol,
          name: t.name,
          decimals: t.decimals,
          logoURI: t.logoURI
        }));

      console.log(`Found ${tokens.length} tokens for query "${q}"`);
      res.json({ tokens });
    } catch (error) {
      console.error('Token search error:', error);
      res.json({ tokens: [] });
    }
  });

  // Jupiter Ultra Swap - Get Order endpoint (replaces quote + swap)
  app.get("/api/jupiter/ultra/order", async (req, res) => {
    try {
      const { inputMint, outputMint, amount, taker } = req.query;
      
      if (!inputMint || !outputMint || !amount) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      // Ultra Swap Referral Configuration (TEMPORARILY DISABLED)
      // 0.50% referral fee (50 bps): You get 80% = 0.40%, Jupiter gets 20% = 0.10%
      // const referralAccount = "5fiaP6GJBixn5N1pZT5dUer1MUkdAiKMg7tBMPbFyZdB";
      // const referralFee = 50; // 0.50% (50 bps)
      // TODO: Re-enable after verifying referral token account setup

      // Build order URL without referral params (temporarily)
      const orderUrl = new URL('https://lite-api.jup.ag/ultra/v1/order');
      orderUrl.searchParams.append('inputMint', inputMint as string);
      orderUrl.searchParams.append('outputMint', outputMint as string);
      orderUrl.searchParams.append('amount', amount as string);
      if (taker) {
        orderUrl.searchParams.append('taker', taker as string);
      }
      // Referral params commented out temporarily
      // orderUrl.searchParams.append('referralAccount', referralAccount);
      // orderUrl.searchParams.append('referralFee', referralFee.toString());
      
      console.log('🚀 Ultra Swap Order URL:', orderUrl.toString());
      
      const response = await fetch(orderUrl.toString(), {
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Jupiter Ultra order error:', response.status, errorText);
        return res.status(response.status).json({ error: errorText || 'Failed to get order' });
      }

      const orderData = await response.json();
      console.log('✅ Ultra Order received:', {
        requestId: orderData.requestId,
        feeMint: orderData.feeMint,
        feeBps: orderData.feeBps,
        hasTransaction: !!orderData.transaction
      });
      
      res.json(orderData);
    } catch (error) {
      console.error('Jupiter Ultra order proxy error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Jupiter Ultra Swap - Execute Order endpoint (replaces send-transaction)
  app.post("/api/jupiter/ultra/execute", async (req, res) => {
    try {
      const { signedTransaction, requestId } = req.body;
      
      if (!signedTransaction || !requestId) {
        return res.status(400).json({ error: 'Missing required parameters: signedTransaction, requestId' });
      }

      console.log('🚀 Executing Ultra Swap with requestId:', requestId);

      const response = await fetch('https://lite-api.jup.ag/ultra/v1/execute', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
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

      const executeData = await response.json();
      
      if (executeData.status === "Success") {
        console.log('✅ Ultra Swap successful:', executeData.signature);
        console.log('   View on Solscan:', `https://solscan.io/tx/${executeData.signature}`);
      } else {
        console.log('❌ Ultra Swap failed:', executeData.status);
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

  // Get all wallet token accounts with metadata
  app.get("/api/wallet/all-tokens", async (req, res) => {
    try {
      const { address } = req.query;
      
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ error: 'Missing address parameter' });
      }

      const heliusKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
      const rpcUrl = heliusKey 
        ? `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`
        : 'https://api.mainnet-beta.solana.com';

      const connection = new Connection(rpcUrl, 'confirmed');
      const walletPubkey = new PublicKey(address);

      // Get native SOL balance
      const solBalance = await connection.getBalance(walletPubkey);
      const solBalanceInSol = solBalance / 1e9;

      // Get all token accounts
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        walletPubkey,
        { programId: TOKEN_PROGRAM_ID }
      );

      const tokensWithBalance = tokenAccounts.value
        .map((account) => {
          const accountData = account.account.data.parsed.info;
          return {
            mint: accountData.mint,
            balance: parseFloat(accountData.tokenAmount.uiAmount || '0'),
            balanceRaw: accountData.tokenAmount.amount,
            decimals: accountData.tokenAmount.decimals
          };
        })
        .filter(t => t.balance > 0);

      // Add SOL as first token if balance > 0
      if (solBalanceInSol > 0) {
        tokensWithBalance.unshift({
          mint: 'So11111111111111111111111111111111111111112',
          balance: solBalanceInSol,
          balanceRaw: solBalance.toString(),
          decimals: 9
        });
      }

      // Fetch metadata for each token using Jupiter's search API
      const tokensWithMetadata = await Promise.all(
        tokensWithBalance.map(async (token) => {
          try {
            // Use Jupiter's search API with the mint address
            const response = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${token.mint}`);
            if (response.ok) {
              const searchResults = await response.json();
              // Find exact match by address
              const metadata = Array.isArray(searchResults) 
                ? searchResults.find((t: any) => t.id === token.mint)
                : null;
              
              if (metadata) {
                return {
                  address: token.mint,
                  symbol: metadata.symbol || 'UNKNOWN',
                  name: metadata.name || 'Unknown Token',
                  decimals: token.decimals,
                  logoURI: metadata.icon || '',
                  balance: token.balance,
                  balanceRaw: token.balanceRaw
                };
              }
            }
          } catch (err) {
            console.error(`Error fetching metadata for ${token.mint}:`, err);
          }
          
          // Fallback if metadata not found
          return {
            address: token.mint,
            symbol: 'UNKNOWN',
            name: 'Unknown Token',
            decimals: token.decimals,
            logoURI: '',
            balance: token.balance,
            balanceRaw: token.balanceRaw
          };
        })
      );

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

      const heliusKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
      const rpcUrl = heliusKey 
        ? `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`
        : 'https://api.mainnet-beta.solana.com';

      const connection = new Connection(rpcUrl, 'confirmed');
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

  // Get Helius configuration
  app.get("/api/helius-config", async (req, res) => {
    const apiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY || "";
    if (apiKey) {
      res.json({
        success: true,
        apiKey: apiKey,
        rpcUrl: `https://mainnet.helius-rpc.com/?api-key=${apiKey}`
      });
    } else {
      res.json({
        success: false,
        message: "No Helius API key configured"
      });
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

      // Get RPC endpoint with fallbacks
      const heliusApiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
      const rpcEndpoints = [
        heliusApiKey ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}` : null,
        'https://api.mainnet-beta.solana.com',
        'https://solana-api.projectserum.com',
        'https://rpc.ankr.com/solana'
      ].filter(Boolean);

      let connection: Connection | null = null;
      let workingEndpoint = '';

      // Try each endpoint until one works
      for (const endpoint of rpcEndpoints) {
        try {
          const testConnection = new Connection(endpoint as string, 'confirmed');
          await testConnection.getLatestBlockhash();
          connection = testConnection;
          workingEndpoint = endpoint as string;
          break;
        } catch (error) {
          console.log(`RPC endpoint ${endpoint && endpoint.includes('api-key=') ? endpoint.replace(/api-key=[^&]*/, 'api-key=****') : endpoint} failed, trying next...`);
        }
      }

      if (!connection) {
        return res.status(503).json({ error: "All RPC endpoints are currently unavailable" });
      }

      console.log(`Using RPC endpoint: ${workingEndpoint.includes('api-key=') ? workingEndpoint.replace(/api-key=[^&]*/, `api-key=****${heliusApiKey ? heliusApiKey.slice(-4) : 'none'}`) : workingEndpoint}`);

      const walletPublicKey = new PublicKey(address);
      
      // Get all token accounts for the wallet
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPublicKey, {
        programId: TOKEN_PROGRAM_ID,
      });

      const emptyAccounts = [];
      let totalReclaimable = 0;

      for (const accountInfo of tokenAccounts.value) {
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
        totalAccounts: tokenAccounts.value.length,
        emptyAccounts: emptyAccounts.length,
        totalReclaimable: totalReclaimable.toString()
      });

      // Store empty accounts
      for (const account of emptyAccounts) {
        await storage.createEmptyTokenAccount(account);
      }

      const response = {
        success: true,
        walletAddress: address,
        totalAccounts: tokenAccounts.value.length,
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

  // Prepare transaction for SOL refund
  app.post("/api/sol-refund/prepare-transaction", async (req, res) => {
    try {
      const { walletAddress, selectedAccounts, donationPercentage, referralCode } = req.body;
      
      // Check for permanent wallet association first (first referral wins forever)
      let referralCodeData = null;
      let permanentAssociation = await storage.getWalletReferralAssociation(walletAddress);
      
      if (permanentAssociation) {
        // Use permanent association
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

      // Get empty accounts from storage
      const emptyAccounts = await storage.getEmptyTokenAccountsByWallet(walletAddress);
      const selectedAccountsSet = new Set(selectedAccounts);
      const accountsToClose = emptyAccounts.filter(account => 
        selectedAccountsSet.has(account.accountAddress)
      );

      if (accountsToClose.length === 0) {
        return res.status(400).json({ error: "No valid accounts to close" });
      }

      // Get RPC connection
      const heliusApiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
      const rpcUrl = heliusApiKey ? 
        `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}` : 
        'https://api.mainnet-beta.solana.com';
      
      const connection = new Connection(rpcUrl, 'confirmed');

      // Read actual account lamports for precise calculations
      let totalRecoveredLamports = 0;
      const accountInfos = [];
      
      for (const account of accountsToClose) {
        try {
          const accountPublicKey = new PublicKey(account.accountAddress);
          const accountInfo = await connection.getAccountInfo(accountPublicKey);
          if (accountInfo) {
            totalRecoveredLamports += accountInfo.lamports;
            accountInfos.push({ ...account, lamports: accountInfo.lamports });
          }
        } catch (error) {
          console.log(`Error getting account info for ${account.accountAddress}:`, error);
          // Fallback to stored rent amount
          const fallbackLamports = Math.round(parseFloat(account.rentAmount) * 1e9);
          totalRecoveredLamports += fallbackLamports;
          accountInfos.push({ ...account, lamports: fallbackLamports });
        }
      }

      // Create transaction to close token accounts
      const transaction = new Transaction();
      
      // Add close account instructions for each empty account
      const { createCloseAccountInstruction } = await import('@solana/spl-token');
      
      for (const account of accountsToClose) {
        const accountPublicKey = new PublicKey(account.accountAddress);
        const ownerPublicKey = new PublicKey(walletAddress);
        
        // Detect if account is Token-2022 or standard Token Program
        let programId = TOKEN_PROGRAM_ID;
        try {
          const accountInfo = await connection.getAccountInfo(accountPublicKey);
          if (accountInfo && accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
            programId = TOKEN_2022_PROGRAM_ID;
            console.log(`Account ${account.accountAddress} uses Token-2022`);
          }
        } catch (error) {
          console.log(`Could not detect program for ${account.accountAddress}, using default`);
        }
        
        const closeInstruction = createCloseAccountInstruction(
          accountPublicKey,
          ownerPublicKey, // destination (user receives SOL)
          ownerPublicKey, // owner
          [],             // no multisig
          programId       // correct program ID
        );
        
        transaction.add(closeInstruction);
      }

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
      
      // Calculate fees in lamports - always charge 15% total (server-enforced)
      const PLATFORM_FEE_PERCENTAGE = 15; // Server-enforced 15% total fee
      const totalFeeLamports = Math.floor(totalRecoveredLamports * (PLATFORM_FEE_PERCENTAGE / 100));
      
      let referralFeeLamports = 0;
      let platformFeeLamports = totalFeeLamports;
      
      console.log(`Fee calculation: recovered=${totalRecoveredLamports} lamports, total fee=${totalFeeLamports} lamports (${PLATFORM_FEE_PERCENTAGE}%)`);
      
      // Check referral wallet BEFORE calculating final fees
      let referralWalletExists = false;
      if (referralCodeData && totalFeeLamports > 0) {
        const referralWalletPublicKey = new PublicKey(referralCodeData.walletAddress);
        
        // Check if referral wallet exists (has SOL balance)
        try {
          const referralBalance = await connection.getBalance(referralWalletPublicKey);
          referralWalletExists = referralBalance > 0;
          console.log(`Referral wallet ${referralCodeData.walletAddress} balance: ${referralBalance} lamports, exists: ${referralWalletExists}`);
        } catch (error) {
          console.log('Failed to check referral wallet balance:', error);
          referralWalletExists = false;
        }
        
        if (referralWalletExists) {
          // 50% of total fee goes to referral, 50% stays with platform
          referralFeeLamports = Math.floor(totalFeeLamports * 0.5);
          platformFeeLamports = totalFeeLamports - referralFeeLamports;
          console.log(`✅ Referral wallet exists - platform=${platformFeeLamports} (50% of 15%), referral=${referralFeeLamports} (50% of 15%)`);
        } else {
          // Referral wallet doesn't exist, all fees go to platform
          platformFeeLamports = totalFeeLamports;
          referralFeeLamports = 0;
          console.log(`❌ Referral wallet ${referralCodeData.walletAddress} doesn't exist - platform gets all: ${platformFeeLamports} lamports`);
        }
      }
      
      // Calculate net amount after platform fees only
      const netLamports = Math.max(0, totalRecoveredLamports - totalFeeLamports);
      
      // Add fee transfer instructions AFTER close instructions
      // Fees are paid from SOL recovered by closing accounts
      if (platformFeeLamports > 0) {
        const feeCollectorPublicKey = new PublicKey('9gigncDCysCcmfYStcSYhoo4bL6Se2SPxsiivwRXQqcf');
        
        const platformFeeTransferInstruction = SystemProgram.transfer({
          fromPubkey: new PublicKey(walletAddress),
          toPubkey: feeCollectorPublicKey,
          lamports: platformFeeLamports,
        });
        
        transaction.add(platformFeeTransferInstruction);
        console.log(`Platform fee transfer added: ${platformFeeLamports} lamports`);
      }
      
      // Add referral fee transfer only if referral wallet exists
      if (referralFeeLamports > 0 && referralCodeData && referralWalletExists) {
        const referralWalletPublicKey = new PublicKey(referralCodeData.walletAddress);
        
        const referralFeeTransferInstruction = SystemProgram.transfer({
          fromPubkey: new PublicKey(walletAddress),
          toPubkey: referralWalletPublicKey,
          lamports: referralFeeLamports,
        });
        
        transaction.add(referralFeeTransferInstruction);
        console.log(`Referral fee transfer added: ${referralFeeLamports} lamports to ${referralCodeData.walletAddress}`);
      }
      

      // Serialize transaction
      const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
      const transactionBase64 = serializedTransaction.toString('base64');

      // Convert lamports to SOL for response
      const totalSolReclaimed = totalRecoveredLamports / 1e9;
      const totalFeeAmount = totalFeeLamports / 1e9;
      const platformFeeAmount = platformFeeLamports / 1e9;
      const referralFeeAmount = referralFeeLamports / 1e9;
      const netAmount = netLamports / 1e9;
      

      res.json({
        transaction: transactionBase64,
        message: `Prepared transaction to close ${accountsToClose.length} accounts`,
        totalSolReclaimed: totalSolReclaimed,
        feeAmount: totalFeeAmount,
        platformFeeAmount: platformFeeAmount,
        referralFeeAmount: referralFeeAmount,
        netAmount: netAmount,
        referralCodeUsed: referralCode || null,
        feeInfo: {
          feePercentage: PLATFORM_FEE_PERCENTAGE,
          totalFeeLamports: totalFeeLamports,
          platformFeeLamports: platformFeeLamports,
          referralFeeLamports: referralFeeLamports,
          estimatedTxFeeLamports: estimatedTxFeeLamports
        }
      });

    } catch (error) {
      console.error("Prepare transaction error:", error);
      res.status(500).json({ error: "Failed to prepare transaction" });
    }
  });

  // Record successful transaction
  app.post("/api/sol-refund/record-success", async (req, res) => {
    try {
      const { signature, walletAddress, accountsClosed, solRecovered, netAmount, feeAmount, referralCodeUsed, platformFeeAmount, referralFeeAmount } = req.body;

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

  // Get SOL refund statistics
  app.get("/api/sol-refund/stats", async (req, res) => {
    try {
      const totalSolRecovered = await storage.getTotalSolRecovered();
      const totalAccountsClaimed = await storage.getTotalAccountsClaimed();
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
          const rpcUrl = heliusApiKey ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}` : 'https://api.mainnet-beta.solana.com';
          const { Connection } = await import('@solana/web3.js');
          const connection = new Connection(rpcUrl, 'confirmed');

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
      const rpcUrl = heliusApiKey ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}` : 'https://api.mainnet-beta.solana.com';
      const connection = new Connection(rpcUrl, 'confirmed');

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

      // Get RPC connection
      const heliusApiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
      const rpcEndpoints = [
        heliusApiKey ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}` : null,
        'https://api.mainnet-beta.solana.com',
        'https://solana-api.projectserum.com',
        'https://rpc.ankr.com/solana'
      ].filter(Boolean);

      let connection: Connection | null = null;
      let workingEndpoint = '';

      for (const endpoint of rpcEndpoints) {
        try {
          const testConnection = new Connection(endpoint as string, 'confirmed');
          await testConnection.getLatestBlockhash();
          connection = testConnection;
          workingEndpoint = endpoint as string;
          break;
        } catch (error) {
          console.log(`RPC endpoint ${endpoint && endpoint.includes('api-key=') ? endpoint.replace(/api-key=[^&]*/, 'api-key=****') : endpoint} failed, trying next...`);
        }
      }

      if (!connection) {
        return res.status(503).json({ error: "All RPC endpoints are currently unavailable" });
      }

      console.log(`Using RPC endpoint: ${workingEndpoint.includes('api-key=') ? workingEndpoint.replace(/api-key=[^&]*/, `api-key=****${heliusApiKey ? heliusApiKey.slice(-4) : 'none'}`) : workingEndpoint}`);

      const walletPublicKey = new PublicKey(address);

      // Use Helius DAS API to get all assets with metadata
      let tokens: any[] = [];
      if (!heliusApiKey) {
        return res.status(500).json({ error: "Helius API key is required for token scanning" });
      }

      try {
        const heliusRpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
        const rpcUrl = heliusRpcUrl; // Make rpcUrl available in scope
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
                const decimals = asset.token_info?.decimals || 0;
                const displayBalance = balance / Math.pow(10, decimals);
                
                // Only show tokens with meaningful balances (> 0.001) or empty accounts that can be closed
                return displayBalance > 0.001 || balance === 0;
              });

            console.log(`Found ${fungibleTokens.length} fungible tokens with meaningful balances`);

            // Use Solana RPC to check if tokens are actually burnable
            const { Connection, PublicKey } = await import('@solana/web3.js');
            const { getAssociatedTokenAddress, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } = await import('@solana/spl-token');
            
            const connection = new Connection(rpcUrl, 'confirmed');
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

            // Add Jupiter Token List fallback for logos
            let jupiterTokenMap: any = {};
            try {
              const jupiterResponse = await fetch('https://token.jup.ag/strict');
              if (jupiterResponse.ok) {
                const jupiterTokens = await jupiterResponse.json();
                jupiterTokenMap = jupiterTokens.reduce((map: any, token: any) => {
                  map[token.address] = token.logoURI;
                  return map;
                }, {});
                console.log(`📋 Loaded ${Object.keys(jupiterTokenMap).length} tokens from Jupiter registry`);
              }
            } catch (error) {
              console.log(`⚠️  Failed to load Jupiter token list:`, error);
            }

            tokens = burnableTokens.map((asset: any) => {
              const balance = (asset.token_info?.balance || 0) / Math.pow(10, asset.token_info?.decimals || 0);
              const isEmpty = balance === 0;
              
              // Use Helius CDN URLs first (optimized), then fallbacks
              let logo = null;
              
              // Priority 1: Helius CDN URL (optimized)
              if (asset.content?.files?.[0]?.cdn_uri) {
                logo = asset.content.files[0].cdn_uri;
              }
              // Priority 2: Original URI from files
              else if (asset.content?.files?.[0]?.uri) {
                logo = asset.content.files[0].uri;
              }
              // Priority 3: Metadata image
              else if (asset.content?.metadata?.image) {
                logo = asset.content.metadata.image;
              }
              // Priority 4: Jupiter Token List fallback
              else if (jupiterTokenMap[asset.id]) {
                logo = jupiterTokenMap[asset.id];
                console.log(`🔄 Using Jupiter logo for ${asset.content?.metadata?.symbol}: ${logo}`);
              }
              
              console.log(`🖼️  Token ${asset.content?.metadata?.symbol || 'Unknown'} logo data:`, {
                hasCdnUri: !!asset.content?.files?.[0]?.cdn_uri,
                cdnUri: asset.content?.files?.[0]?.cdn_uri,
                originalUri: asset.content?.files?.[0]?.uri,
                metadataImage: asset.content?.metadata?.image,
                jupiterLogo: jupiterTokenMap[asset.id],
                finalLogo: logo,
                selectedPriority: asset.content?.files?.[0]?.cdn_uri ? 'CDN' : 
                                asset.content?.files?.[0]?.uri ? 'Original' :
                                asset.content?.metadata?.image ? 'Metadata' :
                                jupiterTokenMap[asset.id] ? 'Jupiter' : 'None'
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
            
            console.log(`Processed ${tokens.length} truly burnable tokens (excluded ${fungibleTokens.length - tokens.length} frozen/inaccessible tokens)`);
          }
        }
      } catch (error) {
        console.log(`Failed to fetch assets from Helius DAS:`, error instanceof Error ? error.message : String(error));
        return res.status(500).json({ error: "Failed to fetch tokens from Helius API" });
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
      const rpcUrl = heliusApiKey 
        ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
        : 'https://api.mainnet-beta.solana.com';
      
      console.log(`Creating bulk token burn transaction for ${tokenMints.length} tokens...`);
      console.log('Referral code data:', referralCodeData);
      console.log('Permanent association:', permanentAssociation);
      
      const connection = new Connection(rpcUrl, 'confirmed');
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

      // Create transaction with burn+close instructions
      const transaction = new Transaction();
      
      // Add priority fee instruction first (0.00001 SOL = 10,000 microlamports)
      const { ComputeBudgetProgram } = await import('@solana/web3.js');
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: 10000 // Fixed priority fee for faster confirmation
        })
      );
      console.log('⚡ Added priority fee instruction: 0.00001 SOL (10,000 microlamports) for faster transaction confirmation');
      
      for (const token of validTokens) {
        const mintPublicKey = new PublicKey(token.mint);
        const isToken2022 = token.programId.equals(TOKEN_2022_PROGRAM_ID);
        
        // Step 1: Burn tokens (if balance > 0)
        if (token.balance > 0) {
          // Use BurnChecked for Token-2022 (required for extensions like transfer fees)
          const burnInstruction = isToken2022
            ? createBurnCheckedInstruction(
                token.account,      // Token account to burn from
                mintPublicKey,      // Token mint
                ownerPublicKey,     // Owner
                token.balance,      // Amount to burn (full balance)
                token.decimals,     // Decimals (required for checked instruction)
                [],                 // Additional signers
                TOKEN_2022_PROGRAM_ID  // Token-2022 program
              )
            : createBurnInstruction(
                token.account,    // Token account to burn from
                mintPublicKey,    // Token mint
                ownerPublicKey,   // Owner
                token.balance     // Amount to burn (full balance)
              );
          transaction.add(burnInstruction);
          console.log(`Added ${isToken2022 ? 'BurnChecked' : 'Burn'} instruction for ${token.mint}`);
        }
        
        // Step 2: Close the now-empty account to reclaim SOL
        const closeInstruction = createCloseAccountInstruction(
          token.account,
          ownerPublicKey,     // destination (receives SOL)
          ownerPublicKey,     // owner
          [],                 // no multisig
          token.programId     // correct program ID (TOKEN_PROGRAM_ID or TOKEN_2022_PROGRAM_ID)
        );
        
        transaction.add(closeInstruction);
      }
      
      // Get recent blockhash for fee estimation
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = ownerPublicKey;

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

      // Calculate fees in lamports with proper capping (15% fee)
      const donationFactor = 0.15; // 15% fee for token burning
      const requestedFeeLamports = Math.floor(totalRecoveredLamports * donationFactor);
      const safetyBufferLamports = 50000; // 0.00005 SOL buffer
      const maxAllowedFeeLamports = Math.max(0, totalRecoveredLamports - estimatedTxFeeLamports - safetyBufferLamports);
      const totalFeeLamports = Math.min(requestedFeeLamports, maxAllowedFeeLamports);
      
      let referralFeeLamports = 0;
      let platformFeeLamports = totalFeeLamports;
      
      // Check referral wallet BEFORE calculating final fees
      let referralWalletExists = false;
      if (referralCodeData && totalFeeLamports > 0) {
        const referralWalletPublicKey = new PublicKey(referralCodeData.walletAddress);
        
        // Check if referral wallet exists (has SOL balance)
        try {
          const referralBalance = await connection.getBalance(referralWalletPublicKey);
          referralWalletExists = referralBalance > 0;
          console.log(`TOKEN BURN - Referral wallet ${referralCodeData.walletAddress} balance: ${referralBalance} lamports, exists: ${referralWalletExists}`);
        } catch (error) {
          console.log('TOKEN BURN - Failed to check referral wallet balance:', error);
          referralWalletExists = false;
        }
        
        if (referralWalletExists) {
          // 50% of fee goes to referral
          referralFeeLamports = Math.floor(totalFeeLamports * 0.5);
          // 50% of fee stays with platform
          platformFeeLamports = totalFeeLamports - referralFeeLamports;
          console.log(`TOKEN BURN ✅ Referral wallet exists - splitting fees: platform=${platformFeeLamports}, referral=${referralFeeLamports}`);
        } else {
          // Referral wallet doesn't exist, all fees go to platform
          platformFeeLamports = totalFeeLamports;
          referralFeeLamports = 0;
          console.log(`TOKEN BURN ❌ Referral wallet ${referralCodeData.walletAddress} doesn't exist - all fees to platform: ${platformFeeLamports}`);
        }
      } else {
        console.log('TOKEN BURN - No referral code data - using full platform fee');
      }
      
      // Calculate net amount after platform fees only
      const netLamports = Math.max(0, totalRecoveredLamports - totalFeeLamports);

      // Add fee transfer instructions AFTER burn instructions
      if (platformFeeLamports > 0) {
        const feeCollectorPublicKey = new PublicKey('9gigncDCysCcmfYStcSYhoo4bL6Se2SPxsiivwRXQqcf');
        
        const platformFeeTransferInstruction = SystemProgram.transfer({
          fromPubkey: ownerPublicKey,
          toPubkey: feeCollectorPublicKey,
          lamports: platformFeeLamports,
        });
        
        transaction.add(platformFeeTransferInstruction);
        console.log(`TOKEN BURN - Platform fee transfer added: ${platformFeeLamports} lamports`);
      }
      
      // Add referral fee transfer only if referral wallet exists
      if (referralFeeLamports > 0 && referralCodeData && referralWalletExists) {
        const referralWalletPublicKey = new PublicKey(referralCodeData.walletAddress);
        
        const referralFeeTransferInstruction = SystemProgram.transfer({
          fromPubkey: ownerPublicKey,
          toPubkey: referralWalletPublicKey,
          lamports: referralFeeLamports,
        });
        
        transaction.add(referralFeeTransferInstruction);
        console.log(`TOKEN BURN - Referral fee transfer added: ${referralFeeLamports} lamports to ${referralCodeData.walletAddress}`);
      }
      
      // Serialize transaction
      console.log(`📦 Transaction contains ${transaction.instructions.length} instructions (priority fee + burn/close + fee transfers)`);
      const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
      const transactionBase64 = serializedTransaction.toString('base64');
      
      // Convert lamports to SOL for response
      const totalSolRecovered = totalRecoveredLamports / 1e9;
      const totalFeeAmount = totalFeeLamports / 1e9;
      const platformFeeAmount = platformFeeLamports / 1e9;
      const referralFeeAmount = referralFeeLamports / 1e9;
      const netAmount = netLamports / 1e9;
      
      console.log(`Bulk token burn transaction prepared: ${validTokens.length} tokens, ${totalSolRecovered.toFixed(8)} SOL (${netAmount.toFixed(8)} net after ${totalFeeAmount.toFixed(8)} fee)`);
      
      res.json({
        transaction: transactionBase64,
        tokensProcessed: validTokens.length,
        solRecovered: totalSolRecovered.toFixed(8),
        feeAmount: totalFeeAmount.toFixed(8),
        platformFeeAmount: platformFeeAmount.toFixed(8),
        referralFeeAmount: referralFeeAmount.toFixed(8),
        netAmount: netAmount.toFixed(8),
        referralCodeUsed: referralCode || null,
        message: `Bulk burn transaction prepared for ${validTokens.length} tokens (${netAmount.toFixed(6)} SOL net after 15% fee)`,
        feeCapInfo: {
          requestedFeeLamports,
          maxAllowedFeeLamports,
          actualFeeLamports: totalFeeLamports,
          estimatedTxFeeLamports,
          safetyBufferLamports
        }
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
      const rpcUrl = heliusApiKey 
        ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
        : 'https://api.mainnet-beta.solana.com';
      
      console.log('Creating token burn transaction...');
      
      const connection = new Connection(rpcUrl, 'confirmed');
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
      const { signature, walletAddress, tokenMints, tokensProcessed, solRecovered, netAmount, feeAmount, referralCodeUsed, platformFeeAmount, referralFeeAmount } = req.body;

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
        
        // Skip compressed NFTs 
        if (compression?.compressed) {
          continue;
        }
        
        let nftType: string;
        
        // Identify NFT type based on interface and ownership
        if (assetInterface === 'MplCoreAsset') {
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

        const nftInfo = {
          mint: mintAddress,
          id: identifier, 
          assetId: assetId,
          name: nftName,
          symbol: asset.content?.metadata?.symbol || '',
          image: nftImage, // Use the enhanced image from metadata fetch
          description: nftDescription, // Use the enhanced description from metadata fetch
          type: nftType,
          interface: assetInterface,
          tokenStandard: asset.token_info?.token_standard || '',
          compressed: compression?.compressed || false,
          creators: asset.creators || [],
          collection: asset.grouping?.find((g: any) => g.group_key === 'collection')?.group_value || null,
          attributes: asset.content?.metadata?.attributes || [],
          isFrozen: isFrozen || false
        };

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
      const rpcUrl = heliusApiKey ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}` : 'https://api.mainnet-beta.solana.com';
      const connection = new Connection(rpcUrl, 'confirmed');
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
      const rpcUrl = heliusApiKey ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}` : 'https://api.mainnet-beta.solana.com';
      const connection = new Connection(rpcUrl, 'confirmed');
      
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
      const rpcUrl = heliusApiKey 
        ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
        : 'https://api.mainnet-beta.solana.com';
      
      
      const connection = new Connection(rpcUrl, 'confirmed');
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
      
      // Calculate platform fee (15% of estimated SOL recovery)
      // Standard NFTs estimate 0.002 SOL per NFT (others provide no recovery yet)
      const estimatedSolRecovery = nftType === 'standard' ? nftMints.length * 0.002 : 0;
      const platformFeeAmount = estimatedSolRecovery * 0.15; // 15% platform fee
      const referralFeeAmount = referralCodeData ? platformFeeAmount * 0.5 : 0; // 50% of platform fee goes to referral
      const finalPlatformFeeAmount = platformFeeAmount - referralFeeAmount;
      
      // Add platform fee transfer
      const platformWallet = new PublicKey('9gigncDCysCcmfYStcSYhoo4bL6Se2SPxsiivwRXQqcf');
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
        netAmount: (estimatedSolRecovery * 0.85).toString(), // 85% after 15% fee
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
        success: z.boolean().default(true)
      });

      const validatedData = burnRecordSchema.parse(req.body);
      const { signature, nftMint, rentRecovered, netAmount, feeAmount, platformFeeAmount, referralFeeAmount, walletAddress, nftType, error, success } = validatedData;

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
          const rpcUrl = heliusApiKey ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}` : 'https://api.mainnet-beta.solana.com';
          const { Connection } = await import('@solana/web3.js');
          const connection = new Connection(rpcUrl, 'confirmed');

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
      const rpcUrl = apiKey ? 
        `https://mainnet.helius-rpc.com/?api-key=${apiKey}` : 
        'https://api.mainnet-beta.solana.com';

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
          const walletPubkey = umiPublicKey(walletAddress);
          const isOwner = asset.owner === walletPubkey;
          const isUpdateAuthority = asset.updateAuthority?.type === 'Address' && asset.updateAuthority.address === walletPubkey;
          
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
          const rpcUrl = heliusApiKey ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}` : 'https://api.mainnet-beta.solana.com';
          const connection = new Connection(rpcUrl, 'confirmed');
          
          const referralBalance = await connection.getBalance(referralPubkey);
          referralWalletExists = referralBalance > 0;
          console.log(`CORE NFT BURN - Referral wallet ${referralCodeData.walletAddress} balance: ${referralBalance} lamports, exists: ${referralWalletExists}`);
        } catch (error) {
          console.log('CORE NFT BURN - Failed to check referral wallet:', error);
          referralWalletExists = false;
        }
      }

      const allBurnTransactions = [];
      const platformWalletAddress = '9gigncDCysCcmfYStcSYhoo4bL6Se2SPxsiivwRXQqcf';

      // Process each batch separately  
      for (let batchIndex = 0; batchIndex < batchChunks.length; batchIndex++) {
        const batchAssets = batchChunks[batchIndex];
        console.log(`🔥 Building batch ${batchIndex + 1}/${batchChunks.length} with ${batchAssets.length} Core NFTs...`);

        // Calculate batch-specific fees
        const batchExpectedRentLamports = batchAssets.reduce((sum, asset) => sum + Math.floor(asset.expectedRent * 1e9), 0);
        const requestedFeeLamports = Math.floor(batchExpectedRentLamports * 0.15);
        const NETWORK_BUFFER = 10000; // Small buffer for network fees
        const maxAllowedFeeLamports = Math.max(0, batchExpectedRentLamports - NETWORK_BUFFER);
        const batchFeeLamports = Math.min(requestedFeeLamports, maxAllowedFeeLamports);

        // Split fees per batch
        const referralFeeLamports = referralWalletExists ? Math.floor(batchFeeLamports * 0.5) : 0;
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
      const rpcUrl = apiKey ? 
        `https://mainnet.helius-rpc.com/?api-key=${apiKey}` : 
        'https://api.mainnet-beta.solana.com';

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
      const connection = new Connection(rpcUrl, 'confirmed');

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
      const platformWalletAddress = '9gigncDCysCcmfYStcSYhoo4bL6Se2SPxsiivwRXQqcf';

      // Process each batch separately  
      for (let batchIndex = 0; batchIndex < batchChunks.length; batchIndex++) {
        const batchNfts = batchChunks[batchIndex];
        console.log(`🔥 Building batch ${batchIndex + 1}/${batchChunks.length} with ${batchNfts.length} Programmable NFTs...`);

        // Calculate batch-specific fees
        const batchExpectedRentLamports = batchNfts.reduce((sum, nft) => sum + Math.floor(nft.expectedRent * 1e9), 0);
        const requestedFeeLamports = Math.floor(batchExpectedRentLamports * 0.15); // 15% fee
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
      const rpcUrl = apiKey ? 
        `https://mainnet.helius-rpc.com/?api-key=${apiKey}` : 
        'https://api.mainnet-beta.solana.com';

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
      const connection = new Connection(rpcUrl, 'confirmed');

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
      const platformWalletAddress = '9gigncDCysCcmfYStcSYhoo4bL6Se2SPxsiivwRXQqcf';

      // Process each batch separately  
      for (let batchIndex = 0; batchIndex < batchChunks.length; batchIndex++) {
        const batchNfts = batchChunks[batchIndex];
        console.log(`🔥 Building batch ${batchIndex + 1}/${batchChunks.length} with ${batchNfts.length} Traditional NFTs...`);

        // Calculate batch-specific fees
        const batchExpectedRentLamports = batchNfts.reduce((sum, nft) => sum + Math.floor(nft.expectedRent * 1e9), 0);
        const requestedFeeLamports = Math.floor(batchExpectedRentLamports * 0.15); // 15% fee
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
      const { wallet, limit = 10, offset = 0 } = req.query;
      
      let transactionHistory;
      if (wallet) {
        transactionHistory = await storage.getTransactionLedgerByWallet(
          wallet as string, 
          parseInt(limit as string), 
          parseInt(offset as string)
        );
      } else {
        transactionHistory = await storage.getTransactionLedger(
          parseInt(limit as string), 
          parseInt(offset as string)
        );
      }

      const formattedHistory = transactionHistory.map(tx => ({
        id: tx.id,
        signature: tx.signature,
        walletAddress: tx.walletAddress,
        netAmount: parseFloat(tx.netAmount),
        feeAmount: parseFloat(tx.feeAmount),
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
      const rpcUrl = heliusApiKey ? 
        `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}` : 
        'https://api.mainnet-beta.solana.com';

      const connection = new Connection(rpcUrl, 'confirmed');

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



  const httpServer = createServer(app);
  return httpServer;
}
