use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, CloseAccount};

declare_id!("AutoC1aimProgram11111111111111111111111111");

#[program]
pub mod auto_claim_program {
    use super::*;

    /// Initialize permit for a wallet (one-time setup)
    pub fn initialize_permit(
        ctx: Context<InitializePermit>,
        permit_signature: [u8; 64],
        permit_message: Vec<u8>,
        nonce: String,
    ) -> Result<()> {
        let permit = &mut ctx.accounts.permit;
        permit.owner = ctx.accounts.owner.key();
        permit.permit_signature = permit_signature;
        permit.permit_message = permit_message;
        permit.nonce = nonce;
        permit.is_active = true;
        permit.created_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    /// Close empty token account (bot calls this - NO user signature!)
    pub fn close_empty_account(
        ctx: Context<CloseEmptyAccount>,
        platform_fee_bps: u16,
    ) -> Result<()> {
        let permit = &ctx.accounts.permit;
        
        // Verify permit is active
        require!(permit.is_active, ErrorCode::PermitNotActive);
        require!(permit.owner == ctx.accounts.owner.key(), ErrorCode::InvalidOwner);
        
        // Verify token account is empty
        let token_account = &ctx.accounts.token_account;
        require!(token_account.amount == 0, ErrorCode::AccountNotEmpty);
        require!(token_account.owner == permit.owner, ErrorCode::InvalidTokenOwner);
        
        // Get rent to recover
        let rent_lamports = ctx.accounts.token_account.to_account_info().lamports();
        
        // Calculate platform fee
        let platform_fee = (rent_lamports as u128 * platform_fee_bps as u128 / 10000) as u64;
        let user_amount = rent_lamports - platform_fee;
        
        // Close account - rent goes to relayer temporarily
        let cpi_accounts = CloseAccount {
            account: ctx.accounts.token_account.to_account_info(),
            destination: ctx.accounts.relayer.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        // THIS IS THE KEY: Program closes account without user signature!
        token::close_account(cpi_ctx)?;
        
        // Transfer user's share from relayer to owner
        **ctx.accounts.relayer.to_account_info().try_borrow_mut_lamports()? -= user_amount;
        **ctx.accounts.owner.to_account_info().try_borrow_mut_lamports()? += user_amount;
        
        // Platform fee stays with relayer
        
        Ok(())
    }

    /// Revoke permit
    pub fn revoke_permit(ctx: Context<RevokePermit>) -> Result<()> {
        let permit = &mut ctx.accounts.permit;
        require!(permit.owner == ctx.accounts.owner.key(), ErrorCode::InvalidOwner);
        permit.is_active = false;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializePermit<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + Permit::SIZE,
        seeds = [b"permit", owner.key().as_ref()],
        bump
    )]
    pub permit: Account<'info, Permit>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseEmptyAccount<'info> {
    #[account(
        seeds = [b"permit", owner.key().as_ref()],
        bump
    )]
    pub permit: Account<'info, Permit>,
    
    /// CHECK: Owner wallet - doesn't need to sign (program has authority!)
    #[account(mut)]
    pub owner: AccountInfo<'info>,
    
    #[account(mut)]
    pub token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub relayer: Signer<'info>,
    
    /// CHECK: Platform fee wallet
    #[account(mut)]
    pub platform_wallet: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RevokePermit<'info> {
    #[account(
        mut,
        seeds = [b"permit", owner.key().as_ref()],
        bump
    )]
    pub permit: Account<'info, Permit>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[account]
pub struct Permit {
    pub owner: Pubkey,
    pub permit_signature: [u8; 64],
    pub permit_message: Vec<u8>,
    pub nonce: String,
    pub is_active: bool,
    pub created_at: i64,
}

impl Permit {
    pub const SIZE: usize = 32 + 64 + 4 + 256 + 4 + 32 + 1 + 8;
}

#[error_code]
pub enum ErrorCode {
    #[msg("Permit is not active")]
    PermitNotActive,
    #[msg("Invalid owner")]
    InvalidOwner,
    #[msg("Token account is not empty")]
    AccountNotEmpty,
    #[msg("Invalid token account owner")]
    InvalidTokenOwner,
}
