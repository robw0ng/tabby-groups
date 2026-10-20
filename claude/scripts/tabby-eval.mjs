// Runs a JS file inside Tabby's window through its DevTools port and prints the result as one JSON line.
//   node tabby-eval.mjs <file.js | -> [--port 9222] [--args <file.json>]
// The file is the body of an async function: it gets { app, injector, core, tg, args } and returns plain JSON data.
//   app: Tabby's AppService (app.tabs, app.activeTab, …)   injector: Angular's injector (injector.get(core.ConfigService))
//   core: require('tabby-core')                             tg: window.__tabbyGroups (undefined without the Tabby plugin)
// The code travels as a file and as JSON, never through a shell, so backslashes and quotes arrive as written.
// With several Tabby windows it runs in the one whose tab runs this process, else the focused one.
// Exit 0 with the JSON result, 2 when the port is closed, 1 when the code throws (message on stderr).
import fs from 'node:fs';
import { callerPage } from './tabby-window.mjs';

const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : undefined; };
const file = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
if (!file) {
  console.error('tabby-eval: usage: node tabby-eval.mjs <file.js | -> [--port 9222] [--args <file.json>]');
  process.exit(1);
}
const body = file === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(file, 'utf8');
const input = opt('args') ? JSON.parse(fs.readFileSync(opt('args'), 'utf8')) : null;
const port = opt('port') ?? '9222';

const { page, note } = await callerPage(port);
if (!page) {
  console.error(`tabby-eval: no DevTools port ${port} — start Tabby with --remote-debugging-port=${port}`);
  process.exit(2);
}
if (note) console.error('tabby-eval: ' + note);
const expression = `(async () => {
  const { ɵgetLContext } = require('@angular/core');
  const lv = ɵgetLContext(document.querySelector('app-root')).lView;
  const ctx = { app: lv[8].app, injector: lv[9], core: require('tabby-core'), tg: window.__tabbyGroups, args: ${JSON.stringify(input)} };
  return await (async ({ app, injector, core, tg, args }) => {
${body}
  })(ctx);
})()`;

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const reply = await new Promise((resolve) => {
  ws.addEventListener('message', (e) => resolve(JSON.parse(e.data)), { once: true });
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
});
ws.close();
const failure = reply.result?.exceptionDetails;
if (failure) {
  console.error('tabby-eval: ' + (failure.exception?.description ?? failure.text ?? 'error').split('\n')[0]);
  process.exit(1);
}
console.log(JSON.stringify(reply.result?.result?.value ?? null));
