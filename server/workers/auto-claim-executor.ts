import { Connection, PublicKey, Transaction, Keypair, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, createCloseAccountInstruction } from "@solana/spl-token";
import { storage } from "../storage";
import bs58 from "bs58";

const HELIUS_RPC = process.env.VITE_HELIUS_API_KEY 
  ? `https://mainnet.helius-rpc.com/?api-key=${process.env.VITE_HELIUS_API_KEY}`
  : "https://api.mainnet-beta.solana.com";

const PLATFORM_WALLET = "GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6";
const PLATFORM_FEE_BPS = 1500; // 15%

interface ExecutionResult {
  success: boolean;
  signature?: string;
  error?: string;
  accountsClosed: number;
  recoveredLamports: number;
  platformFeeLamports: number;
  userNetLamports: number;
  networkFeeLamports: number;
}

export class AutoClaimExecutor {
  private connection: Connection;
  private isRunning: boolean = false;
  private isProcessing: boolean = false; // Prevent overlapping runs
  private relayerKeypair: Keypair | null = null;

  constructor() {
    this.connection = new Connection(HELIUS_RPC, "confirmed");
  }

  async start() {
    if (this.isRunning) {
      console.log("⚠️  Auto-Claim executor already running");
      return;
    }

    const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY;
    if (!relayerPrivateKey) {
      console.error("❌ RELAYER_PRIVATE_KEY not found in environment");
      console.log("⚠️  Executor running in DRY-RUN mode (will not execute transactions)");
    } else {
      try {
        const secretKey = bs58.decode(relayerPrivateKey);
        this.relayerKeypair = Keypair.fromSecretKey(secretKey);
        console.log(`🔑 Relayer wallet: ${this.relayerKeypair.publicKey.toBase58()}`);
      } catch (error) {
        console.error("❌ Invalid RELAYER_PRIVATE_KEY format");
        console.log("⚠️  Executor running in DRY-RUN mode");
      }
    }

    this.isRunning = true;
    console.log("🤖 Auto-Claim executor ready (on-demand mode)");
    console.log("⚡ Executor will run ONLY when scanner finds accounts to close");
  }

  // Execute jobs on-demand (called by scanner when it creates jobs)
  async executeNow() {
    if (!this.isRunning) {
      console.log("⚠️  Executor not started yet");
      return;
    }
    await this.processJobs();
  }

  stop() {
    this.isRunning = false;
    console.log("🛑 Auto-Claim executor stopped");
  }

  private async processJobs() {
    // Prevent overlapping execution runs
    if (this.isProcessing) {
      console.log("⏭️  Previous job still processing, skipping this cycle");
      return;
    }

    this.isProcessing = true;
    
    try {
      console.log("\n⚙️  Processing pending jobs...");
      
      const pendingJobs = await storage.getPendingRelayerJobs();
      
      if (pendingJobs.length === 0) {
        console.log("   No pending jobs");
        return;
      }

      console.log(`   Found ${pendingJobs.length} pending job(s)`);

      for (const job of pendingJobs) {
        const permit = await storage.getAutoClaimPermitByWallet(job.walletAddress);
        
        if (!permit || permit.status !== 'active') {
          console.log(`   ⏭️  Skipping job ${job.id}: permit not active`);
          await storage.updateRelayerJobStatus(job.id, 'failed', 'Permit not active');
          continue;
        }

        await storage.updateRelayerJobStatus(job.id, 'processing');
        
        const result = await this.executeJob(job);
        
        if (result.success) {
          await storage.updateRelayerJobStatus(job.id, 'completed', result.signature);
          
          if (result.signature) {
            await storage.createRelayerCost({
              jobId: job.id,
              walletAddress: job.walletAddress,
              txSignature: result.signature,
              lamportsSpent: (result.networkFeeLamports / 1e9).toString(),
              recoveredSol: (result.recoveredLamports / 1e9).toString(),
              platformFee: (result.platformFeeLamports / 1e9).toString()
            });

            await storage.createTransactionLedgerEntry({
              signature: result.signature,
              walletAddress: job.walletAddress,
              transactionType: 'sol_reclaim',
              source: 'auto',
              solRecovered: (result.recoveredLamports / 1e9).toString(),
              netAmount: (result.userNetLamports / 1e9).toString(),
              feeAmount: (result.platformFeeLamports / 1e9).toString(),
              itemsProcessed: result.accountsClosed
            });

            await storage.updateAutoClaimPermitLastUsed(job.walletAddress);
          }
        } else {
          await storage.updateRelayerJobStatus(job.id, 'failed', result.error);
        }

        // Step-by-step: Wait 3-5 seconds between transactions to avoid rate limits
        const delayMs = 3000 + Math.random() * 2000; // 3-5 seconds with jitter
        console.log(`   ⏳ Waiting ${(delayMs / 1000).toFixed(1)}s before next transaction...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

    } catch (error) {
      console.error("❌ Executor error:", error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async executeJob(job: any): Promise<ExecutionResult> {
    console.log(`\n   🎯 Executing job ${job.id}`);
    console.log(`      Wallet: ${job.walletAddress.slice(0, 8)}...`);
    console.log(`      Accounts: ${job.itemsCount}`);

    const estimatedRecoveryLamports = job.estimatedNet 
      ? Math.floor(parseFloat(job.estimatedNet) * 1e9) 
      : 0;

    if (!this.relayerKeypair) {
      console.log("      ⚠️  DRY-RUN MODE: Would execute job here");
      return {
        success: true,
        accountsClosed: job.itemsCount || 0,
        recoveredLamports: estimatedRecoveryLamports,
        platformFeeLamports: Math.floor(estimatedRecoveryLamports * PLATFORM_FEE_BPS / 10000),
        userNetLamports: Math.floor(estimatedRecoveryLamports * (10000 - PLATFORM_FEE_BPS) / 10000),
        networkFeeLamports: 5000
      };
    }

    try {
      // Parse token accounts from job
      if (!job.tokenAccounts) {
        throw new Error("No token accounts in job");
      }

      const parsedAccounts = JSON.parse(job.tokenAccounts);
      
      // Support both old format (string[]) and new format ({address, programId}[])
      const tokenAccounts: Array<{address: string, programId: string}> = Array.isArray(parsedAccounts)
        ? parsedAccounts.map((item: any) => 
            typeof item === 'string' 
              ? { address: item, programId: TOKEN_2022_PROGRAM_ID.toBase58() }  // Legacy format
              : item  // New format
          )
        : [];
      
      if (tokenAccounts.length === 0) {
        throw new Error("Empty token accounts list");
      }

      console.log(`      💾 Closing ${tokenAccounts.length} token account(s)...`);

      // Build transaction with CloseAccount instructions
      const transaction = new Transaction();
      const userWallet = new PublicKey(job.walletAddress);

      // Add CloseAccount instruction for each token account
      // Rent goes to relayer first, then we'll send 85% to user
      for (const account of tokenAccounts) {
        const accountPubkey = new PublicKey(account.address);
        const programId = new PublicKey(account.programId);
        
        // Close instruction: transfers rent to RELAYER wallet, signed by close authority (relayer)
        const closeIx = createCloseAccountInstruction(
          accountPubkey,           // Token account to close
          this.relayerKeypair.publicKey, // Destination for rent (relayer collects first)
          this.relayerKeypair.publicKey, // Close authority (relayer)
          [],                      // No multisig
          programId                // Use correct program (SPL Token or Token-2022)
        );
        
        transaction.add(closeIx);
      }

      // Calculate total rent recovered BEFORE closing
      let totalRecovered = 0;
      for (const account of tokenAccounts) {
        try {
          const accountInfo = await this.connection.getAccountInfo(new PublicKey(account.address));
          if (accountInfo) {
            totalRecovered += accountInfo.lamports;
          }
        } catch (err) {
          console.log(`      ⚠️  Could not get account info for ${account.address}`);
        }
      }

      // Calculate fees (platform keeps 15%, user gets 85%)
      const platformFeeLamports = Math.floor(totalRecovered * PLATFORM_FEE_BPS / 10000);
      const userNetLamports = totalRecovered - platformFeeLamports;

      // Add transfer instruction to send 85% to user
      const transferToUserIx = SystemProgram.transfer({
        fromPubkey: this.relayerKeypair.publicKey,
        toPubkey: userWallet,
        lamports: userNetLamports
      });
      transaction.add(transferToUserIx);

      // Get blockhash and set fee payer
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash("confirmed");
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.relayerKeypair.publicKey;

      // Sign transaction
      transaction.sign(this.relayerKeypair);

      // Send transaction
      console.log(`      📤 Sending transaction...`);
      const signature = await this.connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed"
      });

      // Wait for confirmation
      console.log(`      ⏳ Waiting for confirmation: ${signature}`);
      const confirmation = await this.connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      }, "confirmed");

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      console.log(`      ✅ Transaction confirmed!`);
      console.log(`      🔗 https://solscan.io/tx/${signature}`);

      // Get actual network fee from transaction
      const txDetails = await this.connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0
      });
      const networkFeeLamports = txDetails?.meta?.fee || 5000;

      console.log(`      💰 Recovery: ${(totalRecovered / 1e9).toFixed(6)} SOL`);
      console.log(`      📊 Platform fee (15%): ${(platformFeeLamports / 1e9).toFixed(6)} SOL`);
      console.log(`      💵 User receives: ${(userNetLamports / 1e9).toFixed(6)} SOL`);
      console.log(`      ⛽ Network fee: ${(networkFeeLamports / 1e9).toFixed(6)} SOL`);

      return {
        success: true,
        signature,
        accountsClosed: tokenAccounts.length,
        recoveredLamports: totalRecovered,
        platformFeeLamports,
        userNetLamports,
        networkFeeLamports
      };

    } catch (error: any) {
      console.error(`      ❌ Execution failed:`, error.message);
      return {
        success: false,
        error: error.message,
        accountsClosed: 0,
        recoveredLamports: 0,
        platformFeeLamports: 0,
        userNetLamports: 0,
        networkFeeLamports: 0
      };
    }
  }

  async manualExecute(jobId: string): Promise<ExecutionResult> {
    console.log(`\n⚙️  Manual execution requested for job ${jobId}`);
    
    const job = await storage.getRelayerJobById(jobId);
    if (!job) {
      return {
        success: false,
        error: "Job not found",
        accountsClosed: 0,
        recoveredLamports: 0,
        platformFeeLamports: 0,
        userNetLamports: 0,
        networkFeeLamports: 0
      };
    }

    return await this.executeJob(job);
  }
}

export const autoClaimExecutor = new AutoClaimExecutor();
