use std::io::Cursor;

use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{account_info::{next_account_info, AccountInfo}, entrypoint::ProgramResult, msg, program::invoke_signed, program_error::ProgramError, program_pack::Pack, pubkey::Pubkey};
use spl_token::{instruction::transfer, state::Account as TokenAccount};

use crate::state::UserMarketAccount;

pub fn settle_funds(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    let mut iter = accounts.iter();

    let market_account = next_account_info(&mut iter)?;
    let market_events_account = next_account_info(&mut iter)?;
    let owner_account = next_account_info(&mut iter)?;
    let user_market_account = next_account_info(&mut iter)?;
    let coin_mint_account = next_account_info(&mut iter)?;
    let pc_mint_account = next_account_info(&mut iter)?;
    let coin_vault_account = next_account_info(&mut iter)?;
    let pc_vault_account = next_account_info(&mut iter)?;
    let user_coin_account = next_account_info(&mut iter)?;
    let user_pc_account = next_account_info(&mut iter)?;
    let token_program_account = next_account_info(&mut iter)?;
    
    
    //verify market account
    let market_seeds = &[b"market", pc_mint_account.key.as_ref(), coin_mint_account.key.as_ref()]; 

    let (market_pda, market_bump) = Pubkey::find_program_address(
        market_seeds,
        program_id
    );

    if *market_account.key != market_pda {
        msg!("Invalid market account provided, expected: {}", market_pda);
        return Err(ProgramError::InvalidAccountData);
    }


    //verify market events account
    if *market_events_account.owner != *program_id {
        msg!("Invalid market events account provided, it has wrong owner");
        return Err(ProgramError::InvalidAccountData);
    }


    //verify user market account
    let user_market_seeds = [b"user_market_account", market_account.key.as_ref(), owner_account.key.as_ref()];
    
    let user_market_pda = Pubkey::find_program_address(&user_market_seeds, program_id).0;

    if user_market_pda != *user_market_account.key {
        msg!("Invalid user market account provided, expected: {}", user_market_pda);
        return Err(ProgramError::InvalidAccountData);
    }

    if user_market_account.lamports() == 0 {
        msg!("User Market Account has not been initialised");
        return Err(ProgramError::InvalidAccountData);
    }    


    //verify coin vault account
    let coint_vault_seeds = &[b"coin_vault", market_account.key.as_ref()];

    let coin_vault_pda = Pubkey::find_program_address(
        coint_vault_seeds,
        program_id
    ).0;

    if *coin_vault_account.key != coin_vault_pda {
        msg!("Invalid coin vault account provided, expected: {}", coin_vault_pda);
        return Err(ProgramError::InvalidAccountData);
    }

    let coin_vault = TokenAccount::unpack(*coin_vault_account.data.borrow_mut())?;
    if coin_vault.mint != *coin_mint_account.key {
        msg!("Given coin vault account is of wrong mint, expected {}", coin_mint_account.key);
        return Err(ProgramError::InvalidAccountData);
    }
    msg!("Coin vault Owner: {}", coin_vault.owner);

    
    //verify pc_vault account
    let pc_vault_seeds = &[b"pc_vault", market_account.key.as_ref()];

    let pc_vault_pda= Pubkey::find_program_address(
        pc_vault_seeds,
        program_id
    ).0;

    if *pc_vault_account.key != pc_vault_pda {
        msg!("Invalid pc vault account provided, expected: {}", pc_vault_pda);
        return Err(ProgramError::InvalidAccountData);
    }

    let pc_vault = TokenAccount::unpack(*pc_vault_account.data.borrow_mut())?;
    if pc_vault.mint != *pc_mint_account.key {
        msg!("Given pc vault account is of wrong mint, expected {}", pc_mint_account.key);
        return Err(ProgramError::InvalidAccountData);
    }
    msg!("PC vault Owner: {}", pc_vault.owner);

    //verify user's coin ata
    let coin_ata = TokenAccount::unpack(*user_coin_account.data.borrow_mut())?;
    if coin_ata.mint != *coin_mint_account.key {
        msg!("Given user associated token account is of wrong mint, expected {}", coin_mint_account.key);
        return Err(ProgramError::InvalidAccountData);
    }
    if coin_ata.owner != *owner_account.key {
        msg!("Given coin user associated token account has wrong owner, expected {}", owner_account.key);
        return Err(ProgramError::InvalidAccountData);
    }

    //verify user's pc ata
    let pc_ata = TokenAccount::unpack(*user_pc_account.data.borrow_mut())?;
    if pc_ata.mint != *pc_mint_account.key {
        msg!("Given user associated token account is of wrong mint, expected {}", pc_mint_account.key);
        return Err(ProgramError::InvalidAccountData);
    }
    if pc_ata.owner != *owner_account.key {
        msg!("Given pc user associated token account has wrong owner, expected {}", owner_account.key);
        return Err(ProgramError::InvalidAccountData);
    }
    
    msg!("Accounts verification success");

    
    //retrive user market account data
    let mut user_market_raw_data = user_market_account.data.borrow_mut();
    let mut reader = &user_market_raw_data[..];
    let mut user_market_data = UserMarketAccount::try_from_slice(&mut reader)?;

    let coin_transfer_eligible = user_market_data.free_coin > 0;
    let pc_transfer_eligible = user_market_data.free_pc > 0;

    if coin_transfer_eligible {
        let transfer_ix = transfer(
            token_program_account.key, 
            coin_vault_account.key, 
            user_coin_account.key, 
            market_account.key, 
            &[market_account.key, owner_account.key],
            user_market_data.free_coin
        )?;

        invoke_signed(
            &transfer_ix, 
            &[
                coin_mint_account.clone(),
                coin_vault_account.clone(),
                user_coin_account.clone(),
                market_account.clone(),
                owner_account.clone(),
                token_program_account.clone(),
            ], 
            &[&[
                b"market", 
                pc_mint_account.key.as_ref(), 
                coin_mint_account.key.as_ref(),
                &[market_bump]
            ]]
        )?;
        msg!("Transferred Coin Balance to User");
        
    }

    if pc_transfer_eligible {
        let transfer_ix = transfer(
            token_program_account.key, 
            pc_vault_account.key, 
            user_pc_account.key, 
            market_account.key, 
            &[market_account.key, owner_account.key],
            user_market_data.free_pc
        )?;

        invoke_signed(
            &transfer_ix, 
            &[
                coin_mint_account.clone(),
                pc_vault_account.clone(),
                user_pc_account.clone(),
                market_account.clone(),
                owner_account.clone(),
                token_program_account.clone(),
            ], 
            &[&[
                b"market", 
                pc_mint_account.key.as_ref(), 
                coin_mint_account.key.as_ref(),
                &[market_bump]
            ]]
        )?;
        msg!("Transferred Pc Balance to User");
    }

    user_market_data.free_coin = 0;
    user_market_data.free_pc = 0;

    let mut writer = Cursor::new(&mut user_market_raw_data[..]);
    user_market_data.serialize(&mut writer)?;
    msg!("Reset User Market Data");


    Ok(())
}