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
- ✅ `popup/views/env-list.js` — search/filter, render, navigate (click / Ctrl+click / Shift+click), chevron expand, quick links, edit button
- ✅ `popup/views/env-form.js` — add/edit form, colour picker (SV square + hue slider + 16 presets + hex input), all toggles, position picker, save/delete
- ✅ `popup/views/settings.js` — global defaults, export to JSON, import from JSON with inline status message
- ✅ `popup/popup.js` — thin orchestrator: theme, `showView`, wires views together with callbacks

---

## Phase 3 — Background Service Worker ✅

- ✅ `background/background.js` — listens for `open-palette` command, relays to active tab content script

---

## Phase 4 — Content Script (Palette + Marker) 🔧

- ✅ Receives `OPEN_PALETTE` message → shows overlay
- ✅ Palette UI — search input, grouped results, keyboard nav (↑ ↓ Enter Ctrl+Enter Esc)
- ✅ Substring filter across all categories simultaneously; matched chars highlighted in accent + bold
- ✅ Commands reload from storage on open and on `storage.onChanged`
- ✅ Dynamic command list — `customCommands` storage key merged with built-ins at runtime
- ✅ Environment marker — coloured stripe injected at configured corner, synced on storage change
- ✅ Menu item handler — navigates to `?mi=` using explicit `mi` field (falls back to last label segment)
- ✅ OData entity handler — navigates to `/data/<entity>?cross-company=true`

### Gaps to fix

- 🔧 **"Open in other environment…"** — listed in `BUILT_IN_COMMANDS` but `executeItem` has no handler for it; falls through silently. Needs a sub-list of saved environments to pick from.
- 🔧 **`DEFAULT_TABLES`** — declared in `content_script.js` by the user but not wired into `loadCommands()`, `TYPE_META`, or `CATEGORY_ORDER`. Wire it up or remove it.
  - Add `table` entry to `TYPE_META` (colour TBD) and `CATEGORY_ORDER`
  - Load `custom.tables` from storage in `loadCommands()`
  - Add handler in `executeItem` (likely navigates to table browser filtered to that table name)
  - Add `tables` array to `customCommands` schema in `shared/storage.js` and `CLAUDE.md`
- 🔧 **Orphaned handlers in `executeItem`** — handlers exist for `Copy current URL`, `Open class runner`, `Personalisations › Clear all`, and `User options` but these were removed from `BUILT_IN_COMMANDS`. Either restore them to the command list or delete the handlers.

---

## Phase 5 — Settings: Custom Commands UI [ ]

Currently the only way to add custom menu items, OData entities, and tables is to write directly to `chrome.storage.local`. A UI in the Settings view is needed.

- [ ] Add a "Custom commands" section to Screen 3 (Settings)
- [ ] Menu items editor — add / remove rows, each row has a label field and a `mi` field
- [ ] OData entities editor — add / remove rows, each row has a label field
- [ ] Tables editor — add / remove rows, each row has a label field
- [ ] Import from JSON file — same pattern as environment import (validate, write, show status)
- [ ] Export to JSON — bundle `customCommands` alongside environments in the existing export, or offer a separate download

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
