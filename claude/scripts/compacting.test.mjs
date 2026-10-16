// node compacting.test.mjs: runs the compacting hook on sample hook inputs, in a temporary config folder.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compacting-'));
const id = '11111111-2222-3333-4444-555555555555';
const stateFile = path.join(dir, 'tabby-groups', 'compacting', id + '.json');

/** Runs one hook event; returns the trigger in the state file afterwards ("none" when there is no file). */
function hook (event, extra = {}) {
  const input = JSON.stringify({ session_id: id, hook_event_name: event, ...extra });
  spawnSync(process.execPath, [path.join(import.meta.dirname, 'compacting.mjs')], { input, env: { ...process.env, CLAUDE_CONFIG_DIR: dir } });
  return fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')).trigger : 'none';
}

const cases = [
  ['manual start', () => hook('PreCompact', { trigger: 'manual' }), 'manual'],
  ['post compact clears', () => hook('PostCompact', { trigger: 'manual' }), 'none'],
  ['auto start', () => hook('PreCompact', { trigger: 'auto' }), 'auto'],
  ['session start after compact clears', () => hook('SessionStart', { source: 'compact' }), 'none'],
  ['unknown trigger counts as manual', () => hook('PreCompact', {}), 'manual'],
  ['stop clears', () => hook('Stop'), 'none'],
];
let bad = 0;
for (const [name, run, want] of cases) {
  const got = run();
  if (got !== want) { bad++; console.log(`FAIL ${name}: got ${got}, want ${want}`); }
}
fs.rmSync(dir, { recursive: true, force: true });
console.log(bad ? `${bad} failed` : `all ${cases.length} passed`);
process.exit(bad ? 1 : 0);
