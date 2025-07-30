# Get Your Sol Application

## Overview

This is a full-stack TypeScript application called "Get Your Sol" that helps Solana users reclaim SOL from empty token accounts. The application consists of a React frontend built with Vite and a Node.js Express backend, using PostgreSQL for data persistence. It integrates with the Solana blockchain to scan wallets, identify empty token accounts, and facilitate the reclamation of rent deposits.

## User Preferences

Preferred communication style: Simple, everyday language.
NFT Display: Only show regular NFTs that can be burned for SOL recovery. Do not show compressed NFTs (cNFTs) as they cannot be burned for SOL.

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
- **transaction_records**: Records of completed SOL recovery transactions
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