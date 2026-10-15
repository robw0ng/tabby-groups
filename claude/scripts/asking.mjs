// Claude Code hook: records whether a session waits on the user for a question or a permission, for the tabby-groups
// Tabby plugin (and tabby-remote through it). One small file per session; no file means nothing is asked.
//   <config dir>/tabby-groups/asking/<session_id>.json  →  { "kind": "question" | "permission", "since": <ms> }
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let input = '';
for await (const chunk of process.stdin) input += chunk;
let hook;
try { hook = JSON.parse(input); } catch { process.exit(0); }
const id = hook.session_id;
if (!/^[0-9a-f-]{36}$/i.test(id ?? '')) process.exit(0);

const dir = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'tabby-groups', 'asking');
const file = path.join(dir, id + '.json');
const kind = hook.hook_event_name === 'PreToolUse' && hook.tool_name === 'AskUserQuestion' ? 'question'
  // Claude also asks permission to show its own question menu: that is still a question.
  : hook.hook_event_name === 'PermissionRequest' ? (hook.tool_name === 'AskUserQuestion' ? 'question' : 'permission')
  : null;
try {
  if (kind) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ kind, since: Date.now() }));
  } else {
    fs.rmSync(file, { force: true });
  }
} catch { }
// A hook never blocks Claude: no output, exit 0.
