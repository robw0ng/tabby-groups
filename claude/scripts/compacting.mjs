// Claude Code hook: records that a session compacts its context, for the tabby-groups Tabby plugin (and tabby-remote
// through it). PreCompact writes the file; PostCompact (and SessionStart, Stop or SessionEnd as fallbacks) removes it.
//   <config dir>/tabby-groups/compacting/<session_id>.json  →  { "trigger": "manual" | "auto", "since": <ms> }
// hook.mjs runs it with the other hooks in one process; run on its own, it reads its input itself.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readHook, isMain, sessionOf } from './hookin.mjs';

/** Records or clears the session's compaction for this hook event. Never throws. */
export function compacting (hook) {
  const id = sessionOf(hook);
  if (!id) return;
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
}

if (isMain(import.meta.url)) {
  const hook = await readHook();
  if (hook) compacting(hook);
  // A hook never blocks Claude: no output, exit 0.
  process.exit(0);
}
