import * as borsh from "borsh";
import BN from "bn.js";
import { MAX_EVENT } from "./utils";

const PubKeyType = {
    "array": {
        len: 32,
        type: "u8"
    }
};

export enum Side {
    Bid = 0,
    Ask = 1
}

export enum EventType {
    Fill = 0,
    Out = 1 
}


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
                len: 1024,
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

export class Event {
    maker: Uint8Array;
    taker: Uint8Array;
    maker_order_id: bigint;
    coin_qty: bigint;
    pc_qty: bigint;
    event_type: Number;
    side: Number;

    constructor(fields: {
        maker: Uint8Array;
        taker: Uint8Array;
        maker_order_id: bigint;
        coin_qty: bigint;
        pc_qty: bigint;
        event_type: Number;
        side: Number;
    }) {
        this.maker = fields.maker
        this.taker = fields.taker
        this.maker_order_id = fields.maker_order_id
        this.coin_qty = fields.coin_qty
        this.pc_qty = fields.pc_qty
        this.event_type = fields.event_type
        this.side = fields.side
    }
}

export const EventSchema: borsh.Schema = {
    struct: {
        event_type: "u8",
        side: "u8",
        maker: PubKeyType,
        taker: PubKeyType,
        coin_qty: "u64",
        pc_qty: "u64",
        maker_order_id: "u64"
    }
}

export class MarketEventsAccount {
    market: Uint8Array;
    head: Number;
    tail: Number;
    events: Event[];
    constructor(fields: {
        market: Uint8Array;
        head: Number;
        tail: Number;
        events: Event[];
    }) {
        this.market = fields.market
        this.head = fields.head
        this.tail = fields.tail
        this.events = fields.events
    }

    size() {
        if (this.head >= this.tail) {
            return (this.head.valueOf() - this.tail.valueOf());
        }
        return MAX_EVENT - (this.tail.valueOf() - this.head.valueOf());
    }
}

export const MarketEventsAccountSchema: borsh.Schema = {
    struct: {
        market: PubKeyType,
        head: "u16", 
        tail: "u16",
        events: {
            array: {
                len: MAX_EVENT,
                type: EventSchema
            }
        },
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

export const ConsumeEventsSchema: borsh.Schema = {
    struct : {
        drain_count: "u8"
    }
}

export const CancelOrderSchema: borsh.Schema = {
    struct : {
        order_id: "u64",
        side: "u8"
    }
}

