use std::{collections::{hash_map, HashMap}, io::Cursor};

use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{account_info::{next_account_info, AccountInfo}, entrypoint::ProgramResult, msg, program_error::ProgramError, pubkey::Pubkey};

use crate::state::{ConsumeEventsArgs, EventType, MarketEventsAccount, Side, UserMarketAccount};

pub fn consume_events(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    args: ConsumeEventsArgs
) -> ProgramResult {
    let mut iter = accounts.iter();

    let market_account = next_account_info(&mut iter)?;
    let market_events_account = next_account_info(&mut iter)?;
    let coin_mint_account = next_account_info(&mut iter)?;
    let pc_mint_account = next_account_info(&mut iter)?;
    let user_accounts: Vec<&AccountInfo> = iter.collect();

    let mut user_account_map: HashMap<Pubkey, &AccountInfo> = HashMap::new();
    for account in user_accounts {
        user_account_map.insert(*account.key, account);
    }


    //verify market account
    let market_seeds = &[b"market", pc_mint_account.key.as_ref(), coin_mint_account.key.as_ref()]; 

    let market_pda= Pubkey::find_program_address(
        market_seeds,
        program_id
    ).0;

    if *market_account.key != market_pda {
        msg!("Invalid market account provided, expected: {}", market_pda);
        return Err(ProgramError::InvalidAccountData);
    }

    //verify market events account
    if *market_events_account.owner != *program_id {
        msg!("Invalid market events account provided, it has wrong owner");
        return Err(ProgramError::InvalidAccountData);
    }
    

    msg!("Accounts verification success");


    let mut events_acc_raw_data = market_events_account.data.borrow_mut();
    let events_info: &mut MarketEventsAccount = bytemuck::from_bytes_mut(&mut events_acc_raw_data);
    
    if events_info.is_empty() {
        msg!("Event Queue is Empty");
        return Ok(());
    }
    
    
    let mut i = 0;
    while i < args.drain_count {
        /////settle balance for the event

        //get the oldest added event
        let event = events_info.events[events_info.tail as usize];
        match event.event_type {
            EventType::Fill => {
                //retrieve User Market Account for maker
                let maker_uma_pda = Pubkey::find_program_address(
                    &[b"user_market_account", market_account.key.as_ref(), event.maker.as_ref()], 
                    program_id
                ).0;
                let maker_uma_info = user_account_map
                    .get(&maker_uma_pda)
                    .ok_or_else(|| {
                        msg!("Maker's User Market account is not provided: {}", maker_uma_pda);
                        ProgramError::NotEnoughAccountKeys
                })?;
                let mut maker_uma_raw_data = maker_uma_info.data.borrow_mut();
                let mut reader1 = &maker_uma_raw_data[..];
                let mut maker_uma_data = UserMarketAccount::try_from_slice(&mut reader1)?;
                msg!("Retreived Maker's User Market Data");

                //retrieve User Market Account for taker
                let taker_uma_pda = Pubkey::find_program_address(
                    &[b"user_market_account", market_account.key.as_ref(), event.taker.as_ref()], 
                    program_id
                ).0;
                let taker_uma_info = user_account_map
                    .get(&taker_uma_pda)
                    .ok_or_else(|| {
                        msg!("Taker's User Market account is not provided: {}",taker_uma_pda);
                        ProgramError::NotEnoughAccountKeys
                })?;
                let mut taker_uma_raw_data = taker_uma_info.data.borrow_mut();
                let mut reader2 = &taker_uma_raw_data[..];
                let mut taker_uma_data = UserMarketAccount::try_from_slice(&mut reader2)?;
                msg!("Retreived Taker's User Market Data");

                //settle free coin and pc balance 
                if event.side == Side::Bid {
                    maker_uma_data.free_coin += event.coin_qty;
                    taker_uma_data.free_pc += event.pc_qty;
                } else if event.side == Side::Ask {
                    maker_uma_data.free_pc += event.pc_qty;
                    taker_uma_data.free_coin += event.coin_qty;
                }
                msg!("Settled free coin and pc balance for maker and taker");

                //write modified data back to the account
                let mut writer1 = Cursor::new(&mut maker_uma_raw_data[..]);
                maker_uma_data.serialize(&mut writer1)?;

                let mut writer2 = Cursor::new(&mut taker_uma_raw_data[..]);
                taker_uma_data.serialize(&mut writer2)?;
                msg!("Wrote modified data back to User market acounts");
            },
            EventType::Out => {
                
            }
        }

        /////remove that event from queue
        let _ = events_info.dequeue()?.ok_or_else(|| {
            msg!("Queue is Empty");
            ProgramError::Custom(1);
        });
        let coin_qty = event.coin_qty;
        let pc_qty = event.pc_qty;
        let maker_order_id = event.maker_order_id;
        msg!(
            "Drained Event -> type: {:?}, side: {:?}, maker: {}, taker: {}, coin_qty: {}, pc_qty: {}, maker_order_id: {}",
            event.event_type,
            event.side,
            event.maker,
            event.taker,
            coin_qty,
            pc_qty,
            maker_order_id
        ); 
        i += 1;
    }
    msg!("Out of loop");
    Ok(())
} 
