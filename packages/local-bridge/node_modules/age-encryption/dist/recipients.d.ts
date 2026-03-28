import { Stanza } from "./format.js";
export interface x25519Identity {
    identity: Uint8Array;
    recipient: Uint8Array;
}
export declare function x25519Wrap(fileKey: Uint8Array, recipient: Uint8Array): Stanza;
export declare function x25519Unwrap(s: Stanza, i: x25519Identity): Uint8Array | null;
export declare function scryptWrap(fileKey: Uint8Array, passphrase: string, logN: number): Stanza;
export declare function scryptUnwrap(s: Stanza, passphrase: string): Uint8Array | null;
