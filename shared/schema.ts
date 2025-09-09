import { sql } from "drizzle-orm";
import { pgTable, text, varchar, decimal, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const transactionRecords = pgTable("transaction_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  signature: text("signature").notNull().unique(),
  walletAddress: text("wallet_address").notNull(),
  solRecovered: decimal("sol_recovered", { precision: 18, scale: 9 }).notNull(),
  netAmount: decimal("net_amount", { precision: 18, scale: 9 }).notNull(),
  feeAmount: decimal("fee_amount", { precision: 18, scale: 9 }).notNull(),
  accountsClosed: integer("accounts_closed").notNull(),
  processedAt: timestamp("processed_at").notNull().defaultNow(),
});

export const emptyTokenAccounts = pgTable("empty_token_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountAddress: text("account_address").notNull().unique(),
  mintAddress: text("mint_address").notNull(),
  walletAddress: text("wallet_address").notNull(),
  tokenSymbol: text("token_symbol"),
  tokenName: text("token_name"),
  rentAmount: decimal("rent_amount", { precision: 18, scale: 9 }).notNull(),
  balance: decimal("balance", { precision: 18, scale: 9 }).notNull().default("0"),
  decimals: integer("decimals").notNull(),
  scannedAt: timestamp("scanned_at").notNull().defaultNow(),
  claimed: boolean("claimed").notNull().default(false),
  programId: text("program_id"),
});

export const scanResults = pgTable("scan_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull(),
  totalAccounts: integer("total_accounts").notNull(),
  emptyAccounts: integer("empty_accounts").notNull(),
  totalReclaimable: decimal("total_reclaimable", { precision: 18, scale: 9 }).notNull(),
  scannedAt: timestamp("scanned_at").notNull().defaultNow(),
});

// Comprehensive transaction ledger for all operations
export const transactionLedger = pgTable("transaction_ledger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  signature: text("signature").notNull().unique(),
  walletAddress: text("wallet_address").notNull(),
  transactionType: text("transaction_type").notNull(), // 'sol_reclaim', 'token_burn', 'nft_burn'
  solRecovered: decimal("sol_recovered", { precision: 18, scale: 9 }).notNull(),
  netAmount: decimal("net_amount", { precision: 18, scale: 9 }).notNull(),
  feeAmount: decimal("fee_amount", { precision: 18, scale: 9 }).notNull(),
  itemsProcessed: integer("items_processed").notNull(), // accounts closed, tokens burned, or NFTs burned
  itemDetails: text("item_details"), // JSON string with mint addresses, account addresses, etc.
  processedAt: timestamp("processed_at").notNull().defaultNow(),
});

// Token burning records
export const tokenBurnRecords = pgTable("token_burn_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  signature: text("signature").notNull(),
  walletAddress: text("wallet_address").notNull(),
  tokenMint: text("token_mint").notNull(),
  tokenSymbol: text("token_symbol"),
  tokenName: text("token_name"),
  amountBurned: decimal("amount_burned", { precision: 18, scale: 9 }).notNull(),
  solRecovered: decimal("sol_recovered", { precision: 18, scale: 9 }).notNull(),
  burnedAt: timestamp("burned_at").notNull().defaultNow(),
});

// NFT burning records
export const nftBurnRecords = pgTable("nft_burn_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  signature: text("signature").notNull(),
  walletAddress: text("wallet_address").notNull(),
  nftMint: text("nft_mint").notNull(),
  nftName: text("nft_name"),
  nftImage: text("nft_image"),
  collectionAddress: text("collection_address"),
  solRecovered: decimal("sol_recovered", { precision: 18, scale: 9 }).notNull(),
  burnedAt: timestamp("burned_at").notNull().defaultNow(),
});

// Referral system tables
export const referralCodes = pgTable("referral_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  walletAddress: text("wallet_address").notNull(),
  websiteUrl: text("website_url"),
  totalEarnings: decimal("total_earnings", { precision: 18, scale: 9 }).notNull().default("0"),
  totalReferrals: integer("total_referrals").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const referralTransactions = pgTable("referral_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referralCodeId: varchar("referral_code_id").notNull(),
  transactionSignature: text("transaction_signature").notNull(),
  referredWalletAddress: text("referred_wallet_address").notNull(),
  originalFeeAmount: decimal("original_fee_amount", { precision: 18, scale: 9 }).notNull(),
  referralFeeAmount: decimal("referral_fee_amount", { precision: 18, scale: 9 }).notNull(),
  platformFeeAmount: decimal("platform_fee_amount", { precision: 18, scale: 9 }).notNull(),
  paidAt: timestamp("paid_at").notNull().defaultNow(),
});

// Permanent wallet-to-referrer associations (first referral wins forever)
export const walletReferralAssociations = pgTable("wallet_referral_associations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull().unique(), // One association per wallet
  referralCodeId: varchar("referral_code_id").notNull(), // Which referrer gets credit
  referralCode: text("referral_code").notNull(), // Store the actual code for easy lookup
  associatedAt: timestamp("associated_at").notNull().defaultNow(),
});

// Ads system for DeFi referral links
export const ads = pgTable("ads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(), // Ad title (e.g., "Jupiter - Best DEX")
  description: text("description").notNull(), // Ad description
  imageUrl: text("image_url"), // Optional ad image/logo
  targetUrl: text("target_url").notNull(), // Referral link URL
  appName: text("app_name").notNull(), // DeFi app name (e.g., "Jupiter", "Orca", "Raydium")
  placement: text("placement").notNull(), // "sidebar", "header", "footer", "inline"
  priority: integer("priority").notNull().default(1), // Display priority (higher = shown first)
  isActive: boolean("is_active").notNull().default(true),
  clickCount: integer("click_count").notNull().default(0), // Track clicks
  impressionCount: integer("impression_count").notNull().default(0), // Track views
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertTransactionRecordSchema = createInsertSchema(transactionRecords).omit({
  id: true,
  processedAt: true,
});

export const insertEmptyTokenAccountSchema = createInsertSchema(emptyTokenAccounts).omit({
  id: true,
  scannedAt: true,
  claimed: true,
});

export const insertScanResultSchema = createInsertSchema(scanResults).omit({
  id: true,
  scannedAt: true,
});

export const insertTransactionLedgerSchema = createInsertSchema(transactionLedger).omit({
  id: true,
  processedAt: true,
});

export const insertTokenBurnRecordSchema = createInsertSchema(tokenBurnRecords).omit({
  id: true,
  burnedAt: true,
});

export const insertNftBurnRecordSchema = createInsertSchema(nftBurnRecords).omit({
  id: true,
  burnedAt: true,
});

export const insertReferralCodeSchema = createInsertSchema(referralCodes).omit({
  id: true,
  totalEarnings: true,
  totalReferrals: true,
  isActive: true,
  createdAt: true,
});

export const insertReferralTransactionSchema = createInsertSchema(referralTransactions).omit({
  id: true,
  paidAt: true,
});

export const insertWalletReferralAssociationSchema = createInsertSchema(walletReferralAssociations).omit({
  id: true,
  associatedAt: true,
});

export const insertAdSchema = createInsertSchema(ads).omit({
  id: true,
  clickCount: true,
  impressionCount: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type TransactionRecord = typeof transactionRecords.$inferSelect;
export type InsertTransactionRecord = z.infer<typeof insertTransactionRecordSchema>;
export type EmptyTokenAccount = typeof emptyTokenAccounts.$inferSelect;
export type InsertEmptyTokenAccount = z.infer<typeof insertEmptyTokenAccountSchema>;
export type ScanResult = typeof scanResults.$inferSelect;
export type InsertScanResult = z.infer<typeof insertScanResultSchema>;
export type TransactionLedger = typeof transactionLedger.$inferSelect;
export type InsertTransactionLedger = z.infer<typeof insertTransactionLedgerSchema>;
export type TokenBurnRecord = typeof tokenBurnRecords.$inferSelect;
export type InsertTokenBurnRecord = z.infer<typeof insertTokenBurnRecordSchema>;
export type NftBurnRecord = typeof nftBurnRecords.$inferSelect;
export type InsertNftBurnRecord = z.infer<typeof insertNftBurnRecordSchema>;
export type ReferralCode = typeof referralCodes.$inferSelect;
export type InsertReferralCode = z.infer<typeof insertReferralCodeSchema>;
export type ReferralTransaction = typeof referralTransactions.$inferSelect;
export type InsertReferralTransaction = z.infer<typeof insertReferralTransactionSchema>;
export type WalletReferralAssociation = typeof walletReferralAssociations.$inferSelect;
export type InsertWalletReferralAssociation = z.infer<typeof insertWalletReferralAssociationSchema>;
export type Ad = typeof ads.$inferSelect;
export type InsertAd = z.infer<typeof insertAdSchema>;
