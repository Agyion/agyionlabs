export function domainField(value:{networkId:string;contractId:string}):bigint;
export function assetField(contractId:string):bigint;
export function accountField(value:{kind:'account'|'contract';id:string}):bigint;
export function revocationTag(domain:bigint,publicKey:string):bigint;
