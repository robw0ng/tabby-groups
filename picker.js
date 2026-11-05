// The new-tab picker: a right-click on free side-bar space lists the default profile, the pinned entries, a Files tab
// and a new empty group. Pure row and filter logic, plus the popup; index.js wires it to the bar and to open().

/** Whether a tabby-groups.json `picker` entry pins this Tabby profile (by name or id). */
const pins = (entry, profile) => !!entry?.profile && (entry.profile === profile.name || entry.profile === profile.id)

/** A Tabby profile's icon, as Tabby's <profile-icon> reads it: markup when it starts with "<", else Font Awesome classes. */
// As Tabby, the profile colour tints a Font Awesome icon only.
const profileIcon = p => !p?.icon ? null : p.icon.startsWith('<') ? { html: p.icon } : { fa: p.icon, color: p.color }
/** A pin's own icon from tabby-groups.json: Font Awesome classes or a bare name (as a button's "icon"), else text (an emoji); never markup. */
const pinIcon = icon => typeof icon !== 'string' || !icon ? null
    : /\bfa-/.test(icon) ? { fa: icon } : /^[a-z0-9-]+$/.test(icon) ? { fa: 'fas fa-' + icon } : { text: icon }

/**
 * The picker's rows, in three blocks: Tabby's default profile; the pinned entries (tabby-groups.json `picker`:
 * `{ profile }` by name or id, or `{ command }`, each with `label`, `icon`, `cwd` optional); a Files tab when tabby-files
 * is loaded, and a new empty group (a subgroup of `group`, the group whose space was clicked).
 * Each row is { block, label, icon, spec }: spec is what open() takes, or { files: true } or { newGroup: true }; icon is
 * { html | fa | text, color } or { kind: 'files' | 'group' } (drawn by index.js), or null.
 */
function pickerItems ({ defaultProfile = null, profiles = [], pinned = [], files = false, group = null }) {
    const rows = []
    if (defaultProfile) {
        rows.push({ block: 0, label: defaultProfile.name, icon: profileIcon(defaultProfile), spec: { profile: defaultProfile } })
    }
    for (const p of pinned) {
        const profile = p?.profile && profiles.find(x => !x.isTemplate && pins(p, x))
        // A pin of a profile Tabby does not have is left out rather than opening the default shell.
        if (p?.profile ? !profile || (profile === defaultProfile && !p.cwd) : !p?.command) {
            continue
        }
        rows.push({
            block: 1, label: p.label ?? profile?.name ?? p.command, icon: pinIcon(p.icon) ?? profileIcon(profile),
            spec: profile ? { profile, cwd: p.cwd } : { run: p.command, cwd: p.cwd },
        })
    }
    if (files) {
        rows.push({ block: 2, label: 'Files tab', icon: { kind: 'files' }, spec: { files: true } })
    }
    rows.push({ block: 2, label: group ? 'New empty subgroup' : 'New empty group', icon: { kind: 'group' }, spec: { newGroup: true } })
    return rows
}

/** The rows whose label has every word of `q`, any case. */
function filterItems (rows, q) {
    const words = String(q ?? '').toLowerCase().split(/\s+/).filter(Boolean)
    return rows.filter(r => words.every(w => String(r.label).toLowerCase().includes(w)))
}

/** A row's icon in a fixed-width box. `kinds` draws { kind } icons. Profile markup comes from Tabby's config, as Tabby renders it. */
function iconBox (icon, kinds) {
    const box = Object.assign(document.createElement('span'), { className: 'tg-pick-icon' })
    if (icon?.kind) {
        box.append(kinds[icon.kind]?.() ?? '')
    } else if (icon?.html) {
        box.innerHTML = icon.html
    } else if (icon?.fa) {
        box.append(Object.assign(document.createElement('i'), { className: 'fa-fw ' + icon.fa }))
    } else if (icon?.text) {
        box.textContent = icon.text
    }
    if (icon?.color) {
        box.style.color = icon.color
    }
    return box
}

/**
 * Shows the picker at (x, y), styled as the group menu. ↑/↓ and Enter, type to filter, Esc or a click outside closes.
 * `kinds`: { files, group } → a DOM node for those rows' icons.
 */
function showPicker (rows, x, y, choose, kinds = {}) {
    const menu = Object.assign(document.createElement('div'), { className: 'tg-menu tg-picker' })
    // Out of the layout until something is typed (class tg-typed); it keeps the focus for the keys.
    const input = Object.assign(document.createElement('input'), { className: 'tg-picker-q', spellcheck: false })
    const title = Object.assign(document.createElement('div'), { className: 'tg-picker-title', textContent: '+ New tab' })
    const list = Object.assign(document.createElement('div'), { className: 'tg-picker-list' })
    menu.append(input, title, list)
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
            const el = Object.assign(document.createElement('div'), { className: 'tg-item' + (i === active ? ' tg-active' : '') })
            el.append(iconBox(r.icon, kinds), String(r.label))
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
        input.classList.toggle('tg-typed', !!input.value)
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
