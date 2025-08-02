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
  users,
  transactionRecords,
  emptyTokenAccounts,
  scanResults,
  transactionLedger,
  tokenBurnRecords,
  nftBurnRecords
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
  getTransactionLedger(limit?: number): Promise<TransactionLedger[]>;
  getTransactionLedgerBySignature(signature: string): Promise<TransactionLedger | undefined>;
  getTransactionLedgerByWallet(walletAddress: string, limit?: number): Promise<TransactionLedger[]>;
  
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

  async getTransactionLedger(limit: number = 100): Promise<TransactionLedger[]> {
    return await db
      .select()
      .from(transactionLedger)
      .orderBy(desc(transactionLedger.processedAt))
      .limit(limit);
  }

  async getTransactionLedgerBySignature(signature: string): Promise<TransactionLedger | undefined> {
    const [entry] = await db
      .select()
      .from(transactionLedger)
      .where(eq(transactionLedger.signature, signature));
    return entry || undefined;
  }

  async getTransactionLedgerByWallet(walletAddress: string, limit: number = 50): Promise<TransactionLedger[]> {
    return await db
      .select()
      .from(transactionLedger)
      .where(eq(transactionLedger.walletAddress, walletAddress))
      .orderBy(desc(transactionLedger.processedAt))
      .limit(limit);
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
}

export const storage = new DatabaseStorage();
