# Get Your SOL Back! Application

## Overview
"Get Your SOL Back!" is a full-stack TypeScript application designed to help Solana users reclaim SOL from empty token accounts. It features a React frontend and a Node.js Express backend with PostgreSQL, integrating directly with the Solana blockchain to identify empty accounts and facilitate rent deposit reclamation. The project supports 8 different wallet types including hardware wallets (Ledger) for maximum security and accessibility. The application aims to provide a seamless and efficient way for users to recover SOL previously locked in dormant accounts.

## Recent Updates (January 2025)
- **Server-Side Open Graph Implementation** (October 2025): Dynamic social media link previews for Twitter/X sharing
  - Express middleware intercepts HTML requests with `?claimed=X` parameter
  - Injects dynamic OG tags with claimed SOL amount and random share messages
  - Shared message templates in `shared/shareMessages.ts` used by both server and client
  - 12 different tweet message variations for engagement diversity
  - HTML escaping for XSS security
  - Twitter Card Validator compatible
- **Jupiter Ultra Swap Integration** (October 2025): Migrated from Legacy Swap API to Ultra Swap API for enhanced performance and reliability
  - Ultra Swap endpoints: `/api/jupiter/ultra/order` (quote + transaction) and `/api/jupiter/ultra/execute` (broadcast)
  - Referral account: `5fiaP6GJBixn5N1pZT5dUer1MUkdAiKMg7tBPbFyZdB` receives 1% (100 bps) referral fee
  - Token account: `2iDyu7fVbXPKuGnbas3PfZDZtY2MJuxr1mYh8Qahx1NF` collects fees in output tokens
  - Jupiter takes 20% of referral fees (platform receives 80% of 1% = 0.8%)
  - Benefits: Sub-2-second execution, MEV protection, gasless swaps via Jupiter Z, real-time slippage optimization
  - No RPC management required - Jupiter handles transaction broadcasting and confirmation
- **Deployment Fixes Applied**: Complete server configuration overhaul for production deployment stability
- **Enhanced Error Handling**: Comprehensive startup error handling with detailed logging and graceful failure modes
- **Port Configuration**: Corrected server listening configuration using environment variables without object parameters
- **Database Connectivity**: Added startup database connection testing with proper error handling
- **Health Monitoring**: Added `/health` endpoint for deployment verification
- **Environment Validation**: Added critical environment variable validation during startup
- **Process Management**: Added uncaught exception and unhandled rejection handlers
- **Production Environment**: Automatic NODE_ENV configuration for deployment environments
- **Ledger Hardware Wallet Support**: Added secure cold storage wallet integration
- **Enhanced Multi-Wallet Support**: Complete coverage of major Solana wallets
- **Hardware Security Features**: Physical transaction confirmation for Ledger users
- **Browser Compatibility Detection**: WebHID support validation for hardware wallets
- **Comprehensive Wallet Instructions**: Step-by-step guides for Ledger setup and usage

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application uses a monorepo structure with a React 18 (Vite, Radix UI, shadcn/ui, Tailwind CSS) frontend and a Node.js Express backend (TypeScript, Drizzle ORM). TanStack Query manages frontend server state, while Wouter handles routing. Backend services integrate with Solana RPC (Helius API preferred) for account scanning, transaction processing, and data persistence in PostgreSQL. Key components include a Wallet Scanner, Claim Interface, and Statistics Dashboard. Architectural decisions prioritize type safety, reliable ACID transactions via PostgreSQL, and a lightweight blockchain integration using direct RPC calls.

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
- **Statistics Dashboard**: Displays recovery statistics and transaction history.
- **Multi-Wallet Integration**: Supports 8 different wallet types including hardware wallets.
- **Ledger Hardware Support**: Secure cold storage wallet integration with transaction confirmation.
- **Jupiter Ultra Swap Integration**: Advanced token swapping using Jupiter Ultra API with referral fee collection (1% integrator fee, 20% Jupiter fee split).
- **Solana Integration**: Handles RPC interactions for account discovery and transaction submission.
- **Data Persistence**: Stores scan results, transaction records, and user statistics.

### Database Schema
- `users`: User authentication.
- `transaction_records`: Legacy SOL recovery transaction records.
- `transaction_ledger`: Comprehensive ledger for all transaction types (SOL reclaim, token/NFT burns).
- `token_burn_records`: Detailed token burning records.
- `nft_burn_records`: Detailed NFT burning records.
- `empty_token_accounts`: Discovered empty accounts.
- `scan_results`: Historical wallet scan data.

## External Dependencies
- **Solana RPC**: Primary connection to Solana mainnet.
- **Helius API**: Enhanced RPC provider.
- **Jupiter Ultra Swap API**: Advanced DEX aggregator with Juno Liquidity Engine, MEV protection, and proprietary transaction sending.
- **Multi-Wallet Support**: Phantom, Backpack, Solflare, Magic Eden, Coinbase, Coin98, Bitget, and Ledger hardware wallets.
- **Ledger Hardware Wallet**: Secure cold storage wallet integration with WebHID support.
- **PostgreSQL**: Primary database.
- **Neon Database**: Serverless PostgreSQL provider.
- **Drizzle Kit**: Database migration and schema management.