use anchor_lang::prelude::*;
use crate::state::Config;

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = Config::LEN,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeConfig>,
    platform_wallet: Pubkey,
    platform_fee_bps: u16,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    
    config.platform_wallet = platform_wallet;
    config.platform_fee_bps = platform_fee_bps;
    config.authority = ctx.accounts.authority.key();
    config.bump = ctx.bumps.config;
    
    Ok(())
}
