# tabby-groups

A plugin for the [Tabby](https://tabby.sh) terminal: real tab groups in Tabby's side tab bar. Drop a tab on another tab to make a group; right-click a group header to rename, colour, collapse or pin it. Each tab also shows an icon for its shell or app and its current folder, and the search box at the top finds tabs. The groups show when **Settings > Appearance > Tabs location** is Left or Right.

Your own icons: make `tabby-groups.json` in Tabby's settings folder (the folder that holds `plugins`), for example `{ "icons": [{ "name": "Build", "title": "^build", "emoji": "🔨" }] }`. `title` matches the tab title and `process` a program's command line (both are patterns); the icon is an `emoji`, or an SVG `path` with a `color`. Changes apply at once.

Your own toolbar buttons go in the same file: `{ "buttons": [{ "icon": "sync", "label": "Update", "command": "<command>", "check": "<check command>" }] }`. A click types the command into a new tab that stays open. Without `check`, the button always shows. With `check`, it shows "Update available" only while the check exits 10, with the check's output as its tooltip; ✕ hides it until that output changes.

To install, give an agent this zip and say "follow the INSTALL.md inside", or do its steps by hand. To uninstall, quit Tabby, delete the `tabby-groups` folder from Tabby's `plugins/node_modules` folder, and start Tabby again; your tabs stay. macOS support is untested on a real Mac.
