use anchor_lang::prelude::*;

#[account]
pub struct Config {
    pub platform_wallet: Pubkey,
    pub platform_fee_bps: u16,
    pub authority: Pubkey,
    pub bump: u8,
}

impl Config {
    pub const LEN: usize = 8 + 32 + 2 + 32 + 1;
}

#[account]
pub struct Permit {
    pub authority: Pubkey,
    pub scopes: Vec<String>,
    pub version: u8,
    pub created_at: i64,
    pub is_active: bool,
    pub bump: u8,
}

impl Permit {
    pub const MAX_SCOPES: usize = 5;
    pub const MAX_SCOPE_LEN: usize = 32;
    pub const LEN: usize = 8 + 32 + (4 + Self::MAX_SCOPES * Self::MAX_SCOPE_LEN) + 1 + 8 + 1 + 1;
}

#[event]
pub struct ClaimEvent {
    pub user: Pubkey,
    pub accounts_closed: u8,
    pub total_recovered_lamports: u64,
    pub platform_fee_lamports: u64,
    pub user_net_lamports: u64,
    pub timestamp: i64,
}
