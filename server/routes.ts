import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTransactionRecordSchema, insertEmptyTokenAccountSchema, insertScanResultSchema, insertTransactionLedgerSchema, insertTokenBurnRecordSchema, insertNftBurnRecordSchema, insertReferralCodeSchema, insertReferralTransactionSchema, referralCodes } from "@shared/schema";
import { nanoid } from "nanoid";
import { eq } from 'drizzle-orm';
import { db } from './db';
import { Connection, PublicKey, Transaction, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createBurnInstruction, createCloseAccountInstruction } from "@solana/spl-token";
// Metaplex Core burning - server-side UMI implementation
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore, burn, fetchAsset, collectionAddress, fetchCollection } from '@metaplex-foundation/mpl-core';
import { publicKey as umiPublicKey, createNoopSigner, TransactionBuilder } from '@metaplex-foundation/umi';
import { toWeb3JsTransaction } from '@metaplex-foundation/umi-web3js-adapters';
import { z } from 'zod';

export async function registerRoutes(app: Express): Promise<Server> {
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
        
        const closeInstruction = createCloseAccountInstruction(
          accountPublicKey,
          ownerPublicKey, // destination (user receives SOL)
          ownerPublicKey  // owner
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
      
      // Calculate fees in lamports - no pre-balance capping needed since closes execute first
      const donationFactor = donationPercentage / 100;
      const requestedFeeLamports = Math.floor(totalRecoveredLamports * donationFactor);
      const safetyBufferLamports = 50000; // 0.00005 SOL buffer
      const maxAllowedFeeLamports = Math.max(0, totalRecoveredLamports - estimatedTxFeeLamports - safetyBufferLamports);
      const totalFeeLamports = Math.min(requestedFeeLamports, maxAllowedFeeLamports);
      
      console.log(`Fee calculation: requested=${requestedFeeLamports}, maxAllowed=${maxAllowedFeeLamports}, final=${totalFeeLamports}`);
      
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
          console.log(`Referral wallet ${referralCodeData.walletAddress} balance: ${referralBalance} lamports, exists: ${referralWalletExists}`);
        } catch (error) {
          console.log('Failed to check referral wallet balance:', error);
          referralWalletExists = false;
        }
        
        if (referralWalletExists) {
          // 35% of fee goes to referral
          referralFeeLamports = Math.floor(totalFeeLamports * 0.35);
          // 65% of fee stays with platform
          platformFeeLamports = totalFeeLamports - referralFeeLamports;
          console.log(`✅ Referral wallet exists - splitting fees: platform=${platformFeeLamports}, referral=${referralFeeLamports}`);
        } else {
          // Referral wallet doesn't exist, all fees go to platform
          platformFeeLamports = totalFeeLamports;
          referralFeeLamports = 0;
          console.log(`❌ Referral wallet ${referralCodeData.walletAddress} doesn't exist - all fees to platform: ${platformFeeLamports}`);
        }
      }
      
      const netLamports = totalRecoveredLamports - totalFeeLamports;

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
        feeCapInfo: {
          requestedFeeLamports,
          maxAllowedFeeLamports,
          actualFeeLamports: totalFeeLamports,
          estimatedTxFeeLamports,
          safetyBufferLamports
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
            const { getAssociatedTokenAddress, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } = await import('@solana/spl-token');
            
            const connection = new Connection(rpcUrl, 'confirmed');
            const ownerPublicKey = new PublicKey(address);
            
            const burnableTokens = [];
            
            for (const asset of fungibleTokens) {
              try {
                const mintPublicKey = new PublicKey(asset.id);
                const tokenAccount = await getAssociatedTokenAddress(
                  mintPublicKey,
                  ownerPublicKey
                );
                
                // Check if the token account actually exists and is accessible
                const accountInfo = await connection.getParsedAccountInfo(tokenAccount);
                
                if (accountInfo.value && accountInfo.value.data) {
                  const parsedInfo = accountInfo.value.data as any;
                  if (parsedInfo.parsed && parsedInfo.parsed.info) {
                    const tokenState = parsedInfo.parsed.info.state;
                    
                    // Only include tokens that are not frozen
                    if (tokenState !== 'frozen') {
                      burnableTokens.push(asset);
                      console.log(`Token ${asset.content?.metadata?.symbol || 'Unknown'}: BURNABLE (state=${tokenState})`);
                    } else {
                      console.log(`Token ${asset.content?.metadata?.symbol || 'Unknown'}: FROZEN - excluded`);
                    }
                  }
                }
              } catch (error) {
                console.log(`Error checking token ${asset.content?.metadata?.symbol || 'Unknown'}:`, error instanceof Error ? error.message : String(error));
              }
            }

            tokens = burnableTokens.map((asset: any) => {
              const balance = (asset.token_info?.balance || 0) / Math.pow(10, asset.token_info?.decimals || 0);
              const isEmpty = balance === 0;
              
              return {
                mint: asset.id,
                balance: balance,
                decimals: asset.token_info?.decimals || 0,
                name: asset.content?.metadata?.name || 'Unknown Token',
                symbol: asset.content?.metadata?.symbol || 'TOKEN',
                logo: asset.content?.files?.[0]?.uri || asset.content?.metadata?.image || null,
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
          const tokenAccount = await getAssociatedTokenAddress(mintPublicKey, ownerPublicKey);
          
          // Get token account info to verify it exists and get balance
          const tokenAccountInfo = await connection.getParsedAccountInfo(tokenAccount);
          const parsedInfo = tokenAccountInfo.value?.data as any;
          
          if (!parsedInfo?.parsed?.info) {
            console.log(`Skipping ${tokenMint} - token account not found`);
            continue;
          }
          
          // Get actual account lamports
          const accountInfo = await connection.getAccountInfo(tokenAccount);
          if (accountInfo) {
            totalRecoveredLamports += accountInfo.lamports;
            validTokens.push({
              mint: tokenMint,
              account: tokenAccount,
              balance: parsedInfo.parsed.info.tokenAmount.amount,
              lamports: accountInfo.lamports
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
      
      for (const token of validTokens) {
        const mintPublicKey = new PublicKey(token.mint);
        
        // Step 1: Burn tokens (if balance > 0)
        if (token.balance > 0) {
          const burnInstruction = createBurnInstruction(
            token.account,    // Token account to burn from
            mintPublicKey,    // Token mint
            ownerPublicKey,   // Owner
            token.balance     // Amount to burn (full balance)
          );
          transaction.add(burnInstruction);
        }
        
        // Step 2: Close the now-empty account to reclaim SOL
        const closeInstruction = createCloseAccountInstruction(
          token.account,
          ownerPublicKey, // destination (receives SOL)
          ownerPublicKey  // owner
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
          // 35% of fee goes to referral
          referralFeeLamports = Math.floor(totalFeeLamports * 0.35);
          // 65% of fee stays with platform
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
      
      const netLamports = totalRecoveredLamports - totalFeeLamports;

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
      
      // Get associated token account
      const tokenAccount = await getAssociatedTokenAddress(
        mintPublicKey,
        ownerPublicKey
      );
      
      // Get token account info to determine balance and decimals
      const tokenAccountInfo = await connection.getParsedAccountInfo(tokenAccount);
      const parsedInfo = tokenAccountInfo.value?.data as any;
      
      if (!parsedInfo?.parsed?.info) {
        throw new Error('Token account not found or invalid');
      }
      
      const balance = parsedInfo.parsed.info.tokenAmount.amount;
      const decimals = parsedInfo.parsed.info.tokenAmount.decimals;
      
      // Create transaction
      const transaction = new Transaction();
      
      // Step 1: Burn all tokens (if balance > 0)
      if (balance > 0) {
        const burnInstruction = createBurnInstruction(
          tokenAccount,     // Token account to burn from
          mintPublicKey,    // Token mint
          ownerPublicKey,   // Owner
          balance           // Amount to burn (full balance)
        );
        transaction.add(burnInstruction);
      }
      
      // Step 2: Close the now-empty account to reclaim SOL
      const closeInstruction = createCloseAccountInstruction(
        tokenAccount,
        ownerPublicKey, // destination (receives SOL)
        ownerPublicKey  // owner
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
        message: `Successfully burned ${tokensProcessed} tokens and recovered ${netAmount.toFixed(6)} SOL!`
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

      for (const asset of items) {
        const { interface: assetInterface, compression, burnt } = asset;
        
        // Only process Metaplex Core NFTs
        if (assetInterface !== 'MplCoreAsset') {
          continue;
        }
        
        // Skip burned NFTs (they still show in DAS with burnt: true)
        if (burnt === true) {
          console.log(`Skipping burned NFT: ${asset.content?.metadata?.name || asset.id}`);
          continue;
        }
        
        // Skip compressed NFTs (shouldn't happen with Core but check anyway)
        if (compression?.compressed) {
          continue;
        }
        
        const nftType = 'core';

        // Filter by type if specified (only 'core' supported now)
        if (type && type !== 'core') {
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

        const nftInfo = {
          mint: asset.id,
          name: asset.content?.metadata?.name || 'Unknown NFT',
          symbol: asset.content?.metadata?.symbol || '',
          image: asset.content?.files?.[0]?.uri || asset.content?.metadata?.image || '',
          description: asset.content?.metadata?.description || '',
          type: 'core',
          interface: 'MplCoreAsset',
          tokenStandard: '',
          compressed: false,
          creators: asset.creators || [],
          collection: asset.grouping?.find((g: any) => g.group_key === 'collection')?.group_value || null,
          attributes: asset.content?.metadata?.attributes || []
        };

        nfts.push(nftInfo);
      }


      // All NFTs are Core type now
      const counts = {
        core: nfts.length
      };

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
      const referralFeeAmount = referralCodeData ? platformFeeAmount * 0.35 : 0; // 35% of platform fee goes to referral
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
        walletAddress: z.string().min(1, "Wallet address is required"),
        nftType: z.string().min(1, "NFT type is required"),
        error: z.string().optional(),
        success: z.boolean().default(true)
      });

      const validatedData = burnRecordSchema.parse(req.body);
      const { signature, nftMint, rentRecovered, walletAddress, nftType, error, success } = validatedData;

      // Record the NFT burn transaction in our ledger
      if (success && signature) {
        // Successful burn
        const transactionData = {
          walletAddress,
          signature,
          transactionType: 'nft_burn' as const,
          solRecovered: rentRecovered.toString(),
          netAmount: rentRecovered.toString(), // No fees for Core NFT burning currently
          feeAmount: '0',
          itemsProcessed: 1, // One NFT burned
          itemDetails: JSON.stringify({
            nftMint,
            nftType,
            rentRecovered
          })
        };

        await storage.createTransactionLedgerEntry(transactionData);

        console.log(`✅ Recorded Core NFT burn: ${nftMint} (${rentRecovered || 0} SOL recovered)`);
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
        walletAddress: z.string().min(1, "Wallet address is required")
      });

      const { coreNftIds, walletAddress } = prepareBurnSchema.parse(req.body);

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

      const burnTransactions = [];
      let totalExpectedRent = 0;

      for (const nftId of coreNftIds) {
        try {
          console.log(`🔍 Processing Core NFT: ${nftId}`);
          
          // Fetch asset to validate it exists and is Core (using proper fetchAsset)
          const asset = await fetchAsset(umi, umiPublicKey(nftId));
          console.log(`✅ Core asset validated: ${asset.publicKey}`);

          // CRITICAL: Check if wallet is asset authority (owner or update authority)
          const walletPubkey = umiPublicKey(walletAddress);
          const isOwner = asset.owner === walletPubkey;
          const isUpdateAuthority = asset.updateAuthority?.type === 'Address' && asset.updateAuthority.address === walletPubkey;
          
          if (!isOwner && !isUpdateAuthority) {
            throw new Error(`Wallet ${walletAddress} is not authorized to burn Core NFT ${nftId}. Owner: ${asset.owner}, Update Authority: ${asset.updateAuthority?.type === 'Address' ? asset.updateAuthority.address : 'N/A'}`);
          }
          console.log(`✅ Authority validated - wallet ${walletAddress} can burn Core NFT ${nftId}`);

          // Get collection address from asset
          const collectionId = collectionAddress(asset);
          let collection = undefined;

          // Fetch collection if it exists
          if (collectionId) {
            try {
              collection = await fetchCollection(umi, collectionId);
              console.log(`✅ Collection fetched: ${collectionId}`);
            } catch (collectionError) {
              console.log(`⚠️ Could not fetch collection ${collectionId}, proceeding without it`);
            }
          }

          // Get ACTUAL rent amount from the asset account
          const heliusApiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
          const rpcUrl = heliusApiKey ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}` : 'https://api.mainnet-beta.solana.com';
          const connection = new Connection(rpcUrl, 'confirmed');
          
          const assetAccountInfo = await connection.getAccountInfo(new PublicKey(nftId));
          const actualRentLamports = assetAccountInfo?.lamports || 2268960; // Fallback to known amount
          const actualRentSol = actualRentLamports / 1e9;
          console.log(`💰 ACTUAL rent in Core NFT account: ${actualRentSol} SOL (${actualRentLamports} lamports)`);

          // Build burn transaction using PROPER Core NFT approach
          const burnTx = new TransactionBuilder()
            .add(
              burn(umi, {
                asset: asset,
                collection: collection, // Include collection if exists
                authority: umi.identity, // will be replaced by client signer
              })
            );
          
          // Build the transaction without signing
          const umiTransaction = await burnTx.buildWithLatestBlockhash(umi);
          
          // Convert UMI transaction to Web3.js format, then serialize for client signing
          const web3jsTransaction = toWeb3JsTransaction(umiTransaction);
          const base64Transaction = Buffer.from(web3jsTransaction.serialize()).toString('base64');
          
          burnTransactions.push({
            nftId,
            transaction: base64Transaction,
            expectedRent: actualRentSol // REAL rent amount from account!
          });

          totalExpectedRent += actualRentSol;
          console.log(`✅ Core NFT burn transaction prepared: ${nftId}`);

        } catch (nftError) {
          console.error(`❌ Failed to prepare burn for Core NFT ${nftId}:`, nftError);
          burnTransactions.push({
            nftId,
            error: nftError instanceof Error ? nftError.message : 'Unknown error',
            expectedRent: 0
          });
        }
      }

      const responseData = {
        success: true,
        burnTransactions,
        totalExpectedRentSol: totalExpectedRent,
        message: `Prepared ${burnTransactions.filter(tx => tx.transaction).length} burn transactions`
      };
      
      console.log(`🔧 Server returning response:`, {
        success: responseData.success,
        burnTransactionsCount: responseData.burnTransactions.length,
        transactionsWithData: responseData.burnTransactions.filter(tx => tx.transaction).length,
        transactionsWithErrors: responseData.burnTransactions.filter(tx => tx.error).length,
        firstTransaction: responseData.burnTransactions[0] || 'none'
      });

      res.json(responseData);

    } catch (error) {
      console.error('Error preparing Core NFT burn transactions:', error);
      res.status(500).json({ 
        error: "Failed to prepare Core NFT burn transactions",
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


  const httpServer = createServer(app);
  return httpServer;
}
