const { NgModule, Injector } = require('@angular/core')
const core = require('tabby-core')
const ICONS = require('./icons')

const COLORS = [
    { name: 'Red', value: '#f2756a' },
    { name: 'Green', value: '#8ef58a' },
    { name: 'Yellow', value: '#fdffad' },
    { name: 'Blue', value: '#86b7f7' },
    { name: 'Magenta', value: '#f48cf6' },
    { name: 'Lavender', value: '#d7cff9' },
]
const NO_COLOR = '#9aa0a6'
// Panel tints are kept dark enough that all side-bar text meets WCAG AA (4.5:1) on every palette colour, yellow included.
// A tint is a solid mix with the sidebar background, never with its parent, so hues never blend. A subgroup in its
// parent's colour is also mixed with black by --tg-shade-step, once per such level in a row, so it never melts into the
// parent; a subgroup in another colour keeps its normal look.
const tintPct = depth => Math.max(20 - depth * 3, 11)
const shaded = (fill, depth) => depth ? `color-mix(in srgb, ${fill}, #000 calc(var(--tg-shade-step) * ${depth}))` : fill
const ACTIVE_TINT_ADD = 6

// A top-level group is one tinted panel: its header, subgroup rows and member tab-headers, all Tabby's own siblings.
const CSS = `
.tabs { --tg-bg: var(--theme-bg-more-2, #0d0d0d); --tg-shade-step: 36%; }
/* A light theme: lighter shading steps and dark text, so every level stays readable. The doubled .tg-light outweighs
   the dark-theme rules further down, which have the same selectors otherwise. */
.tabs.tg-light { --tg-shade-step: 14%; }
.tabs.tg-light.tg-light .tg-name { color: #161616; }
.tabs.tg-light.tg-light .tg-count, .tabs.tg-light.tg-light .tg-arrow, .tabs.tg-light.tg-light .tg-pin, .tabs.tg-light.tg-light .tg-add,
.tabs.tg-light.tg-light .tg-more, .tabs.tg-light.tg-light .tg-tab-pin { color: #333333; }
.tabs.tg-light.tg-light .tg-roll { color: #1f5fbf; }
.tabs.tg-light.tg-light .tg-roll-ask { color: #8a5300; }
.tabs.tg-light.tg-light > tab-header .tg-cwd { color: #262626; }
.tabs-on-left .tabs.tg-light.tg-light > tab-header > .name, .tabs-on-right .tabs.tg-light.tg-light > tab-header > .name { color: #161616 !important; }
.tabs-on-left .tabs.tg-light.tg-light > tab-header > .index, .tabs-on-right .tabs.tg-light.tg-light > tab-header > .index { color: #222222 !important; opacity: 1 !important; }
.tabs-on-left .tabs.tg-light.tg-light > tab-header > .pin-indicator, .tabs-on-right .tabs.tg-light.tg-light > tab-header > .pin-indicator { color: #222222 !important; }
.tabs > .tg-hidden { display: none !important; }
.tabs > tab-header.tg-member { background-color: color-mix(in srgb, var(--tg-color) 20%, var(--tg-bg)) !important; }
.tabs > tab-header.tg-member.active { background-color: color-mix(in srgb, var(--tg-color) 26%, var(--tg-bg)) !important; }
/* The last row holds the panel's bottom gap as padding; the active colour stops above it, as it does above a subgroup's footer. */
.tabs > tab-header.tg-member.tg-last.active { background: linear-gradient(color-mix(in srgb, var(--tg-color) 26%, var(--tg-bg)), color-mix(in srgb, var(--tg-color) 26%, var(--tg-bg))) top / 100% calc(100% - var(--tg-gap)) no-repeat, color-mix(in srgb, var(--tg-color) 20%, var(--tg-bg)) !important; }
.tabs > tab-header.tg-member .colorbar { display: none; }
/* Tabby's activity line (new output in a background tab) spans the whole row; inside a panel it keeps clear of the edges. */
.tabs > tab-header.tg-member .activity-indicator { left: 10px !important; right: 10px !important; width: auto !important; border-radius: 1px; }
.tg-header {
    display: flex; gap: 8px; flex: none; cursor: pointer; user-select: none;
    background-color: color-mix(in srgb, var(--tg-color) 20%, var(--tg-bg));
}
/* The chevron and the + match tabby-remote's phone side bar. */
.tg-arrow { display: flex; color: #d0d0d0; }
.tg-arrow svg { transition: transform .15s; }
.tg-arrow.tg-open svg { transform: rotate(90deg); }
.tg-add {
    margin-left: auto; align-self: center; flex: none; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 6px;
    background: transparent; color: #d0d0d0; font-size: 18px; line-height: 22px; text-align: center; cursor: pointer;
}
.tg-add:hover { background: rgba(255, 255, 255, .08); }
.tg-pin + .tg-add { margin-left: 4px; }
/* Devices viewing a tab through tabby-remote; the same badge as its phone side bar. */
.tg-presence { display: flex; align-items: center; gap: 4px; margin-left: 4px; flex: none; align-self: center; transition: margin-right .25s; }
/* Tabby's hover buttons float over the row's right end: the badges step left of them, and the title gives way. */
.tabs > tab-header:hover > .tg-presence { margin-right: var(--tg-btns, 52px); }
.tg-badge {
    position: relative; width: 16px; height: 16px; border-radius: 50%; background: var(--tg-badge);
    color: #111; font-size: 10px; font-weight: 700; line-height: 16px; text-align: center;
}
.tg-badge.tg-away { opacity: .4; }
.tg-badge.tg-typing::after {
    content: ''; position: absolute; inset: 0; border-radius: 50%; box-shadow: 0 0 0 2px var(--tg-badge);
    animation: tg-pulse 1.2s ease-in-out infinite alternate;
}
@keyframes tg-pulse { from { opacity: .35; } to { opacity: 1; } }
.tg-more { font-size: 11px; color: #d0d0d0; }
.tg-text { display: flex; min-width: 0; }
.tg-name { font-weight: 600; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; outline: none; }
.tg-name[contenteditable="true"] { cursor: text; background: color-mix(in srgb, #000 45%, var(--tg-bg, #0d0d0d)); border-radius: 3px; padding: 0 3px; text-overflow: clip; }
.tg-tab-rename {
    position: absolute; z-index: 5; height: 23px; padding: 0 4px; border-radius: 4px; outline: none;
    border: 1px solid rgba(255,255,255,.25); background: color-mix(in srgb, #000 45%, var(--tg-bg, #0d0d0d)); color: inherit; font: inherit;
}
.tg-count { font-size: 11px; color: #d8d8d8; white-space: nowrap; }
.tg-sub .tg-text { flex-direction: row; align-items: baseline; gap: 6px; }
.tg-sub .tg-name { font-weight: 500; }
.tg-inner {
    display: flex; gap: 8px; align-items: center; flex: 1; min-width: 0;
    background: color-mix(in srgb, color-mix(in srgb, var(--tg-own) var(--tg-own-pct), var(--tg-bg)), #000 calc(var(--tg-shade-step) * var(--tg-own-depth, 0)));
}
.tg-foot { flex: none; background-color: color-mix(in srgb, var(--tg-color) 20%, var(--tg-bg)); }
.tg-foot-inner { background: color-mix(in srgb, color-mix(in srgb, var(--tg-own) var(--tg-own-pct), var(--tg-bg)), #000 calc(var(--tg-shade-step) * var(--tg-own-depth, 0))); }

/* One gap (--tg-gap) on every side of a panel. A panel right after another one drops its leading gap. */
.tabs-on-left .tabs, .tabs-on-right .tabs { --tg-gap: 6px; }
/* Tabby fixes the list at the full sidebar width, so a scrollbar would cover the right edge of each panel. */
.tabs-on-left .tab-bar > .tabs.tabs, .tabs-on-right .tab-bar > .tabs.tabs { width: 100% !important; }
/*
 * Every row is inset by the same margin formula, gap × (1 + its level), so all panel edges land on the same pixels.
 * Parent panels show as side bands drawn by box-shadow from the row's own edges (see paintNesting).
 */
.tabs-on-left .tg-header, .tabs-on-right .tg-header,
.tabs-on-left .tg-foot, .tabs-on-right .tg-foot { margin: 0 calc(var(--tg-gap) * (1 + var(--tg-level, 0))); }
.tabs-on-left .tg-root, .tabs-on-right .tg-root {
    align-items: flex-start; margin-top: var(--tg-gap); padding: 10px 12px 6px; border-radius: 8px 8px 0 0;
}
.tabs-on-left .tg-root.tg-after-group, .tabs-on-right .tg-root.tg-after-group { margin-top: 0; }
.tabs-on-left .tg-root .tg-arrow, .tabs-on-right .tg-root .tg-arrow { padding-top: 3px; }
.tabs-on-left .tg-root .tg-text, .tabs-on-right .tg-root .tg-text { flex-direction: column; }
/* A subgroup row sits in its parent's panel; .tg-inner is the subgroup's own panel top, one gap further in. */
.tabs-on-left .tg-sub, .tabs-on-right .tg-sub { padding-top: var(--tg-gap); }
.tabs-on-left .tg-sub.tg-after-sub, .tabs-on-right .tg-sub.tg-after-sub { padding-top: 0; }
.tabs-on-left .tg-sub .tg-inner, .tabs-on-right .tg-sub .tg-inner { margin: 0 var(--tg-gap); padding: 8px 10px; border-radius: 8px 8px 0 0; }
.tabs-on-left .tg-sub.tg-shut, .tabs-on-right .tg-sub.tg-shut { padding-bottom: var(--tg-gap); }
.tabs-on-left .tg-sub.tg-shut .tg-inner, .tabs-on-right .tg-sub.tg-shut .tg-inner { border-radius: 8px; }
.tabs-on-left .tg-foot, .tabs-on-right .tg-foot { padding-bottom: var(--tg-gap); }
.tabs-on-left .tg-foot-inner, .tabs-on-right .tg-foot-inner { height: var(--tg-gap); margin: 0 var(--tg-gap); border-radius: 0 0 8px 8px; }
.tabs-on-left .tab-bar .tabs > tab-header.tg-member.tg-member, .tabs-on-right .tab-bar .tabs > tab-header.tg-member.tg-member {
    margin-left: calc(var(--tg-gap) * (1 + var(--tg-level, 0))); margin-right: calc(var(--tg-gap) * (1 + var(--tg-level, 0)));
    width: calc(100% - 2 * var(--tg-gap) * (1 + var(--tg-level, 0))) !important;
}
.tabs-on-left .tab-bar .tabs > .tg-last.tg-last, .tabs-on-right .tab-bar .tabs > .tg-last.tg-last { border-radius: 0 0 8px 8px; margin-bottom: var(--tg-gap); }
.tabs-on-left .tab-bar .tabs > .tg-root.tg-last, .tabs-on-right .tab-bar .tabs > .tg-root.tg-last { border-radius: 8px; }

/* Vertical sidebar as a grid: search + Tabby's left buttons share a sticky top row, then the tabs, then the rest. */
.tabs-on-left > .tab-bar, .tabs-on-right > .tab-bar {
    display: grid !important; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto auto 1fr auto; align-content: start;
}
.tabs-on-left > .tab-bar > *, .tabs-on-right > .tab-bar > * { grid-column: 1 / -1; }
.tabs-on-left > .tab-bar > .tg-toolbar, .tabs-on-right > .tab-bar > .tg-toolbar { grid-row: 1; grid-column: 1; }
.tabs-on-left > .tab-bar > .tabs + .btn-group, .tabs-on-right > .tab-bar > .tabs + .btn-group { grid-row: 1; grid-column: 2; }
.tabs-on-left > .tab-bar > .tg-toolbar, .tabs-on-right > .tab-bar > .tg-toolbar,
.tabs-on-left > .tab-bar > .tabs + .btn-group, .tabs-on-right > .tab-bar > .tabs + .btn-group {
    position: sticky; top: 0; z-index: 2; align-self: stretch; align-items: center;
}
/*
 * One solid strip behind the whole top row, reaching up through the window-button space, so scrolled tabs
 * never show around or above the search box and buttons. A grid item, so it is exactly the row's height.
 */
.tabs-on-left > .tab-bar::before, .tabs-on-right > .tab-bar::before {
    content: ''; grid-row: 1; grid-column: 1 / -1; position: sticky; top: calc(-1 * var(--tg-top-inset, 0px)); z-index: 1;
    margin-top: calc(-1 * var(--tg-top-inset, 0px)); background: var(--theme-bg-more-2, #0d0d0d);
}
.tabs-on-left > .tab-bar > .tabs, .tabs-on-right > .tab-bar > .tabs { grid-row: 2; }
.tabs-on-left > .tab-bar > .btn-space, .tabs-on-right > .tab-bar > .btn-space { grid-row: 3; }
/* The bottom buttons stay docked to the bottom edge while the tabs scroll. */
.tabs-on-left > .tab-bar > .btn-space + .btn-group, .tabs-on-right > .tab-bar > .btn-space + .btn-group {
    grid-row: 4; position: sticky; bottom: 0; z-index: 2; background: var(--theme-bg-more-2, #0d0d0d);
}
/* Tabby's .window is 100% tall under the title bar and only shrinks to its content's minimum, so with a long tab list it
 * ran 30px past the window's bottom edge and cut off the bottom buttons. */
app-root > .window:has(> .tabs-on-left, > .tabs-on-right) { min-height: 0; }
/*
 * Without a title bar, Windows draws the window buttons over the top 36px of a right-hand sidebar.
 * Sticky offsets count from below that padding, so only the background strip reaches up into it.
 */
.platform-win32 .tabs-on-right:not(.tabs-titlebar-enabled) > .tab-bar { --tg-top-inset: 36px; padding-top: 36px; }
/* macOS: the traffic lights sit top left, over Tabby's drag strip. The strip stays put while the tabs scroll. */
.tabs-on-left > .tab-bar:has(> .inset) { --tg-top-inset: 36px; padding-top: 36px; }
.tabs-on-left > .tab-bar > .inset { position: fixed; top: 0; left: 0; width: var(--side-tab-width, 200px); height: 36px; z-index: 3; }
.tabs-on-right:not(.tabs-titlebar-enabled) > .tab-bar > .tabs { padding-top: 0 !important; }
/*
 * With a title bar, the window moves by it, so the side bar's free space (Tabby's btn-space, a window drag region in the
 * thin frame) takes clicks instead: Windows would turn a double-click there into maximize. Without a title bar it stays
 * the only drag handle.
 */
.tabs-on-left.tabs-titlebar-enabled > .tab-bar > .btn-space, .tabs-on-right.tabs-titlebar-enabled > .tab-bar > .btn-space { -webkit-app-region: no-drag !important; }
.tg-toolbar { padding: 6px 0 6px 6px; }
.tg-search {
    width: 100%; height: 28px; padding: 0 10px; border-radius: 6px; outline: none;
    border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.06); color: inherit; font-size: 12px;
}
.tg-search:focus { border-color: rgba(255,255,255,.25); }
.tg-resize { position: fixed; z-index: 3; width: 6px; cursor: col-resize; }
.tg-resize:hover, .tg-resizing .tg-resize { background: rgba(255,255,255,.12); }
.tg-resizing, .tg-resizing * { cursor: col-resize !important; user-select: none !important; }

/* Session icon before the title, and the shell's folder as a second line in the side tab bar. */
/* Tabby gives the title a 10px margin only right after the number, so the icon brings its own 10px on each side. */
.tg-icon { flex: none; display: flex; align-self: center; width: 14px; height: 14px; margin: 0 10px; position: relative; }
.tg-icon > .tg-emoji { font-size: 12px; line-height: 14px; width: 14px; text-align: center; font-variant-emoji: emoji; }
/* A Claude tab at work turns a ring around its icon; one that finished while nobody looked gets a dot and a bold title. */
.tg-icon.tg-busy::after {
    content: ''; position: absolute; inset: -4px; border-radius: 50%; border: 2px solid transparent; border-top-color: #86b7f7;
    animation: tg-spin 1s linear infinite;
}
@keyframes tg-spin { to { transform: rotate(360deg); } }
.tg-icon.tg-needs::before {
    content: ''; position: absolute; top: -3px; right: -4px; width: 8px; height: 8px; border-radius: 50%; background: #86b7f7;
    box-shadow: 0 0 0 2px var(--tg-bg, #0d0d0d);
}
.tabs > tab-header.tg-needs-you > .name { font-weight: 700; }
.tabs > tab-header.tg-needs-you .tg-cwd { font-weight: normal; }
.tg-roll { color: #86b7f7; }
/* A Claude tab that waits on a question or a permission: an amber badge on the icon, above the "needs you" dot. */
.tg-icon.tg-ask::before {
    content: '?'; position: absolute; top: -5px; right: -6px; width: 12px; height: 12px; border-radius: 50%; background: #f5b54a;
    color: #111; font-size: 9px; font-weight: 800; line-height: 12px; text-align: center; box-shadow: 0 0 0 2px var(--tg-bg, #0d0d0d);
}
.tg-icon.tg-ask[data-ask="permission"]::before { content: '!'; }
.tabs > tab-header.tg-asking > .name { font-weight: 700; }
.tabs > tab-header.tg-asking .tg-cwd { font-weight: normal; }
.tg-roll-ask { color: #f5b54a; }
/* A Claude tab waiting on a background task: a green count at the icon's bottom-right. */
.tg-icon > .tg-bgtask {
    position: absolute; bottom: -5px; right: -7px; min-width: 12px; height: 12px; padding: 0 2px; border-radius: 6px;
    background: #8ef58a; color: #111; font-size: 8px; font-weight: 800; line-height: 12px; text-align: center;
    box-shadow: 0 0 0 2px var(--tg-bg, #0d0d0d);
}
.tg-roll-run { color: #8ef58a; }
.tabs.tg-light.tg-light .tg-roll-run { color: #1d6b2c; }
/* A Claude tab that compacts its context: a violet badge at the icon's bottom-left. */
.tg-icon > .tg-compact {
    position: absolute; bottom: -5px; left: -7px; width: 12px; height: 12px; border-radius: 50%;
    background: #d7cff9; color: #111; font-size: 7px; line-height: 12px; text-align: center;
    box-shadow: 0 0 0 2px var(--tg-bg, #0d0d0d);
}
.tg-roll-cmp { color: #d7cff9; }
/* The user's toolbar buttons (tabby-groups.json "buttons"), before Tabby's own right-hand buttons. */
.tg-buttons { display: flex; flex: none; }
.tg-buttons > .btn { height: 38px; }
.tg-button { display: flex; align-items: center; justify-content: center; gap: 6px; }
.tg-button > svg, .tg-button > .tg-emoji { width: 14px; height: 14px; }
.tg-button > .tg-emoji { font-size: 12px; line-height: 14px; text-align: center; }
/* An update: the icon in green with a dot, and a narrow ✕ beside it. */
.tg-button.tg-update { color: #8ef58a; position: relative; }
.tg-button.tg-update::after {
    content: ''; position: absolute; top: 8px; right: 6px; width: 7px; height: 7px; border-radius: 50%; background: #8ef58a;
    box-shadow: 0 0 0 2px var(--theme-bg-more-2, #0d0d0d);
}
.tabs.tg-light.tg-light ~ * .tg-button.tg-update { color: #1d6b2c; }
.tabs.tg-light.tg-light ~ * .tg-button.tg-update::after { background: #1d6b2c; }
.tg-button-x { width: 20px; min-width: 0; padding: 0; font-size: 11px; opacity: .6; }
.tg-button-x:hover { opacity: 1; }
.tg-button.tg-running > :first-child { animation: tg-spin 1s linear infinite; }
.tg-button.tg-running::after { display: none; }
/* The result of a background button run, above the toolbar. */
.tg-toast {
    position: fixed; z-index: 1000; min-width: 220px; padding: 10px 12px; border-radius: 8px;
    background: var(--theme-bg-more, #1e1e1e); color: var(--theme-fg, #ddd); border: 1px solid rgba(127, 127, 127, .3);
    box-shadow: 0 6px 24px rgba(0, 0, 0, .4); font-size: 13px;
}
.tg-toast-title { font-weight: 600; margin-bottom: 4px; }
.tg-toast-line { opacity: .85; white-space: pre-wrap; word-break: break-word; }
.tg-toast-actions { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.tg-toast-btn { border: 1px solid rgba(127, 127, 127, .4); border-radius: 6px; background: transparent; color: inherit; padding: 2px 10px; cursor: pointer; }
.tg-toast-btn:hover { background: rgba(127, 127, 127, .2); }
.tg-toast-note { opacity: .7; }
.tg-toast-x { margin-left: auto; padding: 2px 8px; }
.tg-tip .tooltip-inner { white-space: pre-line; text-align: left; }
.tabs.tg-light.tg-light .tg-roll-cmp { color: #5b3fa8; }
/* Tabby's pin sits between the number and the icon; it gets the same 10px gaps. */
.tabs-on-left .tabs > tab-header > .pin-indicator, .tabs-on-right .tabs > tab-header > .pin-indicator { margin: 0 0 0 10px !important; align-self: center; color: #d0d0d0 !important; opacity: 1 !important; }
.tabs-on-left .tabs > tab-header > .pin-indicator + .name, .tabs-on-right .tabs > tab-header > .pin-indicator + .name { margin-left: 10px; }
.tg-tab-pin { flex: none; align-self: center; margin-left: 10px; font-size: 11px; color: #d0d0d0; }
.tg-tab-pin + .name { margin-left: 10px; }
.tg-pin { font-size: 10px; color: #d0d0d0; margin-left: auto; align-self: center; }
/* Tabby centres the number in a fixed box, so the gap after it would change with the digit count. */
.tabs-on-left .tabs > tab-header > .index, .tabs-on-right .tabs > tab-header > .index { text-align: right !important; }
.tg-icon svg { width: 14px; height: 14px; }
/* Two lines of text plus Tabby's activity line, which sits 4px above the row's bottom: the text keeps an equal gap above it and above that line. */
.tabs-on-left .tabs > tab-header.tg-two-line, .tabs-on-right .tabs > tab-header.tg-two-line { flex-basis: 54px !important; }
tab-header.tg-two-line > .name { margin-bottom: 6.5px; }
/* The last tab in a panel gets one more gap at the bottom, with its activity line moved up with it, so the line keeps clear of the panel's edge. */
.tabs-on-left .tabs > tab-header.tg-member.tg-last, .tabs-on-right .tabs > tab-header.tg-member.tg-last { padding-bottom: var(--tg-gap) !important; flex-basis: calc(var(--tabs-height) + var(--tg-gap)) !important; }
.tabs-on-left .tabs > tab-header.tg-member.tg-last.tg-two-line, .tabs-on-right .tabs > tab-header.tg-member.tg-last.tg-two-line { flex-basis: calc(54px + var(--tg-gap)) !important; }
.tabs > tab-header.tg-member.tg-last .activity-indicator { bottom: calc(4px + var(--tg-gap, 0px)) !important; }
tab-header.tg-two-line .name { position: relative; padding-bottom: 15px; }
.tg-cwd {
    position: absolute; left: 0; right: 0; bottom: 0; font-size: 11px; line-height: 14px; color: #b8b8b8;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; pointer-events: none;
}
tab-header.active .tg-cwd { color: #d8d8d8; }
/* Brighter text in the side bar than Tabby's dim grey, for readability on the tinted panels. */
.tabs-on-left .tabs > tab-header:not(.active) > .name, .tabs-on-right .tabs > tab-header:not(.active) > .name { color: #d4d4d4 !important; }
.tabs-on-left .tabs > tab-header.active > .name, .tabs-on-right .tabs > tab-header.active > .name { color: #ffffff !important; }
/* Claude and other apps put symbols such as U+2733 in their titles; draw them as colour emoji, not as text glyphs. */
.tabs > tab-header > .name, .tg-name { font-variant-emoji: emoji; }
.tabs-on-left .tabs > tab-header > .index, .tabs-on-right .tabs > tab-header > .index { color: #d0d0d0 !important; opacity: .85 !important; }

/* Drop marks while dragging a tab in the side bar: a line between rows, or an outline on the tab to group with. */
.tg-drop-line { position: fixed; z-index: 10000; height: 2px; border-radius: 1px; background: #86b7f7; pointer-events: none; }
.tabs > tab-header.tg-drop-onto { outline: 2px solid #86b7f7; outline-offset: -2px; border-radius: 6px; }
.tabs > .tg-header.tg-dragging { opacity: 0.45; }
/* A pane dragged from a split (Ctrl+Shift) brings its own placeholder into the list; it would push the rows from under the pointer. */
.tabs-on-left .tabs > .cdk-drag-placeholder:not(tab-header), .tabs-on-right .tabs > .cdk-drag-placeholder:not(tab-header) { display: none !important; }
.tg-drag-ghost { position: fixed; z-index: 10001; pointer-events: none; padding: 4px 10px; border-radius: 6px; background: #2b2f36; color: #ffffff; white-space: nowrap; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5); }

.tg-menu {
    position: fixed; z-index: 10000; min-width: 210px; padding: 6px; border-radius: 8px;
    background: #1f1f1f; border: 1px solid #333; box-shadow: 0 8px 24px rgba(0,0,0,.5);
    font-size: 13px; color: #ddd; user-select: none;
}
.tg-swatches { display: flex; gap: 8px; padding: 6px 6px 8px; }
.tg-swatch {
    width: 18px; height: 18px; border-radius: 50%; border: none; padding: 0; cursor: pointer;
    outline: 2px solid transparent; outline-offset: 2px;
}
.tg-swatch:hover { outline-color: #666; }
.tg-swatch.tg-on { outline-color: #ddd; }
.tg-swatch.tg-none {
    background: linear-gradient(135deg, transparent 44%, #ddd 44%, #ddd 56%, transparent 56%) !important;
    box-shadow: inset 0 0 0 2px #ddd;
}
.tg-sep { height: 1px; background: #333; margin: 4px 0; }
.tg-item { padding: 6px 10px; border-radius: 4px; cursor: pointer; white-space: nowrap; }
.tg-item:hover { background: #2e2e2e; }
.tg-item.tg-on::after { content: ' ✓'; opacity: .7; }
.tg-label { padding: 4px 10px; font-size: 11px; opacity: .6; }
`

function install (injector) {
    window.__tabbyGroups?.dispose()

    const app = injector.get(core.AppService)
    const recovery = injector.get(core.TabRecoveryService)
    const menuProviders = injector.get(core.TabContextMenuItemProvider)
    // The sidebar gap, rounded to whole screen pixels: at 125% a 6px gap is 7.5px, and each nested band would round that half pixel its own way.
    // Read once at install; a zoom change keeps the old gap until Tabby restarts.
    const gap = Math.round(6 * devicePixelRatio) / devicePixelRatio

    /** @type {Map<string, {name: string, color: string|null, collapsed: boolean, parent: string|null}>} */
    const groups = new Map()
    // A reload (dispose, then install) hands the groups over; the tabs still carry their tab.__tg.
    for (const g of window.__tabbyGroupsState?.groups ?? []) {
        groups.set(g.name, { ...g })
    }
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
    const tint = g => g.color ?? NO_COLOR
    /** How many levels in a row, up from this group, share their parent's colour: the number of shading steps. */
    const shadeOf = g => {
        const parent = groups.get(g?.parent)
        return parent && tint(parent) === tint(g) ? shadeOf(parent) + 1 : 0
    }

    /** The group and its ancestors, root first. */
    function chainOf (name) {
        const chain = []
        for (let g = groups.get(name); g; g = groups.get(g.parent)) {
            chain.unshift(g)
        }
        return chain
    }
    const inGroup = (tab, name) => !!tab && chainOf(tab.__tg).some(g => g.name === name)
    const members = name => app.tabs.filter(t => t.__tg === name)
    const subtree = name => app.tabs.filter(t => inGroup(t, name))
    // A collapsed group still shows the path to its active tab, and folds it away once another tab is selected.
    // A group under a collapsed parent shows as collapsed, so one click opens it and its parents.
    const shut = g => chainOf(g.name).some(a => a.collapsed)
    const tabHidden = tab => tab !== app.activeTab && chainOf(tab.__tg).some(g => g.collapsed)
    const headerHidden = g => !inGroup(app.activeTab, g.name) && chainOf(g.parent).some(a => a.collapsed)

    function ensureGroup (name, opts = {}) {
        let g = groups.get(name)
        const created = !g
        if (!g) {
            g = { name, color: COLORS[groups.size % COLORS.length].value, collapsed: false, parent: null, pinned: false }
            groups.set(name, g)
        }
        if (opts.color !== undefined) {
            setColor(name, opts.color, false)
        }
        if (opts.parent !== undefined && opts.parent !== g.parent) {
            if (opts.parent && opts.parent !== name) {
                ensureGroup(opts.parent)
            }
            // Throws, so a script over CDP learns of the refusal instead of getting a top-level group.
            if (!setParent(name, opts.parent, false)) {
                throw new Error(`tabby-groups: cannot put "${name}" inside "${opts.parent}", because it would contain itself`)
            }
        }
        // A new subgroup in its parent's colour would melt into it: it takes the next palette colour. A chosen colour stays.
        const parentColor = groups.get(g.parent)?.color
        if (created && opts.color === undefined && parentColor && g.color === parentColor) {
            g.color = COLORS[(COLORS.findIndex(c => c.value === g.color) + 1) % COLORS.length].value
        }
        return g
    }

    function addTab (tab, name, opts = {}) {
        tab = top(tab)
        const g = ensureGroup(name, opts)
        // The tab's own colour is left alone: the panel shows the group colour, and the own colour returns when the tab leaves.
        setMembership(tab, name)
        // Adding a tab to a collapsed group expands its chain, so a new tab never vanishes.
        chainOf(name).forEach(a => { a.collapsed = false })

        // Lands at the end of its group, or first when its title is the group's name; an empty group borrows its parent's place.
        let others = []
        for (let a = g; a && !others.length; a = groups.get(a.parent)) {
            others = subtree(a.name).filter(t => t !== tab)
        }
        if (others.length) {
            // A restored tab keeps its saved place: restore runs in saved order, and titles change after launch.
            const lead = !opts.restore && titleOf(tab) === name && subtree(name).some(t => t !== tab)
            let target = lead ? app.tabs.indexOf(others[0]) : app.tabs.indexOf(others[others.length - 1]) + 1
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
    function setMembership (tab, name) {
        const was = !!chainOf(tab.__tg)[0]?.pinned
        const now = !!chainOf(name)[0]?.pinned
        // A local pin belongs to the group it was made in.
        if (tab.__tg !== name) {
            delete tab.__tgPinned
        }
        if (name) {
            tab.__tg = name
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
        for (const t of subtree(g.name)) {
            const chain = chainOf(t.__tg)
            const unit = chain[chain.indexOf(g) + 1] ?? t
            if (!units.includes(unit)) {
                units.push(unit)
            }
        }
        const isGroup = u => groups.get(u.name) === u
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
        prune()
        if (emit) {
            changed()
        }
    }

    /** Drops every group with no tab left anywhere under it. */
    function prune () {
        for (const g of [...groups.values()]) {
            if (!subtree(g.name).length) {
                groups.delete(g.name)
            }
        }
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
    function setParent (name, parent, emit = true) {
        const g = groups.get(name)
        if (!g || (parent && (!groups.has(parent) || chainOf(parent).some(a => a.name === name)))) {
            return false
        }
        g.parent = parent || null
        if (emit) {
            changed()
        }
        return true
    }

    function rename (oldName, newName) {
        const g = groups.get(oldName)
        if (!g || !newName || groups.has(newName)) {
            return false
        }
        groups.delete(oldName)
        g.name = newName
        groups.set(newName, g)
        members(oldName).forEach(t => { t.__tg = newName })
        groups.forEach(c => { if (c.parent === oldName) c.parent = newName })
        changed()
        return true
    }

    /** Dissolves one level: its tabs and subgroups move up to its parent. */
    function ungroup (name) {
        const g = groups.get(name)
        if (!g) {
            return
        }
        const parent = groups.get(g.parent)
        groups.forEach(c => { if (c.parent === name) c.parent = g.parent })
        members(name).forEach(t => {
            if (parent) {
                t.__tg = parent.name
            } else {
                removeTab(t, false)
            }
        })
        groups.delete(name)
        prune()
        changed()
    }

    function list () {
        return [...groups.values()].map(g => ({
            name: g.name,
            color: g.color,
            collapsed: g.collapsed,
            pinned: !!g.pinned,
            parent: g.parent,
            tabs: members(g.name).map(t => ({ title: titleOf(t), index: app.tabs.indexOf(t) })),
            needsYou: subtree(g.name).filter(t => t.__tgInfo?.agent?.needsYou).length,
            asking: subtree(g.name).filter(t => t.__tgInfo?.agent?.asking).length,
            running: subtree(g.name).filter(t => t.__tgInfo?.agent?.background).length,
            compacting: subtree(g.name).filter(t => t.__tgInfo?.agent?.compacting).length,
            busy: subtree(g.name).filter(t => t.__tgInfo?.agent?.state === 'busy').length,
            first: app.tabs.indexOf(subtree(g.name)[0]),
        })).sort((a, b) => a.first - b.first).map(({ first, ...g }) => g)
    }

    /** Groups in tree order with their depth, for menus. */
    function tree () {
        const out = []
        const walk = (parent, depth) => list().filter(g => g.parent === parent).forEach(g => {
            out.push({ g: groups.get(g.name), depth })
            walk(g.name, depth + 1)
        })
        walk(null, 0)
        return out
    }

    /** "Group N", N being the group count plus one, or the next free number; renamed later with a double-click. */
    function newGroupName () {
        let n = groups.size + 1
        while (groups.has(`Group ${n}`)) {
            n++
        }
        return `Group ${n}`
    }

    // Keeps every group's subtree contiguous, parents first, and drops empty groups.
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
            prune()
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
                setColor(g.name, c.value)
            })
            swatches.append(b)
        }
        const moveTargets = tree().filter(t => t.g !== g && !chainOf(t.g.name).includes(g))
        const move = Object.assign(document.createElement('div'), { className: 'tg-item', textContent: 'Move into…' })
        move.addEventListener('click', () => fillMoveMenu(g, moveTargets))
        menuEl.append(
            swatches,
            sep(),
            menuItem('Rename', () => startRename(g)),
            menuItem(shut(g) ? 'Expand' : 'Collapse', () => setCollapsed(g.name, !shut(g))),
            menuItem(g.pinned ? 'Unpin group' : 'Pin group', () => setPinned(g.name, !g.pinned)),
            ...g.parent || moveTargets.length ? [move] : [],
            sep(),
            menuItem(g.parent ? 'Ungroup (move up a level)' : 'Ungroup', () => ungroup(g.name)),
        )
    }

    function fillMoveMenu (g, targets) {
        menuEl.replaceChildren(
            Object.assign(document.createElement('div'), { className: 'tg-label', textContent: `Move "${g.name}" into` }),
            menuItem('Top level', () => setParent(g.name, null), !g.parent),
            ...targets.map(t => menuItem(' '.repeat(t.depth) + t.g.name, () => setParent(g.name, t.g.name), g.parent === t.g.name)),
        )
    }

    const menuProvider = {
        weight: 5,
        async getItems (tab, tabHeader) {
            if (!tabHeader || !document.querySelector('.tabs-on-left, .tabs-on-right')) {
                return []
            }
            tab = top(tab)
            const newGroup = parent => () => addTab(tab, newGroupName(), parent ? { parent } : {})
            const groupsTree = tree()
            const items = [{
                label: 'Add to group',
                submenu: [
                    ...groupsTree.map(({ g, depth }) => ({
                        label: ' '.repeat(depth) + g.name, type: 'radio', checked: tab.__tg === g.name, click: () => tab.__tg !== g.name && addTab(tab, g.name),
                    })),
                    ...groupsTree.length ? [{ type: 'separator' }] : [],
                    { label: 'New group', click: newGroup(null) },
                ],
            }]
            if (tab.__tg) {
                items.push(
                    { label: `New subgroup of ${tab.__tg}`, click: newGroup(tab.__tg) },
                    { label: 'Remove from group', click: () => removeTab(tab) },
                )
            }
            return items
        },
    }
    menuProviders.push(menuProvider)

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
            width = Math.round(Math.max(140, Math.min(600, onRight ? bar.right - e.clientX : e.clientX - bar.left)))
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
            toolbar.remove()
        }
        if (!handle.isConnected) {
            document.body.appendChild(handle)
        }
        // Tabby can recreate its toolbar too: put the user's buttons back.
        if (userButtons.length && !buttonsEl.isConnected) {
            renderButtons()
        }
        placeHandle()
    }

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
        container.querySelectorAll(':scope > .tg-header, :scope > .tg-foot').forEach(e => e.remove())
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
        const hideHead = g => q ? !subtree(g.name).some(matches) : headerHidden(g)
        // A subgroup's footer shows while anything below its header is visible.
        const open = g => q ? !hideHead(g) : !headerHidden(g) && (!g.collapsed || inGroup(app.activeTab, g.name))
        firstMatch = q ? app.tabs.find(matches) : null
        mountChrome(vertical)

        const rows = []
        app.tabs.forEach((tab, i) => {
            const el = headers[i]
            if (!el) {
                return
            }
            const chain = chainOf(tab.__tg)
            const prev = chainOf(app.tabs[i - 1]?.__tg)
            for (let k = commonDepth(chain, prev); k < chain.length; k++) {
                const h = makeHeader(chain[k], k, k === 0 && prev.length > 0, k > 0 && open(chain[k]))
                el.before(h)
                rows.push({ el: h, chain: chain.slice(0, k + 1), hidden: hideHead(chain[k]), kind: 'head' })
            }
            rows.push({ el, chain, hidden: hideTab(tab), kind: 'tab', active: tab === app.activeTab, tab })
            const next = chainOf(app.tabs[i + 1]?.__tg)
            let after = el
            for (let k = chain.length - 1; k >= Math.max(1, commonDepth(chain, next)); k--) {
                const f = document.createElement('div')
                f.className = 'tg-foot'
                f.dataset.group = chain[k].name
                f.innerHTML = '<div class="tg-foot-inner"></div>'
                f.style.setProperty('--tg-own', tint(chain[k]))
                f.style.setProperty('--tg-own-pct', tintPct(k) + '%')
                f.style.setProperty('--tg-own-depth', shadeOf(chain[k]))
                after.after(f)
                after = f
                rows.push({ el: f, chain: chain.slice(0, k + 1), hidden: !open(chain[k]), kind: 'foot' })
            }
        })

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
        const level = Math.max(0, r.chain.length - (r.kind === 'tab' ? 1 : 2))
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
        h.dataset.group = g.name
        h.style.setProperty('--tg-own', tint(g))
        h.style.setProperty('--tg-own-pct', tintPct(depth) + '%')
        h.style.setProperty('--tg-own-depth', shadeOf(g))
        h.dataset.tgTip = g.name
        const count = subtree(g.name).length
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
        const needs = subtree(g.name).filter(t => t.__tgInfo?.agent?.needsYou).length
        const busy = subtree(g.name).filter(t => t.__tgInfo?.agent?.state === 'busy').length
        const roll = [needs && `${needs} ${needs === 1 ? 'needs' : 'need'} you`, busy && `${busy} busy`].filter(Boolean).join(' · ')
        const asks = subtree(g.name).filter(t => t.__tgInfo?.agent?.asking).length
        if (asks) {
            countEl.append(' · ', Object.assign(document.createElement('span'), { className: 'tg-roll-ask', textContent: `${asks} asking` }))
        }
        const running = subtree(g.name).filter(t => t.__tgInfo?.agent?.background).length
        if (running) {
            countEl.append(' · ', Object.assign(document.createElement('span'), { className: 'tg-roll-run', textContent: `${running} running` }))
        }
        const compacting = subtree(g.name).filter(t => t.__tgInfo?.agent?.compacting).length
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
            openViaPlus(g.name)
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
            // The second click of a double-click (which opens a tab or renames) cancels the pending collapse.
            if (e.detail > 1) {
                return
            }
            clickTimer = setTimeout(() => setCollapsed(g.name, !shut(g)), 220)
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
        const nameEl = [...document.querySelectorAll('.tg-header')].find(h => h.dataset.group === g.name)?.querySelector('.tg-name')
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
            if (!commit || !rename(g.name, nameEl.textContent.trim())) {
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

    // A double-click on free side-bar space opens a new tab in the group whose panel is under the pointer, or a loose tab
    // outside every panel. The tab comes from Tabby's own "+" button, so it follows Tabby's new-tab rules.
    function onBarDblClick (e) {
        const bar = e.target.closest?.('.tabs-on-left > .tab-bar, .tabs-on-right > .tab-bar')
        if (!bar || e.target.closest('tab-header, .tg-toolbar, .btn-group, .tg-name, .tg-tab-rename, .tg-resize, .tg-add')) {
            return
        }
        e.stopPropagation()
        e.preventDefault()
        openViaPlus(groupAtPoint(bar, e.clientX, e.clientY))
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
        return depth < 0 || !chain.length ? null : chain[Math.min(depth, chain.length - 1)].name
    }
    document.addEventListener('dblclick', onBarDblClick, true)

    // Group headers get Tabby's own tooltip look (Bootstrap's "tooltip bs-tooltip-top", as ngbTooltip renders for tabs),
    // centred above the header, instead of the browser's title box.
    // Shown only after the pointer rests on the header for a moment, like a tab's tooltip.
    const TIP_DELAY = 500
    let tipEl = null
    let tipHost = null
    let tipTimer = null
    function hideTip () {
        clearTimeout(tipTimer)
        tipEl?.remove()
        tipEl = tipHost = null
    }
    function onTipOver (e) {
        const host = e.target.closest?.('[data-tg-tip]')
        if (!host || host === tipHost) {
            return
        }
        hideTip()
        tipHost = host
        tipTimer = setTimeout(() => showTip(host), TIP_DELAY)
    }
    function showTip (host) {
        if (!host.isConnected) {
            return
        }
        tipEl = document.createElement('div')
        // Without "show" at first, so Bootstrap's opacity transition fades it in when "show" follows on the next frame.
        tipEl.className = 'tooltip fade bs-tooltip-top tg-tip'
        tipEl.setAttribute('role', 'tooltip')
        tipEl.innerHTML = '<div class="tooltip-arrow"></div><div class="tooltip-inner"></div>'
        tipEl.querySelector('.tooltip-inner').textContent = host.dataset.tgTip
        // Positioned before it is measured: until then Bootstrap's box spans the page width.
        Object.assign(tipEl.style, { position: 'fixed', left: 0, top: 0, margin: 0 })
        document.body.appendChild(tipEl)
        const h = host.getBoundingClientRect()
        const t = tipEl.getBoundingClientRect()
        const left = Math.max(4, Math.min(innerWidth - t.width - 4, h.left + h.width / 2 - t.width / 2))
        Object.assign(tipEl.style, { left: left + 'px', top: h.top - t.height + 'px' })
        // ngbTooltip's positioning library sets the arrow absolute; Bootstrap's bs-tooltip-top rule then puts it below the box.
        const arrow = tipEl.querySelector('.tooltip-arrow')
        arrow.style.position = 'absolute'
        arrow.style.left = h.left + h.width / 2 - left - arrow.offsetWidth / 2 + 'px'
        const shown = tipEl
        requestAnimationFrame(() => requestAnimationFrame(() => shown.classList.add('show')))
    }
    const onTipOut = e => {
        if (tipHost && !tipHost.contains(e.relatedTarget)) {
            hideTip()
        }
    }
    document.addEventListener('mouseover', onTipOver, true)
    document.addEventListener('mouseout', onTipOut, true)
    document.addEventListener('mousedown', hideTip, true)

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
            token.tabbyGroup = chain.map(g => ({ name: g.name, color: g.color, collapsed: g.collapsed, pinned: g.pinned }))
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
        return params
    }

    /**
     * The command that brings a Claude Code or Codex session back after Tabby restarts (Tabby restores the shell and its
     * screen text, never the program). Keeps every launch flag of the original command (several --add-dir, the permission
     * mode, the model, …); drops the first prompt and the old resume, continue, name and print flags. A known session id
     * wins over the name, and --continue ("latest session in this folder") is the last resort: several sessions can share a folder.
     */
    function resumeCommand (app, raw, sessionId) {
        if (app === 'codex') {
            return 'codex resume --last'
        }
        if (app !== 'claude' || !raw) {
            return null
        }
        const args = (raw.match(/"[^"]*"|\S+/g) ?? []).map(a => a.replace(/^"|"$/g, ''))
        // Drop the program itself: claude.exe, or node plus the CLI script.
        const start = args.findIndex(a => /claude(\.exe|\.cmd|\.ps1)?$|claude-code[\\/].*\.(m?js)$/i.test(a)) + 1
        const rest = args.slice(start)
        const keep = []
        let name
        for (let i = 0; i < rest.length; i++) {
            const eq = rest[i].startsWith('--') ? rest[i].indexOf('=') : -1
            const flag = eq > 0 ? rest[i].slice(0, eq) : rest[i]
            if (!flag.startsWith('-')) {
                continue // a bare word: the first prompt
            }
            let value = eq > 0 ? rest[i].slice(eq + 1) : undefined
            // An unknown flag may take a value or not. Dropping it with the next word is safe either way: that word is its
            // value or the first prompt, and the prompt is dropped anyway.
            const isSwitch = CLAUDE_SWITCHES.includes(flag)
            if (value === undefined && !isSwitch && rest[i + 1] && !rest[i + 1].startsWith('-')) {
                value = rest[++i]
            }
            if (['--resume', '-r', '--name', '-n'].includes(flag)) {
                name ??= value
            } else if (CLAUDE_KEPT_VALUE_FLAGS.includes(flag) || (isSwitch && !CLAUDE_DROPPED_SWITCHES.includes(flag))) {
                keep.push(flag, ...value === undefined ? [] : [shellQuote(value)])
            }
        }
        return ['claude', ...sessionId || name ? ['--resume', shellQuote(sessionId || name)] : ['--continue'], ...keep].join(' ')
    }
    // A resume keeps only the Claude flags listed here; any other flag is dropped, and a bare word is the first prompt.
    const CLAUDE_KEPT_VALUE_FLAGS = ['--model', '--fallback-model', '--permission-mode', '--add-dir', '--settings',
        '--setting-sources', '--mcp-config', '--append-system-prompt', '--system-prompt', '--allowedTools', '--allowed-tools',
        '--disallowedTools', '--disallowed-tools', '--agents', '--agent', '--plugin-dir', '--max-turns', '--effort', '--betas',
        '--permission-prompt-tool']
    // Flags without a value. The dropped ones would print and exit, or fork or continue another session.
    const CLAUDE_SWITCHES = ['--dangerously-skip-permissions', '--allow-dangerously-skip-permissions', '--verbose', '--debug', '-d',
        '--ide', '--strict-mcp-config', '--chrome', '--no-chrome', '--continue', '-c', '--print', '-p', '--fork-session']
    const CLAUDE_DROPPED_SWITCHES = ['--continue', '-c', '--print', '-p', '--fork-session']
    // The resume runs in PowerShell (see the recovery token), so a value with spaces or quotes is double-quoted for it.
    const shellQuote = v => /^[\w.:\\/=+-]+$/.test(v) ? v : IS_WIN ? `"${v.replace(/[`"$]/g, '`$&')}"` : `'${v.replace(/'/g, `'\\''`)}'`

    // Types the resume command once the restored pane's shell is ready (whenever its tab is first shown). Until then the
    // command stays the pane's resume, so a restart before the tab was opened still brings the session back later.
    async function resumeLater (pane, command) {
        const info = pane.__tgInfo
        info.resume = command
        info.resumePending = true
        await shellReady(pane)
        info.resumePending = false
        if (!pane._destroyCalled) {
            pane.sendInput(command + '\r')
            startupChecks(pane)
        }
    }

    // Session kind and folder per pane. Nothing polls: a pane is inspected when it opens, after Enter,
    // and when its title or full-screen state changes, each debounced into a single process-tree read.
    let processTree = null
    try {
        processTree = require('@tabby-gang/windows-process-tree')
    } catch { }
    const SHELLS = { 'pwsh.exe': 'pwsh', 'powershell.exe': 'powershell', 'cmd.exe': 'cmd', 'bash.exe': 'bash', 'wsl.exe': 'wsl', pwsh: 'pwsh', bash: 'bash', zsh: 'bash', fish: 'bash', sh: 'bash' }
    // First match wins over every process under the shell. AI CLIs come first, so one running on Node is not shown as Node.js.
    const APPS = [
        ['claude', p => p.name.startsWith('claude') || p.cmd.includes('@anthropic-ai/claude-code')],
        ['codex', p => p.name.startsWith('codex') || p.cmd.includes('@openai/codex')],
        ['gemini', p => p.name.startsWith('gemini') || p.cmd.includes('@google/gemini-cli')],
        ['nvim', p => p.name.startsWith('nvim')],
        ['vim', p => /^g?vim(\.exe)?$/.test(p.name)],
        ['docker', p => p.name.startsWith('docker')],
        ['ssh', p => p.name === 'ssh.exe' || p.name === 'ssh'],
        ['python', p => /^python[0-9.]*(\.exe)?$|^py\.exe$/.test(p.name)],
        ['node', p => p.name === 'node.exe' || p.name === 'node'],
    ]
    // Claude Code prefixes its title with ✳ when idle and a spinner (braille dots or ◐◑◒◓) while busy;
    // this catches it when the process tree is unavailable.
    const CLAUDE_TITLE = /^[⠀-⣿✳✻✽✶✢◐◑◒◓]/
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
    let userButtons = []
    function loadUserIcons () {
        let rules = []
        let buttonRules = []
        try {
            const file = JSON.parse(require('fs').readFileSync(userIconsFile, 'utf8'))
            rules = file.icons ?? []
            buttonRules = file.buttons ?? []
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
        userButtons = buttonRules.filter(b => {
            const ok = b?.label && b.command && (!b.icon || /^[a-z0-9-]+$/.test(b.icon))
            if (!ok) {
                console.warn('tabby-groups: button skipped', b?.label, 'needs label and command; icon is a Font Awesome name')
            }
            return ok
        })
        userIconsVersion++
        app.tabs.flatMap(t => t.getAllTabs?.() ?? [t]).filter(p => p.__tgInfo).forEach(p => queueInspect(p, 100))
        scheduleChecks()
        renderButtons()
    }
    /*
     * The user's toolbar buttons: tabby-groups.json "buttons": [{ "label", "command", "cwd"?, "check"?, "checkEveryMinutes"?,
     * and an icon: "icon" (a Font Awesome name such as "sync"), or "emoji", or "path"/"paths" (+ "stroke", "color") as in
     * "icons" }]. A click types the command into a new tab that stays open. With "check", the button shows only while the
     * check (run from Tabby's own process at start and every checkEveryMinutes, default 30) exits 10; its stdout is the
     * tooltip, and ✕ hides it until that stdout changes. Exit 0 means nothing new; any other exit is logged.
     * Tabby reads its own toolbar once at start, so the plugin draws these buttons itself.
     */
    const buttonState = new Map()
    let buttonTimers = []
    const sha1 = s => require('crypto').createHash('sha1').update(s).digest('hex')
    const dismissKey = b => 'tabby-groups:dismissed:' + sha1(b.label)
    /**
     * Runs a button's command line from Tabby's own process. Windows: cmd, with the console in UTF-8 (a piped console
     * program writes in the OEM code page otherwise). macOS and Linux: the user's login shell, because a Tabby started
     * from the Dock has launchd's bare PATH (no Homebrew, no npm globals).
     */
    function runShell (commandLine, { cwd, timeout }, done) {
        const opts = { cwd: cwd || require('os').homedir(), timeout, maxBuffer: 64 << 20, windowsHide: true }
        const cp = require('child_process')
        if (IS_WIN) {
            cp.exec(`chcp 65001 >nul & ${commandLine}`, opts, done)
        } else {
            cp.execFile(process.env.SHELL || '/bin/zsh', ['-lc', commandLine], opts, done)
        }
    }
    function runCheck (b) {
        runShell(b.check, { cwd: b.cwd, timeout: 5 * 60e3 }, (err, stdout, stderr) => {
            const code = err ? (typeof err.code === 'number' ? err.code : -1) : 0
            if (code !== 0 && code !== 10) {
                console.warn('tabby-groups: button check failed', b.label, code, String(stderr || err?.message).trim())
            }
            buttonState.set(b, code === 10 ? stdout.replace(/\r/g, '').trim() : null)
            renderButtons()
        })
    }
    function scheduleChecks () {
        buttonTimers.forEach(clearInterval)
        buttonState.clear()
        buttonTimers = userButtons.filter(b => b.check).map(b => {
            runCheck(b)
            return setInterval(() => runCheck(b), Math.max(1, +b.checkEveryMinutes || 30) * 60e3)
        })
    }
    /*
     * A button with a check is an update: its command runs in the background from Tabby's own process, the icon spins, and
     * a toast tells the result. The full output goes to a log file the toast can open. If the command's last line is a JSON
     * object, "problems" (lines to look at) and "reload" (Tabby plugins that changed) shape the toast, and every other
     * non-empty field is shown as a line. A button without a check opens a tab, as before.
     */
    const running = new Set()
    const buttonLog = b => require('path').join(require('os').tmpdir(), 'tabby-groups', `button-${sha1(b.label).slice(0, 8)}.log`)
    function lastJson (stdout) {
        const line = stdout.replace(/\r/g, '').trim().split('\n').pop() ?? ''
        try {
            const v = JSON.parse(line)
            return v && typeof v === 'object' && !Array.isArray(v) ? v : null
        } catch {
            return null
        }
    }
    function runInBackground (b) {
        if (running.has(b)) {
            return
        }
        running.add(b)
        hideToast()
        renderButtons()
        runShell(b.command, { cwd: b.cwd, timeout: 30 * 60e3 }, (err, stdout, stderr) => {
            running.delete(b)
            const code = err ? (typeof err.code === 'number' ? err.code : -1) : 0
            const log = buttonLog(b)
            try {
                require('fs').mkdirSync(require('path').dirname(log), { recursive: true })
                require('fs').writeFileSync(log, `$ ${b.command}\n${new Date().toISOString()}\n\n${stdout}${stderr ? '\n--- stderr ---\n' + stderr : ''}\n--- exit ${code} ---\n`)
            } catch { }
            const json = lastJson(stdout)
            const result = json ?? {}
            const list = v => (Array.isArray(v) ? v : v ? [v] : []).map(String)
            const problems = list(result.problems)
            const reload = list(result.reload)
            // A text field is a sentence of its own; a list gets its key as a label. Without JSON, the output's last lines.
            const notes = json
                ? Object.entries(result).filter(([k, v]) => !['problems', 'reload', 'sync'].includes(k) && list(v).length)
                    .map(([k, v]) => (typeof v === 'string' ? v : `${k}: ${list(v).join(', ')}`))
                : (stdout + stderr).replace(/\r/g, '').trim().split('\n').filter(Boolean).slice(-3)
            if (code !== 0) {
                showToast(`${b.label} failed (exit ${code})`, [...problems, ...notes], [['Open log', () => openLog(log)]])
            } else if (problems.length) {
                showToast(`${b.label}: ${problems.length} problem${problems.length === 1 ? '' : 's'}`, [...problems, ...notes], [['Open log', () => openLog(log)]])
            } else if (reload.length) {
                showToast(`${b.label}: updated`, [`Changed: ${reload.join(', ')}`, ...notes], reloadActions(reload, log))
            } else {
                showToast(`${b.label}: up to date ✓`, notes, [['Open log', () => openLog(log)]], notes.length ? 0 : 6000)
            }
            renderButtons()
            if (b.check) {
                runCheck(b)
            }
        })
    }
    /** Until plugins can reload in place: say a restart is needed. */
    const reloadActions = (names, log) => [['Open log', () => openLog(log)], ['Restart Tabby to load them', null]]
    function openLog (file) {
        try {
            require('@electron/remote').shell.openPath(file)
        } catch (e) {
            console.warn('tabby-groups: cannot open', file, e.message)
        }
    }
    let toastEl = null
    let toastTimer = null
    function hideToast () {
        clearTimeout(toastTimer)
        toastEl?.remove()
        toastEl = null
    }
    /** A small card above the toolbar buttons: a title, lines, and actions (an action without a function is plain text). */
    function showToast (title, lines, actions = [], autoHide = 0) {
        hideToast()
        const bar = [...document.querySelectorAll('.tab-bar > .btn-group.background')].pop()?.getBoundingClientRect()
        toastEl = Object.assign(document.createElement('div'), { className: 'tg-toast' })
        toastEl.append(Object.assign(document.createElement('div'), { className: 'tg-toast-title', textContent: title }))
        for (const l of lines) {
            toastEl.append(Object.assign(document.createElement('div'), { className: 'tg-toast-line', textContent: l }))
        }
        const row = Object.assign(document.createElement('div'), { className: 'tg-toast-actions' })
        for (const [label, fn] of actions) {
            row.append(fn
                ? Object.assign(document.createElement('button'), { className: 'tg-toast-btn', textContent: label, onclick: () => { hideToast(); fn() } })
                : Object.assign(document.createElement('span'), { className: 'tg-toast-note', textContent: label }))
        }
        const close = Object.assign(document.createElement('button'), { className: 'tg-toast-btn tg-toast-x', textContent: '✕', onclick: hideToast })
        row.append(close)
        toastEl.append(row)
        if (bar) {
            Object.assign(toastEl.style, { left: Math.max(4, bar.left + 4) + 'px', bottom: Math.max(4, innerHeight - bar.top + 6) + 'px', maxWidth: Math.max(220, bar.width - 8) + 'px' })
        }
        document.body.append(toastEl)
        if (autoHide) {
            toastTimer = setTimeout(hideToast, autoHide)
        }
    }
    function pressButton (b) {
        if (b.check) {
            runInBackground(b)
        } else {
            open({ title: b.label, cwd: b.cwd || require('os').homedir(), run: b.command })
        }
    }
    const buttonsEl = Object.assign(document.createElement('div'), { className: 'tg-buttons' })
    function renderButtons () {
        const bar = [...document.querySelectorAll('.tab-bar > .btn-group.background')].pop()
        const shown = userButtons.filter(b => {
            const out = buttonState.get(b)
            if (!b.check || running.has(b)) {
                return true
            }
            let dismissed = null
            try {
                dismissed = localStorage.getItem(dismissKey(b))
            } catch { }
            return out != null && dismissed !== sha1(out)
        })
        if (!bar || !shown.length) {
            buttonsEl.remove()
            return
        }
        buttonsEl.replaceChildren(...shown.flatMap(b => {
            const out = buttonState.get(b)
            const busy = running.has(b)
            const btn = Object.assign(document.createElement('button'), { className: 'btn btn-secondary btn-tab-bar tg-button' + (b.check ? ' tg-update' : '') + (busy ? ' tg-running' : '') })
            btn.append(b.emoji || b.path || b.paths
                ? drawIcon({ emoji: b.emoji, path: b.path, paths: b.paths, stroke: !!b.stroke, color: b.color ?? 'currentColor' })
                : Object.assign(document.createElement('i'), { className: `fas fa-${b.icon || 'terminal'}` }))
            // One icon at any side-bar width: "Update available" and the check's lines live in the tooltip.
            btn.dataset.tgTip = busy ? `${b.label}: running…` : b.check ? `Update available: ${b.label}\n${out}` : b.label
            btn.addEventListener('click', () => pressButton(b))
            if (!b.check || busy) {
                return [btn]
            }
            const x = Object.assign(document.createElement('button'), { className: 'btn btn-secondary btn-tab-bar tg-button-x', textContent: '✕' })
            x.dataset.tgTip = 'Dismiss until something new'
            x.addEventListener('click', () => {
                try {
                    localStorage.setItem(dismissKey(b), sha1(out))
                } catch { }
                hideTip()
                renderButtons()
            })
            return [btn, x]
        }))
        if (buttonsEl.parentElement !== bar) {
            bar.prepend(buttonsEl)
        }
    }
    const buttons = () => userButtons.map(b => ({ label: b.label, shown: buttonsEl.isConnected && [...buttonsEl.children].some(c => c.dataset.tgTip?.startsWith(b.label)) }))
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
    const shellOf = command => SHELLS[(command ?? '').split(/[\\/]/).pop().toLowerCase()] ?? null
    const profileKind = term => term.profile?.type === 'ssh' ? 'ssh' : shellOf(term.profile?.options?.command)

    /** The session a running Claude Code process holds: Claude records it in sessions/<pid>.json under its config folder. */
    function claudeSessionId (pid) {
        try {
            const dir = process.env.CLAUDE_CONFIG_DIR || require('path').join(require('os').homedir(), '.claude')
            const id = JSON.parse(require('fs').readFileSync(require('path').join(dir, 'sessions', pid + '.json'), 'utf8')).sessionId
            return /^[0-9a-f-]{36}$/i.test(id) ? id : null
        } catch {
            return null
        }
    }

    async function inspect (term) {
        const info = term.__tgInfo ??= { kind: profileKind(term), cwd: null }
        let procs = []
        try {
            const pid = await term.session?.pty?.getPID()
            if (pid && (processTree || !IS_WIN)) {
                const tree = IS_WIN
                    ? await new Promise(resolve => processTree.getProcessTree(pid, resolve, processTree.ProcessDataFlag.CommandLine))
                    : await psTree(pid)
                const walk = (n, ppid) => n ? [{ pid: n.pid, ppid, name: n.name.toLowerCase(), cmd: (n.commandLine ?? '').toLowerCase(), raw: n.commandLine ?? '' }, ...n.children.flatMap(c => walk(c, n.pid))] : []
                procs = walk(tree, null)
            }
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

    // One ps call per inspect, parsed by columns; a process name with a space (rare) lands in the command line.
    const execText = (cmd, args) => new Promise(resolve => require('child_process').execFile(cmd, args, { timeout: 3000 }, (err, out) => resolve(err ? '' : out)))
    async function psTree (root) {
        const nodes = new Map()
        for (const line of (await execText('ps', ['-A', '-o', 'pid=,ppid=,ucomm=,args='])).split('\n')) {
            const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/.exec(line)
            if (m) {
                nodes.set(+m[1], { pid: +m[1], ppid: +m[2], name: m[3].replace(/^-/, ''), commandLine: m[4], children: [] })
            }
        }
        nodes.forEach(n => nodes.get(n.ppid)?.children.push(n))
        return nodes.get(root) ?? null
    }

    let nativeCwd = null
    try {
        nativeCwd = require('native-process-working-directory')
    } catch { }
    async function osCwd (pid) {
        if (!IS_WIN) {
            const dir = (await execText('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'])).split('\n').find(l => l.startsWith('n'))
            return dir ? dir.slice(1) : null
        }
        try {
            const dir = nativeCwd?.getWorkingDirectoryFromPID(pid)
            return dir ? dir.replace(/\\+$/, '').replace(/^([a-z]:)$/i, '$1\\') : null
        } catch {
            return null
        }
    }

    // Default prompts of PowerShell (PS C:\x>), cmd (C:\x>) and Git Bash (… MINGW64 /c/x).
    const PROMPTS = [
        [/^PS ([a-z]:\\[^>]*)>/i, m => m[1]],
        [/^([a-z]:\\[^>]*)>/i, m => m[1]],
        // Inside a git repo Git Bash appends " (branch)" to the prompt.
        [/MINGW(?:64|32)? (\/[a-z](?:\/[^\s(]*)?|~[^\s(]*)(?=\s|$)/i, m => m[1].startsWith('~')
            ? (process.env.USERPROFILE ?? '') + m[1].slice(1).replace(/\//g, '\\')
            : m[1][1].toUpperCase() + ':\\' + m[1].slice(3).replace(/\//g, '\\')],
    ]
    /** The folder in the last shell prompt on screen, or null for a tab without a terminal view yet. */
    function promptCwd (term) {
        const buffer = term.frontend?.xterm?.buffer?.active
        if (!buffer) {
            return null
        }
        const bottom = buffer.baseY + buffer.cursorY
        for (let y = bottom; y >= Math.max(0, bottom - 300); y--) {
            const line = buffer.getLine(y)?.translateToString(true).trim()
            for (const [re, toPath] of PROMPTS) {
                const m = line && re.exec(line)
                if (m) {
                    return toPath(m).replace(/\\+$/, '').replace(/^([a-z]:)$/i, '$1\\')
                }
            }
        }
        return null
    }

    /*
     * Claude's state from its title: a spinner (braille or ◐◑◒◓) while it works, ✳ while it waits for input. A tab that
     * goes from busy to waiting while nobody looks at it (not Tabby's focused active tab, not open on a device) needs you
     * until it is seen. Codex sets no such title, so it has no state.
     */
    const lookedAt = t => (app.activeTab === t && document.hasFocus()) || !!t.__trPresence?.some(d => d.state !== 'away')
    function updateAgent (term) {
        const info = term.__tgInfo
        if (!info) {
            return
        }
        const title = term.title ?? ''
        const prev = info.agent ?? null
        const state = info.kind !== 'claude' ? null : /^[⠀-⣿◐◑◒◓]/.test(title) ? 'busy' : /^✳/.test(title) ? 'waiting' : prev?.state ?? null
        if (state === (prev?.state ?? null)) {
            return
        }
        const t = top(term)
        info.agent = state && {
            // Asking replaces "needs you": a tab that asks shows only that.
            state, since: Date.now(), needsYou: state === 'waiting' && prev?.state === 'busy' && !info.asking && !lookedAt(t),
            asking: info.asking ?? null, background: state === 'busy' ? null : info.background ?? null, compacting: info.compacting ?? null,
        }
        syncAgent(t)
    }
    /*
     * "Asking": the tabby-groups Claude plugin's hooks write <config>/tabby-groups/asking/<session id>.json while Claude
     * waits on a question (AskUserQuestion) or a permission, and remove it when that is over. A pane knows its session id
     * from Claude's own sessions/<pid>.json, so the file maps to the pane; the folder is watched, not polled.
     */
    const askingDir = require('path').join(process.env.CLAUDE_CONFIG_DIR || require('path').join(require('os').homedir(), '.claude'), 'tabby-groups', 'asking')
    function readAsking (sessionId) {
        try {
            const a = JSON.parse(require('fs').readFileSync(require('path').join(askingDir, sessionId + '.json'), 'utf8'))
            // source "text": the turn ended with a question in plain text, not a menu.
            return ['question', 'permission'].includes(a.kind) ? { kind: a.kind, since: a.since, ...a.source === 'text' ? { source: 'text' } : {} } : null
        } catch {
            return null
        }
    }
    function setAsking (pane, asking) {
        const info = pane.__tgInfo
        if (!info || JSON.stringify(info.asking ?? null) === JSON.stringify(asking)) {
            return
        }
        info.asking = asking
        info.agent = info.agent
            ? { ...info.agent, asking, needsYou: info.agent.needsYou && !asking }
            : asking && { state: 'waiting', since: asking.since, needsYou: false, asking, compacting: info.compacting ?? null }
        syncAgent(top(pane))
    }
    /*
     * "Compacting": the same plugin's PreCompact hook writes <config>/tabby-groups/compacting/<session id>.json, and
     * PostCompact removes it. A file older than 10 minutes is stale (Claude died mid-compaction).
     */
    const compactingDir = require('path').join(require('path').dirname(askingDir), 'compacting')
    const COMPACT_MAX = 10 * 60e3
    function readCompacting (sessionId) {
        try {
            const c = JSON.parse(require('fs').readFileSync(require('path').join(compactingDir, sessionId + '.json'), 'utf8'))
            return Date.now() - c.since < COMPACT_MAX ? { trigger: c.trigger === 'auto' ? 'auto' : 'manual', since: c.since } : null
        } catch {
            return null
        }
    }
    function setCompacting (pane, compacting) {
        const info = pane.__tgInfo
        if (!info || JSON.stringify(info.compacting ?? null) === JSON.stringify(compacting)) {
            return
        }
        clearTimeout(pane.__tgCmpTimer)
        if (compacting) {
            pane.__tgCmpTimer = setTimeout(() => setCompacting(pane, null), compacting.since + COMPACT_MAX - Date.now())
        }
        info.compacting = compacting
        info.agent = info.agent
            ? { ...info.agent, compacting }
            : compacting && { state: 'busy', since: compacting.since, needsYou: false, asking: info.asking ?? null, compacting }
        syncAgent(top(pane))
    }
    const stateWatches = [[askingDir, (p, id) => setAsking(p, readAsking(id))], [compactingDir, (p, id) => setCompacting(p, readCompacting(id))]].map(([dir, apply]) => {
        try {
            require('fs').mkdirSync(dir, { recursive: true })
            return require('fs').watch(dir, (event, file) => {
                const id = file?.replace(/\.json$/, '')
                app.tabs.flatMap(t => t.getAllTabs?.() ?? [t]).filter(p => id && p.__tgInfo?.sessionId === id).forEach(p => apply(p, id))
            })
        } catch {
            return null
        }
    })

    /*
     * "Running in background", from the process tree only. Claude runs a Bash command as its direct child
     * `bash -c "source …/shell-snapshots/… eval '<command>' …"`, and a PowerShell command as `cmd /c "… pwsh … -Command …
     * CLAUDE_CODE_SHELL_LAUNCHER_SCRIPT …"`. Such a child alive while Claude is not busy is a background task; it exits
     * with the task, while a daemon the task left behind is no such child. Never open a task's output file to test it: an
     * exclusive open breaks Claude's own read of that file (EBUSY).
     */
    const taskShells = (procs, claudePid) => procs.filter(p => p.ppid === claudePid && (
        (/^(ba|z)?sh(\.exe)?$/.test(p.name) && p.raw.includes('shell-snapshots') && p.raw.includes("eval '"))
        || p.raw.includes('CLAUDE_CODE_SHELL_LAUNCHER_SCRIPT')))
    /** The task's command, from its eval '…' (Bash); a PowerShell command keeps its script in the environment. */
    const taskLabel = p => {
        const m = /eval '((?:[^']|'\\'')*)'/.exec(p.raw)
        return m ? m[1].replace(/'\\''/g, "'").replace(/\s+/g, ' ').trim().slice(0, 24) : 'PowerShell'
    }
    function setBackground (pane, tasks) {
        const info = pane.__tgInfo
        const ids = tasks.map(t => String(t.pid))
        // While a task lives, look again every 3 s, so the badge goes soon after it ends; nothing polls otherwise.
        clearTimeout(pane.__tgBgTimer)
        if (ids.length && !disposed) {
            pane.__tgBgTimer = setTimeout(() => inspect(pane), 3000)
        }
        if ((info.background?.ids?.join() ?? '') === ids.join()) {
            return
        }
        info.background = ids.length ? { count: ids.length, since: info.background?.since ?? Date.now(), ids, labels: tasks.map(taskLabel) } : null
        const shown = info.agent?.state === 'busy' ? null : info.background
        info.agent = info.agent
            ? { ...info.agent, background: shown }
            : shown && { state: 'waiting', since: Date.now(), needsYou: false, asking: info.asking ?? null, background: shown, compacting: info.compacting ?? null }
        syncAgent(top(pane))
    }

    const mergeBackground = list => list.length
        ? { count: list.reduce((n, b) => n + b.count, 0), since: Math.min(...list.map(b => b.since)), ids: list.flatMap(b => b.ids), labels: list.flatMap(b => b.labels) }
        : null
    /** The top tab's agent: busy if any pane works, needs you if any pane does. Emits tabby-groups:agent. */
    function syncAgent (t) {
        const panes = (t.getAllTabs?.() ?? [t]).map(p => p.__tgInfo?.agent).filter(Boolean)
        const busy = panes.filter(a => a.state === 'busy')
        const asking = panes.find(a => a.asking)?.asking ?? null
        const agent = panes.length ? {
            state: busy.length ? 'busy' : 'waiting',
            since: Math.max(...(busy.length ? busy : panes).map(a => a.since)),
            needsYou: !asking && panes.some(a => a.needsYou),
            asking,
            background: busy.length ? null : mergeBackground(panes.map(a => a.background).filter(Boolean)),
            compacting: panes.find(a => a.compacting)?.compacting ?? null,
        } : null
        // A split tab keeps the roll-up of its panes; a single pane already holds its own.
        if (!(t.getAllTabs?.() ?? [t]).includes(t)) {
            ;(t.__tgInfo ??= {}).agent = agent
        }
        window.dispatchEvent(new CustomEvent('tabby-groups:agent', { detail: { tab: t } }))
        queueRender()
    }
    /** Clears "needs you" on a tab: called when it is selected in a focused Tabby, and by tabby-remote when a device opens it. */
    function markSeen (tab) {
        const t = top(tab)
        t.__tgSeen = Date.now()
        const panes = (t.getAllTabs?.() ?? [t]).filter(p => p.__tgInfo?.agent?.needsYou)
        panes.forEach(p => { p.__tgInfo.agent = { ...p.__tgInfo.agent, needsYou: false } })
        if (panes.length) {
            syncAgent(t)
        }
    }
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
            // A restored pane brings its resume command as a tab input.
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
        iconEl?.classList.toggle('tg-busy', agent?.state === 'busy')
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

    const subs = [
        app.tabOpened$.subscribe(watch),
        app.tabOpened$.subscribe(tab => {
            const path = tab.__tgRestore
            if (!path) {
                return
            }
            delete tab.__tgRestore
            path.forEach((p, k) => ensureGroup(p.name, { color: p.color, parent: path[k - 1]?.name ?? null }))
            // Joining a group clears a local pin, so the restored one is put back afterwards.
            const localPin = !!tab.__tgPinned
            addTab(tab, path[path.length - 1].name, { restore: true })
            tab.__tgPinned = localPin
            path.forEach(p => Object.assign(groups.get(p.name), { collapsed: p.collapsed, pinned: !!p.pinned }))
        }),
        app.tabsChanged$.subscribe(() => {
            normalize()
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
            } else {
                endDrop()
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
    const dropLine = Object.assign(document.createElement('div'), { className: 'tg-drop-line' })

    /** The tab for a tab-header row; during a drag Tabby's placeholder stands in the dragged tab's place, so order holds. */
    const tabOfRow = row => app.tabs[[...row.parentElement.querySelectorAll(':scope > tab-header')].indexOf(row)]

    function rowAt (x, y) {
        for (const el of document.elementsFromPoint(x, y)) {
            if (el.closest('.cdk-drag-preview')) {
                continue
            }
            const row = el.closest('.tabs > tab-header, .tabs > .tg-header, .tabs > .tg-foot')
            if (row) {
                return row
            }
        }
        return null
    }

    // Where a drop would land: the middle of a tab groups with it, its edges insert next to it; a group header's lower
    // half is "first in the group" and its upper half "just above it"; a subgroup footer's halves are "last in it" and "just below it".
    function onDragMove (e) {
        const row = rowAt(e.clientX, e.clientY)
        dropIntent = null
        // A dragged group cannot land among its own rows.
        const own = row && draggedGroup && (row.matches('tab-header') ? inGroup(tabOfRow(row), draggedGroup.name) : chainOf(row.dataset.group).includes(draggedGroup))
        if (row && !row.matches('.cdk-drag-placeholder') && !own) {
            const r = row.getBoundingClientRect()
            const f = (e.clientY - r.top) / r.height
            if (row.matches('tab-header')) {
                const tab = tabOfRow(row)
                if (tab && tab !== draggedTab) {
                    // A group dropped on a tab goes next to it; no folder of a group and a tab.
                    // A subgroup needs a tab of its own beside it in the parent, or the parent would hold nothing but the subgroup.
                    const lone = tab.__tg && !members(tab.__tg).some(t => t !== tab && t !== draggedTab)
                    const where = draggedGroup || lone ? (f < 0.5 ? 'before' : 'after') : f < 0.25 ? 'before' : f > 0.75 ? 'after' : 'onto'
                    dropIntent = { row, tab, where }
                }
            } else if (groups.has(row.dataset.group)) {
                const g = groups.get(row.dataset.group)
                dropIntent = row.matches('.tg-header')
                    ? { row, group: g, where: f < 0.5 ? 'above' : 'first' }
                    : { row, group: g, where: f < 0.5 ? 'last' : 'below' }
            }
        }
        showDropMark()
    }

    function showDropMark () {
        document.querySelectorAll('.tg-drop-onto').forEach(e => e.classList.remove('tg-drop-onto'))
        const i = dropIntent
        if (!i || i.where === 'onto') {
            dropLine.remove()
            i?.row.classList.add('tg-drop-onto')
            return
        }
        const r = i.row.getBoundingClientRect()
        let y = ['after', 'first', 'below'].includes(i.where) ? r.bottom : r.top
        // The last tab of a panel holds the panel's bottom gap as padding; the line marks the tab's own edge, above that gap.
        if (i.where === 'after' && i.row.matches('.tg-last')) {
            y -= parseFloat(getComputedStyle(i.row).paddingBottom) || 0
        }
        Object.assign(dropLine.style, { left: r.left + 6 + 'px', width: r.width - 12 + 'px', top: y - 1 + 'px' })
        document.body.appendChild(dropLine)
    }

    const onDragKey = e => {
        if (e.key === 'Escape') {
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
        if (tab && i && moved && app.tabs.includes(tab) && i.tab !== tab) {
            applyDrop(tab, i)
        }
    }

    function placeTab (tab, anchor, after) {
        if (!anchor || anchor === tab) {
            return
        }
        let target = app.tabs.indexOf(anchor) + (after ? 1 : 0)
        if (app.tabs.indexOf(tab) < target) {
            target--
        }
        app.moveTabToIndex(tab, target)
    }

    function applyDrop (tab, i) {
        const join = name => {
            setMembership(tab, name)
            chainOf(name).forEach(g => { g.collapsed = false })
        }
        const place = (anchor, after) => placeTab(tab, anchor, after)
        const others = g => subtree(g.name).filter(t => t !== tab)
        if (i.where === 'onto') {
            // Two tabs make a new group, like an iPhone folder: at the top level, or as a subgroup where the target tab is.
            const g = ensureGroup(newGroupName(), { parent: i.tab.__tg ?? null })
            // A new top-level group made on a pinned tab stays pinned, so the tab keeps its pin.
            g.pinned = !g.parent && !!i.tab.pinned
            i.tab.__tg = g.name
            join(g.name)
            place(i.tab, true)
        } else if (i.tab) {
            join(i.tab.__tg ?? null)
            place(i.tab, i.where !== 'before')
        } else if (i.where === 'first' || i.where === 'above') {
            join(i.where === 'first' ? i.group.name : i.group.parent)
            place(others(i.group)[0], false)
        } else {
            join(i.where === 'last' ? i.group.name : i.group.parent)
            place(others(i.group).at(-1), true)
        }
        prune()
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
            const i = dropIntent
            draggedGroup = dropIntent = null
            ghost.remove()
            h.classList.remove('tg-dragging')
            showDropMark()
            // The click that ends a drag must not also collapse the group. It fires before any timer.
            const swallow = ev => ev.stopPropagation()
            document.addEventListener('click', swallow, true)
            setTimeout(() => document.removeEventListener('click', swallow, true))
            if (i && groups.has(g.name)) {
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
        const g = source?.group !== undefined ? groups.get(source.group) : null
        const tab = tabOf(source)
        const tg = target?.group !== undefined ? groups.get(target.group) : null
        const tt = tabOf(target)
        if ((!g && !tab) || (!tg && !tt)) {
            return false
        }
        if (tt) {
            const lone = tt.__tg && !members(tt.__tg).some(t => t !== tt && t !== tab)
            if (tt === tab || !['before', 'after', 'onto'].includes(where) || (where === 'onto' && (g || lone)) || (g && inGroup(tt, g.name))) {
                return false
            }
        } else if (!['above', 'first', 'last', 'below'].includes(where) || (g && chainOf(tg.name).includes(g))) {
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
        } else {
            const rest = subtree(i.group.name).filter(t => !ms.includes(t))
            const inside = i.where === 'first' || i.where === 'last'
            after = i.where === 'last' || i.where === 'below'
            parent = inside ? i.group.name : i.group.parent
            anchor = after ? rest.at(-1) : rest[0]
        }
        if (!setParent(g.name, parent, false)) {
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
        document.querySelectorAll('.tg-header, .tg-foot, .tg-icon, .tg-cwd, .tg-tab-pin, .tg-presence').forEach(e => e.remove())
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
        document.removeEventListener('mouseover', onTipOver, true)
        document.removeEventListener('mouseout', onTipOut, true)
        document.removeEventListener('mousedown', hideTip, true)
        hideTip()
        subs.forEach(s => s.unsubscribe())
        observer.disconnect()
        stateWatches.forEach(w => w?.close())
        userIconsWatch?.close()
        buttonTimers.forEach(clearInterval)
        buttonsEl.remove()
        hideToast()
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
    async function open ({ title, command, args, cwd, run, group, parent, color } = {}) {
        if (!command) {
            ;({ command, args } = await defaultShell() ?? (IS_WIN ? { command: 'powershell.exe', args: ['-NoLogo'] } : { command: process.env.SHELL || '/bin/zsh', args: [] }))
        }
        const inner = await injector.get(core.ProfilesService).openNewTabForProfile({
            type: 'local', name: title ?? command, options: { command, args, cwd, env: {} },
        })
        const tab = app.getParentTab(inner) ?? inner
        if (title) {
            tab.setCustomTitle(title)
        }
        if (group) {
            addTab(tab, group, { ...parent !== undefined && { parent }, ...color !== undefined && { color } })
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
    window.__tabbyGroups = { version: 1, open, addTab, removeTab, setCollapsed, setColor, setPinned, setTabPinned, setParent, rename, ungroup, list, drop, markSeen, icons, buttons, dispose }
    return window.__tabbyGroups
}

class TabbyGroupsModule {
    constructor (injector) {
        install(injector)
    }
}
TabbyGroupsModule.ctorParameters = () => [{ type: Injector }]

module.exports = NgModule({})(TabbyGroupsModule)
module.exports.default = module.exports
module.exports.install = install
