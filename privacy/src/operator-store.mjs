/**
 * NODE ONLY, local POSIX durable first-use claims. Never import into a browser.
 * Intended for a dedicated trusted operator account and an integrity-protected
 * local filesystem with working O_EXCL/fsync semantics, not network shares.
 * Directory ownership is checked; no program can defend a journal from its own
 * OS account/root deleting or rolling it back. Back up and protect this directory
 * as append-only operational state. No secret shares, requests, plaintext,
 * requester keys or encrypted deliveries are stored here, only public digests.
 *
 * Acknowledgement follows file+directory fsync. Any existing entry, including
 * an incomplete/corrupt one from a failed attempt, consumes the key. An I/O
 * failure faults this instance permanently and never deletes a claim. There is
 * intentionally no release, reset, truncate, repair or overwrite API.
 */
import { constants } from 'node:fs';
import { mkdir, open, lstat, realpath } from 'node:fs/promises';
import { isAbsolute, resolve, dirname, join } from 'node:path';
import { record, hex } from './validation.mjs';

export class ReplayStorageError extends Error {
  constructor() { super('Durable replay storage is unavailable; no disclosure was authorized by this claim.'); this.name='ReplayStorageError'; this.code='REPLAY_STORAGE_UNAVAILABLE'; }
}
function unavailable() { throw new ReplayStorageError(); }
function directoryStat(s,uid) {
  if (!s.isDirectory() || s.uid !== uid || (s.mode & 0o7777n) !== 0o700n) unavailable();
}
function sameInode(a,b) { return a.dev === b.dev && a.ino === b.ino; }
async function checkAncestors(directory,uid) {
  for (let path = dirname(directory);;path = dirname(path)) {
    const s = await lstat(path,{bigint:true});
    // Root/current UID are the trusted account boundary. Sticky directories
    // such as /tmp cannot be used by other users to replace our owned child;
    // ordinary group/world-writable parents could, despite the child's0700.
    if (!s.isDirectory() || (s.uid !== uid && s.uid !== 0n)
      || ((s.mode & 0o022n) !== 0n && (s.mode & 0o1000n) === 0n)) unavailable();
    if (dirname(path) === path) return;
  }
}

export async function createFileReplayStore(options) {
  const v = record(options,['directory'],'replayStore'), directory = v.directory;
  if (typeof process.getuid !== 'function' || process.platform === 'win32'
    || !Number.isInteger(constants.O_NOFOLLOW) || !Number.isInteger(constants.O_DIRECTORY)
    || typeof directory !== 'string' || directory.length > 4096 || !isAbsolute(directory)
    || resolve(directory) !== directory) unavailable();
  const uid = BigInt(process.getuid()), dirFlags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
  let dirHandle, original;
  try {
    // Reject symlink aliases (including ancestors) rather than silently moving
    // the operator's durable state to a different directory.
    const parent = dirname(directory);
    if (await realpath(parent) !== parent) unavailable();
    await checkAncestors(directory,uid);
    try { await mkdir(directory,{mode:0o700}); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    directoryStat(await lstat(directory,{bigint:true}),uid);
    dirHandle = await open(directory,dirFlags);
    original = await dirHandle.stat({bigint:true}); directoryStat(original,uid);
    if (!sameInode(original,await lstat(directory,{bigint:true})) || await realpath(directory) !== directory) unavailable();
    // fsync the parent too: a newly created private directory must itself be
    // durable before claims inside it can be acknowledged.
    const parentHandle = await open(parent,dirFlags);
    try { await parentHandle.sync(); } finally { await parentHandle.close(); }
    await dirHandle.sync();
  } catch {
    await dirHandle?.close().catch(() => {}); unavailable();
  }
  let failed = false, closed = false, closing;
  const active = new Set();
  async function checkDirectory() {
    await checkAncestors(directory,uid);
    const actual = await lstat(directory,{bigint:true}), held = await dirHandle.stat({bigint:true});
    directoryStat(actual,uid); directoryStat(held,uid);
    if (!sameInode(actual,original) || !sameInode(held,original) || await realpath(directory) !== directory) unavailable();
  }
  async function claim(key,digest) {
    let file;
    try {
      await checkDirectory();
      try {
        file = await open(join(directory,`${key}.json`),constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,0o600);
      } catch (error) {
        if (error.code === 'EEXIST') return false;
        throw error;
      }
      const metadata = await file.stat({bigint:true});
      if (!metadata.isFile() || metadata.uid !== uid || metadata.nlink !== 1n || (metadata.mode & 0o7777n) !== 0o600n) unavailable();
      await checkDirectory();
      await file.writeFile(JSON.stringify({version:'1',replayKey:key,authorizationDigest:digest})+'\n','utf8');
      await file.sync();
      await file.close(); file = undefined;
      await dirHandle.sync();
      await checkDirectory();
      if (failed) unavailable(); // Another in-flight claim may have faulted it.
      return true;
    } catch {
      failed = true;
      // Preserve even a partially written marker; attempt to make the consumed
      // pathname durable too. Never infer success from these best-effort calls.
      await file?.close().catch(() => {});
      await dirHandle.sync().catch(() => {});
      unavailable();
    }
  }
  return Object.freeze({
    async claimRequest(replayKey,authorizationDigest) {
      const key = hex(replayKey,32,'replayKey'), digest = hex(authorizationDigest,32,'authorizationDigest');
      if (closed || failed) unavailable();
      const pending = claim(key,digest); active.add(pending);
      try { return await pending; } finally { active.delete(pending); }
    },
    close() {
      if (closing) return closing;
      closed = true;
      closing = (async () => { await Promise.allSettled([...active]); await dirHandle.close(); })();
      return closing;
    },
  });
}
