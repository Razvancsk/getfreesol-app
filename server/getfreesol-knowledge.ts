// GetFreeSol Knowledge Base for AI Assistant

export const GETFREESOL_KNOWLEDGE = `
# GetFreeSol - Reclaim SOL from Empty Token Accounts

## Official Website
**https://getfreesol.xyz** - The official domain for GetFreeSol platform

## What is GetFreeSol?
GetFreeSol is a comprehensive Solana utility platform that helps users reclaim SOL rent deposits from empty token accounts. When you interact with tokens on Solana, the network requires a small rent deposit (~0.002 SOL per account) to store the account data. These deposits accumulate in empty accounts that no longer hold tokens.

## Core Features

### 1. SOL Reclamation (Main Feature)
- **What it does**: Scans your wallet for empty token accounts and helps you close them to recover the rent deposit
- **How much**: Each empty account holds approximately 0.002 SOL (can vary slightly)
- **Platform fee**: 15% service fee on recovered SOL (users receive 85%)
- **How to use**: 
  1. Connect your Solana wallet (8 wallet types supported)
  2. Click "Scan Wallet" to find empty accounts
  3. Select which accounts to close (or select all)
  4. Confirm the transaction in your wallet
  5. Receive your SOL back (minus the 15% platform fee)

### 2. Token Burning
- **What it does**: Permanently burns unwanted tokens from your wallet
- **Why**: Clean up your wallet from spam tokens or tokens you no longer want
- **How to use**:
  1. Go to the "Burn" tab
  2. Choose "Burn Tokens"
  3. Select the tokens you want to permanently burn
  4. Confirm the transaction

### 3. NFT Burning
- **What it does**: Permanently burns unwanted NFTs from your wallet
- **Why**: Remove spam NFTs or NFTs you no longer want
- **How to use**:
  1. Go to the "Burn" tab
  2. Select "Burn NFTs"
  3. Choose which NFTs to permanently burn
  4. Confirm the transaction

### 4. Referral Program (For Users)
- **Earn commission**: Get 50% of the 15% platform fee from users you refer (7.5% of total recovered)
- **How it works**:
  1. Go to the "Referrals" tab
  2. Create your unique referral code
  3. Share your referral link with others
  4. Earn SOL when people claim using your link
- **Claim earnings**: Your referral earnings accumulate and can be claimed anytime
- **First referral wins**: Once a wallet uses a referral code, that referrer gets credit for all future claims from that wallet

### 5. Developer API Platform (For Developers)
**YES, WE HAVE AN API!** GetFreeSol offers a Jupiter-style Developer API for integrating SOL reclamation into your own applications.

**Key Features:**
- **PDA-Based Fee Collection**: Secure, platform-managed wallets using Solana PDAs (Program Derived Addresses)
- **No Private Key Management**: Developers never handle private keys - the platform manages everything securely using AES-256-GCM encryption
- **Revenue Share**: Developers earn **80% of collected fees**, platform keeps 20%
- **Multi-Token Support**: Supports SOL, USDC, USDT, BONK, JUP, and other tokens
- **Customizable Fees**: Developers can set their fee percentage (0-10%)
- **Automatic Fee Distribution**: Fees automatically accumulate in your PDA wallet

**How to Get Started:**
1. Visit https://getfreesol.xyz
2. Connect your wallet
3. Navigate to the "Developer API" section
4. Create a developer account (requires wallet signature)
5. Receive your unique referral PDA address
6. Access API documentation (gated - requires account creation first)
7. Integrate the API into your application
8. Start earning 80% of fees from your users

**PDA System:**
- Each developer gets a deterministic PDA derived from: [project_pda, developer_wallet]
- This PDA serves as a secure wallet for fee collection
- No need to manage private keys yourself
- Supports multiple token mints with separate token account tracking

### 6. Auto-Claim Feature
- **What it does**: Automated SOL reclamation using permit-based authorization
- **How it works**: Users sign a permit allowing the platform to automatically claim SOL from their empty accounts
- **Supports**: Both standard SPL Token Program and Token-2022 Program
- **Benefit**: Hands-free SOL recovery

### 7. Mass Token Transfer
- **What it does**: Send multiple different tokens to a single destination wallet in one transaction
- **Use case**: Quickly consolidate tokens from multiple wallets or send bulk airdrops
- **How to use**: Select multiple tokens and specify the destination wallet address

### 8. Token Swap (Jupiter Integration)
- **What it does**: Swap tokens using Jupiter's advanced DEX aggregator
- **Features**: Ultra Swap API with Juno Liquidity Engine for best rates
- **Referral Fees**: Platform collects referral fees from swaps
- **How to use**: Select tokens to swap, enter amount, confirm transaction

### 9. Backpack Exchange Integration (View-Only)
- **What it does**: Display borrow/lend markets from Backpack Exchange
- **Markets shown**: Only SOL markets (not all tokens)
- **Visibility**: Only visible to platform wallet (6ZCV6FWis2qxeBWEenCZhf1Ccsxokk9pKzak25zhaHvy)
- **Note**: Users cannot be programmatically created on Backpack (requires manual KYC at backpack.exchange)

### 10. Statistics Dashboard
- **Available to**: All users
- **Shows**: 
  - Total SOL recovered across all users
  - Recent transaction history
  - Top users by SOL recovered
  - Platform performance over different time periods
  - Your personal claiming history

## Supported Wallets (8 Types)
1. **Phantom** - Most popular Solana wallet
2. **Backpack** - Multi-chain wallet
3. **Solflare** - Feature-rich Solana wallet
4. **Magic Eden Wallet** - NFT-focused wallet
5. **Coinbase Wallet** - Self-custody wallet
6. **Coin98** - Multi-chain wallet
7. **Bitget (Bitkeep)** - Exchange wallet
8. **Ledger Hardware Wallet** - Cold storage (most secure)

## Platform Fee Structure
- **SOL Reclamation**: 15% platform fee (users keep 85%)
- **User Referrals**: Referrer gets 50% of the 15% fee = 7.5% of total recovered
- **Developer API**: Developers earn 80% of fees, platform keeps 20%

## Common Questions

**Q: Do you have an API?**
A: **YES!** We have a comprehensive Developer API platform. Developers can integrate SOL reclamation into their own apps and earn 80% of collected fees. Visit https://getfreesol.xyz and go to the Developer API section to create an account and access documentation.

**Q: Is it safe?**
A: Yes, the platform only requests permission to close empty token accounts. You always review and approve each transaction in your wallet. We never ask for private keys or seed phrases.

**Q: How much SOL can I recover?**
A: It depends on how many empty token accounts you have. On average:
- Light users: 0.01-0.05 SOL (5-25 accounts)
- Active users: 0.05-0.2 SOL (25-100 accounts)
- Heavy users: 0.2+ SOL (100+ accounts)

**Q: What is the platform fee?**
A: 15% of the recovered SOL goes to the platform. For example:
- Recover 0.1 SOL → You receive 0.085 SOL, platform keeps 0.015 SOL
- Recover 0.5 SOL → You receive 0.425 SOL, platform keeps 0.075 SOL

**Q: Can I choose which accounts to close?**
A: Yes! After scanning, you can select specific accounts or close all empty accounts at once.

**Q: What if the transaction fails?**
A: Common reasons for failures:
- Insufficient SOL for transaction fees (~0.00001 SOL needed)
- Rejected transaction in wallet
- Network congestion (Solana RPC issues)
- Account is not actually empty

Solutions:
1. Make sure you have at least 0.001 SOL for transaction fees
2. Try reducing the number of accounts to close at once
3. Check if your wallet app is working properly
4. Wait a few minutes and try again
5. Try a different RPC endpoint (platform uses Helius API)

**Q: How do referrals work?**
A: When someone uses your referral code:
1. They must be a first-time user
2. You earn 50% of the 15% platform fee (7.5% total)
3. Earnings are tracked in your referral dashboard
4. You can claim your earnings anytime
5. First referral wins - if they used your code once, all future claims credit you

**Q: What wallets are supported?**
A: We support 8 major Solana wallets including Phantom, Backpack, Solflare, Magic Eden, Coinbase, Coin98, Bitget, and Ledger hardware wallets.

**Q: Can I burn NFTs?**
A: Yes! Go to the "Burn" tab, select "Burn NFTs", and choose which NFTs to permanently burn from your wallet.

**Q: Can I use this on mobile?**
A: Yes! The website works on mobile browsers. Use a mobile wallet like Phantom Mobile or Solflare Mobile.

**Q: How long does it take to receive my SOL?**
A: Immediately! Once the transaction confirms on Solana (usually 1-2 seconds), you'll see the SOL in your wallet. The platform fee is automatically deducted.

**Q: Can I recover SOL from Token-2022 accounts?**
A: Yes! The platform supports both standard SPL Token Program and the new Token-2022 Program.

**Q: What is a PDA wallet?**
A: PDA (Program Derived Address) is a special type of Solana account used by our Developer API. It's a secure, deterministic wallet address that doesn't require private key management. Perfect for developers who want to collect fees without handling private keys.

## Troubleshooting

**Issue: "Wallet not connected"**
- Solution: Click the "Connect Wallet" button and select your wallet provider. Make sure your wallet extension is installed and unlocked.

**Issue: "Scan shows 0 empty accounts"**
- Solution: This means you don't have any empty token accounts. You may have already claimed them or never interacted with many tokens.

**Issue: "Transaction failed"**
- Solutions:
  1. Make sure you have at least 0.001 SOL for transaction fees
  2. Try reducing the number of accounts to close at once
  3. Check if your wallet app is working properly
  4. Wait a few minutes and try again
  5. Check Solana network status

**Issue: "Can't see my referral earnings"**
- Solution: Make sure you've created a referral code in the "Referrals" tab. Earnings only accumulate when users complete transactions using your code.

**Issue: "My wallet shows different balance"**
- Solution: Wait a few seconds for your wallet to refresh. Solana transactions are fast but may take a moment to show in your wallet UI.

**Issue: "Can't create developer account"**
- Solution: Make sure you've connected your wallet and signed the authorization message. The API documentation is gated and requires account creation first.

**Issue: "Where is my API key?"**
- Solution: We use a PDA-based system - you don't need an API key. Your developer wallet address is used for authentication, and fees are collected in your PDA wallet automatically.

## Discord Support Commands

Use \`/scan <wallet_address>\` to check how much SOL a wallet can reclaim without connecting to the website.

## X (Twitter) Integration

The platform has automated X (Twitter) posting that announces when users claim significant amounts of SOL (NET amount >= 0.10 SOL after the 15% platform fee). Posts include custom purple gradient card banners with GetFreeSol branding.

## Website & Social
- **Website**: https://getfreesol.xyz
- **Domain**: getfreesol.xyz (this is the ONLY official domain)

## Important Security Notes
- **Never share your private keys or seed phrase** with anyone
- Always verify transactions in your wallet before approving
- The platform never asks for your private keys
- Transactions are executed directly from your wallet
- All token accounts must be completely empty (0 balance) to be closed
- The platform uses secure WebSocket connections and encrypted API calls
- Developer API uses AES-256-GCM encryption for private key storage

## Technical Details (For Developers)
- **Blockchain**: Solana mainnet
- **RPC Provider**: Helius API (with fallbacks)
- **Token Programs**: SPL Token Program + Token-2022 Program
- **Swap Integration**: Jupiter Ultra Swap API
- **Database**: PostgreSQL with Drizzle ORM
- **Frontend**: React 18 + TypeScript
- **Backend**: Node.js + Express
- **Encryption**: AES-256-GCM for sensitive data
- **Authentication**: Wallet signature-based (no passwords needed)
`;
