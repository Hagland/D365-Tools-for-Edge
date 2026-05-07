# D365 Edge Helper

A Microsoft Edge browser extension for Dynamics 365 Finance & Operations consultants and power users. It adds a toolbar popup for managing multiple D365 environments and a keyboard-driven command palette for navigating D365 without touching the mouse.

## Features

- **Environment switcher** — save multiple D365 environments with a name, URL, and colour code. Click to navigate, Ctrl+click to open in a new tab, Shift+click to open in a new window.
- **Environment marker** — an optional coloured stripe injected into the D365 page so you always know which environment you are in (configurable per environment, positioned at any corner).
- **Command palette** (`Alt+Shift+D`) — a VS Code-style overlay for running commands, navigating to D365 menu items, and opening OData entity endpoints. Fully keyboard-driven.
- **Custom commands** — extend the palette with your own menu items and OData entities stored in `chrome.storage.local`.
- **Import / export** — back up and restore all environments and settings as a JSON file.
- **Dark mode** — follows the OS `prefers-color-scheme` setting automatically.
- **No cloud sync, no external dependencies** — all data stays in the browser's local storage.

## Project structure

```
manifest.json           MV3 manifest
popup/
  popup.html            Toolbar popup (env list, add/edit form, settings)
  popup.js              View router and wiring
  popup.css             Fluent v2 design tokens and all component styles
  utils.js              Shared DOM helpers, colour math, toggle/position helpers
  views/
    env-list.js         Screen 1 — environment list
    env-form.js         Screen 2 — add / edit environment form + colour picker
    settings.js         Screen 3 — global defaults, import, export
content/
  content_script.js     Command palette overlay + environment marker
  content_script.css    Palette styles
background/
  background.js         Service worker — relays keyboard shortcut to content script
shared/
  storage.js            Typed helpers around chrome.storage.local
assets/
  icons/                Extension icons at 16, 32, 48, 128 px
```

## Loading the extension in Edge

No build step is required. Load it directly as an unpacked extension:

1. Open `edge://extensions/`
2. Enable **Developer mode** (toggle, top-right)
3. Click **Load unpacked** and select the repository root
4. The **D365 Edge Helper** icon appears in the toolbar

To reload after editing a source file, click the refresh icon on the extension card in `edge://extensions/`, or use the **Reload** button that appears when the extension has been modified.

## Keyboard shortcut

The command palette is bound to `Alt+Shift+D` by default (set in `manifest.json` under `commands`). If that conflicts with another shortcut you can reassign it at `edge://extensions/shortcuts`.

## Customising the command palette

The palette ships with a small set of built-in commands. To add your own menu items and OData entities, write to the `customCommands` key in `chrome.storage.local`:

```json
{
  "menuItems": [
    { "label": "Accounts payable › Vendors › All vendors", "mi": "VendTableListPage" }
  ],
  "odataEntities": [
    { "label": "VendVendorV2" }
  ]
}
```

`mi` is the internal D365 menu item name visible in the URL (`?mi=…`). The entity label must match the exact OData entity set name. A UI for managing these entries is planned (see `TODO.md`).

## Storage schema

All data is stored in `chrome.storage.local` (never synced to the cloud):

```js
{
  environments:   Environment[],   // saved environments, ordered
  defaults:       DefaultSettings, // pre-populated when adding a new environment
  customCommands: {
    menuItems:      [{ label, mi }],
    odataEntities:  [{ label }],
  },
  version:        1
}
```

## Contributing

This is a plain HTML/CSS/JS project with no build tooling. Edit source files and reload the unpacked extension in Edge to see changes. See `TODO.md` for the current task list.
