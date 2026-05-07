# D365 Edge Helper — Extension

## What This Is

A Microsoft Edge browser extension (Manifest V3) for Dynamics 365 Finance & Operations consultants. It lets users manage multiple D365 environments from the toolbar and run keyboard-driven commands without touching the mouse.

## Project Structure

```
/
├── manifest.json             # MV3 manifest
├── popup/
│   ├── popup.html            # Toolbar popup (screens 1–3: env list, add/edit, settings)
│   ├── popup.js              # Popup logic
│   └── popup.css             # Popup styles (Fluent v2 tokens)
├── content/
│   ├── content_script.js     # Injected into D365 pages; palette + marker
│   └── content_script.css    # Palette styles
├── background/
│   └── background.js         # Service worker: storage relay, URL routing, shortcut handling
├── assets/
│   ├── icons/                # Extension icons (16/32/48/128 px PNG)
│   └── icons/                # Extension icons (16/32/48/128 px PNG) — purple "D" placeholder
└── shared/
    └── storage.js            # Typed helpers around chrome.storage.local
```

## Key Constraints

- **Manifest V3** — service worker in `background/background.js`, no persistent background page.
- **No cloud sync** — `chrome.storage.local` only. Never use `chrome.storage.sync`.
- **No external dependencies at runtime** — pure HTML/CSS/JS, no bundler required. Keep it loadable as an unpacked extension.
- **Pixel-perfect Fluent v2** — all colours, spacing, radii, and typography come from the design tokens defined in `DESIGN_TOKENS.md` (below). Do not deviate.

## Design Tokens (copy-paste ready as CSS custom properties)

### Light theme (default)
```css
--bg-page: #f3f3f3;
--bg-popup: #ffffff;
--bg-subtle: #fafafa;
--bg-hover: #f5f5f5;
--bg-active: #ebebeb;
--bg-input: #ffffff;
--stroke: #e0e0e0;
--stroke-strong: #d1d1d1;
--stroke-input: #d1d1d1;
--stroke-input-bottom: #616161;
--text-primary: #1b1b1b;
--text-secondary: #616161;
--text-tertiary: #8a8a8a;
--text-disabled: #bdbdbd;
--accent: #0f6cbd;
--accent-hover: #115ea3;
--accent-pressed: #0c3b5e;
--accent-tint: #ebf3fc;
--shadow-popup: 0 8px 16px rgba(0,0,0,0.14), 0 0 2px rgba(0,0,0,0.12);
```

### Dark theme (`[data-theme="dark"]`)
```css
--bg-page: #1f1f1f;
--bg-popup: #2b2b2b;
--bg-subtle: #292929;
--bg-hover: #333333;
--bg-active: #3d3d3d;
--bg-input: #383838;
--stroke: #3d3d3d;
--stroke-strong: #4a4a4a;
--stroke-input: #5c5c5c;
--stroke-input-bottom: #adadad;
--text-primary: #ffffff;
--text-secondary: #c7c7c7;
--accent: #2899f5;
--accent-hover: #479ef5;
--accent-tint: #082338;
--shadow-popup: 0 8px 16px rgba(0,0,0,0.36), 0 0 2px rgba(0,0,0,0.24);
```

### Typography
- Font stack: `"Segoe UI Variable", "Segoe UI", system-ui, sans-serif`
- Monospace (hex inputs, shortcuts): `Consolas, "SF Mono", ui-monospace, monospace`

| Usage | Size | Weight |
|---|---|---|
| Popup title | 14px | 600 |
| Subtitle / hints | 11px | 400 |
| Body / list items | 13px | 400 |
| Form labels | 12px | 600 |
| Section headings | 11px | 600 (uppercase, letter-spacing: 0.6px) |
| Palette input | 14px | 400 |

## Storage Schema

```js
// chrome.storage.local keys
{
  environments: [
    {
      id: "uuid-v4",
      name: "Contoso UAT",
      url: "https://contoso-uat.operations.dynamics.com",
      color: "#0f6cbd",
      tableBrowser: false,
      showControlNames: false,
      classRunner: false,
      markerEnabled: false,
      markerPosition: "top-left"  // "top-left" | "top-right" | "bottom-left" | "bottom-right"
    }
  ],
  defaults: {
    tableBrowser: false,
    showControlNames: false,
    classRunner: false,
    markerEnabled: false,
    markerPosition: "top-left"
  },
  customCommands: {
    // User-defined palette entries. Both arrays start empty; the palette falls back to
    // commented-out examples in content_script.js until the user populates these.
    menuItems: [
      // { label: "Accounts payable › Vendors › All vendors", mi: "VendTableListPage" }
    ],
    odataEntities: [
      // { label: "VendVendorV2" }
    ],
    tables: [
      // { label: "CustTable" }  — opens in table browser: ?mi=SysTableBrowser&tableName=CustTable
    ]
  },
  version: 1
}
```

## Screens Summary

| Screen | File | Trigger |
|---|---|---|
| 1 — Environment list | popup.html (default view) | Toolbar icon click |
| 2 — Add / Edit environment | popup.html (form view) | "+ Add environment" or chevron on row |
| 3 — Settings | popup.html (settings view) | `···` overflow menu |
| 4 — Command palette | content_script (overlay) | `Ctrl+Shift+E` on any D365 tab |

## Manifest V3 Specifics

- `action.default_popup` → `popup/popup.html`
- Content script matches: `https://*.operations.dynamics.com/*`
- Background service worker: `background/background.js`
- `commands`: `"open-palette"` with suggested key `Ctrl+Shift+E`
- Permissions: `storage`, `tabs`, `activeTab`

## Development

Load as unpacked extension in Edge:
1. `edge://extensions/` → enable Developer mode
2. "Load unpacked" → select project root

No build step required — all files are plain HTML/CSS/JS.

## Reference

Design prototype: `/tmp/d365_handoff/design_handoff_d365_edge_helper/D365 Edge Helper.html` (local only, not committed)
