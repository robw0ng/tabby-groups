# tabby-groups

Real tab groups for [Tabby](https://tabby.sh)'s side tab bar: nested, coloured, collapsible groups, with session icons, a folder line and search for every tab.

It runs on Windows. macOS support is built in but untested on a real Mac.

It works when Tabby's tabs are on the left or the right. With tabs on the top or the bottom, Tabby looks as usual and the groups wait until the tabs are back on the side.

## What you get

| Feature | Detail |
| --- | --- |
| Groups | Name, colour, collapse, pin. Groups go inside groups, with no depth limit, drawn as nested panels. |
| Empty groups | A group stays when its last tab moves out or closes, until you delete it (right-click its header > Delete group, offered only while it is empty). It shows as its header and a slim, muted "Empty" row, and keeps its place: an emptied group stays where it was, and a new one shows where you made it (at the right-click spot, or at the end of the group whose + you used). Add a tab with the header's + (a click opens the default tab, a right-click the picker; it stays visible in a narrow side bar too), or drag a tab onto the "Empty" row. The main window keeps its empty groups through a restart (in its localStorage); another window's end with that window, as its tabs do. The phone side bar (tabby-remote) does not show empty groups. |
| Collapse | A collapsed group still shows the tab you are in, until you select another tab |
| Drag and drop | Drop a tab on another tab to make a group, as on an iPhone. Drop on an edge to reorder. Drag a group header to move the whole group. |
| Rename | Double-click a group name or a tab title to rename it in place |
| New tab | Click a group's + to open a tab in that group. Double-click the side bar's free space outside every group for a tab outside them; a double-click inside a group (its free space, or an empty group's "Empty" row) does nothing |
| New-tab picker | Right-click empty space: a small "+ New tab" menu, each row with its icon, with Tabby's default profile, then your pinned entries, then a Files tab (with a Files-tab plugin, tabby-files, not published yet) and New empty group. Other profiles show only when pinned. Type to filter (the filter box shows once you type), ↑/↓ and Enter, Esc or a click outside closes. The tab lands in the group whose space you clicked, else at the end outside every group. Pin a profile in Settings → Tab groups → New-tab picker, or in `tabby-groups.json`: `"picker": [{ "profile"? (a profile name or id) \| "command"?, "label"?, "icon"? (an emoji or Font Awesome classes such as `fas fa-robot`; default: the profile's icon), "cwd"? }]`, e.g. `{ "profile": "WSL" }` or `{ "label": "Claude in my app", "command": "claude", "cwd": "C:\\projects\\app" }`. A `command` is typed into the default shell. |
| Session icons | Claude Code, Codex, Gemini, Node, Python, Docker, Vim, SSH, PowerShell, cmd, Bash, WSL and more |
| Your own icons | `tabby-groups.json` in Tabby's settings folder: `{ "icons": [{ "name", "title"?, "process"?, "color"?, "emoji" \| "path" \| "paths", "stroke"? }] }`. `title` and `process` are patterns for the tab title and a command line under the tab. Edits apply at once. |
| Your own buttons | `"buttons": [{ "label", "command", "cwd"?, "icon"? (Font Awesome name) \| "emoji" \| "path" \| "paths", "check"?, "checkEveryMinutes"? }]` in the same file. A button sits before Tabby's own toolbar buttons; a click types `command` into a new tab that stays open. With `check`, the button is an update: it shows (green, with a dot) only while the check exits 10 (run at start and every `checkEveryMinutes`, default 30); its tooltip says "Update available" and lists the check's output, and ✕ hides it until that output changes. With `"alwaysShow": true` it stays in the bar when there is nothing new too (plain, tooltip "nothing new"), so a click can force the update any time. A click runs `command` in the background (the icon spins), saves the output to a log, and shows a toast: "up to date ✓", the `problems`, or the `reload` plugins from a JSON object on the command's last line, with "Open log". On macOS, commands and checks run in the user's login shell. |
| Resume without a click | Settings → Tab groups → "Resume Claude tabs after a restart" (off by default; stored as `"autoResume": true` in `tabby-groups.json`): after a restart, restored Claude tabs resume by themselves, two at a time, each pair once the previous one is idle (90 s at most); the front tab, the keyboard focus and the tab order stay as they are. Off: a Claude tab resumes when it is first opened. |
| Reload in place | A plugin `tabby-x` that puts `window.__tabbyX.reload()` on the page reloads without a Tabby restart (tabby-groups and tabby-remote do). After an update button's run, the plugins in its `reload` list reload by themselves in every Tabby window, and a notice says which ones did and which need a restart. With `"autoReload": false` in `tabby-groups.json`, the update toast only offers "Reload plugins" instead; `node claude/scripts/tabby-reload.mjs [--port 9222] tabby-groups tabby-remote` does the same from a script (exit 0 all reloaded, 3 some need a restart, 2 port closed). A change to a plugin's Angular providers still needs a restart. |
| Folder line | Each tab shows its current folder under its title |
| Claude Code state | A ring while Claude works; a dot when it finished while you were away; an amber "?" while it asks you a question and "!" while it asks for a permission (needs the Claude Code plugin's hooks). Group headers count all of them. |
| Search | Matches titles, group names, folders, apps and tab numbers (`#12`). Enter opens the first match. |
| Pins | A pinned group goes first in its scope; a tab pinned in a group goes first in that group |
| Resize | Drag the side bar's inner edge |
| Restart | Groups, colours, pins and folders come back. Claude Code and Codex sessions resume in their folder. |

## Install

Follow [INSTALL.md](INSTALL.md). It installs both parts, and every step is safe to run again:

| Part | Does |
| --- | --- |
| Tabby plugin (repo root) | The groups in Tabby's side bar. Needs Tabby 1.0, no dependencies. |
| Claude Code plugin (`claude/`) | A `tabby` skill and `scripts/tabby.mjs`, so Claude Code can open, list and move tabs in groups ("put these tabs in a group") |

## Use

| To | Do |
| --- | --- |
| Make a group | Drop a tab on another tab, or right-click a tab > Add to group > New group |
| Change a group | Right-click its header: colour, rename, collapse, pin, move into another group, ungroup, close, delete (when empty) |
| Make an empty group | Right-click empty space > New empty group; in a group's space, New empty subgroup. Type its name, then Enter. |
| Close a group | Right-click its header > Close group: closes every tab in it and its subgroups (pinned ones too), then removes the groups. It asks first when a tab is busy or pinned. Reopen closed tab brings the tabs back one by one; Tabby keeps the last 5. |
| Use a tab's menu | Right-click a tab: Open in ▸ (Tabby Files with tabby-files, Explorer or Finder, VS Code when `code` is on PATH) for its folder; Open repo in <repo> ▸, the same three for its repo (a Claude tab: the repo its session works in; any other tab: the git repo of its folder; hidden when that is the folder itself); Add to group, Rename, Pin or Unpin, Duplicate (right after it, in its group), Copy path; Move to window, Close group (in a group); and More options… with Tabby's whole menu. Shift+F10 or the menu key opens it for the active tab (so a terminal app does not get those keys). With tabs on top or bottom, Tabby's own menu shows. Settings → Tab groups → Small tab menu off, or `"smallTabMenu": false` in `tabby-groups.json`, gives Tabby's full menu back. On macOS, VS Code's `code` command must be installed (VS Code: Shell Command: Install 'code' command in PATH), and a Tabby started from the Dock may not see it. |
| Choose the tab after a close | When you close the active tab, the most recently used tab of its group shows, else the most recently used tab anywhere. Settings → Tab groups → When a tab closes, show, or `"focusOnClose": "recent"` (default), `"next"` (Tabby's own) or `"previous"` in `tabby-groups.json`. |
| Collapse or expand | Click the group header |
| Leave a group | Right-click the tab > Remove from group |
| Move a tab to another window | Right-click the tab > Move to window > Window n or New window. The shell and any Claude in it keep running; a split tab moves whole; its group comes along (when it was the group's last tab, the group also stays behind, empty). If its shell ended in between, a new shell resumes the Claude or Codex session. Window 1 is the oldest window. Or drag the tab out of its window: dropped over another Tabby window, it goes to the row under the pointer (on the free space below the rows, to the end outside every group; on the terminal, it keeps its group); dropped outside every window, it opens in a new one. Escape before the drop cancels. The drop sees only Tabby windows: over another app that covers a Tabby window, the tab still goes to that Tabby window. |
| Cancel a drag | Press Escape before you let go: the tab (or group) stays where it was, in its group, with no move to another window and no split |
| Pick what a new tab opens | Right-click empty space in the side bar, a group's empty space, or a group header's + (a left-click on + opens the default tab in that group, as before) |

## Works with tabby-remote

[tabby-remote](https://github.com/robw0ng/tabby-remote) shows the same groups on your phone. Changes on either side show on both, and Tabby shows which devices have each tab open.

## Scripting

Other tools can drive the groups through `window.__tabbyGroups` in Tabby's window. The Claude Code plugin's `scripts/tabby-eval.mjs` runs a JavaScript file inside Tabby through its DevTools port and prints the result as JSON, with no shell quoting (`node claude/scripts/tabby-eval.test.mjs --port <test Tabby port>` checks it). A group is named by its id (from `list()`), a name only one group has, a path such as `"tooling/maintainers"`, or `{ name, parent }`. Names are unique only among the groups with the same parent: a new, renamed or moved group whose name a sibling has becomes "name (1)", the lowest free number; a bare name that fits several groups throws an error that asks for the path. The functions:

| Function | Does |
| --- | --- |
| `open({ title, command, args, cwd, run, group, parent, color })` | Opens a shell tab in a group and types `run` once the shell is ready. With `parent`, the group is the child of that name in the parent, made when missing (the parent too) |
| `addTab(tab, group, { color, parent })` / `removeTab(tab)` | Puts a tab in a group, or takes it out |
| `setCollapsed`, `setColor`, `setPinned`, `setParent`, `rename`, `ungroup` | Change a group |
| `deleteGroup(name)` | Deletes an empty group and its (empty) subgroups. Returns false for a group with a tab under it. |
| `closeGroup(name)` | Closes every tab in a group and its subgroups through Tabby's close, then removes the groups; asks first when a tab is busy or pinned. Resolves false when cancelled or when a tab stayed open. |
| `placeAfter(newTab, fromTab)` | For a tab opened from another tab (a Files tab from a shell): files `newTab` in `fromTab`'s group and moves it right after `fromTab`; at the top level when `fromTab` has no group (after Tabby's pinned tabs, if `fromTab` is one; the new tab is not pinned). Either can be a pane of a split tab. Returns false when either tab is not open, or both are the same tab. |
| `setTabPinned(tab, pinned)` | Pins a tab inside its group |
| `drop(source, target, where)` | A drag and drop without a mouse, with the same rules |
| `tgTop: true` on a `ToolbarButtonProvider` item (weight above 0) | For another plugin: with tabs on the side, its toolbar button shows in the top row after Tabby's + and profile buttons instead of the bottom bar (same icon, title and click). With tabs on top or bottom, nothing changes. |
| `list()` | All groups in side-bar order: `id`, `name`, `path`, `parent` (the parent's name), `parentId`, colour, pin, fold, their tabs and Claude Code counts |
| `markSeen(tab)` | Clears a tab's "finished while you were away" dot |
| `tabText(name, lines = 30)` | The last `lines` non-empty screen lines of the one tab `name` names (as `say`: a title, else a part of one, or `#<n>`), as plain text. Read-only. Null when none or several match, or for a restored tab that was not opened yet. CLI: `claude/scripts/tab-read.mjs`. |
| `say(name, text, { caller })` | Types `text` into the one tab titled `name` (else the one whose title contains it) and presses Enter, without focusing it. Refuses no match, more than one match, a tab not opened yet, and the tab with the `caller` pid under its shell. Returns `{ ok, why }`. |
| `move(name, window)` / `windows()` | Moves the tab titled `name` (else the one whose title contains it), or a tab object, to window `window` (a number from `windows()`, oldest first) or `'new'`. Returns `{ ok, window }` or `{ ok: false, why }`; on a failure the tab stays. `windows()` lists `{ n, me }`. |

### Wake another session: tab-say

`node claude/scripts/tab-say.mjs <tab title> <message> [--port 9222]` types a message into another tab, so a Claude Code or Codex session there reads a file another session wrote. Exit 0 typed, 1 refused (the reason on stderr), 2 port closed. A busy Claude Code queues the message and runs it after its turn. Newlines in the message become spaces. To let Codex wake a Claude tab, add this line to its instructions (AGENTS.md), with the real path:

```
After you write a file for another session, wake it: node <tabby-groups>/claude/scripts/tab-say.mjs "<its tab title>" "read <file>"
```

## Architecture

Plain JavaScript with no build step and no dependencies: Tabby loads `index.js`, which loads the rest; the `"files"` list in `package.json` is what gets installed.

| File | Does |
| --- | --- |
| `index.js` | Installs into Tabby: the groups, the side-bar rows, drag and drop, the menus, the restore after a restart, and the `window.__tabbyGroups` API |
| `windows.js` | Moves a tab to another Tabby window with its shell still running |
| `agent.js`, `inbox.js` | A Claude tab's state (busy, asking, compacting) and its message inbox, from the tab title and the files the Claude Code hooks write |
| `processes.js`, `resume.js` | What runs in a tab and in which folder; the command that resumes a Claude Code or Codex session |
| `places.js` | Where an empty group sits among its siblings |
| `tabmenu.js` | The small tab menu: its items, VS Code on PATH, and a Claude session's repo from its transcript |
| `scope.js` | Group ids, names unique among siblings, lookup by name or path, and the migration of groups saved by name |
| `picker.js`, `buttons.js`, `settings.js` | The new-tab picker, the user's toolbar buttons, the settings page |
| `styles.js`, `icons.js`, `tooltip.js` | The look |
| `claude/` | The Claude Code plugin: the `tabby` skill, its scripts and the hooks |
| `share/` | Packs the Tabby plugin alone as a zip, with a leak check (`share/leak-check.mjs`, run by `.github/workflows/share.yml`) |

## Test

```sh
npm test
```

Runs every unit test; none needs Tabby. The tests that take `--port` (`claude/scripts/picker.e2e.mjs`, `claude/scripts/tabby-eval.test.mjs`) need a running test Tabby, never your own.

```sh
node test-resume.js
```

Checks the command that resumes a Claude Code session after a restart, and its quoting for PowerShell and POSIX shells.

```sh
node test-inbox.js
node claude/scripts/inbox.test.mjs
```

Check the inbox: a message for a Claude tab is queued, never typed over a draft or a question, and an idle Claude gets one nudge per new message; the hook hands each message over once.

```sh
node claude/scripts/hooks-exit.test.mjs
```

Checks that every Claude Code hook ends by itself while its stdin stays open: within 3 s with nothing sent, at once with its whole input. A hook left running holds its session on "running stop hooks".

```sh
node test-picker.js
node test-places.js
node test-scope.js
node test-tabmenu.js
node claude/scripts/picker.e2e.mjs --port <a test Tabby's DevTools port>
```

Check the new-tab picker (its rows, the filter and where the new tab lands), empty groups and where they sit, Close group, and Esc cancelling a drag; the e2e right-clicks and drags in a test Tabby (it closes that window's tabs).

## Licence

MIT. See [LICENSE](LICENSE).
