import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTransactionRecordSchema, insertEmptyTokenAccountSchema, insertScanResultSchema, insertTransactionLedgerSchema, insertTokenBurnRecordSchema, insertNftBurnRecordSchema, insertReferralCodeSchema, insertReferralTransactionSchema, referralCodes, createAutoClaimPermitRequestSchema, revokeAutoClaimPermitRequestSchema, autoClaimPermitMessageSchema, autoClaimRevokeMessageSchema, jupiterLendDeposits, xAuthTokens, xPosts, xSchedules, xEngagement } from "@shared/schema";
import { nanoid } from "nanoid";
import { eq } from 'drizzle-orm';
import { db } from './db';
import { Connection, PublicKey, Transaction, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction, ComputeBudgetProgram, LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createBurnInstruction, createBurnCheckedInstruction, createCloseAccountInstruction, createSetAuthorityInstruction, AuthorityType, getAccount, createAssociatedTokenAccountInstruction, createSyncNativeInstruction, NATIVE_MINT, getAssociatedTokenAddressSync, createTransferInstruction } from "@solana/spl-token";
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
import cron from 'node-cron';

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

  // Jupiter Ultra Swap - Get Order endpoint (replaces quote + swap)
  app.get("/api/jupiter/ultra/order", async (req, res) => {
    try {
      const { inputMint, outputMint, amount, taker } = req.query;
      
      if (!inputMint || !outputMint || !amount) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      // Ultra Swap Referral Configuration
      // Referral account: 5fiaP6GJBixn5N1pZT5dUer1MUkdAiKMg7tBMPbFyZdB
      // Token account for fees: 6F75HBoQ64GRXnUXAxeWMcJVax5dUgeBnY96sWSNzXdD
      const referralAccount = "5fiaP6GJBixn5N1pZT5dUer1MUkdAiKMg7tBMPbFyZdB";
      const referralFee = 50; // 0.50% (50 bps)

      // Build order URL with referral params
      const orderUrl = new URL('https://lite-api.jup.ag/ultra/v1/order');
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
        headers: { 'Accept': 'application/json' }
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
      
      res.json(orderData);
    } catch (error) {
      console.error('Jupiter Ultra order proxy error:', error);
      res.status(500).json({ error: 'Internal server error' });
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
        console.log('✅ Ultra Swap successful:', JSON.stringify(executeData, null, 2));
        console.log(`   https://solscan.io/tx/${executeData.signature}`);
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
      const { address } = req.query;
      
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ error: 'Missing address parameter' });
      }

      // Use Jupiter Ultra Holdings API - returns ALL tokens (standard + Token-2022)
      const holdingsResponse = await fetch(`https://lite-api.jup.ag/ultra/v1/holdings/${address}`);
      
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
      const solBalance = parseFloat(holdings.uiAmount || '0');
      if (solBalance > 0) {
        tokensWithMetadata.push({
          address: 'So11111111111111111111111111111111111111112',
          symbol: 'SOL',
          name: 'Solana',
          decimals: 9,
          logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
          balance: solBalance,
          balanceRaw: holdings.amount
        });
      }

      // Process all token holdings (includes both standard and Token-2022)
      if (holdings.tokens) {
        for (const [mintAddress, tokenAccounts] of Object.entries(holdings.tokens)) {
          // Sum all token accounts for this mint (some tokens may have multiple accounts)
          const totalBalance = (tokenAccounts as any[]).reduce((sum, acc) => 
            sum + parseFloat(acc.uiAmount || '0'), 0
          );
          
          if (totalBalance > 0) {
            const firstAccount = (tokenAccounts as any[])[0];
            
            // Fetch metadata from Jupiter
            try {
              const metadataResponse = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${mintAddress}`);
              if (metadataResponse.ok) {
                const searchResults = await metadataResponse.json();
                const metadata = Array.isArray(searchResults) 
                  ? searchResults.find((t: any) => t.id === mintAddress)
                  : null;
                
                if (metadata) {
                  tokensWithMetadata.push({
                    address: mintAddress,
                    symbol: metadata.symbol || 'UNKNOWN',
                    name: metadata.name || 'Unknown Token',
                    decimals: firstAccount.decimals,
                    logoURI: metadata.icon || '',
                    balance: totalBalance,
                    balanceRaw: (tokenAccounts as any[]).reduce((sum, acc) => 
                      sum + BigInt(acc.amount || '0'), BigInt(0)
                    ).toString()
                  });
                  continue;
                }
              }
            } catch (err) {
              console.error(`Error fetching metadata for ${mintAddress}:`, err);
            }

            // Fallback if metadata not found
            tokensWithMetadata.push({
              address: mintAddress,
              symbol: 'UNKNOWN',
              name: 'Unknown Token',
              decimals: firstAccount.decimals,
              logoURI: '',
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
          const priceResponse = await fetch(`https://lite-api.jup.ag/price/v3?ids=${mintAddresses}`);
          
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
        console.log('💼 Developer API: Using direct fee receiver address:', feeReceiverAddress);
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
      const rpcUrl = heliusApiKey ? 
        `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}` : 
        'https://api.mainnet-beta.solana.com';
      
      const connection = new Connection(rpcUrl, 'confirmed');

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
      
      // Calculate fees in lamports - use partner's fee or default to 15%
      const PLATFORM_FEE_PERCENTAGE = feePercentage || donationPercentage || 15; // Partner's fee or fallback to 15%
      const totalFeeLamports = Math.floor(totalRecoveredLamports * (PLATFORM_FEE_PERCENTAGE / 100));
      
      let referralFeeLamports = 0;
      let platformFeeLamports = totalFeeLamports;
      
      console.log(`Fee calculation: recovered=${totalRecoveredLamports} lamports, total fee=${totalFeeLamports} lamports (${PLATFORM_FEE_PERCENTAGE}%)`);
      
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
          console.log(`✅ Referral wallet exists - platform=${platformFeeLamports} (50%), referral=${referralFeeLamports} (50%)`);
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
        const feeCollectorPublicKey = new PublicKey('GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6');
        
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
      const { signature, walletAddress, selectedAccounts, accountsClosed, solRecovered, netAmount, feeAmount, referralCodeUsed, platformFeeAmount, referralFeeAmount } = req.body;

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
          const priceResponse = await fetch(`https://lite-api.jup.ag/price/v3?ids=${mintAddresses}`);
          
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
        const feeCollectorPublicKey = new PublicKey('GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6');
        
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
      const platformWallet = new PublicKey('GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6');
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
      const platformWalletAddress = 'GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6';

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
      const platformWalletAddress = 'GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6';

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
      const platformWalletAddress = 'GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6';

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
      const heliusRpc = process.env.VITE_HELIUS_API_KEY 
        ? `https://mainnet.helius-rpc.com/?api-key=${process.env.VITE_HELIUS_API_KEY}`
        : "https://api.mainnet-beta.solana.com";
      const connection = new Connection(heliusRpc, "confirmed");

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

  // Jupiter Lend - Get earn pools with APY rates
  app.get("/api/jupiter-lend/earn-pools", async (req, res) => {
    try {
      console.log('🪐 Fetching Jupiter Lend earn tokens from API...');

      // Fetch earn tokens data from Jupiter Lend API
      const response = await fetch('https://lite-api.jup.ag/lend/v1/earn/tokens');
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Jupiter API returned ${response.status}: ${errorText}`);
      }

      const earnPools = await response.json();
      console.log(`✅ Found ${earnPools.length} Jupiter Lend earn tokens`);

      // Transform the data to match our frontend format
      const reserves = earnPools.map((pool: any) => {
        // Extract the underlying asset address (the mint to deposit)
        const assetMint = pool.assetAddress || pool.asset?.address || '';
        const rawSymbol = pool.asset?.symbol || pool.symbol || 'Unknown';
        // Display "SOL" instead of "WSOL" for better UX
        const assetSymbol = rawSymbol === 'WSOL' ? 'SOL' : rawSymbol;
        const assetDecimals = pool.asset?.decimals || pool.decimals || 9;
        const logoUrl = pool.asset?.logoUrl || '';
        
        // Convert rates from basis points to percentage (e.g., 430 -> 4.30%)
        const supplyAPY = parseFloat(pool.totalRate || pool.supplyRate || 0) / 100;
        
        return {
          address: pool.address, // jlToken address
          symbol: assetSymbol,
          name: pool.asset?.name || pool.name || assetSymbol,
          mint: assetMint, // Underlying asset mint address for deposits
          logoUrl: logoUrl, // Token logo image URL
          depositAPY: supplyAPY,
          borrowAPY: 0,
          tvl: (parseFloat(pool.totalAssets || 0) / Math.pow(10, assetDecimals)).toFixed(2),
          deposited: '0.00',
          earnings: '0.00',
          decimals: assetDecimals,
          utilization: 0,
          available: pool.totalAssets || '0',
          price: pool.asset?.price || '0' // Token price in USD
        };
      });

      console.log(`Sample reserve: ${reserves[0]?.symbol} - Mint: ${reserves[0]?.mint}`);

      res.json({
        success: true,
        programId: 'jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9',
        reserves,
        totalPools: earnPools.length
      });
    } catch (error: any) {
      console.error("Jupiter Lend earn pools error:", error);
      res.status(500).json({ error: "Failed to load Jupiter Lend earn pools", details: error.message });
    }
  });

  // Jupiter Lend - Get user positions
  app.get("/api/jupiter-lend/user-positions/:walletAddress", async (req, res) => {
    try {
      const { walletAddress } = req.params;

      if (!walletAddress) {
        return res.status(400).json({ error: 'Wallet address is required' });
      }

      console.log(`📊 Loading Jupiter Lend positions for wallet: ${walletAddress}`);

      // Fetch user positions from Jupiter Lend API
      const response = await fetch(`https://lite-api.jup.ag/lend/v1/earn/positions?users=${walletAddress}`);
      
      if (!response.ok) {
        throw new Error(`Jupiter API returned ${response.status}`);
      }

      const positionsData = await response.json();
      console.log('📊 Raw Jupiter Lend positions data:', JSON.stringify(positionsData, null, 2));

      if (!positionsData || positionsData.length === 0) {
        console.log('⚠️ No positions found for wallet');
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

  // Jupiter Lend - Build deposit transaction using SDK (exact documentation implementation)
  app.post("/api/jupiter-lend/build-deposit", async (req, res) => {
    try {
      const { walletAddress, asset, amount } = req.body;

      if (!walletAddress || !asset || !amount) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // CRITICAL: CASH is ONLY available on Kamino, NOT Jupiter
      const CASH_MINT = 'CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH';
      if (asset === CASH_MINT) {
        return res.status(400).json({ 
          error: 'CASH token is only available on Kamino, not Jupiter',
          hint: 'Use /api/kamino-lend/build-deposit instead',
          platform: 'Kamino'
        });
      }

      console.log(`🏦 Building Jupiter Lend deposit transaction`);
      console.log(`   Asset: ${asset}`);
      console.log(`   Amount: ${amount}`);
      console.log(`   Wallet: ${walletAddress}`);

      const rpcEndpoint = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';
      const connection = new Connection(rpcEndpoint);

      const walletPubkey = new PublicKey(walletAddress);
      const assetPubkey = new PublicKey(asset);
      const isSOL = asset === 'So11111111111111111111111111111111111111112';

      const instructions: TransactionInstruction[] = [];

      // For SOL deposits, add wrapping instructions
      if (isSOL) {
        console.log('💫 Adding WSOL wrapping instructions for SOL deposit');
        
        // Get user's WSOL ATA
        const wsolATA = await getAssociatedTokenAddress(
          NATIVE_MINT,
          walletPubkey
        );

        // Check if WSOL ATA exists
        let wsolAccountExists = false;
        try {
          await getAccount(connection, wsolATA);
          wsolAccountExists = true;
          console.log('✅ WSOL ATA exists:', wsolATA.toBase58());
        } catch {
          console.log('📝 WSOL ATA does not exist, will create');
        }

        // Create WSOL ATA if it doesn't exist
        if (!wsolAccountExists) {
          instructions.push(
            createAssociatedTokenAccountInstruction(
              walletPubkey,
              wsolATA,
              walletPubkey,
              NATIVE_MINT
            )
          );
        }

        // Transfer SOL to WSOL account (amount + rent for account)
        const rentExemption = await connection.getMinimumBalanceForRentExemption(165);
        instructions.push(
          SystemProgram.transfer({
            fromPubkey: walletPubkey,
            toPubkey: wsolATA,
            lamports: BigInt(amount) + BigInt(rentExemption),
          })
        );

        // Sync native to recognize wrapped SOL
        instructions.push(
          createSyncNativeInstruction(wsolATA)
        );
      }

      // Get deposit instruction exactly as documentation shows
      const depositIx = await getDepositIx({
        amount: new BN(amount),
        asset: assetPubkey,
        signer: walletPubkey,
        connection,
        cluster: "mainnet",
      });

      // Convert the raw instruction to TransactionInstruction
      const depositInstruction = new TransactionInstruction({
        programId: new PublicKey(depositIx.programId),
        keys: depositIx.keys.map((key) => ({
          pubkey: new PublicKey(key.pubkey),
          isSigner: key.isSigner,
          isWritable: key.isWritable,
        })),
        data: Buffer.from(depositIx.data),
      });

      instructions.push(depositInstruction);

      // Build versioned transaction
      const latestBlockhash = await connection.getLatestBlockhash();
      const messageV0 = new TransactionMessage({
        payerKey: walletPubkey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions,
      }).compileToV0Message();

      const transaction = new VersionedTransaction(messageV0);
      
      // Serialize transaction to base64
      const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');

      console.log(`✅ Deposit transaction built successfully`);

      res.json({
        success: true,
        transaction: serializedTransaction,
        message: 'Transaction ready to sign'
      });

    } catch (error: any) {
      console.error("Build deposit transaction error:", error);
      res.status(500).json({ error: "Failed to build deposit transaction", details: error.message });
    }
  });

  // Jupiter Lend - Build withdraw transaction using SDK (exact documentation implementation)
  app.post("/api/jupiter-lend/build-withdraw", async (req, res) => {
    try {
      const { walletAddress, asset, amount } = req.body;

      if (!walletAddress || !asset || !amount) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      console.log(`💸 Building Jupiter Lend withdraw transaction`);
      console.log(`   Asset: ${asset}`);
      console.log(`   Amount: ${amount}`);
      console.log(`   Wallet: ${walletAddress}`);

      const rpcEndpoint = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';
      const connection = new Connection(rpcEndpoint);

      // Get withdraw instruction exactly as documentation shows
      const withdrawIx = await getWithdrawIx({
        amount: new BN(amount),
        asset: new PublicKey(asset),
        signer: new PublicKey(walletAddress),
        connection,
        cluster: "mainnet",
      });

      // Convert the raw instruction to TransactionInstruction
      const instruction = new TransactionInstruction({
        programId: new PublicKey(withdrawIx.programId),
        keys: withdrawIx.keys.map((key) => ({
          pubkey: new PublicKey(key.pubkey),
          isSigner: key.isSigner,
          isWritable: key.isWritable,
        })),
        data: Buffer.from(withdrawIx.data),
      });

      // Build versioned transaction
      const latestBlockhash = await connection.getLatestBlockhash();
      const messageV0 = new TransactionMessage({
        payerKey: new PublicKey(walletAddress),
        recentBlockhash: latestBlockhash.blockhash,
        instructions: [instruction],
      }).compileToV0Message();

      const transaction = new VersionedTransaction(messageV0);
      
      // Simulate transaction to catch errors before sending to wallet
      try {
        const simulation = await connection.simulateTransaction(transaction, {
          commitment: 'confirmed',
        });
        
        if (simulation.value.err) {
          console.error('❌ Transaction simulation failed:', simulation.value.err);
          console.error('Logs:', simulation.value.logs);
          throw new Error(`Transaction would fail: ${JSON.stringify(simulation.value.err)}`);
        }
        
        console.log('✅ Transaction simulation successful');
        console.log('Logs:', simulation.value.logs?.slice(0, 5));
      } catch (simError: any) {
        console.error('❌ Simulation error:', simError.message);
        throw new Error(`Transaction simulation failed: ${simError.message}`);
      }
      
      // Serialize transaction to base64
      const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');

      console.log(`✅ Withdraw transaction built successfully`);

      res.json({
        success: true,
        transaction: serializedTransaction,
        message: 'Transaction ready to sign'
      });

    } catch (error: any) {
      console.error("Build withdraw transaction error:", error);
      res.status(500).json({ error: "Failed to build withdraw transaction", details: error.message });
    }
  });

  // Record Jupiter Lend deposit for analytics
  app.post("/api/jupiter-lend/record-deposit", async (req, res) => {
    try {
      const { signature, walletAddress, tokenMint, tokenSymbol, amountDeposited, usdValueAtDeposit, apyAtDeposit } = req.body;

      if (!signature || !walletAddress || !tokenMint || !tokenSymbol || !amountDeposited || !usdValueAtDeposit || !apyAtDeposit) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      await db.insert(jupiterLendDeposits).values({
        signature,
        walletAddress,
        tokenMint,
        tokenSymbol,
        amountDeposited,
        usdValueAtDeposit,
        apyAtDeposit,
      });

      console.log(`✅ Recorded Jupiter Lend deposit: ${walletAddress} - ${amountDeposited} ${tokenSymbol}`);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Record deposit error:", error);
      res.status(500).json({ error: "Failed to record deposit", details: error.message });
    }
  });

  // Get Jupiter Lend statistics - Real-time data from Jupiter API for ALL users
  app.get("/api/jupiter-lend/statistics", async (req, res) => {
    try {
      // Get all unique wallets that have deposited
      const deposits = await db.select({ walletAddress: jupiterLendDeposits.walletAddress })
        .from(jupiterLendDeposits)
        .groupBy(jupiterLendDeposits.walletAddress);

      console.log(`📊 Fetching statistics for ${deposits.length} wallets:`, deposits.map(d => d.walletAddress));

      let totalDepositsUsd = 0;
      let totalEarningsUsd = 0;

      // Fetch real-time positions for each wallet from Jupiter API
      for (const { walletAddress } of deposits) {
        try {
          console.log(`🔍 Fetching positions for wallet: ${walletAddress}`);
          const response = await fetch(`https://lite-api.jup.ag/lend/v1/earn/positions?users=${walletAddress}`);
          if (!response.ok) {
            console.log(`❌ Failed to fetch positions for ${walletAddress}: ${response.status}`);
            continue;
          }

          const positions = await response.json();
          console.log(`📈 Found ${positions.length} positions for ${walletAddress}`);
          
          for (const position of positions) {
            if (!position.shares || position.shares === "0") {
              console.log(`⏭️ Skipping ${position.token.symbol} - no shares`);
              continue;
            }

            const underlyingAssets = parseFloat(position.underlyingAssets);
            const decimals = position.token.decimals || 6;
            const tokenPrice = parseFloat(position.token.asset.price || '0');
            
            // Calculate USD value of deposit
            const depositAmount = underlyingAssets / Math.pow(10, decimals);
            const depositUsd = depositAmount * tokenPrice;
            console.log(`💰 ${position.token.symbol}: ${depositAmount.toFixed(6)} × $${tokenPrice} = $${depositUsd.toFixed(10)}`);
            totalDepositsUsd += depositUsd;
          }
        } catch (walletError) {
          console.error(`Failed to fetch positions for ${walletAddress}:`, walletError);
        }
      }

      // Fetch earnings from Jupiter Earnings API for all wallets with deposits
      for (const { walletAddress } of deposits) {
        try {
          // First, get positions to find jlToken addresses
          const positionsResponse = await fetch(`https://lite-api.jup.ag/lend/v1/earn/positions?users=${walletAddress}`);
          if (!positionsResponse.ok) continue;

          const positions = await positionsResponse.json();
          const jlTokens = positions
            .filter((p: any) => p.shares && p.shares !== "0")
            .map((p: any) => p.token.address)
            .join(',');

          if (!jlTokens) continue;

          // Fetch earnings for this wallet's jlTokens
          const earningsResponse = await fetch(`https://lite-api.jup.ag/lend/v1/earn/earnings?user=${walletAddress}&positions=${jlTokens}`);
          if (!earningsResponse.ok) continue;

          const earningsData = await earningsResponse.json();

          for (const earning of earningsData) {
            const position = positions.find((p: any) => p.token.address === earning.address);
            if (!position) continue;

            const rawEarnings = parseFloat(earning.earnings || '0');
            const decimals = position.token.decimals || 6;
            const tokenPrice = parseFloat(position.token.asset.price || '0');

            const earningsAmount = rawEarnings / Math.pow(10, decimals);
            const earningsUsd = earningsAmount * tokenPrice;
            totalEarningsUsd += earningsUsd;
          }
        } catch (earningsError) {
          console.error(`Failed to fetch earnings for ${walletAddress}:`, earningsError);
        }
      }

      // Format USD values with proper decimal precision
      const formatUsdValue = (value: number): string => {
        if (value === 0) return '0.00';
        if (value >= 0.01) return value.toFixed(2);
        // For very small amounts, show up to 10 decimal places
        return value.toFixed(10);
      };

      res.json({
        success: true,
        totalDepositsUsd: formatUsdValue(totalDepositsUsd),
        totalEarningsUsd: formatUsdValue(totalEarningsUsd),
        totalDeposits: deposits.length,
      });
    } catch (error: any) {
      console.error("Get statistics error:", error);
      res.status(500).json({ error: "Failed to get statistics", details: error.message });
    }
  });

  // ============================================
  // X (TWITTER) BOT API ENDPOINTS
  // ============================================
  
  const PLATFORM_WALLET = 'GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6';
  
  // Middleware to verify platform wallet signature (POST requests)
  const requirePlatformWallet = (req: any, res: any, next: any) => {
    const { walletAddress, signature, message } = req.body;
    
    if (!walletAddress || !signature || !message) {
      return res.status(401).json({ error: 'Missing authentication credentials' });
    }
    
    if (walletAddress !== PLATFORM_WALLET) {
      return res.status(403).json({ error: 'Access denied: Platform wallet required' });
    }
    
    // Verify signature
    const isValid = verifySignature(message, signature, walletAddress);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    // Prevent replay attacks: message must include timestamp within last 5 minutes
    try {
      const messageData = JSON.parse(message);
      const timestamp = messageData.timestamp;
      
      if (!timestamp) {
        return res.status(401).json({ error: 'Message must include timestamp' });
      }
      
      const now = Date.now();
      const messageTime = new Date(timestamp).getTime();
      const fiveMinutes = 5 * 60 * 1000;
      
      if (now - messageTime > fiveMinutes) {
        return res.status(401).json({ error: 'Signature expired (>5 minutes old)' });
      }
      
      if (messageTime > now + 60000) { // Allow 1 minute clock skew
        return res.status(401).json({ error: 'Invalid timestamp (future)' });
      }
    } catch (error) {
      return res.status(401).json({ error: 'Invalid message format (must be JSON with timestamp)' });
    }
    
    next();
  };
  
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
  
  // ============================================
  // X BOT SCHEDULED POSTING SYSTEM
  // ============================================
  
  async function generateDailyReportContent(): Promise<string> {
    // Get yesterday's stats
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterdayTransactions = await db.select()
      .from(transactionLedger)
      .where(sql`${transactionLedger.processedAt} >= ${yesterday.toISOString()} AND ${transactionLedger.processedAt} < ${today.toISOString()}`);
    
    let accountsClosed = 0;
    let solRecovered = 0;
    
    for (const tx of yesterdayTransactions) {
      accountsClosed += tx.itemsProcessed;
      solRecovered += parseFloat(tx.solRecovered.toString());
    }
    
    const messages = [
      `📊 Daily Report\n\n${accountsClosed} accounts closed\n${solRecovered.toFixed(4)} SOL recovered\n\nReclaim your SOL: getyoursolback.app`,
      `🔥 Yesterday's Impact\n\nHelped Solana users close ${accountsClosed} empty accounts\nRecovered ${solRecovered.toFixed(4)} SOL\n\n💰 Get yours: getyoursolback.app`,
      `📈 Daily Stats\n\nAccounts processed: ${accountsClosed}\nSOL back to users: ${solRecovered.toFixed(4)}\n\nFree your locked SOL: getyoursolback.app`,
    ];
    
    return messages[Math.floor(Math.random() * messages.length)];
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
          console.log('📊 Posting daily report...');
          const content = await generateDailyReportContent();
          await xApiService.postTweet({ content, postType: 'daily_report' });
          await db.update(xSchedules)
            .set({ lastRun: new Date() })
            .where(eq(xSchedules.scheduleType, 'daily_report'));
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
      
      // Validate fee percentage (0-10%)
      const feeNum = parseFloat(feePercentage);
      if (isNaN(feeNum) || feeNum < 0 || feeNum > 10) {
        return res.status(400).json({ 
          error: 'Fee percentage must be between 0 and 10' 
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
      const platformWallet = new PublicKey('GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6');
      const developerWallet = new PublicKey(walletAddress);
      
      // Create transaction to transfer WSOL
      const connection = new Connection(
        process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com',
        'confirmed'
      );
      
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
  
  // Step 1: Create account creation intent (generates rent payment transaction)
  app.post("/api/referral/create-account-intent", async (req, res) => {
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
      
      // Check for pending intent
      const pendingIntent = await storage.getPendingIntentByWallet(walletAddress);
      if (pendingIntent) {
        // Return existing intent if not expired
        if (new Date(pendingIntent.expiresAt) > new Date()) {
          return res.status(409).json({ 
            error: 'Account creation already in progress',
            intentId: pendingIntent.id,
            expiresAt: pendingIntent.expiresAt
          });
        }
        // Mark expired intent as expired
        await storage.updateIntentStatus(pendingIntent.id, 'expired');
      }
      
      // Get project account
      const project = await storage.getProjectAccount();
      if (!project) {
        return res.status(500).json({ error: 'Platform not initialized' });
      }
      
      // Generate a new keypair for the referral account
      const { generateReferralKeypair } = await import('./pdaService.js');
      const { publicKey, encryptedPrivateKey } = generateReferralKeypair();
      
      // Create intent with 10-minute expiry
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      const rentAmount = '0.002'; // 0.002 SOL rent
      
      const intent = await storage.createAccountCreationIntent({
        developerWallet: walletAddress,
        referralPda: publicKey,
        encryptedPrivateKey,
        projectAccountId: project.id,
        projectName: projectName || 'Unnamed Project',
        feePercentage: '0',
        bump: 0,
        rentAmount,
        expiresAt
      });
      
      // Build rent payment transaction
      const connection = new Connection(
        process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com',
        'confirmed'
      );
      
      const { Transaction, SystemProgram, LAMPORTS_PER_SOL } = await import('@solana/web3.js');
      
      const developerPubkey = new PublicKey(walletAddress);
      const referralPubkey = new PublicKey(publicKey);
      const rentLamports = Math.floor(parseFloat(rentAmount) * LAMPORTS_PER_SOL);
      
      // Create transfer instruction
      const transferIx = SystemProgram.transfer({
        fromPubkey: developerPubkey,
        toPubkey: referralPubkey,
        lamports: rentLamports
      });
      
      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash('finalized');
      
      // Create transaction
      const transaction = new Transaction();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = developerPubkey;
      transaction.add(transferIx);
      
      // Serialize transaction
      const serializedTx = transaction.serialize({ requireAllSignatures: false }).toString('base64');
      
      console.log(`📋 Created account intent for ${walletAddress}`);
      console.log(`   Intent ID: ${intent.id}`);
      console.log(`   Referral Wallet: ${publicKey}`);
      console.log(`   Rent Required: ${rentAmount} SOL`);
      
      res.json({
        success: true,
        intentId: intent.id,
        referralPda: publicKey,
        rentAmount,
        expiresAt,
        transaction: serializedTx
      });
    } catch (error: any) {
      console.error('Create account intent error:', error);
      res.status(500).json({ 
        error: 'Failed to create account intent', 
        details: error.message 
      });
    }
  });
  
  // Step 2: Finalize account creation (verify rent payment and create account)
  app.post("/api/referral/finalize-account", async (req, res) => {
    try {
      const { intentId, signature } = req.body;
      
      if (!intentId || !signature) {
        return res.status(400).json({ 
          error: 'Missing required fields: intentId, signature' 
        });
      }
      
      // Get intent
      const intent = await storage.getAccountCreationIntent(intentId);
      if (!intent) {
        return res.status(404).json({ error: 'Intent not found' });
      }
      
      if (intent.status !== 'pending') {
        return res.status(400).json({ 
          error: `Intent is ${intent.status}`,
          status: intent.status
        });
      }
      
      // Check expiry
      if (new Date(intent.expiresAt) < new Date()) {
        await storage.updateIntentStatus(intentId, 'expired');
        return res.status(400).json({ error: 'Intent has expired' });
      }
      
      // Verify transaction on-chain
      const connection = new Connection(
        process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com',
        'confirmed'
      );
      
      try {
        const txInfo = await connection.getTransaction(signature, {
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed'
        });
        
        if (!txInfo || txInfo.meta?.err) {
          return res.status(400).json({ 
            error: 'Transaction failed or not found',
            signature
          });
        }
        
        // Verify transaction details
        const { LAMPORTS_PER_SOL } = await import('@solana/web3.js');
        const expectedLamports = Math.floor(parseFloat(intent.rentAmount) * LAMPORTS_PER_SOL);
        
        // Check pre and post balances
        const accountKeys = txInfo.transaction.message.getAccountKeys();
        const referralPubkey = new PublicKey(intent.referralPda);
        const developerPubkey = new PublicKey(intent.developerWallet);
        
        let referralIndex = -1;
        let developerIndex = -1;
        
        for (let i = 0; i < accountKeys.length; i++) {
          const key = accountKeys.get(i);
          if (key && key.equals(referralPubkey)) {
            referralIndex = i;
          }
          if (key && key.equals(developerPubkey)) {
            developerIndex = i;
          }
        }
        
        if (referralIndex === -1 || developerIndex === -1) {
          return res.status(400).json({ 
            error: 'Transaction does not involve correct accounts',
            expected: { referral: intent.referralPda, developer: intent.developerWallet }
          });
        }
        
        const preBalance = txInfo.meta!.preBalances[referralIndex] || 0;
        const postBalance = txInfo.meta!.postBalances[referralIndex] || 0;
        const balanceDelta = postBalance - preBalance;
        
        if (balanceDelta < expectedLamports) {
          return res.status(400).json({ 
            error: 'Insufficient rent payment',
            expected: expectedLamports,
            received: balanceDelta
          });
        }
        
      } catch (verifyError: any) {
        console.error('Transaction verification error:', verifyError);
        return res.status(400).json({ 
          error: 'Failed to verify transaction',
          details: verifyError.message
        });
      }
      
      // Create referral account from intent
      const account = await storage.createReferralAccount({
        projectAccountId: intent.projectAccountId,
        developerWallet: intent.developerWallet,
        referralPda: intent.referralPda,
        encryptedPrivateKey: intent.encryptedPrivateKey,
        bump: intent.bump,
        projectName: intent.projectName || 'Unnamed Project',
        feePercentage: intent.feePercentage || '0',
        rentSignature: signature,
        rentAmount: intent.rentAmount
      });
      
      // Update intent status
      await storage.updateIntentStatus(intentId, 'completed');
      
      console.log(`✅ Finalized referral account for ${intent.developerWallet}`);
      console.log(`   Referral Wallet: ${account.referralPda}`);
      console.log(`   Rent Paid: ${intent.rentAmount} SOL (${signature})`);
      
      res.json({
        success: true,
        account: {
          id: account.id,
          referralPda: account.referralPda,
          projectName: account.projectName,
          feePercentage: account.feePercentage,
          status: account.status,
          rentPaid: account.rentPaid,
          rentSignature: account.rentSignature,
          createdAt: account.createdAt
        }
      });
    } catch (error: any) {
      console.error('Finalize account error:', error);
      res.status(500).json({ 
        error: 'Failed to finalize account', 
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
        return res.status(404).json({ error: 'Referral account not found' });
      }
      
      const tokenAccounts = await storage.getTokenAccountsByReferralId(referralAccount.id);
      
      // Fetch SOL balance of the referral PDA
      let pdaBalance = 0;
      if (referralAccount.referralPda) {
        try {
          const heliusApiKey = process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_API_KEY;
          const rpcUrl = heliusApiKey ? 
            `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}` : 
            'https://api.mainnet-beta.solana.com';
          const connection = new Connection(rpcUrl, 'confirmed');
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
      const rpcUrl = heliusApiKey ? 
        `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}` : 
        'https://api.mainnet-beta.solana.com';
      const connection = new Connection(rpcUrl, 'confirmed');
      
      const feeWalletPubkey = new PublicKey(referralAccount.referralPda);
      const balance = await connection.getBalance(feeWalletPubkey);
      
      if (balance === 0) {
        return res.status(400).json({ error: 'No balance to claim' });
      }
      
      // Minimum claimable amount (0.0001 SOL)
      const MIN_CLAIM_AMOUNT = 100000; // 0.0001 SOL in lamports
      
      // Calculate claimable amount (leave rent exempt amount + transaction fee)
      const minRent = await connection.getMinimumBalanceForRentExemption(0);
      const estimatedFee = 5000; // 0.000005 SOL for transaction fee
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
      
      // Decrypt private key and create keypair
      const { decryptPrivateKey } = await import('./pdaService.js');
      const secretKey = decryptPrivateKey(referralAccount.encryptedPrivateKey);
      const feeWalletKeypair = Keypair.fromSecretKey(secretKey);
      
      // Create and sign transfer transaction
      const recipientPubkey = new PublicKey(walletAddress);
      
      // Get recent blockhash first
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      
      // Create transaction and set properties
      const transaction = new Transaction();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = feeWalletKeypair.publicKey;
      
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: feeWalletKeypair.publicKey,
          toPubkey: recipientPubkey,
          lamports: transferAmount,
        })
      );
      
      // Sign transaction with platform-managed key
      transaction.sign(feeWalletKeypair);
      
      // Send transaction
      console.log(`📤 Sending claim transaction for ${walletAddress}...`);
      const signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      });
      
      // Wait for confirmation
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      }, 'confirmed');
      
      console.log(`✅ Claim successful! Signature: ${signature}`);
      
      // Calculate platform/developer splits (80% to developer, 20% to platform)
      const amountClaimed = transferAmount / 1e9;
      const developerReceived = amountClaimed * 0.8;
      const platformReceived = amountClaimed * 0.2;
      
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
      const PLATFORM_ADMIN = 'GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6';
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

  const httpServer = createServer(app);
  return httpServer;
}
