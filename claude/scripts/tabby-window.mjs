// Picks the Tabby window a script talks to. Each Tabby window is its own DevTools "page" target on the one port, in no
// fixed order, so taking the first one acts on an arbitrary window.
//   tabbyPages(port)  → every window's target, or null when the port is closed
//   callerPage(port)  → { page, window, note }: the window whose tab runs this process (its shell is one of our
//                       ancestors); else the focused window, else the first. `note` says so when it was not the caller's.
import { execFileSync } from 'node:child_process';

export async function tabbyPages (port) {
  try {
    return (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((t) => t.type === 'page');
  } catch {
    return null;
  }
}

/** Evaluates one expression in a page target and returns its value (undefined on any failure). */
export async function evaluateIn (page, expression) {
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  try {
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    const reply = await new Promise((resolve) => {
      ws.addEventListener('message', (e) => resolve(JSON.parse(e.data)), { once: true });
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    });
    return reply.result?.result?.value;
  } catch {
    return undefined;
  } finally {
    ws.close();
  }
}

/** `start` and its ancestors' pids. */
function ancestors (start) {
  const parent = new Map();
  try {
    const text = process.platform === 'win32'
      ? execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId)" }'], { encoding: 'utf8', windowsHide: true })
      : execFileSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' });
    for (const line of text.split('\n')) {
      const [pid, ppid] = line.trim().split(/\s+/).map(Number);
      if (pid) parent.set(pid, ppid);
    }
  } catch { }
  const out = new Set();
  for (let pid = start; pid && !out.has(pid); pid = parent.get(pid)) out.add(pid);
  return out;
}

const SHELL_PIDS = `(async () => {
  const app = require('@angular/core').ɵgetLContext(document.querySelector('app-root')).lView[8].app;
  const panes = app.tabs.flatMap((t) => t.getAllTabs?.() ?? [t]);
  return { born: performance.timeOrigin, focused: document.hasFocus(), pids: (await Promise.all(panes.map((p) => p.session?.pty?.getPID?.()))).filter(Boolean) };
})()`;

/** The window with a tab or pane titled `title` (exact in any window first, else containing it; any case), as callerPage returns one; else null. */
export async function pageWithTab (port, title) {
  const pages = await tabbyPages(port);
  const has = `(() => {
    const app = require('@angular/core').ɵgetLContext(document.querySelector('app-root')).lView[8].app;
    const titles = app.tabs.flatMap((t) => [t, ...(t.getAllTabs?.() ?? [])]).map((t) => (t.customTitle || t.title || '').toLowerCase());
    const want = ${JSON.stringify(String(title).toLowerCase())};
    return { born: performance.timeOrigin, exact: titles.includes(want), part: titles.some((t) => t.includes(want)) };
  })()`;
  const all = (await Promise.all((pages ?? []).map(async (page) => ({ page, w: await evaluateIn(page, has) })))).sort((a, b) => (a.w?.born ?? Infinity) - (b.w?.born ?? Infinity));
  const exact = all.findIndex((x) => x.w?.exact);
  const i = exact >= 0 ? exact : all.findIndex((x) => x.w?.part);
  return i < 0 ? null : { page: all[i].page, window: { index: i + 1, count: all.length, by: 'tab' } };
}

/**
 * `window` is { index (1-based, oldest window first, as the plugin's "Move to window" numbers them), count, by: "only" | "caller" | "focused" | "first" }.
 * `callerPid` (default this process) is where the ancestor walk starts.
 */
export async function callerPage (port, callerPid = process.pid) {
  const found = await tabbyPages(port);
  if (!found?.length) return { page: null };
  const count = found.length;
  if (count === 1) return { page: found[0], window: { index: 1, count, by: 'only' } };
  const mine = ancestors(Number(callerPid));
  const all = await Promise.all(found.map(async (page) => ({ page, w: await evaluateIn(page, SHELL_PIDS) })));
  all.sort((a, b) => (a.w?.born ?? Infinity) - (b.w?.born ?? Infinity));
  const pages = all.map((x) => x.page), windows = all.map((x) => x.w);
  const own = windows.findIndex((w) => w?.pids.some((pid) => mine.has(pid)));
  if (own >= 0) return { page: pages[own], window: { index: own + 1, count, by: 'caller' } };
  const focused = windows.findIndex((w) => w?.focused);
  const i = Math.max(focused, 0);
  const by = focused >= 0 ? 'focused' : 'first';
  return { page: pages[i], window: { index: i + 1, count, by }, note: `${count} Tabby windows, and the caller runs in none of them: used the ${by} one (window ${i + 1})` };
}
