const fs = require('fs')
const { pins } = require('./picker')

const h = (tag, props = {}, ...children) => {
    const el = Object.assign(document.createElement(tag), props)
    el.append(...children)
    return el
}
// Tabby's own row: title and description on the left, the switch in the right column.
const line = (title, description, control) => h('div', { className: 'form-line' },
    h('div', { className: 'header' }, h('div', { className: 'title', textContent: title }), h('div', { className: 'description', textContent: description })),
    control)
const toggle = (on, change) => h('div', { className: 'form-check form-switch ms-auto mb-0' },
    h('input', { className: 'form-check-input', type: 'checkbox', role: 'switch', checked: on, onchange: e => change(e.target.checked, e.target) }))

function readSettings (file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (e) {
        return e.code === 'ENOENT' ? {} : null
    }
}

/** A pin the switch owns: the profile alone. An entry with a label, an icon, a folder or a command is the file's to edit. */
const barePin = (e, profile) => pins(e, profile) && !e.label && !e.icon && !e.cwd && !e.command
const pickerOf = settings => Array.isArray(settings?.picker) ? settings.picker : []

/** The settings with a profile pinned in the picker by its id (stable through a rename, unique) or its bare pins removed. */
function setPin (settings, profile, on) {
    const picker = pickerOf(settings).filter(e => !barePin(e, profile))
    return { ...settings, picker: on ? [...picker, { profile: profile.id }] : picker }
}

/**
 * Settings > Tab groups. The switches are stored in tabby-groups.json, which the plugin watches, so the file stays the
 * one place for the plugin's settings. A file that does not parse is never overwritten. `profiles`: Tabby's profiles (a promise).
 */
function renderSettings (host, file, profiles) {
    const settings = readSettings(file)
    const error = h('div', { className: 'text-danger mt-2' })
    // Reads the file again, so an edit made since the page opened is kept.
    const write = (change, input, on) => {
        const current = readSettings(file)
        if (!current) {
            input.checked = !on
            error.textContent = `${file} is not valid JSON; fix it first.`
            return
        }
        fs.writeFileSync(file, JSON.stringify(change(current), null, 2) + '\n')
        error.textContent = ''
    }
    const pinList = h('div')
    host.replaceChildren(
        h('h3', { className: 'mb-3', textContent: 'Claude tabs' }),
        line('Resume Claude tabs after a restart',
            'Restored Claude tabs start again by themselves, two at a time, without a click. Off: a tab resumes when you first open it.',
            toggle(settings?.autoResume === true, (on, input) => write(s => ({ ...s, autoResume: on }), input, on))),
        h('h3', { className: 'mt-4 mb-3', textContent: 'New-tab picker' }),
        h('div', { className: 'text-muted mb-2', textContent: 'A right-click on free side-bar space shows the default profile, then the profiles pinned here and the other "picker" entries in tabby-groups.json.' }),
        pinList,
        error)
    profiles?.then(list => pinList.replaceChildren(...list.filter(p => !p.isTemplate).map(p =>
        line(p.name, '', toggle(pickerOf(settings).some(e => barePin(e, p)), (on, input) => write(s => setPin(s, p, on), input, on))))))
}

module.exports = { renderSettings, setPin }
