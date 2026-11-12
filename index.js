const { NgModule, Injector, ElementRef, ɵɵdefineComponent, ɵɵdirectiveInject } = require('@angular/core')
const core = require('tabby-core')
const ICONS = require('./icons')

const { COLORS, NO_COLOR, tintPct, shaded, ACTIVE_TINT_ADD, CSS } = require('./styles')
const { resumeCommand } = require('./resume')
const { SHELLS, APPS, CLAUDE_TITLE, shellOf, claudeSessionId, processList, osCwd, promptCwd, taskShells } = require('./processes')
const { createButtons } = require('./buttons')
const { createAgent } = require('./agent')
const { createInbox } = require('./inbox')
const { createTooltip } = require('./tooltip')
const { renderSettings } = require('./settings')
const { createWindows } = require('./windows')
const { pickerItems, showPicker } = require('./picker')
const { chainIn, panelOf, unitsOf, emptyIndex, groupOrder, trackSlots, follow, focusAfterClose, dropIndex } = require('./places')
const { newId, childNamed, uniqueName, pathOf, resolve, loadSaved, restorePath } = require('./scope')
const { findCode, smallMenu } = require('./tabmenu')

function install (injector) {
    window.__tabbyGroups?.dispose()

    const app = injector.get(core.AppService)
    const recovery = injector.get(core.TabRecoveryService)
    const menuProviders = injector.get(core.TabContextMenuItemProvider)
    // The sidebar gap, rounded to whole screen pixels: at 125% a 6px gap is 7.5px, and each nested band would round that half pixel its own way.
    // Read once at install; a zoom change keeps the old gap until Tabby restarts.
    const gap = Math.round(6 * devicePixelRatio) / devicePixelRatio

    // By id. The name is a label, unique only among siblings; parent is the parent's id (scope.js).
    /** @type {Map<string, {id: string, name: string, color: string|null, collapsed: boolean, parent: string|null}>} */
    const groups = new Map()
    // A reload (dispose, then install) hands the groups over; the tabs still carry their tab.__tg.
    // An empty group has no tab to carry it through a restart, so the main window (the one Tabby restores) keeps the
    // empty groups in localStorage. A second window's empty groups end with its tabs, as Tabby does not restore that window.
    const EMPTY_KEY = 'tabby-groups:empty-groups'
    let saved = window.__tabbyGroupsState?.groups
    const isMain = injector.get(core.BOOTSTRAP_DATA).isMainWindow
    if (!saved && isMain) {
        try {
            saved = JSON.parse(localStorage.getItem(EMPTY_KEY))
        } catch { }
    }
    // Before ids, groups were saved by name. The first install with ids keeps a copy of what it migrates.
    const BACKUP_KEY = 'tabby-groups:ids-backup'
    if (isMain && !localStorage.getItem(BACKUP_KEY) && (saved?.some?.(g => !g?.id) || /"tabbyGroup":\[\{"name"/.test(localStorage.tabsRecovery ?? ''))) {
        try {
            const path = require('path')
            const file = path.join(injector.get(core.BOOTSTRAP_DATA).userPluginsPath, '..', `tabby-groups-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
            require('fs').writeFileSync(file, JSON.stringify({ handover: window.__tabbyGroupsState?.groups ?? null, emptyGroups: localStorage.getItem(EMPTY_KEY), tabsRecovery: localStorage.tabsRecovery ?? null }))
            localStorage.setItem(BACKUP_KEY, file)
        } catch (e) {
            console.warn('tabby-groups: no backup of the old saved groups', e.message)
        }
    }
    const oldNames = loadSaved(groups, saved)
    delete window.__tabbyGroupsState

    const top = tab => app.tabs.includes(tab) ? tab : app.getParentTab(tab) ?? tab
    const titleOf = tab => tab.customTitle || tab.title
    const changed = () => app.emitTabsChanged()
    const IS_WIN = process.platform === 'win32'
    /** The shell of Tabby's default profile (Settings → Profiles & connections → Default profile), or null when it is not a local shell. */
    async function defaultShell () {
        const id = injector.get(core.ConfigService).store.terminal?.profile
        const profile = (await injector.get(core.ProfilesService).getProfiles()).find(p => p.id === id)
        return profile?.type === 'local' && profile.options?.command ? { command: profile.options.command, args: profile.options.args ?? [] } : null
    }
    // Set by dispose(). Work still in flight (a process-tree read, a shell wait) must not draw over the next install.
    let disposed = false
    const inbox = createInbox({ app, isDisposed: () => disposed, queueRender: () => queueRender() })
    const tint = g => g.color ?? NO_COLOR
    /** How many levels in a row, up from this group, share their parent's colour: the number of shading steps. */
    const shadeOf = g => {
        const parent = groups.get(g?.parent)
        return parent && tint(parent) === tint(g) ? shadeOf(parent) + 1 : 0
    }

    /** The group and its ancestors, root first. */
    function chainOf (id) {
        return chainIn(groups, id)
    }
    // Each empty group's neighbours, for trackSlots (places.js): they keep it in place as tabs around it come and go.
    const marks = new Map()
    const inGroup = (tab, id) => !!tab && chainOf(tab.__tg).some(g => g.id === id)
    const members = id => app.tabs.filter(t => t.__tg === id)
    const subtree = id => app.tabs.filter(t => inGroup(t, id))
    // A reload from a copy without ids leaves group names on the tabs.
    app.tabs.forEach(t => { if (t.__tg && !groups.has(t.__tg) && oldNames.has(t.__tg)) t.__tg = oldNames.get(t.__tg) })
    // A collapsed group still shows the path to its active tab, and folds it away once another tab is selected.
    // A group under a collapsed parent shows as collapsed, so one click opens it and its parents.
    const shut = g => chainOf(g.id).some(a => a.collapsed)
    const tabHidden = tab => tab !== app.activeTab && chainOf(tab.__tg).some(g => g.collapsed)
    const headerHidden = g => !inGroup(app.activeTab, g.id) && chainOf(g.parent).some(a => a.collapsed)

    /** A new group under `parent` (an id; null: the top level), named `name` or "name (n)" when a sibling has it. */
    function createGroup (name, parent = null) {
        const g = { id: newId(), name: uniqueName(groups, parent, name), color: COLORS[groups.size % COLORS.length].value, collapsed: false, parent, pinned: false }
        // A new subgroup in its parent's colour would melt into it: it takes the next palette colour.
        if (groups.get(parent)?.color === g.color) {
            g.color = COLORS[(COLORS.findIndex(c => c.value === g.color) + 1) % COLORS.length].value
        }
        groups.set(g.id, g)
        if (parent) {
            // At the end of its parent's panel while it is empty (places.js).
            g.slot = unitsOf(app.tabs, groups, parent).length
        }
        return g
    }

    /**
     * The group a script means (an id, a name only one group has, a path, or { name, parent }: scope.js), made when
     * missing. With `parent` (any of those; null: the top level) it is the child of that name there, the parent made too.
     */
    function groupFor (ref, { parent, color } = {}) {
        // { name, parent }, or a path not made yet ("a/b"): the last name under the rest.
        if (ref && typeof ref === 'object') {
            return groupFor(ref.name, { parent: ref.parent ?? null, color })
        }
        if (parent === undefined && String(ref).includes('/') && resolve(groups, ref) == null) {
            const parts = String(ref).split('/')
            const last = parts.pop()
            const pid = parts.reduce((at, part) => groupFor(part, { parent: at }).id, null)
            return groupFor(last, { parent: pid, color })
        }
        let g
        if (parent !== undefined) {
            const pid = parent === null ? null : groupFor(parent).id
            g = groups.get(ref) ?? childNamed(groups, pid, ref) ?? createGroup(ref, pid)
            // Throws, so a script over CDP learns of the refusal instead of getting a group elsewhere.
            if (g.parent !== pid && !setParent(g.id, pid, false)) {
                throw new Error(`tabby-groups: cannot put "${g.name}" inside "${pathOf(groups, pid)}", because it would contain itself`)
            }
        } else {
            g = groups.get(resolve(groups, ref)) ?? createGroup(ref, null)
        }
        if (color !== undefined) {
            setColor(g.id, color, false)
        }
        return g
    }

    function addTab (tab, id, opts = {}) {
        tab = top(tab)
        const g = groups.get(id)
        if (!g) {
            return
        }
        // The tab's own colour is left alone: the panel shows the group colour, and the own colour returns when the tab leaves.
        setMembership(tab, id)
        // Adding a tab to a collapsed group expands its chain, so a new tab never vanishes.
        chainOf(id).forEach(a => { a.collapsed = false })

        // Lands at the end of its group, or first when its title is the group's name; in an empty group, where the group
        // shows. A new top-level group made from a tab leaves the tab where it is.
        const others = subtree(id).filter(t => t !== tab)
        if (others.length || g.parent || g.slot != null) {
            // A restored tab keeps its saved place: restore runs in saved order, and titles change after launch.
            const lead = !opts.restore && titleOf(tab) === g.name && others.length
            let target = !others.length ? emptyIndex(app.tabs, groups, g, [tab])
                : lead ? app.tabs.indexOf(others[0]) : app.tabs.indexOf(others[others.length - 1]) + 1
            if (app.tabs.indexOf(tab) < target) {
                target--
            }
            app.moveTabToIndex(tab, target)
        }
        changed()
    }

    /**
     * Puts a tab in a group (or none) and sets its pin to match that group's top level before the tab is moved, since
     * Tabby clamps a move to the pinned or unpinned part of the list by the tab's current pin.
     */
    function setMembership (tab, id) {
        const was = !!chainOf(tab.__tg)[0]?.pinned
        const now = !!chainOf(id)[0]?.pinned
        // A local pin belongs to the group it was made in.
        if (tab.__tg !== id) {
            delete tab.__tgPinned
        }
        if (id) {
            tab.__tg = id
        } else {
            delete tab.__tg
        }
        if (now) {
            tab.pinned = true
        } else if (was) {
            tab.pinned = false
        }
    }

    /**
     * Pins a group in its own scope: a top-level group goes first in the whole list (Tabby's pin, on all its tabs);
     * a subgroup goes first inside its parent.
     */
    function setPinned (name, pinned) {
        const g = groups.get(name)
        if (!g) {
            return false
        }
        g.pinned = !!pinned
        changed()
        return true
    }

    /** Pins a tab in its own scope: a grouped tab goes first inside its group; a loose tab gets Tabby's own pin. */
    function setTabPinned (tab, pinned) {
        tab = top(tab)
        if (!tab.__tg) {
            pinned ? app.pinTab(tab) : app.unpinTab(tab)
            return
        }
        tab.__tgPinned = !!pinned
        changed()
    }

    /**
     * A group's tabs in display order: its direct tabs and subgroups keep their order, with pinned ones first, and each
     * subgroup's own tabs follow the same rule.
     */
    function orderedSubtree (g) {
        const units = []
        for (const t of subtree(g.id)) {
            const chain = chainOf(t.__tg)
            const unit = chain[chain.indexOf(g) + 1] ?? t
            if (!units.includes(unit)) {
                units.push(unit)
            }
        }
        const isGroup = u => groups.get(u.id) === u
        const pinned = u => isGroup(u) ? u.pinned : u.__tgPinned
        return [...units.filter(pinned), ...units.filter(u => !pinned(u))].flatMap(u => isGroup(u) ? orderedSubtree(u) : [u])
    }

    function removeTab (tab, emit = true) {
        tab = top(tab)
        if (!tab.__tg) {
            return
        }
        // Leaving a pinned group unpins the tab. The group goes first, or normalize() (run by the move) would pin it again.
        const wasPinned = !!chainOf(tab.__tg)[0]?.pinned
        delete tab.__tg
        if (wasPinned) {
            app.unpinTab(tab)
        }
        if (emit) {
            changed()
        }
    }

    /** A group with no tab anywhere under it stays until it is deleted: this deletes it and its subgroups (empty too). */
    function deleteGroup (name) {
        const g = groups.get(name)
        if (!g || subtree(name).length) {
            return false
        }
        for (const c of [...groups.values()]) {
            if (chainOf(c.id).includes(g)) {
                groups.delete(c.id)
                marks.delete(c)
            }
        }
        changed()
        return true
    }

    /**
     * Closes every tab in a group and its subgroups through Tabby's own close, so "Reopen closed tab" brings each back,
     * then removes the groups. A pinned tab closes too. Asks first when a tab is busy or pinned.
     */
    const closing = new Set()
    async function closeGroup (name) {
        const g = groups.get(name)
        if (!g || closing.has(g)) {
            return false
        }
        closing.add(g)
        try {
            return await closeTabsOf(g)
        } finally {
            closing.delete(g)
        }
    }
    async function closeTabsOf (g) {
        const name = g.name
        const tabs = subtree(g.id)
        // An agent tab is busy while its agent works (the agent itself is always a running command); any other tab while
        // it runs a command, as Tabby's own close asks.
        const busyPane = async p => p.__tgInfo?.agent ? p.__tgInfo.agent.state === 'busy' : !!(await p.session?.getChildProcesses?.().catch(() => null))?.length
        const busy = (await Promise.all(tabs.map(async t => (await Promise.all((t.getAllTabs?.() ?? [t]).map(busyPane))).some(Boolean)))).filter(Boolean).length
        const pinned = tabs.filter(t => t.pinned || t.__tgPinned).length
        if (busy || pinned) {
            const n = (k, one, many) => `${k} ${k === 1 ? one : many}`
            const why = [busy && `${n(busy, 'is', 'are')} busy`, pinned && `${n(pinned, 'is', 'are')} pinned`].filter(Boolean).join(', ')
            const { response } = await injector.get(core.PlatformService).showMessageBox({
                type: 'warning', message: `Close ${n(tabs.length, 'tab', 'tabs')} in ${name}? ${why}.`, buttons: ['Close', 'Cancel'], defaultId: 0, cancelId: 1,
            })
            if (response !== 0 || disposed) {
                return false
            }
        }
        // Not Tabby's per-tab check: it would ask again for each running command, and for each agent tab. Only the tabs
        // asked about, and only those still in the group.
        for (const t of tabs.filter(t => app.tabs.includes(t) && inGroup(t, g.id))) {
            await app.closeTab(t, false, true)
        }
        // A tab that stayed open, or came in meanwhile, keeps its group.
        return groups.get(g.id) === g && deleteGroup(g.id)
    }

    /** A new empty group (a subgroup of `parent` when given) after `slot` units of its panel, named "Group N" and open for renaming. */
    function newEmptyGroup (parent, slot) {
        // A search would hide the new header, and a rename in a hidden header never ends.
        search.value = query = ''
        const g = createGroup(newGroupName(), parent ?? null)
        g.slot = slot ?? unitsOf(app.tabs, groups, panelOf(groups, g)).length
        chainOf(g.id).forEach(a => { a.collapsed = false })
        changed()
        render()
        startRename(g)
    }

    // Tabby turns recovery on in the main window only, once startup recovery is done, and off before it closes the tabs
    // on quit, so neither a half-restored list nor the quit's closing tabs is saved as empty groups.
    function saveEmptyGroups () {
        if (!recovery.enabled) {
            return
        }
        // With their ancestors, so an empty subgroup keeps its parent even when the parent's tabs do not come back.
        const keep = new Set([...groups.values()].filter(g => !subtree(g.id).length).flatMap(g => chainOf(g.id)))
        try {
            localStorage.setItem(EMPTY_KEY, JSON.stringify([...keep]))
        } catch { }
    }

    function setCollapsed (name, collapsed) {
        const g = groups.get(name)
        if (!g) {
            return
        }
        g.collapsed = collapsed
        // Opening a group inside a collapsed parent would change nothing on screen, so its parents open too.
        if (!collapsed) {
            chainOf(name).forEach(a => { a.collapsed = false })
        }
        changed()
    }

    function setColor (name, color, emit = true) {
        const g = groups.get(name)
        if (!g) {
            return
        }
        g.color = color
        if (emit) {
            changed()
        }
    }

    /** Moves a group under another one, or to the top level with null. Refuses a move into its own subtree. */
    function setParent (id, parent, emit = true) {
        const g = groups.get(id)
        if (!g || (parent && (!groups.has(parent) || chainOf(parent).some(a => a.id === id)))) {
            return false
        }
        const moved = g.parent !== (parent || null)
        g.parent = parent || null
        if (moved) {
            // A sibling there with the same name: this one becomes "name (n)".
            g.name = uniqueName(groups, g.parent, g.name, g)
            // An empty group moved into another panel goes to its end (a group with tabs takes its slot from them).
            g.slot = unitsOf(app.tabs, groups, panelOf(groups, g)).length
            marks.delete(g)
        }
        if (emit) {
            changed()
        }
        return true
    }

    /** A name a sibling has becomes "name (n)", the lowest free n. */
    function rename (id, newName) {
        const g = groups.get(id)
        if (!g || !newName) {
            return false
        }
        g.name = uniqueName(groups, g.parent, newName, g)
        changed()
        return true
    }

    /** Dissolves one level: its tabs and subgroups move up to its parent. */
    function ungroup (id) {
        const g = groups.get(id)
        if (!g) {
            return
        }
        const parent = groups.get(g.parent)
        // Its units move up in order, so an empty subgroup keeps its place among them: after g's place, plus its own slot.
        const inside = unitsOf(app.tabs, groups, id).length
        members(id).forEach(t => {
            if (parent) {
                t.__tg = parent.id
            } else {
                removeTab(t, false)
            }
        })
        // Gone before its subgroups move up, so one may take its name there.
        groups.delete(id)
        marks.delete(g)
        groups.forEach(c => {
            if (c.parent === id) {
                c.parent = g.parent
                c.name = uniqueName(groups, c.parent, c.name, c)
                c.slot = g.slot == null ? null : g.slot + Math.min(c.slot ?? inside, inside)
                marks.delete(c)
            }
        })
        changed()
    }

    /** In side-bar order. `parent` is the parent's name, as before ids; `parentId` and `path` tell same-named groups apart. */
    function list () {
        return groupOrder(app.tabs, groups).map(g => ({
            id: g.id,
            name: g.name,
            path: pathOf(groups, g.id),
            color: g.color,
            collapsed: g.collapsed,
            pinned: !!g.pinned,
            parent: groups.get(g.parent)?.name ?? null,
            parentId: groups.has(g.parent) ? g.parent : null,
            tabs: members(g.id).map(t => ({ title: titleOf(t), index: app.tabs.indexOf(t) })),
            needsYou: subtree(g.id).filter(t => t.__tgInfo?.agent?.needsYou).length,
            asking: subtree(g.id).filter(t => t.__tgInfo?.agent?.asking).length,
            running: subtree(g.id).filter(t => t.__tgInfo?.agent?.background).length,
            compacting: subtree(g.id).filter(t => t.__tgInfo?.agent?.compacting).length,
            busy: subtree(g.id).filter(t => t.__tgInfo?.agent?.state === 'busy' && !t.__tgInfo.agent.asking).length,
        }))
    }

    /** Groups in tree order with their depth, for menus. */
    const tree = () => groupOrder(app.tabs, groups).map(g => ({ g, depth: chainOf(g.id).length - 1 }))

    /** "Group N", N being the group count plus one, or the next free number; renamed later with a double-click. */
    function newGroupName () {
        let n = groups.size + 1
        while ([...groups.values()].some(g => g.name === `Group ${n}`)) {
            n++
        }
        return `Group ${n}`
    }

    // Keeps every group's subtree contiguous, parents first.
    // moveTabToIndex emits tabsChanged even when it does not move (it clamps around pinned tabs), and tabsChanged
    // calls normalize, so the target is clamped first and a nested call is ignored.
    let normalizing = false
    function normalize () {
        if (normalizing) {
            return
        }
        // Groups wait in memory with tabs on top or bottom: the horizontal bar keeps the user's own order.
        if (!document.querySelector('.tabs-on-left, .tabs-on-right')) {
            return
        }
        normalizing = true
        try {
            // A grouped tab is pinned exactly when its top-level group is. Tabby keeps pinned tabs first, so a pinned
            // group sits at the top; pinTab/unpinTab move the tab across that border before the groups are regathered.
            // Each move lands at the pinned border, so pins go first to last and unpins last to first to keep the order.
            const off = tab => !!tab.__tg && !!tab.pinned !== !!chainOf(tab.__tg)[0]?.pinned
            app.tabs.filter(t => off(t) && !t.pinned).forEach(t => app.pinTab(t))
            app.tabs.filter(t => off(t) && t.pinned).reverse().forEach(t => app.unpinTab(t))
            // Each top-level group is laid out from where its first tab is: contiguous, with local pins first at every level.
            for (const g of [...groups.values()].filter(x => !x.parent)) {
                const ms = orderedSubtree(g)
                const start = Math.min(...ms.map(t => app.tabs.indexOf(t)))
                ms.forEach((t, k) => {
                    const target = app.clampTabIndexToBounds(t, start + k)
                    if (app.tabs.indexOf(t) !== target) {
                        app.moveTabToIndex(t, target)
                    }
                })
            }
        } finally {
            normalizing = false
        }
    }

    // Tabby's native menu cannot draw colour swatches, so the group header gets its own popover.
    let menuEl = null
    function closeMenu () {
        menuEl?.remove()
        menuEl = null
        document.removeEventListener('mousedown', onOutside, true)
        document.removeEventListener('keydown', onMenuKey, true)
    }
    const onOutside = e => { if (!menuEl?.contains(e.target)) closeMenu() }
    const onMenuKey = e => { if (e.key === 'Escape') closeMenu() }

    function openMenu (g, x, y) {
        closeMenu()
        menuEl = document.createElement('div')
        menuEl.className = 'tg-menu'
        fillMainMenu(g)
        document.body.appendChild(menuEl)
        const r = menuEl.getBoundingClientRect()
        menuEl.style.left = Math.min(x, innerWidth - r.width - 4) + 'px'
        menuEl.style.top = Math.min(y, innerHeight - r.height - 4) + 'px'
        document.addEventListener('mousedown', onOutside, true)
        document.addEventListener('keydown', onMenuKey, true)
    }

    function menuItem (label, run, on = false) {
        const el = document.createElement('div')
        el.className = 'tg-item' + (on ? ' tg-on' : '')
        el.textContent = label
        el.addEventListener('click', () => {
            closeMenu()
            run()
        })
        return el
    }
    const sep = () => Object.assign(document.createElement('div'), { className: 'tg-sep' })

    function fillMainMenu (g) {
        menuEl.replaceChildren()
        const swatches = document.createElement('div')
        swatches.className = 'tg-swatches'
        for (const c of [{ name: 'No color', value: null }, ...COLORS]) {
            const b = document.createElement('button')
            b.className = 'tg-swatch' + (c.value ? '' : ' tg-none') + (g.color === c.value ? ' tg-on' : '')
            b.style.background = c.value ?? ''
            b.title = c.name
            b.addEventListener('click', () => {
                closeMenu()
                setColor(g.id, c.value)
            })
            swatches.append(b)
        }
        const moveTargets = tree().filter(t => t.g !== g && !chainOf(t.g.id).includes(g))
        const move = Object.assign(document.createElement('div'), { className: 'tg-item', textContent: 'Move into…' })
        move.addEventListener('click', () => fillMoveMenu(g, moveTargets))
        menuEl.append(
            swatches,
            sep(),
            menuItem('Rename', () => startRename(g)),
            menuItem(shut(g) ? 'Expand' : 'Collapse', () => setCollapsed(g.id, !shut(g))),
            menuItem(g.pinned ? 'Unpin group' : 'Pin group', () => setPinned(g.id, !g.pinned)),
            ...g.parent || moveTargets.length ? [move] : [],
            sep(),
            menuItem(g.parent ? 'Ungroup (move up a level)' : 'Ungroup', () => ungroup(g.id)),
            subtree(g.id).length ? menuItem('Close group', () => closeGroup(g.id)) : menuItem('Delete group', () => deleteGroup(g.id)),
        )
    }

    function fillMoveMenu (g, targets) {
        menuEl.replaceChildren(
            Object.assign(document.createElement('div'), { className: 'tg-label', textContent: `Move "${g.name}" into` }),
            menuItem('Top level', () => setParent(g.id, null), !g.parent),
            ...targets.map(t => menuItem(' '.repeat(t.depth) + t.g.name, () => setParent(g.id, t.g.id), g.parent === t.g.id)),
        )
    }

    const menuProvider = {
        weight: 5,
        async getItems (tab, tabHeader) {
            if (!tabHeader || !document.querySelector('.tabs-on-left, .tabs-on-right')) {
                return []
            }
            tab = top(tab)
            return [
                addToGroupMenu(tab),
                ...tab.__tg ? [
                    { label: `New subgroup of ${groups.get(tab.__tg)?.name}`, click: () => addTab(tab, createGroup(newGroupName(), tab.__tg).id) },
                    { label: 'Remove from group', click: () => removeTab(tab) },
                ] : [],
                moveToWindowMenu(tab),
            ]
        },
    }
    menuProviders.push(menuProvider)
    function addToGroupMenu (tab) {
        const groupsTree = tree()
        return {
            label: 'Add to group',
            submenu: [
                ...groupsTree.map(({ g, depth }) => ({
                    label: ' '.repeat(depth) + g.name, type: 'radio', checked: tab.__tg === g.id, click: () => tab.__tg !== g.id && addTab(tab, g.id),
                })),
                ...groupsTree.length ? [{ type: 'separator' }] : [],
                { label: 'New group', click: () => addTab(tab, createGroup(newGroupName(), null).id) },
            ],
        }
    }
    function moveToWindowMenu (tab) {
        const moveTo = async to => moveFailed(await windowsApi.move(tab, to))
        return {
            label: 'Move to window',
            submenu: [
                ...windowsApi.windows().map(w => ({ label: `Window ${w.n}${w.me ? ' (this one)' : ''}`, enabled: !w.me, click: () => moveTo(w.n) })),
                { type: 'separator' },
                { label: 'New window', click: () => moveTo('new') },
            ],
        }
    }


    const style = document.createElement('style')
    style.textContent = CSS + `.tabs-on-left .tabs, .tabs-on-right .tabs { --tg-gap: ${gap}px; }`
    document.head.appendChild(style)

    let container = null
    const observer = new MutationObserver(() => render())
    let editing = false
    let dragging = false
    let query = ''
    let firstMatch = null

    // Sidebar chrome: a search row on top (the new-tab and profile buttons join it by CSS) and a drag handle on the inner edge.
    const toolbar = document.createElement('div')
    toolbar.className = 'tg-toolbar'
    toolbar.innerHTML = '<input class="tg-search" type="search" placeholder="Search tabs, folders, apps, #" spellcheck="false">'
    const search = toolbar.querySelector('input')
    // Tabby's sidebar maximizes the window on a double-click when there is no title bar; a word double-clicked in the search must not.
    toolbar.addEventListener('dblclick', e => e.stopPropagation())
    search.addEventListener('input', () => {
        query = search.value
        render()
    })
    // Stops Tabby's hotkeys from seeing the keys typed into the search.
    search.addEventListener('keydown', e => {
        e.stopPropagation()
        if (e.key === 'Enter' && firstMatch) {
            app.selectTab(firstMatch)
        } else if (e.key === 'Escape') {
            search.value = query = ''
            search.blur()
            render()
        }
    })
    // While the search has focus it takes the whole top row: the buttons beside it slide out (styles.js), and come back on
    // blur, the text and the filter kept. Their width is set first, so the shrink starts from it; they are clipped only
    // while they move or are gone, so a profile menu opened from them is never cut.
    let wideTimer = null
    const topGroup = () => toolbar.parentElement?.querySelector(':scope > .tabs + .btn-group')
    search.addEventListener('focus', () => {
        const group = topGroup()
        if (!group) {
            return
        }
        clearTimeout(wideTimer)
        group.style.maxWidth = group.scrollWidth + 'px'
        void group.offsetWidth
        toolbar.parentElement.classList.add('tg-search-wide', 'tg-search-anim')
    })
    search.addEventListener('blur', () => {
        const bar = toolbar.parentElement
        bar?.classList.remove('tg-search-wide')
        clearTimeout(wideTimer)
        wideTimer = setTimeout(() => {
            bar?.classList.remove('tg-search-anim')
            // The bar Tabby shows now (it can rebuild it), unless the search is wide again there.
            const now = toolbar.parentElement
            const group = topGroup()
            if (group && !now?.classList.contains('tg-search-wide')) {
                group.style.maxWidth = ''
            }
        }, 260)
    })
    /** The row back as it was: tabs moved off the side, or the side bar narrowed so far that the search hides. */
    function narrowSearch () {
        clearTimeout(wideTimer)
        document.querySelectorAll('.tg-search-wide, .tg-search-anim').forEach(e => e.classList.remove('tg-search-wide', 'tg-search-anim'))
        const group = topGroup()
        if (group) {
            group.style.maxWidth = ''
        }
    }

    const WIDTH_KEY = 'tabbyGroups.sideWidth'
    const handle = document.createElement('div')
    handle.className = 'tg-resize'
    const setWidth = px => document.querySelector('app-root')?.style.setProperty('--side-tab-width', px + 'px')
    try {
        const saved = +localStorage.getItem(WIDTH_KEY)
        if (saved) {
            setWidth(saved)
        }
    } catch { }
    handle.addEventListener('mousedown', down => {
        down.preventDefault()
        const bar = document.querySelector('.tab-bar').getBoundingClientRect()
        const onRight = !!document.querySelector('.tabs-on-right')
        let width = bar.width
        const move = e => {
            width = Math.round(Math.max(44, Math.min(600, onRight ? bar.right - e.clientX : e.clientX - bar.left)))
            setWidth(width)
            placeHandle()
        }
        const up = () => {
            document.removeEventListener('mousemove', move)
            document.removeEventListener('mouseup', up)
            document.body.classList.remove('tg-resizing')
            try { localStorage.setItem(WIDTH_KEY, String(width)) } catch { }
        }
        document.body.classList.add('tg-resizing')
        document.addEventListener('mousemove', move)
        document.addEventListener('mouseup', up)
    })

    function placeHandle () {
        const bar = document.querySelector('.tabs-on-left > .tab-bar, .tabs-on-right > .tab-bar')
        handle.hidden = !bar
        if (bar) {
            const r = bar.getBoundingClientRect()
            const x = document.querySelector('.tabs-on-right') ? r.left : r.right
            Object.assign(handle.style, { left: x - 3 + 'px', top: r.top + 'px', height: r.height + 'px' })
        }
    }
    // Entering or leaving fullscreen recreates Tabby's sidebar (an ngIf) and fires a resize, so the sidebar is redrawn too.
    const onResize = () => {
        placeHandle()
        queueRender()
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('tabby-remote:presence', queueRender)
    window.addEventListener('focus', onWindowFocus)

    /** Puts the search row into the vertical sidebar (Tabby can recreate the sidebar) and removes it elsewhere. */
    function mountChrome (vertical) {
        if (vertical && toolbar.nextElementSibling !== container) {
            container.before(toolbar)
        } else if (!vertical) {
            narrowSearch()
            toolbar.remove()
        }
        // A hidden search (a narrow side bar) can keep its focus and no blur comes.
        if (vertical && document.activeElement === search && !search.offsetWidth) {
            search.blur()
            narrowSearch()
        }
        if (!handle.isConnected) {
            document.body.appendChild(handle)
        }
        buttonBar.mount()
        mountTopButtons(vertical)
        placeHandle()
    }

    /*
     * A toolbar button another plugin marks `tgTop: true` (an extra property on its ToolbarButtonProvider item) sits in the
     * side bar's top row, after Tabby's + and profile buttons, instead of the bottom bar: the same icon, title and click.
     * Tabby turns buttons into commands and drops the mark, so its own copy in the bottom bar (in its `.d-flex` wrapper) is
     * found by its icon and hidden; Tabby builds that bar once, so the mark stays. A button of weight 0 or less is in the
     * top row already. With tabs on top or bottom, Tabby's toolbar stays as it is.
     */
    const topButtonsEl = Object.assign(document.createElement('span'), { className: 'tg-top-buttons' })
    let topButtonsKey = null
    let topButtons = []
    const parsedHtml = html => Object.assign(document.createElement('div'), { innerHTML: html ?? '' }).innerHTML
    function mountTopButtons (vertical) {
        const top = vertical && document.querySelector('.tab-bar > .tabs + .btn-group')
        const providers = injector.get(core.ConfigService).enabledServices(injector.get(core.ToolbarButtonProvider, []))
        topButtons = !top ? [] : providers.flatMap(p => {
            try {
                const items = p.provide()
                return Array.isArray(items) ? items.filter(b => b?.tgTop && (b.weight ?? 0) > 0) : []
            } catch {
                return []
            }
        })
        const icons = new Set(topButtons.map(b => parsedHtml(b.icon)))
        document.querySelectorAll('.tab-bar > .btn-space + .btn-group > .d-flex').forEach(el => {
            const button = el.querySelector(':scope > button')
            el.classList.toggle('tg-moved', !!top && !!button && icons.has(button.innerHTML))
        })
        if (!topButtons.length) {
            topButtonsEl.remove()
            topButtonsKey = null
            return
        }
        const key = topButtons.map(b => `${b.title}\n${b.icon}`).join('\n\n')
        if (key !== topButtonsKey) {
            topButtonsKey = key
            topButtonsEl.replaceChildren(...topButtons.map((b, k) => {
                const el = Object.assign(document.createElement('button'), { className: 'btn btn-secondary btn-tab-bar tg-top-button', innerHTML: b.icon ?? '' })
                el.dataset.tgTip = el.ariaLabel = b.title ?? ''
                // The provider's latest button: a provider may hand out new objects with a new click.
                el.addEventListener('click', () => topButtons[k]?.click?.())
                return el
            }))
        }
        if (topButtonsEl.parentElement !== top || topButtonsEl.nextSibling) {
            top.append(topButtonsEl)
        }
    }
    // Tabby builds its toolbar after config loads, maybe after the first render, and rebuilds the side bar (fullscreen), so
    // the buttons are placed again whenever nodes land in the tab bar's button rows (not its tab list): once a frame at most.
    let topQueued = false
    const queueTopButtons = () => {
        if (!topQueued) {
            topQueued = true
            requestAnimationFrame(() => {
                topQueued = false
                if (!disposed) {
                    mountTopButtons(!!document.querySelector('.tabs-on-left, .tabs-on-right'))
                }
            })
        }
    }
    // Nodes added in the bar's rows, or a whole new bar; terminal output (inside tab-body) is skipped first, as it is most of it.
    const inToolbar = r => r.addedNodes.length && r.target.nodeType === 1 && !r.target.closest('tab-body') && (r.target.closest('.tab-bar')
        ? !r.target.closest('.tabs')
        : [...r.addedNodes].some(n => n.nodeType === 1 && (n.matches('.tab-bar') || n.querySelector('.tab-bar'))))
    const topObserver = new MutationObserver(records => {
        if (records.some(inToolbar)) {
            queueTopButtons()
        }
    })
    topObserver.observe(document.body, { childList: true, subtree: true })
    queueTopButtons()

    function render () {
        if (disposed) {
            return
        }
        // A rename field removed from the page while focused never blurs, which would leave rendering off for good.
        if (editing && !document.querySelector('.tg-name[contenteditable="true"], .tg-tab-rename')) {
            editing = false
        }
        // During a tab drag Tabby moves a placeholder through the list, so DOM order no longer matches app.tabs.
        if (editing || dragging) {
            return
        }
        // Several rules tie Tabby's in specificity (e.g. the row width), so the later sheet wins. The plugin loads before
        // Angular adds Tabby's component styles, and Angular adds more as views first appear, so the sheet is kept last.
        if (style.nextElementSibling) {
            document.head.appendChild(style)
        }
        observer.disconnect()
        container = document.querySelector('.tab-bar .tabs')
        if (!container) {
            return
        }
        // Removing the group rows shortens the list for a moment, and the browser would clamp the scroll position to the top.
        const scroller = container.closest('.tab-bar')
        const scrollTop = scroller?.scrollTop ?? 0
        container.querySelectorAll(':scope > .tg-header, :scope > .tg-foot, :scope > .tg-empty').forEach(e => e.remove())
        const vertical = !!container.closest('.tabs-on-left, .tabs-on-right')
        container.classList.toggle('tg-light', vertical && isLightBg(getComputedStyle(container).getPropertyValue('--tg-bg')))
        // The plugin only shapes a side tab bar; with tabs on top or bottom Tabby looks stock, and groups wait in memory.
        setLiveReorder(container, !vertical)
        if (!vertical) {
            clearDecorations()
            mountChrome(false)
            return
        }
        const headers = container.querySelectorAll(':scope > tab-header')
        const commonDepth = (a, b) => {
            let k = 0
            while (k < a.length && a[k] === b[k]) {
                k++
            }
            return k
        }
        // While searching, a tab shows when every word matches its title, a group name, its folder, its app or shell,
        // or (a number, with or without #) its tab number — whatever is collapsed.
        const q = query.trim().toLowerCase()
        const words = q.split(/\s+/).filter(Boolean)
        const matches = tab => {
            const info = (tab.getFocusedTab?.() ?? tab.getAllTabs?.()[0] ?? tab).__tgInfo
            const text = [titleOf(tab), ...chainOf(tab.__tg).map(g => g.name), info?.cwd, info?.kind, iconOf(info?.kind)?.label]
                .filter(Boolean).join('\n').toLowerCase()
            const number = String(app.tabs.indexOf(tab) + 1)
            return words.every(w => text.includes(w) || w.replace(/^#/, '') === number)
        }
        const hideTab = tab => q ? !matches(tab) : tabHidden(tab)
        const hideHead = g => q ? !subtree(g.id).some(matches) : headerHidden(g)
        // A subgroup's footer shows while anything below its header is visible.
        const open = g => q ? !hideHead(g) : !headerHidden(g) && (!g.collapsed || inGroup(app.activeTab, g.id))
        firstMatch = q ? app.tabs.find(matches) : null
        mountChrome(vertical)

        const rows = []
        const makeFoot = (g, k) => {
            const f = document.createElement('div')
            f.className = 'tg-foot'
            f.dataset.group = g.id
            f.dataset.name = g.name
            f.innerHTML = '<div class="tg-foot-inner"></div>'
            f.style.setProperty('--tg-own', tint(g))
            f.style.setProperty('--tg-own-pct', tintPct(k) + '%')
            f.style.setProperty('--tg-own-depth', shadeOf(g))
            return f
        }
        // An empty group has no tab to hang on: it shows at its slot in its parent's panel (places.js), as a header and a
        // slim "empty" row. A group whose parent is not restored yet counts as top level.
        const empties = [...groups.values()].filter(g => !subtree(g.id).length)
        const shown = new Set()
        const emptiesUpTo = (panel, k) => empties.filter(g => !shown.has(g) && panelOf(groups, g) === panel && (g.slot ?? Infinity) <= k)
        // Placed after `ref`, or before it when `before`; returns the last row placed after.
        const emitEmpty = (g, ref, before = false) => {
            shown.add(g)
            const chain = chainOf(g.id)
            const k = chain.length - 1
            const add = (el, row) => {
                // A drop on the free space below goes after the last tab, above the empty groups (onDragMove marks it there).
                el.classList.add('tg-of-empty')
                if (before) {
                    ref.before(el)
                } else {
                    ref ? ref.after(el) : container.append(el)
                    ref = el
                }
                rows.push({ el, chain, ...row })
            }
            add(makeHeader(g, k, k === 0 && !!rows.at(-1)?.chain.length, k > 0 && open(g)), { hidden: hideHead(g), kind: 'head' })
            const empty = Object.assign(document.createElement('div'), { className: 'tg-empty', textContent: 'Empty' })
            empty.dataset.group = g.id
            empty.dataset.name = g.name
            add(empty, { hidden: !!q || shut(g), kind: 'empty' })
            emptiesUpTo(g.id, Infinity).forEach(c => { ref = emitEmpty(c, ref, before) })
            if (k > 0) {
                add(makeFoot(g, k), { hidden: !open(g), kind: 'foot' })
            }
            return ref
        }
        // Units seen so far in each panel: a unit starting at `el` first takes the empty groups slotted before it.
        const counts = new Map()
        const unitStarts = (panel, el) => {
            const k = counts.get(panel) ?? 0
            emptiesUpTo(panel, k).forEach(g => emitEmpty(g, el, true))
            counts.set(panel, k + 1)
        }
        app.tabs.forEach((tab, i) => {
            const el = headers[i]
            if (!el) {
                return
            }
            const chain = chainOf(tab.__tg)
            const prev = chainOf(app.tabs[i - 1]?.__tg)
            for (let k = commonDepth(chain, prev); k < chain.length; k++) {
                unitStarts(k ? chain[k - 1].id : null, el)
                const h = makeHeader(chain[k], k, k === 0 && !!rows.at(-1)?.chain.length, k > 0 && open(chain[k]))
                el.before(h)
                rows.push({ el: h, chain: chain.slice(0, k + 1), hidden: hideHead(chain[k]), kind: 'head' })
            }
            unitStarts(chain.at(-1)?.id ?? null, el)
            rows.push({ el, chain, hidden: hideTab(tab), kind: 'tab', active: tab === app.activeTab, tab })
            const next = chainOf(app.tabs[i + 1]?.__tg)
            let after = el
            // Each panel that ends here first takes its empty subgroups, then (below the top level) its footer.
            for (let k = chain.length - 1; k >= commonDepth(chain, next); k--) {
                emptiesUpTo(chain[k].id, Infinity).forEach(c => { after = emitEmpty(c, after) })
                if (k >= 1) {
                    const f = makeFoot(chain[k], k)
                    after.after(f)
                    after = f
                    rows.push({ el: f, chain: chain.slice(0, k + 1), hidden: !open(chain[k]), kind: 'foot' })
                }
            }
        })
        emptiesUpTo(null, Infinity).forEach(g => emitEmpty(g, null))

        const visible = rows.filter(r => !r.hidden)
        rows.forEach(r => {
            const root = r.chain[0]
            const prev = visible[visible.indexOf(r) - 1]
            const next = visible[visible.indexOf(r) + 1]
            r.el.classList.toggle('tg-hidden', r.hidden)
            r.el.classList.toggle('tg-last', !!root && !r.hidden && next?.chain[0] !== root)
            if (r.kind === 'tab') {
                r.el.classList.toggle('tg-member', !!root && !r.hidden)
            }
            if (r.kind === 'head' && r.chain.length > 1) {
                r.el.classList.toggle('tg-after-sub', prev?.kind === 'foot' && prev.chain.length === r.chain.length)
            }
            r.el.style.setProperty('--tg-color', root ? tint(root) : '')
            paintNesting(r, vertical)
            if (r.kind === 'tab') {
                decorate(r.el, r.tab, vertical)
            }
        })
        if (scroller) {
            scroller.scrollTop = scrollTop
        }
        observer.observe(container, { childList: true })
    }

    /**
     * A row at level L is inset into the level-L panel and painted in its colour. The enclosing panels show as side bands:
     * offset box-shadows, one per outer level, drawn from the row's own edges with the row's exact height.
     */
    function paintNesting (r, vertical) {
        const level = Math.max(0, r.chain.length - (r.kind === 'tab' || r.kind === 'empty' ? 1 : 2))
        r.el.style.setProperty('--tg-level', vertical ? level : 0)
        if (!vertical || !level) {
            ;['background-color', 'box-shadow'].forEach(p => r.el.style.removeProperty(p))
            return
        }
        const mix = (g, pct) => shaded(`color-mix(in srgb, ${tint(g)} ${pct}%, var(--tg-bg))`, shadeOf(g))
        const pct = tintPct(level) + (r.active ? ACTIVE_TINT_ADD : 0)
        const bands = []
        for (let m = level - 1; m >= 0; m--) {
            const offset = (level - m) * gap
            const band = mix(r.chain[m], tintPct(m))
            bands.push(`-${offset}px 0 0 0 ${band}`, `${offset}px 0 0 0 ${band}`)
        }
        r.el.style.setProperty('background-color', mix(r.chain[level], pct), 'important')
        r.el.style.setProperty('box-shadow', bands.join(','), 'important')
    }

    /** Whether a CSS colour is light (relative luminance over 0.5); a canvas turns any CSS colour into #rrggbb. */
    const colorProbe = document.createElement('canvas').getContext('2d')
    function isLightBg (cssColor) {
        colorProbe.fillStyle = '#000'
        colorProbe.fillStyle = cssColor.trim() || '#000'
        const hex = colorProbe.fillStyle
        if (!/^#[0-9a-f]{6}$/i.test(hex)) {
            return false
        }
        const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
        return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5
    }

    function makeHeader (g, depth, afterGroup, open) {
        const h = document.createElement('div')
        h.className = 'tg-header ' + (depth ? 'tg-sub' : 'tg-root') + (afterGroup ? ' tg-after-group' : '') + (depth && !open ? ' tg-shut' : '')
        h.dataset.group = g.id
        h.dataset.name = g.name
        h.style.setProperty('--tg-own', tint(g))
        h.style.setProperty('--tg-own-pct', tintPct(depth) + '%')
        h.style.setProperty('--tg-own-depth', shadeOf(g))
        h.dataset.tgTip = g.name
        const count = subtree(g.id).length
        const body = '<span class="tg-arrow"></span><span class="tg-text"><span class="tg-name"></span><span class="tg-count"></span></span>'
        h.innerHTML = depth ? `<div class="tg-inner">${body}</div>` : body
        const arrow = h.querySelector('.tg-arrow')
        // Lucide chevron-right (ISC).
        arrow.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>'
        arrow.classList.toggle('tg-open', !shut(g))
        if (g.pinned) {
            ;(h.querySelector('.tg-inner') ?? h).insertAdjacentHTML('beforeend', '<i class="fas fa-thumbtack tg-pin"></i>')
        }
        const countEl = h.querySelector('.tg-count')
        countEl.textContent = `${count} ${count === 1 ? 'tab' : 'tabs'}`
        const needs = subtree(g.id).filter(t => t.__tgInfo?.agent?.needsYou).length
        const busy = subtree(g.id).filter(t => t.__tgInfo?.agent?.state === 'busy' && !t.__tgInfo.agent.asking).length
        const roll = [needs && `${needs} ${needs === 1 ? 'needs' : 'need'} you`, busy && `${busy} busy`].filter(Boolean).join(' · ')
        const asks = subtree(g.id).filter(t => t.__tgInfo?.agent?.asking).length
        if (asks) {
            countEl.append(' · ', Object.assign(document.createElement('span'), { className: 'tg-roll-ask', textContent: `${asks} asking` }))
        }
        const running = subtree(g.id).filter(t => t.__tgInfo?.agent?.background).length
        if (running) {
            countEl.append(' · ', Object.assign(document.createElement('span'), { className: 'tg-roll-run', textContent: `${running} running` }))
        }
        const compacting = subtree(g.id).filter(t => t.__tgInfo?.agent?.compacting).length
        if (compacting) {
            countEl.append(' · ', Object.assign(document.createElement('span'), { className: 'tg-roll-cmp', textContent: `${compacting} compacting` }))
        }
        if (roll) {
            countEl.append(' · ', Object.assign(document.createElement('span'), { className: 'tg-roll', textContent: roll }))
        }
        const add = Object.assign(document.createElement('button'), { className: 'tg-add', textContent: '+' })
        add.dataset.tgTip = add.ariaLabel = `New tab in ${g.name}`
        ;(h.querySelector('.tg-inner') ?? h).append(add)
        // Its own click only: no fold, no group drag, no rename, no second tab from a double-click.
        for (const type of ['pointerdown', 'dblclick']) {
            add.addEventListener(type, e => e.stopPropagation())
        }
        add.addEventListener('click', e => {
            e.stopPropagation()
            openViaPlus(g.id)
        })
        const nameEl = h.querySelector('.tg-name')
        nameEl.textContent = g.name

        // A click toggles after a short delay, so a double-click on the name can cancel it and rename instead.
        let clickTimer = null
        h.addEventListener('click', e => {
            if (editing) {
                return
            }
            clearTimeout(clickTimer)
            // The second click of a double-click (a rename on the name) cancels the pending collapse.
            if (e.detail > 1) {
                return
            }
            clickTimer = setTimeout(() => setCollapsed(g.id, !shut(g)), 220)
        })
        nameEl.addEventListener('dblclick', e => {
            e.stopPropagation()
            clearTimeout(clickTimer)
            startRename(g)
        })
        h.addEventListener('dblclick', e => {
            e.stopPropagation()
            clearTimeout(clickTimer)
        })
        h.addEventListener('contextmenu', e => {
            e.preventDefault()
            e.stopPropagation()
            openMenu(g, e.clientX, e.clientY)
        })
        h.addEventListener('pointerdown', e => startGroupDrag(g, h, e))
        return h
    }

    function startRename (g) {
        const nameEl = [...document.querySelectorAll('.tg-header')].find(h => h.dataset.group === g.id)?.querySelector('.tg-name')
        if (!nameEl) {
            return
        }
        editing = true
        nameEl.contentEditable = 'true'
        nameEl.focus()
        document.getSelection().selectAllChildren(nameEl)
        const finish = commit => {
            nameEl.removeEventListener('blur', onBlur)
            nameEl.removeEventListener('keydown', onKey)
            nameEl.contentEditable = 'false'
            editing = false
            if (!commit || !rename(g.id, nameEl.textContent.trim())) {
                render()
            }
        }
        const onBlur = () => finish(true)
        // Stops Tabby's hotkeys from seeing the keys typed into the name.
        const onKey = e => {
            e.stopPropagation()
            if (e.key === 'Enter') {
                e.preventDefault()
                finish(true)
            } else if (e.key === 'Escape') {
                finish(false)
            }
        }
        nameEl.addEventListener('blur', onBlur)
        nameEl.addEventListener('keydown', onKey)
    }

    // Tabby renames a tab in a dialog on double-click; in the side bar the title is edited in place instead.
    // A capture listener on the document runs before Tabby's own double-click handler on the tab header.
    function onTabDblClick (e) {
        const el = e.target.closest?.('.tabs > tab-header')
        if (!el || e.target.closest('.buttons, .tg-tab-rename') || !el.closest('.tabs-on-left, .tabs-on-right')) {
            return
        }
        const tab = app.tabs[[...el.parentElement.querySelectorAll(':scope > tab-header')].indexOf(el)]
        if (!tab) {
            return
        }
        e.stopPropagation()
        e.preventDefault()
        startTabRename(el, tab)
    }
    document.addEventListener('dblclick', onTabDblClick, true)

    // A double-click on free side-bar space outside every group opens a loose tab, from Tabby's own "+" button, so it
    // follows Tabby's new-tab rules. Inside a group's panel (its "Empty" row too) it does nothing: the group's + opens a tab there.
    function onBarDblClick (e) {
        const bar = e.target.closest?.('.tabs-on-left > .tab-bar, .tabs-on-right > .tab-bar')
        if (!bar || e.target.closest('tab-header, .tg-toolbar, .btn-group, .tg-name, .tg-tab-rename, .tg-resize, .tg-add')) {
            return
        }
        e.stopPropagation()
        e.preventDefault()
        if (!groupAtPoint(bar, e.clientX, e.clientY)) {
            openViaPlus(null)
        }
    }

    /**
     * The group whose panel is under a point. The row at that height gives the group path; the distance from the
     * list's nearer side edge gives the depth, since each nesting level is inset one gap. So a click in a parent's
     * side band beside a subgroup belongs to the parent.
     */
    function groupAtPoint (bar, x, y) {
        const list = bar.querySelector(':scope > .tabs')
        const row = list && [...list.children].find(r => {
            const b = r.getBoundingClientRect()
            return b.height > 0 && y >= b.top && y < b.bottom
        })
        if (!row) {
            return null
        }
        const chain = row.matches('tab-header') ? chainOf(tabOfRow(row)?.__tg) : chainOf(row.dataset.group)
        const l = list.getBoundingClientRect()
        const depth = Math.floor(Math.min(x - l.left, l.right - x) / gap) - 1
        return depth < 0 || !chain.length ? null : chain[Math.min(depth, chain.length - 1)].id
    }
    document.addEventListener('dblclick', onBarDblClick, true)

    // A right-click on the same free space opens the new-tab picker; the new tab lands in the group under the pointer, else outside every group.
    // On a group header's "+" it opens for that group (this capture listener runs before the header's own menu).
    let closePicker = null
    async function onBarContextMenu (e) {
        const bar = e.target.closest?.('.tabs-on-left > .tab-bar, .tabs-on-right > .tab-bar')
        const plus = e.target.closest?.('.tg-header .tg-add')
        if (!bar || (!plus && e.target.closest('tab-header, .tg-header, .tg-toolbar, .tg-buttons, .btn-group, .tg-name, .tg-tab-rename, .tg-resize, .tg-add'))) {
            return
        }
        e.stopPropagation()
        e.preventDefault()
        const group = plus ? plus.closest('.tg-header').dataset.group : groupAtPoint(bar, e.clientX, e.clientY)
        // A new empty group goes at the end of the "+"'s group, or after the units of its panel that show above the click.
        const tabRows = [...bar.querySelectorAll(':scope > .tabs > tab-header')]
        const above = el => { const b = el?.getBoundingClientRect(); return !!b && b.top + b.height / 2 < e.clientY }
        // A hidden row (a search, a collapsed group) has no height: it goes with the next row that shows.
        const sides = unitsOf(app.tabs, groups, group).map(({ unit, head }) => {
            const el = app.tabs.includes(unit) ? tabRows[app.tabs.indexOf(head)] : [...bar.querySelectorAll(':scope > .tabs > .tg-header')].find(h => h.dataset.group === unit.id)
            return plus || (el?.getBoundingClientRect().height ? above(el) : null)
        })
        for (let k = sides.length - 1; k >= 0; k--) {
            sides[k] ??= sides[k + 1] ?? false
        }
        const slot = sides.filter(Boolean).length
        const profiles = await injector.get(core.ProfilesService).getProfiles()
        if (disposed) {
            return
        }
        // Tabby's default profile (Settings → Terminal), else its first built-in local shell, as Tabby falls back.
        const id = injector.get(core.ConfigService).store.terminal?.profile
        const defaultProfile = profiles.find(p => p.id === id) ?? profiles.find(p => p.type === 'local' && p.isBuiltin) ?? null
        const rows = pickerItems({ defaultProfile, profiles, pinned: pickerPins, files: !!window.__tabbyFiles?.open, group })
        closePicker?.()
        // Tabby appends a new tab at the end, outside every group; open() files it in `group` before it types a command.
        closePicker = showPicker(rows, e.clientX, e.clientY, async ({ spec }) => {
            if (spec.newGroup) {
                return newEmptyGroup(group, slot)
            }
            if (!spec.files) {
                return open({ ...spec, group })
            }
            const tab = await window.__tabbyFiles.open()
            if (tab && group && !disposed) {
                addTab(tab, group)
            }
        }, {
            // The Files tab's side-bar icon, and the group glyph (Settings → Tab groups) with a small plus.
            files: () => drawIcon(ICONS.files),
            group: () => Object.assign(document.createElement('span'), { innerHTML: '<i class="fas fa-layer-group"></i><span class="tg-pick-plus">+</span>' }),
        })
    }
    document.addEventListener('contextmenu', onBarContextMenu, true)

    const tooltip = createTooltip()
    const { hideTip } = tooltip

    function openViaPlus (group) {
        const plus = document.querySelector('.tab-bar > .tabs + .btn-group button')
        if (!plus) {
            return
        }
        if (group) {
            // The next tab opened within 30 s joins the group; a profile list closed by a click (not Escape)
            // leaves that window open. Opening through ProfilesService instead would mean copying the "+" button's logic.
            const cancel = () => {
                sub.unsubscribe()
                clearTimeout(timer)
                document.removeEventListener('keydown', onKey, true)
            }
            const onKey = e => e.key === 'Escape' && cancel()
            const sub = app.tabOpened$.subscribe(tab => {
                cancel()
                addTab(tab, group)
            })
            const timer = setTimeout(cancel, 30000)
            document.addEventListener('keydown', onKey, true)
        }
        plus.click()
    }

    let cancelTabRename = null
    function startTabRename (el, tab) {
        const name = el.querySelector(':scope > .name')
        if (!name || el.querySelector(':scope > .tg-tab-rename')) {
            return
        }
        const input = document.createElement('input')
        input.className = 'tg-tab-rename'
        input.value = tab.customTitle || tab.title
        input.spellcheck = false
        // Lies over the title line, with the text where the title's text was.
        Object.assign(input.style, { left: name.offsetLeft - 5 + 'px', top: name.offsetTop - 1 + 'px', width: name.offsetWidth + 10 + 'px' })
        el.append(input)
        editing = true
        input.focus()
        input.select()
        let done = false
        const finish = commit => {
            if (done) {
                return
            }
            done = true
            cancelTabRename = null
            document.removeEventListener('pointerdown', onOutside, true)
            // An empty name hands the tab back to its shell's own title.
            if (commit && input.value.trim() !== (tab.customTitle || tab.title)) {
                tab.setCustomTitle(input.value.trim())
                app.emitTabsChanged()
            }
            input.remove()
            editing = false
            render()
        }
        // The double-click's first click selects the tab, and Tabby then moves focus into its terminal. So the field
        // takes focus back and saves only on Enter or a click elsewhere, not on any focus loss.
        const onOutside = e => {
            if (e.target !== input) {
                finish(true)
            }
        }
        document.addEventListener('pointerdown', onOutside, true)
        cancelTabRename = () => finish(false)
        input.addEventListener('blur', () => setTimeout(() => {
            if (!done && input.isConnected && document.hasFocus()) {
                input.focus()
            }
        }))
        // Stops Tabby's hotkeys, tab selection and dragging from seeing what happens in the field.
        input.addEventListener('keydown', e => {
            e.stopPropagation()
            if (e.key === 'Enter') {
                e.preventDefault()
                finish(true)
            } else if (e.key === 'Escape') {
                finish(false)
            }
        })
        for (const type of ['mousedown', 'mouseup', 'click', 'dblclick']) {
            input.addEventListener(type, e => e.stopPropagation())
        }
    }

    // Tabby's own tab-menu actions, made group-aware in the side bar: Rename edits in place (also Tabby's rename hotkey),
    // Duplicate keeps the copy in the original's group, and Pin on a grouped tab pins it inside its group.
    const sideBar = () => !!document.querySelector('.tabs-on-left, .tabs-on-right')
    const origRename = app.renameTab
    const origDuplicate = app.duplicateTab
    const origTogglePin = app.toggleTabPinned
    app.renameTab = function (tab) {
        const i = app.tabs.indexOf(tab)
        const row = i >= 0 && sideBar() ? document.querySelectorAll('.tab-bar .tabs > tab-header')[i] : null
        return row ? startTabRename(row, tab) : origRename.call(this, tab)
    }
    // Tabby's duplicateTab, with the copy put in the group before it is inserted: inserted first, it would sit inside the
    // group as a stranger, and keeping the group together would push it out to the group's end.
    app.duplicateTab = async function (tab) {
        if (!this.tabsService?.duplicate) {
            return origDuplicate.call(this, tab)
        }
        const dup = await this.tabsService.duplicate(tab)
        if (dup) {
            // Tabby copies through the recovery token, which carries the group.
            delete dup.__tgRestore
            if (tab.__tg && groups.has(tab.__tg)) {
                setMembership(dup, tab.__tg)
            }
            this.addTabRaw(dup, this.tabs.indexOf(tab) + 1)
        }
        return dup
    }
    // Pin on a grouped tab is a local pin: first in its own group, nothing else moves.
    app.toggleTabPinned = function (tab) {
        return tab.__tg ? setTabPinned(tab, !tab.__tgPinned) : origTogglePin.call(this, tab)
    }

    // Tabby's split-tab title, "focused pane | other panes", has two faults: it is rebuilt while a leaving pane still has
    // focus, so that pane's name stays ("a | b" on a one-pane tab), and a restored tab not yet shown has no focused pane,
    // so the title starts with an empty name (" | b"). The title skips missing names and is rebuilt once focus has moved.
    const SplitTab = core.SplitTabComponent
    const origRemovePane = SplitTab?.prototype.removeTab
    const origUpdateTitle = SplitTab?.prototype.updateTitle
    if (origRemovePane && origUpdateTitle) {
        SplitTab.prototype.updateTitle = function () {
            if (this.disableDynamicTitle) {
                return
            }
            const focused = this.getFocusedTab()
            const titles = [focused, ...this.getAllTabs().filter(p => p !== focused)].map(p => p?.displayTitle).filter(Boolean)
            this.setTitle([...new Set(titles)].join(' | '))
        }
        SplitTab.prototype.removeTab = function (tab) {
            origRemovePane.call(this, tab)
            this.updateTitle()
        }
        app.tabs.forEach(t => t instanceof SplitTab && t.updateTitle())
    }

    // Persistence: the group path rides in each tab's recovery token and comes back as a tab input.
    const origGetToken = recovery.getFullRecoveryToken
    const origRecover = recovery.recoverTab
    recovery.getFullRecoveryToken = async function (tab, options) {
        const token = await origGetToken.call(this, tab, options)
        const chain = chainOf(tab.__tg)
        if (token && chain.length) {
            token.tabbyGroup = chain.map(g => ({ id: g.id, name: g.name, color: g.color, collapsed: g.collapsed, pinned: g.pinned }))
            if (tab.__tgPinned) {
                token.tabbyPinned = true
            }
        }
        // A split tab saves each pane through this same function, so a pane carries its own folder and resume command.
        // Tabby saves the folder it guesses from the output (any path the shell or Claude printed); the folder line wins.
        const info = tab.__tgInfo
        if (token && info) {
            if (info.cwd && token.profile?.options && require('fs').existsSync(info.cwd)) {
                token.profile.options.cwd = info.cwd
            }
            // Tabby's own copy of a pane (split, duplicate) asks without includeState and must not start the session twice.
            if (info.resume && options?.includeState) {
                token.tabbyResume = info.resume
                // A resumed Claude comes back in the default profile's shell, so the user's shell profile (functions,
                // aliases) is there, whatever shell the tab happened to start in.
                const options = token.profile?.options
                const shell = options && await defaultShell()
                if (shell) {
                    options.command = shell.command
                    options.args = shell.args
                }
            }
            // A tab that moves to another window takes its pane state along (see windows.js).
            if (tab.__tgMoving) {
                const { resumePending, ...state } = info
                token.tabbyInfo = state
            }
        }
        return token
    }
    recovery.recoverTab = async function (token) {
        const params = await origRecover.call(this, token)
        if (params && Array.isArray(token.tabbyGroup)) {
            params.inputs.__tgRestore = token.tabbyGroup
            if (token.tabbyPinned) {
                params.inputs.__tgPinned = true
            }
        }
        if (params && typeof token.tabbyResume === 'string') {
            params.inputs.__tgResume = token.tabbyResume
        }
        if (params && token.tabbyInfo) {
            params.inputs.__tgInfo = token.tabbyInfo
        }
        return params
    }
    const windowsApi = createWindows({ app, injector, core, recovery, top, aim: e => aimAt(e), opened: (tab, intent) => {
        watch(tab)
        // The tab or group aimed at may have gone while the tab opened.
        if (intent && app.tabs.includes(tab) && (!intent.tab || app.tabs.includes(intent.tab)) && (!intent.group || groups.has(intent.group.id))) {
            applyDrop(tab, intent)
        }
    }, isDisposed: () => disposed })
    const moveFailed = r => r && !r.ok && injector.get(core.NotificationsService).error(`Could not move the tab: ${r.why}`)
    // A tab dragged across a terminal enters its split drop zones, and Tabby still splits it there when the drop is
    // outside the window. Such a drop is a move to another window (or none), never a split.
    const origTabDropped = SplitTab?.prototype.onTabDropped
    if (origTabDropped) {
        SplitTab.prototype.onTabDropped = function (tab, zone) {
            return windowsApi.droppedOutside(tab) || cancelledDrop(tab) ? undefined : origTabDropped.call(this, tab, zone)
        }
    }
    // Tabby's own tab-bar drop too: after Esc it must neither reorder nor tear a pane out of its split into a new tab.
    // The template calls the root component's method, so a property on the instance stands in for it. Set at the first
    // drag: the plugin installs before Tabby's root component exists.
    let appRoot = null
    function guardTabBarDrop () {
        if (appRoot) {
            return
        }
        const root = require('@angular/core').ɵgetLContext(document.querySelector('app-root'))?.lView?.[8]
        const orig = root?.onTabsReordered
        if (orig && !Object.hasOwn(root, 'onTabsReordered')) {
            appRoot = root
            root.onTabsReordered = event => {
                const tab = event?.item?.data
                // With tabs on the side, the plugin places a dropped tab itself (applyDrop). Tabby's index there counts
                // tabs by screen position, where tabs hidden in a collapsed group (no height) sort first, so its move
                // could land a slot or more off, and a drop beside the tab's own row would move it.
                if (cancelledDrop(tab) || (sideBar() && app.tabs.includes(tab))) {
                    return
                }
                return orig.call(root, event)
            }
        }
    }

    // Types the resume command once the restored pane's shell is ready (whenever its tab is first shown). Until then the
    // command stays the pane's resume, so a restart before the tab was opened still brings the session back later.
    async function resumeLater (pane, command) {
        const info = pane.__tgInfo
        info.resume = command
        info.resumePending = true
        pendingResumes.add(pane)
        queueAutoResume()
        await shellReady(pane)
        pendingResumes.delete(pane)
        // A reload in between handed the resume to the next copy (see dispose).
        if (disposed) {
            return
        }
        info.resumePending = false
        if (!pane._destroyCalled) {
            pane.sendInput(command + '\r')
            startupChecks(pane)
        }
    }

    /*
     * "autoResume": true in tabby-groups.json resumes restored Claude tabs without a click, two at a time: each pair starts
     * once the previous one is idle (or after 90 s), so a restart does not start every session at once. The active tab
     * resumes by itself. Tabby starts a restored tab's terminal on its first focus event, so the pane gets one, without
     * being selected, and the keyboard focus goes back to the tab in front.
     */
    const pendingResumes = new Set()
    const triedResumes = new WeakSet()
    let autoResume = false
    let autoResumeRunning = false
    function queueAutoResume () {
        if (!autoResume || autoResumeRunning || disposed) {
            return
        }
        autoResumeRunning = true
        setTimeout(() => runAutoResume().finally(() => { autoResumeRunning = false }), 3000)
    }
    const wait = ms => new Promise(r => setTimeout(r, ms))
    async function untilTrue (test, ms) {
        for (const end = Date.now() + ms; Date.now() < end && !disposed; await wait(500)) {
            if (test()) {
                return true
            }
        }
        return false
    }
    async function runAutoResume () {
        while (autoResume && !disposed) {
            const front = app.activeTab?.getAllTabs?.() ?? [app.activeTab]
            const order = app.tabs.flatMap(t => t.getAllTabs?.() ?? [t])
            // One try per pane: a pane that does not start (a failed spawn, an SSH host that is down) waits for a click.
            const batch = [...pendingResumes].filter(p => !p._destroyCalled && !front.includes(p) && !triedResumes.has(p))
                .sort((a, b) => order.indexOf(a) - order.indexOf(b)).slice(0, 2)
            if (!batch.length) {
                return
            }
            batch.forEach(p => triedResumes.add(p))
            // A starting terminal takes the keyboard focus: hand it straight back to the tab in front, or drop it there.
            const guard = e => {
                if (batch.some(p => p.content?.nativeElement?.contains(e.target))) {
                    const frontend = (app.activeTab?.getFocusedTab?.() ?? app.activeTab)?.frontend
                    frontend ? frontend.focus() : e.target.blur?.()
                }
            }
            document.addEventListener('focusin', guard, true)
            try {
                for (const pane of batch) {
                    pane.emitFocused()
                }
                await untilTrue(() => batch.every(p => !pendingResumes.has(p)), 20000)
                await wait(2000)
            } finally {
                document.removeEventListener('focusin', guard, true)
            }
            // Idle: the Claude process runs (its session file names it; a restored "✳" title does not count) and waits.
            await untilTrue(() => batch.every(p => p._destroyCalled || (p.__tgInfo?.sessionId && p.__tgInfo.agent?.state === 'waiting')), 90000)
            await wait(2000)
        }
    }

    /*
     * The user's own icons: <Tabby settings folder>/tabby-groups.json, { "icons": [{ "name", "title"?, "process"?, "color"?,
     * "emoji" | "path" | "paths", "stroke"? }] }. "title" is a pattern for the tab title, "process" one for a command line
     * under the tab; the first rule that matches wins over the built-in icons. The file is watched, so edits apply at once.
     */
    const userIconsFile = (() => {
        try {
            return require('path').join(injector.get(core.BOOTSTRAP_DATA).userPluginsPath, '..', 'tabby-groups.json')
        } catch {
            return null
        }
    })()
    let userIcons = []
    let pickerPins = []
    function loadUserIcons () {
        let rules = []
        let buttonRules = []
        pickerPins = []
        autoResume = false
        autoReload = true
        smallTabMenu = true
        focusOnClose = 'recent'
        try {
            const file = JSON.parse(require('fs').readFileSync(userIconsFile, 'utf8'))
            rules = file.icons ?? []
            buttonRules = file.buttons ?? []
            autoResume = file.autoResume === true
            autoReload = file.autoReload !== false
            smallTabMenu = file.smallTabMenu !== false
            focusOnClose = ['recent', 'next', 'previous'].includes(file.focusOnClose) ? file.focusOnClose : 'recent'
            pickerPins = Array.isArray(file.picker) ? file.picker : []
        } catch (e) {
            if (e.code !== 'ENOENT') {
                console.warn('tabby-groups: cannot read', userIconsFile, e.message)
            }
        }
        userIcons = rules.flatMap(r => {
            try {
                if (!r.name || !(r.title || r.process) || !(r.emoji || r.path || r.paths)) {
                    throw new Error('needs name, title or process, and emoji, path or paths')
                }
                return [{
                    kind: 'user:' + r.name, label: r.name, color: r.color ?? '#d0d0d0', emoji: r.emoji, path: r.path, paths: r.paths,
                    stroke: !!r.stroke, title: r.title ? new RegExp(r.title, 'i') : null, process: r.process ? new RegExp(r.process, 'i') : null,
                }]
            } catch (e) {
                console.warn('tabby-groups: icon rule skipped', r?.name, e.message)
                return []
            }
        })
        userIconsVersion++
        app.tabs.flatMap(t => t.getAllTabs?.() ?? [t]).filter(p => p.__tgInfo).forEach(p => queueInspect(p, 100))
        buttonBar.setButtons(buttonRules.filter(b => {
            const ok = b?.label && b.command && (!b.icon || /^[a-z0-9-]+$/.test(b.icon))
            if (!ok) {
                console.warn('tabby-groups: button skipped', b?.label, 'needs label and command; icon is a Font Awesome name')
            }
            return ok
        }))
        queueAutoResume()
    }
    // "autoReload": false in tabby-groups.json: an update only offers "Reload plugins" instead of reloading them itself.
    let autoReload = true
    let smallTabMenu = true
    // "focusOnClose" in tabby-groups.json: which tab shows when the active tab closes (places.js focusAfterClose).
    let focusOnClose = 'recent'
    const origRemoveTab = app.removeTab
    app.removeTab = function (tab) {
        const target = tab === this.activeTab && !disposed ? focusAfterClose(this.tabs, this.mruTabs ?? [], tab, focusOnClose) : null
        if (!target) {
            return origRemoveTab.call(this, tab)
        }
        // With no active tab, Tabby selects nothing as it removes the tab; selecting its pick first would mark that tab
        // seen and put it first in the recent list.
        this._activeTab = null
        origRemoveTab.call(this, tab)
        this.selectTab(target)
    }

    // The small tab menu ("smallTabMenu": false in tabby-groups.json turns it off): a few common actions, and Tabby's
    // whole menu, every provider's items included, under "More options…".
    const TabHeader = core.TabHeaderComponent
    const origBuildMenu = TabHeader?.prototype.buildContextMenu
    let codeExe
    if (origBuildMenu) {
        TabHeader.prototype.buildContextMenu = async function () {
            const full = await origBuildMenu.call(this)
            if (disposed || !smallTabMenu || !sideBar()) {
                return full
            }
            const tab = top(this.tab)
            const info = (tab.getFocusedTab?.() ?? tab.getAllTabs?.()[0] ?? tab).__tgInfo
            const cwd = info?.cwd && require('fs').existsSync(info.cwd) ? info.cwd : null
            codeExe ??= findCode()
            const platform = injector.get(core.PlatformService)
            return smallMenu({
                cwd, files: !!window.__tabbyFiles?.open, code: !!codeExe,
                manager: { darwin: 'Finder', win32: 'Explorer' }[process.platform] ?? 'File manager',
                pinned: tab.__tg ? !!tab.__tgPinned : !!tab.pinned, grouped: !!tab.__tg,
                addToGroup: addToGroupMenu(tab), moveToWindow: moveToWindowMenu(tab), more: full,
            }, {
                // A Files tab in that folder, right after this tab and in its group (tabby-files places it with placeAfter).
                files: dir => window.__tabbyFiles?.open(dir, tab),
                open: dir => platform.openPath(dir),
                // VS Code itself, with no shell between (on Windows `code` is a batch file).
                code: dir => {
                    const env = { ...process.env }
                    delete env.ELECTRON_RUN_AS_NODE
                    const child = require('child_process').spawn(codeExe, [dir], { detached: true, stdio: 'ignore', env })
                    child.on('error', e => injector.get(core.NotificationsService).error(`Could not start VS Code: ${e.message}`))
                    child.unref()
                },
                rename: () => app.renameTab(tab),
                // Tabby's pin toggle: inside a group it is the group's own pin (toggleTabPinned above).
                pin: () => app.toggleTabPinned(tab),
                // The same profile and folder: Tabby's duplicate, which this plugin files in the tab's group, right after it.
                duplicate: () => app.duplicateTab(tab),
                copy: text => platform.setClipboard({ text }),
                closeGroup: () => closeGroup(tab.__tg),
            })
        }
    }
    // Shift+F10 or the menu key opens the active tab's menu, wherever the focus is (the side bar's rows take none), so a
    // terminal app never gets those two keys. Electron opens the menu at the pointer.
    function onTabMenuKey (e) {
        if (!(e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) || !smallTabMenu || !sideBar()) {
            return
        }
        const row = document.querySelectorAll('.tab-bar .tabs > tab-header')[app.tabs.indexOf(app.activeTab)]
        if (row) {
            e.preventDefault()
            e.stopPropagation()
            const r = row.getBoundingClientRect()
            row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + r.height / 2 }))
        }
    }
    document.addEventListener('keydown', onTabMenuKey, true)
    const buttonBar = createButtons({ open, drawIcon, hideTip, isDisposed: () => disposed, autoReload: () => autoReload })
    /** This plugin's reload: drop its modules from the require cache and install the files on disk again. */
    function reload () {
        const dir = require('path').dirname(require.resolve('./index.js'))
        Object.keys(require.cache).filter(k => k.startsWith(dir + require('path').sep)).forEach(k => delete require.cache[k])
        return require(require('path').join(dir, 'index.js')).install(injector)
    }
    let userIconsVersion = 0
    let userIconsWatch = null
    const iconOf = kind => ICONS[kind] ?? userIcons.find(u => u.kind === kind)
    /** An icon as DOM nodes (never markup), so a value from the user's file cannot inject anything. */
    function drawIcon (icon) {
        if (icon.emoji) {
            return Object.assign(document.createElement('span'), { className: 'tg-emoji', textContent: icon.emoji })
        }
        const NS = 'http://www.w3.org/2000/svg'
        const svg = document.createElementNS(NS, 'svg')
        svg.setAttribute('viewBox', '0 0 24 24')
        if (icon.stroke) {
            Object.entries({ fill: 'none', stroke: icon.color, 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })
                .forEach(([k, v]) => svg.setAttribute(k, v))
        }
        for (const d of icon.paths ?? [icon.path]) {
            const path = document.createElementNS(NS, 'path')
            path.setAttribute('d', d)
            if (!icon.stroke) {
                path.setAttribute('fill', icon.color)
            }
            svg.append(path)
        }
        return svg
    }
    if (userIconsFile) {
        loadUserIcons()
        try {
            userIconsWatch = require('fs').watch(require('path').dirname(userIconsFile), (event, file) => file === 'tabby-groups.json' && loadUserIcons())
        } catch { }
    }
    const profileKind = term => term.profile?.type === 'ssh' ? 'ssh' : shellOf(term.profile?.options?.command)

    // Session kind and folder per pane. Nothing polls: a pane is inspected when it opens, after Enter,
    // and when its title or full-screen state changes, each debounced into a single process-tree read.
    async function inspect (term) {
        // A tab of another plugin (a tabby-files tab) sets its own __tgInfo and has no shell to read.
        if (!('frontendReady$' in term)) {
            return
        }
        const info = term.__tgInfo ??= { kind: profileKind(term), cwd: null }
        inbox.watchInput(term)
        let procs = []
        try {
            procs = await processList(await term.session?.pty?.getPID())
        } catch { }
        const [app, appProc] = APPS.map(([kind, test]) => [kind, procs.slice(1).find(test)]).find(([, p]) => p) ?? []
        const shellProc = procs.filter(p => SHELLS[p.name]).pop()
        const shell = SHELLS[shellProc?.name]
        const user = userIcons.find(u => u.title?.test(term.title ?? '') || (u.process && procs.slice(1).some(p => u.process.test(p.raw))))
        // The Claude title is only a fallback without a process list: Tabby restores an old title ("✳ …") with a fresh shell.
        const claudeByTitle = !procs.length && CLAUDE_TITLE.test(term.title ?? '')
        info.kind = user?.kind ?? app ?? (claudeByTitle ? 'claude' : null) ?? shell ?? profileKind(term)
        updateAgent(term)
        // What to type after a restart to bring this session back; kept only while Claude or Codex runs.
        if (procs.length && !info.resumePending) {
            const sessionId = app === 'claude' ? claudeSessionId(appProc.pid) : null
            info.resume = resumeCommand(app, appProc?.raw, sessionId)
            if (sessionId !== (info.sessionId ?? null)) {
                info.sessionId = sessionId
                setAsking(term, sessionId ? readAsking(sessionId) : null)
                setCompacting(term, sessionId ? readCompacting(sessionId) : null)
            }
            setBackground(term, app === 'claude' ? taskShells(procs, appProc.pid) : [])
        }

        // The OS knows the real folder of an app, of cmd, and of a macOS or Linux shell. PowerShell and Git Bash on Windows
        // never tell Windows about a cd, so for them the last prompt on screen is the truth.
        const osKnows = appProc ?? (shell === 'cmd' || (!IS_WIN && shellProc) ? shellProc : null)
        let cwd = osKnows ? await osCwd(osKnows.pid) : promptCwd(term)
        if (!cwd) {
            try {
                cwd = await term.session?.getWorkingDirectory?.()
            } catch { }
        }
        info.cwd = cwd || info.cwd
        queueRender()
    }

    const agentState = createAgent({ app, top, queueRender, inspect, isDisposed: () => disposed })
    const { updateAgent, readAsking, setAsking, readCompacting, setCompacting, setBackground, markSeen } = agentState
    const onAgentEvent = e => inbox.onAgent(e.detail.tab)
    window.addEventListener('tabby-groups:agent', onAgentEvent)
    function onWindowFocus () {
        if (app.activeTab) {
            markSeen(app.activeTab)
        }
    }

    function queueInspect (term, delay = 800) {
        clearTimeout(term.__tgTimer)
        term.__tgTimer = setTimeout(() => inspect(term), delay)
    }

    function watch (top) {
        for (const term of top.getAllTabs?.() ?? [top]) {
            if (term.__tgWatched || !('frontendReady$' in term)) {
                continue
            }
            term.__tgWatched = true
            // Until the shell runs, show the folder Tabby will start it in (a restored tab's last folder).
            term.__tgInfo ??= { kind: profileKind(term), cwd: term.profile?.options?.cwd || null }
            if (term.__tgResume) {
                resumeLater(term, term.__tgResume)
                delete term.__tgResume
            }
            // Per pane, so a closed tab releases its subscriptions and timers (sessionChanged never completes).
            const subs = term.__tgSubs = []
            // Both streams throw until the tab's terminal view exists.
            const onFrontend = () => subs.push(
                term.input$.subscribe(buf => {
                    if (buf.includes(13)) {
                        queueInspect(term)
                    }
                }),
                term.alternateScreenActive$.subscribe(() => queueInspect(term)),
            )
            subs.push(
                term.titleChange$.subscribe(() => {
                    updateAgent(term)
                    queueInspect(term)
                }),
                // Tabby starts a restored background tab's shell only when the tab is first shown.
                term.sessionChanged$.subscribe(() => startupChecks(term)),
            )
            if (term.frontend) {
                onFrontend()
            } else {
                subs.push(term.frontendReady$.subscribe(onFrontend))
            }
            subs.push(term.destroyed$.subscribe({ complete: () => unwatch(term) }))
            startupChecks(term)
        }
    }

    function unwatch (term) {
        term.__tgSubs?.forEach(s => s.unsubscribe())
        delete term.__tgSubs
        clearTimeout(term.__tgTimer)
        clearTimeout(term.__tgLateTimer)
        clearTimeout(term.__tgBgTimer)
        clearTimeout(term.__tgCmpTimer)
        delete term.__tgWatched
    }

    // A profile can start a program straight away, after a slow shell profile and with no Enter to trigger a check,
    // so a starting shell gets one early check and one later one.
    function startupChecks (term) {
        queueInspect(term, 1500)
        clearTimeout(term.__tgLateTimer)
        term.__tgLateTimer = setTimeout(() => inspect(term), 6000)
    }

    let renderQueued = false
    function queueRender () {
        if (!renderQueued && !disposed) {
            renderQueued = true
            setTimeout(() => {
                renderQueued = false
                render()
            })
        }
    }

    /** Adds the session icon and, in the side tab bar, the folder line. Shows the focused pane of a split tab. */
    function decorate (el, tab, vertical) {
        // A new tab's terminal pane attaches after Tabby announces the tab, so every render watches what is new.
        watch(tab)
        const name = el.querySelector(':scope > .name')
        if (!name) {
            return
        }
        const info = (tab.getFocusedTab?.() ?? tab.getAllTabs?.()[0] ?? tab).__tgInfo
        const icon = iconOf(info?.kind)
        let iconEl = el.querySelector(':scope > .tg-icon')
        if (icon) {
            if (!iconEl) {
                iconEl = document.createElement('span')
                iconEl.className = 'tg-icon'
                name.before(iconEl)
            }
            const stamp = info.kind + '#' + userIconsVersion
            if (iconEl.dataset.kind !== stamp) {
                iconEl.dataset.kind = stamp
                iconEl.replaceChildren(drawIcon(icon))
            }
        } else {
            iconEl?.remove()
        }
        const agent = tab.__tgInfo?.agent ?? info?.agent
        const asking = agent?.asking?.kind
        // Asking replaces the busy ring too: Claude keeps its spinner title while a subagent runs after it asked.
        iconEl?.classList.toggle('tg-busy', agent?.state === 'busy' && !asking)
        iconEl?.classList.toggle('tg-needs', !!agent?.needsYou && !asking)
        iconEl?.classList.toggle('tg-ask', !!asking)
        if (iconEl) {
            asking ? iconEl.dataset.ask = asking : delete iconEl.dataset.ask
        }
        el.classList.toggle('tg-needs-you', !!agent?.needsYou)
        el.classList.toggle('tg-asking', !!asking)
        let bgEl = iconEl?.querySelector(':scope > .tg-bgtask')
        if (iconEl && agent?.background) {
            bgEl ??= iconEl.appendChild(Object.assign(document.createElement('span'), { className: 'tg-bgtask' }))
            bgEl.textContent = String(agent.background.count)
            bgEl.dataset.tgTip = `Running in background: ${agent.background.labels.length ? agent.background.labels.join(', ') : agent.background.count + ' task' + (agent.background.count === 1 ? '' : 's')}`
        } else {
            bgEl?.remove()
        }
        let cmpEl = iconEl?.querySelector(':scope > .tg-compact')
        if (iconEl && agent?.compacting) {
            cmpEl ??= iconEl.appendChild(Object.assign(document.createElement('span'), { className: 'tg-compact', innerHTML: '<i class="fas fa-compress-alt"></i>' }))
            cmpEl.dataset.tgTip = `Compacting context (${agent.compacting.trigger})`
        } else {
            cmpEl?.remove()
        }
        // Inbox messages not yet taken (a busy Claude, or a draft held the nudge): a blue mail badge at the icon's top-right.
        let mailEl = iconEl?.querySelector(':scope > .tg-mail')
        if (iconEl && inbox.unread(tab)) {
            mailEl ??= iconEl.appendChild(Object.assign(document.createElement('span'), { className: 'tg-mail', innerHTML: '<i class="fas fa-envelope"></i>' }))
            mailEl.dataset.tgTip = 'New inbox messages: they reach Claude with your next message'
        } else {
            mailEl?.remove()
        }
        // A tab pinned inside its group shows a pin where Tabby shows its own (between the number and the icon).
        let pinEl = el.querySelector(':scope > .tg-tab-pin')
        if (tab.__tgPinned && tab.__tg) {
            if (!pinEl) {
                pinEl = Object.assign(document.createElement('i'), { className: 'fas fa-thumbtack tg-tab-pin' })

                ;(el.querySelector(':scope > .tg-icon') ?? name).before(pinEl)
            }
        } else {
            pinEl?.remove()
        }
        const cwd = vertical ? info?.cwd : null
        let cwdEl = name.querySelector(':scope > .tg-cwd')
        el.classList.toggle('tg-two-line', !!cwd)
        if (cwd) {
            if (!cwdEl) {
                cwdEl = document.createElement('span')
                cwdEl.className = 'tg-cwd'
                name.append(cwdEl)
            }
            // A saved profile folder can use forward slashes; show Windows paths the way the shell prints them.
            cwdEl.textContent = /^[a-z]:[\\/]/i.test(cwd) ? cwd.replace(/\//g, '\\') : cwd
        } else {
            cwdEl?.remove()
        }
        // Devices viewing this tab through tabby-remote (its data), typing first. Kept while unchanged, so the pulse runs on.
        const order = { typing: 0, watching: 1, away: 2 }
        const devices = [...tab.__trPresence ?? []].sort((a, b) => (order[a.state] ?? 1) - (order[b.state] ?? 1))
        const key = JSON.stringify(devices)
        let box = el.querySelector(':scope > .tg-presence')
        if (box?.dataset.key !== key) {
            box?.remove()
            box = null
        }
        if (devices.length && !box) {
            box = Object.assign(document.createElement('span'), { className: 'tg-presence' })
            box.dataset.key = key
            const tip = d => `${d.name} · ${d.state}${d.sizer ? ' · sets the size' : ''}`
            for (const d of devices.slice(0, 3)) {
                const badge = Object.assign(document.createElement('span'), { className: `tg-badge tg-${d.state}`, textContent: (d.name || '?')[0].toUpperCase() })
                badge.style.setProperty('--tg-badge', d.color)
                badge.dataset.tgTip = tip(d)
                box.append(badge)
            }
            if (devices.length > 3) {
                const more = Object.assign(document.createElement('span'), { className: 'tg-more', textContent: `+${devices.length - 3}` })
                more.dataset.tgTip = devices.slice(3).map(tip).join(', ')
                box.append(more)
            }
            const buttons = el.querySelector(':scope > .buttons')
            buttons ? buttons.before(box) : el.append(box)
        }
        const btnsWidth = el.querySelector(':scope > .buttons')?.offsetWidth
        if (box && btnsWidth && box.style.getPropertyValue('--tg-btns') !== btnsWidth + 'px') {
            box.style.setProperty('--tg-btns', btnsWidth + 'px')
        }
    }

    app.tabs.forEach(watch)

    // Neighbours for the empty groups a reload handed over, before the first change moves anything.
    trackSlots(app.tabs, groups, marks)
    const subs = [
        app.tabOpened$.subscribe(watch),
        app.tabOpened$.subscribe(tab => {
            const path = tab.__tgRestore
            if (!path) {
                return
            }
            delete tab.__tgRestore
            const chain = restorePath(groups, path)
            // Joining a group clears a local pin, so the restored one is put back afterwards.
            const localPin = !!tab.__tgPinned
            addTab(tab, chain.at(-1).id, { restore: true })
            tab.__tgPinned = localPin
            chain.forEach((g, k) => Object.assign(g, { collapsed: path[k].collapsed, pinned: !!path[k].pinned }))
        }),
        app.tabsChanged$.subscribe(() => {
            normalize()
            // Not between the moves of a regather, whose half-done order would give empty groups the wrong neighbours.
            if (!normalizing) {
                trackSlots(app.tabs, groups, marks)
            }
            saveEmptyGroups()
            setTimeout(render)
        }),
        app.activeTabChange$.subscribe(() => {
            if (app.activeTab && document.hasFocus()) {
                markSeen(app.activeTab)
            }
            setTimeout(render)
        }),
        app.tabDragActive$.subscribe(tab => {
            dragging = !!tab
            if (dragging) {
                startDrop(tab)
                windowsApi.dragStart(tab)
            } else {
                endDrop()
                windowsApi.dragEnd()?.then(moveFailed)
                queueRender()
            }
        }),
        // A tab-position change in Settings swaps the sidebar layout without touching the tabs.
        injector.get(core.ConfigService).changed$.subscribe(() => setTimeout(() => {
            normalize()
            render()
        })),
    ]
    render()

    /*
     * Drag and drop in the side bar, iPhone-folder style. Tabby's drag list reorders live, so a tab never stays under the
     * pointer long enough to be dropped onto; the plugin switches that off and decides from where the pointer is at the drop.
     */
    function setLiveReorder (container, on) {
        const list = require('@angular/core').ɵgetDirectives?.(container)?.find(d => d && '_dropListRef' in d)
        if (list && list.sortingDisabled !== !on) {
            list.sortingDisabled = !on
        }
    }

    let draggedTab = null
    let draggedGroup = null
    let dropIntent = null
    // Esc during a drag: { tab, live } while the drag lasts, then { tab, until } for Tabby's split drop, which can come later.
    let dragCancel = null
    const cancelledDrop = tab => !!dragCancel && dragCancel.tab === tab && (dragCancel.live || Date.now() < dragCancel.until)
    const dropLine = Object.assign(document.createElement('div'), { className: 'tg-drop-line' })

    /** The tab for a tab-header row; during a drag Tabby's placeholder stands in the dragged tab's place, so order holds. */
    const tabOfRow = row => app.tabs[[...row.parentElement.querySelectorAll(':scope > tab-header')].indexOf(row)]

    function rowAt (x, y) {
        for (const el of document.elementsFromPoint(x, y)) {
            if (el.closest('.cdk-drag-preview')) {
                continue
            }
            const row = el.closest('.tabs > tab-header, .tabs > .tg-header, .tabs > .tg-foot, .tabs > .tg-empty')
            if (row) {
                return row
            }
        }
        return null
    }

    // Where a drop would land: the middle of a tab groups with it, its edges insert next to it; a group header's lower
    // half is "first in the group" and its upper half "just above it"; a subgroup footer's halves are "last in it" and "just below it".
    function onDragMove (e) {
        dropIntent = null
        if (dragCancel?.live) {
            return
        }
        const row = rowAt(e.clientX, e.clientY)
        const own = row && draggedGroup && (row.matches('tab-header') ? inGroup(tabOfRow(row), draggedGroup.id) : chainOf(row.dataset.group).includes(draggedGroup))
        if (row && !row.matches('.cdk-drag-placeholder') && !own) {
            const r = row.getBoundingClientRect()
            const f = (e.clientY - r.top) / r.height
            if (row.matches('tab-header')) {
                const tab = tabOfRow(row)
                if (tab && tab !== draggedTab) {
                    // A group dropped on a tab goes next to it; no folder of a group and a tab.
                    const where = draggedGroup ? (f < 0.5 ? 'before' : 'after') : f < 0.25 ? 'before' : f > 0.75 ? 'after' : 'onto'
                    dropIntent = { row, tab, where }
                }
            } else if (groups.has(row.dataset.group)) {
                const g = groups.get(row.dataset.group)
                // An empty group's "empty" row takes the tab in.
                dropIntent = row.matches('.tg-empty') ? { row, group: g, where: 'first' }
                    : row.matches('.tg-header')
                        ? { row, group: g, where: f < 0.5 ? 'above' : 'first' }
                        : { row, group: g, where: f < 0.5 ? 'last' : 'below' }
            }
        } else if (!row) {
            // The free space under the last row: the end of the list, outside every group.
            const bar = document.querySelector('.tabs-on-left > .tab-bar, .tabs-on-right > .tab-bar')?.getBoundingClientRect()
            const last = [...document.querySelectorAll('.tab-bar > .tabs > :is(tab-header, .tg-header, .tg-foot):not(.tg-hidden, .tg-of-empty)')].pop()
            if (bar && last && e.clientX >= bar.left && e.clientX <= bar.right && e.clientY > last.getBoundingClientRect().bottom && e.clientY < bar.bottom) {
                dropIntent = { row: last, where: 'end' }
            }
        }
        showDropMark()
    }

    /** Where a tab dropped at this client point would land in the side bar, as onDragMove decides it; null off every row. */
    function aimAt (e) {
        if (!document.querySelector('.tabs-on-left, .tabs-on-right')) {
            return null
        }
        onDragMove(e)
        const i = dropIntent
        dropIntent = null
        showDropMark()
        return i
    }

    function showDropMark () {
        document.querySelectorAll('.tg-drop-onto').forEach(e => e.classList.remove('tg-drop-onto'))
        const i = dropIntent
        if (!i || i.where === 'onto' || i.row.matches('.tg-empty')) {
            dropLine.remove()
            i?.row.classList.add('tg-drop-onto')
            return
        }
        const r = i.row.getBoundingClientRect()
        let y = ['after', 'first', 'below', 'end'].includes(i.where) ? r.bottom : r.top
        // The last tab of a panel holds the panel's bottom gap as padding; the line marks the tab's own edge, above that gap.
        if (i.where === 'after' && i.row.matches('.tg-last')) {
            y -= parseFloat(getComputedStyle(i.row).paddingBottom) || 0
        }
        Object.assign(dropLine.style, { left: r.left + 6 + 'px', width: r.width - 12 + 'px', top: y - 1 + 'px' })
        document.body.appendChild(dropLine)
    }

    // Esc cancels the whole drag: no mark now, and on release the tab (or group) stays where it was.
    const onDragKey = e => {
        if (e.key === 'Escape' && (draggedTab || draggedPane || draggedGroup)) {
            // Not to the terminal too: Esc there would interrupt what runs in it.
            e.preventDefault()
            e.stopPropagation()
            // The object Tabby drags (a pane in rearrange mode), which its split drop is called with.
            dragCancel = { tab: draggedTab ?? draggedPane?.pane ?? null, live: true }
            dropIntent = null
            showDropMark()
        }
    }

    // A pane dragged out of a split (Ctrl+Shift, Tabby's rearrange mode) is dropped on the tab bar as itself: Tabby wraps it in
    // a new tab at the end, and the drop then files that new tab. Its old tab is a valid target, so it is not "the dragged tab".
    let draggedPane = null
    function startDrop (tab) {
        if (!document.querySelector('.tabs-on-left, .tabs-on-right')) {
            return
        }
        draggedPane = app.tabs.includes(tab) ? null : { pane: tab, from: top(tab) }
        draggedTab = draggedPane ? null : tab
        dropIntent = null
        dragCancel = null
        guardTabBarDrop()
        document.addEventListener('pointermove', onDragMove, true)
        document.addEventListener('keydown', onDragKey, true)
    }

    function endDrop () {
        document.removeEventListener('pointermove', onDragMove, true)
        document.removeEventListener('keydown', onDragKey, true)
        // Tabby has already handled the drop: a pane let go over the tab bar now has a tab of its own.
        const tab = draggedPane ? top(draggedPane.pane) : draggedTab
        const moved = !draggedPane || tab !== draggedPane.from
        const i = dropIntent
        draggedTab = draggedPane = dropIntent = null
        showDropMark()
        // Cancelled: no drop of ours, and Tabby's are blocked (cancelledDrop), so the tab stays where it was.
        if (dragCancel?.live) {
            dragCancel = { tab: dragCancel.tab, until: Date.now() + 3000 }
        } else if (tab && i && moved && app.tabs.includes(tab) && i.tab !== tab) {
            applyDrop(tab, i)
        }
    }

    /**
     * Files `newTab` (a tab, or a pane of one) with `fromTab`: in its group and parent, right after it; at the top level
     * when it has none. For a tab another plugin opens from one (a Files tab from a shell). Returns false when either is gone, or both are one tab.
     */
    function placeAfter (newTab, fromTab) {
        const tab = newTab && top(newTab)
        const from = fromTab && top(fromTab)
        if (!tab || !from || tab === from || !app.tabs.includes(tab) || !app.tabs.includes(from)) {
            return false
        }
        const group = from.__tg ?? null
        // Pins first: Tabby clamps a move to the pinned or unpinned part of the list, and normalize puts a group's own
        // pinned tabs first. In a group the tab takes the group's Tabby pin and fromTab's pin inside it; at the top level
        // it keeps its own (a Tabby pin would stop Ctrl+W closing it), so after a pinned fromTab it lands after the pins.
        setMembership(tab, group)
        if (group) {
            tab.pinned = !!chainOf(group)[0]?.pinned
            from.__tgPinned ? tab.__tgPinned = true : delete tab.__tgPinned
            chainOf(group).forEach(g => { g.collapsed = false })
        }
        placeTab(tab, from, true)
        changed()
        return true
    }

    function placeTab (tab, anchor, after) {
        if (!anchor || anchor === tab) {
            return
        }
        app.moveTabToIndex(tab, dropIndex(app.tabs.indexOf(tab), app.tabs.indexOf(anchor), after))
    }

    /** Where an empty group shows (render), as [anchor tab, after]; `skip` are the moving tabs. */
    function whereEmptyShows (g, skip) {
        const next = app.tabs.slice(emptyIndex(app.tabs, groups, g, skip)).find(t => !skip.includes(t))
        return next ? [next, false] : [app.tabs.filter(t => !skip.includes(t)).at(-1), true]
    }

    /** A drop on the free space below the rows lands where its mark shows: above the empty groups at the list's end. */
    function endsAbove (skip, unit) {
        ;[...groups.values()].filter(e => e !== unit && panelOf(groups, e) === null && !subtree(e.id).length && whereEmptyShows(e, skip)[1])
            .forEach(e => follow(marks, e, unit))
    }

    function applyDrop (tab, i) {
        const join = name => {
            setMembership(tab, name)
            chainOf(name).forEach(g => { g.collapsed = false })
        }
        const place = (anchor, after) => placeTab(tab, anchor, after)
        const others = g => subtree(g.id).filter(t => t !== tab)
        if (i.where === 'onto') {
            // Two tabs make a new group: at the top level, or as a subgroup where the target tab is.
            const g = createGroup(newGroupName(), i.tab.__tg ?? null)
            // A new top-level group made on a pinned tab stays pinned, so the tab keeps its pin.
            g.pinned = !g.parent && !!i.tab.pinned
            i.tab.__tg = g.id
            join(g.id)
            place(i.tab, true)
        } else if (i.tab) {
            join(i.tab.__tg ?? null)
            place(i.tab, i.where !== 'before')
        } else if (i.where === 'end') {
            // Before the join, or the tab's own group, emptied by it, would count as one at the end.
            endsAbove([tab], tab)
            join(null)
            place(app.tabs.at(-1), true)
        } else if (i.where === 'first' || i.where === 'above') {
            join(i.where === 'first' ? i.group.id : i.group.parent)
            const first = others(i.group)[0]
            first ? place(first, false) : place(...whereEmptyShows(i.group, [tab]))
            // Above an empty group: it now follows this tab.
            if (!first && i.where === 'above') {
                follow(marks, i.group, tab)
            }
        } else {
            join(i.where === 'last' ? i.group.id : i.group.parent)
            const last = others(i.group).at(-1)
            last ? place(last, true) : place(...whereEmptyShows(i.group, [tab]))
        }
        changed()
    }

    // A group header drags with the pointer (Tabby's drag list knows only tabs) and drops on the same marks as a tab.
    const ghost = Object.assign(document.createElement('div'), { className: 'tg-drag-ghost' })
    function startGroupDrag (g, h, e) {
        if (e.button !== 0 || editing || !document.querySelector('.tabs-on-left, .tabs-on-right')) {
            return
        }
        const [x0, y0] = [e.clientX, e.clientY]
        const move = ev => {
            if (!draggedGroup) {
                if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) {
                    return
                }
                draggedGroup = g
                dropIntent = null
                dragCancel = null
                hideTip()
                h.classList.add('tg-dragging')
                ghost.textContent = g.name
                document.body.appendChild(ghost)
            }
            Object.assign(ghost.style, { left: ev.clientX + 12 + 'px', top: ev.clientY + 8 + 'px' })
            onDragMove(ev)
        }
        const up = () => {
            document.removeEventListener('pointermove', move, true)
            document.removeEventListener('pointerup', up, true)
            document.removeEventListener('keydown', onDragKey, true)
            if (!draggedGroup) {
                return
            }
            // After Esc the intent stays empty (onDragMove sets none), so the group stays where it was.
            const i = dragCancel?.live ? null : dropIntent
            draggedGroup = dropIntent = dragCancel = null
            ghost.remove()
            h.classList.remove('tg-dragging')
            showDropMark()
            // The click that ends a drag must not also collapse the group. It fires before any timer.
            const swallow = ev => ev.stopPropagation()
            document.addEventListener('click', swallow, true)
            setTimeout(() => document.removeEventListener('click', swallow, true))
            if (i && groups.has(g.id)) {
                applyGroupDrop(g, i)
            }
        }
        document.addEventListener('pointermove', move, true)
        document.addEventListener('pointerup', up, true)
        document.addEventListener('keydown', onDragKey, true)
    }

    /**
     * A drag and drop without a pointer, for other front ends (tabby-remote's phone side bar). source: a tab or
     * { group }; target: a tab or { group }; where: 'before' | 'after' | 'onto' on a tab, 'above' | 'first' | 'last' |
     * 'below' on a group. Same rules as the side bar; returns false for a drop the side bar would not offer.
     */
    function drop (source, target, where) {
        const tabOf = x => x && x.group === undefined && app.tabs.includes(top(x)) ? top(x) : null
        const g = source?.group !== undefined ? groups.get(resolve(groups, source.group)) : null
        const tab = tabOf(source)
        const tg = target?.group !== undefined ? groups.get(resolve(groups, target.group)) : null
        const tt = tabOf(target)
        if ((!g && !tab) || (!tg && !tt)) {
            return false
        }
        if (tt) {
            if (tt === tab || !['before', 'after', 'onto'].includes(where) || (where === 'onto' && g) || (g && inGroup(tt, g.id))) {
                return false
            }
        } else if (!['above', 'first', 'last', 'below'].includes(where) || (g && chainOf(tg.id).includes(g))) {
            return false
        }
        const i = tt ? { tab: tt, where } : { group: tg, where }
        g ? applyGroupDrop(g, i) : applyDrop(tab, i)
        return true
    }

    function applyGroupDrop (g, i) {
        const ms = orderedSubtree(g)
        let parent, anchor, after
        if (i.tab) {
            [parent, anchor, after] = [i.tab.__tg ?? null, i.tab, i.where !== 'before']
        } else if (i.where === 'end') {
            [parent, anchor, after] = [null, app.tabs.filter(t => !ms.includes(t)).at(-1), true]
            endsAbove(ms, g)
        } else {
            const rest = subtree(i.group.id).filter(t => !ms.includes(t))
            const inside = i.where === 'first' || i.where === 'last'
            after = i.where === 'last' || i.where === 'below'
            parent = inside ? i.group.id : i.group.parent
            anchor = after ? rest.at(-1) : rest[0]
            if (!rest.length) {
                [anchor, after] = whereEmptyShows(i.group, ms)
                // Above an empty group: it now follows the dropped group.
                if (i.where === 'above') {
                    follow(marks, i.group, g)
                }
            }
        }
        if (!setParent(g.id, parent, false)) {
            return
        }
        chainOf(parent).forEach(a => { a.collapsed = false })
        // Pins first, because Tabby clamps a move to the pinned or unpinned part of the list.
        ms.forEach(t => { t.pinned = !!chainOf(t.__tg)[0]?.pinned })
        // Each move emits tabsChanged, and a regather between two moves would pull the tabs back to where the group was.
        normalizing = true
        try {
            ms.forEach((t, k) => placeTab(t, k ? ms[k - 1] : anchor, k ? true : after))
        } finally {
            normalizing = false
        }
        changed()
    }

    /** Returns Tabby's tab bar to stock: no group rows, icons, folder lines, classes or inline paint. */
    function clearDecorations () {
        document.querySelectorAll('.tg-header, .tg-foot, .tg-empty, .tg-icon, .tg-cwd, .tg-tab-pin, .tg-presence').forEach(e => e.remove())
        document.querySelectorAll('.tabs.tg-light').forEach(e => e.classList.remove('tg-light'))
        document.querySelectorAll('.tabs > tab-header').forEach(e => {
            e.classList.remove('tg-hidden', 'tg-member', 'tg-last', 'tg-two-line')
            ;['background-color', 'box-shadow', '--tg-color', '--tg-level'].forEach(p => e.style.removeProperty(p))
        })
    }

    // Leaves tab.__tg on the tabs and hands the groups to the next install, so a reload neither loses them
    // nor lets Tabby's next save write tabs without their groups.
    function dispose () {
        if (disposed) {
            return
        }
        disposed = true
        cancelTabRename?.()
        window.__tabbyGroupsState = { groups: [...groups.values()] }
        // A resume still waiting for its tab goes back on the pane, so the next copy's watch() picks it up.
        pendingResumes.forEach(p => { p.__tgResume = p.__tgInfo?.resume })
        app.tabs.flatMap(t => t.getAllTabs?.() ?? [t]).forEach(unwatch)
        clearDecorations()
        draggedTab = draggedGroup = dropIntent = null
        ghost.remove()
        endDrop()
        const list = document.querySelector('.tab-bar .tabs')
        if (list) {
            setLiveReorder(list, true)
        }
        closeMenu()
        toolbar.remove()
        handle.remove()
        window.removeEventListener('resize', onResize)
        window.removeEventListener('tabby-remote:presence', queueRender)
        window.removeEventListener('focus', onWindowFocus)
        document.removeEventListener('dblclick', onTabDblClick, true)
        document.removeEventListener('dblclick', onBarDblClick, true)
        document.removeEventListener('contextmenu', onBarContextMenu, true)
        closePicker?.()
        tooltip.dispose()
        subs.forEach(s => s.unsubscribe())
        observer.disconnect()
        agentState.dispose()
        window.removeEventListener('tabby-groups:agent', onAgentEvent)
        inbox.dispose()
        userIconsWatch?.close()
        buttonBar.dispose()
        topObserver.disconnect()
        topButtonsEl.remove()
        document.querySelectorAll('.tg-moved').forEach(e => e.classList.remove('tg-moved'))
        windowsApi.dispose()
        style.remove()
        const i = menuProviders.indexOf(menuProvider)
        if (i >= 0) {
            menuProviders.splice(i, 1)
        }
        recovery.getFullRecoveryToken = origGetToken
        recovery.recoverTab = origRecover
        app.renameTab = origRename
        app.duplicateTab = origDuplicate
        app.toggleTabPinned = origTogglePin
        app.removeTab = origRemoveTab
        if (origBuildMenu) {
            TabHeader.prototype.buildContextMenu = origBuildMenu
        }
        document.removeEventListener('keydown', onTabMenuKey, true)
        if (origTabDropped) {
            SplitTab.prototype.onTabDropped = origTabDropped
        }
        if (appRoot) {
            delete appRoot.onTabsReordered
        }
        if (origRemovePane && origUpdateTitle) {
            SplitTab.prototype.removeTab = origRemovePane
            SplitTab.prototype.updateTitle = origUpdateTitle
        }
        delete window.__tabbyGroups
    }

    /**
     * Opens a local shell tab and files it in one call, for scripts driving Tabby over CDP.
     * @example await __tabbyGroups.open({ title: 'api', cwd: 'C:\\projects\\api', run: 'claude', group: 'api', parent: 'backend' })
     * @returns the new tab's 1-based number (plain JSON for returnByValue)
     */
    async function open ({ title, profile, command, args, cwd, run, group, parent, color } = {}) {
        if (profile) {
            // A saved profile, in `cwd` when given (a pinned picker entry).
            profile = cwd ? { ...profile, options: { ...profile.options, cwd } } : profile
        } else if (!command) {
            ;({ command, args } = await defaultShell() ?? (IS_WIN ? { command: 'powershell.exe', args: ['-NoLogo'] } : { command: process.env.SHELL || '/bin/zsh', args: [] }))
        }
        // First, so a name that fits several groups throws before a tab opens.
        const g = group ? groupFor(group, { ...parent !== undefined && { parent }, ...color !== undefined && { color } }) : null
        const inner = await injector.get(core.ProfilesService).openNewTabForProfile(profile ?? {
            type: 'local', name: title ?? command, options: { command, args, cwd, env: {} },
        })
        const tab = app.getParentTab(inner) ?? inner
        if (title) {
            tab.setCustomTitle(title)
        }
        if (g && groups.get(g.id) === g) {
            addTab(tab, g.id)
        }
        if (run) {
            await shellReady(inner)
            inner.sendInput(run + '\r')
            startupChecks(inner)
        }
        return app.tabs.indexOf(tab) + 1
    }

    /**
     * Resolves once the shell exists and its startup output (a profile, the first prompt) has been quiet for 700 ms;
     * 15 s at most after the shell starts. A restored background tab starts its shell only when first shown, so there is
     * no limit on that wait.
     */
    function shellReady (term) {
        return new Promise(resolve => {
            let deadline = null
            let quiet = null
            let sub = null
            const arm = () => {
                clearTimeout(quiet)
                quiet = setTimeout(done, 700)
            }
            function done () {
                clearTimeout(deadline)
                clearTimeout(quiet)
                sub?.unsubscribe()
                resolve()
            }
            const listen = () => {
                deadline = setTimeout(done, 15000)
                sub = term.output$.subscribe(arm)
                arm()
            }
            if (term.session) {
                listen()
            } else {
                const first = term.sessionChanged$.subscribe(() => {
                    first.unsubscribe()
                    listen()
                })
            }
        })
    }

    /** The user's icons from tabby-groups.json (tab kind "user:<name>"), for other front ends such as a phone side bar. */
    const icons = () => userIcons.map(({ title, process, ...icon }) => icon)
    /** The last `lines` non-empty lines of the one pane `name` names (as say: a title, else a part of one, or "#<n>"), as plain text; null when none or several match, or it has no buffer yet. Read-only. */
    function tabText (name, lines = 30) {
        const { pane } = onePane(name)
        // A lazily restored pane has an empty frontend but no session until it is first shown.
        const buffer = pane?.session && pane.frontend?.xterm?.buffer?.active
        if (!buffer) return null
        const out = []
        for (let y = buffer.length - 1; y >= 0 && out.length < lines; y--) {
            const text = buffer.getLine(y)?.translateToString(true)
            if (text?.trim()) out.unshift(text)
        }
        return out.join('\n')
    }
    /**
     * Sends `text` to the one pane whose title is `name` (else the one that contains it), without focusing it: a Claude
     * with a known session through its inbox (inbox.js), any other pane typed in with Enter. `caller` is the pid of the asking process: a pane with that pid under its shell is refused.
     * `claudeOnly`: refuse a pane that is not running Claude Code (a message from another computer, see tabby-remote).
     * Returns { ok: true, tab, via: 'inbox' | 'typed' } or { ok: false, why }.
     */
    async function say (name, text, { caller, claudeOnly } = {}) {
        // claudeOnly narrows before matching: a shell tab with the same title must not make a Claude tab ambiguous.
        const { pane, why } = onePane(name, { only: claudeOnly ? p => p.__tgInfo?.kind === 'claude' : undefined })
        if (!pane) {
            return { ok: false, why }
        }
        if (claudeOnly && pane.__tgInfo?.kind !== 'claude') {
            return { ok: false, why: `"${titleOf(pane)}" is not a Claude tab` }
        }
        if (!pane.session) {
            return { ok: false, why: `"${titleOf(pane)}" was not opened since Tabby started; open it first` }
        }
        if (caller) {
            const procs = await processList(await pane.session.pty?.getPID())
            if (!procs.length) {
                return { ok: false, why: `cannot read the processes of "${titleOf(pane)}", so cannot rule out the caller's own tab` }
            }
            if (procs.some(p => p.pid === caller)) {
                return { ok: false, why: `"${titleOf(pane)}" is the caller's own tab` }
            }
        }
        // A Claude with a known session takes it through its inbox, never typed over the user (inbox.js).
        const via = pane.__tgInfo?.kind === 'claude' ? await inbox.deliver(pane, text) : null
        if (!via) {
            await inbox.typeIn(pane, text)
        }
        return { ok: true, tab: titleOf(pane), via: via ?? 'typed' }
    }
    /** The title of the pane whose shell runs process `pid` (the caller's own tab), or null. */
    async function tabOf (pid) {
        for (const pane of app.tabs.flatMap(t => t.getAllTabs?.() ?? [t])) {
            if (pane.session && (await processList(await pane.session.pty?.getPID())).some(p => p.pid === pid)) {
                return titleOf(pane)
            }
        }
        return null
    }
    /**
     * The one pane whose title is `name` (else the one that contains it), or { why }. `#<n>` is the tab numbered n in the
     * side bar, for when titles tie. `whole`: the one tab, with its panes as one. `only`: the panes that may match.
     */
    function onePane (name, { whole, only } = {}) {
        const clean = s => String(s ?? '').replace(/^[^\p{L}\p{N}]+/u, '').trim().toLowerCase()
        const want = clean(name)
        let panes = app.tabs.flatMap(t => t.getAllTabs?.() ?? [t])
        // A split tab's own title can differ from every pane's (a custom title, or an app's title in the pane).
        if (whole) {
            panes.push(...app.tabs.filter(t => !panes.includes(t)))
        }
        if (only) {
            panes = panes.filter(only)
        }
        const num = /^#(\d+)$/.exec(String(name).trim())
        const exact = num ? panes.filter(p => app.tabs.indexOf(top(p)) + 1 === +num[1]) : panes.filter(p => clean(titleOf(p)) === want)
        let found = exact.length || num ? exact : want ? panes.filter(p => clean(titleOf(p)).includes(want)) : []
        if (whole) {
            found = [...new Set(found.map(top))]
        }
        const label = p => `#${app.tabs.indexOf(top(p)) + 1} ${titleOf(p)}`
        return found.length === 1 ? { pane: found[0] }
            : { why: found.length ? `${found.length} tabs match "${name}": ${found.map(label).join(', ')}; pick one by number, e.g. "#${app.tabs.indexOf(top(found[0])) + 1}"` : `no tab matches "${name}"` }
    }
    /**
     * Moves the tab `name` (a tab object, or a title as in say) to window `to`: its number in windows(), or 'new'. A split
     * tab moves whole. Returns { ok, window } or { ok: false, why }.
     */
    function move (name, to) {
        const { pane, why } = typeof name === 'string' ? onePane(name, { whole: true }) : { pane: name }
        return pane ? windowsApi.move(pane, to) : { ok: false, why }
    }
    // A group is named by its id, a name only one group has, a path ("tooling/maintainers") or { name, parent }.
    const byRef = f => (ref, ...rest) => {
        const id = resolve(groups, ref)
        return id ? f(id, ...rest) : false
    }
    const api = {
        addTab: (tab, group, opts) => addTab(tab, groupFor(group, opts).id),
        setCollapsed: byRef(setCollapsed), setColor: byRef(setColor), setPinned: byRef(setPinned), rename: byRef(rename), ungroup: byRef(ungroup),
        deleteGroup: byRef(deleteGroup), closeGroup: byRef(closeGroup),
        setParent: byRef((id, parent) => {
            const pid = parent == null || parent === '' ? null : resolve(groups, parent)
            return pid === null && parent != null && parent !== '' ? false : setParent(id, pid)
        }),
    }
    window.__tabbyGroups = { version: 1, open, ...api, removeTab, setTabPinned, list, drop, markSeen, icons, buttons: buttonBar.list, reload, dispose, tabText, say,
        // For tabby-remote's talk between computers; its presence also says this copy refuses non-Claude tabs there.
        sayToClaude: (name, text) => say(name, text, { claudeOnly: true }), tabOf,
        placeAfter, move, windows: () => windowsApi.windows().map(({ n, me }) => ({ n, me })),
        renderSettings: host => userIconsFile && renderSettings(host, userIconsFile, injector.get(core.ProfilesService).getProfiles()) }
    // A reload started from this plugin's result card ends the old copy; this copy tells how it went.
    if (window.__tgAfterReload) {
        const result = window.__tgAfterReload
        delete window.__tgAfterReload
        setTimeout(() => buttonBar.reportReload(result), 500)
    }
    return window.__tabbyGroups
}

class TabbyGroupsModule {
    constructor (injector) {
        install(injector)
    }
}
TabbyGroupsModule.ctorParameters = () => [{ type: Injector }]

// Settings > Tab groups. Tabby has no template compiler at run time, so the component is declared by hand with an
// empty template, and the page is plain DOM from the live plugin copy (so a reload brings the new page with it).
class GroupsSettingsComponent {
    constructor (ref) {
        this.host = ref.nativeElement
    }

    ngOnInit () {
        window.__tabbyGroups?.renderSettings(this.host)
    }
}
GroupsSettingsComponent.ɵfac = () => new GroupsSettingsComponent(ɵɵdirectiveInject(ElementRef))
GroupsSettingsComponent.ɵcmp = ɵɵdefineComponent({ type: GroupsSettingsComponent, selectors: [['tabby-groups-settings']], decls: 0, vars: 0, template: () => { }, encapsulation: 2 })

const settingsApi = require('tabby-settings')
class GroupsSettingsTabProvider extends settingsApi.SettingsTabProvider {
    constructor () {
        super()
        this.id = 'tabby-groups'
        this.icon = 'layer-group'
        this.title = 'Tab groups'
    }

    getComponentType () {
        return GroupsSettingsComponent
    }
}

module.exports = NgModule({
    providers: [{ provide: settingsApi.SettingsTabProvider, useClass: GroupsSettingsTabProvider, multi: true }],
})(TabbyGroupsModule)
module.exports.default = module.exports
module.exports.install = install
