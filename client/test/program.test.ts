import { ACCOUNT_SIZE, AccountLayout, ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, createInitializeAccountInstruction, createInitializeMintInstruction, createMintToInstruction, getAccount, getAccountLen, getAssociatedTokenAddressSync, getMinimumBalanceForRentExemptMint, getMintLen, initializeMintInstructionData, MINT_SIZE, mintToInstructionData, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AccountMeta, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, TransactionInstruction } from "@solana/web3.js";
import { FailedTransactionMetadata, LiteSVM, TransactionMetadata } from "litesvm";
import { ConsumeEventsSchema, CreateOrderSchema, EventType, MarketEventsAccount, MarketEventsAccountSchema, MarketState, MarketStateSchema, OpenOrderAccount, OpenOrderAccountSchema, OrderBook, OrderBookSchema, Side, UserMarketAccount, UserMarketAccountSchema } from "./schema";
import * as borsh from "borsh";
import { createSideEncodedOrderId, EVENT_ACCOUNT_LEN, MAX_DRAIN_COUNT, ORDERBOOK_LEN } from "./utils";


describe("Orderbook tests", () => {
    let svm: LiteSVM;
    let programId: PublicKey;
    let accountsAuthority: Keypair;
    let market: PublicKey;
    let marketEventsAccount: Keypair;
    let coinVault: PublicKey;
    let pcVault: PublicKey;
    let coinMint: Keypair;
    let pcMint: Keypair;
    let bids: Keypair;
    let asks: Keypair;
    let user: Keypair;
    let user2: Keypair;
    let user3: Keypair;
    let userCoinAta: PublicKey;
    let userPcAta: PublicKey;
    let openOrderAccount: PublicKey;
    let userMarketAccount: PublicKey;
    let test2BidLimitPrice: number
    let test2BidCoinQty: number
    let test2BidPcQty: number
    let test2AskLimitPrice: number
    let test2AskCoinQty: number
    let test2AskPcQty: number
    

    beforeAll(async ()=> {
        svm = new LiteSVM();
        programId = PublicKey.unique();
        svm.addProgramFromFile(programId, "test/onchain_orderbook.so");
        
        accountsAuthority = new Keypair();
        svm.airdrop(accountsAuthority.publicKey, BigInt(100 * LAMPORTS_PER_SOL));

        //create market events account
        marketEventsAccount = new Keypair();
        const mktEventsAccountIx = new Transaction().add(
            SystemProgram.createAccount({
                fromPubkey: accountsAuthority.publicKey,
                newAccountPubkey: marketEventsAccount.publicKey,
                lamports: Number(svm.minimumBalanceForRentExemption(BigInt(EVENT_ACCOUNT_LEN))),
                space: EVENT_ACCOUNT_LEN,
                programId: programId
            })
        );
        mktEventsAccountIx.feePayer = accountsAuthority.publicKey;
        mktEventsAccountIx.recentBlockhash = svm.latestBlockhash();
        mktEventsAccountIx.sign(accountsAuthority, marketEventsAccount);
        svm.sendTransaction(mktEventsAccountIx);


        //create mint accounts
        coinMint = new Keypair();
        const coinMintTx = new Transaction().add(
            SystemProgram.createAccount({
                fromPubkey: accountsAuthority.publicKey,
                newAccountPubkey: coinMint.publicKey,
                lamports: Number(svm.minimumBalanceForRentExemption(BigInt(MINT_SIZE))),
                space: MINT_SIZE,
                programId: TOKEN_PROGRAM_ID
            }),

            createInitializeMintInstruction(
                coinMint.publicKey,
                9,
                accountsAuthority.publicKey,
                null,
                TOKEN_PROGRAM_ID
            )
        );
        coinMintTx.feePayer = accountsAuthority.publicKey;
        coinMintTx.recentBlockhash = svm.latestBlockhash();
        coinMintTx.sign(accountsAuthority, coinMint);
        svm.sendTransaction(coinMintTx);

        pcMint = new Keypair();
        const pcMintTx = new Transaction().add(
            SystemProgram.createAccount({
                fromPubkey: accountsAuthority.publicKey,
                newAccountPubkey: pcMint.publicKey,
                lamports: Number(svm.minimumBalanceForRentExemption(BigInt(MINT_SIZE))),
                space: MINT_SIZE,
                programId: TOKEN_PROGRAM_ID
            }),

            createInitializeMintInstruction(
                pcMint.publicKey,
                9,
                accountsAuthority.publicKey,
                null,
                TOKEN_PROGRAM_ID
            )
        );
        pcMintTx.feePayer = accountsAuthority.publicKey;
        pcMintTx.recentBlockhash = svm.latestBlockhash();
        pcMintTx.sign(accountsAuthority, pcMint);
        svm.sendTransaction(pcMintTx);

        
        console.log("completed mints");

        market = PublicKey.findProgramAddressSync([
            Buffer.from("market"),
            pcMint.publicKey.toBuffer(),
            coinMint.publicKey.toBuffer()
        ], programId)[0];
        
        coinVault = PublicKey.findProgramAddressSync([
            Buffer.from("coin_vault"),
            market.toBuffer()
        ], programId)[0];

        pcVault = PublicKey.findProgramAddressSync([
            Buffer.from("pc_vault"),
            market.toBuffer()
        ], programId)[0];
    
        //creating bids and asks account off chain due to its large size
        bids = new Keypair();
        asks = new Keypair();

        let createBidsAccountIx = SystemProgram.createAccount({
            fromPubkey: accountsAuthority.publicKey,
            newAccountPubkey: bids.publicKey,
            lamports: Number(svm.minimumBalanceForRentExemption(BigInt(ORDERBOOK_LEN))),
            space: ORDERBOOK_LEN,
            programId: programId
        });

        let createAsksAccountIx = SystemProgram.createAccount({
            fromPubkey: accountsAuthority.publicKey,
            newAccountPubkey: asks.publicKey,
            lamports: Number(svm.minimumBalanceForRentExemption(BigInt(ORDERBOOK_LEN))),
            space: ORDERBOOK_LEN,
            programId: programId
        });

        let bidsAsksCreationTx = new Transaction().add(createBidsAccountIx, createAsksAccountIx);
        bidsAsksCreationTx.recentBlockhash = svm.latestBlockhash();
        bidsAsksCreationTx.feePayer = accountsAuthority.publicKey;
        bidsAsksCreationTx.sign(accountsAuthority, bids, asks);
        svm.sendTransaction(bidsAsksCreationTx);

        //creating user account and its ata
        user = new Keypair();
        svm.airdrop(user.publicKey, BigInt(100 * LAMPORTS_PER_SOL));

        //initialising open order account
        openOrderAccount = PublicKey.findProgramAddressSync(
            [
                Buffer.from("open_order"),
                market.toBuffer(),
                user.publicKey.toBuffer()
            ],
            programId
        )[0];

        //initialising user market account
        userMarketAccount = PublicKey.findProgramAddressSync(
            [
                Buffer.from("user_market_account"),
                market.toBuffer(),
                user.publicKey.toBuffer()
            ],
            programId
        )[0];

        //initialising user ATA
        userCoinAta = getAssociatedTokenAddressSync(
            coinMint.publicKey,
            user.publicKey,
            false,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );

        userPcAta = getAssociatedTokenAddressSync(
            pcMint.publicKey,
            user.publicKey,
            false,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );
        
        createAndSendCreateAtaIx(user, userCoinAta, userPcAta, coinMint.publicKey, pcMint.publicKey);
        
        //mint Coin and Pc to user
        createAndSendMintToIx(accountsAuthority, user, userCoinAta, userPcAta, coinMint.publicKey, pcMint.publicKey);
    });

    afterEach(async () => {
        if (global.gc) {
            global.gc();
        }
    });

    test("Initialize Market", async () => {
        let ix = new TransactionInstruction({
            keys: [
                {pubkey: accountsAuthority.publicKey, isSigner: true, isWritable: true},
                {pubkey: market, isSigner: false, isWritable: true},
                {pubkey: marketEventsAccount.publicKey, isSigner: false, isWritable: true},
                {pubkey: coinMint.publicKey, isSigner: false, isWritable: true},
                {pubkey: pcMint.publicKey, isSigner: false, isWritable: true},
                {pubkey: coinVault, isSigner: false, isWritable: true},
                {pubkey: pcVault, isSigner: false, isWritable: true},
                {pubkey: bids.publicKey, isSigner: false, isWritable: true},
                {pubkey: asks.publicKey, isSigner: false, isWritable: true},
                {pubkey: SystemProgram.programId, isSigner: false, isWritable: false},
                {pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false},
                {pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false},
            ],
            programId: programId,
            data: Buffer.from([0])
        });

        let tx = new Transaction().add(ix);
        tx.recentBlockhash = svm.latestBlockhash();
        tx.feePayer = accountsAuthority.publicKey;
        tx.sign(accountsAuthority);
        const sig = svm.sendTransaction(tx);
        if (sig instanceof TransactionMetadata) {
            console.log(sig.toString());
        } else if (sig instanceof FailedTransactionMetadata) {
            console.log(sig.toString());
        }
        
        // market checks
        let marketInfo = svm.getAccount(market);
        //@ts-ignore
        const marketData = new MarketState(borsh.deserialize(MarketStateSchema, marketInfo!.data));
        // console.log(marketData);
        expect(marketData.next_order_id).toBe(BigInt(1));
        
        try {
            // bids checks
            let bidsInfo = svm.getAccount(bids.publicKey);
            //@ts-ignore
            const bidsData = new OrderBook(borsh.deserialize(OrderBookSchema, bidsInfo!.data));
            expect(bidsData.side).toBe(Side.Bid);
            expect(bidsData.slots_filled).toBe(0);
            expect(bidsData.next_order_id).toBe(BigInt(0));
            expect(new PublicKey(bidsData.market)).toStrictEqual(market);


            //asks checks
            let asksInfo = svm.getAccount(asks.publicKey);
            //@ts-ignore
            const asksData = new OrderBook(borsh.deserialize(OrderBookSchema, asksInfo!.data));
            expect(asksData.side).toBe(Side.Ask);
            expect(asksData.slots_filled).toBe(0);
            expect(asksData.next_order_id).toBe(BigInt(0));
            expect(new PublicKey(asksData.market)).toStrictEqual(market);

            //market events account checks
            let eventAccInfo = svm.getAccount(marketEventsAccount.publicKey);
            //@ts-ignore
            const eventAccData = new MarketEventsAccount(borsh.deserialize(MarketEventsAccountSchema, eventAccInfo!.data));
            expect(new PublicKey(eventAccData.market)).toStrictEqual(market);
            expect(eventAccData.head).toBe(0);
            expect(eventAccData.tail).toBe(0);

        } catch (e) {
            console.log(e);
        }
    });

    test("Place Bid, Sell Order", async () => {
        //Buy Order 
        //Qty: 5
        //Price: 100
        {   
            test2BidLimitPrice = 100;
            test2BidCoinQty = 5;
            test2BidPcQty = 520;
            let args = {
            side: 0,
            limit_price: BigInt(test2BidLimitPrice),
            coin_qty: BigInt(test2BidCoinQty),
            pc_qty: BigInt(test2BidPcQty)
            }
            let ix = new TransactionInstruction({
                keys: [
                    {pubkey: accountsAuthority.publicKey, isSigner: true, isWritable: true},
                    {pubkey: market, isSigner: false, isWritable: true},
                    {pubkey: marketEventsAccount.publicKey, isSigner: false, isWritable: true},
                    {pubkey: user.publicKey, isSigner: true, isWritable: true},
                    {pubkey: userMarketAccount, isSigner: false, isWritable: true},
                    {pubkey: openOrderAccount, isSigner: false, isWritable: true},
                    {pubkey: userPcAta, isSigner: false, isWritable: true},
                    {pubkey: pcVault, isSigner: false, isWritable: true},
                    {pubkey: coinMint.publicKey, isSigner: false, isWritable: true},
                    {pubkey: pcMint.publicKey, isSigner: false, isWritable: true},
                    {pubkey: bids.publicKey, isSigner: false, isWritable: true},
                    {pubkey: asks.publicKey, isSigner: false, isWritable: true},
                    {pubkey: SystemProgram.programId, isSigner: false, isWritable: false},
                    {pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false},
                ],
                programId: programId,
                data: Buffer.concat([Buffer.from([1]), Buffer.from(borsh.serialize(CreateOrderSchema, args))]) 
            });

            let tx = new Transaction().add(ix);
            tx.recentBlockhash = svm.latestBlockhash();
            tx.feePayer = user.publicKey;
            tx.sign(accountsAuthority, user);
            const sig = svm.sendTransaction(tx);
            if (sig instanceof TransactionMetadata) {
                console.log(sig.toString());
            } else if (sig instanceof FailedTransactionMetadata) {
                console.log(sig.toString());
            }
            try {
                // bids checks
                let bidsInfo = svm.getAccount(bids.publicKey);
                //@ts-ignore
                const bidsData = new OrderBook(borsh.deserialize(OrderBookSchema, bidsInfo!.data));
                expect(bidsData.slots_filled).toBe(1);
                expect(bidsData.next_order_id).toBe(BigInt(1));
                expect(bidsData.orders[0].side).toBe(0);
                expect(bidsData.orders[0].quantity).toBe(BigInt(test2BidCoinQty));
                expect(bidsData.orders[0].price).toBe(BigInt(test2BidLimitPrice));
                expect(new PublicKey(bidsData.orders[0].owner)).toStrictEqual(user.publicKey);
                expect(bidsData.orders[0].order_id).toBe(BigInt(0));
                expect(new PublicKey(bidsData.orders[0].market)).toStrictEqual(market);
                expect(bidsData.orders[0].filled_quantity).toBe(BigInt(0));

                //asks checks
                let asksInfo = svm.getAccount(asks.publicKey);
                //@ts-ignore
                const asksData = new OrderBook(borsh.deserialize(OrderBookSchema, asksInfo!.data));
                expect(asksData.side).toBe(Side.Ask);
                expect(asksData.slots_filled).toBe(0);
                expect(asksData.next_order_id).toBe(BigInt(0));
                expect(new PublicKey(asksData.market)).toStrictEqual(market);

                //user market checks
                let userMarketInfo = svm.getAccount(userMarketAccount);
                //@ts-ignore
                const userMarketData = new UserMarketAccount(borsh.deserialize(UserMarketAccountSchema, userMarketInfo?.data));
                expect(userMarketData.free_coin).toBe(BigInt(0));
                expect(userMarketData.locked_coin).toBe(BigInt(0));
                expect(userMarketData.free_pc).toBe(BigInt(0));
                expect(userMarketData.locked_pc).toBe(BigInt(test2BidPcQty));
                expect(new PublicKey(userMarketData.market)).toStrictEqual(market);
                expect(new PublicKey(userMarketData.open_order)).toStrictEqual(openOrderAccount);
                expect(new PublicKey(userMarketData.owner)).toStrictEqual(user.publicKey);

                //open order account checks
                let openorderInfo = svm.getAccount(openOrderAccount);
                //@ts-ignore
                const openOrderData = new OpenOrderAccount(borsh.deserialize(OpenOrderAccountSchema, openorderInfo?.data));
                expect(new PublicKey(openOrderData.market)).toStrictEqual(market);
                expect(openOrderData.next_array_index).toBe(1);
                expect(new PublicKey(openOrderData.owner)).toStrictEqual(user.publicKey);
                let prevOrderId = bidsData.next_order_id - BigInt(1);
                expect(openOrderData.order_ids[0]).toBe(createSideEncodedOrderId(prevOrderId, Side.Bid));

                //Market's PC Vault checks
                let mktPcVaultInfo = svm.getAccount(pcVault);
                const mktPcVaultData = AccountLayout.decode(mktPcVaultInfo!.data);
                expect(mktPcVaultData.amount).toBe(BigInt(test2BidPcQty));

                //User's PC ATA checks
                let userPcVaultInfo = svm.getAccount(userPcAta);
                const userPcVaultData = AccountLayout.decode(userPcVaultInfo!.data);
                expect(userPcVaultData.amount).toBe(BigInt(10000 - test2BidPcQty));

                //Market Event Account checks
                let mktEventInfo = svm.getAccount(marketEventsAccount.publicKey);
                //@ts-ignore
                const mktEventData = new MarketEventsAccount(borsh.deserialize(MarketEventsAccountSchema, mktEventInfo!.data));
                expect(mktEventData.head).toBe(0);
                expect(mktEventData.tail).toBe(0);

            } catch (e) {
                console.log(e);
            }
        }
        
        //Current OrderBook
        // ASK
        //
        // ----------
        // 100 | 5
        // BID

        //Ask Order
        //Price: 200
        //Qty: 5
        {   
            test2AskLimitPrice = 200;
            test2AskCoinQty = 5;
            test2AskPcQty = 20;
            let args = {
            side: 1,
            limit_price: BigInt(test2AskLimitPrice),
            coin_qty: BigInt(test2AskCoinQty),
            pc_qty: BigInt(test2AskPcQty)
            }
            let ix = new TransactionInstruction({
                keys: [
                    {pubkey: accountsAuthority.publicKey, isSigner: true, isWritable: true},
                    {pubkey: market, isSigner: false, isWritable: true},
                    {pubkey: marketEventsAccount.publicKey, isSigner: false, isWritable: true},
                    {pubkey: user.publicKey, isSigner: true, isWritable: true},
                    {pubkey: userMarketAccount, isSigner: false, isWritable: true},
                    {pubkey: openOrderAccount, isSigner: false, isWritable: true},
                    {pubkey: userCoinAta, isSigner: false, isWritable: true},
                    {pubkey: coinVault, isSigner: false, isWritable: true},
                    {pubkey: coinMint.publicKey, isSigner: false, isWritable: true},
                    {pubkey: pcMint.publicKey, isSigner: false, isWritable: true},
                    {pubkey: bids.publicKey, isSigner: false, isWritable: true},
                    {pubkey: asks.publicKey, isSigner: false, isWritable: true},
                    {pubkey: SystemProgram.programId, isSigner: false, isWritable: false},
                    {pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false},
                ],
                programId: programId,
                data: Buffer.concat([Buffer.from([1]), Buffer.from(borsh.serialize(CreateOrderSchema, args))]) 
            });

            let tx = new Transaction().add(ix);
            tx.recentBlockhash = svm.latestBlockhash();
            tx.feePayer = user.publicKey;
            tx.sign(accountsAuthority, user);
            const sig = svm.sendTransaction(tx);
            if (sig instanceof TransactionMetadata) {
                console.log(sig.toString());
            } else if (sig instanceof FailedTransactionMetadata) {
                console.log(sig.toString());
            }
            try {
                // bids checks
                let bidsInfo = svm.getAccount(bids.publicKey);
                //@ts-ignore
                const bidsData = new OrderBook(borsh.deserialize(OrderBookSchema, bidsInfo!.data));
                expect(bidsData.side).toBe(Side.Bid);
                expect(bidsData.slots_filled).toBe(1);
                expect(bidsData.next_order_id).toBe(BigInt(1));
                expect(new PublicKey(bidsData.market)).toStrictEqual(market);

                //asks checks
                let asksInfo = svm.getAccount(asks.publicKey);
                //@ts-ignore
                const asksData = new OrderBook(borsh.deserialize(OrderBookSchema, asksInfo!.data));
                expect(asksData.slots_filled).toBe(1);
                expect(asksData.next_order_id).toBe(BigInt(1));
                expect(asksData.orders[0].side).toBe(1);
                expect(asksData.orders[0].quantity).toBe(BigInt(test2AskCoinQty));
                expect(asksData.orders[0].price).toBe(BigInt(test2AskLimitPrice));
                expect(new PublicKey(bidsData.orders[0].owner)).toStrictEqual(user.publicKey);
                expect(asksData.orders[0].order_id).toBe(BigInt(0));
                expect(new PublicKey(bidsData.orders[0].market)).toStrictEqual(market);
                expect(asksData.orders[0].filled_quantity).toBe(BigInt(0));

                //user market checks
                let userMarketInfo = svm.getAccount(userMarketAccount);
                //@ts-ignore
                const userMarketData = new UserMarketAccount(borsh.deserialize(UserMarketAccountSchema, userMarketInfo?.data));
                expect(userMarketData.free_coin).toBe(BigInt(0));
                expect(userMarketData.locked_coin).toBe(BigInt(test2AskCoinQty));
                expect(userMarketData.free_pc).toBe(BigInt(0));
                expect(userMarketData.locked_pc).toBe(BigInt(test2BidPcQty));
                expect(new PublicKey(userMarketData.market)).toStrictEqual(market);
                expect(new PublicKey(userMarketData.open_order)).toStrictEqual(openOrderAccount);
                expect(new PublicKey(userMarketData.owner)).toStrictEqual(user.publicKey);

                //open order account checks
                let openorderInfo = svm.getAccount(openOrderAccount);
                //@ts-ignore
                const openOrderData = new OpenOrderAccount(borsh.deserialize(OpenOrderAccountSchema, openorderInfo?.data));
                expect(new PublicKey(openOrderData.market)).toStrictEqual(market);
                expect(openOrderData.next_array_index).toBe(2);
                expect(new PublicKey(openOrderData.owner)).toStrictEqual(user.publicKey);
                let prevOrderId = asksData.next_order_id - BigInt(1);
                expect(openOrderData.order_ids[1]).toBe(createSideEncodedOrderId(prevOrderId, Side.Ask));

                //Market's Coin Vault checks
                let mktCoinVaultInfo = svm.getAccount(coinVault);
                const mktCoinVaultData = AccountLayout.decode(mktCoinVaultInfo!.data);
                expect(mktCoinVaultData.amount).toBe(BigInt(test2AskCoinQty));

                //User's Coin ATA checks
                let userCoinAtaInfo = svm.getAccount(userCoinAta);
                const userCoinAtaData = AccountLayout.decode(userCoinAtaInfo!.data);
                expect(userCoinAtaData.amount).toBe(BigInt(10 - test2AskCoinQty));

                //Market Event Account checks
                let mktEventInfo = svm.getAccount(marketEventsAccount.publicKey);
                //@ts-ignore
                const mktEventData = new MarketEventsAccount(borsh.deserialize(MarketEventsAccountSchema, mktEventInfo!.data));
                expect(mktEventData.head).toBe(0);
                expect(mktEventData.tail).toBe(0);
            } catch (e) {
                console.log(e);
            }
        }

        //Current OrderBook
        // ASK
        // 200 | 5
        // ----------
        // 100 | 5
        // BID
    });

    test("Place Bid, Ask Order and perform order matching", async () => {
        user2 = new Keypair();
        user3 = new Keypair();

        svm.airdrop(user2.publicKey, BigInt(100 * LAMPORTS_PER_SOL));
        svm.airdrop(user3.publicKey, BigInt(100 * LAMPORTS_PER_SOL));

        //initialising open order account for user 2
        let openOrderAccount2 = PublicKey.findProgramAddressSync(
            [
                Buffer.from("open_order"),
                market.toBuffer(),
                user2.publicKey.toBuffer()
            ],
            programId
        )[0];
        //initialising user2 market account
        let userMarketAccount2 = PublicKey.findProgramAddressSync(
            [
                Buffer.from("user_market_account"),
                market.toBuffer(),
                user2.publicKey.toBuffer()
            ],
            programId
        )[0];
        //initialising user2 ATA
        let userCoinAta2 = getAssociatedTokenAddressSync(
            coinMint.publicKey,
            user2.publicKey,
            false,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );
        let userPcAta2 = getAssociatedTokenAddressSync(
            pcMint.publicKey,
            user2.publicKey,
            false,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );
        createAndSendCreateAtaIx(user2, userCoinAta2, userPcAta2, coinMint.publicKey, pcMint.publicKey);
        createAndSendMintToIx(accountsAuthority, user2, userCoinAta2, userPcAta2, coinMint.publicKey, pcMint.publicKey);

        //initialising open order account for user 3
        let openOrderAccount3 = PublicKey.findProgramAddressSync(
            [
                Buffer.from("open_order"),
                market.toBuffer(),
                user3.publicKey.toBuffer()
            ],
            programId
        )[0];
        //initialising user3 market account
        let userMarketAccount3 = PublicKey.findProgramAddressSync(
            [
                Buffer.from("user_market_account"),
                market.toBuffer(),
                user3.publicKey.toBuffer()
            ],
            programId
        )[0];
        //initialising user3 ATA
        let userCoinAta3 = getAssociatedTokenAddressSync(
            coinMint.publicKey,
            user3.publicKey,
            false,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );
        let userPcAta3 = getAssociatedTokenAddressSync(
            pcMint.publicKey,
            user3.publicKey,
            false,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );
        createAndSendCreateAtaIx(user3, userCoinAta3, userPcAta3, coinMint.publicKey, pcMint.publicKey);
        createAndSendMintToIx(accountsAuthority, user3, userCoinAta3, userPcAta3, coinMint.publicKey, pcMint.publicKey);

        //Coin balance checks for both users
        [userCoinAta2, userCoinAta3].forEach(userCoinAta => {
            let userCoinAtaInfo = svm.getAccount(userCoinAta);
            const userCoinAtaData = AccountLayout.decode(userCoinAtaInfo!.data);
            expect(userCoinAtaData.amount).toBe(BigInt(10));
        });

        //Pc balance checks for both users
        [userPcAta2, userPcAta3].forEach(userPcAta => {
            let userPcAtaInfo = svm.getAccount(userPcAta);
            const userPcAtaData = AccountLayout.decode(userPcAtaInfo!.data);
            expect(userPcAtaData.amount).toBe(BigInt(10000));
        });


        //Current OrderBook From Previous Test
        // ASK
        // 200 | 5
        // ----------
        // 100 | 5
        // BID

        //Buy Order 
        //Qty: 3
        //Price: 220
        {
            let args = {
            side: 0,
            limit_price: BigInt(220),
            coin_qty: BigInt(3),
            pc_qty: BigInt(660)
            }
            let ix = new TransactionInstruction({
                keys: [
                    {pubkey: accountsAuthority.publicKey, isSigner: true, isWritable: true},
                    {pubkey: market, isSigner: false, isWritable: true},
                    {pubkey: marketEventsAccount.publicKey, isSigner: false, isWritable: true},
                    {pubkey: user3.publicKey, isSigner: true, isWritable: true},
                    {pubkey: userMarketAccount3, isSigner: false, isWritable: true},
                    {pubkey: openOrderAccount3, isSigner: false, isWritable: true},
                    {pubkey: userPcAta3, isSigner: false, isWritable: true},
                    {pubkey: pcVault, isSigner: false, isWritable: true},
                    {pubkey: coinMint.publicKey, isSigner: false, isWritable: true},
                    {pubkey: pcMint.publicKey, isSigner: false, isWritable: true},
                    {pubkey: bids.publicKey, isSigner: false, isWritable: true},
                    {pubkey: asks.publicKey, isSigner: false, isWritable: true},
                    {pubkey: SystemProgram.programId, isSigner: false, isWritable: false},
                    {pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false},
                ],
                programId: programId,
                data: Buffer.concat([Buffer.from([1]), Buffer.from(borsh.serialize(CreateOrderSchema, args))]) 
            });

            let tx = new Transaction().add(ix);
            tx.recentBlockhash = svm.latestBlockhash();
            tx.feePayer = user3.publicKey;
            tx.sign(accountsAuthority, user3);
            const sig = svm.sendTransaction(tx);
            if (sig instanceof TransactionMetadata) {
                console.log(sig.toString());
            } else if (sig instanceof FailedTransactionMetadata) {
                console.log(sig.toString());
            }

            // bids checks
            let bidsInfo = svm.getAccount(bids.publicKey);
            //@ts-ignore
            const bidsData = new OrderBook(borsh.deserialize(OrderBookSchema, bidsInfo!.data));
            expect(bidsData.slots_filled).toBe(1);

            //asks checks
            let asksInfo = svm.getAccount(asks.publicKey);
            //@ts-ignore
            const asksData = new OrderBook(borsh.deserialize(OrderBookSchema, asksInfo!.data));
            expect(asksData.slots_filled).toBe(1);
            expect(asksData.orders[0].filled_quantity).toBe(BigInt(3));

            //user market checks
            let userMarketInfo = svm.getAccount(userMarketAccount3);
            //@ts-ignore
            const userMarketData = new UserMarketAccount(borsh.deserialize(UserMarketAccountSchema, userMarketInfo?.data));
            expect(userMarketData.locked_pc).toBe(BigInt(660));
            
            //open order account checks
            let openorderInfo = svm.getAccount(openOrderAccount3);
            //@ts-ignore
            const openOrderData = new OpenOrderAccount(borsh.deserialize(OpenOrderAccountSchema, openorderInfo?.data));
            expect(openOrderData.next_array_index).toBe(0);

            //Market's PC Vault checks
            let mktPcVaultInfo = svm.getAccount(pcVault);
            const mktPcVaultData = AccountLayout.decode(mktPcVaultInfo!.data);
            expect(mktPcVaultData.amount).toBe(BigInt(test2BidPcQty + 660));

            //Market's Coin Vault checks
            let mktCoinVaultInfo = svm.getAccount(coinVault);
            const mktCoinVaultData = AccountLayout.decode(mktCoinVaultInfo!.data);
            expect(mktCoinVaultData.amount).toBe(BigInt(test2AskCoinQty));

            //Market Event Account checks
            let mktEventInfo = svm.getAccount(marketEventsAccount.publicKey);
            //@ts-ignore
            const mktEventData = new MarketEventsAccount(borsh.deserialize(MarketEventsAccountSchema, mktEventInfo!.data));
            expect(mktEventData.head).toBe(1);
            expect(mktEventData.tail).toBe(0);
            let event = mktEventData.events[mktEventData.head.valueOf() - 1];
            expect(event.event_type).toBe(EventType.Fill);
            expect(event.side).toBe(Side.Ask);
            expect(new PublicKey(event.maker)).toStrictEqual(user.publicKey);
            expect(new PublicKey(event.taker)).toStrictEqual(user3.publicKey);
            expect(event.coin_qty).toBe(BigInt(3));
            expect(event.pc_qty).toBe(BigInt(600));
            expect(event.maker_order_id).toBe(asksData.orders[0].order_id); //it matched with first order in asks side
        }
        
        //Current OrderBook
        // ASK
        // 200 | 2
        // ----------
        // 100 | 5
        // BID
        

        //Ask Order by User2
        //Price: 100
        //Qty: 7
        {   
            let args = {
            side: 1,
            limit_price: BigInt(100),
            coin_qty: BigInt(7),
            pc_qty: BigInt(20)
            }
            let ix = new TransactionInstruction({
                keys: [
                    {pubkey: accountsAuthority.publicKey, isSigner: true, isWritable: true},
                    {pubkey: market, isSigner: false, isWritable: true},
                    {pubkey: marketEventsAccount.publicKey, isSigner: false, isWritable: true},
                    {pubkey: user2.publicKey, isSigner: true, isWritable: true},
                    {pubkey: userMarketAccount2, isSigner: false, isWritable: true},
                    {pubkey: openOrderAccount2, isSigner: false, isWritable: true},
                    {pubkey: userCoinAta2, isSigner: false, isWritable: true},
                    {pubkey: coinVault, isSigner: false, isWritable: true},
                    {pubkey: coinMint.publicKey, isSigner: false, isWritable: true},
                    {pubkey: pcMint.publicKey, isSigner: false, isWritable: true},
                    {pubkey: bids.publicKey, isSigner: false, isWritable: true},
                    {pubkey: asks.publicKey, isSigner: false, isWritable: true},
                    {pubkey: SystemProgram.programId, isSigner: false, isWritable: false},
                    {pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false},
                ],
                programId: programId,
                data: Buffer.concat([Buffer.from([1]), Buffer.from(borsh.serialize(CreateOrderSchema, args))]) 
            });

            let tx = new Transaction().add(ix);
            tx.recentBlockhash = svm.latestBlockhash();
            tx.feePayer = user2.publicKey;
            tx.sign(accountsAuthority, user2);
            const sig = svm.sendTransaction(tx);
            if (sig instanceof TransactionMetadata) {
                console.log(sig.toString());
            } else if (sig instanceof FailedTransactionMetadata) {
                console.log(sig.toString());
            }

            // bids checks
            let bidsInfo = svm.getAccount(bids.publicKey);
            //@ts-ignore
            const bidsData = new OrderBook(borsh.deserialize(OrderBookSchema, bidsInfo!.data));
            expect(bidsData.slots_filled).toBe(0);

            //asks checks
            let asksInfo = svm.getAccount(asks.publicKey);
            //@ts-ignore
            const asksData = new OrderBook(borsh.deserialize(OrderBookSchema, asksInfo!.data));
            expect(asksData.slots_filled).toBe(2);
            expect(asksData.orders[0].quantity).toBe(BigInt(2));
            expect(asksData.orders[0].filled_quantity).toBe(BigInt(0));
            expect(asksData.orders[0].price).toBe(BigInt(100));
            expect(new PublicKey(asksData.orders[0].owner)).toStrictEqual(user2.publicKey);
            expect(new PublicKey(asksData.orders[1].owner)).toStrictEqual(user.publicKey);

            //user market checks
            let userMarketInfo = svm.getAccount(userMarketAccount2);
            //@ts-ignore
            const userMarketData = new UserMarketAccount(borsh.deserialize(UserMarketAccountSchema, userMarketInfo?.data));
            expect(userMarketData.locked_coin).toBe(BigInt(7));
            
            //open order account checks
            let openorderInfo = svm.getAccount(openOrderAccount2);
            //@ts-ignore
            const openOrderData = new OpenOrderAccount(borsh.deserialize(OpenOrderAccountSchema, openorderInfo?.data));
            expect(openOrderData.next_array_index).toBe(1);
            let prevOrderId = asksData.next_order_id - BigInt(1);
            expect(openOrderData.order_ids[0]).toBe(createSideEncodedOrderId(prevOrderId, Side.Ask));

            //Market's PC Vault checks
            let mktPcVaultInfo = svm.getAccount(pcVault);
            const mktPcVaultData = AccountLayout.decode(mktPcVaultInfo!.data);
            expect(mktPcVaultData.amount).toBe(BigInt(test2BidPcQty + 660));

            //Market's Coin Vault checks
            let mktCoinVaultInfo = svm.getAccount(coinVault);
            const mktCoinVaultData = AccountLayout.decode(mktCoinVaultInfo!.data);
            expect(mktCoinVaultData.amount).toBe(BigInt(test2AskCoinQty + 7));

            //Market Event Account checks
            let mktEventInfo = svm.getAccount(marketEventsAccount.publicKey);
            //@ts-ignore
            const mktEventData = new MarketEventsAccount(borsh.deserialize(MarketEventsAccountSchema, mktEventInfo!.data));
            expect(mktEventData.head).toBe(2);
            expect(mktEventData.tail).toBe(0);
            let event = mktEventData.events[mktEventData.head.valueOf() - 1];
            expect(event.event_type).toBe(EventType.Fill);
            expect(event.side).toBe(Side.Bid);
            expect(new PublicKey(event.maker)).toStrictEqual(user.publicKey);
            expect(new PublicKey(event.taker)).toStrictEqual(user2.publicKey);
            expect(event.coin_qty).toBe(BigInt(5));
            expect(event.pc_qty).toBe(BigInt(500));
            expect(event.maker_order_id).toBe(bidsData.orders[0].order_id); //it matched with first order in bids side
        }

        //Current OrderBook
        // ASK
        // 200 | 2
        // 100 | 2
        // ----------
        //
        // BID
    });

    test("Consume Events and settle balances from Market Events Account", async () => {
        let userMarketInfo = retrieveMakerTakerPubKeyFromEventQueueCronMethod(programId, market, marketEventsAccount.publicKey);
        if (!userMarketInfo) { 
            return;
        }

        let {userMarketList, count} = userMarketInfo;

        let args = {
            drain_count: count
        }

        let userMarketAccount = PublicKey.findProgramAddressSync(
            [
                Buffer.from("user_market_account"),
                market.toBuffer(),
                user.publicKey.toBuffer()
            ],
            programId
        )[0];
        let userMarketAccount2 = PublicKey.findProgramAddressSync(
            [
                Buffer.from("user_market_account"),
                market.toBuffer(),
                user2.publicKey.toBuffer()
            ],
            programId
        )[0];
        let userMarketAccount3 = PublicKey.findProgramAddressSync(
            [
                Buffer.from("user_market_account"),
                market.toBuffer(),
                user3.publicKey.toBuffer()
            ],
            programId
        )[0];

        //Checks before Txn
        {
            let mktEventInfo = svm.getAccount(marketEventsAccount.publicKey);
            //@ts-ignore
            const mktEventData = new MarketEventsAccount(borsh.deserialize(MarketEventsAccountSchema, mktEventInfo!.data));
            expect(mktEventData.head).toBe(2);
            expect(mktEventData.tail).toBe(0);

            //Users' market account checks
            let userMarketInfo1 = svm.getAccount(userMarketAccount);
            //@ts-ignore
            const userMarketData = new UserMarketAccount(borsh.deserialize(UserMarketAccountSchema, userMarketInfo1?.data));
            expect(userMarketData.free_coin).toBe(BigInt(0));
            expect(userMarketData.locked_coin).toBe(BigInt(5));
            expect(userMarketData.free_pc).toBe(BigInt(0));
            expect(userMarketData.locked_pc).toBe(BigInt(520));

            let userMarketInfo3 = svm.getAccount(userMarketAccount3);
            //@ts-ignore
            const userMarketData3 = new UserMarketAccount(borsh.deserialize(UserMarketAccountSchema, userMarketInfo3?.data));
            expect(userMarketData3.free_coin).toBe(BigInt(0));
            expect(userMarketData3.locked_coin).toBe(BigInt(0));
            expect(userMarketData3.free_pc).toBe(BigInt(0));
            expect(userMarketData3.locked_pc).toBe(BigInt(660));

            let userMarketInfo2 = svm.getAccount(userMarketAccount2);
            //@ts-ignore
            const userMarketData2 = new UserMarketAccount(borsh.deserialize(UserMarketAccountSchema, userMarketInfo2?.data));
            expect(userMarketData2.free_coin).toBe(BigInt(0));
            expect(userMarketData2.locked_coin).toBe(BigInt(7));
            expect(userMarketData2.free_pc).toBe(BigInt(0));
            expect(userMarketData2.locked_pc).toBe(BigInt(0));
        }

        let ix = new TransactionInstruction({
            keys: [
                {pubkey: market, isSigner: false, isWritable: true},
                {pubkey: marketEventsAccount.publicKey, isSigner: false, isWritable: true},
                {pubkey: coinMint.publicKey, isSigner: false, isWritable: true},
                {pubkey: pcMint.publicKey, isSigner: false, isWritable: true},
                {pubkey: SystemProgram.programId, isSigner: false, isWritable: false},
                {pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false},
                {pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false},
            ],
            programId: programId,
            data: Buffer.concat([Buffer.from([2]), Buffer.from(borsh.serialize(ConsumeEventsSchema, args))]) 
        });

        userMarketList.forEach(pubKey => {
            let accountMeta: AccountMeta = {
                pubkey: pubKey,
                isSigner: false,
                isWritable: true
            };
            ix.keys.push(accountMeta);
        });

        let tx = new Transaction().add(ix);
        tx.recentBlockhash = svm.latestBlockhash();
        tx.feePayer = accountsAuthority.publicKey;
        tx.sign(accountsAuthority);
        const sig = svm.sendTransaction(tx);
        if (sig instanceof TransactionMetadata) {
            console.log(sig.toString());
        } else if (sig instanceof FailedTransactionMetadata) {
            console.log(sig.toString());
        }

        //checks after Txn
        let mktEventInfo = svm.getAccount(marketEventsAccount.publicKey);
        //@ts-ignore
        const mktEventData = new MarketEventsAccount(borsh.deserialize(MarketEventsAccountSchema, mktEventInfo!.data));
        expect(mktEventData.head).toBe(2);
        expect(mktEventData.tail).toBe(2);  //tail jumped 2 steps indicating 2 events drained

        //Users' market account checks
        let userMarketInfo1 = svm.getAccount(userMarketAccount);
        //@ts-ignore
        const userMarketData = new UserMarketAccount(borsh.deserialize(UserMarketAccountSchema, userMarketInfo1?.data));
        expect(userMarketData.free_coin).toBe(BigInt(5));
        expect(userMarketData.locked_coin).toBe(BigInt(5));
        expect(userMarketData.free_pc).toBe(BigInt(600));
        expect(userMarketData.locked_pc).toBe(BigInt(520));

        let userMarketInfo3 = svm.getAccount(userMarketAccount3);
        //@ts-ignore
        const userMarketData3 = new UserMarketAccount(borsh.deserialize(UserMarketAccountSchema, userMarketInfo3?.data));
        expect(userMarketData3.free_coin).toBe(BigInt(3));
        expect(userMarketData3.locked_coin).toBe(BigInt(0));
        expect(userMarketData3.free_pc).toBe(BigInt(0));
        expect(userMarketData3.locked_pc).toBe(BigInt(660));

        let userMarketInfo2 = svm.getAccount(userMarketAccount2);
        //@ts-ignore
        const userMarketData2 = new UserMarketAccount(borsh.deserialize(UserMarketAccountSchema, userMarketInfo2?.data));
        expect(userMarketData2.free_coin).toBe(BigInt(0));
        expect(userMarketData2.locked_coin).toBe(BigInt(7));
        expect(userMarketData2.free_pc).toBe(BigInt(500));
        expect(userMarketData2.locked_pc).toBe(BigInt(0));
    });

















    function createAndSendCreateAtaIx(user: Keypair, userCoinAta: PublicKey, userPcAta: PublicKey, coinMint: PublicKey, pcMint: PublicKey) {
        let createUserAtaIx = new Transaction().add(
            createAssociatedTokenAccountInstruction(
                user.publicKey,
                userCoinAta,
                user.publicKey,
                coinMint,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
            ),
            createAssociatedTokenAccountInstruction(
                user.publicKey,
                userPcAta,
                user.publicKey,
                pcMint,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
            )
        );

        createUserAtaIx.recentBlockhash = svm.latestBlockhash();
        createUserAtaIx.feePayer = user.publicKey;
        createUserAtaIx.sign(user);
        svm.sendTransaction(createUserAtaIx);
    }

    function createAndSendMintToIx(accountsAuthority: Keypair, user: Keypair, userCoinAta: PublicKey, userPcAta: PublicKey, coinMint: PublicKey, pcMint: PublicKey) {
        const mintCoinToUserIx = createMintToInstruction(
            coinMint,
            userCoinAta,
            accountsAuthority.publicKey,
            10,
            [],
            TOKEN_PROGRAM_ID
        );

        const mintPcToUserIx = createMintToInstruction(
            pcMint,
            userPcAta,
            accountsAuthority.publicKey,
            10000,
            [],
            TOKEN_PROGRAM_ID
        );
        
        let mintCoinAndPcToUserTx = new Transaction().add(mintCoinToUserIx, mintPcToUserIx);
        mintCoinAndPcToUserTx.recentBlockhash = svm.latestBlockhash();
        mintCoinAndPcToUserTx.feePayer = user.publicKey;
        mintCoinAndPcToUserTx.sign(accountsAuthority, user);
        svm.sendTransaction(mintCoinAndPcToUserTx);
    }


    function retrieveMakerTakerPubKeyFromEventQueueCronMethod(programId: PublicKey, marketAccount: PublicKey, marketEventsAccount: PublicKey) {
        let mktEventInfo = svm.getAccount(marketEventsAccount);
        //@ts-ignore
        const mktEventData = new MarketEventsAccount(borsh.deserialize(MarketEventsAccountSchema, mktEventInfo!.data));

        if (mktEventData.head == mktEventData.tail) {
            return null;
        } 
        let size = mktEventData.size();
        let count = Math.min(size, MAX_DRAIN_COUNT);
        let tail = mktEventData.tail.valueOf();
        let pubKeySet = new Set();
        for (let i = tail; i < tail+count; i++) {
            pubKeySet.add(new PublicKey(mktEventData.events[i].maker).toString());
            pubKeySet.add(new PublicKey(mktEventData.events[i].taker).toString());
        }
        let userMarketList = new Array();
        pubKeySet.forEach(pubKey => {
            let publicKey = new PublicKey(pubKey as string);
            let userMarketAccount = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("user_market_account"),
                    marketAccount.toBuffer(),
                    publicKey.toBuffer()
                ],
                programId
            )[0];
            userMarketList.push(userMarketAccount);
        });
        return {
            userMarketList: userMarketList,
            count: count
        }
    }
});
