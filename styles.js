// The palette, the panel tint maths and the plugin's stylesheet.
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
.tg-count { font-size: 11px; color: #d8d8d8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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
/* An empty group's slim row, in its panel like a tab (paintNesting colours it below the top level). */
.tabs-on-left .tg-empty, .tabs-on-right .tg-empty {
    flex: none; margin: 0 calc(var(--tg-gap) * (1 + var(--tg-level, 0))); padding: 4px 12px 6px; font-size: 11px; font-style: italic;
    color: #9a9a9a; background-color: color-mix(in srgb, var(--tg-color) 20%, var(--tg-bg));
}
.tabs.tg-light.tg-light .tg-empty { color: #666666; }
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
/* A Claude tab with inbox messages not yet taken: a blue badge at the icon's top-right. */
.tg-icon > .tg-mail {
    position: absolute; top: -5px; right: -7px; width: 12px; height: 12px; border-radius: 50%;
    background: #7ab8ff; color: #111; font-size: 7px; line-height: 12px; text-align: center;
    box-shadow: 0 0 0 2px var(--tg-bg, #0d0d0d);
}
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
.tabs > tab-header.tg-drop-onto, .tabs > .tg-empty.tg-drop-onto { outline: 2px solid #86b7f7; outline-offset: -2px; border-radius: 6px; }
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
.tg-item:hover, .tg-item.tg-active { background: #2e2e2e; }
.tg-picker > div { max-height: 60vh; overflow-y: auto; }
.tg-picker-q { width: 100%; margin-bottom: 4px; padding: 5px 8px; border: 1px solid #333; border-radius: 4px; background: #161616; color: inherit; font: inherit; outline: none; }
.tg-item.tg-on::after { content: ' ✓'; opacity: .7; }
.tg-label { padding: 4px 10px; font-size: 11px; opacity: .6; }

/*
 * A narrow side bar (under 130px) keeps only the icons, their badges, the panel colours and, while they fit, the numbers.
 * Tabby's own tooltip still shows a tab's full title, and a group header's data-tg-tip its name.
 */
.tabs-on-left > .tab-bar, .tabs-on-right > .tab-bar { container: tg-side / inline-size; }
@container tg-side (max-width: 129px) {
    .tabs { --tg-gap: 3px !important; }
    .tg-toolbar, .tg-search, .tg-presence, .tabs > tab-header > .buttons, .tg-tab-pin, .tabs > tab-header > .pin-indicator,
    .tg-header .tg-text, .tg-header .tg-add, .tg-header .tg-pin { display: none !important; }
    .tab-bar > .tabs + .btn-group { grid-column: 1 / -1 !important; flex-wrap: wrap; justify-content: center; }
    .tab-bar > .btn-group { flex-wrap: wrap; justify-content: center; min-width: 0; }
    .tabs > tab-header { justify-content: center; padding-left: 0 !important; padding-right: 0 !important; min-width: 0 !important; }
    /* The name stays as an invisible layer over the row, so the row still drags. */
    .tabs > tab-header > .name { position: absolute !important; inset: 0; margin: 0 !important; padding: 0 !important; font-size: 0 !important; }
    .tg-cwd { display: none; }
    .tabs > tab-header > .index { flex: none; width: auto !important; min-width: 0 !important; margin: 0 2px 0 0 !important; }
    .tg-icon { margin: 0 4px; }
    .tabs-on-left .tabs > tab-header.tg-two-line, .tabs-on-right .tabs > tab-header.tg-two-line { flex-basis: var(--tabs-height) !important; }
    .tabs-on-left .tabs > tab-header.tg-member.tg-last.tg-two-line, .tabs-on-right .tabs > tab-header.tg-member.tg-last.tg-two-line { flex-basis: calc(var(--tabs-height) + var(--tg-gap)) !important; }
    .tg-header, .tg-inner { justify-content: center; padding-left: 0 !important; padding-right: 0 !important; }
}
@container tg-side (max-width: 71px) {
    .tabs > tab-header > .index { display: none !important; }
}
`

module.exports = { COLORS, NO_COLOR, tintPct, shaded, ACTIVE_TINT_ADD, CSS }
