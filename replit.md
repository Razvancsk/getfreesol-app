# Get Your SOL Back! Application

## Overview
"Get Your SOL Back!" is a full-stack TypeScript application designed to help Solana users reclaim SOL from empty token accounts. It features a React frontend and a Node.js Express backend with PostgreSQL, integrating directly with the Solana blockchain to identify empty accounts and facilitate rent deposit reclamation. The project aims to provide a seamless and efficient way for users to recover SOL previously locked in dormant accounts.

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
- **Phantom Wallet**: Browser extension for transaction signing.
- **PostgreSQL**: Primary database.
- **Neon Database**: Serverless PostgreSQL provider.
- **Drizzle Kit**: Database migration and schema management.