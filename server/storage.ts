import { 
  type User, 
  type InsertUser, 
  type TransactionRecord, 
  type InsertTransactionRecord,
  type EmptyTokenAccount,
  type InsertEmptyTokenAccount,
  type ScanResult,
  type InsertScanResult
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Transaction Records
  createTransactionRecord(record: InsertTransactionRecord): Promise<TransactionRecord>;
  getTransactionRecords(limit?: number): Promise<TransactionRecord[]>;
  getTransactionRecordBySignature(signature: string): Promise<TransactionRecord | undefined>;
  
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
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private transactionRecords: Map<string, TransactionRecord>;
  private emptyTokenAccounts: Map<string, EmptyTokenAccount>;
  private scanResults: Map<string, ScanResult>;

  constructor() {
    this.users = new Map();
    this.transactionRecords = new Map();
    this.emptyTokenAccounts = new Map();
    this.scanResults = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createTransactionRecord(record: InsertTransactionRecord): Promise<TransactionRecord> {
    const id = randomUUID();
    const transactionRecord: TransactionRecord = {
      ...record,
      id,
      processedAt: new Date(),
    };
    this.transactionRecords.set(id, transactionRecord);
    return transactionRecord;
  }

  async getTransactionRecords(limit = 50): Promise<TransactionRecord[]> {
    const records = Array.from(this.transactionRecords.values())
      .sort((a, b) => b.processedAt.getTime() - a.processedAt.getTime())
      .slice(0, limit);
    return records;
  }

  async getTransactionRecordBySignature(signature: string): Promise<TransactionRecord | undefined> {
    return Array.from(this.transactionRecords.values()).find(
      (record) => record.signature === signature
    );
  }

  async createEmptyTokenAccount(account: InsertEmptyTokenAccount): Promise<EmptyTokenAccount> {
    const id = randomUUID();
    const emptyTokenAccount: EmptyTokenAccount = {
      ...account,
      id,
      scannedAt: new Date(),
      claimed: false,
    };
    this.emptyTokenAccounts.set(id, emptyTokenAccount);
    return emptyTokenAccount;
  }

  async getEmptyTokenAccountsByWallet(walletAddress: string): Promise<EmptyTokenAccount[]> {
    return Array.from(this.emptyTokenAccounts.values()).filter(
      (account) => account.walletAddress === walletAddress && !account.claimed
    );
  }

  async markAccountsAsClaimed(accountAddresses: string[]): Promise<void> {
    for (const account of this.emptyTokenAccounts.values()) {
      if (accountAddresses.includes(account.accountAddress)) {
        account.claimed = true;
      }
    }
  }

  async createScanResult(result: InsertScanResult): Promise<ScanResult> {
    const id = randomUUID();
    const scanResult: ScanResult = {
      ...result,
      id,
      scannedAt: new Date(),
    };
    this.scanResults.set(id, scanResult);
    return scanResult;
  }

  async getLatestScanResult(walletAddress: string): Promise<ScanResult | undefined> {
    const results = Array.from(this.scanResults.values())
      .filter((result) => result.walletAddress === walletAddress)
      .sort((a, b) => b.scannedAt.getTime() - a.scannedAt.getTime());
    return results[0];
  }

  async getTotalSolRecovered(): Promise<number> {
    const total = Array.from(this.transactionRecords.values())
      .reduce((sum, record) => sum + parseFloat(record.solRecovered), 0);
    return Math.round(total * 1000000) / 1000000; // Round to 6 decimal places
  }

  async getTotalAccountsClaimed(): Promise<number> {
    return Array.from(this.transactionRecords.values())
      .reduce((sum, record) => sum + record.accountsClosed, 0);
  }
}

export const storage = new MemStorage();
