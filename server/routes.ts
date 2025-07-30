import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTransactionRecordSchema, insertEmptyTokenAccountSchema, insertScanResultSchema } from "@shared/schema";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";

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
          console.log(`RPC endpoint ${endpoint} failed, trying next...`);
        }
      }

      if (!connection) {
        return res.status(503).json({ error: "All RPC endpoints are currently unavailable" });
      }

      console.log(`Using RPC endpoint: ${workingEndpoint}`);

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
      const { walletAddress, selectedAccounts, donationPercentage } = req.body;

      // Get empty accounts from storage
      const emptyAccounts = await storage.getEmptyTokenAccountsByWallet(walletAddress);
      const selectedAccountsSet = new Set(selectedAccounts);
      const accountsToClose = emptyAccounts.filter(account => 
        selectedAccountsSet.has(account.accountAddress)
      );

      if (accountsToClose.length === 0) {
        return res.status(400).json({ error: "No valid accounts to close" });
      }

      // Calculate totals
      const totalSolReclaimed = accountsToClose.reduce((sum, account) => 
        sum + parseFloat(account.rentAmount), 0
      );
      const feeAmount = totalSolReclaimed * (donationPercentage / 100);
      const netAmount = totalSolReclaimed - feeAmount;

      // Get RPC connection
      const heliusApiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
      const rpcUrl = heliusApiKey ? 
        `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}` : 
        'https://api.mainnet-beta.solana.com';
      
      const connection = new Connection(rpcUrl, 'confirmed');

      // Create transaction to close token accounts
      const transaction = new Transaction();
      
      // Add close account instructions for each empty account
      const { createCloseAccountInstruction } = await import('@solana/spl-token');
      
      for (const account of accountsToClose) {
        const accountPublicKey = new PublicKey(account.accountAddress);
        const ownerPublicKey = new PublicKey(walletAddress);
        
        const closeInstruction = createCloseAccountInstruction(
          accountPublicKey,
          ownerPublicKey, // destination (receives SOL)
          ownerPublicKey  // owner
        );
        
        transaction.add(closeInstruction);
      }

      // Add service fee transfer if applicable
      if (feeAmount > 0) {
        const { SystemProgram } = await import('@solana/web3.js');
        const feeCollectorPublicKey = new PublicKey('9QQk8474MNkfmNtdt6cvZbCPwiJicJ125N2NLqfyumYC');
        
        const feeTransferInstruction = SystemProgram.transfer({
          fromPubkey: new PublicKey(walletAddress),
          toPubkey: feeCollectorPublicKey,
          lamports: Math.round(feeAmount * 1e9), // Convert SOL to lamports
        });
        
        transaction.add(feeTransferInstruction);
      }

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = new PublicKey(walletAddress);

      // Serialize transaction
      const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
      const transactionBase64 = serializedTransaction.toString('base64');

      res.json({
        transaction: transactionBase64,
        message: `Prepared transaction to close ${accountsToClose.length} accounts`,
        totalSolReclaimed: totalSolReclaimed,
        feeAmount: feeAmount,
        netAmount: netAmount
      });

    } catch (error) {
      console.error("Prepare transaction error:", error);
      res.status(500).json({ error: "Failed to prepare transaction" });
    }
  });

  // Record successful transaction
  app.post("/api/sol-refund/record-success", async (req, res) => {
    try {
      const { signature, walletAddress, accountsClosed, solRecovered, netAmount, feeAmount } = req.body;

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

      // Record transaction
      const transactionRecord = await storage.createTransactionRecord({
        signature,
        walletAddress,
        solRecovered: solRecovered.toString(),
        netAmount: netAmount.toString(),
        feeAmount: feeAmount.toString(),
        accountsClosed
      });

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
          console.log(`RPC endpoint ${endpoint} failed, trying next...`);
        }
      }

      if (!connection) {
        return res.status(503).json({ error: "All RPC endpoints are currently unavailable" });
      }

      console.log(`Using RPC endpoint: ${workingEndpoint}`);

      const walletPublicKey = new PublicKey(address);
      
      // Get all token accounts with balances > 0
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPublicKey, {
        programId: TOKEN_PROGRAM_ID,
      });

      // Process each token account and get metadata from Helius
      const tokens = [];
      for (const account of tokenAccounts.value) {
        const balance = account.account.data.parsed?.info?.tokenAmount?.uiAmount || 0;
        if (balance <= 0) continue;

        const info = account.account.data.parsed?.info;
        const mint = info?.mint;
        
        let tokenMetadata = {
          mint: mint || 'Unknown',
          balance: balance,
          decimals: info?.tokenAmount?.decimals || 0,
          name: 'Unknown Token',
          symbol: 'TOKEN',
          logo: null
        };

        // Use Helius as primary metadata source
        if (mint && heliusApiKey) {
          try {
            const metadataResponse = await fetch(`https://api.helius.xyz/v0/token-metadata?api-key=${heliusApiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mintAccounts: [mint] })
            });
            
            if (metadataResponse.ok) {
              const metadataData = await metadataResponse.json();
              if (metadataData && metadataData.length > 0) {
                const tokenData = metadataData[0];
                console.log(`Raw Helius data for ${mint}:`, JSON.stringify(tokenData, null, 2));
                
                // Try multiple metadata sources in order of preference
                tokenMetadata.name = tokenData.onChainMetadata?.metadata?.data?.name || 
                                   tokenData.legacyMetadata?.name || 
                                   tokenData.offChainMetadata?.name || 
                                   'Unknown Token';
                tokenMetadata.symbol = tokenData.onChainMetadata?.metadata?.data?.symbol || 
                                     tokenData.legacyMetadata?.symbol || 
                                     tokenData.offChainMetadata?.symbol || 
                                     'TOKEN';
                tokenMetadata.logo = tokenData.legacyMetadata?.logoURI || 
                                   tokenData.offChainMetadata?.image || 
                                   null;
                console.log(`Parsed metadata: name=${tokenMetadata.name}, symbol=${tokenMetadata.symbol}, logo=${tokenMetadata.logo}`);
              }
            }
          } catch (error) {
            console.log(`Failed to fetch Helius metadata for token ${mint}:`, error instanceof Error ? error.message : String(error));
          }
        }

        tokens.push(tokenMetadata);
      }

      res.json(tokens);
    } catch (error) {
      console.error('Error scanning tokens:', error);
      res.status(500).json({ error: "Failed to scan tokens" });
    }
  });

  // Scan wallet for NFTs (for burning)
  app.get("/api/nfts/scan/:address", async (req, res) => {
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
          console.log(`RPC endpoint ${endpoint} failed, trying next...`);
        }
      }

      if (!connection) {
        return res.status(503).json({ error: "All RPC endpoints are currently unavailable" });
      }

      console.log(`Using RPC endpoint: ${workingEndpoint}`);

      const walletPublicKey = new PublicKey(address);
      
      // Get all token accounts with balance = 1 (typical for NFTs)
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPublicKey, {
        programId: TOKEN_PROGRAM_ID,
      });

      // Fetch NFT metadata for each NFT
      const nfts = [];
      for (const account of tokenAccounts.value) {
        const balance = account.account.data.parsed?.info?.tokenAmount?.uiAmount || 0;
        const decimals = account.account.data.parsed?.info?.tokenAmount?.decimals || 0;
        
        if (!(balance === 1 && decimals === 0)) continue; // NFTs typically have balance=1 and decimals=0

        const info = account.account.data.parsed?.info;
        const mint = info?.mint;
        
        let nftMetadata = {
          mint: mint || 'Unknown',
          name: 'Unknown NFT',
          image: null,
          collection: null
        };

        // Try to fetch NFT metadata from Helius if available
        if (mint && heliusApiKey) {
          try {
            const metadataResponse = await fetch(`https://api.helius.xyz/v0/token-metadata?api-key=${heliusApiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mintAccounts: [mint] })
            });
            
            if (metadataResponse.ok) {
              const metadataData = await metadataResponse.json();
              if (metadataData && metadataData.length > 0) {
                const nftData = metadataData[0];
                nftMetadata.name = nftData.onChainMetadata?.metadata?.name || nftData.offChainMetadata?.name || 'Unknown NFT';
                nftMetadata.image = nftData.offChainMetadata?.image || null;
                nftMetadata.collection = nftData.onChainMetadata?.metadata?.collection || null;
              }
            }
          } catch (error) {
            console.log(`Failed to fetch metadata for NFT ${mint}:`, error instanceof Error ? error.message : String(error));
          }
        }

        nfts.push(nftMetadata);
      }

      res.json(nfts);
    } catch (error) {
      console.error('Error scanning NFTs:', error);
      res.status(500).json({ error: "Failed to scan NFTs" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
