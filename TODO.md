# D365 Edge Helper — Implementation Tasks

Legend: ✅ done · 🔧 partial / needs fixing · [ ] not started

---

## Phase 1 — Extension Skeleton ✅

- ✅ `manifest.json` — MV3, permissions, icons, popup, content script, background service worker, `Alt+Shift+D` command
- ✅ `shared/storage.js` — `getStorage`, `saveEnvironment`, `deleteEnvironment`, `getDefaults`, `saveDefaults`, `getCustomCommands`, `saveCustomCommands`
- ✅ Icon PNGs — purple "D" placeholder at 16 × 16, 32 × 32, 48 × 48, 128 × 128

---

## Phase 2 — Popup (Screens 1–3) ✅

- ✅ `popup/popup.html` — three views (env list, add/edit form, settings) in one file; only active view visible
- ✅ `popup/popup.css` — full Fluent v2 token set, light + dark (`prefers-color-scheme` / `[data-theme]`), all component styles
- ✅ `popup/utils.js` — `escHtml`, colour math, toggle helpers, position-picker helpers (shared across views)
- ✅ `popup/views/env-list.js` — search/filter, render, click to edit / Ctrl+click to navigate / Shift+click new window; stacked name+URL layout; chevron
- ✅ `popup/views/env-form.js` — add/edit form, colour picker (SV square + hue slider + 16 presets + hex input), all toggles, position picker, save/delete; colour stored as hex; new environments cycle through unused preset colours
- ✅ `popup/views/settings.js` — global defaults; Configuration section with full import/export and per-list (menu items / tables / OData entities) import/export with deduplication and status messages
- ✅ `popup/popup.js` — thin orchestrator: theme, `showView`, wires views together with callbacks

---

## Phase 3 — Background Service Worker ✅

- ✅ `background/background.js` — listens for `open-palette` command, relays to active tab content script (try/catch for non-D365 tabs)
- ✅ Seeds `defaults/*.json` into `customCommands` storage on install/update via `mergeByKey` (deduplicates existing + new)

---

## Phase 4 — Content Script (Palette + Marker) ✅

- ✅ Receives `OPEN_PALETTE` message → shows overlay; Esc captured with `stopPropagation` so D365 never sees it
- ✅ Palette UI — search input, grouped results, keyboard nav (↑ ↓ Enter Ctrl+Enter Esc); themed scrollbar
- ✅ Multi-term partial search — query split on whitespace; all terms must match anywhere in label; each term highlighted independently
- ✅ Commands reload from storage on open and on `storage.onChanged`
- ✅ Defaults architecture — `defaults/menu-items.json`, `defaults/tables.json`, `defaults/odata-entities.json`; content script reads storage only, no hardcoded fallbacks
- ✅ Environment marker — diagonal corner ribbon with env name; colour, corner, and size configurable; synced on storage change
- ✅ Menu item handler — two-line display (friendly name + full path); navigates to `?mi=` using explicit `mi` field
- ✅ OData entity handler — navigates to `/data/<entity>?cross-company=true`
- ✅ Table handler — navigates to `?mi=SysTableBrowser&tableName=<label>`
- ✅ Prefix scoping — `>` commands, `/` menu items, `|` OData entities, `#` tables
- ✅ **"Open in other environment…"** — inline env-picker sub-mode; keyboard navigable; colour-matched pips; always opens in new tab; Esc returns to main palette with previous query restored

### Remaining gaps

- 🔧 **Orphaned handlers in `executeItem`** — dead code exists for `Copy current URL`, `Open class runner`, `Personalisations › Clear all`, and `User options`. Either add them to `BUILT_IN_COMMANDS` or delete the handlers.

---

## Phase 5 — Settings: Custom Commands UI 🔧

The import/export approach is in place. A full in-popup row editor is not yet built.

- ✅ Per-list import from JSON (menu items, tables, OData entities) — validate, deduplicate, write, show status
- ✅ Per-list export to JSON — downloads current list as a file
- ✅ Full configuration export includes `customCommands` alongside environments and defaults
- ✅ `tools/export-menu-items.sql` — SQL snippet for extracting D365 menu items from the database
- [ ] In-UI row editor — add / remove individual menu items, tables, OData entities directly in the Settings view without needing to import a JSON file

---

## Phase 6 — Polish & QA [ ]

- [ ] Dark mode — verify all tokens switch correctly; palette matches OS preference
- [ ] Popup size — `min-width: 320px`; verify no collapse in Edge
- [ ] Keyboard-only flow through all screens (Tab, Enter, Escape)
- [ ] Duplicate URL detection on environment save
- [ ] Test install as unpacked in Edge; verify all screens load without console errors
- [ ] Test `Alt+Shift+D` on a live D365 URL (or a page that matches `*.operations.dynamics.com`)
- [ ] Test export / import round-trip (export, clear storage, import, verify environments restored)
- [ ] Test environment marker appears and updates when toggling in the popup

---

## Out of Scope (for now)

- Cloud sync (`chrome.storage.sync`)
- Automated tests / CI
- Web store / Edge Add-ons marketplace packaging
