use std::io::Cursor;

use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{account_info::{next_account_info, AccountInfo}, entrypoint::ProgramResult, msg, program::{invoke, invoke_signed}, program_error::ProgramError, program_pack::Pack, pubkey::Pubkey, system_instruction::create_account, sysvar::rent};
use spl_token::{instruction::transfer, state::Account as TokenAccount};

use crate::state::{CreateOrderArgs, Event, EventType, MarketEventsAccount, OpenOrderAccount, Order, OrderBook, Side, UserMarketAccount};

pub fn create_order(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    args: CreateOrderArgs
) -> ProgramResult {
    let mut iter = accounts.iter();

    let accounts_authority = next_account_info(&mut iter)?;
    let market_account = next_account_info(&mut iter)?;
    let market_events_account = next_account_info(&mut iter)?;
    let owner_account = next_account_info(&mut iter)?;
    let user_market_account = next_account_info(&mut iter)?;
    let open_order_account = next_account_info(&mut iter)?;
    let payer_account = next_account_info(&mut iter)?;
    let vault_account = next_account_info(&mut iter)?;
    let coin_mint_account = next_account_info(&mut iter)?;
    let pc_mint_account = next_account_info(&mut iter)?;
    let bids_account = next_account_info(&mut iter)?;
    let asks_account = next_account_info(&mut iter)?;
    let system_program_account = next_account_info(&mut iter)?;
    let token_program_account = next_account_info(&mut iter)?;

    let rent = rent::Rent::default();

    let CreateOrderArgs {
        side,
        limit_price,
        coin_qty,
        pc_qty,
    } = args;


    //verify market events account
    if *market_events_account.owner != *program_id {
        msg!("Invalid market events account provided, it has wrong owner");
        return Err(ProgramError::InvalidAccountData);
    }

    //verify open order account
    let open_order_seeds = [b"open_order", market_account.key.as_ref(), owner_account.key.as_ref()];
    
    let (open_order_pda, open_order_bump) = Pubkey::find_program_address(&open_order_seeds, program_id);

    if open_order_pda != *open_order_account.key {
        msg!("Invalid open order account provided, expected: {}", open_order_pda);
        return Err(ProgramError::InvalidAccountData);
    }    

    msg!("Open Order account verified");

    //make open orders account if it does not exist
    if open_order_account.lamports() == 0 {
        let create_open_order_account_ix = create_account(
            owner_account.key, 
            open_order_account.key, 
            rent.minimum_balance(OpenOrderAccount::LEN), 
            OpenOrderAccount::LEN as u64, 
            program_id
        );
        invoke_signed(
            &create_open_order_account_ix, 
            &[
                owner_account.clone(),
                open_order_account.clone(),
                system_program_account.clone()
            ], 
            &[&[
                b"open_order", 
                market_account.key.as_ref(), 
                owner_account.key.as_ref(),
                &[open_order_bump]
            ]]
        )?;

        //initialize open order data
        let mut open_order_raw_data = open_order_account.data.borrow_mut();
        let open_order_data: &mut OpenOrderAccount = bytemuck::from_bytes_mut(&mut open_order_raw_data);
        open_order_data.owner = owner_account.key.clone();
        open_order_data.market = market_account.key.clone();
        open_order_data.order_ids = [0u64; 64];
        open_order_data.bump = open_order_bump;
        
        msg!("Open Order account created");
    }

    let mut open_order_raw_data = open_order_account.data.borrow_mut();
    let open_order_data: &mut OpenOrderAccount = bytemuck::from_bytes_mut(&mut open_order_raw_data);
    
    if open_order_data.owner != *owner_account.key {
        msg!("Invalid open order, does not belongs to provided owner");
        return Err(ProgramError::InvalidAccountData);
    }
    
    if open_order_data.market != *market_account.key {
        msg!("Invalid open order, does not belongs to provided market");
        return Err(ProgramError::InvalidAccountData);
    }
    msg!("Open Order account verified");

    
    //verify user market account
    let user_market_seeds = [b"user_market_account", market_account.key.as_ref(), owner_account.key.as_ref()];
    
    let (user_market_pda, user_market_bump) = Pubkey::find_program_address(&user_market_seeds, program_id);

    if user_market_pda != *user_market_account.key {
        msg!("Invalid user market account provided, expected: {}", user_market_pda);
        return Err(ProgramError::InvalidAccountData);
    }    

    msg!("User market account verified");

    //make user market account if it does not exist
    if user_market_account.lamports() == 0 {
        let create_user_mkt_account_ix = create_account(
            owner_account.key, 
            user_market_account.key, 
            rent.minimum_balance(UserMarketAccount::LEN), 
            UserMarketAccount::LEN as u64, 
            program_id
        );
        invoke_signed(
            &create_user_mkt_account_ix, 
            &[
                owner_account.clone(),
                user_market_account.clone(),
                system_program_account.clone()
            ], 
            &[&[
                b"user_market_account", 
                market_account.key.as_ref(), 
                owner_account.key.as_ref(),
                &[user_market_bump]
            ]]
        )?;

        //initialize user market data
        let user_market_data = UserMarketAccount::init(
            owner_account.key, 
            market_account.key, 
            open_order_account.key, 
            user_market_bump
        );

        let mut raw = user_market_account.data.borrow_mut();
        let mut cursor = Cursor::new(&mut raw[..]);
        user_market_data.serialize(&mut cursor)?;
        msg!("User market account created");
    }
    
    let mut user_market_data = UserMarketAccount::try_from_slice(*user_market_account.data.borrow_mut())?;
    
    if user_market_data.owner != *owner_account.key {
        msg!("Invalid user market account, does not belongs to provided owner");
        return Err(ProgramError::InvalidAccountData);
    }
    
    if user_market_data.market != *market_account.key {
        msg!("Invalid user market account, does not belongs to provided market");
        return Err(ProgramError::InvalidAccountData);
    }
    msg!("User Market account verified");


    //get payer ata and verify it
    let payer = TokenAccount::unpack(*payer_account.data.borrow_mut())?;
    match side {
        Side::Bid => {
            if payer.mint != *pc_mint_account.key {
                msg!("Given payer account is of wrong mint, expected {}", pc_mint_account.key);
                return Err(ProgramError::InvalidAccountData);
            }
        }
        Side::Ask => {
            if payer.mint != *coin_mint_account.key {
                msg!("Given payer account is of wrong mint, expected {}", coin_mint_account.key);
                return Err(ProgramError::InvalidAccountData);
            }
        }
    };
    msg!("Payer account verified");

    //get vault ata and verify it
    let vault = TokenAccount::unpack(*vault_account.data.borrow_mut())?;
    match side {
        Side::Bid => {
            if vault.mint != *pc_mint_account.key {
                msg!("Given vault account is of wrong mint, expected {}", pc_mint_account.key);
                return Err(ProgramError::InvalidAccountData);
            }
        }
        Side::Ask => {
            if vault.mint != *coin_mint_account.key {
                msg!("Given vault account is of wrong mint, expected {}", coin_mint_account.key);
                return Err(ProgramError::InvalidAccountData);
            }
        }
    };
    msg!("Vault account verified");


    //get market events account data
    let market_events_raw_data = &mut market_events_account.data.borrow_mut();
    let market_events_data: &mut MarketEventsAccount = bytemuck::from_bytes_mut(market_events_raw_data);


    //get bids and asks accounts' data
    let mut bids_raw_data = bids_account.data.borrow_mut();
    let mut bids_data: &mut OrderBook = bytemuck::from_bytes_mut(&mut bids_raw_data);

    let mut asks_raw_data = asks_account.data.borrow_mut();
    let mut asks_data: &mut OrderBook = bytemuck::from_bytes_mut(&mut asks_raw_data);

    let (taker_book, maker_book) = match side {
        Side::Bid => {
            (&mut bids_data, &mut asks_data)
        }
        Side::Ask => {
            (&mut asks_data, &mut bids_data)
        }
    };

    //check if taker book is filled
    if taker_book.slots_filled >= 1024 {
        if side == Side::Bid {
            msg!("Bids is full right now");  
        } else {
            msg!("Asks is full right now");
        }
        return Err(ProgramError::Custom(1));
    }


    // //check if 
    // if pc_qty < (limit_price) * (coin_qty) {
    //     msg!("Not enough funds provided for instruction");
    //     return Err(ProgramError::InsufficientFunds);
    // }

    //lock funds
    let deposit_amount;
    match side {
        Side::Bid => {
            let free_pc = user_market_data.free_pc;
            let pc_qty_to_lock = pc_qty.min(free_pc);
            deposit_amount = pc_qty - pc_qty_to_lock;
            if payer.amount < deposit_amount {
                msg!("Owner's ATA does not have enough PC balance");
                return Err(ProgramError::InsufficientFunds);
            }
            user_market_data.lock_free_pc(&pc_qty_to_lock);
            user_market_data.credit_locked_pc(&deposit_amount);

        }
        Side::Ask => {
            let free_coin = user_market_data.free_coin;
            let coin_qty_to_lock = coin_qty.min(free_coin);
            deposit_amount = coin_qty - coin_qty_to_lock;
            if payer.amount < deposit_amount {
                msg!("Owner's ATA does not have enough Coin balance");
                return Err(ProgramError::InsufficientFunds);
            }
            user_market_data.lock_free_coin(&coin_qty_to_lock);
            user_market_data.credit_locked_coin(&deposit_amount);
        }
    };
    msg!("Funds Locked");

    let mut coin_qty_remaining = coin_qty;

    let mut order_indexes_to_remove: Vec<usize> = Vec::new();

    for i in 0..maker_book.slots_filled {
        let maker_order = &mut maker_book.orders[i as usize];
        
        if coin_qty_remaining == 0 {
            break;
        }

        let crossed = match side {
            Side::Bid => {
                limit_price >= maker_order.price
            }

            Side::Ask => {
                limit_price <= maker_order.price
            }
        };
        if !crossed {
            break;
        }
        
        let trade_qty = maker_order.quantity
            .min(coin_qty_remaining);
        coin_qty_remaining -= trade_qty;
        maker_order.filled_quantity += trade_qty;

        if maker_order.quantity == maker_order.filled_quantity {
            order_indexes_to_remove.push(i as usize);
        }

        //emit fill event for this order
        let event = Event {
            event_type: EventType::Fill,
            side: maker_book.side,
            maker: maker_order.owner,
            taker: *owner_account.key,
            coin_qty: trade_qty,
            pc_qty: trade_qty * maker_order.price,
            maker_order_id: maker_order.order_id
        };
        let result = market_events_data.enqueue(event)?;
        if !result {
            //TODO: handle this
            msg!("Event Queue is Full");
        }
        msg!("Emitted Fill Event");
    }
    msg!("Matching complete");

    
    //remove filled orders from maker book
    for i in 0..order_indexes_to_remove.len() {
        maker_book.remove_order(order_indexes_to_remove[i])?;
    }
    if order_indexes_to_remove.len() != 0 {
        msg!("Remove filled orders from maker book")
    }
    

    //add unfilled orders in taker book
    if coin_qty_remaining > 0 {
        let order_id = taker_book.next_order_id;
        let side_encoded_order_id = OpenOrderAccount::create_side_encoded_order_id(order_id, side);
        let index = open_order_data.next_array_index;
        open_order_data.order_ids[index as usize] = side_encoded_order_id;
        open_order_data.next_array_index += 1;

        let remaining_order = Order {
            order_id: order_id,
            owner: *owner_account.key,
            market: *market_account.key,
            price: limit_price,
            quantity: coin_qty_remaining,
            filled_quantity: 0,
            side: side
        };
        taker_book.add_order(remaining_order)?;
        taker_book.next_order_id += 1;
        msg!("Added unfilled order in maker book");
    }
    

    //transfer extra funds to vault if needed
    if deposit_amount > 0 {
        let mint_account = match side {
            Side::Bid => {
                pc_mint_account
            }
            Side::Ask => {
                coin_mint_account
            }
        };

        let transfer_ix = transfer(
            token_program_account.key, 
            payer_account.key, 
            vault_account.key, 
            owner_account.key, 
            &[owner_account.key, accounts_authority.key], 
            deposit_amount
        )?;

        invoke(
            &transfer_ix, 
            &[
                mint_account.clone(),
                payer_account.clone(),
                vault_account.clone(),
                owner_account.clone(),
                accounts_authority.clone(),
                token_program_account.clone(),
            ]
        )?;

        msg!("Transferred extra funds to vault account");
    }
    
    user_market_data.serialize(&mut *user_market_account.data.borrow_mut())?;

    Ok(())
}