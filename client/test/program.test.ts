import { createInitializeMintInstruction, getMinimumBalanceForRentExemptMint, getMintLen, initializeMintInstructionData, MINT_SIZE, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, TransactionInstruction } from "@solana/web3.js";
import { FailedTransactionMetadata, LiteSVM, TransactionMetadata } from "litesvm";
import { MarketState, MarketStateSchema, OrderBook, ORDERBOOK_LEN, OrderBookSchema, Side } from "./schema";
import * as borsh from "borsh";


describe("Orderbook tests", () => {

    let svm = new LiteSVM();
    let programId: PublicKey;
    let accountsAuthority: Keypair;
    let market: PublicKey;
    let coinVault: PublicKey;
    let pcVault: PublicKey;
    let coinMint: Keypair;
    let pcMint: Keypair;
    let bids: Keypair;
    let asks: Keypair;

    beforeAll(async ()=> {
        programId = PublicKey.unique();
        svm.addProgramFromFile(programId, "test/onchain_orderbook.so");
        
        accountsAuthority = new Keypair();
        svm.airdrop(accountsAuthority.publicKey, BigInt(10 * LAMPORTS_PER_SOL));

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
        let bidsAsksCreationSig = svm.sendTransaction(bidsAsksCreationTx);
        console.log(bidsAsksCreationSig.toString());
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

        console.log(SystemProgram.programId);
        console.log(TOKEN_PROGRAM_ID);
        console.log(SYSVAR_RENT_PUBKEY);
        console.log("came here");

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
        
        //market checks
        let marketInfo = svm.getAccount(market);
        //@ts-ignore
        const marketData = new  MarketState(borsh.deserialize(MarketStateSchema, marketInfo!.data));
        console.log(marketData);
        expect(marketData.next_order_id).toBe(BigInt(1));
        
        //bids checks
        let bidsInfo = svm.getAccount(bids.publicKey);
        //@ts-ignore
        const bidsData = new OrderBook(borsh.deserialize(OrderBookSchema, bidsInfo!.data));
        expect(bidsData.side).toBe(Side.Bid);
        expect(bidsData.order_count).toBe(BigInt(0));
        expect(new PublicKey(bidsData.market)).toStrictEqual(market);


        //asks checks
        let asksInfo = svm.getAccount(asks.publicKey);
        //@ts-ignore
        const asksData = new OrderBook(borsh.deserialize(OrderBookSchema, asksInfo!.data));
        expect(asksData.side).toBe(Side.Ask);
        expect(asksData.order_count).toBe(BigInt(0));
        expect(new PublicKey(asksData.market)).toStrictEqual(market);
    });
});