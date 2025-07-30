use solana_program::{msg, program_error::ProgramError, pubkey::Pubkey};

pub enum OrderbookError {
}

impl From<OrderbookError> for ProgramError {
    fn from(e: OrderbookError) -> Self {
        match e {
          
        }
        ProgramError::Custom(e as u32)
    }
}