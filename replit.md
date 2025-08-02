# Get Your Sol Application

## Overview

This is a full-stack TypeScript application called "Get Your Sol" that helps Solana users reclaim SOL from empty token accounts. The application consists of a React frontend built with Vite and a Node.js Express backend, using PostgreSQL for data persistence. It integrates with the Solana blockchain to scan wallets, identify empty token accounts, and facilitate the reclamation of rent deposits.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **UI Library**: Radix UI components with shadcn/ui styling system
- **Styling**: Tailwind CSS with custom CSS variables for theming
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Blockchain Integration**: Solana Web3.js for wallet interactions

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM for type-safe database operations
- **API Design**: RESTful API with JSON responses
- **Session Management**: Express sessions with PostgreSQL store
- **Development**: tsx for TypeScript execution in development

### Key Components

#### Frontend Components
- **Wallet Scanner**: Scans Solana wallets for empty token accounts
- **Claim Interface**: Allows users to reclaim SOL from empty accounts
- **Statistics Dashboard**: Shows recovery statistics and transaction history
- **UI Components**: Complete shadcn/ui component library including forms, dialogs, toasts, and data tables

#### Backend Services
- **Solana Integration**: Direct integration with Solana RPC endpoints (Helius API preferred)
- **Account Scanning**: Identifies token accounts with zero balance that can be closed
- **Transaction Processing**: Handles the creation and submission of account closing transactions
- **Data Persistence**: Stores scan results, transaction records, and user statistics

#### Database Schema
- **users**: User authentication and profile data
- **transaction_records**: Legacy records of completed SOL recovery transactions
- **transaction_ledger**: Comprehensive ledger for all transaction types (SOL reclaim, token burns, NFT burns)
- **token_burn_records**: Detailed records of individual token burning transactions
- **nft_burn_records**: Detailed records of individual NFT burning transactions
- **empty_token_accounts**: Discovered empty accounts with metadata
- **scan_results**: Historical wallet scan data with aggregate statistics

## Data Flow

1. **Wallet Connection**: User connects Phantom wallet through browser extension
2. **Account Scanning**: Backend queries Solana RPC to find all token accounts for the wallet
3. **Empty Account Detection**: Filters accounts with zero balance that can be closed for rent recovery
4. **Database Storage**: Scan results and empty accounts are persisted to PostgreSQL
5. **Transaction Creation**: Backend creates unsigned transactions to close empty accounts
6. **User Signing**: Frontend prompts user to sign transactions via wallet
7. **Transaction Submission**: Signed transactions are broadcast to Solana network
8. **Result Tracking**: Transaction outcomes are recorded for statistics and history

## External Dependencies

### Blockchain Infrastructure
- **Solana RPC**: Primary connection to Solana mainnet
- **Helius API**: Preferred RPC provider for enhanced reliability and features
- **Phantom Wallet**: Browser extension for transaction signing and wallet management

### Database
- **PostgreSQL**: Primary database (configured via DATABASE_URL environment variable)
- **Neon Database**: Serverless PostgreSQL provider via @neondatabase/serverless

### Development Tools
- **Replit**: Development environment with live reload and error overlay
- **Drizzle Kit**: Database migration and schema management
- **ESBuild**: Fast JavaScript bundler for production builds

## Deployment Strategy

### Development Environment
- **Hot Reload**: Vite dev server with HMR for frontend changes
- **TypeScript Compilation**: Real-time type checking and compilation
- **Database Migrations**: Drizzle push for schema synchronization
- **Environment Variables**: DATABASE_URL and optional HELIUS_API_KEY

### Production Build
- **Frontend**: Vite builds optimized static assets to dist/public
- **Backend**: ESBuild bundles server code to dist/index.js
- **Database**: PostgreSQL connection via environment configuration
- **Process Management**: Node.js process serving both API and static files

### Key Architectural Decisions

1. **Monorepo Structure**: Frontend (client/), backend (server/), and shared code (shared/) in single repository for easier development and type sharing

2. **Type Safety**: Full TypeScript coverage with shared schema definitions between frontend and backend using Drizzle Zod schemas

3. **Database Choice**: PostgreSQL with Drizzle ORM provides reliable ACID transactions for financial data and excellent TypeScript integration

4. **Blockchain Integration**: Direct RPC calls rather than heavy SDK dependencies keeps the application lightweight while maintaining full Solana functionality

5. **Component Architecture**: Radix UI primitives with Tailwind styling provides accessible, customizable components without reinventing UI patterns

6. **State Management**: TanStack Query eliminates the need for complex state management while providing excellent caching and synchronization with the server

7. **Development Experience**: Vite + tsx provides fast iteration cycles and excellent TypeScript support for both frontend and backend development

## Recent Changes

### February 1, 2025 - Jupiter Terminal Integration and Real Token Search Modal
- **Successfully implemented real Jupiter token search modal** using authentic Jupiter token database
- **Token buttons now trigger custom purple search modal** with real Jupiter token data
- **Real token search functionality working** - displays authentic logos, symbols, names, and addresses
- **Custom purple design maintained** while using Jupiter's official token database via backend API
- **Search works with real tokens** like WIF, SOL, USDC, WBTC with proper logo display
- **Purple fallback design** for tokens without logos (showing first letter in purple circle)
- **Added Jupiter Terminal CSS variables** for custom color theming with lime green primary (199, 242, 132)
- **Fixed Jupiter Terminal initialization** with proper retry logic and error handling
- **Set Jupiter Terminal to exact 390x577 pixel dimensions** as requested by user
- **Enhanced wallet synchronization** between app and Jupiter Terminal
- **Fixed database connection issues** with proper WebSocket configuration for Neon database
- **Jupiter Terminal now properly recognizes connected wallet** and allows successful swaps

### February 2, 2025 - Complete Solana Wallet Adapter Migration and Enhanced Multi-Wallet Support
- **Successfully migrated from custom wallet connection system** to official @solana/wallet-adapter-react
- **Removed all Solflare wallet references** and legacy wallet connection code
- **Implemented proper SolanaProvider** with ConnectionProvider and WalletProvider setup
- **Added Magic Eden wallet support** - automatically detected by wallet adapter
- **Enhanced Trust Wallet integration** with direct connection support and deep linking
- **Updated all wallet interactions** to use PublicKey objects with proper .toString() conversions
- **Fixed publicKey.slice errors** by converting PublicKey objects to strings for UI display
- **Enhanced error handling** with WalletError support in provider
- **Wallet adapter now supports**: Phantom, Magic Eden, Trust Wallet, Coin98, and Solflare
- **Implemented comprehensive wallet diagnostics** with detailed logging and error handling
- **Added robust signTransaction wrapper** with fallback mechanism between wallets
- **Enhanced wallet detection** with detailed provider capability checks for all supported wallets
- **Created proper TypeScript definitions** for Magic Eden and Trust Wallet window interfaces
- **Added automatic fallback logic** when wallet signing fails, maintains transaction reliability
- **Improved wallet connection errors** - automatically resets selection and shows modal when unavailable wallets are clicked
- **Added Trust Wallet deep linking** for mobile devices with app store fallbacks

### January 30, 2025 - Comprehensive Transaction Ledger Implementation  
- **Replaced memory storage with PostgreSQL database** for permanent transaction persistence
- **Created comprehensive transaction ledger system** that logs ALL operations:
  - SOL reclaim transactions (closing empty token accounts)
  - Token burning transactions with detailed metadata
  - NFT burning transactions with collection data
- **Added detailed transaction logging tables**:
  - `transaction_ledger`: Master ledger for all transaction types
  - `token_burn_records`: Individual token burn details
  - `nft_burn_records`: Individual NFT burn details
- **Implemented 15% fee system** with automatic transfers to fee collector wallet
- **Enhanced API endpoints** with comprehensive logging:
  - `/api/tokens/record-burn-success` - Records successful token burns
  - `/api/nfts/record-burn-success` - Records successful NFT burns  
  - `/api/transactions/history` - Complete transaction history
  - `/api/transactions/stats` - Enhanced statistics across all operation types
- **Database migration completed** using Drizzle ORM push for schema deployment