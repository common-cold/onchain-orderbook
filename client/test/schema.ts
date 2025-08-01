import * as borsh from "borsh";
import BN from "bn.js";

const PubKeyType = {
    "array": {
        len: 32,
        type: "u8"
    }
};


export class MarketState {
    coin_vault: Uint8Array;
    pc_vault: Uint8Array;
    coin_mint: Uint8Array;
    pc_mint: Uint8Array;
    bids: Uint8Array;
    asks: Uint8Array;
    next_order_id: bigint;
    bump: Number;

    constructor(fields: {
        coin_vault: Uint8Array;
        pc_vault: Uint8Array,
        coin_mint: Uint8Array,
        pc_mint: Uint8Array,
        bids: Uint8Array,
        asks: Uint8Array,
        next_order_id: bigint,
        bump: Number
    }) {
        this.coin_vault = fields.coin_vault;
        this.pc_vault = fields.pc_vault;
        this.coin_mint = fields.coin_mint;
        this.pc_mint = fields.pc_mint;
        this.bids = fields.bids;
        this.asks = fields.asks;
        this.next_order_id = fields.next_order_id;
        this.bump = fields.bump;
    }
}

export const MarketStateSchema: borsh.Schema  = {
    struct: {
        coin_vault: PubKeyType,
        pc_vault: PubKeyType,
        coin_mint: PubKeyType,
        pc_mint: PubKeyType,
        bids: PubKeyType,
        asks: PubKeyType,
        next_order_id: "u64",
        bump: "u8"
    }
}

export enum Side {
  Bid = 0,
  Ask = 1
}

export class Order {
    order_id: bigint;
    owner: Uint8Array;
    market: Uint8Array;
    price: bigint;
    quantity: bigint;
    filled_quantity: bigint;
    side: Number;

    constructor(fields: {
        order_id: bigint;
        owner: Uint8Array;
        market: Uint8Array;
        price: bigint;
        quantity: bigint;
        filled_quantity: bigint;
        side: Number;
    }) {
        this.order_id = fields.order_id;
        this.owner = fields.owner;
        this.market = fields.market;
        this.price = fields.price;
        this.quantity = fields.quantity;
        this.filled_quantity = fields.filled_quantity;
        this.side = fields.side
    }
}

export const OrderSchema: borsh.Schema = {
    struct: {
        order_id: "u64",
        owner: PubKeyType,
        market: PubKeyType,
        price: "u64",
        quantity: "u64",
        filled_quantity: "u64",
        side: "u8"
    }
}


export class OrderBook {
    side: Number;
    market: Uint8Array;
    next_order_id: bigint;
    orders: Order[];
    slots_filled: Number;

    constructor(fields: {
        side: Number;
        market: Uint8Array;
        next_order_id: bigint;
        orders: Order[];
        slots_filled: Number;
    }) {
        this.side = fields.side;
        this.market = fields.market;
        this.next_order_id = fields.next_order_id;
        this.orders = fields.orders;
        this.slots_filled = fields.slots_filled;
    }
}

export const OrderBookSchema: borsh.Schema = {
    struct: {
        side: "u8",
        market: PubKeyType,
        next_order_id: "u64",
        orders: {
            "array": {
                len: 10,
                // len: 1024,
                type: OrderSchema
            }
        },
        slots_filled: "u16"
    }
}

export class OpenOrderAccount {
    owner: Uint8Array;
    market: Uint8Array;
    order_ids: BN[];
    next_array_index: Number;
    bump: Number;

    constructor(fields: {
        owner: Uint8Array;
        market: Uint8Array;
        order_ids: BN[];
        next_array_index: Number;
        bump: Number;
    }) {
        this.owner = fields.owner;
        this.market = fields.market;
        this.order_ids = fields.order_ids;
        this.next_array_index = fields.next_array_index;
        this.bump = fields.bump;
    }
}

export const OpenOrderAccountSchema: borsh.Schema = {
    struct: {
        owner: PubKeyType,
        market: PubKeyType,
        order_ids: {
            array: {
                len: 64,
                type: "u64"
            }
        },
        next_array_index: "u8",
        bump: "u8"
    }
}


export class UserMarketAccount {
    owner: Uint8Array;
    market: Uint8Array;
    free_coin: bigint;
    locked_coin: bigint;
    free_pc: bigint;
    locked_pc: bigint;
    open_order: Uint8Array;
    bump: Number;

    constructor(fields: {
        owner: Uint8Array;
        market: Uint8Array;
        free_coin: bigint;
        locked_coin: bigint;
        free_pc: bigint;
        locked_pc: bigint;
        open_order: Uint8Array;
        bump: Number;
    }) {
        this.owner = fields.owner;
        this.market = fields.market;
        this.free_coin = fields.free_coin;
        this.locked_coin = fields.locked_coin;
        this.free_pc = fields.free_pc;
        this.locked_pc = fields.locked_pc;
        this.open_order = fields.open_order;
        this.bump = fields.bump;
    }
}

export const UserMarketAccountSchema: borsh.Schema = {
    struct: {
        owner: PubKeyType,
        market: PubKeyType,
        free_coin: "u64",
        locked_coin: "u64",
        free_pc: "u64",
        locked_pc: "u64",
        open_order: PubKeyType,
        bump: "u8"
    }
}

export const CreateOrderSchema: borsh.Schema = {
    struct: {
        side: "u8",
        limit_price: "u64",
        coin_qty: "u64",
        pc_qty: "u64"
    }
}

