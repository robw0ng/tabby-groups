// Where groups sit among their siblings, with no Tabby: `tabs` is app.tabs (each with its group id in __tg) and
// `groups` the plugin's Map of groups by id. A panel is the inside of a group (the top level for null). Its units are
// its direct tabs and its subgroups that have tabs, in list order. An empty group has no tab to sit on, so it keeps a
// slot: the number of units before it in its panel (none, or past the last unit, puts it at the panel's end).

/** The group and its ancestors, root first. */
function chainIn (groups, id) {
    const chain = []
    for (let g = groups.get(id); g; g = groups.get(g.parent)) {
        chain.unshift(g)
    }
    return chain
}

/** A group's panel: its parent, or the top level when the parent is not there (yet). */
const panelOf = (groups, g) => groups.has(g.parent) ? g.parent : null

/** The units of a panel in list order, each with its first tab; `skip` tabs are left out. */
function unitsOf (tabs, groups, panel, skip = []) {
    const p = groups.get(panel)
    const out = []
    for (const t of tabs) {
        const chain = chainIn(groups, t.__tg)
        const at = p ? chain.indexOf(p) : -1
        if (skip.includes(t) || (p && at < 0)) {
            continue
        }
        const unit = chain[at + 1] ?? t
        if (!out.some(u => u.unit === unit)) {
            out.push({ unit, head: t })
        }
    }
    return out
}

/** The list index where a tab of an empty group goes, which is where render shows the group. */
function emptyIndex (tabs, groups, g, skip = []) {
    const panel = panelOf(groups, g)
    // The slot counts the moving tabs too: the group shows before the first unit at or after it that does not move.
    const units = unitsOf(tabs, groups, panel)
    for (const { unit, head } of units.slice(g.slot ?? Infinity)) {
        const t = tabs.includes(unit) ? unit : tabs.slice(tabs.indexOf(head)).find(x => !skip.includes(x) && chainIn(groups, x.__tg).includes(unit))
        if (t && !skip.includes(t)) {
            return tabs.indexOf(t)
        }
    }
    const last = tabs.filter(t => !skip.includes(t) && (panel === null || chainIn(groups, t.__tg).some(a => a.id === panel))).at(-1)
    if (last) {
        return tabs.indexOf(last) + 1
    }
    return panel === null ? tabs.length : emptyIndex(tabs, groups, groups.get(panel), skip)
}

/** Every group in the order the side bar shows them: parents before their subgroups, empty groups at their slots. */
function groupOrder (tabs, groups, panel = null) {
    const units = unitsOf(tabs, groups, panel).map(u => u.unit)
    const empties = [...groups.values()].filter(g => panelOf(groups, g) === panel && !units.includes(g))
    const out = []
    const emit = g => out.push(g, ...groupOrder(tabs, groups, g.id))
    const upTo = k => empties.filter(g => !out.includes(g) && (g.slot ?? Infinity) <= k).forEach(emit)
    units.forEach((u, k) => {
        upTo(k)
        if (!tabs.includes(u)) {
            emit(u)
        }
    })
    upTo(Infinity)
    return out
}

/**
 * The slot that agrees with the most units on which side of the group they were (`m.before`, `m.after`) on the last
 * call; units not seen then do not count. On a tie the earliest wins, so a tab added after the group stays after it.
 */
function bestSlot (units, m) {
    let best = 0
    let score = -1
    for (let s = 0; s <= units.length; s++) {
        const n = units.filter((u, i) => i < s ? m.before.has(u) : m.after.has(u)).length
        if (n > score) {
            [best, score] = [s, n]
        }
    }
    return best
}

/**
 * Updates the slots after a change. A group with tabs takes its place now. An empty group keeps the side of each unit
 * it had on the last call, so a tab closed, added or moved elsewhere in its panel leaves it in place. `marks` (a Map)
 * holds those sides between calls; a group with no slot stays at its panel's end.
 */
function trackSlots (tabs, groups, marks) {
    for (const panel of [null, ...groups.keys()]) {
        const units = unitsOf(tabs, groups, panel).map(u => u.unit)
        for (const g of groups.values()) {
            const k = units.indexOf(g)
            if (panelOf(groups, g) !== panel || (k < 0 && g.slot == null)) {
                continue
            }
            if (k >= 0) {
                g.slot = k
            } else if (marks.has(g)) {
                g.slot = bestSlot(units, marks.get(g))
            }
            // A slot past the units (while a restart brings the tabs back) waits as a number until its units are there.
            if (g.slot <= units.length) {
                marks.set(g, { before: new Set(units.slice(0, g.slot)), after: new Set(units.slice(g.slot + (k >= 0 ? 1 : 0))) })
            }
        }
    }
}

/** Puts `unit` on the before side of an empty group, which then shows after it (a drop above the group). */
function follow (marks, g, unit) {
    const m = marks.get(g) ?? { before: new Set(), after: new Set() }
    m.after.delete(unit)
    m.before.add(unit)
    marks.set(g, m)
    // trackSlots places only a group with a slot; the marks then give the real one.
    g.slot ??= 0
}

/**
 * The tab to show when the active tab `closed` closes (`tabs` still holds it; `mru`: Tabby's most-recent-first list).
 * 'recent': the most recently used tab of its own group, else the most recently used tab; 'previous': the tab above it.
 * Null for 'next', Tabby's own choice (the tab below it, else above), or when no tab is left.
 */
function focusAfterClose (tabs, mru, closed, mode = 'recent') {
    const i = tabs.indexOf(closed)
    const near = tabs[i - 1] ?? tabs[i + 1] ?? null
    if (mode === 'next' || !near) {
        return null
    }
    if (mode === 'previous') {
        return near
    }
    const recent = mru.filter(t => t !== closed && tabs.includes(t))
    return recent.find(t => closed.__tg && t.__tg === closed.__tg) ?? recent[0] ?? null
}

/**
 * The list index a tab at `from` moves to, to land just before (or, with `after`, just after) the tab at `anchor`.
 * The index counts the list without the tab, as a move does: a drop beside its own place gives `from` back.
 */
function dropIndex (from, anchor, after) {
    const target = anchor + (after ? 1 : 0)
    return from < target ? target - 1 : target
}

module.exports = { chainIn, panelOf, unitsOf, emptyIndex, groupOrder, trackSlots, follow, focusAfterClose, dropIndex }
