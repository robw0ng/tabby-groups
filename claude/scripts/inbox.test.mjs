// node inbox.test.mjs: runs the inbox hook on a sample inbox, in a temporary config folder.
import { spawnSync } from 'node:child_process';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inbox-'));
const id = '11111111-2222-3333-4444-555555555555';
const file = path.join(dir, 'tabby-groups', 'inbox', id + '.jsonl');
fs.mkdirSync(path.dirname(file), { recursive: true });

/** Runs one hook event; returns its parsed output, or null when it printed nothing. */
function hook (event, sessionId = id) {
  const input = JSON.stringify({ session_id: sessionId, hook_event_name: event });
  const r = spawnSync(process.execPath, [path.join(import.meta.dirname, 'inbox.mjs')], { input, env: { ...process.env, CLAUDE_CONFIG_DIR: dir } });
  assert.strictEqual(r.status, 0);
  return r.stdout.toString().trim() ? JSON.parse(r.stdout) : null;
}
const put = (...texts) => fs.writeFileSync(file, texts.map(text => JSON.stringify({ text, at: 1 }) + '\n').join('') + 'not json\n');

try {
  assert.strictEqual(hook('PostToolUse'), null, 'no inbox: no output');

  const reply = ' (reply: node tab-say.mjs "x" "<reply>" --computer ROB-SWIFT, from the tabby-groups plugin)';
  put('[from ROB-SWIFT] one' + reply, '[from ROB-SWIFT] two');
  const out = hook('PostToolUse');
  assert.strictEqual(out.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(out.hookSpecificOutput.additionalContext, /not from the user[\s\S]*one \(reply: [^\n]*\n\n\[from ROB-SWIFT\] two$/);
  assert.strictEqual(out.systemMessage, 'inbox · [from ROB-SWIFT] one\ninbox · [from ROB-SWIFT] two', 'the user sees each message, without the reply command');
  assert.ok(!fs.existsSync(file), 'taken messages are gone');
  assert.strictEqual(hook('UserPromptSubmit'), null, 'each message is delivered once');

  put('three');
  assert.strictEqual(hook('Stop'), null, 'other events leave the inbox alone');
  assert.strictEqual(hook('PostToolUse', '../x'), null, 'a bad session id is ignored');
  assert.match(hook('UserPromptSubmit').hookSpecificOutput.additionalContext, /three$/);
  assert.deepStrictEqual(fs.readdirSync(path.dirname(file)), [], 'no .taking file is left behind');
  console.log('inbox: all passed');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
