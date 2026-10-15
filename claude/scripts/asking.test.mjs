// node asking.test.mjs: runs the asking hook on sample hook inputs and transcripts, in a temporary config folder.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asking-'));
const id = '11111111-2222-3333-4444-555555555555';
const stateFile = path.join(dir, 'tabby-groups', 'asking', id + '.json');
const transcript = path.join(dir, 'transcript.jsonl');
const assistant = text => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } });

/** Runs one hook event; returns the state file afterwards ("none" when there is no file). */
function hook (event, extra = {}, transcriptLines) {
  if (transcriptLines) fs.writeFileSync(transcript, transcriptLines.join('\n') + '\n');
  const input = JSON.stringify({ session_id: id, hook_event_name: event, transcript_path: transcript, ...extra });
  spawnSync(process.execPath, [path.join(import.meta.dirname, 'asking.mjs')], { input, env: { ...process.env, CLAUDE_CONFIG_DIR: dir } });
  if (!fs.existsSync(stateFile)) return 'none';
  const { kind, source } = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  return source ? `${kind}/${source}` : kind;
}

const cases = [
  ['menu question', () => hook('PreToolUse', { tool_name: 'AskUserQuestion' }), 'question'],
  ['menu permission event stays a question', () => hook('PermissionRequest', { tool_name: 'AskUserQuestion' }), 'question'],
  ['answer clears', () => hook('PostToolUse', { tool_name: 'AskUserQuestion' }), 'none'],
  ['tool permission', () => hook('PermissionRequest', { tool_name: 'Bash' }), 'permission'],
  ['tool ran clears', () => hook('PostToolUse', { tool_name: 'Bash' }), 'none'],
  ['marker on the last line', () => hook('Stop', {}, [assistant('Built it.\n\n❓ Waiting on you: merge now or later?')]), 'question/text'],
  ['next prompt clears', () => hook('UserPromptSubmit'), 'none'],
  ['marker before a short sign-off', () => hook('Stop', {}, [assistant('Plan ready.\n❓ Waiting on you: pick A or B\nThanks.')]), 'question/text'],
  ['marker in bold and backticks', () => hook('Stop', {}, [assistant('Done part 1.\n**`❓ Waiting on you: OK to push`**')]), 'question/text'],
  ['plain question at the end', () => hook('Stop', {}, [assistant('I see two options.\n\nShould I use the old API?')]), 'question/text'],
  ['done without a question', () => hook('Stop', {}, [assistant('Is it fast? Yes.\n\nAll tests pass. Done.')]), 'none'],
  ['last text entry wins over earlier ones', () => hook('Stop', {}, [assistant('Which one?'), JSON.stringify({ type: 'user', message: { content: 'B' } }), assistant('Done with B.')]), 'none'],
  ['last_assistant_message field when present', () => hook('Stop', { last_assistant_message: 'Ready to commit?' }, [assistant('Done.')]), 'question/text'],
  ['session end clears', () => hook('SessionEnd'), 'none'],
  ['missing transcript is not a question', () => hook('Stop', { transcript_path: path.join(dir, 'missing.jsonl') }), 'none'],
];
let bad = 0;
for (const [name, run, want] of cases) {
  const got = run();
  if (got !== want) {
    bad++;
    console.log('FAIL', name, '— got', got, 'want', want);
  }
}
fs.rmSync(dir, { recursive: true, force: true });
console.log(bad ? `${bad} failed` : `all ${cases.length} passed`);
if (bad) process.exitCode = 1;
