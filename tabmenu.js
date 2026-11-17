// The small tab menu (index.js wraps Tabby's tab-header menu): its items, the group menu it shares with the group
// header, and where VS Code is.
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
 * `pinned`: the tab's pin; `closable`: false for a pinned tab (Tabby's close skips it, so Close is off, as in its menu); `toGroup` / `group` / `moveToWindow`: the plugin's own submenus (`group`: the tab's
 * group's menu, null outside a group); `more`: Tabby's full menu;
 * `act`: { files(dir), open(dir), code(dir), rename(), pin(), duplicate(), copy(text), close() }.
 */
function smallMenu ({ cwd, files, code, manager = 'Explorer', pinned, closable = true, toGroup, group, moveToWindow, more }, act) {
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
        ...toGroup ? [toGroup] : [],
        { label: 'Rename', click: () => act.rename() },
        { label: pinned ? 'Unpin' : 'Pin', click: () => act.pin() },
        { label: 'Duplicate', click: () => act.duplicate() },
        { label: 'Copy path', enabled: !!cwd, click: () => act.copy(cwd) },
        { type: 'separator' },
        ...group ? [group, { type: 'separator' }] : [],
        ...moveToWindow ? [moveToWindow] : [],
        { label: 'Close', enabled: closable, click: () => act.close() },
        { type: 'separator' },
        { label: 'More options…', submenu: more },
    ]
}

/**
 * A group's menu, for the group header (index.js draws it, colours as swatches) and the tab menu's "Group:" submenu.
 * `colors`: [{ name, value }]; `shut`: collapsed (itself or a parent); `targets`: [{ id, label }], the groups it can
 * move into; `hasTabs`: a tab anywhere under it (Close group, else Delete group);
 * `act`: { color(value), rename(), collapse(), pin(), moveInto(id or null), ungroup(), close(), remove() }.
 */
function groupMenu ({ color, colors, shut, pinned, parent, targets, hasTabs }, act) {
    return [
        {
            label: 'Color',
            submenu: [{ name: 'No color', value: null }, ...colors].map(c => ({
                label: c.name, type: 'radio', checked: color === c.value, click: () => act.color(c.value),
            })),
        },
        { type: 'separator' },
        { label: 'Rename group', click: () => act.rename() },
        { label: shut ? 'Expand group' : 'Collapse group', click: () => act.collapse() },
        { label: pinned ? 'Unpin group' : 'Pin group', click: () => act.pin() },
        ...parent || targets.length ? [{
            label: 'Move group into',
            submenu: [
                { label: 'Top level', type: 'radio', checked: !parent, click: () => act.moveInto(null) },
                ...targets.map(t => ({ label: t.label, type: 'radio', checked: parent === t.id, click: () => act.moveInto(t.id) })),
            ],
        }] : [],
        { type: 'separator' },
        { label: parent ? 'Ungroup (move up a level)' : 'Ungroup', click: () => act.ungroup() },
        hasTabs ? { label: 'Close group', click: () => act.close() } : { label: 'Delete group', click: () => act.remove() },
    ]
}

module.exports = { findCode, smallMenu, groupMenu }
