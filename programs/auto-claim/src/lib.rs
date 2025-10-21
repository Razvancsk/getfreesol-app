use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022, CloseAccount, SetAuthority};
use anchor_spl::token_interface::{Mint, TokenAccount};
use spl_token_2022::instruction::AuthorityType;

pub mod state;
pub mod instructions;
pub mod errors;

use state::*;
use instructions::*;
use errors::*;

declare_id!("TEMP1111111111111111111111111111111111111111");

#[program]
pub mod auto_claim {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        platform_wallet: Pubkey,
        platform_fee_bps: u16,
    ) -> Result<()> {
        instructions::initialize_config::handler(ctx, platform_wallet, platform_fee_bps)
    }

    pub fn initialize_permit(
        ctx: Context<InitializePermit>,
        scopes: Vec<String>,
    ) -> Result<()> {
        instructions::initialize_permit::handler(ctx, scopes)
    }

    pub fn claim_empty_accounts(
        ctx: Context<ClaimEmptyAccounts>,
    ) -> Result<()> {
        instructions::claim_empty_accounts::handler(ctx)
    }

    pub fn revoke_permit(ctx: Context<RevokePermit>) -> Result<()> {
        instructions::revoke_permit::handler(ctx)
    }

    pub fn set_close_authority(ctx: Context<SetCloseAuthority>) -> Result<()> {
        instructions::set_close_authority::handler(ctx)
    }
}
