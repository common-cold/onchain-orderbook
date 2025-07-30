use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{entrypoint::ProgramResult, account_info::AccountInfo, pubkey::Pubkey};

use crate::{instructions::{create_order::{self, create_order}, initialize_market::initialize_market_instruction}, state::CreateOrderArgs};


#[derive(BorshSerialize, BorshDeserialize)]
pub enum OrderBookInstruction {
    InitializeMarket,
    CreateOrder(CreateOrderArgs)
}

pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8]
) -> ProgramResult {
    
    let instruction = OrderBookInstruction::try_from_slice(instruction_data)?;
    match instruction{
        OrderBookInstruction::InitializeMarket => initialize_market_instruction(program_id, accounts)?,
        OrderBookInstruction::CreateOrder(data) => create_order(program_id, accounts, data)?
    };
    Ok(())   
}