// Shared by the Claude Code hooks (hook.mjs, and asking/inbox/compacting.mjs run on their own): the hook's JSON input.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * The hook's input from stdin, or null. A hook left running holds the session ("running stop hooks"), and a stdin that
 * never closes would keep it: the process ends within 3 s whatever happens, and reads only until its JSON is whole.
 */
export async function readHook () {
  setTimeout(() => process.exit(0), 3000);
  // Decoded as a stream, so a character split between two chunks stays whole.
  process.stdin.setEncoding('utf8');
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    try { return JSON.parse(input); } catch { }
  }
  return null;
}

/**
 * Whether the module at `url` is the script node was started with. Node gives a module its real path, with links
 * followed (a macOS temp folder, a Windows junction), so the started path is resolved the same way.
 */
export function isMain (url) {
  try {
    return !!process.argv[1] && url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

/** A session id as Claude Code sends it, or null. */
export const sessionOf = (hook) => /^[0-9a-f-]{36}$/i.test(hook?.session_id ?? '') ? hook.session_id : null;
