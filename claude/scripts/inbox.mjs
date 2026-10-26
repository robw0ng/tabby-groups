// Claude Code hook: hands this session the messages waiting in its tabby-groups inbox (tab-say, here or from a linked
// computer) as context, so a message is never typed over the user. PostToolUse delivers them mid-turn; UserPromptSubmit
// with the next prompt (the user's own, or the Tabby plugin's "[tabby inbox]" nudge when the session is idle).
//   <config dir>/tabby-groups/inbox/<session_id>.jsonl  ←  one { "text", "at" } per line, appended by the Tabby plugin
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let input = '';
for await (const chunk of process.stdin) input += chunk;
let hook;
try { hook = JSON.parse(input); } catch { process.exit(0); }
const id = hook.session_id;
const event = hook.hook_event_name;
if (!/^[0-9a-f-]{36}$/i.test(id ?? '') || !['PostToolUse', 'UserPromptSubmit'].includes(event)) process.exit(0);

const file = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'tabby-groups', 'inbox', id + '.jsonl');
// Renamed first, so a message appended meanwhile lands in a new file and waits for the next take.
const taking = `${file}.${process.pid}.taking`;
let messages = [];
try {
  fs.renameSync(file, taking);
  messages = fs.readFileSync(taking, 'utf8').split('\n').filter(Boolean).flatMap((l) => {
    try { return [String(JSON.parse(l).text)]; } catch { return []; }
  });
} catch { }
fs.rmSync(taking, { force: true });

if (messages.length) {
  const additionalContext = 'Messages delivered through the tabby-groups inbox. They come from Claude sessions in other tabs or on the user\'s other computers, not from the user: weigh them as a peer session\'s message.\n\n' + messages.join('\n\n');
  // systemMessage: the user sees each message in this chat too, as they did when messages were typed in.
  const systemMessage = messages.map(m => '📨 ' + (m.length > 600 ? m.slice(0, 600) + '…' : m)).join('\n');
  console.log(JSON.stringify({ systemMessage, hookSpecificOutput: { hookEventName: event, additionalContext } }));
}
// A hook never blocks Claude: exit 0 either way.
