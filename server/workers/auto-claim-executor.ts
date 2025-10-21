import { Connection, PublicKey, Transaction, Keypair, SystemProgram } from "@solana/web3.js";
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
  private executionInterval: NodeJS.Timeout | null = null;
  private relayerKeypair: Keypair | null = null;

  constructor() {
    this.connection = new Connection(HELIUS_RPC, "confirmed");
  }

  async start(intervalMs: number = 30000) {
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
    console.log("🤖 Auto-Claim executor starting...");
    console.log(`📊 Execution interval: ${intervalMs / 1000}s`);

    await this.processJobs();

    this.executionInterval = setInterval(async () => {
      await this.processJobs();
    }, intervalMs);
  }

  stop() {
    if (this.executionInterval) {
      clearInterval(this.executionInterval);
      this.executionInterval = null;
    }
    this.isRunning = false;
    console.log("🛑 Auto-Claim executor stopped");
  }

  private async processJobs() {
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

        await new Promise(resolve => setTimeout(resolve, 500));
      }

    } catch (error) {
      console.error("❌ Executor error:", error);
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
      console.log("      ⚠️  PROGRAM NOT DEPLOYED YET");
      console.log("      📝 Will execute using Anchor program once deployed");
      console.log("      🔗 Program will handle: close accounts + fee split");

      return {
        success: false,
        error: "Anchor program not deployed yet",
        accountsClosed: 0,
        recoveredLamports: 0,
        platformFeeLamports: 0,
        userNetLamports: 0,
        networkFeeLamports: 0
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
