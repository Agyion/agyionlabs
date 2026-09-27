// @vitest-environment jsdom
import React from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {WalletSignatureRejectedError} from '../app/lib/wallet-errors';
import {PrivateFeeConfirmationCancelledError} from '../app/lib/private-operation-errors';
const boundary=vi.hoisted(()=>({workspace:null as unknown as ReturnType<typeof fixture>['workspace'],vault:null as unknown as ReturnType<typeof fixture>['vault']}));
vi.mock('../app/components/app/PrivateWorkspaceProvider',()=>({usePrivateWorkspace:()=>boundary.workspace}));
vi.mock('../app/lib/privateVault',()=>({usePrivateVault:()=>boundary.vault}));
vi.mock('../app/components/app/PrivateVault',()=>({default:()=>null}));
vi.mock('../app/components/app/PrivatePendingRecovery',()=>({default:()=>null}));
vi.mock('../app/components/app/PrivateTriggerAttester',()=>({default:()=>null}));
vi.mock('../app/components/market/EnvoyDiscovery',()=>({default:()=>null}));
// UI boundary only; cryptographic SDK behavior is exercised by protocol tests.
vi.mock('@stellar/stellar-sdk',()=>({Asset:{native:()=>({contractId:()=> 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'})},Networks:{TESTNET:'Test SDF Network ; September 2015'},StrKey:{decodeContract:()=>Buffer.from('22'.repeat(32),'hex')}}));
import PrivateInstrumentPanel from '../app/components/app/PrivateInstrumentPanel';
const contract='CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',asset='22'.repeat(32);
const source='GCMDV4NGAKUKEEFB5CSGQIUKN4PROP2LUSPYFTVH75JH4DBYQC6EROU5';
function fixture(){
 const ready={status:'ready',busy:null,grants:[],error:null};
 const handle={id:'fixture-prepared',summary:{action:'deposit',asset,amount:'100000'},publicFeePayer:source,maxFeeStroops:'10000000',credentials:[]};
 const protocol={prepare:vi.fn().mockResolvedValue(handle),submit:vi.fn(),refresh:vi.fn(),refreshPending:vi.fn().mockResolvedValue([])};
 const vault={state:ready,controller:{getSnapshot:()=>ready}};
 const selection={key:'fixture',scope:{profileId:'11'.repeat(32)},policy:'funding',assets:[contract]};
 const workspace={protocol,selection,releaseKey:'fixture',releaseOptions:[selection],vault:vault.controller,scope:selection.scope,snapshot:{status:'ready',phase:null,ledger:100,balances:[],notes:[],pending:[],error:null,feeQuote:null},feeLimit:'1',setFeeLimit:vi.fn(),reviewId:null as string|null,setReviewId:(id:string|null)=>{boundary.workspace.reviewId=id;},refreshPending:vi.fn().mockResolvedValue([]),selectRelease:vi.fn(),loading:false,error:null};
 return {vault,workspace};
}
beforeEach(()=>Object.assign(boundary,fixture()));
afterEach(()=>cleanup());
async function prepare(){render(<PrivateInstrumentPanel kind="pod" address={source} legacy={null}/>);fireEvent.click(screen.getByRole('button',{name:'Add funds'}));fireEvent.click(screen.getByRole('button',{name:'Prepare private operation'}));await screen.findByRole('region',{name:'Review private operation'});}
it.each([['wallet',new WalletSignatureRejectedError(),'Signature declined in the wallet. This request was not submitted.'],['fee',new PrivateFeeConfirmationCancelledError(),'Fee confirmation cancelled. No wallet signature was requested.']] as const)('%s cancellation permits only another explicit confirm and does not automatically call submit',async(_kind,cancellation,message)=>{
 const submit=boundary.workspace.protocol.submit;submit.mockRejectedValueOnce(cancellation).mockResolvedValueOnce({status:'confirmed',hash:'22'.repeat(32)});
 await prepare();fireEvent.click(screen.getByRole('button',{name:'Confirm private operation'}));
 await screen.findByText(message);
 const confirm=screen.getByRole('button',{name:'Confirm private operation'});await waitFor(()=>expect((confirm as HTMLButtonElement).disabled).toBe(false));
 expect(submit).toHaveBeenCalledTimes(1);await act(async()=>{});expect(submit).toHaveBeenCalledTimes(1);
 fireEvent.click(confirm);await screen.findByText('Confirmed transaction '+'22'.repeat(32)+'.',{exact:true});expect(submit).toHaveBeenCalledTimes(2);
});
it('an unknown signing failure keeps confirmation disabled and never displays untrusted error text',async()=>{
 const submit=boundary.workspace.protocol.submit;submit.mockRejectedValue(new Error('untrusted wallet internals'));
 await prepare();fireEvent.click(screen.getByRole('button',{name:'Confirm private operation'}));
 await screen.findByText('The operation did not complete locally. Check pending transactions before trying again.',{exact:true});
 expect((screen.getByRole('button',{name:'Confirm private operation'}) as HTMLButtonElement).disabled).toBe(true);expect(submit).toHaveBeenCalledTimes(1);expect(screen.queryByText(/untrusted wallet internals/)).toBeNull();
});
