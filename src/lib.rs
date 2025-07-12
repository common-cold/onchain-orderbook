use solana_program::{entrypoint::ProgramResult, entrypoint, pubkey::Pubkey, account_info::AccountInfo};

mod processor;
mod state;
mod instructions;
mod error;

entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8]
) -> ProgramResult {
    processor::process(program_id, accounts, instruction_data)?;
    Ok(())
}