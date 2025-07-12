use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{entrypoint::ProgramResult, account_info::AccountInfo, pubkey::Pubkey};

use crate::instructions::{initialize_market::initialize_market_instruction};


#[derive(BorshSerialize, BorshDeserialize)]
pub enum OrderBookInstruction {
    InitializeMarket
}


pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8]
) -> ProgramResult {
    
    let instruction = OrderBookInstruction::try_from_slice(instruction_data)?;
    match instruction {
        OrderBookInstruction::InitializeMarket => initialize_market_instruction(program_id, accounts)?
    };
    Ok(())   
}   