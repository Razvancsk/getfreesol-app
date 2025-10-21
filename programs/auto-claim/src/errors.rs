use anchor_lang::prelude::*;

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
    #[msg("Too many accounts (max 15 per tx)")]
    TooManyAccounts,
    #[msg("Invalid platform wallet")]
    InvalidPlatformWallet,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}
