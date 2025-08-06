use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{entrypoint::ProgramResult, account_info::AccountInfo, pubkey::Pubkey};

use crate::{instructions::{cancel_order::cancel_order, consume_events::consume_events, create_order::create_order, initialize_market::initialize_market_instruction, settle_funds::settle_funds}, state::{CancelOrderArgs, ConsumeEventsArgs, CreateOrderArgs}};


#[derive(BorshSerialize, BorshDeserialize)]
pub enum OrderBookInstruction {
    InitializeMarket,
    CreateOrder(CreateOrderArgs),
    ConsumeEvents(ConsumeEventsArgs),
    SettleFunds,
    CancelOrder(CancelOrderArgs)
}

pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8]
) -> ProgramResult {
    
    let instruction = OrderBookInstruction::try_from_slice(instruction_data)?;
    match instruction{
        OrderBookInstruction::InitializeMarket => initialize_market_instruction(program_id, accounts)?,
        OrderBookInstruction::CreateOrder(data) => create_order(program_id, accounts, data)?,
        OrderBookInstruction::ConsumeEvents(data) => consume_events(program_id, accounts, data)?,
        OrderBookInstruction::SettleFunds => settle_funds(program_id, accounts)?,
        OrderBookInstruction::CancelOrder(data) => cancel_order(program_id, accounts, data)?
    };
    Ok(())   
}