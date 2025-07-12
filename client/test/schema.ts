import * as borsh from "borsh";
import { textSpanOverlapsWith } from "typescript";

const PubKeyType = {
    "array": {
        len: 32,
        type: "u8"
    }
};
export const ORDERBOOK_LEN = 99369;


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
    order_count: bigint;
    market: Uint8Array;
    orders: Order[];

    constructor(fields: {
        side: Number;
        order_count: bigint;
        market: Uint8Array;
        orders: Order[];
    }) {
        this.side = fields.side;
        this.order_count = fields.order_count;
        this.market = fields.market;
        this.orders = fields.orders;
    }
}

export const OrderBookSchema: borsh.Schema = {
    struct: {
        side: "u8",
        order_count: "u64",
        market: PubKeyType,
        orders: {
            array: {
                len: 1024,
                type: OrderSchema
            }
        }
    }
}

