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
  postedToX: boolean("posted_to_x").notNull().default(false), // tracks if transaction has been posted to X
  xPostId: text("x_post_id"), // stores X post ID if posted
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

// Pending token burns (grace period for accidental burns)
export const pendingTokenBurns = pgTable("pending_token_burns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull(),
  tokenMint: text("token_mint").notNull(),
  tokenSymbol: text("token_symbol"),
  tokenName: text("token_name"),
  tokenLogo: text("token_logo"),
  amount: decimal("amount", { precision: 18, scale: 9 }).notNull(),
  decimals: integer("decimals").notNull(),
  rentSolReclaimed: decimal("rent_sol_reclaimed", { precision: 18, scale: 9 }).notNull(),
  platformFee: decimal("platform_fee", { precision: 18, scale: 9 }).notNull(),
  referralFee: decimal("referral_fee", { precision: 18, scale: 9 }).default("0").notNull(),
  netAmount: decimal("net_amount", { precision: 18, scale: 9 }).notNull(),
  gracePeriodMinutes: integer("grace_period_minutes").notNull().default(2), // 2 minutes for testing
  status: text("status").notNull().default("pending"), // 'pending', 'claimed_back', 'executed'
  initialBurnSignature: text("initial_burn_signature").notNull(),
  claimBackSignature: text("claim_back_signature"),
  finalBurnSignature: text("final_burn_signature"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  claimedBackAt: timestamp("claimed_back_at"),
  executedAt: timestamp("executed_at"),
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

// Mass Transfer Records - tracks usage of the mass transfer feature
export const massTransferRecords = pgTable("mass_transfer_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  signature: text("signature").notNull().unique(),
  walletAddress: text("wallet_address").notNull(),
  destinationWallet: text("destination_wallet").notNull(),
  tokensCount: integer("tokens_count").notNull(), // Number of different tokens transferred
  tokenDetails: text("token_details"), // JSON string with token mints and amounts
  totalPlatformFees: decimal("total_platform_fees", { precision: 18, scale: 9 }).notNull(), // 0.0002 SOL per token
  transferredAt: timestamp("transferred_at").notNull().defaultNow(),
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

export const insertPendingTokenBurnSchema = createInsertSchema(pendingTokenBurns).omit({
  id: true,
  status: true,
  gracePeriodMinutes: true,
  createdAt: true,
  claimedBackAt: true,
  executedAt: true,
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

export const insertMassTransferRecordSchema = createInsertSchema(massTransferRecords).omit({
  id: true,
  transferredAt: true,
});

// Jupiter Lend deposit records for analytics
export const jupiterLendDeposits = pgTable("jupiter_lend_deposits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  signature: text("signature").notNull(),
  walletAddress: text("wallet_address").notNull(),
  tokenMint: text("token_mint").notNull(),
  tokenSymbol: text("token_symbol").notNull(),
  amountDeposited: decimal("amount_deposited", { precision: 18, scale: 9 }).notNull(),
  usdValueAtDeposit: decimal("usd_value_at_deposit", { precision: 18, scale: 2 }).notNull(),
  apyAtDeposit: decimal("apy_at_deposit", { precision: 5, scale: 2 }).notNull(),
  depositedAt: timestamp("deposited_at").notNull().defaultNow(),
});

export const insertJupiterLendDepositSchema = createInsertSchema(jupiterLendDeposits).omit({
  id: true,
  depositedAt: true,
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
export type PendingTokenBurn = typeof pendingTokenBurns.$inferSelect;
export type InsertPendingTokenBurn = z.infer<typeof insertPendingTokenBurnSchema>;
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
export type MassTransferRecord = typeof massTransferRecords.$inferSelect;
export type InsertMassTransferRecord = z.infer<typeof insertMassTransferRecordSchema>;
export type JupiterLendDeposit = typeof jupiterLendDeposits.$inferSelect;
export type InsertJupiterLendDeposit = z.infer<typeof insertJupiterLendDepositSchema>;

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

// X (Twitter) Bot Tables
export const xAuthTokens = pgTable("x_auth_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accessToken: text("access_token").notNull(),
  accessTokenSecret: text("access_token_secret").notNull(),
  apiKey: text("api_key").notNull(),
  apiKeySecret: text("api_key_secret").notNull(),
  accountName: text("account_name"),
  accountId: text("account_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const xPosts = pgTable("x_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tweetId: text("tweet_id"),
  content: text("content").notNull(),
  postType: text("post_type").notNull(), // 'gm', 'gn', 'daily_report', 'promotional', 'engagement'
  status: text("status").notNull().default("pending"), // 'pending', 'posted', 'failed'
  scheduledFor: timestamp("scheduled_for"),
  postedAt: timestamp("posted_at"),
  errorMessage: text("error_message"),
  likes: integer("likes").default(0),
  retweets: integer("retweets").default(0),
  replies: integer("replies").default(0),
  views: integer("views").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const xSchedules = pgTable("x_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scheduleType: text("schedule_type").notNull(), // 'gm', 'gn', 'daily_report', 'promotional'
  timeOfDay: text("time_of_day").notNull(), // '08:00', '22:00', etc. in UTC
  frequency: text("frequency").notNull().default("daily"), // 'daily', 'weekly', 'custom'
  isActive: boolean("is_active").notNull().default(true),
  lastRun: timestamp("last_run"),
  nextRun: timestamp("next_run"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const xEngagement = pgTable("x_engagement", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceTweetId: text("source_tweet_id").notNull(),
  sourceTweetAuthor: text("source_tweet_author"),
  sourceTweetContent: text("source_tweet_content"),
  engagementType: text("engagement_type").notNull(), // 'like', 'retweet', 'reply', 'quote'
  ourTweetId: text("our_tweet_id"), // If we replied/quoted
  ourContent: text("our_content"), // Our reply/quote text
  status: text("status").notNull().default("pending"), // 'pending', 'completed', 'failed'
  engagedAt: timestamp("engaged_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertXAuthTokenSchema = createInsertSchema(xAuthTokens).omit({ id: true, createdAt: true, updatedAt: true });
export const insertXPostSchema = createInsertSchema(xPosts).omit({ id: true, createdAt: true });
export const insertXScheduleSchema = createInsertSchema(xSchedules).omit({ id: true, createdAt: true });
export const insertXEngagementSchema = createInsertSchema(xEngagement).omit({ id: true, createdAt: true });

export type XAuthToken = typeof xAuthTokens.$inferSelect;
export type InsertXAuthToken = z.infer<typeof insertXAuthTokenSchema>;
export type XPost = typeof xPosts.$inferSelect;
export type InsertXPost = z.infer<typeof insertXPostSchema>;
export type XSchedule = typeof xSchedules.$inferSelect;
export type InsertXSchedule = z.infer<typeof insertXScheduleSchema>;
export type XEngagement = typeof xEngagement.$inferSelect;
export type InsertXEngagement = z.infer<typeof insertXEngagementSchema>;

// Developer Fee System Tables (Jupiter-style referral accounts)
export const developers = pgTable("developers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  payoutWalletAddress: text("payout_wallet_address").notNull().unique(), // Developer's personal wallet for payouts
  projectName: text("project_name").notNull(), // User-provided project name
  feePercentage: decimal("fee_percentage", { precision: 5, scale: 2 }).notNull().default("0"), // 0-10%
  email: text("email"),
  vanityPrefix: text("vanity_prefix"), // 3-letter prefix requested (e.g., "ABC")
  status: text("status").notNull().default("active"), // active, suspended
  totalEarned: decimal("total_earned", { precision: 18, scale: 9 }).notNull().default("0"),
  totalClaimed: decimal("total_claimed", { precision: 18, scale: 9 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const feeAccounts = pgTable("fee_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  developerId: varchar("developer_id").notNull(), // Links to developers table
  publicKey: text("public_key").notNull().unique(), // Solana account public key
  encryptedPrivateKey: text("encrypted_private_key").notNull(), // Encrypted secret key
  wsolAta: text("wsol_ata"), // WSOL Associated Token Account address (nullable for old accounts)
  generationType: text("generation_type").notNull(), // 'vanity' or 'random'
  vanityPrefix: text("vanity_prefix"), // Actual prefix if vanity (e.g., "ABC")
  status: text("status").notNull().default("pending"), // pending, active, disabled
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const feeBalances = pgTable("fee_balances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  developerId: varchar("developer_id").notNull().unique(), // One balance per developer
  feeAccountId: varchar("fee_account_id").notNull(),
  unclaimedLamports: decimal("unclaimed_lamports", { precision: 18, scale: 9 }).notNull().default("0"),
  unclaimedUsd: decimal("unclaimed_usd", { precision: 18, scale: 2 }).notNull().default("0"), // Cached USD value
  lastUsdUpdate: timestamp("last_usd_update"), // When USD value was last updated
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const feeTransactions = pgTable("fee_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  developerId: varchar("developer_id").notNull(),
  feeAccountId: varchar("fee_account_id").notNull(),
  sourceSignature: text("source_signature").notNull(), // Original SOL recovery/burn transaction
  transactionType: text("transaction_type").notNull(), // 'sol_recovery', 'token_burn', 'nft_burn'
  grossFee: decimal("gross_fee", { precision: 18, scale: 9 }).notNull(), // Total fee charged to user
  developerShare: decimal("developer_share", { precision: 18, scale: 9 }).notNull(), // 80% of gross
  platformShare: decimal("platform_share", { precision: 18, scale: 9 }).notNull(), // 20% of gross
  userWallet: text("user_wallet").notNull(), // User who paid the fee
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const feeClaims = pgTable("fee_claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  developerId: varchar("developer_id").notNull(),
  feeAccountId: varchar("fee_account_id").notNull(),
  claimSignature: text("claim_signature").notNull().unique(), // On-chain transaction signature
  amountClaimed: decimal("amount_claimed", { precision: 18, scale: 9 }).notNull(), // Total claimed
  developerReceived: decimal("developer_received", { precision: 18, scale: 9 }).notNull(), // 80% sent to developer
  platformReceived: decimal("platform_received", { precision: 18, scale: 9 }).notNull(), // 20% sent to platform
  status: text("status").notNull().default("pending"), // pending, completed, failed
  errorMessage: text("error_message"),
  claimedAt: timestamp("claimed_at").notNull().defaultNow(),
});

export const insertDeveloperSchema = createInsertSchema(developers).omit({
  id: true,
  totalEarned: true,
  totalClaimed: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFeeAccountSchema = createInsertSchema(feeAccounts).omit({
  id: true,
  status: true,
  createdAt: true,
});

export const insertFeeBalanceSchema = createInsertSchema(feeBalances).omit({
  id: true,
  unclaimedLamports: true,
  unclaimedUsd: true,
  lastUsdUpdate: true,
  updatedAt: true,
});

export const insertFeeTransactionSchema = createInsertSchema(feeTransactions).omit({
  id: true,
  createdAt: true,
});

export const insertFeeClaimSchema = createInsertSchema(feeClaims).omit({
  id: true,
  status: true,
  claimedAt: true,
});

export type Developer = typeof developers.$inferSelect;
export type InsertDeveloper = z.infer<typeof insertDeveloperSchema>;
export type FeeAccount = typeof feeAccounts.$inferSelect;
export type InsertFeeAccount = z.infer<typeof insertFeeAccountSchema>;
export type FeeBalance = typeof feeBalances.$inferSelect;
export type InsertFeeBalance = z.infer<typeof insertFeeBalanceSchema>;
export type FeeTransaction = typeof feeTransactions.$inferSelect;
export type InsertFeeTransaction = z.infer<typeof insertFeeTransactionSchema>;
export type FeeClaim = typeof feeClaims.$inferSelect;
export type InsertFeeClaim = z.infer<typeof insertFeeClaimSchema>;

// PDA-based Referral System (Jupiter-style)
// Platform's project account (single project for our platform)
export const projectAccount = pgTable("project_account", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectName: text("project_name").notNull().default("Get Your SOL Back"),
  baseKey: text("base_key").notNull().unique(), // Seed for PDA derivation
  projectPda: text("project_pda").notNull().unique(), // Derived PDA address
  adminWallet: text("admin_wallet").notNull(), // Platform wallet (GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6)
  bump: integer("bump").notNull(), // PDA bump seed
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Developer referral accounts (one per developer) - Platform-managed wallet with encrypted keys
export const referralAccounts = pgTable("referral_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectAccountId: varchar("project_account_id").notNull(), // Links to project
  developerWallet: text("developer_wallet").notNull().unique(), // Developer's wallet address
  referralPda: text("referral_pda").notNull().unique(), // Platform-managed wallet for fee collection
  encryptedPrivateKey: text("encrypted_private_key"), // Encrypted private key for the fee collection wallet
  bump: integer("bump").notNull(), // Legacy field (kept for compatibility)
  projectName: text("project_name"), // Developer's project name
  feePercentage: decimal("fee_percentage", { precision: 5, scale: 2 }).notNull().default("0"), // 0-10%
  status: text("status").notNull().default("active"), // active, suspended
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Token accounts for fee collection (multiple per developer, one for each mint)
export const referralTokenAccounts = pgTable("referral_token_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referralAccountId: varchar("referral_account_id").notNull(), // Links to referral account
  tokenMint: text("token_mint").notNull(), // Token mint address (e.g., So11111111... for SOL)
  tokenSymbol: text("token_symbol"), // Human-readable symbol (SOL, USDC, USDT)
  tokenName: text("token_name"), // Full token name
  tokenDecimals: integer("token_decimals").notNull().default(9),
  tokenAccountAddress: text("token_account_address").notNull().unique(), // ATA for this mint
  unclaimedBalance: decimal("unclaimed_balance", { precision: 18, scale: 9 }).notNull().default("0"),
  totalEarned: decimal("total_earned", { precision: 18, scale: 9 }).notNull().default("0"),
  totalClaimed: decimal("total_claimed", { precision: 18, scale: 9 }).notNull().default("0"),
  status: text("status").notNull().default("active"), // active, inactive
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Fee transactions for PDA-based system
export const referralFeeTransactions = pgTable("referral_fee_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referralAccountId: varchar("referral_account_id").notNull(),
  tokenAccountId: varchar("token_account_id").notNull(),
  sourceSignature: text("source_signature").notNull(), // Original transaction that generated fees
  transactionType: text("transaction_type").notNull(), // 'sol_recovery', 'token_burn', 'nft_burn'
  tokenMint: text("token_mint").notNull(),
  grossFee: decimal("gross_fee", { precision: 18, scale: 9 }).notNull(), // Total fee in tokens
  developerShare: decimal("developer_share", { precision: 18, scale: 9 }).notNull(), // 80%
  platformShare: decimal("platform_share", { precision: 18, scale: 9 }).notNull(), // 20%
  userWallet: text("user_wallet").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Claims from token accounts (and native SOL)
export const referralClaims = pgTable("referral_claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referralAccountId: varchar("referral_account_id").notNull(),
  tokenAccountId: varchar("token_account_id"), // Nullable for native SOL claims
  claimSignature: text("claim_signature").notNull().unique(),
  tokenMint: text("token_mint"), // Nullable for native SOL
  amountClaimed: decimal("amount_claimed", { precision: 18, scale: 9 }).notNull(),
  developerReceived: decimal("developer_received", { precision: 18, scale: 9 }).notNull(), // 80%
  platformReceived: decimal("platform_received", { precision: 18, scale: 9 }).notNull(), // 20%
  status: text("status").notNull().default("completed"),
  errorMessage: text("error_message"),
  claimedAt: timestamp("claimed_at").notNull().defaultNow(),
});

export const insertProjectAccountSchema = createInsertSchema(projectAccount).omit({
  id: true,
  createdAt: true,
});

export const insertReferralAccountSchema = createInsertSchema(referralAccounts).omit({
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});

export const insertReferralTokenAccountSchema = createInsertSchema(referralTokenAccounts).omit({
  id: true,
  unclaimedBalance: true,
  totalEarned: true,
  totalClaimed: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});

export const insertReferralFeeTransactionSchema = createInsertSchema(referralFeeTransactions).omit({
  id: true,
  createdAt: true,
});

export const insertReferralClaimSchema = createInsertSchema(referralClaims).omit({
  id: true,
  status: true,
  claimedAt: true,
});

export type ProjectAccount = typeof projectAccount.$inferSelect;
export type InsertProjectAccount = z.infer<typeof insertProjectAccountSchema>;
export type ReferralAccount = typeof referralAccounts.$inferSelect;
export type InsertReferralAccount = z.infer<typeof insertReferralAccountSchema>;
export type ReferralTokenAccount = typeof referralTokenAccounts.$inferSelect;
export type InsertReferralTokenAccount = z.infer<typeof insertReferralTokenAccountSchema>;
export type ReferralFeeTransaction = typeof referralFeeTransactions.$inferSelect;
export type InsertReferralFeeTransaction = z.infer<typeof insertReferralFeeTransactionSchema>;
export type ReferralClaim = typeof referralClaims.$inferSelect;
export type InsertReferralClaim = z.infer<typeof insertReferralClaimSchema>;
