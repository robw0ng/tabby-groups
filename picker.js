// The new-tab picker: a right-click on free side-bar space lists profiles, pinned entries, a Files tab and recent
// folders. Pure row and filter logic, plus the popup; index.js wires it to the bar and to open().

/**
 * The picker's rows, in sections. `profiles` from ProfilesService (templates are skipped), `pinned` from tabby-groups.json
 * `picker`, `files` when tabby-files is loaded, `cwds` the folders of open panes in tab order (the bottom-most 5 win),
 * `group` the group whose space was clicked (null: the top level).
 * Each row is { section, label, spec }, where spec is what open() takes, or { files: true } or { newGroup: true }.
 */
function pickerItems ({ profiles = [], pinned = [], files = false, cwds = [], group = null }) {
    const rows = []
    for (const p of profiles.filter(p => !p.isTemplate)) {
        rows.push({ section: 'Profiles', label: p.name, spec: { profile: p } })
    }
    for (const p of pinned.filter(p => p?.label && (p.profile || p.command))) {
        const profile = p.profile && profiles.find(x => x.name === p.profile || x.id === p.profile)
        // A pinned entry that names a profile Tabby does not have is left out rather than opening the default shell.
        if (p.profile && !profile) {
            continue
        }
        rows.push({ section: 'Pinned', label: p.label, icon: p.icon, spec: profile ? { profile, cwd: p.cwd } : { run: p.command, cwd: p.cwd } })
    }
    if (files) {
        rows.push({ section: 'Files', label: 'Files tab', spec: { files: true } })
    }
    for (const cwd of [...new Set(cwds.filter(Boolean).reverse())].slice(0, 5)) {
        rows.push({ section: 'Recent folders', label: cwd, spec: { cwd } })
    }
    rows.push({ section: 'Groups', label: group ? 'New empty subgroup' : 'New empty group', spec: { newGroup: true } })
    return rows
}

/** The rows whose label (or section) has every word of `q`, any case. */
function filterItems (rows, q) {
    const words = String(q ?? '').toLowerCase().split(/\s+/).filter(Boolean)
    return rows.filter(r => words.every(w => `${r.label}\n${r.section}`.toLowerCase().includes(w)))
}

/** Shows the picker at (x, y), styled as the group menu. ↑/↓ and Enter, type to filter, Esc or a click outside closes. */
function showPicker (rows, x, y, choose) {
    const menu = Object.assign(document.createElement('div'), { className: 'tg-menu tg-picker' })
    const input = Object.assign(document.createElement('input'), { className: 'tg-picker-q', placeholder: 'New tab…', spellcheck: false })
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
            if (r.section !== shown[i - 1]?.section) {
                list.append(Object.assign(document.createElement('div'), { className: 'tg-label', textContent: r.section }))
            }
            const el = Object.assign(document.createElement('div'), { className: 'tg-item' + (i === active ? ' tg-active' : ''), textContent: (r.icon ? r.icon + ' ' : '') + r.label })
            el.addEventListener('click', () => pick(r))
            list.append(el)
        })
        list.querySelector('.tg-active')?.scrollIntoView({ block: 'nearest' })
    }
    const onOutside = e => !menu.contains(e.target) && close()
    // The filter keeps the focus, so the keys keep working after a click on a label or the scrollbar.
    menu.addEventListener('mousedown', e => e.target !== input && e.preventDefault())
    input.addEventListener('input', () => {
        shown = filterItems(rows, input.value)
        active = 0
        draw()
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
    const r = menu.getBoundingClientRect()
    menu.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px'
    menu.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px'
    document.addEventListener('mousedown', onOutside, true)
    input.focus()
    return close
}

module.exports = { pickerItems, filterItems, showPicker }
