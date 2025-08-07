# <h1 align="center"> Onchain Orderbook  📖</h1>

**A fully onchain, decentralized orderbook implementation for the Solana blockchain. Built entirely on native Rust**

---

## ✨ Features

### 🧩 Zero-Copy Account Deserialization with bytemuck: 
The program uses the `bytemuck` crate to directly cast Solana account data buffers into Rust structs (like `OrderBook`, `OpenOrder`, and `MarketEventsAccount`) without extra memory allocation or copying. This enables efficient, zero-copy access and mutation of large onchain data structures.
### ⚡ Efficient Orderbook Structure:
  The orderbook is implemented as a sorted array, enabling fast order insertion and deletion using binary search. This ensures quick matching and maintains price-time priority efficiently.
### 🔄 Optimized Event Queue:
The event queue is designed as a ring buffer, minimizing compute costs by avoiding array shifts during insertion and deletion. This allows for high-throughput event processing and settlement.


---

## 🗂️ Project Structure

```
onchain-orderbook/
├── Cargo.toml                # Rust program manifest
├── src/
│   ├── lib.rs                # Program entrypoint
│   ├── state.rs              # Core data structures (market, orderbook, events, accounts)
│   ├── processor.rs          # Instruction dispatch and processing logic
│   └── instructions/         # Handlers for each instruction
│       ├── initialize_market.rs
│       ├── create_order.rs
│       ├── consume_events.rs
│       ├── settle_funds.rs
│       ├── cancel_order.rs
│       └── mod.rs
└── client/
    ├── package.json
    ├── tsconfig.json
    ├── jest.config.js
    └── test/
        ├── program.test.ts   # End-to-end tests
        ├── schema.ts         # Borsh schemas for serialization
        └── utils.ts
```

---

## 🚀 Getting Started

### Build the Solana Program

```sh
cargo build-bpf
```
Copy the `onchain_orderbook.so` from `target/deploy` into `client/test`

### Run Client Tests

```sh
cd client
npm install
npm test
```
This runs the Jest test suite, simulating order placement, matching, event consumption, and settlement.

---

## 🛠️ How It Works

### 🏁 1. Market Initialization

- **Instruction:** `InitializeMarket`
- **Structs:** [`MarketState`](src/state.rs), [`OrderBook`](src/state.rs), [`MarketEventsAccount`](src/state.rs)
- **Description:**  
  A new market PDA is created for a pair of SPL tokens. The program initializes the market state, creates vaults for both tokens, and sets up empty orderbooks for bids and asks. The event queue is also initialized as a ring buffer for efficient event handling.

---

### 📝 2. Placing Orders

- **Instruction:** `CreateOrder`
- **Structs:** [`Order`](src/state.rs), [`OrderBook`](src/state.rs), [`OpenOrderAccount`](src/state.rs), [`UserMarketAccount`](src/state.rs), [`MarketEventsAccount`](src/state.rs)
- **Description:**  
  Users place limit orders (bids or asks) by invoking the `create_order` instruction. The program:
  - Verifies and (if needed) creates the user's `OpenOrderAccount` and `UserMarketAccount` which are basically PDAs.
  - Locks the required funds in the user's `UserMarketAccount` (either `locked_pc` or `locked_coin`).
  - Matches the new order against the opposite side of the orderbook.
  - Emits fill events to the `MarketEventsAccount` ring buffer for each match.
  - Any unfilled portion of the order is inserted into the appropriate `OrderBook` (bids or asks) using efficient binary search.

---

### 🔄 3. Event Queue Processing

- **Instruction:** `ConsumeEvents`
- **Structs:** [`MarketEventsAccount`](src/state.rs), [`UserMarketAccount`](src/state.rs), [`Event`](src/state.rs)
- **Description:**  
  The event queue is a ring buffer that stores fill and cancel events. A cron job will call `consume_events` to process up to `drain_count` events at a time. A method simulating cron is present in test. For each event:
  - The program updates the balances in the relevant `UserMarketAccount`s (for both maker and taker).
  - Events are dequeued from the `MarketEventsAccount` ring buffer, ensuring efficient, low-compute settlement.

---

### ❌ 4. Cancelling Orders

- **Instruction:** `CancelOrder`
- **Structs:** [`OrderBook`](src/state.rs), [`OpenOrderAccount`](src/state.rs), [`MarketEventsAccount`](src/state.rs)
- **Description:**  
  Users can cancel their open orders, but only the owner of an order is permitted to cancel it. The program verifies ownership, removes the order from the `OrderBook`, and emits a cancel event `EventType::Out` to the `MarketEventsAccount` for later settlement.]

---

### 💸 5. Settling Funds

- **Instruction:** `SettleFunds`
- **Structs:** [`UserMarketAccount`](src/state.rs)
- **Description:**  
  After events are processed, users can withdraw their available balances (`free_coin` and `free_pc`) from the market’s vaults to their own token accounts. The program verifies all accounts and uses SPL Token transfers to move funds.

---

### 📦 Key Structs

- [`MarketState`](src/state.rs): Market configuration and vault addresses.
- [`OrderBook`](src/state.rs): Sorted array of orders for bids/asks.
- [`Order`](src/state.rs): Individual order details.
- [`OpenOrderAccount`](src/state.rs): Tracks user’s open orders in a market.
- [`UserMarketAccount`](src/state.rs): Tracks user balances and locked funds per market.
- [`MarketEventsAccount`](src/state.rs): Ring buffer for fill/cancel events.
- [`Event`](src/state.rs): Fill or cancel event details.


---

## 📄 File Overview

- **`src/state.rs`**: Defines all core data structures, including the market, orderbook, event queue, and user accounts.
- **`src/instructions/`**: Contains handlers for each instruction (initialize, create order, consume events, settle funds, cancel order).
- **`client/test/program.test.ts`**: Comprehensive test suite covering all flows, including edge cases.
- **`client/test/schema.ts`**: Borsh schemas for serializing/deserializing program state in tests.

---

### 🧪 Test Coverage

This project includes a comprehensive suite of integration tests in [`client/test/program.test.ts`], written using the [LiteSVM](https://www.npmjs.com/package/litesvm) Solana local simulation framework. The tests cover the following scenarios:

- **Market Initialization:**  
  Verifies correct creation and initialization of the market, orderbooks, vaults, and event queue.

- **Placing Orders:**  
  Tests placing bid and ask limit orders, orderbook insertion, and fund locking in user accounts.

- **Order Matching:**  
  Validates matching logic when new orders cross the book, including partial and full fills, and correct event emission.

- **Event Queue Processing:**  
  Simulates draining the event queue, updating user balances, and ensuring events are processed in order.

- **Cancelling Orders:**  
  Ensures only the order owner can cancel, order removal from the orderbook, and emission of cancel events.

- **Settling Funds:**  
  Checks that users can withdraw their available balances from the market vaults to their own token accounts after events are processed.

---

## License 📜

This project is licensed under the [MIT License](LICENSE). 📝
