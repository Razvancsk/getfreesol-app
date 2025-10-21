use anchor_lang::prelude::*;
use crate::state::Permit;

#[derive(Accounts)]
pub struct InitializePermit<'info> {
    #[account(
        init,
        payer = user,
        space = Permit::LEN,
        seeds = [b"permit", user.key().as_ref()],
        bump
    )]
    pub permit: Account<'info, Permit>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializePermit>,
    scopes: Vec<String>,
) -> Result<()> {
    let permit = &mut ctx.accounts.permit;
    
    permit.authority = ctx.accounts.user.key();
    permit.scopes = scopes;
    permit.version = 1;
    permit.created_at = Clock::get()?.unix_timestamp;
    permit.is_active = true;
    permit.bump = ctx.bumps.permit;
    
    Ok(())
}
