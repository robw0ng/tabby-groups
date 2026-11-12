// node hooks-exit.test.mjs: every hook ends by itself while Claude Code's stdin stays open. With nothing sent it exits on
// its 3 s timer; with its whole JSON sent it does its work and exits at once. A hook left running holds the session.
// A hook does its work (writes its file, prints its message) only after its read loop ends, and the loop ends only on
// whole JSON: a hook that waited for stdin to close would reach its 3 s timer first and do nothing. So the work done,
// with exit 0, proves the early exit; the time is only logged (a busy machine can take 3 s just to start node).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-exit-'));
const id = '11111111-2222-3333-4444-555555555555';
/** Runs a hook with stdin never closed; `input` is written first when given, `split` writes it in two halves 300 ms apart. */
const run = (file, input, split) => new Promise((resolve) => {
  const t = Date.now();
  let out = '';
  const p = spawn(process.execPath, [path.isAbsolute(file) ? file : path.join(import.meta.dirname, file)], { stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, CLAUDE_CONFIG_DIR: cfg } });
  p.stdout.on('data', (d) => { out += d; });
  const json = input && JSON.stringify(input);
  if (json && split) {
    p.stdin.write(json.slice(0, json.length >> 1));
    setTimeout(() => p.stdin.write(json.slice(json.length >> 1)), 300);
  } else if (json) {
    p.stdin.write(json);
  }
  const kill = setTimeout(() => p.kill(), 8000);
  p.on('exit', (code) => { clearTimeout(kill); resolve({ code, ms: Date.now() - t, out }); });
});

let bad = 0;
const check = (name, ok, detail) => { if (!ok) { bad++; console.error(`FAIL ${name} ${JSON.stringify(detail)}`); } };

const hooks = ['asking.mjs', 'compacting.mjs', 'inbox.mjs'];
const idle = await Promise.all(hooks.map((f) => run(f)));
for (const r of idle) {
  check('nothing sent: exits 0 on its timer, well before 8 s', r.code === 0 && r.ms < 6000, r);
}
// Soft: a slow run is reported, not failed.
const early = Math.min(...idle.map((r) => r.ms)) - 1500;
const slow = (name, r) => { if (r.ms >= early) console.log(`note: ${name} took ${r.ms} ms (timer runs at about ${early + 1500} ms); passed on its output`); };

let r = await run('compacting.mjs', { session_id: id, hook_event_name: 'PreCompact', trigger: 'auto' }, true);
const compactFile = path.join(cfg, 'tabby-groups', 'compacting', id + '.json');
let written = null;
try { written = JSON.parse(fs.readFileSync(compactFile, 'utf8')); } catch { }
check('compacting: reads its input sent in two parts, writes its file and exits 0', r.code === 0 && written?.trigger === 'auto', { r, written });
slow('compacting', r);
r = await run('asking.mjs', { session_id: id, hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion' });
const askingFile = path.join(cfg, 'tabby-groups', 'asking', id + '.json');
check('asking: writes its file and exits 0', r.code === 0 && fs.existsSync(askingFile), { r });
slow('asking', r);
// The old hook (no break: it waits for stdin to close) must fail the same check: its timer ends it before the work.
fs.rmSync(askingFile, { force: true });
const hanging = path.join(cfg, 'asking-hanging.mjs');
const src = fs.readFileSync(path.join(import.meta.dirname, 'asking.mjs'), 'utf8');
fs.writeFileSync(hanging, src.replace('hook = JSON.parse(input); break;', 'hook = JSON.parse(input);'));
check('the check has teeth: a copy without the break was made', fs.readFileSync(hanging, 'utf8') !== src);
r = await run(hanging, { session_id: id, hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion' });
check('the old hanging hook writes nothing (so the check above would fail on it)', !fs.existsSync(askingFile), { r });
const inbox = path.join(cfg, 'tabby-groups', 'inbox');
fs.mkdirSync(inbox, { recursive: true });
fs.writeFileSync(path.join(inbox, id + '.jsonl'), JSON.stringify({ text: 'hello', at: 1 }) + '\n');
r = await run('inbox.mjs', { session_id: id, hook_event_name: 'UserPromptSubmit' });
let context = null;
try { context = JSON.parse(r.out).hookSpecificOutput.additionalContext; } catch { }
check('inbox: prints its message whole and exits 0', r.code === 0 && context?.endsWith('hello'), { r });
slow('inbox', r);

fs.rmSync(cfg, { recursive: true, force: true });
console.log(bad ? `${bad} failed` : 'all passed');
process.exit(bad ? 1 : 0);
