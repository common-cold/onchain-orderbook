use solana_program::{account_info::{next_account_info, AccountInfo}, entrypoint::ProgramResult, msg, program_error::ProgramError, pubkey::Pubkey};

use crate::state::{CancelOrderArgs, Event, EventType, MarketEventsAccount, OrderBook};

pub fn cancel_order(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    args: CancelOrderArgs
) -> ProgramResult {
    let mut iter = accounts.iter();

    let market_account = next_account_info(&mut iter)?;
    let market_events_account = next_account_info(&mut iter)?;
    let owner_account = next_account_info(&mut iter)?;
    let coin_mint_account = next_account_info(&mut iter)?;
    let pc_mint_account = next_account_info(&mut iter)?;
    let order_side_account = next_account_info(&mut iter)?;


    //verify market account
    let market_seeds = &[b"market", pc_mint_account.key.as_ref(), coin_mint_account.key.as_ref()]; 

    let market_pda = Pubkey::find_program_address(
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

    //verify Order Side account
    let mut order_side_raw_data = order_side_account.data.borrow_mut();
    let order_book_data: &mut OrderBook = bytemuck::from_bytes_mut(&mut order_side_raw_data);

    if *order_side_account.owner != *program_id {
        msg!("Invalid order side account provided, it has wrong owner");
        return Err(ProgramError::InvalidAccountData);
    }
    
    if order_book_data.side != args.side {
        msg!("Invalid order side account provided, expected: {:?}", args.side);
        return Err(ProgramError::InvalidAccountData);
    }


    //get market events account data
    let market_events_raw_data = &mut market_events_account.data.borrow_mut();
    let market_events_data: &mut MarketEventsAccount = bytemuck::from_bytes_mut(market_events_raw_data);
    

    //remove order
    let removed_order = order_book_data.safely_remove_order_by_order_id(args.order_id, *owner_account.key)?;
    msg!("Removed Order");

    //emit event
    let event = Event {
        event_type: EventType::Out,
        side: args.side,
        maker: *owner_account.key,
        taker: *owner_account.key,
        coin_qty: removed_order.quantity - removed_order.filled_quantity,
        pc_qty: (removed_order.quantity - removed_order.filled_quantity) * removed_order.price,
        maker_order_id: removed_order.order_id
    };
    let result = market_events_data.enqueue(event)?;
    if !result {
        //TODO: handle this
        msg!("Event Queue is Full");
    }
    msg!("Emitted Out Event");

    Ok(())
}