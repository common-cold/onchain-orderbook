export const ORDERBOOK_LEN = 1013;
// export const ORDERBOOK_LEN = 99371;

export function createSideEncodedOrderId(plainOrderId: bigint, side: number) {
    const sideBytes = BigInt(side) << BigInt(63);
    return sideBytes | plainOrderId;
}