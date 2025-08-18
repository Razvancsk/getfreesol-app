# Get Your SOL Back! Application

## Overview
"Get Your SOL Back!" is a full-stack TypeScript application designed to help Solana users reclaim SOL from empty token accounts. It features a React frontend and a Node.js Express backend with PostgreSQL, integrating directly with the Solana blockchain to identify empty accounts and facilitate rent deposit reclamation. The project supports 8 different wallet types including hardware wallets (Ledger) for maximum security and accessibility. The application aims to provide a seamless and efficient way for users to recover SOL previously locked in dormant accounts.

## Recent Updates (January 2025)
- **Deployment Fixes**: Updated server configuration for production deployment stability
- **Error Handling**: Enhanced server startup error handling and logging
- **Port Configuration**: Fixed server listening configuration for deployment environments
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
- **Multi-Wallet Support**: Phantom, Backpack, Solflare, Magic Eden, Coinbase, Coin98, Bitget, and Ledger hardware wallets.
- **Ledger Hardware Wallet**: Secure cold storage wallet integration with WebHID support.
- **PostgreSQL**: Primary database.
- **Neon Database**: Serverless PostgreSQL provider.
- **Drizzle Kit**: Database migration and schema management.