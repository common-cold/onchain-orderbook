use borsh::BorshSerialize;
use bytemuck::Zeroable;
use solana_program::{account_info::{next_account_info, AccountInfo}, entrypoint::ProgramResult, msg, program::{invoke, invoke_signed}, program_error::ProgramError, program_pack::Pack, pubkey::Pubkey, rent::self, system_instruction::create_account};
use spl_token::{instruction::initialize_account, state::Account};
use crate::{error::OrderbookError, state::{MarketState, Order, OrderBook, Side}};

pub fn initialize_market_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    let mut iter = accounts.iter();

    let accounts_authority = next_account_info(&mut iter)?;
    let market_account = next_account_info(&mut iter)?;
    let coin_mint_account = next_account_info(&mut iter)?;
    let pc_mint_account = next_account_info(&mut iter)?;
    let coin_vault_account = next_account_info(&mut iter)?;
    let pc_vault_account = next_account_info(&mut iter)?;
    let bids_account = next_account_info(&mut iter)?;
    let asks_account = next_account_info(&mut iter)?;
    let system_program_account = next_account_info(&mut iter)?;
    let token_program_account = next_account_info(&mut iter)?;
    let rent_sysvar_account = next_account_info(&mut iter)?;

    let rent = rent::Rent::default();

    
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
    
    
    //verify coin vault account
    let coint_vault_seeds = &[b"coin_vault", market_account.key.as_ref()];

    let (coin_vault_pda, coin_vault_bump) = Pubkey::find_program_address(
        coint_vault_seeds,
        program_id
    );

    if *coin_vault_account.key != coin_vault_pda {
        msg!("Invalid coin vault account provided, expected: {}", coin_vault_pda);
        return Err(ProgramError::InvalidAccountData);
    }

    
    //verify pc_vault account
    let pc_vault_seeds = &[b"pc_vault", market_account.key.as_ref()];

    let (pc_vault_pda, pc_vault_bump) = Pubkey::find_program_address(
        pc_vault_seeds,
        program_id
    );

    if *pc_vault_account.key != pc_vault_pda {
        msg!("Invalid pc vault account provided, expected: {}", pc_vault_pda);
        return Err(ProgramError::InvalidAccountData);
    }

    //verify bids account
    if *bids_account.owner != *program_id {
        msg!("Invalid asks account provided, it has wrong owner");
        return Err(ProgramError::InvalidAccountData);
    }

    //verify asks acccount
    if *asks_account.owner != *program_id {
        msg!("Invalid asks account provided, it has wrong owner");
        return Err(ProgramError::InvalidAccountData);
    }

    msg!("Account verification success");

    //create market account
    let create_market_ix = create_account(
        accounts_authority.key, 
        &market_pda, 
        rent.minimum_balance(MarketState::LEN), 
        MarketState::LEN as u64, 
        program_id
    );

    invoke_signed(
        &create_market_ix, 
        &[
            accounts_authority.clone(),
            market_account.clone(),
            system_program_account.clone()
        ],
        &[&[
            b"market", 
            pc_mint_account.key.as_ref(), 
            coin_mint_account.key.as_ref(),
            &[market_bump]
        ]]
    )?;

    msg!("Created Market account");


    //create and initialize coin_vault token account
    let create_coin_vault_account_ix = create_account(
        accounts_authority.key, 
        coin_vault_account.key, 
        rent.minimum_balance(Account::LEN), 
        Account::LEN as u64, 
        &spl_token::ID
    );

    invoke_signed(
        &create_coin_vault_account_ix, 
        &[
            accounts_authority.clone(),
            coin_vault_account.clone(),
            system_program_account.clone(),
        ], 
        &[&[
            b"coin_vault",
            market_account.key.as_ref(),
            &[coin_vault_bump]
        ]]
    )?;
    msg!("Created coin vault account");

    let init_coin_vault_ata_ix = initialize_account(
        token_program_account.key, 
        coin_vault_account.key, 
        coin_mint_account.key, 
        market_account.key
    )?;

    invoke(
        &init_coin_vault_ata_ix,
        &[
            coin_vault_account.clone(),
            coin_mint_account.clone(),
            market_account.clone(),
            token_program_account.clone(),
            rent_sysvar_account.clone()
        ]
    )?;

    msg!("Initialised coin vault account as ata");

    //create and initialise pc_vault account
    let create_pc_vault_account_ix  = create_account(
        accounts_authority.key, 
        pc_vault_account.key, 
        rent.minimum_balance(Account::LEN), 
        Account::LEN as u64, 
        &spl_token::ID
    );

    invoke_signed(
        &create_pc_vault_account_ix, 
        &[
            accounts_authority.clone(),
            pc_vault_account.clone(),
            system_program_account.clone()
        ],
        &[&[
            b"pc_vault", 
            market_account.key.as_ref(),
            &[pc_vault_bump]
        ]]
    )?;

    msg!("Created pc vault account");

    let init_pc_vault_ata_ix = initialize_account(
        token_program_account.key, 
        pc_vault_account.key, 
        pc_mint_account.key, 
        market_account.key
    )?;

    invoke(
        &init_pc_vault_ata_ix, 
        &[
            pc_vault_account.clone(),
            pc_mint_account.clone(),
            market_account.clone(),
            token_program_account.clone(),
            rent_sysvar_account.clone()
        ]
    )?;

    msg!("Initialised pc vault account as ata");

    //initialise data inside bids account
    let mut bids_raw_data = bids_account.data.borrow_mut();
    let bids_data: &mut OrderBook = bytemuck::from_bytes_mut(&mut bids_raw_data);
    
    bids_data.side = Side::Bid;
    bids_data.market = market_account.key.clone();
    bids_data.next_order_id = 0;
    bids_data.orders = [Order::zeroed(); 10];
    // bids_data.orders = [Order::zeroed(); 1024];
    bids_data.slots_filled = 0;
    
    msg!("Initialised data inside bids account");

    //initialise data in asks account 
    let mut asks_raw_data = asks_account.data.borrow_mut();
    let asks_data: &mut OrderBook = bytemuck::from_bytes_mut(&mut asks_raw_data);

    asks_data.side = Side::Ask;
    asks_data.market = market_account.key.clone();
    asks_data.orders = [Order::zeroed(); 10];
    // asks_data.orders = [Order::zeroed(); 1024];    
    asks_data.next_order_id = 0;
    asks_data.slots_filled = 0;

    msg!("Initialised data inside asks account");

    //initialise data in market account
    let market_state = MarketState {
        coin_vault: coin_vault_account.key.clone(),
        pc_vault: pc_vault_account.key.clone(),
        coin_mint: coin_mint_account.key.clone(),
        pc_mint: pc_mint_account.key.clone(),
        bids: bids_account.key.clone(),
        asks: asks_account.key.clone(),
        next_order_id: 1,
        bump: market_bump
    };

    market_state.serialize(&mut *market_account.data.borrow_mut())?;

    msg!("Initialised data inside market account");

    Ok(())
}