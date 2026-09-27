import React from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import PickupLocation from '../../app/app/components/market/PickupLocation';
const mock=vi.hoisted(()=>({load:vi.fn()}));
vi.mock('../../app/app/lib/market/places',async importOriginal=>({...await importOriginal<object>(),loadPlaceIndex:mock.load}));
let success:PositionCallback,error:PositionErrorCallback;const locate=vi.fn();
beforeEach(()=>{mock.load.mockReset();locate.mockReset();locate.mockImplementation((yes,no)=>{success=yes;error=no;});Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:locate}});});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('requests one approximate location only on click and emits an area without retaining precise coordinates',()=>{
 const choose=vi.fn();render(<PickupLocation active onChoose={choose}/>);expect(locate).not.toHaveBeenCalled();expect(mock.load).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Search near me'}));fireEvent.click(screen.getByRole('button',{name:'Finding you…'}));expect(locate).toHaveBeenCalledTimes(1);
 expect(locate).toHaveBeenCalledWith(expect.any(Function),expect.any(Function),{enableHighAccuracy:false,maximumAge:60000,timeout:10000});
 act(()=>success({coords:{latitude:41.1234567,longitude:29.1234567,accuracy:80}} as GeolocationPosition));
 expect(choose).toHaveBeenCalledExactlyOnceWith(expect.arrayContaining([expect.any(Number)]),'Near you');expect(screen.queryByText(/41.1234567/)).toBeNull();
});
it('handles denial, invalid coordinates and timeout with a usable city alternative',()=>{
 vi.useFakeTimers();const choose=vi.fn();render(<PickupLocation active onChoose={choose}/>);
 fireEvent.click(screen.getByRole('button',{name:'Search near me'}));act(()=>error({code:1} as GeolocationPositionError));expect(screen.getByRole('status').textContent).toContain('Choose a city');
 fireEvent.click(screen.getByRole('button',{name:'Search near me'}));act(()=>success({coords:{latitude:Infinity,longitude:29,accuracy:3}} as GeolocationPosition));expect(choose).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Search near me'}));act(()=>vi.advanceTimersByTime(11000));expect(screen.getByRole('button',{name:'Search near me'}).hasAttribute('disabled')).toBe(false);
 expect(screen.getByLabelText('City or town')).toBeTruthy();expect(choose).not.toHaveBeenCalled();
});
it('discards location results after hide or unmount, including repeated callbacks',()=>{
 const choose=vi.fn(),view=render(<PickupLocation active onChoose={choose}/>);fireEvent.click(screen.getByRole('button',{name:'Search near me'}));const late=success;
 view.rerender(<PickupLocation active={false} onChoose={choose}/>);act(()=>late({coords:{latitude:41,longitude:29,accuracy:3}} as GeolocationPosition));expect(choose).not.toHaveBeenCalled();
 view.rerender(<PickupLocation active onChoose={choose}/>);fireEvent.click(screen.getByRole('button',{name:'Search near me'}));view.unmount();act(()=>success({coords:{latitude:41,longitude:29,accuracy:3}} as GeolocationPosition));expect(choose).not.toHaveBeenCalled();
});
it('searches on submit, displays disambiguation and does not request device location for a city',async()=>{
 const choose=vi.fn();mock.load.mockResolvedValue([{id:1,name:'London',region:'England',country:'GB',latE6:51508530,lonE6:-125740,aliases:'london|londres'}]);
 render(<PickupLocation active onChoose={choose}/>);fireEvent.change(screen.getByLabelText('City or town'),{target:{value:'London'}});expect(mock.load).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Find city'}));const result=await screen.findByRole('button',{name:/London.*England/});expect(choose).not.toHaveBeenCalled();fireEvent.click(result);
 expect(choose).toHaveBeenCalledExactlyOnceWith(expect.any(Array),'London');expect(locate).not.toHaveBeenCalled();expect(mock.load).toHaveBeenCalledTimes(1);
});
it('aborts city loading on hide and ignores stale results after a different query',async()=>{
 let done!:(value:any)=>void;mock.load.mockImplementation(()=>new Promise(resolve=>{done=resolve}));const choose=vi.fn(),view=render(<PickupLocation active onChoose={choose}/>);
 fireEvent.change(screen.getByLabelText('City or town'),{target:{value:'London'}});fireEvent.click(screen.getByRole('button',{name:'Find city'}));await waitFor(()=>expect(mock.load).toHaveBeenCalled());
 const signal=mock.load.mock.calls[0][0].signal;view.rerender(<PickupLocation active={false} onChoose={choose}/>);expect(signal.aborted).toBe(true);
 await act(async()=>done([{id:1,name:'London',region:'England',country:'GB',latE6:51508530,lonE6:-125740,aliases:'london'}]));expect(screen.queryByRole('button',{name:/London.*England/})).toBeNull();expect(choose).not.toHaveBeenCalled();
});
