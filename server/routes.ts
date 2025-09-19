import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTransactionRecordSchema, insertEmptyTokenAccountSchema, insertScanResultSchema, insertTransactionLedgerSchema, insertTokenBurnRecordSchema, insertNftBurnRecordSchema, insertReferralCodeSchema, insertReferralTransactionSchema, referralCodes } from "@shared/schema";
import { nanoid } from "nanoid";
import { eq } from 'drizzle-orm';
import { db } from './db';
import { Connection, PublicKey, Transaction, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createBurnInstruction, createCloseAccountInstruction } from "@solana/spl-token";
// Metaplex Core burning - currently disabled due to technical challenges

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
        const { interface: assetInterface, compression } = asset;
        
        // Only process Metaplex Core NFTs
        if (assetInterface !== 'MplCoreAsset') {
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

  // Burn NFTs API
  app.post("/api/nfts/burn", async (req, res) => {
    try {
      const { walletAddress, nftMints, nftType, referralCode } = req.body;
      
      if (!walletAddress || !nftMints || !Array.isArray(nftMints) || nftMints.length === 0) {
        return res.status(400).json({ error: "Wallet address and NFT mints array are required" });
      }

      if (!nftType || nftType !== 'core') {
        return res.status(400).json({ error: "Only Metaplex Core NFTs are supported" });
      }

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
      
      // Metaplex Core NFTs burning only
      if (nftType === 'core') {
        // Core NFT burning requires proper UMI framework integration
        // Current implementation has technical challenges with library versions
        return res.status(501).json({ 
          success: false,
          error: "Core NFT burning is temporarily unavailable due to technical integration challenges with the Metaplex Core library. The system currently only supports scanning Core NFTs. Proper burning with rent recovery will be implemented in a future update.",
          supportedFeatures: [
            "Core NFT detection and scanning",
            "Safe filtering of burnable vs non-burnable NFTs",
            "Collection identification"
          ],
          recommendation: "For now, you can use other Solana NFT burning tools that support Metaplex Core, or wait for this feature to be properly implemented."
        });
        
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
