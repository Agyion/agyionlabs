import {File as NodeFile} from 'node:buffer';
import {afterEach,expect,it,vi} from 'vitest';
import {readPrivateBackupRelease} from '../app/lib/private/backup-release';
import {resolvePrivateRelease,DEFAULT_PRIVATE_RELEASE_KEY} from '../app/lib/private/release';

afterEach(()=>vi.unstubAllGlobals());
it('looks up only a compiled scope from a bounded actual backup file without authenticating it',async()=>{
 vi.stubGlobal('File',NodeFile);const selected=await resolvePrivateRelease(DEFAULT_PRIVATE_RELEASE_KEY),fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 const file=new File([JSON.stringify({version:'2',kind:'CompletePrivacyKeyBackup',scope:selected.release.scope,encrypted:'not authenticated'})],'hint.json');
 expect(await readPrivateBackupRelease(file)).toBe(selected);expect(fetch).not.toHaveBeenCalled();
});
it('rejects credentials, unknown profiles, malformed bytes and non-file inputs before switching',async()=>{
 vi.stubGlobal('File',NodeFile);const selected=await resolvePrivateRelease(DEFAULT_PRIVATE_RELEASE_KEY),fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 for(const value of [{version:'1',kind:'EncryptedPrivateCredential',scope:selected.release.scope},{version:'2',kind:'CompletePrivacyKeyBackup',scope:{...selected.release.scope,profileId:'ab'.repeat(32)}},null,{}]){
  await expect(readPrivateBackupRelease(new File([JSON.stringify(value)],'wrong.json'))).rejects.toThrow();
 }
 await expect(readPrivateBackupRelease(new File([new Uint8Array([255])],'invalid.json'))).rejects.toThrow();
 await expect(readPrivateBackupRelease(new File([new Uint8Array(3*1024*1024+1)],'large.json'))).rejects.toThrow();
 await expect(readPrivateBackupRelease({size:1,arrayBuffer:vi.fn()} as unknown as File)).rejects.toThrow();
 expect(fetch).not.toHaveBeenCalled();
});
