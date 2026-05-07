// Content script: command palette overlay + environment marker

// ── Built-in commands (hardcoded handlers, not user-configurable) ─
// TODO: Example actions for now
const BUILT_IN_COMMANDS = [
  { type: 'command', label: 'Open in other environment…' },
  { type: 'command', label: 'Open table browser' },
  { type: 'command', label: 'Show control names' },
  { type: 'command', label: 'Open database log' },
];

// ── Placeholder examples — replace or extend via Settings > Custom commands ─
// TODO: Remove these examples and add your real menu items and OData entities
//       via the extension settings, or by editing customCommands in storage directly.
//       Menu items need a `mi` value — the internal D365 menu item name (e.g. 'VendTableListPage').
//       OData entities need a `label` matching the exact entity set name (e.g. 'VendVendorV2').
//       Tables need a 'label' matching the exact table name (e.g. 'CustTable').

const DEFAULT_MENU_ITEMS = [
  // { label: 'Example module › Example area › Example page', mi: 'ExampleMenuItemName' },
];

const DEFAULT_ODATA_ENTITIES = [
  // { label: 'ExampleTable' },
];

const DEFAULT_TABLES = [
  // { label: 'CustTable' },
];

// ── Runtime command list (built-ins + storage-loaded custom entries) ─
let allCommands = [...BUILT_IN_COMMANDS];

async function loadCommands() {
  const data = await new Promise((resolve) =>
    chrome.storage.local.get(['customCommands'], resolve)
  );
  const custom = data.customCommands ?? {};

  const menuItems = (custom.menuItems?.length ? custom.menuItems : DEFAULT_MENU_ITEMS)
    .map((item) => ({ type: 'menu', label: item.label, mi: item.mi }));

  const odataEntities = (custom.odataEntities?.length ? custom.odataEntities : DEFAULT_ODATA_ENTITIES)
    .map((item) => ({ type: 'odata', label: item.label }));

  const tables = (custom.tables?.length ? custom.tables : DEFAULT_TABLES)
    .map((item) => ({ type: 'table', label: item.label }));

  allCommands = [...BUILT_IN_COMMANDS, ...menuItems, ...odataEntities, ...tables];
}

const TYPE_META = {
  command: { label: 'Commands',       color: '#0f6cbd' },
  menu:    { label: 'Menu items',     color: '#107c41' },
  odata:   { label: 'OData entities', color: '#8764b8' },
  table:   { label: 'Tables',         color: '#038387' },
};

const CATEGORY_ORDER = ['command', 'menu', 'odata', 'table'];

// Prefix characters that scope the palette to a single category (VS Code-style)
const PREFIX_MAP = {
  '>': 'command',
  '/': 'menu',
  '|': 'odata',
  '#': 'table',
};

function parseQuery(raw) {
  const type = PREFIX_MAP[raw[0]];
  if (type) return { filter: raw.slice(1), types: [type] };
  return { filter: raw, types: CATEGORY_ORDER };
}

let palette = null;
let activeIdx = 0;
let filteredResults = [];

// ── Message listener ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'OPEN_PALETTE') togglePalette();
});

// Reload commands and re-render if the palette is open when storage changes
chrome.storage.onChanged.addListener(async (changes) => {
  if ('customCommands' in changes) {
    await loadCommands();
    if (palette) renderResults(document.getElementById('d365-palette-search')?.value ?? '');
  }
  syncMarker();
});

async function togglePalette() {
  if (palette) {
    closePalette();
  } else {
    await loadCommands();
    openPalette();
  }
}

function openPalette() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  palette = document.createElement('div');
  palette.id = 'd365-palette-overlay';
  palette.dataset.theme = prefersDark ? 'dark' : 'light';
  palette.innerHTML = `
    <div class="d365-palette" role="dialog" aria-label="Command palette" aria-modal="true">
      <div class="d365-palette-input-row">
        <svg class="d365-search-icon" viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5"/>
          <line x1="11" y1="11" x2="14.5" y2="14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <input id="d365-palette-search" type="text" placeholder="Search…  > commands  / menus  | odata  # tables" autocomplete="off" spellcheck="false" />
        <kbd class="d365-esc-badge">Esc</kbd>
      </div>
      <ul id="d365-palette-results" class="d365-palette-results" role="listbox"></ul>
      <div class="d365-palette-footer">
        <span>&#8593; &#8595; navigate</span>
        <span>&#8629; open</span>
        <span>Ctrl+&#8629; new tab</span>
        <span>Esc dismiss</span>
        <span>&nbsp;·&nbsp;</span>
        <span>&gt; commands</span>
        <span>/ menus</span>
        <span>| odata</span>
        <span># tables</span>
      </div>
    </div>
  `;

  document.body.appendChild(palette);

  const input = document.getElementById('d365-palette-search');
  input.focus();
  input.addEventListener('input', () => renderResults(input.value));

  palette.addEventListener('keydown', handlePaletteKey);
  palette.addEventListener('click', (e) => { if (e.target === palette) closePalette(); });

  renderResults('');
}

function closePalette() {
  palette?.remove();
  palette = null;
}

function renderResults(query) {
  const { filter, types } = parseQuery(query);
  const lower = filter.toLowerCase();
  const list = document.getElementById('d365-palette-results');
  if (!list) return;

  filteredResults = [];
  list.innerHTML = '';

  types.forEach((type) => {
    const items = allCommands.filter(
      (c) => c.type === type && (!lower || c.label.toLowerCase().includes(lower))
    );
    if (items.length === 0) return;

    const meta = TYPE_META[type];
    const groupLabel = document.createElement('li');
    groupLabel.className = 'd365-group-label';
    groupLabel.textContent = meta.label;
    groupLabel.setAttribute('role', 'presentation');
    list.appendChild(groupLabel);

    items.forEach((item) => {
      const idx = filteredResults.length;
      filteredResults.push(item);

      const li = document.createElement('li');
      li.className = 'd365-result-row';
      li.setAttribute('role', 'option');
      li.dataset.idx = idx;
      li.innerHTML = `
        <span class="d365-pip" style="background:${meta.color};"></span>
        <span class="d365-result-label">${highlightMatch(item.label, lower)}</span>
        <span class="d365-enter-hint" aria-hidden="true">&#8629;</span>
      `;
      li.addEventListener('click', (e) => executeItem(item, e.ctrlKey));
      li.addEventListener('mouseenter', () => setActiveIdx(idx));
      list.appendChild(li);
    });
  });

  activeIdx = 0;
  updateActiveRow();
}

function highlightMatch(text, query) {
  if (!query) return escHtml(text);
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query);
  if (idx === -1) return escHtml(text);
  return (
    escHtml(text.slice(0, idx)) +
    `<mark style="color:var(--d365-accent);font-weight:700;background:none;">${escHtml(text.slice(idx, idx + query.length))}</mark>` +
    escHtml(text.slice(idx + query.length))
  );
}

function setActiveIdx(idx) {
  activeIdx = idx;
  updateActiveRow();
}

function updateActiveRow() {
  const list = document.getElementById('d365-palette-results');
  if (!list) return;
  list.querySelectorAll('.d365-result-row').forEach((row) => {
    const active = parseInt(row.dataset.idx) === activeIdx;
    row.classList.toggle('active', active);
    row.setAttribute('aria-selected', active);
    if (active) row.scrollIntoView({ block: 'nearest' });
  });
}

function handlePaletteKey(e) {
  if (e.key === 'Escape') { closePalette(); return; }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setActiveIdx(Math.min(activeIdx + 1, filteredResults.length - 1));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setActiveIdx(Math.max(activeIdx - 1, 0));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (filteredResults[activeIdx]) executeItem(filteredResults[activeIdx], e.ctrlKey);
  }
}

function executeItem(item, newTab) {
  const base = window.location.origin;

  // Built-in command handlers (matched by label since these are fixed strings)
  const builtInActions = {
    'Copy current URL':          () => { navigator.clipboard.writeText(window.location.href); closePalette(); },
    'Open table browser':        () => navigate(`${base}/?mi=SysTableBrowser`, newTab),
    'Show control names':        () => navigate(`${base}/?debug=vs%3a1`, newTab),
    'Open class runner':         () => navigate(`${base}/?mi=SysClassRunner`, newTab),
    'Open database log':         () => navigate(`${base}/?mi=EventTracking`, newTab),
    'Personalisations › Clear all': () => navigate(`${base}/?mi=SysPersonalizationAdmin`, newTab),
    'User options':              () => navigate(`${base}/?mi=SysUserSetup`, newTab),
  };

  const fn = builtInActions[item.label];
  if (fn) { fn(); return; }

  // Menu items: use explicit `mi` if provided, fall back to last label segment
  if (item.type === 'menu') {
    const mi = item.mi ?? item.label.split(' › ').pop().replace(/\s+/g, '');
    navigate(`${base}/?mi=${encodeURIComponent(mi)}`, newTab);
    return;
  }

  // OData entities: label is the entity set name
  if (item.type === 'odata') {
    navigate(`${base}/data/${item.label}?cross-company=true`, newTab);
    return;
  }

  // Tables: open in the table browser of the current environment
  if (item.type === 'table') {
    navigate(`${base}/?mi=SysTableBrowser&tableName=${encodeURIComponent(item.label)}`, newTab);
    return;
  }

  closePalette();
}

function navigate(url, newTab) {
  if (newTab) {
    window.open(url, '_blank');
  } else {
    window.location.href = url;
  }
  closePalette();
}

// ── Environment marker ────────────────────────────────────────
let markerEl = null;

async function syncMarker() {
  const data = await new Promise((resolve) => chrome.storage.local.get(['environments'], resolve));
  const environments = data.environments ?? [];
  const current = window.location.origin.toLowerCase();
  const env = environments.find((e) => {
    try { return new URL(e.url).origin.toLowerCase() === current; } catch { return false; }
  });

  markerEl?.remove();
  markerEl = null;

  if (!env?.markerEnabled) return;

  markerEl = document.createElement('div');
  markerEl.id = 'd365-env-marker';
  const pos = env.markerPosition ?? 'top-left';
  const isTop  = pos.startsWith('top');
  const isLeft = pos.endsWith('left');

  Object.assign(markerEl.style, {
    position:     'fixed',
    zIndex:       '999999',
    width:        '6px',
    height:       '48px',
    background:   env.color ?? '#0f6cbd',
    borderRadius: isTop ? (isLeft ? '0 0 4px 0' : '0 0 0 4px') : (isLeft ? '0 4px 0 0' : '4px 0 0 0'),
    top:          isTop  ? '0'    : 'auto',
    bottom:       isTop  ? 'auto' : '0',
    left:         isLeft ? '0'    : 'auto',
    right:        isLeft ? 'auto' : '0',
    pointerEvents: 'none',
  });

  document.body.appendChild(markerEl);
}

syncMarker();

// ── Helpers ───────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
