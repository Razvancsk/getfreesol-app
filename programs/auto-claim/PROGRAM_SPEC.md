# Auto-Claim Anchor Program Specification

## Overview
This Solana program enables users to authorize a backend relayer to automatically reclaim SOL from their empty token accounts while they're offline. The program enforces a 15% platform fee and ensures non-custodial operation.

## Key Features
- **One-time Authorization**: User signs once to grant permission
- **Offline Operation**: Claims happen even when user is offline
- **Non-Custodial**: User never gives up private key
- **Automatic Fee Split**: 15% to platform, 85% to user
- **Revocable**: User can disable anytime

## Program Accounts

### 1. Permit PDA
**Seeds**: `["permit", user_wallet_pubkey]`

**Fields**:
- `authority`: User's wallet public key
- `scopes`: Vec<String> - permissions granted (e.g., ["claim_empty_accounts"])
- `version`: u8 - permit version for upgrades
- `created_at`: i64 - Unix timestamp
- `is_active`: bool - can be revoked
- `bump`: u8 - PDA bump seed

### 2. Platform Config PDA
**Seeds**: `["config"]`

**Fields**:
- `platform_wallet`: Pubkey - receives 15% fees (GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT)
- `platform_fee_bps`: u16 - 1500 (15%)
- `authority`: Pubkey - program upgrade authority
- `bump`: u8

## Instructions

### 1. Initialize Config (Admin Only)
```rust
pub fn initialize_config(
    ctx: Context<InitializeConfig>,
    platform_wallet: Pubkey,
    platform_fee_bps: u16
) -> Result<()>
```

**Accounts**:
- `config` - Platform config PDA (writable, init)
- `authority` - Program authority (signer)
- `system_program`

### 2. Initialize Permit
```rust
pub fn initialize_permit(
    ctx: Context<InitializePermit>,
    scopes: Vec<String>
) -> Result<()>
```

**Accounts**:
- `permit` - Permit PDA (writable, init)
- `user` - User wallet (signer, payer)
- `system_program`

**Logic**:
- Create PDA with seeds `["permit", user.key]`
- Set user as authority
- Store scopes
- Set is_active = true

### 3. Claim Empty Accounts (Relayer Can Call)
```rust
pub fn claim_empty_accounts(
    ctx: Context<ClaimEmptyAccounts>,
    accounts_to_close: Vec<Pubkey>
) -> Result<()>
```

**Accounts**:
- `permit` - User's permit PDA (readable)
- `config` - Platform config PDA (readable)
- `user_wallet` - User's main wallet (writable, receives 85%)
- `platform_wallet` - Platform wallet (writable, receives 15%)
- `relayer` - Transaction fee payer (signer)
- Remaining accounts: Token accounts to close (writable)
- `token_program` - SPL Token program
- `system_program`

**Logic**:
1. Verify permit.is_active == true
2. Verify "claim_empty_accounts" in permit.scopes
3. For each token account:
   - Verify owner matches permit.authority
   - Verify balance == 0
   - **Token-2022**: Close account if close_authority == permit PDA
   - Calculate rent lamports recovered
4. Calculate fees: 15% to platform, 85% to user
5. Transfer SOL accordingly
6. Emit ClaimEvent

**Security Checks**:
- Rate limit: Max 20 accounts per transaction
- Verify each account belongs to permit.authority
- Verify close authority for Token-2022
- Atomic fee split (all or nothing)

### 4. Revoke Permit
```rust
pub fn revoke_permit(
    ctx: Context<RevokePermit>
) -> Result<()>
```

**Accounts**:
- `permit` - Permit PDA (writable)
- `user` - User wallet (signer, must match permit.authority)

**Logic**:
- Set permit.is_active = false
- Backend will stop processing this wallet

### 5. Set Close Authority (Setup for Token-2022)
```rust
pub fn set_close_authority(
    ctx: Context<SetCloseAuthority>
) -> Result<()>
```

**Accounts**:
- `permit` - User's permit PDA (readable)
- `user` - User wallet (signer)
- `token_account` - Token-2022 account (writable)
- `token_program` - SPL Token-2022 program

**Logic**:
- User calls this to set close_authority to permit PDA
- Allows relayer to close accounts via CPI

## Events

### ClaimEvent
```rust
pub struct ClaimEvent {
    pub user: Pubkey,
    pub accounts_closed: u8,
    pub total_recovered_lamports: u64,
    pub platform_fee_lamports: u64,
    pub user_net_lamports: u64,
    pub timestamp: i64,
}
```

## Error Codes
```rust
#[error_code]
pub enum AutoClaimError {
    #[msg("Permit is not active")]
    PermitInactive,
    #[msg("Insufficient scope permissions")]
    InsufficientScope,
    #[msg("Account does not belong to user")]
    InvalidAccountOwner,
    #[msg("Account has non-zero balance")]
    NonZeroBalance,
    #[msg("Close authority mismatch")]
    InvalidCloseAuthority,
    #[msg("Too many accounts (max 20 per tx)")]
    TooManyAccounts,
}
```

## Program Flow

### First-Time Setup (User)
1. User clicks "Enable Auto-Claim" on website
2. Frontend calls `initialize_permit` instruction
3. User signs transaction (creates permit PDA)
4. **For Token-2022 accounts**: User calls `set_close_authority` to delegate to permit PDA
5. Frontend calls API to store permit signature in database

### Backend Relayer Operation
1. Cron job queries database for wallets with active permits
2. For each wallet, scan for empty token accounts
3. Build transaction with `claim_empty_accounts` instruction
4. Relayer pays transaction fee
5. Program enforces 15% fee split
6. Write results to database (transaction_ledger, relayer_costs)

### User Revocation
1. User clicks "Disable Auto-Claim"
2. Frontend calls `revoke_permit` instruction
3. User signs transaction
4. Frontend calls API to update database
5. Backend stops processing this wallet

## Token Support

### ✅ Full Auto-Claim (Offline)
- **Token-2022** accounts with close authority delegated to permit PDA
- **NFTs** with burn delegation to permit PDA

### ⚠️ Manual Claim Only (Online)
- **Legacy SPL tokens** (require owner signature to close)
- Solution: Backend can sponsor fees, but user must be online to sign

## Security Considerations

1. **Non-Custodial**: Permit PDA can only close accounts with 0 balance and proper delegation
2. **Atomic Operations**: Fee split happens in single transaction (all or nothing)
3. **Rate Limiting**: Max 20 accounts per transaction (CU limits)
4. **Revocation**: User can disable anytime
5. **Scope Enforcement**: Program checks permit scopes before action
6. **Audit Trail**: All operations emit events

## Platform Configuration
- Platform Wallet: `GetxnGXDwWfGwMmNweyCexiY3Z8KRWJjs6qviWv1uqkT`
- Platform Fee: 15% (1500 basis points)
- User Net: 85% (8500 basis points)

## Development Checklist
- [ ] Implement all instructions in Anchor
- [ ] Add comprehensive tests
- [ ] Security audit for PDA derivation
- [ ] Test fee calculation edge cases
- [ ] Deploy to devnet
- [ ] Integration test with backend relayer
- [ ] Deploy to mainnet
- [ ] Update frontend with program ID
