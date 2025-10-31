# Get Your SOL Back! Application

## Overview
"Get Your SOL Back!" is a full-stack TypeScript application designed to help Solana users reclaim SOL from empty token accounts. It features a React frontend and a Node.js Express backend with PostgreSQL, integrating directly with the Solana blockchain to identify empty accounts and facilitate rent deposit reclamation. The project supports 8 different wallet types including hardware wallets (Ledger) for maximum security and accessibility. The application aims to provide a seamless and efficient way for users to recover SOL previously locked in dormant accounts.

## Recent Updates (October 2025)
- **Kamino Finance kVault CASH Integration** (October 2025): Complete lending integration with deposit/withdraw functionality
  - **Backend Endpoints**: 
    - `/api/kamino-lend/markets` returns kVault CASH pool with 12.14% APY and $96.03M TVL
    - `/api/kamino-lend/build-deposit` builds deposit transactions using Kamino SDK
    - `/api/kamino-lend/build-withdraw` builds withdraw transactions using Kamino SDK
    - `/api/kamino-lend/user-positions/:walletAddress` fetches user's Kamino deposits
  - **Vault Details**: kVault CASH (kV-CASH) at address `KvauGMspG5k6rtzrqqn7WNn3oZdyKqLKwK2XWQ8FLjd`
  - **Program ID**: kVault Program `44jZGfgAp9t36m2JJeNNxKL7cFQemi2TiaS7dyBxLpzd`
  - **CASH Mint**: `CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH`
  - **SDK Integration**: Uses `@kamino-finance/klend-sdk` for transaction building with `KaminoMarket.load()` and `KaminoAction.buildDepositTxns()/buildWithdrawTxns()`
  - **UI Integration**: Unified lending interface displays both Jupiter Lend pools and Kamino kVault CASH pool side-by-side
  - **Platform Badges**: Clear visual distinction between Jupiter (purple) and Kamino (orange) pools
  - **Full Functionality**: Users can deposit CASH to earn 12.14% APY and withdraw anytime
  - **Capability Flags**: Machine-readable flags (`canDeposit: true`, `canWithdraw: true`, `comingSoon: false`) signal feature availability
- **Jupiter Lend Earn Integration** (October 2025): Complete lending feature powered by Jupiter Lend API
  - **Backend API Endpoints**: `/api/jupiter-lend/earn-pools` fetches all available earn tokens with APY rates, `/api/jupiter-lend/user-positions/:walletAddress` retrieves user's lending positions, `/api/jupiter-lend/build-deposit` and `/api/jupiter-lend/build-withdraw` build deposit/withdraw transactions
  - **Earn Pools Display**: Shows all available Jupiter Lend earn tokens (USDC, SOL, USDT, EURC, USDG, USDS) with current APY rates
  - **User Positions**: Displays user's active lending positions including shares, underlying assets, and earnings
  - **Real-time Market Data**: Fetches live APY rates and token information from Jupiter Lend API at `https://lite-api.jup.ag/lend/v1/earn/tokens`
  - **UI Integration**: New "Lend" tab in the main interface alongside Reclaim, Transfer, Burn, Swap, and Auto tabs
  - **Deposit Functionality**: Full deposit functionality with wallet signing - users can click any vault row to open deposit dialog, enter amount, and deposit to earn APY
  - **Withdrawal Support**: Backend endpoints ready for withdraw transactions (UI to be added)
  - **API Integration**: Uses Jupiter Lend REST API endpoints for transaction building with base64-encoded unsigned transactions
  - **Package**: @jup-ag/lend SDK installed for future instruction-based integrations
  - **Program ID**: jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9 (Earn)
  - **Error Handling**: Graceful fallbacks and loading states for network requests
- **Mass Transfer Feature** (October 2025): New functionality to send multiple tokens to a single destination wallet
  - **Jupiter Ultra Holdings API Integration**: Backend endpoint `/api/tokens/holdings/:walletAddress` uses Jupiter Ultra v1 Holdings API
  - **Token Loading**: Fetches all token holdings with metadata (symbol, name, logo) from Jupiter Token List V2 API
  - **Multi-Program Support**: Handles both TOKEN_PROGRAM_ID and TOKEN_2022_PROGRAM_ID tokens
  - **Token Selection UI**: Interactive checkboxes for selecting multiple tokens to transfer
  - **Custom Amount Controls**: Manual input field and quick-select percentage buttons (25%, 50%, 75%, Max) for each token
  - **Amount Validation**: Automatically clamps amounts between 0 and maximum balance
  - **Decimal Precision**: Respects token decimal settings for accurate amount calculations
  - **Automatic ATA Creation**: Creates Associated Token Accounts for destination wallet if they don't exist
  - **Single Transaction**: Combines all selected token transfers into one transaction for efficiency
  - **Destination Validation**: Validates Solana wallet address format before transfer
  - **UI/UX**: Transfer tab with token list, balance display, custom amount controls, destination input, and transfer summary
  - **Platform Fees**: 0.0002 SOL per token goes to platform wallet GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6
  - **Analytics Tracking**: Records each transfer with transaction signature, wallet addresses, token count, and fee amount
  - **Usage Statistics**: Displays total unique users and total transfers completed on the Transfer tab
- **Complete Auto-Claim Feature** (October 2025): Production-ready permit-based automated SOL reclamation system
  - **Multi-Token Support**: Supports BOTH standard SPL tokens (TOKEN_PROGRAM_ID) AND Token Extensions (TOKEN_2022_PROGRAM_ID)
  - **Backend Workers**: 
    - Scanner (60s interval): Monitors active permits, scans wallets for empty accounts from both token programs, creates batched jobs (15 accounts max per tx)
    - Executor (30s interval): Processes pending jobs with correct program IDs, enforces permit validation, records costs/ledger entries, supports dry-run mode
    - Conditional startup via ENABLE_AUTO_CLAIM_WORKERS env var (disabled by default)
  - **Frontend UI**: AutoClaimSection component with permit signing (Ed25519), real-time status, job history, revocation flow, non-custodial security messaging
  - **Database schema**: `auto_claim_permits`, `relayer_jobs`, `relayer_costs` tables with itemsCount/estimatedNet fields
  - **Security**: Ed25519 signature verification, UUID nonce replay protection, timestamp validation, domain binding
  - **Architecture**: Off-chain bot using SetAuthority + CloseAccount (no Anchor program needed), close authority delegation enables offline claims, 85% user payout, relayer pays network fees upfront
  - **Program ID Handling**: Each account stores its owning program ID (SPL or Token-2022) throughout scan→delegate→execute pipeline for correct instruction generation

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
  - Platform fee wallet: `GETyEc6mVeymyH9tyTWxEW7j7thBrqSVFapHGP4Qkfq6` receives SOL reclaim fees
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
- **Mass Transfer**: Send multiple tokens to a single destination wallet in one transaction using Jupiter Holdings API.
- **Statistics Dashboard**: Displays recovery statistics and transaction history.
- **Multi-Wallet Integration**: Supports 8 different wallet types including hardware wallets.
- **Ledger Hardware Support**: Secure cold storage wallet integration with transaction confirmation.
- **Jupiter Ultra Swap Integration**: Advanced token swapping using Jupiter Ultra API with referral fee collection (1% integrator fee, 20% Jupiter fee split).
- **Solana Integration**: Handles RPC interactions for account discovery and transaction submission.
- **Data Persistence**: Stores scan results, transaction records, and user statistics.

### Database Schema
- `users`: User authentication.
- `transaction_records`: Legacy SOL recovery transaction records.
- `transaction_ledger`: Comprehensive ledger for all transaction types (SOL reclaim, token/NFT burns) with source field (manual/auto).
- `token_burn_records`: Detailed token burning records.
- `nft_burn_records`: Detailed NFT burning records.
- `empty_token_accounts`: Discovered empty accounts.
- `scan_results`: Historical wallet scan data.
- `auto_claim_permits`: User authorizations for automatic SOL reclamation (signature, message, nonce, status).
- `relayer_jobs`: Tracks auto-claim job execution (pending, processing, completed, failed states).
- `relayer_costs`: Records network fees spent by relayer and SOL recovered per transaction.

## External Dependencies
- **Solana RPC**: Primary connection to Solana mainnet.
- **Helius API**: Enhanced RPC provider.
- **Jupiter Ultra Swap API**: Advanced DEX aggregator with Juno Liquidity Engine, MEV protection, and proprietary transaction sending.
- **Jupiter Ultra Holdings API**: Token balance aggregation endpoint for wallet holdings with metadata.
- **Jupiter Token List V2 API**: Token metadata provider (symbol, name, logo) for all SPL tokens.
- **Multi-Wallet Support**: Phantom, Backpack, Solflare, Magic Eden, Coinbase, Coin98, Bitget, and Ledger hardware wallets.
- **Ledger Hardware Wallet**: Secure cold storage wallet integration with WebHID support.
- **PostgreSQL**: Primary database.
- **Neon Database**: Serverless PostgreSQL provider.
- **Drizzle Kit**: Database migration and schema management.