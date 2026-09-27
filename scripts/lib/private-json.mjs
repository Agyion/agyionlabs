/** Parse local private material without exposing JSON parser input excerpts. */
export function parsePrivateJson(text) {
  try { return JSON.parse(text); }
  catch { throw new Error('Invalid local private JSON'); }
}
