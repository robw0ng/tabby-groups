// Claude Code hook: records that a session compacts its context, for the tabby-groups Tabby plugin (and tabby-remote
// through it). PreCompact writes the file; PostCompact (and SessionStart, Stop or SessionEnd as fallbacks) removes it.
//   <config dir>/tabby-groups/compacting/<session_id>.json  →  { "trigger": "manual" | "auto", "since": <ms> }
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let input = '';
for await (const chunk of process.stdin) input += chunk;
let hook;
try { hook = JSON.parse(input); } catch { process.exit(0); }
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
