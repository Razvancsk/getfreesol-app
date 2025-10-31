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
- **Jupiter Lend Integration**: Allows users to earn yield by depositing tokens into Jupiter Lend pools.
- **Auto-Claim Feature**: Permit-based automated SOL reclamation from empty accounts, supporting both standard SPL and Token-2022 programs.
- **X (Twitter) Bot**: Automated social media marketing system for platform wallet, including scheduled posting and auto-engagement.
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

## External Dependencies
- **Solana RPC**: Primary connection to Solana mainnet.
- **Helius API**: Enhanced RPC provider.
- **Jupiter Ultra Swap API**: Advanced DEX aggregator with Juno Liquidity Engine.
- **Jupiter Ultra Holdings API**: Token balance aggregation endpoint.
- **Jupiter Token List V2 API**: Token metadata provider.
- **Jupiter Lend API**: Provides earn pools and lending functionalities.
- **X (Twitter) API**: For automated social media interactions.
- **Multi-Wallet Support**: Phantom, Backpack, Solflare, Magic Eden, Coinbase, Coin98, Bitget, and Ledger hardware wallets.
- **Ledger Hardware Wallet**: Secure cold storage wallet integration with WebHID support.
- **PostgreSQL**: Primary database.
- **Neon Database**: Serverless PostgreSQL provider.
- **Drizzle Kit**: Database migration and schema management.
- **node-cron**: For scheduling automated tasks.