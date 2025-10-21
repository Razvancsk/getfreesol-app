import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { storage } from "../storage";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getAccount as getTokenAccount } from "@solana/spl-token";
import bs58 from "bs58";
import { autoClaimExecutor } from "./auto-claim-executor";

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
  }[];
  totalRentRecoverable: number;
}

export class AutoClaimScanner {
  private connection: Connection;
  private isRunning: boolean = false;
  private scanInterval: NodeJS.Timeout | null = null;
  private relayerPublicKey: string | null = null;
  private recentlyDelegatedWallets: Map<string, number> = new Map(); // wallet -> timestamp
  private DELEGATION_COOLDOWN = 90000; // 90 seconds (6 scan cycles) to wait for blockchain confirmation

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
  
  // Mark wallet as recently delegated (to skip scanning for cooldown period)
  markWalletDelegated(walletAddress: string) {
    this.recentlyDelegatedWallets.set(walletAddress, Date.now());
    console.log(`      ⏸️  Pausing scanner for ${walletAddress.slice(0, 8)}... (waiting for blockchain confirmation)`);
  }
  
  // Check if wallet should be skipped (recently delegated)
  private shouldSkipWallet(walletAddress: string): boolean {
    const delegatedTime = this.recentlyDelegatedWallets.get(walletAddress);
    if (!delegatedTime) return false;
    
    const elapsed = Date.now() - delegatedTime;
    if (elapsed > this.DELEGATION_COOLDOWN) {
      // Cooldown expired, remove from map
      this.recentlyDelegatedWallets.delete(walletAddress);
      console.log(`      ▶️  Resuming scanner for ${walletAddress.slice(0, 8)}... (cooldown expired)`);
      return false;
    }
    
    const remaining = Math.ceil((this.DELEGATION_COOLDOWN - elapsed) / 1000);
    console.log(`      ⏸️  Skipping ${walletAddress.slice(0, 8)}... (waiting ${remaining}s for blockchain confirmation)`);
    return true;
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
        // Skip wallets that were recently delegated (waiting for blockchain confirmation)
        if (this.shouldSkipWallet(permit.walletAddress)) {
          continue;
        }
        
        await this.scanWalletForEmptyAccounts(permit.walletAddress);
        // Add 2 second delay between scanning different wallets to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));
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
      const nonDelegatedAccounts = [];
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

        // Add 1 second delay between scanning different token programs to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));

        totalAccounts += tokenAccounts.value.length;

        for (const { pubkey, account } of tokenAccounts.value) {
          const parsedInfo = account.data.parsed.info;
          const balance = parsedInfo.tokenAmount?.uiAmount || 0;

          if (balance === 0) {
            // Normalize close authority (can be string or object with pubkey property)
            const closeAuthority = parsedInfo.closeAuthority;
            const closeAuthorityPubkey = closeAuthority?.pubkey ?? closeAuthority;
            const rentLamports = account.lamports;
            
            // Check if delegated to relayer
            if (this.relayerPublicKey && closeAuthorityPubkey === this.relayerPublicKey) {
              // Already delegated - ready to claim!
              emptyAccounts.push({
                address: pubkey.toBase58(),
                mint: parsedInfo.mint,
                rentLamports,
                isToken2022: program.id.equals(TOKEN_2022_PROGRAM_ID),
                programId: program.id.toBase58()
              });

              totalRentRecoverable += rentLamports;
            } else if (!closeAuthorityPubkey || closeAuthorityPubkey === walletAddress) {
              // NOT delegated yet - needs delegation!
              nonDelegatedAccounts.push({
                address: pubkey.toBase58(),
                mint: parsedInfo.mint,
                rentLamports,
                isToken2022: program.id.equals(TOKEN_2022_PROGRAM_ID),
                programId: program.id.toBase58()
              });
              skippedNotDelegated++;
            }
          }
        }
      }

      console.log(`      Found ${totalAccounts} token account(s) (SPL + Token-2022)`)

      if (skippedNotDelegated > 0) {
        console.log(`      ⏭️  Found ${skippedNotDelegated} account(s) without delegated close authority`);
      }

      // Auto-trigger delegation for non-delegated empty accounts
      if (nonDelegatedAccounts.length > 0) {
        console.log(`      🔑 AUTO-DELEGATING ${nonDelegatedAccounts.length} new empty account(s)...`);
        await this.createDelegationRequest(walletAddress, nonDelegatedAccounts);
      }

      if (emptyAccounts.length > 0) {
        console.log(`      🎯 Found ${emptyAccounts.length} delegated empty account(s)`);
        console.log(`      💰 Total recoverable: ${(totalRentRecoverable / 1e9).toFixed(6)} SOL`);

        await this.createRelayerJobs(walletAddress, emptyAccounts, totalRentRecoverable);
      } else if (nonDelegatedAccounts.length === 0) {
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
            programId: acc.isToken2022 ? TOKEN_2022_PROGRAM_ID.toBase58() : TOKEN_PROGRAM_ID.toBase58()
          })))
        });

        console.log(`      ✅ Created job for ${batch.length} account(s)`);
      }

      // Trigger executor immediately after creating jobs
      if (batches.length > 0) {
        console.log(`      ⚡ Triggering executor to process jobs NOW...`);
        setTimeout(() => autoClaimExecutor.executeNow(), 1000); // Small delay to ensure DB commit
      }

    } catch (error) {
      console.error(`      ❌ Error creating relayer jobs:`, error);
    }
  }

  private async createDelegationRequest(
    walletAddress: string,
    nonDelegatedAccounts: Array<{address: string; mint: string; rentLamports: number; isToken2022: boolean; programId: string}>
  ) {
    try {
      // Store count of non-delegated accounts in permit for frontend notification
      const totalSol = nonDelegatedAccounts.reduce((sum, acc) => sum + acc.rentLamports, 0) / 1e9;
      
      console.log(`      💰 Pending delegation: ${nonDelegatedAccounts.length} accounts (${totalSol.toFixed(6)} SOL)`);
      console.log(`      📢 Frontend will show notification to delegate these accounts`);
      
      // Update permit with pending delegation info (frontend polls this)
      await storage.updateAutoClaimPermitMetadata(walletAddress, {
        pendingDelegationCount: nonDelegatedAccounts.length,
        pendingDelegationSol: totalSol.toFixed(6)
      });

    } catch (error) {
      console.error(`      ❌ Error creating delegation request:`, error);
    }
  }

  async manualScan(walletAddress: string): Promise<EmptyAccountScanResult | null> {
    console.log(`\n🔍 Manual scan requested for: ${walletAddress}`);
    return await this.scanWalletForEmptyAccounts(walletAddress);
  }
}

export const autoClaimScanner = new AutoClaimScanner();
