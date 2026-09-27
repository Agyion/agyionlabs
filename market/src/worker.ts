import {createCatalog} from './catalog.ts';
import {createChainReader} from './chain.ts';
import type {MarketEnv} from './types.ts';
export default {async fetch(request:Request,env:MarketEnv):Promise<Response>{
 try{return await createCatalog(env,createChainReader(env)).fetch(request);}
 catch{return Response.json({error:'CATALOG_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
}};
