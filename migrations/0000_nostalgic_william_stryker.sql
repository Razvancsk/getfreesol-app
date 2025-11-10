CREATE TABLE "auto_claim_permits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" text NOT NULL,
	"permit_signature" text NOT NULL,
	"permit_message" text NOT NULL,
	"permit_nonce" text NOT NULL,
	"permit_pda" text,
	"scopes" text DEFAULT 'claim_empty_accounts' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	"last_used_at" timestamp,
	CONSTRAINT "auto_claim_permits_wallet_address_unique" UNIQUE("wallet_address"),
	CONSTRAINT "auto_claim_permits_permit_nonce_unique" UNIQUE("permit_nonce")
);
--> statement-breakpoint
CREATE TABLE "developers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payout_wallet_address" text NOT NULL,
	"project_name" text NOT NULL,
	"fee_percentage" numeric(5, 2) DEFAULT '0' NOT NULL,
	"email" text,
	"vanity_prefix" text,
	"status" text DEFAULT 'active' NOT NULL,
	"total_earned" numeric(18, 9) DEFAULT '0' NOT NULL,
	"total_claimed" numeric(18, 9) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "developers_payout_wallet_address_unique" UNIQUE("payout_wallet_address")
);
--> statement-breakpoint
CREATE TABLE "empty_token_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_address" text NOT NULL,
	"mint_address" text NOT NULL,
	"wallet_address" text NOT NULL,
	"token_symbol" text,
	"token_name" text,
	"rent_amount" numeric(18, 9) NOT NULL,
	"balance" numeric(18, 9) DEFAULT '0' NOT NULL,
	"decimals" integer NOT NULL,
	"scanned_at" timestamp DEFAULT now() NOT NULL,
	"claimed" boolean DEFAULT false NOT NULL,
	"program_id" text,
	CONSTRAINT "empty_token_accounts_account_address_unique" UNIQUE("account_address")
);
--> statement-breakpoint
CREATE TABLE "fee_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" varchar NOT NULL,
	"public_key" text NOT NULL,
	"encrypted_private_key" text NOT NULL,
	"wsol_ata" text,
	"generation_type" text NOT NULL,
	"vanity_prefix" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fee_accounts_public_key_unique" UNIQUE("public_key")
);
--> statement-breakpoint
CREATE TABLE "fee_balances" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" varchar NOT NULL,
	"fee_account_id" varchar NOT NULL,
	"unclaimed_lamports" numeric(18, 9) DEFAULT '0' NOT NULL,
	"unclaimed_usd" numeric(18, 2) DEFAULT '0' NOT NULL,
	"last_usd_update" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fee_balances_developer_id_unique" UNIQUE("developer_id")
);
--> statement-breakpoint
CREATE TABLE "fee_claims" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" varchar NOT NULL,
	"fee_account_id" varchar NOT NULL,
	"claim_signature" text NOT NULL,
	"amount_claimed" numeric(18, 9) NOT NULL,
	"developer_received" numeric(18, 9) NOT NULL,
	"platform_received" numeric(18, 9) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"claimed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fee_claims_claim_signature_unique" UNIQUE("claim_signature")
);
--> statement-breakpoint
CREATE TABLE "fee_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" varchar NOT NULL,
	"fee_account_id" varchar NOT NULL,
	"source_signature" text NOT NULL,
	"transaction_type" text NOT NULL,
	"gross_fee" numeric(18, 9) NOT NULL,
	"developer_share" numeric(18, 9) NOT NULL,
	"platform_share" numeric(18, 9) NOT NULL,
	"user_wallet" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jupiter_lend_deposits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signature" text NOT NULL,
	"wallet_address" text NOT NULL,
	"token_mint" text NOT NULL,
	"token_symbol" text NOT NULL,
	"amount_deposited" numeric(18, 9) NOT NULL,
	"usd_value_at_deposit" numeric(18, 2) NOT NULL,
	"apy_at_deposit" numeric(5, 2) NOT NULL,
	"deposited_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mass_transfer_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signature" text NOT NULL,
	"wallet_address" text NOT NULL,
	"destination_wallet" text NOT NULL,
	"tokens_count" integer NOT NULL,
	"token_details" text,
	"total_platform_fees" numeric(18, 9) NOT NULL,
	"transferred_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mass_transfer_records_signature_unique" UNIQUE("signature")
);
--> statement-breakpoint
CREATE TABLE "nft_burn_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signature" text NOT NULL,
	"wallet_address" text NOT NULL,
	"nft_mint" text NOT NULL,
	"nft_name" text,
	"nft_image" text,
	"collection_address" text,
	"sol_recovered" numeric(18, 9) NOT NULL,
	"platform_fee" numeric(18, 9) DEFAULT '0' NOT NULL,
	"referral_fee" numeric(18, 9) DEFAULT '0' NOT NULL,
	"net_amount" numeric(18, 9) NOT NULL,
	"burned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nft_resize_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signature" text NOT NULL,
	"wallet_address" text NOT NULL,
	"nft_mint" text NOT NULL,
	"old_size" integer NOT NULL,
	"new_size" integer NOT NULL,
	"rent_delta" numeric(18, 9) NOT NULL,
	"platform_fee" numeric(18, 9) DEFAULT '0' NOT NULL,
	"referral_fee" numeric(18, 9) DEFAULT '0' NOT NULL,
	"net_amount" numeric(18, 9) NOT NULL,
	"resized_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_token_burns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" text NOT NULL,
	"token_mint" text NOT NULL,
	"token_symbol" text,
	"token_name" text,
	"token_logo" text,
	"amount" numeric(18, 9) NOT NULL,
	"decimals" integer NOT NULL,
	"rent_sol_reclaimed" numeric(18, 9) NOT NULL,
	"platform_fee" numeric(18, 9) NOT NULL,
	"referral_fee" numeric(18, 9) DEFAULT '0' NOT NULL,
	"net_amount" numeric(18, 9) NOT NULL,
	"grace_period_minutes" integer DEFAULT 2 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"initial_burn_signature" text NOT NULL,
	"claim_back_signature" text,
	"final_burn_signature" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"claimed_back_at" timestamp,
	"executed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "project_account" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_name" text DEFAULT 'Get Your SOL Back' NOT NULL,
	"base_key" text NOT NULL,
	"project_pda" text NOT NULL,
	"admin_wallet" text NOT NULL,
	"bump" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_account_base_key_unique" UNIQUE("base_key"),
	CONSTRAINT "project_account_project_pda_unique" UNIQUE("project_pda")
);
--> statement-breakpoint
CREATE TABLE "referral_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_account_id" varchar NOT NULL,
	"developer_wallet" text NOT NULL,
	"referral_pda" text NOT NULL,
	"encrypted_private_key" text,
	"bump" integer NOT NULL,
	"project_name" text,
	"fee_percentage" numeric(5, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "referral_accounts_developer_wallet_unique" UNIQUE("developer_wallet"),
	CONSTRAINT "referral_accounts_referral_pda_unique" UNIQUE("referral_pda")
);
--> statement-breakpoint
CREATE TABLE "referral_claims" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_account_id" varchar NOT NULL,
	"token_account_id" varchar,
	"claim_signature" text NOT NULL,
	"token_mint" text,
	"amount_claimed" numeric(18, 9) NOT NULL,
	"developer_received" numeric(18, 9) NOT NULL,
	"platform_received" numeric(18, 9) NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"error_message" text,
	"claimed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "referral_claims_claim_signature_unique" UNIQUE("claim_signature")
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"wallet_address" text NOT NULL,
	"website_url" text,
	"total_earnings" numeric(18, 9) DEFAULT '0' NOT NULL,
	"total_referrals" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "referral_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "referral_fee_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_account_id" varchar NOT NULL,
	"token_account_id" varchar NOT NULL,
	"source_signature" text NOT NULL,
	"transaction_type" text NOT NULL,
	"token_mint" text NOT NULL,
	"gross_fee" numeric(18, 9) NOT NULL,
	"developer_share" numeric(18, 9) NOT NULL,
	"platform_share" numeric(18, 9) NOT NULL,
	"user_wallet" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_token_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_account_id" varchar NOT NULL,
	"token_mint" text NOT NULL,
	"token_symbol" text,
	"token_name" text,
	"token_decimals" integer DEFAULT 9 NOT NULL,
	"token_account_address" text NOT NULL,
	"unclaimed_balance" numeric(18, 9) DEFAULT '0' NOT NULL,
	"total_earned" numeric(18, 9) DEFAULT '0' NOT NULL,
	"total_claimed" numeric(18, 9) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "referral_token_accounts_token_account_address_unique" UNIQUE("token_account_address")
);
--> statement-breakpoint
CREATE TABLE "referral_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_code_id" varchar NOT NULL,
	"transaction_signature" text NOT NULL,
	"referred_wallet_address" text NOT NULL,
	"original_fee_amount" numeric(18, 9) NOT NULL,
	"referral_fee_amount" numeric(18, 9) NOT NULL,
	"platform_fee_amount" numeric(18, 9) NOT NULL,
	"paid_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relayer_costs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar,
	"tx_signature" text NOT NULL,
	"wallet_address" text NOT NULL,
	"lamports_spent" numeric(18, 9) NOT NULL,
	"compute_units" integer,
	"priority_fee_lamports" numeric(18, 9) DEFAULT '0',
	"success" boolean DEFAULT true NOT NULL,
	"recovered_sol" numeric(18, 9) DEFAULT '0',
	"platform_fee" numeric(18, 9) DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "relayer_costs_tx_signature_unique" UNIQUE("tx_signature")
);
--> statement-breakpoint
CREATE TABLE "relayer_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" text NOT NULL,
	"job_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"items_count" integer DEFAULT 0 NOT NULL,
	"estimated_net" numeric(18, 9) DEFAULT '0',
	"token_accounts" text,
	"tx_signature" text,
	"error_message" text,
	"source" text DEFAULT 'auto' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "scan_results" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" text NOT NULL,
	"total_accounts" integer NOT NULL,
	"empty_accounts" integer NOT NULL,
	"total_reclaimable" numeric(18, 9) NOT NULL,
	"scanned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_burn_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signature" text NOT NULL,
	"wallet_address" text NOT NULL,
	"token_mint" text NOT NULL,
	"token_symbol" text,
	"token_name" text,
	"amount_burned" numeric(18, 9) NOT NULL,
	"sol_recovered" numeric(18, 9) NOT NULL,
	"burned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_ledger" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signature" text NOT NULL,
	"wallet_address" text NOT NULL,
	"transaction_type" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"sol_recovered" numeric(18, 9) NOT NULL,
	"net_amount" numeric(18, 9) NOT NULL,
	"fee_amount" numeric(18, 9) NOT NULL,
	"items_processed" integer NOT NULL,
	"item_details" text,
	"processed_at" timestamp DEFAULT now() NOT NULL,
	"posted_to_x" boolean DEFAULT false NOT NULL,
	"x_post_id" text,
	CONSTRAINT "transaction_ledger_signature_unique" UNIQUE("signature")
);
--> statement-breakpoint
CREATE TABLE "transaction_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signature" text NOT NULL,
	"wallet_address" text NOT NULL,
	"sol_recovered" numeric(18, 9) NOT NULL,
	"net_amount" numeric(18, 9) NOT NULL,
	"fee_amount" numeric(18, 9) NOT NULL,
	"accounts_closed" integer NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_records_signature_unique" UNIQUE("signature")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "wallet_referral_associations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" text NOT NULL,
	"referral_code_id" varchar NOT NULL,
	"referral_code" text NOT NULL,
	"associated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_referral_associations_wallet_address_unique" UNIQUE("wallet_address")
);
--> statement-breakpoint
CREATE TABLE "x_auth_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"access_token" text NOT NULL,
	"access_token_secret" text NOT NULL,
	"api_key" text NOT NULL,
	"api_key_secret" text NOT NULL,
	"account_name" text,
	"account_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "x_engagement" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_tweet_id" text NOT NULL,
	"source_tweet_author" text,
	"source_tweet_content" text,
	"engagement_type" text NOT NULL,
	"our_tweet_id" text,
	"our_content" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"engaged_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "x_posts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tweet_id" text,
	"content" text NOT NULL,
	"post_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"scheduled_for" timestamp,
	"posted_at" timestamp,
	"error_message" text,
	"likes" integer DEFAULT 0,
	"retweets" integer DEFAULT 0,
	"replies" integer DEFAULT 0,
	"views" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "x_schedules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_type" text NOT NULL,
	"time_of_day" text NOT NULL,
	"frequency" text DEFAULT 'daily' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_run" timestamp,
	"next_run" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
