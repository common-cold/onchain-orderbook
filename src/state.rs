use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{pubkey::Pubkey, rent::{self, Rent}};
use bytemuck::{Pod, Zeroable};

#[derive(BorshSerialize, BorshDeserialize)]
pub struct MarketState {
    pub coin_vault: Pubkey,
    pub pc_vault: Pubkey,
    pub coin_mint: Pubkey,
    pub pc_mint: Pubkey,
    pub bids: Pubkey,
    pub asks: Pubkey,
    pub next_order_id: u64,
    pub bump: u8
}

impl MarketState {
    pub const LEN: usize = 6 * 32 + 8 + 1;
}


#[repr(u8)]
#[derive(Clone, Copy, PartialEq)]
pub enum Side {
    Bid = 0,
    Ask = 1
}

unsafe impl Zeroable for Side {}
unsafe impl Pod for Side {}

#[repr(C, packed)]
#[derive(Copy, Clone, Zeroable, Pod)]
pub struct Order {
    pub order_id: u64,
    pub owner: Pubkey,
    pub market: Pubkey,
    pub price: u64,
    pub quantity: u64,
    pub filled_quantity: u64,
    pub side: Side
}


#[repr(C, packed)]
#[derive(Copy, Clone, Zeroable, Pod)]
pub struct OrderBook {
    pub side: Side,
    pub order_count: u64,
    pub market: Pubkey,
    pub orders: [Order; 1024],
}

impl OrderBook {
    pub const LEN: usize = 1 + (97 * 1024) + 8 + 32;  //99369 bytes
}