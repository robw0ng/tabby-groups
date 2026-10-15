---
name: tabby
description: Open, list and move Tabby terminal tabs in tab groups (the tabby-groups Tabby plugin). Use when the user asks to open a Claude Code or shell session in a Tabby tab or group, to see which tabs and groups are open, or to put tabs in a group or take them out ("put these tabs in a group", "open a Claude in group X", "what's open in Tabby").
---

# Tabby tab groups

Run the script with Node 22 or later. Its path is `scripts/tabby.mjs` in this plugin's folder. Each call prints one JSON line.

| Exit code | Meaning | Do |
| --- | --- | --- |
| 0 | Done | Report the result |
| 2 | Tabby's DevTools port is closed | Tell the user to start Tabby from a shortcut with `--remote-debugging-port=9222` (see INSTALL.md in the tabby-groups repo) |
| 1 | Other error (text on stderr) | Report the text |

## See what is open

```sh
node <plugin>/scripts/tabby.mjs list
```

Each group has `name`, `parent`, `color`, `collapsed`, `pinned`, `tabs` (`title`, 0-based `index`), and `needsYou` / `busy` counts of Claude Code tabs. A tab's number in the side bar is `index + 1`.

## Open a tab in a group

```sh
node <plugin>/scripts/tabby.mjs open --group "<group>" --name "<tab title>" --dir "<folder>" --run "claude"
```

| Option | Use |
| --- | --- |
| `--run "<command>"` | Typed into the new shell once it is ready, for example `claude`, `claude --resume <name>` or `npm test`. Leave it out for a plain shell. |
| `--parent "<group>"` | Makes `--group` a subgroup of this group |
| `--file <script>` | Runs a launch script once in a new shell (launchers use this). A `.ps1` script runs in PowerShell 7; any other script is sourced in the default profile's shell, for example zsh on macOS. |
| `--app claude` | With `--file`: the app names its own tab |

The group is created when it does not exist. The shell is the user's Tabby default profile.

## Move a tab

```sh
node <plugin>/scripts/tabby.mjs move --tab <number|title> --group "<group>"
node <plugin>/scripts/tabby.mjs move --tab <number|title> --none
```

`--tab` is the number the side bar shows, or a title. A title matches exactly first, then as one unique case-insensitive part. `--none` takes the tab out of its group. To group several tabs, move each one into the same group.

## Run code inside Tabby

For anything the commands above do not cover (read a tab's state, call another `__tabbyGroups` function, test a Tabby plugin), write the code to a file and run it with `tabby-eval.mjs`. Never hand-write a DevTools script, and never pass code through a shell string: quotes and backslashes break there.

```sh
node <plugin>/scripts/tabby-eval.mjs <file.js> [--port 9222] [--args <file.json>]
```

The file is the body of an async function. It gets `{ app, injector, core, tg, args }` and returns plain JSON data:

| Name | Is |
| --- | --- |
| `app` | Tabby's AppService: `app.tabs`, `app.activeTab`, `app.selectTab(tab)` |
| `injector` | Angular's injector, for example `injector.get(core.ConfigService)` |
| `core` | `require('tabby-core')` |
| `tg` | `window.__tabbyGroups`, the tabby-groups API (`list`, `addTab`, `setCollapsed`, …), or undefined |
| `args` | The parsed `--args` JSON file, or null |

```js
// tabs.js: the title and group of every tab
return app.tabs.map((t, i) => ({ n: i + 1, title: t.customTitle || t.title, group: t.__tg ?? null }))
```

The exit codes are the same as `tabby.mjs`. The file is JavaScript, so write a backslash as `\\`.

## Rules

- Port 9222 is the user's own Tabby. Only read from it unless the user asks for a change. Test changes in a separate Tabby started with its own `--user-data-dir` and another port, and start that Tabby from a clean shell: a shell that inherited this Claude session's environment starts Claude sessions that write no session record.
- Do not close, restart or type into tabs the user did not ask about. A tab can hold another Claude session at work.
- Groups, colours, collapse and pins persist through Tabby restarts. Renames, colours and collapse are in the group's right-click menu; tell the user that instead of guessing.
- When `list` returns a plain list without `plugin: true`, the tabby-groups Tabby plugin is not installed: only `list` and `open --file` with a `.ps1` script work.
