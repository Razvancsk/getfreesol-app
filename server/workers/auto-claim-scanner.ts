import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { storage } from "../storage";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getAccount as getTokenAccount } from "@solana/spl-token";
import bs58 from "bs58";

const HELIUS_RPC = process.env.VITE_HELIUS_API_KEY 
  ? `https://mainnet.helius-rpc.com/?api-key=${process.env.VITE_HELIUS_API_KEY}`
  : "https://api.mainnet-beta.solana.com";

interface EmptyAccountScanResult {
  walletAddress: string;
  emptyAccounts: {
    address: string;
    mint: string;
    rentLamports: number;
    isToken2022: boolean;
    programId: string;
  }[];
  totalRentRecoverable: number;
}

export class AutoClaimScanner {
  private connection: Connection;
  private isRunning: boolean = false;
  private scanInterval: NodeJS.Timeout | null = null;
  private relayerPublicKey: string | null = null;

  constructor() {
    this.connection = new Connection(HELIUS_RPC, "confirmed");
    
    // Get relayer public key from private key
    const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY;
    if (relayerPrivateKey) {
      try {
        const secretKey = bs58.decode(relayerPrivateKey);
        const relayerKeypair = Keypair.fromSecretKey(secretKey);
        this.relayerPublicKey = relayerKeypair.publicKey.toBase58();
      } catch (error) {
        console.error("❌ Failed to derive relayer public key");
      }
    }
  }

  async start(intervalMs: number = 60000) {
    if (this.isRunning) {
      console.log("⚠️  Auto-Claim scanner already running");
      return;
    }

    this.isRunning = true;
    console.log("🤖 Auto-Claim scanner starting...");
    console.log(`📊 Scan interval: ${intervalMs / 1000}s`);

    await this.scanAllActivePermits();

    this.scanInterval = setInterval(async () => {
      await this.scanAllActivePermits();
    }, intervalMs);
  }

  stop() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    this.isRunning = false;
    console.log("🛑 Auto-Claim scanner stopped");
  }

  private async scanAllActivePermits() {
    try {
      console.log("\n🔍 Scanning for active permits...");
      
      const activePermits = await storage.getActiveAutoClaimPermits();
      
      if (activePermits.length === 0) {
        console.log("   No active permits found");
        return;
      }

      console.log(`   Found ${activePermits.length} active permit(s)`);

      for (const permit of activePermits) {
        await this.scanWalletForEmptyAccounts(permit.walletAddress);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

    } catch (error) {
      console.error("❌ Scanner error:", error);
    }
  }

  private async scanWalletForEmptyAccounts(walletAddress: string): Promise<EmptyAccountScanResult | null> {
    try {
      console.log(`\n   👛 Scanning wallet: ${walletAddress.slice(0, 8)}...`);
      
      const walletPubkey = new PublicKey(walletAddress);
      
      const emptyAccounts = [];
      let totalRentRecoverable = 0;
      let skippedNotDelegated = 0;
      let totalAccounts = 0;

      // Scan BOTH standard SPL tokens AND Token-2022
      const programIds = [
        { id: TOKEN_PROGRAM_ID, name: 'SPL Token' },
        { id: TOKEN_2022_PROGRAM_ID, name: 'Token-2022' }
      ];

      for (const program of programIds) {
        const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
          walletPubkey,
          { programId: program.id }
        );

        totalAccounts += tokenAccounts.value.length;

        for (const { pubkey, account } of tokenAccounts.value) {
          const parsedInfo = account.data.parsed.info;
          const balance = parsedInfo.tokenAmount?.uiAmount || 0;

          if (balance === 0) {
            // Normalize close authority (can be string or object with pubkey property)
            const closeAuthority = parsedInfo.closeAuthority;
            const closeAuthorityPubkey = closeAuthority?.pubkey ?? closeAuthority;
            
            // Only include accounts where close authority has been delegated to relayer
            if (this.relayerPublicKey && closeAuthorityPubkey === this.relayerPublicKey) {
              const rentLamports = account.lamports;
              
              emptyAccounts.push({
                address: pubkey.toBase58(),
                mint: parsedInfo.mint,
                rentLamports,
                isToken2022: program.id.equals(TOKEN_2022_PROGRAM_ID),
                programId: program.id.toBase58()
              });

              totalRentRecoverable += rentLamports;
            } else {
              skippedNotDelegated++;
            }
          }
        }
      }

      console.log(`      Found ${totalAccounts} token account(s) (SPL + Token-2022)`)

      if (skippedNotDelegated > 0) {
        console.log(`      ⏭️  Skipped ${skippedNotDelegated} account(s) without delegated close authority`);
      }

      if (emptyAccounts.length > 0) {
        console.log(`      🎯 Found ${emptyAccounts.length} empty account(s)`);
        console.log(`      💰 Total recoverable: ${(totalRentRecoverable / 1e9).toFixed(6)} SOL`);

        await this.createRelayerJobs(walletAddress, emptyAccounts, totalRentRecoverable);
      } else {
        console.log("      ✅ No empty accounts");
      }

      return {
        walletAddress,
        emptyAccounts,
        totalRentRecoverable
      };

    } catch (error) {
      console.error(`      ❌ Error scanning wallet ${walletAddress}:`, error);
      return null;
    }
  }

  private async createRelayerJobs(
    walletAddress: string,
    emptyAccounts: EmptyAccountScanResult['emptyAccounts'],
    totalRentRecoverable: number
  ) {
    try {
      const BATCH_SIZE = 15;
      const batches = [];
      
      for (let i = 0; i < emptyAccounts.length; i += BATCH_SIZE) {
        batches.push(emptyAccounts.slice(i, i + BATCH_SIZE));
      }

      console.log(`      📦 Creating ${batches.length} relayer job(s)`);

      for (const batch of batches) {
        const batchRent = batch.reduce((sum, acc) => sum + acc.rentLamports, 0);

        const existingJobs = await storage.getPendingRelayerJobs();
        const hasPendingJob = existingJobs.some(job => job.walletAddress === walletAddress);
        
        if (hasPendingJob) {
          console.log(`      ⏭️  Job already pending for wallet`);
          continue;
        }

        await storage.createRelayerJob({
          walletAddress,
          jobType: 'claim_empty_accounts',
          itemsCount: batch.length,
          estimatedNet: (batchRent / 1e9).toString(),
          tokenAccounts: JSON.stringify(batch.map(acc => ({
            address: acc.address,
            programId: acc.programId
          })))
        });

        console.log(`      ✅ Created job for ${batch.length} account(s)`);
      }

    } catch (error) {
      console.error(`      ❌ Error creating relayer jobs:`, error);
    }
  }

  async manualScan(walletAddress: string): Promise<EmptyAccountScanResult | null> {
    console.log(`\n🔍 Manual scan requested for: ${walletAddress}`);
    return await this.scanWalletForEmptyAccounts(walletAddress);
  }
}

export const autoClaimScanner = new AutoClaimScanner();
