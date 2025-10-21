use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, SetAuthority, Token2022};
use anchor_spl::token_interface::TokenAccount;
use spl_token_2022::instruction::AuthorityType;
use crate::state::Permit;

#[derive(Accounts)]
pub struct SetCloseAuthority<'info> {
    #[account(
        seeds = [b"permit", user.key().as_ref()],
        bump = permit.bump,
    )]
    pub permit: Account<'info, Permit>,
    
    pub user: Signer<'info>,
    
    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<SetCloseAuthority>) -> Result<()> {
    let set_authority_accounts = SetAuthority {
        account_or_mint: ctx.accounts.token_account.to_account_info(),
        current_authority: ctx.accounts.user.to_account_info(),
    };
    
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        set_authority_accounts,
    );
    
    token_2022::set_authority(
        cpi_ctx,
        AuthorityType::CloseAccount,
        Some(ctx.accounts.permit.key()),
    )?;
    
    Ok(())
}
