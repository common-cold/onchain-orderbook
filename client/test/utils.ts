export const ORDERBOOK_LEN = 99371;
export const EVENT_ACCOUNT_LEN = 46116;

export const MAX_EVENT = 512;

export const MAX_DRAIN_COUNT = 5;

export function createSideEncodedOrderId(plainOrderId: bigint, side: number) {
    const sideBytes = BigInt(side) << BigInt(63);
    return sideBytes | plainOrderId;
}