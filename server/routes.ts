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

      // Use Helius DAS API to get all assets with metadata
      let tokens = [];
      if (heliusApiKey) {
        try {
          const heliusRpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
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
              // Filter for fungible tokens with balance > 0
              tokens = heliusData.result.items
                .filter((asset: any) => 
                  asset.interface === 'FungibleToken' || 
                  asset.interface === 'FungibleAsset'
                )
                .filter((asset: any) => {
                  const balance = asset.token_info?.balance || 0;
                  return balance > 0;
                })
                .map((asset: any) => ({
                  mint: asset.id,
                  balance: (asset.token_info?.balance || 0) / Math.pow(10, asset.token_info?.decimals || 0),
                  decimals: asset.token_info?.decimals || 0,
                  name: asset.content?.metadata?.name || 'Unknown Token',
                  symbol: asset.content?.metadata?.symbol || 'TOKEN',
                  logo: asset.content?.files?.[0]?.uri || asset.content?.metadata?.image || null
                }));
              
              console.log(`Processed ${tokens.length} fungible tokens with balances`);
            }
          }
        } catch (error) {
          console.log(`Failed to fetch assets from Helius DAS:`, error instanceof Error ? error.message : String(error));
        }
      }

      // Fallback to RPC if Helius didn't work
      if (tokens.length === 0) {
        console.log('Falling back to RPC token scanning...');
        for (const account of tokenAccounts.value) {
          const balance = account.account.data.parsed?.info?.tokenAmount?.uiAmount || 0;
          if (balance <= 0) continue;

          const info = account.account.data.parsed?.info;
          tokens.push({
            mint: info?.mint || 'Unknown',
            balance: balance,
            decimals: info?.tokenAmount?.decimals || 0,
            name: 'Unknown Token',
            symbol: 'TOKEN',
            logo: null
          });
        }
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
      
      // Import required token functions
      const { getAssociatedTokenAddress } = await import('@solana/spl-token');

      // Use Helius DAS API to get all NFTs with metadata
      let nfts = [];
      if (heliusApiKey) {
        try {
          const heliusRpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
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
                  showFungible: true,
                  showNativeBalance: false
                }
              }
            })
          });
          
          if (heliusResponse.ok) {
            const heliusData = await heliusResponse.json();
            console.log(`Found ${heliusData.result?.items?.length || 0} total assets from Helius DAS`);
            
            if (heliusData.result?.items) {
              
              // Filter for NFTs that can potentially be burned (exclude cNFTs and fungible tokens)
              const allNFTs = heliusData.result.items
                .filter((asset: any) => {
                  const isCompressed = asset.compression?.compressed === true;
                  const isFungible = asset.interface === 'FungibleToken';
                  // Include NFT standards that can be burned for SOL recovery
                  const isNFT = asset.interface === 'V1_NFT' || 
                               asset.interface === 'ProgrammableNFT' ||
                               asset.interface === 'Legacy' ||
                               asset.interface === 'MplCoreAsset'; // Core NFTs can be burned using Metaplex Core SDK
                  
                  const shouldInclude = isNFT && !isCompressed && !isFungible;
                  console.log(`Asset ${asset.id}: interface=${asset.interface}, compressed=${isCompressed}, fungible=${isFungible}, isNFT=${isNFT}, shouldInclude=${shouldInclude}`);
                  
                  // Include NFTs that are NOT compressed and NOT fungible tokens
                  return shouldInclude;
                });

              console.log(`Found ${allNFTs.length} non-compressed NFTs out of ${heliusData.result.items.length} total assets`);

              // For now, show all non-compressed NFTs (we'll validate burnability when burning)
              nfts = allNFTs.map((asset: any) => ({
                mint: asset.id,
                name: asset.content?.metadata?.name || 'Unknown NFT',
                image: asset.content?.files?.[0]?.uri || 
                       asset.content?.files?.[0]?.cdn_uri || 
                       asset.content?.links?.image || 
                       null,
                collection: asset.grouping?.find((g: any) => g.group_key === 'collection')?.group_value || null
              }));
              
              console.log(`Processed ${nfts.length} NFTs with metadata`);
            }
          }
        } catch (error) {
          console.log(`Failed to fetch NFTs from Helius DAS:`, error instanceof Error ? error.message : String(error));
        }
      }

      // Fallback to RPC if Helius didn't work
      if (nfts.length === 0) {
        console.log('Falling back to RPC NFT scanning...');
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPublicKey, {
          programId: TOKEN_PROGRAM_ID,
        });

        for (const account of tokenAccounts.value) {
          const balance = account.account.data.parsed?.info?.tokenAmount?.uiAmount || 0;
          const decimals = account.account.data.parsed?.info?.tokenAmount?.decimals || 0;
          
          if (!(balance === 1 && decimals === 0)) continue; // NFTs typically have balance=1 and decimals=0

          const info = account.account.data.parsed?.info;
          nfts.push({
            mint: info?.mint || 'Unknown',
            name: 'Unknown NFT',
            image: null,
            collection: null
          });
        }
      }

      res.json(nfts);
    } catch (error) {
      console.error('Error scanning NFTs:', error);
      res.status(500).json({ error: "Failed to scan NFTs" });
    }
  });

  // Bulk Burn Tokens API
  app.post("/api/tokens/bulk-burn", async (req, res) => {
    try {
      const { walletAddress, tokenMints } = req.body;
      
      if (!walletAddress || !tokenMints || !Array.isArray(tokenMints) || tokenMints.length === 0) {
        return res.status(400).json({ error: "Wallet address and token mints array are required" });
      }

      const { Connection, PublicKey, Transaction } = await import('@solana/web3.js');
      const { 
        TOKEN_PROGRAM_ID, 
        createBurnCheckedInstruction, 
        createCloseAccountInstruction, 
        getAssociatedTokenAddress 
      } = await import('@solana/spl-token');
      
      // Use Helius RPC if available
      const heliusApiKey = process.env.HELIUS_API_KEY;
      const rpcUrl = heliusApiKey 
        ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
        : 'https://api.mainnet-beta.solana.com';
      
      console.log(`Creating bulk token burn transaction for ${tokenMints.length} tokens...`);
      
      const connection = new Connection(rpcUrl, 'confirmed');
      const ownerPublicKey = new PublicKey(walletAddress);
      
      // Create single transaction with multiple burn+close instructions
      const transaction = new Transaction();
      let totalTokensProcessed = 0;
      
      for (const tokenMint of tokenMints) {
        try {
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
            console.log(`Skipping ${tokenMint} - token account not found`);
            continue;
          }
          
          const balance = parsedInfo.parsed.info.tokenAmount.amount;
          const decimals = parsedInfo.parsed.info.tokenAmount.decimals;
          
          // Step 1: Burn tokens (if balance > 0)
          if (balance > 0) {
            const burnInstruction = createBurnCheckedInstruction(
              tokenAccount,     // Token account to burn from
              mintPublicKey,    // Token mint
              ownerPublicKey,   // Owner
              balance,          // Amount to burn (full balance)
              decimals,         // Decimals
              [],               // Additional signers
              TOKEN_PROGRAM_ID  // Token program ID
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
          totalTokensProcessed++;
          
        } catch (error) {
          console.log(`Error processing token ${tokenMint}:`, error);
          continue;
        }
      }
      
      if (totalTokensProcessed === 0) {
        return res.status(400).json({ error: "No valid tokens found to burn" });
      }
      
      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = ownerPublicKey;
      
      // Serialize transaction
      const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
      const transactionBase64 = serializedTransaction.toString('base64');
      
      const totalSolRecovered = (totalTokensProcessed * 0.00203928).toFixed(8);
      
      console.log(`Bulk token burn transaction prepared: ${totalTokensProcessed} tokens, ${totalSolRecovered} SOL`);
      
      res.json({
        transaction: transactionBase64,
        tokensProcessed: totalTokensProcessed,
        solRecovered: totalSolRecovered,
        message: `Bulk burn transaction prepared for ${totalTokensProcessed} tokens`
      });
      
    } catch (error) {
      console.error('Error preparing bulk token burn:', error);
      res.status(500).json({ error: "Failed to prepare bulk token burn transaction" });
    }
  });

  // Core NFT Burn API (for MplCoreAsset NFTs)
  app.post("/api/nfts/burn-core", async (req, res) => {
    try {
      const { walletAddress, nftMints } = req.body;
      
      if (!walletAddress || !nftMints || !Array.isArray(nftMints) || nftMints.length === 0) {
        return res.status(400).json({ error: "Wallet address and NFT mints array are required" });
      }

      // For Core NFTs, we return a special response indicating they need frontend handling
      // The actual burning will be done on the frontend using the Metaplex Core SDK
      console.log(`Preparing Core NFT burn for ${nftMints.length} NFTs...`);
      
      const solRecovered = (nftMints.length * 0.003588).toFixed(6); // Estimate based on typical Core NFT rent
      
      res.json({
        requiresFrontendBurn: true,
        nftType: 'MplCoreAsset',
        nftsToProcess: nftMints,
        solRecovered: solRecovered,
        message: `Ready to burn ${nftMints.length} Core NFT${nftMints.length > 1 ? 's' : ''}`
      });
      
    } catch (error) {
      console.error('Error preparing Core NFT burn:', error);
      res.status(500).json({ error: "Failed to prepare Core NFT burn" });
    }
  });

  // Core NFT Transaction Creation API (using Metaplex SDK only)
  app.post("/api/nfts/burn-core-transaction", async (req, res) => {
    try {
      const { walletAddress, nftMints } = req.body;
      
      if (!walletAddress || !nftMints || !Array.isArray(nftMints) || nftMints.length === 0) {
        return res.status(400).json({ error: "Wallet address and NFT mints array are required" });
      }

      const { Connection, PublicKey, Transaction, TransactionInstruction } = await import('@solana/web3.js');
      
      // Use Helius RPC if available
      const heliusApiKey = process.env.HELIUS_API_KEY;
      const rpcUrl = heliusApiKey 
        ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
        : 'https://api.mainnet-beta.solana.com';
      
      console.log(`Creating Core NFT burn transaction for ${nftMints.length} NFTs...`);
      
      const connection = new Connection(rpcUrl, 'confirmed');
      const ownerPublicKey = new PublicKey(walletAddress);
      const MPL_CORE_PROGRAM_ID = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');
      
      let processedNfts = 0;
      let totalLamports = 0;
      const transaction = new Transaction();
      
      // Process each Core NFT
      for (const nftMint of nftMints) {
        try {
          console.log(`Processing Core NFT: ${nftMint}`);
          
          const assetPublicKey = new PublicKey(nftMint);
          
          // Get account info for the Core NFT asset
          const assetAccount = await connection.getAccountInfo(assetPublicKey);
          if (!assetAccount) {
            console.error(`Core NFT asset account not found: ${nftMint}`);
            continue;
          }
          
          console.log(`Core NFT asset lamports: ${assetAccount.lamports}`);
          totalLamports += assetAccount.lamports;
          
          // Create Core NFT burn instruction using proper discriminator
          const burnInstruction = new TransactionInstruction({
            programId: MPL_CORE_PROGRAM_ID,
            keys: [
              { pubkey: assetPublicKey, isSigner: false, isWritable: true },    // Asset account
              { pubkey: ownerPublicKey, isSigner: true, isWritable: true },     // Payer (receives lamports)
              { pubkey: ownerPublicKey, isSigner: true, isWritable: false },    // Authority
            ],
            data: Buffer.from([241, 99, 194, 76, 6, 126, 49, 154, 0]) // burn_v1 discriminator + no compression
          });
          
          transaction.add(burnInstruction);
          processedNfts++;
          
          console.log(`Added Core NFT burn for ${nftMint} - will recover ${assetAccount.lamports} lamports`);
          
        } catch (error) {
          console.error(`Failed to process Core NFT ${nftMint}:`, error);
        }
      }

      if (processedNfts === 0) {
        return res.status(400).json({ error: "No valid Core NFTs found to burn" });
      }

      // Set recent blockhash and fee payer
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = ownerPublicKey;

      // Serialize transaction for frontend signing
      const base64Tx = transaction.serialize({ requireAllSignatures: false }).toString('base64');
      
      // Show actual account balance
      const actualSolRecovered = (totalLamports / 1e9).toFixed(9);
      
      res.json({
        success: true,
        transaction: base64Tx,
        nftsProcessed: processedNfts,
        solRecovered: actualSolRecovered,
        nftType: 'MplCoreAsset',
        totalLamports: totalLamports,
        message: `Created Core NFT burn transaction for ${processedNfts} NFT${processedNfts > 1 ? 's' : ''} - recovers ${actualSolRecovered} SOL`
      });
      
    } catch (error) {
      console.error('Error creating Core NFT burn transaction with Metaplex SDK:', error);
      res.status(500).json({ error: "Failed to create Core NFT burn transaction using Metaplex SDK" });
    }
  });

  // Bulk Burn NFTs API
  app.post("/api/nfts/bulk-burn", async (req, res) => {
    try {
      const { walletAddress, nftMints } = req.body;
      
      if (!walletAddress || !nftMints || !Array.isArray(nftMints) || nftMints.length === 0) {
        return res.status(400).json({ error: "Wallet address and NFT mints array are required" });
      }

      const { Connection, PublicKey, Transaction } = await import('@solana/web3.js');
      const { 
        TOKEN_PROGRAM_ID, 
        createBurnCheckedInstruction, 
        createCloseAccountInstruction, 
        getAssociatedTokenAddress 
      } = await import('@solana/spl-token');
      
      // Use Helius RPC if available
      const heliusApiKey = process.env.HELIUS_API_KEY;
      const rpcUrl = heliusApiKey 
        ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
        : 'https://api.mainnet-beta.solana.com';
      
      console.log(`Creating bulk NFT burn transaction for ${nftMints.length} NFTs...`);
      
      const connection = new Connection(rpcUrl, 'confirmed');
      const ownerPublicKey = new PublicKey(walletAddress);
      
      // Create single transaction with multiple burn+close instructions
      const transaction = new Transaction();
      let totalNFTsProcessed = 0;
      
      for (const nftMint of nftMints) {
        try {
          const mintPublicKey = new PublicKey(nftMint);
          
          // Get associated token account
          const tokenAccount = await getAssociatedTokenAddress(
            mintPublicKey,
            ownerPublicKey
          );
          
          // Check if this is a traditional SPL token account
          const tokenAccountInfo = await connection.getAccountInfo(tokenAccount);
          
          if (!tokenAccountInfo) {
            console.log(`Skipping ${nftMint} - NFT account not found (may be MplCoreAsset or other new standard)`);
            continue;
          }
          
          // Get parsed account info for traditional SPL tokens
          const parsedAccountInfo = await connection.getParsedAccountInfo(tokenAccount);
          const parsedInfo = parsedAccountInfo.value?.data as any;
          
          if (!parsedInfo?.parsed?.info) {
            console.log(`Skipping ${nftMint} - Cannot parse NFT account data`);
            continue;
          }
          
          const balance = parsedInfo.parsed.info.tokenAmount.amount;
          const decimals = parsedInfo.parsed.info.tokenAmount.decimals;
          
          // Step 1: Burn the NFT (if balance > 0)
          if (balance > 0) {
            const burnInstruction = createBurnCheckedInstruction(
              tokenAccount,     // Token account to burn from
              mintPublicKey,    // NFT mint
              ownerPublicKey,   // Owner
              balance,          // Amount to burn (typically 1 for NFTs)
              decimals,         // Decimals (typically 0 for NFTs)
              [],               // Additional signers
              TOKEN_PROGRAM_ID  // Token program ID
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
          totalNFTsProcessed++;
          
        } catch (error) {
          console.log(`Error processing NFT ${nftMint}:`, error);
          continue;
        }
      }
      
      if (totalNFTsProcessed === 0) {
        return res.status(400).json({ error: "No valid NFTs found to burn" });
      }
      
      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = ownerPublicKey;
      
      // Serialize transaction
      const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
      const transactionBase64 = serializedTransaction.toString('base64');
      
      const totalSolRecovered = (totalNFTsProcessed * 0.00203928).toFixed(8);
      
      console.log(`Bulk NFT burn transaction prepared: ${totalNFTsProcessed} NFTs, ${totalSolRecovered} SOL`);
      
      res.json({
        transaction: transactionBase64,
        nftsProcessed: totalNFTsProcessed,
        solRecovered: totalSolRecovered,
        message: `Bulk burn transaction prepared for ${totalNFTsProcessed} NFTs`
      });
      
    } catch (error) {
      console.error('Error preparing bulk NFT burn:', error);
      res.status(500).json({ error: "Failed to prepare bulk NFT burn transaction" });
    }
  });

  // Single Burn Token API (for individual burns)
  app.post("/api/tokens/burn", async (req, res) => {
    try {
      const { walletAddress, tokenMint } = req.body;
      
      if (!walletAddress || !tokenMint) {
        return res.status(400).json({ error: "Wallet address and token mint are required" });
      }

      const { Connection, PublicKey, Transaction } = await import('@solana/web3.js');
      const { 
        TOKEN_PROGRAM_ID, 
        createBurnCheckedInstruction, 
        createCloseAccountInstruction, 
        getAssociatedTokenAddress 
      } = await import('@solana/spl-token');
      
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
        const burnInstruction = createBurnCheckedInstruction(
          tokenAccount,     // Token account to burn from
          mintPublicKey,    // Token mint
          ownerPublicKey,   // Owner
          balance,          // Amount to burn (full balance)
          decimals,         // Decimals
          [],               // Additional signers
          TOKEN_PROGRAM_ID  // Token program ID
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

  // Burn NFT API  
  app.post("/api/nfts/burn", async (req, res) => {
    try {
      const { walletAddress, nftMint } = req.body;
      
      if (!walletAddress || !nftMint) {
        return res.status(400).json({ error: "Wallet address and NFT mint are required" });
      }

      const { Connection, PublicKey, Transaction } = await import('@solana/web3.js');
      const { 
        TOKEN_PROGRAM_ID, 
        createBurnCheckedInstruction, 
        createCloseAccountInstruction, 
        getAssociatedTokenAddress 
      } = await import('@solana/spl-token');
      
      // Use Helius RPC if available
      const heliusApiKey = process.env.HELIUS_API_KEY;
      const rpcUrl = heliusApiKey 
        ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
        : 'https://api.mainnet-beta.solana.com';
      
      console.log('Creating NFT burn transaction...');
      
      const connection = new Connection(rpcUrl, 'confirmed');
      const ownerPublicKey = new PublicKey(walletAddress);
      const mintPublicKey = new PublicKey(nftMint);
      
      // Get associated token account
      const tokenAccount = await getAssociatedTokenAddress(
        mintPublicKey,
        ownerPublicKey
      );
      
      // Get token account info - NFTs typically have balance=1, decimals=0
      const tokenAccountInfo = await connection.getParsedAccountInfo(tokenAccount);
      const parsedInfo = tokenAccountInfo.value?.data as any;
      
      if (!parsedInfo?.parsed?.info) {
        throw new Error('NFT token account not found or invalid');
      }
      
      const balance = parsedInfo.parsed.info.tokenAmount.amount;
      const decimals = parsedInfo.parsed.info.tokenAmount.decimals;
      
      // Create transaction
      const transaction = new Transaction();
      
      // Step 1: Burn the NFT (if balance > 0)
      if (balance > 0) {
        const burnInstruction = createBurnCheckedInstruction(
          tokenAccount,     // Token account to burn from
          mintPublicKey,    // NFT mint
          ownerPublicKey,   // Owner
          balance,          // Amount to burn (typically 1 for NFTs)
          decimals,         // Decimals (typically 0 for NFTs)
          [],               // Additional signers
          TOKEN_PROGRAM_ID  // Token program ID
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
      
      console.log(`NFT burn transaction prepared: ${balance > 0 ? 'burn + close' : 'close only'} for mint ${nftMint}`);
      
      res.json({
        transaction: transactionBase64,
        solRecovered: '0.00203928', // Standard rent-exempt amount  
        message: `NFT burn transaction prepared successfully (${balance > 0 ? 'burn + close' : 'close only'})`
      });
      
    } catch (error) {
      console.error('Error preparing NFT burn:', error);
      res.status(500).json({ error: "Failed to prepare NFT burn transaction" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
