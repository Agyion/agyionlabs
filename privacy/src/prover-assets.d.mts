export interface PinnedArtifact {readonly bytes:number;readonly sha256:string;readonly chunks:readonly {readonly bytes:number;readonly sha256:string}[]}
export interface ProverRelease {readonly publicCount:157|4;readonly wasm:PinnedArtifact;readonly zkey:PinnedArtifact;readonly verificationKey:PinnedArtifact}
export interface ProverConfig {wasm:Uint8Array;zkey:Uint8Array;verificationKey:Uint8Array;publicCount:157|4;pins:{wasmSha256:string;zkeySha256:string;verificationKeySha256:string}}
export function loadPinnedProverArtifacts(release:ProverRelease,options?:{origin?:string;fetchImpl?:typeof fetch;signal?:AbortSignal;timeoutMs?:number}):Promise<ProverConfig>;
