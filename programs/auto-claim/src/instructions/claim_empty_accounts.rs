use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use anchor_spl::token_2022::{self, CloseAccount, Token2022};
use anchor_spl::token_interface::TokenAccount;
use crate::state::{Config, Permit, ClaimEvent};
use crate::errors::AutoClaimError;

#[derive(Accounts)]
pub struct ClaimEmptyAccounts<'info> {
    #[account(
        seeds = [b"permit", user_wallet.key().as_ref()],
        bump = permit.bump,
        constraint = permit.is_active @ AutoClaimError::PermitInactive,
        constraint = permit.authority == user_wallet.key() @ AutoClaimError::InvalidAccountOwner,
    )]
    pub permit: Account<'info, Permit>,
    
    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,
    
    #[account(mut)]
    pub user_wallet: SystemAccount<'info>,
    
    #[account(
        mut,
        constraint = platform_wallet.key() == config.platform_wallet @ AutoClaimError::InvalidPlatformWallet,
    )]
    pub platform_wallet: SystemAccount<'info>,
    
    #[account(mut)]
    pub relayer: Signer<'info>,
    
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ClaimEmptyAccounts>) -> Result<()> {
    let permit = &ctx.accounts.permit;
    
    require!(
        permit.scopes.contains(&"claim_empty_accounts".to_string()),
        AutoClaimError::InsufficientScope
    );
    
    let remaining_accounts = &ctx.remaining_accounts;
    require!(
        remaining_accounts.len() <= 15,
        AutoClaimError::TooManyAccounts
    );
    
    let mut total_recovered = 0u64;
    let mut accounts_closed = 0u8;
    
    let permit_key = permit.key();
    let bump = permit.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        b"permit",
        permit.authority.as_ref(),
        &[bump],
    ]];
    
    for account_info in remaining_accounts.iter() {
        let token_account = Account::<TokenAccount>::try_from(account_info)?;
        
        require!(
            token_account.owner == permit.authority,
            AutoClaimError::InvalidAccountOwner
        );
        
        require!(
            token_account.amount == 0,
            AutoClaimError::NonZeroBalance
        );
        
        if let Some(close_authority) = token_account.close_authority {
            require!(
                close_authority == permit_key,
                AutoClaimError::InvalidCloseAuthority
            );
        } else {
            return Err(AutoClaimError::InvalidCloseAuthority.into());
        }
        
        let rent_lamports = account_info.lamports();
        total_recovered = total_recovered
            .checked_add(rent_lamports)
            .ok_or(AutoClaimError::ArithmeticOverflow)?;
        
        let close_accounts = CloseAccount {
            account: account_info.to_account_info(),
            destination: ctx.accounts.relayer.to_account_info(),
            authority: ctx.accounts.permit.to_account_info(),
        };
        
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            close_accounts,
            signer_seeds,
        );
        
        token_2022::close_account(cpi_ctx)?;
        accounts_closed += 1;
    }
    
    if total_recovered == 0 {
        return Ok(());
    }
    
    let platform_fee = (total_recovered as u128)
        .checked_mul(ctx.accounts.config.platform_fee_bps as u128)
        .ok_or(AutoClaimError::ArithmeticOverflow)?
        .checked_div(10000)
        .ok_or(AutoClaimError::ArithmeticOverflow)? as u64;
    
    let user_net = total_recovered
        .checked_sub(platform_fee)
        .ok_or(AutoClaimError::ArithmeticOverflow)?;
    
    if platform_fee > 0 {
        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.relayer.to_account_info(),
                    to: ctx.accounts.platform_wallet.to_account_info(),
                },
            ),
            platform_fee,
        )?;
    }
    
    if user_net > 0 {
        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.relayer.to_account_info(),
                    to: ctx.accounts.user_wallet.to_account_info(),
                },
            ),
            user_net,
        )?;
    }
    
    emit!(ClaimEvent {
        user: permit.authority,
        accounts_closed,
        total_recovered_lamports: total_recovered,
        platform_fee_lamports: platform_fee,
        user_net_lamports: user_net,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}
