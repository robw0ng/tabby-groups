// The new-tab picker: a right-click on free side-bar space lists the default profile, the pinned entries, a Files tab
// and a new empty group. Pure row and filter logic, plus the popup; index.js wires it to the bar and to open().

/** Whether a tabby-groups.json `picker` entry pins this Tabby profile (by name or id). */
const pins = (entry, profile) => !!entry?.profile && (entry.profile === profile.name || entry.profile === profile.id)

/**
 * The picker's rows, in three blocks: Tabby's default profile; the pinned entries (tabby-groups.json `picker`:
 * `{ profile }` by name or id, or `{ command }`, each with `label`, `icon`, `cwd` optional); a Files tab when tabby-files
 * is loaded, and a new empty group (a subgroup of `group`, the group whose space was clicked).
 * Each row is { block, label, spec }, where spec is what open() takes, or { files: true } or { newGroup: true }.
 */
function pickerItems ({ defaultProfile = null, profiles = [], pinned = [], files = false, group = null }) {
    const rows = []
    if (defaultProfile) {
        rows.push({ block: 0, label: defaultProfile.name, spec: { profile: defaultProfile } })
    }
    for (const p of pinned) {
        const profile = p?.profile && profiles.find(x => !x.isTemplate && pins(p, x))
        // A pin of a profile Tabby does not have is left out rather than opening the default shell.
        if (p?.profile ? !profile || (profile === defaultProfile && !p.cwd) : !p?.command) {
            continue
        }
        rows.push({ block: 1, label: p.label ?? profile?.name ?? p.command, icon: p.icon, spec: profile ? { profile, cwd: p.cwd } : { run: p.command, cwd: p.cwd } })
    }
    if (files) {
        rows.push({ block: 2, label: 'Files tab', spec: { files: true } })
    }
    rows.push({ block: 2, label: group ? 'New empty subgroup' : 'New empty group', spec: { newGroup: true } })
    return rows
}

/** The rows whose label has every word of `q`, any case. */
function filterItems (rows, q) {
    const words = String(q ?? '').toLowerCase().split(/\s+/).filter(Boolean)
    return rows.filter(r => words.every(w => String(r.label).toLowerCase().includes(w)))
}

/** Shows the picker at (x, y), styled as the group menu. ↑/↓ and Enter, type to filter, Esc or a click outside closes. */
function showPicker (rows, x, y, choose) {
    const menu = Object.assign(document.createElement('div'), { className: 'tg-menu tg-picker' })
    // Folded away (CSS :placeholder-shown) until something is typed; it keeps the focus for the keys.
    const input = Object.assign(document.createElement('input'), { className: 'tg-picker-q', placeholder: ' ', spellcheck: false })
    const list = document.createElement('div')
    menu.append(input, list)
    let shown = rows
    let active = 0
    const close = () => {
        menu.remove()
        document.removeEventListener('mousedown', onOutside, true)
    }
    const pick = row => {
        close()
        row && choose(row)
    }
    const draw = () => {
        list.replaceChildren()
        shown.forEach((r, i) => {
            if (i && r.block !== shown[i - 1].block) {
                list.append(Object.assign(document.createElement('div'), { className: 'tg-sep' }))
            }
            const el = Object.assign(document.createElement('div'), { className: 'tg-item' + (i === active ? ' tg-active' : ''), textContent: (r.icon ? r.icon + ' ' : '') + r.label })
            el.addEventListener('click', () => pick(r))
            list.append(el)
        })
        list.querySelector('.tg-active')?.scrollIntoView({ block: 'nearest' })
    }
    const onOutside = e => !menu.contains(e.target) && close()
    // The filter keeps the focus, so the keys keep working after a click on a separator or the scrollbar.
    menu.addEventListener('mousedown', e => e.target !== input && e.preventDefault())
    // Kept inside the window: the filter box, once shown, makes the menu taller.
    const clamp = () => {
        const r = menu.getBoundingClientRect()
        menu.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px'
        menu.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px'
    }
    input.addEventListener('input', () => {
        shown = filterItems(rows, input.value)
        active = 0
        draw()
        clamp()
    })
    // Stops Tabby's hotkeys from seeing the keys typed into the filter.
    menu.addEventListener('keydown', e => {
        e.stopPropagation()
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % (shown.length || 1)
            draw()
        } else if (e.key === 'Enter') {
            // Else the Enter's keypress lands in whatever the choice focuses (a new group's name field).
            e.preventDefault()
            pick(shown[active])
        } else if (e.key === 'Escape') {
            close()
        }
    })
    draw()
    document.body.append(menu)
    clamp()
    document.addEventListener('mousedown', onOutside, true)
    input.focus()
    return close
}

module.exports = { pickerItems, filterItems, showPicker, pins }
