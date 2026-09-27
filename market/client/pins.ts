/** Testnet release with fixed receipt quotes; exact deployed bytes were read back.
 * These reviewed build inputs are the only authority for client URLs and pins.
 * Do not populate from query strings, storage, catalog responses or wallet input. */
export const MARKET_RELEASE_PINS={
 schema:'agyion-public-fade-market-v1',network:'testnet',contract:'CCS7FTPT5XGKN7Q6Y3W3EIRPNF5LE7AV2FAVZ4YYERNGUBU24AAMCSPJ',wasmHash:'b1947f2ac6bfa3f42535ed571b956c9fd1ab425b1441adca99d2c8c919ed1c6c',
 rpcUrl:'https://soroban-testnet.stellar.org',catalogUrl:'https://market-testnet.agyionlabs.dev',assets:['CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC','CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA'] as string[],
} as const;
