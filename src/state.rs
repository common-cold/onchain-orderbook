use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{msg, program_error::ProgramError, pubkey::Pubkey};
use bytemuck::{Pod, Zeroable};


pub const MAX_EVENT: u16 = 512; 

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
#[derive(Clone, Copy, PartialEq, Debug, BorshSerialize, BorshDeserialize)]
#[borsh(use_discriminant=true)]
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
    pub market: Pubkey,
    pub next_order_id: u64,
    pub orders: [Order; 10],
    // pub orders: [Order; 1024],
    pub slots_filled: u16
}

impl OrderBook {
    pub const LEN: usize = 1 + 32 + 8 + (97 * 10) + 2;  //1013 bytes
    // pub const LEN: usize = 1 + 32 + 8 + (97 * 1024) + 2;  //99371 bytes

    pub fn add_order(&mut self, order: Order) -> Result<(), ProgramError> {
        if self.slots_filled >= 1024 {
             if self.side == Side::Bid {
                msg!("Bids is full right now");  
            } else {
                msg!("Asks is full right now");
            }
            return Err(ProgramError::Custom(1));
        }

        if (self.slots_filled == 0) {
            self.orders[0] = order;
            self.slots_filled += 1;
            return Ok(());
        }

        let order_slice = &self.orders[0..(self.slots_filled as usize -1)];

        let index = match self.side {
            Side::Bid => {
                order_slice.partition_point(|x| x.price >= order.price)
            },
            Side::Ask => {
                order_slice.partition_point(|x| x.price <= order.price)
            }
        };

        //shift elements beyond index + 1 to right and set index to order
        for i in (index..self.slots_filled as usize).rev() {
            self.orders[i + 1] = self.orders[i];
        }
        self.orders[index] = order;
        self.slots_filled += 1;

        Ok(())
        
    }

    pub fn remove_order(&mut self, index: usize) -> Result<(), ProgramError> {
        //shift elements left beyond index + 1 and set slots_filled_index to 0;
        for i in (index..self.slots_filled as usize) {
            self.orders[i] = self.orders[i+1];
        }
        self.slots_filled -= 1;
        Ok(())
    }
}


#[repr(C, packed)]
#[derive(Clone, Copy, Zeroable, Pod)]
pub struct OpenOrderAccount {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub order_ids: [u64; 64],
    pub next_array_index: u8,
    pub bump: u8
}

impl OpenOrderAccount {
    pub const LEN: usize = 32 + 32 + (8 * 64) + 1 + 1;  //578 bytes

    pub fn init(owner: &Pubkey, market: &Pubkey, bump: u8) -> Self {
        OpenOrderAccount { 
            owner: *owner,
            market: *market, 
            order_ids: [0u64; 64],
            next_array_index: 0,
            bump: bump
        }
    }

    pub fn create_side_encoded_order_id(plain_order_id: u64, side: Side) -> u64 {
        let side_bytes = (side as u64) << 63;
        return side_bytes | plain_order_id;
    }

    pub fn decode_side_encoded_order_id(encoded_order_id: u64) -> Result<(u64, Side), ProgramError> {
        let side_bytes = (encoded_order_id >> 63) as u8;
        let side = Side::try_from_slice(&[side_bytes])?;
        let order_id = encoded_order_id & 0x7FFF_FFFF_FFFF_FFFF;
        return Ok((order_id, side));
    }
}


#[derive(Debug, BorshSerialize, BorshDeserialize)]
pub struct UserMarketAccount {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub free_coin: u64,
    pub locked_coin: u64,
    pub free_pc: u64,
    pub locked_pc: u64,
    pub open_order: Pubkey,
    pub bump: u8
}

impl UserMarketAccount {
    pub const LEN: usize = 32 + 32 + 8 + 8 + 8 + 8 + 32 + 1;   //129 bytes

    pub fn init(owner: &Pubkey, market: &Pubkey, open_order: &Pubkey, bump: u8) -> Self {
         UserMarketAccount {
            owner: *owner,
            market: *market,
            free_coin: 0,
            locked_coin: 0,
            free_pc: 0,
            locked_pc: 0,
            open_order: *open_order,
            bump: bump
        }
    }

    pub fn unlock_coin(&mut self, amount: &u64) {
        self.locked_coin -= amount;
        self.free_coin += amount;
    }

    pub fn lock_free_coin(&mut self, amount: &u64) {
        self.free_coin -= amount;
        self.credit_locked_coin(amount);
    }

    pub fn credit_locked_coin(&mut self, amount: &u64) {
        self.locked_coin += amount;
    }

    pub fn unlock_pc(&mut self, amount: &u64) {
        self.locked_pc -= amount;
        self.free_pc += amount;
    }

    pub fn lock_free_pc(&mut self, amount: &u64) {
        self.free_pc -= amount;
        self.credit_locked_pc(amount);
    }

    pub fn credit_locked_pc(&mut self, amount: &u64) {
        self.locked_pc += amount;
    }
}

#[repr(u8)]
#[derive(Clone, Copy, PartialEq, Debug, BorshSerialize, BorshDeserialize)]
#[borsh(use_discriminant=true)]
pub enum EventType {
    Fill = 0,
    Out = 1 
}
unsafe impl Zeroable for EventType {}
unsafe impl Pod for EventType {}


#[repr(C, packed)]
#[derive(Clone, Copy, Zeroable, Pod)]
pub struct Event {
    pub event_type: EventType,
    pub side: Side,
    pub maker: Pubkey,
    pub taker: Pubkey,
    pub coin_qty: u64,
    pub pc_qty: u64,
    pub maker_order_id: u64,
}


#[repr(C, packed)]
#[derive(Copy, Clone, Zeroable, Pod)]

pub struct MarketEventsAccount {
    pub market: Pubkey,
    pub head: u16,
    pub tail: u16,
    pub events: [Event; MAX_EVENT as usize],
}

impl MarketEventsAccount {
    pub const LEN: u16 = 32 + 2 + 2 + (90 * MAX_EVENT);   //46,116 bytes

    pub const DRAIN_LIMIT: u16 = 5;

    pub fn enqueue(&mut self, event: Event) -> Result<bool, ProgramError> {
        if self.is_full() {
            return Ok(false)
        }
        self.events[self.head as usize] = event;
        self.head = (self.head + 1) % MAX_EVENT;
        Ok(true)
    }

    pub fn dequeue(&mut self) -> Result<Option<Event>, ProgramError> {
        if self.is_empty() {
            return Ok(None)
        }
        let event = self.events[self.tail as usize];
        self.tail = (self.tail + 1) % MAX_EVENT;
        Ok(Some(event))
    }

    pub fn is_empty(&mut self) -> bool {
        return self.head == self.tail;
    }

    pub fn is_full(&mut self) -> bool {
        return (self.head + 1) % MAX_EVENT == self.tail
    }

    pub fn size(&mut self) -> u16 {
        if self.head >= self.tail {
            return self.head - self.tail;
        }
        return MAX_EVENT - (self.tail - self.head);
    }
}



#[derive(BorshSerialize, BorshDeserialize)]
pub struct CreateOrderArgs {
    pub side: Side,
    pub limit_price: u64,
    pub coin_qty: u64,
    pub pc_qty: u64,
}

#[derive(BorshSerialize, BorshDeserialize)]
pub struct ConsumeEventsArgs {
    pub drain_count: u8
}
