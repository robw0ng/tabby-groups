// Claude Code hook: records whether a session waits on the user, for the tabby-groups Tabby plugin (and tabby-remote
// through it). One small file per session; no file means nothing is asked.
//   <config dir>/tabby-groups/asking/<session_id>.json  →  { "kind": "question" | "permission", "since": <ms>, "source"?: "text" }
// A turn that ends with a question in plain text counts too (source "text"): its last lines carry the marker
// "❓ Waiting on you:" (the claude-sessions rule), or else its last paragraph ends with "?".
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let input = '';
for await (const chunk of process.stdin) input += chunk;
let hook;
try { hook = JSON.parse(input); } catch { process.exit(0); }
const id = hook.session_id;
if (!/^[0-9a-f-]{36}$/i.test(id ?? '')) process.exit(0);

const MARKER = '❓ Waiting on you:';

/** The text of the last assistant message, from the hook input or the end of the session's transcript. */
function lastAssistantText () {
  if (typeof hook.last_assistant_message === 'string') return hook.last_assistant_message;
  try {
    const fd = fs.openSync(hook.transcript_path, 'r');
    const size = fs.fstatSync(fd).size;
    const length = Math.min(size, 1 << 20);
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, size - length);
    fs.closeSync(fd);
    const lines = buffer.toString('utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      let entry;
      try { entry = JSON.parse(lines[i]); } catch { continue; }
      const content = entry.type === 'assistant' ? entry.message?.content : null;
      const text = Array.isArray(content) ? content.filter(c => c.type === 'text').map(c => c.text).join('\n') : '';
      if (text.trim()) return text;
    }
  } catch { }
  return '';
}

function waitingOnUser (text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.slice(-3).some(l => l.replace(/^[>*`_\-\s]+/, '').startsWith(MARKER))) return true;
  const lastParagraph = text.trim().split(/\n\s*\n/).pop() ?? '';
  return /\?[\s*`_)"']*$/.test(lastParagraph);
}

const event = hook.hook_event_name;
const state = event === 'PreToolUse' && hook.tool_name === 'AskUserQuestion' ? { kind: 'question' }
  // Claude also asks permission to show its own question menu: that is still a question.
  : event === 'PermissionRequest' ? { kind: hook.tool_name === 'AskUserQuestion' ? 'question' : 'permission' }
  : event === 'Stop' && waitingOnUser(lastAssistantText()) ? { kind: 'question', source: 'text' }
  : null;

const dir = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'tabby-groups', 'asking');
const file = path.join(dir, id + '.json');
try {
  if (state) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ ...state, since: Date.now() }));
  } else {
    fs.rmSync(file, { force: true });
  }
} catch { }
// A hook never blocks Claude: no output, exit 0.
