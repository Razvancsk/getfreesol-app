// GetFreeSol Knowledge Base for AI Assistant

export const GETFREESOL_KNOWLEDGE = `
# GetFreeSol - Reclaim SOL from Empty Token Accounts

## What is GetFreeSol?
GetFreeSol is a platform that helps Solana users reclaim SOL rent deposits from empty token accounts. When you interact with tokens on Solana, the network requires a small rent deposit (~0.002 SOL per account) to store the account data. These deposits accumulate in empty accounts that no longer hold tokens.

## Core Features

### 1. SOL Reclamation
- **What it does**: Scans your wallet for empty token accounts and helps you close them to recover the rent deposit
- **How much**: Each empty account holds approximately 0.002 SOL (can vary slightly)
- **Platform fee**: 15% service fee on recovered SOL
- **How to use**: 
  1. Connect your Solana wallet (Phantom, Backpack, Solflare, etc.)
  2. Click "Scan Wallet" to find empty accounts
  3. Select which accounts to close
  4. Confirm the transaction
  5. Receive your SOL back (minus the 15% fee)

### 2. Token Burning
- **What it does**: Permanently burns unwanted tokens and NFTs
- **Why**: Clean up your wallet from spam tokens or unwanted NFTs
- **How to use**:
  1. Go to the "Burn" tab
  2. Choose "Burn Tokens" or "Burn NFTs"
  3. Select the tokens/NFTs you want to burn
  4. Confirm the transaction

### 3. Referral Program
- **Earn commission**: Get 50% of the platform fee from users you refer
- **How it works**:
  1. Go to the "Referrals" tab
  2. Create your unique referral code
  3. Share your referral link
  4. Earn SOL when people use your link
- **Claim earnings**: Your referral earnings accumulate and can be claimed anytime

### 4. Statistics Dashboard (Platform Wallet Only)
- View total SOL recovered across all users
- See recent transaction history
- Track top users by SOL recovered
- Monitor platform performance over different time periods

## Supported Wallets
- Phantom
- Backpack
- Solflare
- Magic Eden
- Coinbase Wallet
- Coin98
- Bitget (Bitkeep)
- Ledger Hardware Wallet

## Common Questions

**Q: Is it safe?**
A: Yes, the platform only requests permission to close empty token accounts. You always review and approve each transaction in your wallet.

**Q: How much SOL can I recover?**
A: It depends on how many empty token accounts you have. On average, users recover 0.01-0.05 SOL, but some users have 100+ empty accounts worth 0.2+ SOL.

**Q: What is the platform fee?**
A: 15% of the recovered SOL goes to the platform. For example, if you recover 0.1 SOL, you'll receive 0.085 SOL and the platform keeps 0.015 SOL.

**Q: Can I choose which accounts to close?**
A: Yes! After scanning, you can select specific accounts or close all empty accounts at once.

**Q: What if the transaction fails?**
A: Common reasons for failures:
- Insufficient SOL for transaction fees (~0.00001 SOL needed)
- Rejected transaction in wallet
- Network congestion
Simply try again, and if issues persist, check your wallet's SOL balance.

**Q: How do referrals work?**
A: When someone uses your referral code:
1. They must be a first-time user
2. You earn 50% of the 15% platform fee
3. Earnings are tracked in your referral dashboard
4. You can claim your earnings anytime

**Q: What wallets are supported?**
A: We support 8 major Solana wallets including Phantom, Backpack, Solflare, Magic Eden, Coinbase, Coin98, Bitget, and Ledger hardware wallets.

**Q: Can I burn NFTs?**
A: Yes! Go to the "Burn" tab, select "Burn NFTs", and choose which NFTs to permanently burn from your wallet.

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

**Issue: "Can't see my referral earnings"**
- Solution: Make sure you've created a referral code in the "Referrals" tab. Earnings only accumulate when users complete transactions using your code.

**Issue: "My wallet shows different balance"**
- Solution: Wait a few seconds for your wallet to refresh. Solana transactions are fast but may take a moment to show in your wallet UI.

## Discord Support Commands

Use \`/scan <wallet_address>\` to check how much SOL a wallet can reclaim without connecting to the website.

## Website
Visit https://getfreesol.com to start reclaiming your SOL!

## Important Notes
- Never share your private keys or seed phrase
- Always verify transactions in your wallet before approving
- The platform never asks for your private keys
- Transactions are executed directly from your wallet
- All token accounts must be completely empty (0 balance) to be closed
`;
