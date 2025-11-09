# Get Your SOL Back! Application

## Overview
"Get Your SOL Back!" is a full-stack TypeScript application designed to help Solana users reclaim SOL from empty token accounts. It features a React frontend and a Node.js Express backend with PostgreSQL, integrating directly with the Solana blockchain to identify empty accounts and facilitate rent deposit reclamation. The project supports 8 different wallet types including hardware wallets (Ledger) for maximum security and accessibility. The application aims to provide a seamless and efficient way for users to recover SOL previously locked in dormant accounts.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application uses a monorepo structure with a React 18 (Vite, Radix UI, shadcn/ui, Tailwind CSS) frontend and a Node.js Express backend (TypeScript, Drizzle ORM). TanStack Query manages frontend server state, while Wouter handles routing. Backend services integrate with Solana RPC (Helius API preferred) for account scanning, transaction processing, and data persistence in PostgreSQL. Key components include a Wallet Scanner, Claim Interface, Mass Transfer, Jupiter Lend integration, an automated X (Twitter) bot for marketing, and a permit-based Auto-Claim feature for automated SOL reclamation. Architectural decisions prioritize type safety, reliable ACID transactions via PostgreSQL, and a lightweight blockchain integration using direct RPC calls.

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **UI Library**: Radix UI components with shadcn/ui
- **Styling**: Tailwind CSS
- **State Management**: TanStack Query (React Query)
- **Routing**: Wouter
- **Blockchain Integration**: Solana Web3.js

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript (ES modules)
- **Database ORM**: Drizzle ORM
- **API Design**: RESTful API
- **Session Management**: Express sessions

### Key Components
- **Wallet Scanner**: Scans Solana wallets for empty token accounts.
- **Claim Interface**: Facilitates SOL reclamation from empty accounts.
- **Mass Transfer**: Sends multiple tokens to a single destination wallet in one transaction.
- **Backpack Exchange Borrow/Lend**: Displays borrow/lend markets from Backpack Exchange (view-only, requires Backpack account for deposits).
- **Auto-Claim Feature**: Permit-based automated SOL reclamation from empty accounts, supporting both standard SPL and Token-2022 programs.
- **Developer API Platform**: Jupiter-style developer platform with PDA-based referral fee collection. Developers create referral accounts via wallet signature, receive deterministic PDA addresses derived from [project_pda, developer_wallet] for secure fee collection without private key management. Supports multiple token mints (SOL, USDC, USDT, BONK, JUP, etc.) with separate token account tracking. Developers earn 80% of collected fees. API documentation is gated - requires account creation first.
- **X (Twitter) Bot**: Automated social media marketing system for platform wallet with PIN-based OAuth 1.0a authentication (Desktop app flow), scheduled posting, and auto-engagement. Posts automatically when NET SOL claims >= 0.01 SOL occur (after 15% platform fee).
- **Discord Bot**: Multi-functional Discord integration with three key features:
  - **Wallet Scanning**: `/scan <wallet_address>` slash command for checking claimable SOL without connecting wallet
  - **Claim Alerts**: Webhook notifications to Discord channel when users claim SOL
  - **AI Support Chat**: OpenAI-powered chatbot that answers questions via DMs or @mentions, providing help with platform features, troubleshooting, and general support
- **Statistics Dashboard**: Displays recovery statistics and transaction history.
- **Multi-Wallet Integration**: Supports 8 different wallet types including hardware wallets.
- **Ledger Hardware Support**: Secure cold storage wallet integration with transaction confirmation.
- **Jupiter Ultra Swap Integration**: Advanced token swapping using Jupiter Ultra API with referral fee collection.
- **Solana Integration**: Handles RPC interactions for account discovery and transaction submission.
- **Server-Side Open Graph**: Dynamic social media link previews for sharing.

### Database Schema
- `users`: User authentication.
- `transaction_records`: Legacy SOL recovery transaction records.
- `transaction_ledger`: Comprehensive ledger for all transaction types.
- `token_burn_records`: Detailed token burning records.
- `nft_burn_records`: Detailed NFT burning records.
- `empty_token_accounts`: Discovered empty accounts.
- `scan_results`: Historical wallet scan data.
- `auto_claim_permits`: User authorizations for automatic SOL reclamation.
- `relayer_jobs`: Tracks auto-claim job execution.
- `relayer_costs`: Records network fees and SOL recovered by relayer.
- `x_auth_tokens`: Stores X (Twitter) authentication tokens.
- `x_posts`: Records X (Twitter) posts made by the bot.
- `x_schedules`: Manages X (Twitter) posting schedules.
- `x_engagement`: Tracks X (Twitter) engagement activities.
- `project_account`: Platform-level project configuration with base PDA.
- `referral_accounts`: Developer referral accounts with PDA derived from [project_pda, developer_wallet].
- `referral_token_accounts`: Multi-token fee collection accounts for each referral account.
- `referral_fee_transactions`: Records of fees collected through referral system.
- `referral_claims`: Developer claims of accumulated referral fees.

## External Dependencies
- **Solana RPC**: Primary connection to Solana mainnet.
- **Helius API**: Enhanced RPC provider.
- **Jupiter Ultra Swap API**: Advanced DEX aggregator with Juno Liquidity Engine. Uses official api.jup.ag endpoint with API key authentication for dynamic rate limits (50+ req/10s baseline, scales automatically with trading volume).
- **Jupiter Ultra Holdings API**: Token balance aggregation endpoint via api.jup.ag with authenticated requests.
- **Jupiter Token List V2 API**: Token metadata provider.
- **Backpack Exchange API**: Public API for viewing borrow/lend markets and rates.
- **X (Twitter) API**: OAuth 1.0a flow for account connection and automated social media interactions.
- **Discord API**: Bot integration for wallet scanning, claim alerts, and AI-powered support chat.
- **OpenAI API**: GPT-4o-mini model for Discord AI chat support.
- **Multi-Wallet Support**: Phantom, Backpack, Solflare, Magic Eden, Coinbase, Coin98, Bitget, and Ledger hardware wallets.
- **Ledger Hardware Wallet**: Secure cold storage wallet integration with WebHID support.
- **PostgreSQL**: Primary database.
- **Neon Database**: Serverless PostgreSQL provider.
- **Drizzle Kit**: Database migration and schema management.
- **node-cron**: For scheduling automated tasks.