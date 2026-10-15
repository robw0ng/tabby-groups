// node tabby-eval.test.mjs --port <a test Tabby's DevTools port>: checks tabby-eval.mjs end to end. Read-only in that Tabby.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const i = process.argv.indexOf('--port');
const port = i > 0 ? process.argv[i + 1] : null;
if (!port) {
  console.error('usage: node tabby-eval.test.mjs --port <port> (use a test Tabby, not your own)');
  process.exit(1);
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tabby-eval-'));
const script = path.join(import.meta.dirname, 'tabby-eval.mjs');
const run = (code, extra = [], stdin) => {
  const f = path.join(dir, 'case.js');
  fs.writeFileSync(f, code);
  const r = spawnSync(process.execPath, [script, stdin ? '-' : f, ...extra], { input: stdin ? code : undefined, encoding: 'utf8' });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
};
const argsFile = path.join(dir, 'args.json');
fs.writeFileSync(argsFile, JSON.stringify({ n: 2 }));
const cases = [
  ['returns JSON from Tabby', run('return { tabs: app.tabs.length > 0, plugin: typeof tg?.list }', ['--port', port]),
    r => r.code === 0 && r.out === '{"tabs":true,"plugin":"function"}'],
  ['passes --args', run('return args.n * 21', ['--port', port, '--args', argsFile]), r => r.code === 0 && r.out === '42'],
  // The file is JavaScript, so it writes a backslash as \\ like any source file; the transport must not change it.
  ['keeps backslashes and quotes', run(String.raw`return 'C:\\core "q" ' + "it's"`, ['--port', port]),
    r => r.code === 0 && JSON.parse(r.out) === String.raw`C:\core "q" it's`],
  ['awaits promises', run('await new Promise(r => setTimeout(r, 50)); return injector.get(core.ConfigService) ? "ok" : "no"', ['--port', port]),
    r => r.code === 0 && r.out === '"ok"'],
  ['reads stdin', run('return 7', ['--port', port], true), r => r.code === 0 && r.out === '7'],
  ['exit 1 when the code throws', run('throw new Error("boom")', ['--port', port]), r => r.code === 1 && r.err.includes('boom')],
  ['exit 2 when the port is closed', run('return 1', ['--port', '1']), r => r.code === 2],
];
let bad = 0;
for (const [name, r, ok] of cases) {
  if (!ok(r)) {
    bad++;
    console.log('FAIL', name, JSON.stringify(r));
  }
}
fs.rmSync(dir, { recursive: true, force: true });
console.log(bad ? `${bad} failed` : `all ${cases.length} passed`);
if (bad) process.exitCode = 1;
