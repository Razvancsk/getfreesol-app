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
  transactionType: text("transaction_type").notNull(), // 'sol_reclaim', 'token_burn', 'nft_burn', 'nft_resize'
  source: text("source").notNull().default("manual"), // 'manual' or 'auto' - tracks if transaction was from auto-claim
  solRecovered: decimal("sol_recovered", { precision: 18, scale: 9 }).notNull(),
  netAmount: decimal("net_amount", { precision: 18, scale: 9 }).notNull(),
  feeAmount: decimal("fee_amount", { precision: 18, scale: 9 }).notNull(),
  itemsProcessed: integer("items_processed").notNull(), // accounts closed, tokens burned, NFTs burned, or NFTs resized
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
  platformFee: decimal("platform_fee", { precision: 18, scale: 9 }).default("0").notNull(),
  referralFee: decimal("referral_fee", { precision: 18, scale: 9 }).default("0").notNull(),
  netAmount: decimal("net_amount", { precision: 18, scale: 9 }).notNull(),
  burnedAt: timestamp("burned_at").notNull().defaultNow(),
});

// NFT resizing records
export const nftResizeRecords = pgTable("nft_resize_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  signature: text("signature").notNull(),
  walletAddress: text("wallet_address").notNull(),
  nftMint: text("nft_mint").notNull(),
  oldSize: integer("old_size").notNull(),
  newSize: integer("new_size").notNull(),
  rentDelta: decimal("rent_delta", { precision: 18, scale: 9 }).notNull(),
  platformFee: decimal("platform_fee", { precision: 18, scale: 9 }).default("0").notNull(),
  referralFee: decimal("referral_fee", { precision: 18, scale: 9 }).default("0").notNull(),
  netAmount: decimal("net_amount", { precision: 18, scale: 9 }).notNull(),
  resizedAt: timestamp("resized_at").notNull().defaultNow(),
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

// Auto-Claim Permits - stores user authorization for auto-claiming
export const autoClaimPermits = pgTable("auto_claim_permits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull().unique(), // One permit per wallet
  permitSignature: text("permit_signature").notNull(), // User's signature of the permit message
  permitMessage: text("permit_message").notNull(), // JSON message that was signed
  permitNonce: text("permit_nonce").notNull().unique(), // Prevents replay attacks
  permitPda: text("permit_pda"), // On-chain PDA address (will be set after program initialization)
  multisigAddress: text("multisig_address"), // SPL Token multisig (M=1) owned by relayer for auto-closing accounts
  scopes: text("scopes").notNull().default("claim_empty_accounts"), // Comma-separated: claim_empty_accounts,burn_tokens,burn_nfts
  status: text("status").notNull().default("active"), // active, revoked, expired
  version: integer("version").notNull().default(1), // Permit version for future upgrades
  createdAt: timestamp("created_at").notNull().defaultNow(),
  revokedAt: timestamp("revoked_at"),
  lastUsedAt: timestamp("last_used_at"), // Track when relayer last used this permit
});

// Relayer Jobs - tracks auto-claim job execution
export const relayerJobs = pgTable("relayer_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull(),
  jobType: text("job_type").notNull(), // claim_empty_accounts, burn_tokens, burn_nfts
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  itemsCount: integer("items_count").notNull().default(0), // Number of accounts/tokens/NFTs to process
  estimatedNet: decimal("estimated_net", { precision: 18, scale: 9 }).default("0"), // Expected SOL recovery
  tokenAccounts: text("token_accounts"), // JSON array of token account addresses to close
  txSignature: text("tx_signature"), // Transaction signature once submitted
  errorMessage: text("error_message"), // Error details if failed
  source: text("source").notNull().default("auto"), // Always 'auto' for relayer jobs
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Relayer Costs - tracks network fees spent by the relayer
export const relayerCosts = pgTable("relayer_costs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id"), // Links to relayerJobs if part of a job
  txSignature: text("tx_signature").notNull().unique(),
  walletAddress: text("wallet_address").notNull(), // User wallet that benefited
  lamportsSpent: decimal("lamports_spent", { precision: 18, scale: 9 }).notNull(), // Network fee paid
  computeUnits: integer("compute_units"), // CU consumed
  priorityFeeLamports: decimal("priority_fee_lamports", { precision: 18, scale: 9 }).default("0"), // Priority fee if used
  success: boolean("success").notNull().default(true), // Whether transaction succeeded
  recoveredSol: decimal("recovered_sol", { precision: 18, scale: 9 }).default("0"), // SOL reclaimed (if successful)
  platformFee: decimal("platform_fee", { precision: 18, scale: 9 }).default("0"), // 15% fee collected
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Pending Delegations - tracks empty accounts awaiting user delegation
export const pendingDelegations = pgTable("pending_delegations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull(),
  accountAddress: text("account_address").notNull(),
  mintAddress: text("mint_address").notNull(),
  rentLamports: decimal("rent_lamports", { precision: 18, scale: 9 }).notNull(),
  programId: text("program_id").notNull(), // TOKEN_PROGRAM_ID or TOKEN_2022_PROGRAM_ID
  status: text("status").notNull().default("pending"), // pending, delegated, dismissed
  createdAt: timestamp("created_at").notNull().defaultNow(),
  delegatedAt: timestamp("delegated_at"),
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

export const insertAutoClaimPermitSchema = createInsertSchema(autoClaimPermits).omit({
  id: true,
  status: true,
  version: true,
  createdAt: true,
  revokedAt: true,
  lastUsedAt: true,
});

export const insertRelayerJobSchema = createInsertSchema(relayerJobs).omit({
  id: true,
  status: true,
  source: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});

export const insertRelayerCostSchema = createInsertSchema(relayerCosts).omit({
  id: true,
  success: true,
  createdAt: true,
});

export const insertPendingDelegationSchema = createInsertSchema(pendingDelegations).omit({
  id: true,
  status: true,
  createdAt: true,
  delegatedAt: true,
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
export type AutoClaimPermit = typeof autoClaimPermits.$inferSelect;
export type InsertAutoClaimPermit = z.infer<typeof insertAutoClaimPermitSchema>;
export type RelayerJob = typeof relayerJobs.$inferSelect;
export type InsertRelayerJob = z.infer<typeof insertRelayerJobSchema>;
export type RelayerCost = typeof relayerCosts.$inferSelect;
export type InsertRelayerCost = z.infer<typeof insertRelayerCostSchema>;
export type PendingDelegation = typeof pendingDelegations.$inferSelect;
export type InsertPendingDelegation = z.infer<typeof insertPendingDelegationSchema>;

// Auto-Claim Permit API schemas with validation
export const autoClaimPermitMessageSchema = z.object({
  type: z.literal("AUTO_CLAIM_PERMIT"),
  wallet: z.string().min(32).max(44), // Base58 public key
  action: z.enum(["claim_empty_accounts"]),
  nonce: z.string().uuid(),
  version: z.literal(1),
  created_at: z.number().int().positive(),
  domain: z.string().default("getyoursolback.app"),
  statement: z.string().default("I authorize this application to automatically claim SOL from my empty token accounts.")
});

export const createAutoClaimPermitRequestSchema = z.object({
  walletAddress: z.string().min(32).max(44),
  permitSignature: z.string(), // Base58 encoded signature
  permitMessage: z.string(), // JSON string matching autoClaimPermitMessageSchema
  permitNonce: z.string().uuid(),
  scopes: z.string().default("claim_empty_accounts").optional()
});

// Revoke message must be signed (includes timestamp inside)
export const autoClaimRevokeMessageSchema = z.object({
  type: z.literal("AUTO_CLAIM_REVOKE"),
  wallet: z.string().min(32).max(44),
  action: z.literal("REVOKE_AUTO_CLAIM"),
  nonce: z.string().uuid(), // Unique revoke nonce to prevent replay
  timestamp: z.number().int().positive(), // THIS must be inside signed message
  version: z.literal(1),
  domain: z.string().default("getyoursolback.app")
});

export const revokeAutoClaimPermitRequestSchema = z.object({
  walletAddress: z.string().min(32).max(44),
  revokeSignature: z.string(), // Base58 encoded signature
  revokeMessage: z.string() // JSON string matching autoClaimRevokeMessageSchema
});

export type AutoClaimPermitMessage = z.infer<typeof autoClaimPermitMessageSchema>;
export type AutoClaimRevokeMessage = z.infer<typeof autoClaimRevokeMessageSchema>;
export type CreateAutoClaimPermitRequest = z.infer<typeof createAutoClaimPermitRequestSchema>;
export type RevokeAutoClaimPermitRequest = z.infer<typeof revokeAutoClaimPermitRequestSchema>;
