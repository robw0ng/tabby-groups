// Claude Code hook: records that a session compacts its context, for the tabby-groups Tabby plugin (and tabby-remote
// through it). PreCompact writes the file; PostCompact (and SessionStart, Stop or SessionEnd as fallbacks) removes it.
//   <config dir>/tabby-groups/compacting/<session_id>.json  →  { "trigger": "manual" | "auto", "since": <ms> }
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A hook left running holds the session ("running stop hooks"), and a stdin that never closes would keep it: it ends
// within 3 s whatever happens, and reads only until its JSON is whole.
setTimeout(() => process.exit(0), 3000);
// Decoded as a stream, so a character split between two chunks stays whole.
process.stdin.setEncoding('utf8');
let input = '';
let hook;
for await (const chunk of process.stdin) {
  input += chunk;
  try { hook = JSON.parse(input); break; } catch { }
}
if (!hook) process.exit(0);
const id = hook.session_id;
if (!/^[0-9a-f-]{36}$/i.test(id ?? '')) process.exit(0);

const dir = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'tabby-groups', 'compacting');
const file = path.join(dir, id + '.json');
try {
  if (hook.hook_event_name === 'PreCompact') {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ trigger: hook.trigger === 'auto' ? 'auto' : 'manual', since: Date.now() }));
  } else {
    fs.rmSync(file, { force: true });
  }
} catch { }
// A hook never blocks Claude: no output, exit 0.
process.exit(0);
