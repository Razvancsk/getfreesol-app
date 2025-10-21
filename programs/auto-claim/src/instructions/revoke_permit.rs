use anchor_lang::prelude::*;
use crate::state::Permit;
use crate::errors::AutoClaimError;

#[derive(Accounts)]
pub struct RevokePermit<'info> {
    #[account(
        mut,
        seeds = [b"permit", user.key().as_ref()],
        bump = permit.bump,
        constraint = permit.authority == user.key() @ AutoClaimError::InvalidAccountOwner,
    )]
    pub permit: Account<'info, Permit>,
    
    pub user: Signer<'info>,
}

pub fn handler(ctx: Context<RevokePermit>) -> Result<()> {
    let permit = &mut ctx.accounts.permit;
    permit.is_active = false;
    Ok(())
}
