export declare const decodeBase64: (s: string) => Uint8Array;
export declare const encodeBase64: (s: Uint8Array) => string;
export declare class Stanza {
    readonly args: string[];
    readonly body: Uint8Array;
    constructor(args: string[], body: Uint8Array);
}
export declare function parseHeader(header: Uint8Array): {
    recipients: Stanza[];
    MAC: Uint8Array;
    headerNoMAC: Uint8Array;
    rest: Uint8Array;
};
export declare function encodeHeaderNoMAC(recipients: Stanza[]): Uint8Array;
export declare function encodeHeader(recipients: Stanza[], MAC: Uint8Array): Uint8Array;
