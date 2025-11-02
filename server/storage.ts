import { 
  type User, 
  type InsertUser, 
  type TransactionRecord, 
  type InsertTransactionRecord,
  type EmptyTokenAccount,
  type InsertEmptyTokenAccount,
  type ScanResult,
  type InsertScanResult,
  type TransactionLedger,
  type InsertTransactionLedger,
  type TokenBurnRecord,
  type InsertTokenBurnRecord,
  type NftBurnRecord,
  type InsertNftBurnRecord,
  type ReferralCode,
  type InsertReferralCode,
  type ReferralTransaction,
  type InsertReferralTransaction,
  type WalletReferralAssociation,
  type InsertWalletReferralAssociation,
  type AutoClaimPermit,
  type InsertAutoClaimPermit,
  type RelayerJob,
  type InsertRelayerJob,
  type RelayerCost,
  type InsertRelayerCost,
  type MassTransferRecord,
  type InsertMassTransferRecord,
  type Developer,
  type InsertDeveloper,
  type FeeAccount,
  type InsertFeeAccount,
  type FeeBalance,
  type InsertFeeBalance,
  type FeeTransaction,
  type InsertFeeTransaction,
  type FeeClaim,
  type InsertFeeClaim,
  type ProjectAccount,
  type InsertProjectAccount,
  type AccountCreationIntent,
  type InsertAccountCreationIntent,
  type ReferralAccount,
  type InsertReferralAccount,
  type ReferralTokenAccount,
  type InsertReferralTokenAccount,
  type ReferralFeeTransaction,
  type InsertReferralFeeTransaction,
  type ReferralClaim,
  type InsertReferralClaim,
  users,
  transactionRecords,
  emptyTokenAccounts,
  scanResults,
  transactionLedger,
  tokenBurnRecords,
  nftBurnRecords,
  referralCodes,
  referralTransactions,
  walletReferralAssociations,
  autoClaimPermits,
  relayerJobs,
  relayerCosts,
  massTransferRecords,
  developers,
  feeAccounts,
  feeBalances,
  feeTransactions,
  feeClaims,
  projectAccount,
  accountCreationIntents,
  referralAccounts,
  referralTokenAccounts,
  referralFeeTransactions,
  referralClaims
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql, or, and } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Transaction Records (legacy)
  createTransactionRecord(record: InsertTransactionRecord): Promise<TransactionRecord>;
  getTransactionRecords(limit?: number): Promise<TransactionRecord[]>;
  getTransactionRecordBySignature(signature: string): Promise<TransactionRecord | undefined>;
  
  // Comprehensive Transaction Ledger
  createTransactionLedgerEntry(entry: InsertTransactionLedger): Promise<TransactionLedger>;
  getTransactionLedger(limit?: number, offset?: number, source?: string): Promise<TransactionLedger[]>;
  getTransactionLedgerBySignature(signature: string): Promise<TransactionLedger | undefined>;
  getTransactionLedgerByWallet(walletAddress: string, limit?: number, offset?: number, source?: string): Promise<TransactionLedger[]>;
  
  // Token Burn Records
  createTokenBurnRecord(record: InsertTokenBurnRecord): Promise<TokenBurnRecord>;
  getTokenBurnRecords(limit?: number): Promise<TokenBurnRecord[]>;
  getTokenBurnRecordsByWallet(walletAddress: string, limit?: number): Promise<TokenBurnRecord[]>;
  
  // NFT Burn Records
  createNftBurnRecord(record: InsertNftBurnRecord): Promise<NftBurnRecord>;
  getNftBurnRecords(limit?: number): Promise<NftBurnRecord[]>;
  getNftBurnRecordsByWallet(walletAddress: string, limit?: number): Promise<NftBurnRecord[]>;
  
  
  // Empty Token Accounts
  createEmptyTokenAccount(account: InsertEmptyTokenAccount): Promise<EmptyTokenAccount>;
  getEmptyTokenAccountsByWallet(walletAddress: string): Promise<EmptyTokenAccount[]>;
  markAccountsAsClaimed(accountAddresses: string[]): Promise<void>;
  
  // Scan Results
  createScanResult(result: InsertScanResult): Promise<ScanResult>;
  getLatestScanResult(walletAddress: string): Promise<ScanResult | undefined>;
  
  // Statistics
  getTotalSolRecovered(): Promise<number>;
  getTotalAccountsClaimed(): Promise<number>;
  getTotalTokensBurned(): Promise<number>;
  getTotalNftsBurned(): Promise<number>;
  getStatisticsOverview(sinceTimestamp: Date | null): Promise<{ totalUsers: number; totalSolRecovered: string }>;
  getLeaderboard(sinceTimestamp: Date | null, limit: number): Promise<Array<{ walletAddress: string; totalSolRecovered: string }>>;
  
  // Referral System
  createReferralCode(referral: InsertReferralCode): Promise<ReferralCode>;
  getReferralCodeByCode(code: string): Promise<ReferralCode | undefined>;
  getReferralCodeByWallet(walletAddress: string): Promise<ReferralCode | undefined>;
  getAllReferralCodes(limit?: number): Promise<ReferralCode[]>;
  updateReferralEarnings(codeId: string, earnings: string, totalReferrals: number): Promise<void>;
  createReferralTransaction(transaction: InsertReferralTransaction): Promise<ReferralTransaction>;
  getReferralTransactionsByCode(codeId: string, limit?: number): Promise<ReferralTransaction[]>;
  getReferralStats(codeId: string): Promise<{ totalEarnings: string; totalReferrals: number }>;
  
  // Wallet Referral Associations (permanent - first referral wins forever)
  createWalletReferralAssociation(association: InsertWalletReferralAssociation): Promise<WalletReferralAssociation>;
  getWalletReferralAssociation(walletAddress: string): Promise<WalletReferralAssociation | undefined>;
  hasWalletReferralAssociation(walletAddress: string): Promise<boolean>;
  
  // Auto-Claim Permits
  createAutoClaimPermit(permit: InsertAutoClaimPermit): Promise<AutoClaimPermit>;
  getAutoClaimPermitByWallet(walletAddress: string): Promise<AutoClaimPermit | undefined>;
  updateAutoClaimPermitPda(walletAddress: string, permitPda: string): Promise<void>;
  updateAutoClaimPermitStatus(walletAddress: string, status: string): Promise<void>;
  updateAutoClaimPermitLastUsed(walletAddress: string): Promise<void>;
  getActiveAutoClaimPermits(limit?: number): Promise<AutoClaimPermit[]>;
  
  // Relayer Jobs
  createRelayerJob(job: InsertRelayerJob): Promise<RelayerJob>;
  getRelayerJobById(id: string): Promise<RelayerJob | undefined>;
  getRelayerJobsByWallet(walletAddress: string, limit?: number): Promise<RelayerJob[]>;
  getPendingRelayerJobs(limit?: number): Promise<RelayerJob[]>;
  updateRelayerJobStatus(id: string, status: string, txSignature?: string, errorMessage?: string): Promise<void>;
  completeRelayerJob(id: string, txSignature: string): Promise<void>;
  
  // Relayer Costs
  createRelayerCost(cost: InsertRelayerCost): Promise<RelayerCost>;
  getRelayerCostsByWallet(walletAddress: string, limit?: number): Promise<RelayerCost[]>;
  getTotalRelayerCosts(): Promise<{ totalSpent: number; totalRecovered: number; netProfit: number }>;
  
  // Mass Transfer Records
  createMassTransferRecord(record: InsertMassTransferRecord): Promise<MassTransferRecord>;
  getMassTransferStats(): Promise<{ totalUniqueUsers: number; totalTransfers: number }>;
  
  // Developer Fee System
  createDeveloper(developer: InsertDeveloper): Promise<Developer>;
  getDeveloperByPayoutWallet(payoutWallet: string): Promise<Developer | undefined>;
  getDeveloperById(id: string): Promise<Developer | undefined>;
  updateDeveloperEarnings(id: string, totalEarned: string): Promise<void>;
  updateDeveloperClaimed(id: string, totalClaimed: string): Promise<void>;
  
  createFeeAccount(feeAccount: InsertFeeAccount): Promise<FeeAccount>;
  getFeeAccountByPublicKey(publicKey: string): Promise<FeeAccount | undefined>;
  getFeeAccountByDeveloperId(developerId: string): Promise<FeeAccount | undefined>;
  updateFeeAccountStatus(id: string, status: string): Promise<void>;
  
  createOrUpdateFeeBalance(balance: InsertFeeBalance): Promise<FeeBalance>;
  getFeeBalanceByDeveloperId(developerId: string): Promise<FeeBalance | undefined>;
  incrementFeeBalance(developerId: string, lamports: string): Promise<void>;
  decrementFeeBalance(developerId: string, lamports: string): Promise<void>;
  updateFeeBalanceUsd(developerId: string, usdValue: string): Promise<void>;
  
  createFeeTransaction(transaction: InsertFeeTransaction): Promise<FeeTransaction>;
  getFeeTransactionsByDeveloperId(developerId: string, limit?: number): Promise<FeeTransaction[]>;
  getTotalDeveloperFees(developerId: string): Promise<{ totalGross: string; totalDeveloperShare: string; totalPlatformShare: string }>;
  
  createFeeClaim(claim: InsertFeeClaim): Promise<FeeClaim>;
  getFeeClaimsByDeveloperId(developerId: string, limit?: number): Promise<FeeClaim[]>;
  updateFeeClaimStatus(id: string, status: string, errorMessage?: string): Promise<void>;
  
  // PDA-based Referral System (Jupiter-style)
  getProjectAccount(): Promise<ProjectAccount | undefined>;
  createProjectAccount(project: InsertProjectAccount): Promise<ProjectAccount>;
  
  // Account Creation Intents
  createAccountCreationIntent(intent: InsertAccountCreationIntent): Promise<AccountCreationIntent>;
  getAccountCreationIntent(id: string): Promise<AccountCreationIntent | undefined>;
  getPendingIntentByWallet(developerWallet: string): Promise<AccountCreationIntent | undefined>;
  updateIntentStatus(id: string, status: string): Promise<void>;
  cleanupExpiredIntents(): Promise<void>;
  
  getReferralAccountByWallet(developerWallet: string): Promise<ReferralAccount | undefined>;
  getReferralAccountById(id: string): Promise<ReferralAccount | undefined>;
  createReferralAccount(account: InsertReferralAccount): Promise<ReferralAccount>;
  updateReferralAccountFee(id: string, feePercentage: string): Promise<void>;
  updateReferralAccountRent(id: string, rentSignature: string, rentAmount: string): Promise<void>;
  
  getTokenAccountsByReferralId(referralAccountId: string): Promise<ReferralTokenAccount[]>;
  getTokenAccountByMint(referralAccountId: string, tokenMint: string): Promise<ReferralTokenAccount | undefined>;
  createTokenAccount(tokenAccount: InsertReferralTokenAccount): Promise<ReferralTokenAccount>;
  updateTokenAccountBalance(id: string, unclaimedBalance: string, totalEarned: string): Promise<void>;
  decrementTokenAccountBalance(id: string, amount: string, totalClaimed: string): Promise<void>;
  
  createReferralFeeTransaction(transaction: InsertReferralFeeTransaction): Promise<ReferralFeeTransaction>;
  getReferralFeeTransactionsByAccountId(referralAccountId: string, limit?: number): Promise<ReferralFeeTransaction[]>;
  
  createReferralClaim(claim: InsertReferralClaim): Promise<ReferralClaim>;
  getReferralClaimsByAccountId(referralAccountId: string, limit?: number): Promise<ReferralClaim[]>;
  getFeeAccountsByDeveloperId(developerId: string): Promise<FeeAccount[]>;
  updateDeveloper(id: string, updates: Partial<Developer>): Promise<void>;
  updateFeeBalance(developerId: string, updates: Partial<FeeBalance>): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  // Transaction Records (legacy)
  async createTransactionRecord(record: InsertTransactionRecord): Promise<TransactionRecord> {
    const [transactionRecord] = await db
      .insert(transactionRecords)
      .values(record)
      .returning();
    return transactionRecord;
  }

  async getTransactionRecords(limit: number = 50): Promise<TransactionRecord[]> {
    return await db
      .select()
      .from(transactionRecords)
      .orderBy(desc(transactionRecords.processedAt))
      .limit(limit);
  }

  async getTransactionRecordBySignature(signature: string): Promise<TransactionRecord | undefined> {
    const [record] = await db
      .select()
      .from(transactionRecords)
      .where(eq(transactionRecords.signature, signature));
    return record || undefined;
  }

  // Comprehensive Transaction Ledger
  async createTransactionLedgerEntry(entry: InsertTransactionLedger): Promise<TransactionLedger> {
    const [ledgerEntry] = await db
      .insert(transactionLedger)
      .values(entry)
      .returning();
    return ledgerEntry;
  }

  async getTransactionLedger(limit: number = 100, offset: number = 0, source?: string): Promise<TransactionLedger[]> {
    const conditions = [];
    
    if (source) {
      conditions.push(eq(transactionLedger.source, source));
    }
    
    let query = db
      .select()
      .from(transactionLedger);
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    return await query
      .orderBy(desc(transactionLedger.processedAt))
      .limit(limit)
      .offset(offset);
  }

  async getTransactionLedgerBySignature(signature: string): Promise<TransactionLedger | undefined> {
    const [entry] = await db
      .select()
      .from(transactionLedger)
      .where(eq(transactionLedger.signature, signature));
    return entry || undefined;
  }

  async getTransactionLedgerByWallet(walletAddress: string, limit: number = 50, offset: number = 0, source?: string): Promise<TransactionLedger[]> {
    const conditions = [eq(transactionLedger.walletAddress, walletAddress)];
    
    if (source) {
      conditions.push(eq(transactionLedger.source, source));
    }
    
    return await db
      .select()
      .from(transactionLedger)
      .where(and(...conditions))
      .orderBy(desc(transactionLedger.processedAt))
      .limit(limit)
      .offset(offset);
  }

  async updateTransactionLedgerBySig(signature: string, updateData: Partial<Pick<TransactionLedger, 'solRecovered' | 'netAmount' | 'feeAmount' | 'itemDetails'>>): Promise<TransactionLedger | undefined> {
    const [updatedEntry] = await db
      .update(transactionLedger)
      .set(updateData)
      .where(eq(transactionLedger.signature, signature))
      .returning();
    return updatedEntry || undefined;
  }

  // Token Burn Records
  async createTokenBurnRecord(record: InsertTokenBurnRecord): Promise<TokenBurnRecord> {
    const [burnRecord] = await db
      .insert(tokenBurnRecords)
      .values(record)
      .returning();
    return burnRecord;
  }

  async getTokenBurnRecords(limit: number = 100): Promise<TokenBurnRecord[]> {
    return await db
      .select()
      .from(tokenBurnRecords)
      .orderBy(desc(tokenBurnRecords.burnedAt))
      .limit(limit);
  }

  async getTokenBurnRecordsByWallet(walletAddress: string, limit: number = 50): Promise<TokenBurnRecord[]> {
    return await db
      .select()
      .from(tokenBurnRecords)
      .where(eq(tokenBurnRecords.walletAddress, walletAddress))
      .orderBy(desc(tokenBurnRecords.burnedAt))
      .limit(limit);
  }

  // NFT Burn Records
  async createNftBurnRecord(record: InsertNftBurnRecord): Promise<NftBurnRecord> {
    const [burnRecord] = await db
      .insert(nftBurnRecords)
      .values(record)
      .returning();
    return burnRecord;
  }

  async getNftBurnRecords(limit: number = 100): Promise<NftBurnRecord[]> {
    return await db
      .select()
      .from(nftBurnRecords)
      .orderBy(desc(nftBurnRecords.burnedAt))
      .limit(limit);
  }

  async getNftBurnRecordsByWallet(walletAddress: string, limit: number = 50): Promise<NftBurnRecord[]> {
    return await db
      .select()
      .from(nftBurnRecords)
      .where(eq(nftBurnRecords.walletAddress, walletAddress))
      .orderBy(desc(nftBurnRecords.burnedAt))
      .limit(limit);
  }


  // Empty Token Accounts
  async createEmptyTokenAccount(account: InsertEmptyTokenAccount): Promise<EmptyTokenAccount> {
    const [emptyTokenAccount] = await db
      .insert(emptyTokenAccounts)
      .values(account)
      .onConflictDoUpdate({
        target: emptyTokenAccounts.accountAddress,
        set: {
          walletAddress: account.walletAddress,
          mintAddress: account.mintAddress,
          tokenSymbol: account.tokenSymbol,
          tokenName: account.tokenName,
          rentAmount: account.rentAmount,
          balance: account.balance,
          decimals: account.decimals,
          scannedAt: sql`NOW()`,
          claimed: false
        }
      })
      .returning();
    return emptyTokenAccount;
  }

  async getEmptyTokenAccountsByWallet(walletAddress: string): Promise<EmptyTokenAccount[]> {
    return await db
      .select()
      .from(emptyTokenAccounts)
      .where(and(
        eq(emptyTokenAccounts.walletAddress, walletAddress),
        eq(emptyTokenAccounts.claimed, false)
      ));
  }

  async markAccountsAsClaimed(accountAddresses: string[]): Promise<void> {
    if (accountAddresses.length === 0) return;
    
    await db
      .update(emptyTokenAccounts)
      .set({ claimed: true })
      .where(sql`${emptyTokenAccounts.accountAddress} = ANY(ARRAY[${sql.join(accountAddresses.map(addr => sql`${addr}`), sql`, `)}])`);
  }

  // Scan Results
  async createScanResult(result: InsertScanResult): Promise<ScanResult> {
    const [scanResult] = await db
      .insert(scanResults)
      .values(result)
      .returning();
    return scanResult;
  }

  async getLatestScanResult(walletAddress: string): Promise<ScanResult | undefined> {
    const [result] = await db
      .select()
      .from(scanResults)
      .where(eq(scanResults.walletAddress, walletAddress))
      .orderBy(desc(scanResults.scannedAt))
      .limit(1);
    return result || undefined;
  }

  // Statistics
  async getTotalSolRecovered(): Promise<number> {
    const result = await db
      .select({ total: sql<string>`sum(${transactionLedger.solRecovered})` })
      .from(transactionLedger);
    return parseFloat(result[0]?.total || "0");
  }

  async getTotalAccountsClaimed(): Promise<number> {
    const result = await db
      .select({ total: sql<string>`sum(${transactionLedger.itemsProcessed})` })
      .from(transactionLedger)
      .where(or(
        eq(transactionLedger.transactionType, 'sol_reclaim'),
        eq(transactionLedger.transactionType, 'token_burn'),
        eq(transactionLedger.transactionType, 'nft_burn')
      ));
    return parseInt(result[0]?.total || "0");
  }

  async getTotalTokensBurned(): Promise<number> {
    const result = await db
      .select({ total: sql<string>`count(*)` })
      .from(tokenBurnRecords);
    return parseInt(result[0]?.total || "0");
  }

  async getTotalNftsBurned(): Promise<number> {
    const result = await db
      .select({ total: sql<string>`count(*)` })
      .from(nftBurnRecords);
    return parseInt(result[0]?.total || "0");
  }

  async getStatisticsOverview(sinceTimestamp: Date | null): Promise<{ totalUsers: number; totalSolRecovered: string }> {
    // Count total SOL recovered
    let solQuery = db
      .select({
        totalSolRecovered: sql<string>`coalesce(sum(${transactionLedger.solRecovered}), 0)`
      })
      .from(transactionLedger);
    
    if (sinceTimestamp) {
      solQuery = solQuery.where(sql`${transactionLedger.processedAt} >= ${sinceTimestamp}`) as typeof solQuery;
    }
    
    const solResult = await solQuery;
    
    // Count unique users from BOTH scan_results and transaction_ledger
    let userCountQuery;
    if (sinceTimestamp) {
      userCountQuery = sql<string>`
        SELECT COUNT(DISTINCT wallet_address) as total_users
        FROM (
          SELECT wallet_address FROM ${transactionLedger} WHERE processed_at >= ${sinceTimestamp}
          UNION
          SELECT wallet_address FROM ${scanResults} WHERE scanned_at >= ${sinceTimestamp}
        ) as all_wallets
      `;
    } else {
      userCountQuery = sql<string>`
        SELECT COUNT(DISTINCT wallet_address) as total_users
        FROM (
          SELECT wallet_address FROM ${transactionLedger}
          UNION
          SELECT wallet_address FROM ${scanResults}
        ) as all_wallets
      `;
    }
    
    const userResult = await db.execute(userCountQuery);
    const totalUsers = parseInt((userResult.rows[0] as any)?.total_users || "0");
    
    return {
      totalUsers,
      totalSolRecovered: solResult[0]?.totalSolRecovered || "0"
    };
  }

  async getLeaderboard(sinceTimestamp: Date | null, limit: number): Promise<Array<{ walletAddress: string; totalSolRecovered: string }>> {
    let query = db
      .select({
        walletAddress: transactionLedger.walletAddress,
        totalSolRecovered: sql<string>`sum(${transactionLedger.solRecovered})`
      })
      .from(transactionLedger);
    
    if (sinceTimestamp) {
      query = query.where(sql`${transactionLedger.processedAt} >= ${sinceTimestamp}`) as typeof query;
    }
    
    const result = await query
      .groupBy(transactionLedger.walletAddress)
      .orderBy(sql`sum(${transactionLedger.solRecovered}) desc`)
      .limit(limit);
    
    return result.map(row => ({
      walletAddress: row.walletAddress,
      totalSolRecovered: row.totalSolRecovered || "0"
    }));
  }


  // Referral System
  async createReferralCode(referral: InsertReferralCode): Promise<ReferralCode> {
    const [referralCode] = await db
      .insert(referralCodes)
      .values(referral)
      .returning();
    return referralCode;
  }

  async getReferralCodeByCode(code: string): Promise<ReferralCode | undefined> {
    const [referral] = await db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.code, code));
    return referral || undefined;
  }

  async getReferralCodeByWallet(walletAddress: string): Promise<ReferralCode | undefined> {
    const [referral] = await db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.walletAddress, walletAddress));
    return referral || undefined;
  }

  async getAllReferralCodes(limit: number = 100): Promise<ReferralCode[]> {
    return await db
      .select()
      .from(referralCodes)
      .orderBy(desc(referralCodes.createdAt))
      .limit(limit);
  }

  async updateReferralEarnings(codeId: string, earnings: string, totalReferrals: number): Promise<void> {
    await db
      .update(referralCodes)
      .set({ 
        totalEarnings: earnings,
        totalReferrals: totalReferrals
      })
      .where(eq(referralCodes.id, codeId));
  }

  async createReferralTransaction(transaction: InsertReferralTransaction): Promise<ReferralTransaction> {
    const [referralTransaction] = await db
      .insert(referralTransactions)
      .values(transaction)
      .returning();
    return referralTransaction;
  }

  async getReferralTransactionsByCode(codeId: string, limit: number = 50): Promise<ReferralTransaction[]> {
    return await db
      .select()
      .from(referralTransactions)
      .where(eq(referralTransactions.referralCodeId, codeId))
      .orderBy(desc(referralTransactions.paidAt))
      .limit(limit);
  }

  async getReferralStats(codeId: string): Promise<{ totalEarnings: string; totalReferrals: number }> {
    const [earnings] = await db
      .select({ 
        totalEarnings: sql<string>`sum(${referralTransactions.referralFeeAmount})`,
        totalReferrals: sql<string>`count(distinct ${referralTransactions.referredWalletAddress})` 
      })
      .from(referralTransactions)
      .where(eq(referralTransactions.referralCodeId, codeId));
    
    return {
      totalEarnings: earnings?.totalEarnings || "0",
      totalReferrals: parseInt(earnings?.totalReferrals || "0")
    };
  }

  // Wallet Referral Associations (permanent - first referral wins forever)
  async createWalletReferralAssociation(association: InsertWalletReferralAssociation): Promise<WalletReferralAssociation> {
    try {
      const [walletAssociation] = await db
        .insert(walletReferralAssociations)
        .values(association)
        .returning();
      return walletAssociation;
    } catch (error) {
      // If unique constraint fails, return existing association (first referral wins)
      const existing = await this.getWalletReferralAssociation(association.walletAddress);
      if (existing) {
        return existing;
      }
      throw error;
    }
  }

  async getWalletReferralAssociation(walletAddress: string): Promise<WalletReferralAssociation | undefined> {
    const [association] = await db
      .select()
      .from(walletReferralAssociations)
      .where(eq(walletReferralAssociations.walletAddress, walletAddress));
    return association || undefined;
  }

  async hasWalletReferralAssociation(walletAddress: string): Promise<boolean> {
    const association = await this.getWalletReferralAssociation(walletAddress);
    return !!association;
  }

  // Auto-Claim Permits
  async createAutoClaimPermit(permit: InsertAutoClaimPermit): Promise<AutoClaimPermit> {
    const [autoClaimPermit] = await db
      .insert(autoClaimPermits)
      .values(permit)
      .returning();
    return autoClaimPermit;
  }

  async getAutoClaimPermitByWallet(walletAddress: string): Promise<AutoClaimPermit | undefined> {
    const [permit] = await db
      .select()
      .from(autoClaimPermits)
      .where(eq(autoClaimPermits.walletAddress, walletAddress));
    return permit || undefined;
  }

  async updateAutoClaimPermitPda(walletAddress: string, permitPda: string): Promise<void> {
    await db
      .update(autoClaimPermits)
      .set({ permitPda })
      .where(eq(autoClaimPermits.walletAddress, walletAddress));
  }

  async updateAutoClaimPermitStatus(walletAddress: string, status: string): Promise<void> {
    const updateData: any = { status };
    if (status === 'revoked') {
      updateData.revokedAt = new Date();
    }
    await db
      .update(autoClaimPermits)
      .set(updateData)
      .where(eq(autoClaimPermits.walletAddress, walletAddress));
  }

  async updateAutoClaimPermitLastUsed(walletAddress: string): Promise<void> {
    await db
      .update(autoClaimPermits)
      .set({ lastUsedAt: new Date() })
      .where(eq(autoClaimPermits.walletAddress, walletAddress));
  }

  async reactivateAutoClaimPermit(walletAddress: string, permitData: { permitSignature: string; permitMessage: string; permitNonce: string; scopes: string }): Promise<AutoClaimPermit> {
    const [reactivatedPermit] = await db
      .update(autoClaimPermits)
      .set({
        status: 'active',
        permitSignature: permitData.permitSignature,
        permitMessage: permitData.permitMessage,
        permitNonce: permitData.permitNonce,
        scopes: permitData.scopes,
        revokedAt: null,
        version: sql`${autoClaimPermits.version} + 1`
      })
      .where(eq(autoClaimPermits.walletAddress, walletAddress))
      .returning();
    return reactivatedPermit;
  }

  async getActiveAutoClaimPermits(limit: number = 100): Promise<AutoClaimPermit[]> {
    return await db
      .select()
      .from(autoClaimPermits)
      .where(eq(autoClaimPermits.status, 'active'))
      .orderBy(desc(autoClaimPermits.createdAt))
      .limit(limit);
  }

  // Relayer Jobs
  async createRelayerJob(job: InsertRelayerJob): Promise<RelayerJob> {
    const [relayerJob] = await db
      .insert(relayerJobs)
      .values(job)
      .returning();
    return relayerJob;
  }

  async getRelayerJobById(id: string): Promise<RelayerJob | undefined> {
    const [job] = await db
      .select()
      .from(relayerJobs)
      .where(eq(relayerJobs.id, id));
    return job || undefined;
  }

  async getRelayerJobsByWallet(walletAddress: string, limit: number = 50): Promise<RelayerJob[]> {
    return await db
      .select()
      .from(relayerJobs)
      .where(eq(relayerJobs.walletAddress, walletAddress))
      .orderBy(desc(relayerJobs.createdAt))
      .limit(limit);
  }

  async getPendingRelayerJobs(limit: number = 50): Promise<RelayerJob[]> {
    return await db
      .select()
      .from(relayerJobs)
      .where(eq(relayerJobs.status, 'pending'))
      .orderBy(desc(relayerJobs.createdAt))
      .limit(limit);
  }

  async updateRelayerJobStatus(id: string, status: string, txSignature?: string, errorMessage?: string): Promise<void> {
    const updateData: any = { 
      status, 
      updatedAt: new Date() 
    };
    if (txSignature) updateData.txSignature = txSignature;
    if (errorMessage) updateData.errorMessage = errorMessage;
    if (status === 'completed') updateData.completedAt = new Date();
    
    await db
      .update(relayerJobs)
      .set(updateData)
      .where(eq(relayerJobs.id, id));
  }

  async completeRelayerJob(id: string, txSignature: string): Promise<void> {
    await db
      .update(relayerJobs)
      .set({ 
        status: 'completed',
        txSignature,
        completedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(relayerJobs.id, id));
  }

  // Relayer Costs
  async createRelayerCost(cost: InsertRelayerCost): Promise<RelayerCost> {
    const [relayerCost] = await db
      .insert(relayerCosts)
      .values(cost)
      .returning();
    return relayerCost;
  }

  async getRelayerCostsByWallet(walletAddress: string, limit: number = 50): Promise<RelayerCost[]> {
    return await db
      .select()
      .from(relayerCosts)
      .where(eq(relayerCosts.walletAddress, walletAddress))
      .orderBy(desc(relayerCosts.createdAt))
      .limit(limit);
  }

  async getTotalRelayerCosts(): Promise<{ totalSpent: number; totalRecovered: number; netProfit: number }> {
    const [result] = await db
      .select({
        totalSpent: sql<string>`coalesce(sum(${relayerCosts.lamportsSpent}), 0)`,
        totalRecovered: sql<string>`coalesce(sum(${relayerCosts.recoveredSol}), 0)`,
        totalFees: sql<string>`coalesce(sum(${relayerCosts.platformFee}), 0)`
      })
      .from(relayerCosts);
    
    const totalSpent = parseFloat(result?.totalSpent || "0");
    const totalRecovered = parseFloat(result?.totalRecovered || "0");
    const totalFees = parseFloat(result?.totalFees || "0");
    
    return {
      totalSpent,
      totalRecovered,
      netProfit: totalFees - totalSpent
    };
  }

  // Mass Transfer Records
  async createMassTransferRecord(record: InsertMassTransferRecord): Promise<MassTransferRecord> {
    const [massTransferRecord] = await db
      .insert(massTransferRecords)
      .values(record)
      .returning();
    return massTransferRecord;
  }

  async getMassTransferStats(): Promise<{ totalUniqueUsers: number; totalTransfers: number }> {
    const [result] = await db
      .select({
        totalUniqueUsers: sql<string>`count(distinct ${massTransferRecords.walletAddress})`,
        totalTransfers: sql<string>`count(*)`
      })
      .from(massTransferRecords);
    
    return {
      totalUniqueUsers: parseInt(result?.totalUniqueUsers || "0"),
      totalTransfers: parseInt(result?.totalTransfers || "0")
    };
  }

  // Developer Fee System
  async createDeveloper(insertDeveloper: InsertDeveloper): Promise<Developer> {
    const [developer] = await db
      .insert(developers)
      .values(insertDeveloper)
      .returning();
    return developer;
  }

  async getDeveloperByPayoutWallet(payoutWallet: string): Promise<Developer | undefined> {
    const [developer] = await db
      .select()
      .from(developers)
      .where(eq(developers.payoutWalletAddress, payoutWallet));
    return developer || undefined;
  }

  async getDeveloperById(id: string): Promise<Developer | undefined> {
    const [developer] = await db
      .select()
      .from(developers)
      .where(eq(developers.id, id));
    return developer || undefined;
  }

  async updateDeveloperEarnings(id: string, totalEarned: string): Promise<void> {
    await db
      .update(developers)
      .set({ totalEarned, updatedAt: new Date() })
      .where(eq(developers.id, id));
  }

  async updateDeveloperClaimed(id: string, totalClaimed: string): Promise<void> {
    await db
      .update(developers)
      .set({ totalClaimed, updatedAt: new Date() })
      .where(eq(developers.id, id));
  }

  async createFeeAccount(insertFeeAccount: InsertFeeAccount): Promise<FeeAccount> {
    const [feeAccount] = await db
      .insert(feeAccounts)
      .values(insertFeeAccount)
      .returning();
    return feeAccount;
  }

  async getFeeAccountByPublicKey(publicKey: string): Promise<FeeAccount | undefined> {
    const [feeAccount] = await db
      .select()
      .from(feeAccounts)
      .where(eq(feeAccounts.publicKey, publicKey));
    return feeAccount || undefined;
  }

  async getFeeAccountByDeveloperId(developerId: string): Promise<FeeAccount | undefined> {
    const [feeAccount] = await db
      .select()
      .from(feeAccounts)
      .where(eq(feeAccounts.developerId, developerId));
    return feeAccount || undefined;
  }

  async updateFeeAccountStatus(id: string, status: string): Promise<void> {
    await db
      .update(feeAccounts)
      .set({ status })
      .where(eq(feeAccounts.id, id));
  }

  async createOrUpdateFeeBalance(insertBalance: InsertFeeBalance): Promise<FeeBalance> {
    const existing = await this.getFeeBalanceByDeveloperId(insertBalance.developerId);
    
    if (existing) {
      const [updated] = await db
        .update(feeBalances)
        .set({ ...insertBalance, updatedAt: new Date() })
        .where(eq(feeBalances.developerId, insertBalance.developerId))
        .returning();
      return updated;
    }
    
    const [balance] = await db
      .insert(feeBalances)
      .values(insertBalance)
      .returning();
    return balance;
  }

  async getFeeBalanceByDeveloperId(developerId: string): Promise<FeeBalance | undefined> {
    const [balance] = await db
      .select()
      .from(feeBalances)
      .where(eq(feeBalances.developerId, developerId));
    return balance || undefined;
  }

  async incrementFeeBalance(developerId: string, lamports: string): Promise<void> {
    await db
      .update(feeBalances)
      .set({
        unclaimedLamports: sql`${feeBalances.unclaimedLamports} + ${lamports}`,
        updatedAt: new Date()
      })
      .where(eq(feeBalances.developerId, developerId));
  }

  async decrementFeeBalance(developerId: string, lamports: string): Promise<void> {
    await db
      .update(feeBalances)
      .set({
        unclaimedLamports: sql`${feeBalances.unclaimedLamports} - ${lamports}`,
        updatedAt: new Date()
      })
      .where(eq(feeBalances.developerId, developerId));
  }

  async updateFeeBalanceUsd(developerId: string, usdValue: string): Promise<void> {
    await db
      .update(feeBalances)
      .set({
        unclaimedUsd: usdValue,
        lastUsdUpdate: new Date(),
        updatedAt: new Date()
      })
      .where(eq(feeBalances.developerId, developerId));
  }

  async createFeeTransaction(insertTransaction: InsertFeeTransaction): Promise<FeeTransaction> {
    const [transaction] = await db
      .insert(feeTransactions)
      .values(insertTransaction)
      .returning();
    return transaction;
  }

  async getFeeTransactionsByDeveloperId(developerId: string, limit: number = 50): Promise<FeeTransaction[]> {
    return await db
      .select()
      .from(feeTransactions)
      .where(eq(feeTransactions.developerId, developerId))
      .orderBy(desc(feeTransactions.createdAt))
      .limit(limit);
  }

  async getTotalDeveloperFees(developerId: string): Promise<{ totalGross: string; totalDeveloperShare: string; totalPlatformShare: string }> {
    const [result] = await db
      .select({
        totalGross: sql<string>`coalesce(sum(${feeTransactions.grossFee}), 0)`,
        totalDeveloperShare: sql<string>`coalesce(sum(${feeTransactions.developerShare}), 0)`,
        totalPlatformShare: sql<string>`coalesce(sum(${feeTransactions.platformShare}), 0)`
      })
      .from(feeTransactions)
      .where(eq(feeTransactions.developerId, developerId));
    
    return {
      totalGross: result?.totalGross || "0",
      totalDeveloperShare: result?.totalDeveloperShare || "0",
      totalPlatformShare: result?.totalPlatformShare || "0"
    };
  }

  async createFeeClaim(insertClaim: InsertFeeClaim): Promise<FeeClaim> {
    const [claim] = await db
      .insert(feeClaims)
      .values(insertClaim)
      .returning();
    return claim;
  }

  async getFeeClaimsByDeveloperId(developerId: string, limit: number = 50): Promise<FeeClaim[]> {
    return await db
      .select()
      .from(feeClaims)
      .where(eq(feeClaims.developerId, developerId))
      .orderBy(desc(feeClaims.claimedAt))
      .limit(limit);
  }

  async updateFeeClaimStatus(id: string, status: string, errorMessage?: string): Promise<void> {
    const updateData: any = { status };
    if (errorMessage) updateData.errorMessage = errorMessage;
    
    await db
      .update(feeClaims)
      .set(updateData)
      .where(eq(feeClaims.id, id));
  }

  async getFeeAccountsByDeveloperId(developerId: string): Promise<FeeAccount[]> {
    return await db
      .select()
      .from(feeAccounts)
      .where(eq(feeAccounts.developerId, developerId));
  }

  async updateDeveloper(id: string, updates: Partial<Developer>): Promise<void> {
    await db
      .update(developers)
      .set(updates)
      .where(eq(developers.id, id));
  }

  async updateFeeBalance(developerId: string, updates: Partial<FeeBalance>): Promise<void> {
    await db
      .update(feeBalances)
      .set(updates)
      .where(eq(feeBalances.developerId, developerId));
  }

  // PDA-based Referral System (Jupiter-style) Implementation
  async getProjectAccount(): Promise<ProjectAccount | undefined> {
    const [project] = await db.select().from(projectAccount).limit(1);
    return project || undefined;
  }

  async createProjectAccount(project: InsertProjectAccount): Promise<ProjectAccount> {
    const [created] = await db
      .insert(projectAccount)
      .values(project)
      .returning();
    return created;
  }

  // Account Creation Intents Implementation
  async createAccountCreationIntent(intent: InsertAccountCreationIntent): Promise<AccountCreationIntent> {
    const [created] = await db
      .insert(accountCreationIntents)
      .values(intent)
      .returning();
    return created;
  }

  async getAccountCreationIntent(id: string): Promise<AccountCreationIntent | undefined> {
    const [intent] = await db
      .select()
      .from(accountCreationIntents)
      .where(eq(accountCreationIntents.id, id));
    return intent || undefined;
  }

  async getPendingIntentByWallet(developerWallet: string): Promise<AccountCreationIntent | undefined> {
    const [intent] = await db
      .select()
      .from(accountCreationIntents)
      .where(
        and(
          eq(accountCreationIntents.developerWallet, developerWallet),
          eq(accountCreationIntents.status, 'pending')
        )
      )
      .orderBy(desc(accountCreationIntents.createdAt))
      .limit(1);
    return intent || undefined;
  }

  async updateIntentStatus(id: string, status: string): Promise<void> {
    await db
      .update(accountCreationIntents)
      .set({ status })
      .where(eq(accountCreationIntents.id, id));
  }

  async cleanupExpiredIntents(): Promise<void> {
    await db
      .update(accountCreationIntents)
      .set({ status: 'expired' })
      .where(
        and(
          eq(accountCreationIntents.status, 'pending'),
          sql`${accountCreationIntents.expiresAt} < NOW()`
        )
      );
  }

  async getReferralAccountByWallet(developerWallet: string): Promise<ReferralAccount | undefined> {
    const [account] = await db
      .select()
      .from(referralAccounts)
      .where(eq(referralAccounts.developerWallet, developerWallet));
    return account || undefined;
  }

  async getReferralAccountById(id: string): Promise<ReferralAccount | undefined> {
    const [account] = await db
      .select()
      .from(referralAccounts)
      .where(eq(referralAccounts.id, id));
    return account || undefined;
  }

  async createReferralAccount(account: InsertReferralAccount): Promise<ReferralAccount> {
    const [created] = await db
      .insert(referralAccounts)
      .values(account)
      .returning();
    return created;
  }

  async updateReferralAccountFee(id: string, feePercentage: string): Promise<void> {
    await db
      .update(referralAccounts)
      .set({ feePercentage, updatedAt: new Date() })
      .where(eq(referralAccounts.id, id));
  }

  async updateReferralAccountRent(id: string, rentSignature: string, rentAmount: string): Promise<void> {
    await db
      .update(referralAccounts)
      .set({ 
        rentPaid: true,
        rentSignature, 
        rentAmount, 
        rentPaidAt: new Date(),
        updatedAt: new Date() 
      })
      .where(eq(referralAccounts.id, id));
  }

  async getTokenAccountsByReferralId(referralAccountId: string): Promise<ReferralTokenAccount[]> {
    return await db
      .select()
      .from(referralTokenAccounts)
      .where(eq(referralTokenAccounts.referralAccountId, referralAccountId));
  }

  async getTokenAccountByMint(referralAccountId: string, tokenMint: string): Promise<ReferralTokenAccount | undefined> {
    const [account] = await db
      .select()
      .from(referralTokenAccounts)
      .where(
        and(
          eq(referralTokenAccounts.referralAccountId, referralAccountId),
          eq(referralTokenAccounts.tokenMint, tokenMint)
        )
      );
    return account || undefined;
  }

  async createTokenAccount(tokenAccount: InsertReferralTokenAccount): Promise<ReferralTokenAccount> {
    const [created] = await db
      .insert(referralTokenAccounts)
      .values(tokenAccount)
      .returning();
    return created;
  }

  async updateTokenAccountBalance(id: string, unclaimedBalance: string, totalEarned: string): Promise<void> {
    await db
      .update(referralTokenAccounts)
      .set({ unclaimedBalance, totalEarned, updatedAt: new Date() })
      .where(eq(referralTokenAccounts.id, id));
  }

  async decrementTokenAccountBalance(id: string, amount: string, totalClaimed: string): Promise<void> {
    const account = await db
      .select()
      .from(referralTokenAccounts)
      .where(eq(referralTokenAccounts.id, id))
      .limit(1);

    if (account.length === 0) return;

    const current = parseFloat(account[0].unclaimedBalance);
    const decrease = parseFloat(amount);
    const newBalance = Math.max(0, current - decrease).toString();

    await db
      .update(referralTokenAccounts)
      .set({ 
        unclaimedBalance: newBalance,
        totalClaimed,
        updatedAt: new Date()
      })
      .where(eq(referralTokenAccounts.id, id));
  }

  async createReferralFeeTransaction(transaction: InsertReferralFeeTransaction): Promise<ReferralFeeTransaction> {
    const [created] = await db
      .insert(referralFeeTransactions)
      .values(transaction)
      .returning();
    return created;
  }

  async getReferralFeeTransactionsByAccountId(referralAccountId: string, limit: number = 50): Promise<ReferralFeeTransaction[]> {
    return await db
      .select()
      .from(referralFeeTransactions)
      .where(eq(referralFeeTransactions.referralAccountId, referralAccountId))
      .orderBy(desc(referralFeeTransactions.createdAt))
      .limit(limit);
  }

  async createReferralClaim(claim: InsertReferralClaim): Promise<ReferralClaim> {
    const [created] = await db
      .insert(referralClaims)
      .values(claim)
      .returning();
    return created;
  }

  async getReferralClaimsByAccountId(referralAccountId: string, limit: number = 50): Promise<ReferralClaim[]> {
    return await db
      .select()
      .from(referralClaims)
      .where(eq(referralClaims.referralAccountId, referralAccountId))
      .orderBy(desc(referralClaims.claimedAt))
      .limit(limit);
  }
}

export const storage = new DatabaseStorage();
