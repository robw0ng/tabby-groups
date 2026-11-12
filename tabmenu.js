// The small tab menu (index.js wraps Tabby's tab-header menu): its items, and where VS Code is.
const fs = require('fs')
const path = require('path')

/**
 * VS Code found through `code` on PATH, as a program to start with no shell: on Windows `code` is bin\code.cmd, a
 * batch file, so this is Code.exe beside bin; elsewhere the `code` script itself. Null when there is none.
 */
function findCode (env = process.env, isWin = process.platform === 'win32') {
    for (const dir of (env.PATH ?? env.Path ?? '').split(path.delimiter).filter(Boolean)) {
        if (isWin && fs.existsSync(path.join(dir, 'code.cmd'))) {
            const exe = path.join(dir, '..', 'Code.exe')
            if (fs.existsSync(exe)) {
                return path.resolve(exe)
            }
        } else if (!isWin && fs.existsSync(path.join(dir, 'code'))) {
            return path.join(dir, 'code')
        }
    }
    return null
}

/**
 * The small menu, in Tabby's menu item format. `cwd`: the tab's folder; `files`: whether a Files tab can open
 * (tabby-groups' sibling plugin); `code`: whether VS Code is there; `manager`: the file manager's name;
 * `pinned`: the tab's pin; `addToGroup` / `moveToWindow`: the plugin's own submenus; `more`: Tabby's full menu;
 * `act`: { files(dir), open(dir), code(dir), rename(), pin(), duplicate(), copy(text), closeGroup() }.
 */
function smallMenu ({ cwd, files, code, manager = 'Explorer', pinned, grouped, addToGroup, moveToWindow, more }, act) {
    return [
        {
            label: 'Open in',
            enabled: !!cwd,
            submenu: !cwd ? [] : [
                ...files ? [{ label: 'Tabby Files', click: () => act.files(cwd) }] : [],
                { label: manager, click: () => act.open(cwd) },
                ...code ? [{ label: 'VS Code', click: () => act.code(cwd) }] : [],
            ],
        },
        { type: 'separator' },
        ...addToGroup ? [addToGroup] : [],
        { label: 'Rename', click: () => act.rename() },
        { label: pinned ? 'Unpin' : 'Pin', click: () => act.pin() },
        { label: 'Duplicate', click: () => act.duplicate() },
        { label: 'Copy path', enabled: !!cwd, click: () => act.copy(cwd) },
        { type: 'separator' },
        ...moveToWindow ? [moveToWindow] : [],
        ...grouped ? [{ label: 'Close group', click: () => act.closeGroup() }] : [],
        { type: 'separator' },
        { label: 'More options…', submenu: more },
    ]
}

module.exports = { findCode, smallMenu }
