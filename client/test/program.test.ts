import { ACCOUNT_SIZE, AccountLayout, ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, createInitializeAccountInstruction, createInitializeMintInstruction, createMintToInstruction, getAccount, getAccountLen, getAssociatedTokenAddressSync, getMinimumBalanceForRentExemptMint, getMintLen, initializeMintInstructionData, MINT_SIZE, mintToInstructionData, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, TransactionInstruction } from "@solana/web3.js";
import { FailedTransactionMetadata, LiteSVM, TransactionMetadata } from "litesvm";
import { CreateOrderSchema, MarketState, MarketStateSchema, OrderBook, ORDERBOOK_LEN, OrderBookSchema, Side, UserMarketAccount, UserMarketAccountSchema } from "./schema";
import * as borsh from "borsh";


describe("Orderbook tests", () => {
    let svm: LiteSVM;
    let programId: PublicKey;
    let accountsAuthority: Keypair;
    let market: PublicKey;
    let coinVault: PublicKey;
    let pcVault: PublicKey;
    let coinMint: Keypair;
    let pcMint: Keypair;
    let bids: Keypair;
    let asks: Keypair;
    let user: Keypair;
    let userCoinAta: Keypair;
    let userPcAta: Keypair;
    let openOrderAccount: PublicKey;
    let userMarketAccount: PublicKey;
    

    beforeAll(async ()=> {
        svm = new LiteSVM();
        programId = PublicKey.unique();
        svm.addProgramFromFile(programId, "test/onchain_orderbook.so");
        
        accountsAuthority = new Keypair();
        svm.airdrop(accountsAuthority.publicKey, BigInt(100 * LAMPORTS_PER_SOL));

        coinMint = new Keypair();
        const coinMintTx = new Transaction().add(
            SystemProgram.createAccount({
                fromPubkey: accountsAuthority.publicKey,
                newAccountPubkey: coinMint.publicKey,
                lamports: Number(svm.minimumBalanceForRentExemption(BigInt(ACCOUNT_SIZE))),
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

        
        userCoinAta = Keypair.generate();
        userPcAta = Keypair.generate();

        let createUserAtaIx = new Transaction().add(
            SystemProgram.createAccount({
                fromPubkey: user.publicKey,
                newAccountPubkey: userCoinAta.publicKey,
                lamports: Number(svm.minimumBalanceForRentExemption(BigInt(165))),
                space: 165,
                programId: TOKEN_PROGRAM_ID
            }),
            createInitializeAccountInstruction(
                userCoinAta.publicKey,
                coinMint.publicKey,
                user.publicKey,
                TOKEN_PROGRAM_ID
            ),
            SystemProgram.createAccount({
                fromPubkey: user.publicKey,
                newAccountPubkey: userPcAta.publicKey,
                lamports: Number(svm.minimumBalanceForRentExemption(BigInt(165))),
                space: 165,
                programId: TOKEN_PROGRAM_ID
            }),
            createInitializeAccountInstruction(
                userPcAta.publicKey,
                pcMint.publicKey,
                user.publicKey,
                TOKEN_PROGRAM_ID
            )
        );

        createUserAtaIx.recentBlockhash = svm.latestBlockhash();
        createUserAtaIx.feePayer = user.publicKey;
        createUserAtaIx.sign(user, userCoinAta, userPcAta);
        svm.sendTransaction(createUserAtaIx);
        
        //mint Coin and Pc to user
        const mintCoinToUserIx = createMintToInstruction(
            coinMint.publicKey,
            userCoinAta.publicKey,
            accountsAuthority.publicKey,
            10,
            [],
            TOKEN_PROGRAM_ID
        );

        const mintPcToUserIx = createMintToInstruction(
            pcMint.publicKey,
            userPcAta.publicKey,
            accountsAuthority.publicKey,
            1000,
            [],
            TOKEN_PROGRAM_ID
        );
        
        let txxxxx = new Transaction().add(mintCoinToUserIx, mintPcToUserIx);
        txxxxx.recentBlockhash = svm.latestBlockhash();
        txxxxx.feePayer = user.publicKey;
        txxxxx.sign(accountsAuthority, user);
        svm.sendTransaction(txxxxx);
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
        tx.recentBlockhash = await svm.latestBlockhash();
        tx.feePayer = accountsAuthority.publicKey;
        tx.sign(accountsAuthority);
        const sig = await svm.sendTransaction(tx);
        if (sig instanceof TransactionMetadata) {
            console.log(sig.toString());
        } else if (sig instanceof FailedTransactionMetadata) {
            console.log(sig.toString());
        }
        
        // market checks
        let marketInfo = svm.getAccount(market);
        //@ts-ignore
        // const marketData = new MarketState(borsh.deserialize(MarketStateSchema, marketInfo!.data));
        // // console.log(marketData);
        // expect(marketData.next_order_id).toBe(BigInt(1));
        
        try {
            // bids checks
            let bidsInfo = svm.getAccount(bids.publicKey);
            //@ts-ignore
            // const bidsData = new OrderBook(borsh.deserialize(OrderBookSchema, bidsInfo!.data));
            // expect(bidsData.side).toBe(Side.Bid);
            // expect(bidsData.slots_filled).toBe(0);
            // expect(bidsData.next_order_id).toBe(BigInt(0));
            // expect(new PublicKey(bidsData.market)).toStrictEqual(market);


            // //asks checks
            let asksInfo = svm.getAccount(asks.publicKey);
            //@ts-ignore
            // const asksData = new OrderBook(borsh.deserialize(OrderBookSchema, asksInfo!.data));
            // expect(asksData.side).toBe(Side.Ask);
            // expect(asksData.slots_filled).toBe(0);
            // expect(asksData.next_order_id).toBe(BigInt(0));
            // expect(new PublicKey(asksData.market)).toStrictEqual(market);
        } catch (e) {
            console.log(e);
        }
    });

    test("Place Bid Order", async () => {
        // userCoinAta = getAssociatedTokenAddressSync(
        //     coinMint.publicKey,
        //     user.publicKey,
        //     false,
        //     TOKEN_PROGRAM_ID,
        //     ASSOCIATED_TOKEN_PROGRAM_ID
        // );

        // userPcAta = getAssociatedTokenAddressSync(
        //     pcMint.publicKey,
        //     user.publicKey,
        //     false,
        //     TOKEN_PROGRAM_ID,
        //     ASSOCIATED_TOKEN_PROGRAM_ID
        // );

        
        // console.log(coinMint.publicKey);
        // console.log(pcMint.publicKey);
        // console.log(accountsAuthority.publicKey);
        // console.log(userCoinAta.publicKey);
        // console.log(userPcAta.publicKey);
        // console.log(user.publicKey);
        
        // let createUserAtaIx = new Transaction().add(
        //     createAssociatedTokenAccountInstruction(
        //         user.publicKey,
        //         userCoinAta,
        //         user.publicKey,
        //         coinMint.publicKey,
        //         TOKEN_PROGRAM_ID,
        //         ASSOCIATED_TOKEN_PROGRAM_ID
        //     ),
        //     createAssociatedTokenAccountInstruction(
        //         user.publicKey,
        //         userPcAta,
        //         user.publicKey,
        //         pcMint.publicKey,
        //         TOKEN_PROGRAM_ID,
        //         ASSOCIATED_TOKEN_PROGRAM_ID
        //     )
        // );
        
        
        let args = {
        side: 0,
        limit_price: BigInt(100),
        coin_qty: BigInt(5),
        pc_qty: BigInt(520)
        }
        let ix = new TransactionInstruction({
            keys: [
                {pubkey: accountsAuthority.publicKey, isSigner: true, isWritable: true},
                {pubkey: market, isSigner: false, isWritable: true},
                {pubkey: user.publicKey, isSigner: true, isWritable: true},
                {pubkey: userMarketAccount, isSigner: false, isWritable: true},
                {pubkey: openOrderAccount, isSigner: false, isWritable: true},
                {pubkey: userPcAta.publicKey, isSigner: false, isWritable: true},
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
            // const bidsData = new OrderBook(borsh.deserialize(OrderBookSchema, bidsInfo!.data));
            // expect(bidsData.slots_filled).toBe(1);
            // expect(bidsData.next_order_id).toBe(BigInt(1));
            // console.log(bidsData.orders[0]);
            


            //asks checks
            let asksInfo = svm.getAccount(asks.publicKey);
            //@ts-ignore
            // const asksData = new OrderBook(borsh.deserialize(OrderBookSchema, asksInfo!.data));
            // expect(asksData.side).toBe(Side.Ask);
            // expect(asksData.slots_filled).toBe(0);
            // expect(asksData.next_order_id).toBe(BigInt(0));
            // expect(new PublicKey(asksData.market)).toStrictEqual(market);

            //user market checks
            let userMarketInfo = svm.getAccount(userMarketAccount);
            //@ts-ignore
            const userMarketData = new UserMarketAccount(borsh.deserialize(UserMarketAccountSchema, userMarketInfo?.data));
            console.log(userMarketData.owner);
            console.log(userMarketData.open_order);
            console.log(userMarketData.market);
            console.log(userMarketData.locked_pc);
            console.log(userMarketData.locked_coin);
            console.log(userMarketData.free_pc);
            console.log(userMarketData.free_coin);
            console.log(userMarketData.bump);

             //user market checks
            let pcVaultInfo = svm.getAccount(pcVault);
            // console.log(pcVaultInfo?.data);
            const data = AccountLayout.decode(pcVaultInfo!.data);
            console.log(data);


        } catch (e) {
            console.log(e);
        }

    });
});
