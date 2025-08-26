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
  users,
  transactionRecords,
  emptyTokenAccounts,
  scanResults,
  transactionLedger,
  tokenBurnRecords,
  nftBurnRecords,
  referralCodes,
  referralTransactions,
  walletReferralAssociations
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql, or } from "drizzle-orm";
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
  getTransactionLedger(limit?: number, offset?: number): Promise<TransactionLedger[]>;
  getTransactionLedgerBySignature(signature: string): Promise<TransactionLedger | undefined>;
  getTransactionLedgerByWallet(walletAddress: string, limit?: number, offset?: number): Promise<TransactionLedger[]>;
  
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

  async getTransactionLedger(limit: number = 100, offset: number = 0): Promise<TransactionLedger[]> {
    return await db
      .select()
      .from(transactionLedger)
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

  async getTransactionLedgerByWallet(walletAddress: string, limit: number = 50, offset: number = 0): Promise<TransactionLedger[]> {
    return await db
      .select()
      .from(transactionLedger)
      .where(eq(transactionLedger.walletAddress, walletAddress))
      .orderBy(desc(transactionLedger.processedAt))
      .limit(limit)
      .offset(offset);
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
          decimals: account.decimals
        }
      })
      .returning();
    return emptyTokenAccount;
  }

  async getEmptyTokenAccountsByWallet(walletAddress: string): Promise<EmptyTokenAccount[]> {
    return await db
      .select()
      .from(emptyTokenAccounts)
      .where(eq(emptyTokenAccounts.walletAddress, walletAddress));
  }

  async markAccountsAsClaimed(accountAddresses: string[]): Promise<void> {
    await db
      .update(emptyTokenAccounts)
      .set({ claimed: true })
      .where(sql`${emptyTokenAccounts.accountAddress} = ANY(${accountAddresses})`);
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
        eq(transactionLedger.transactionType, 'token_burn')
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
        totalReferrals: sql<string>`count(*)` 
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
}

export const storage = new DatabaseStorage();
