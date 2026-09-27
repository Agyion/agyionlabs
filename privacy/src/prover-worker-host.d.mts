import type {ProverConfig} from './prover-assets.mjs';
import type {LocalProof} from './client.mjs';
export interface LocalWorkerProver {prove(witness:unknown):Promise<LocalProof>;verify(proof:string,signals:readonly string[]):Promise<boolean>;dispose():void}
export function createLocalGroth16WorkerProver(config:ProverConfig,options?:{signal?:AbortSignal}):Promise<LocalWorkerProver>;
