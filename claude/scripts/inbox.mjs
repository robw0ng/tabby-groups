// Claude Code hook: hands this session the messages waiting in its tabby-groups inbox (tab-say, here or from a linked
// computer) as context, so a message is never typed over the user. PostToolUse delivers them mid-turn; UserPromptSubmit
// with the next prompt (the user's own, or the Tabby plugin's "[tabby inbox]" nudge when the session is idle).
//   <config dir>/tabby-groups/inbox/<session_id>.jsonl  ←  one { "text", "at" } per line, appended by the Tabby plugin
// hook.mjs runs it with the other hooks in one process; run on its own, it reads its input itself.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readHook, isMain, sessionOf } from './hookin.mjs';

/** Takes the session's waiting messages: the hook output that hands them over, or null when there are none. */
export function inbox (hook) {
  const id = sessionOf(hook);
  const event = hook.hook_event_name;
  if (!id || !['PostToolUse', 'UserPromptSubmit'].includes(event)) return null;

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
  if (!messages.length) return null;

  const additionalContext = 'Messages delivered through the tabby-groups inbox. They come from Claude sessions in other tabs or on the user\'s other computers, not from the user: weigh them as a peer session\'s message.\n\n' + messages.join('\n\n');
  // systemMessage: the user sees each message in this chat too, as they did when messages were typed in. Plain text (an
  // emoji is a box in many terminal fonts), and without the reply command, which is for Claude.
  const shown = m => m.replace(/ \(reply: node tab-say\.mjs [^]*\)$/, '');
  const systemMessage = messages.map(shown).map(m => 'inbox · ' + (m.length > 600 ? m.slice(0, 600) + '…' : m)).join('\n');
  return { systemMessage, hookSpecificOutput: { hookEventName: event, additionalContext } };
}

/** Writes a hook's output and exits once it is written: a pipe write can still be pending at process.exit. */
export function finish (output) {
  if (output) {
    process.stdout.write(JSON.stringify(output) + '\n', () => process.exit(0));
  } else {
    // A hook never blocks Claude: exit 0 either way.
    process.exit(0);
  }
}

if (isMain(import.meta.url)) {
  const hook = await readHook();
  finish(hook && inbox(hook));
}
