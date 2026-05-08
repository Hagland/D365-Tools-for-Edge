// Content script: command palette overlay + environment marker

// ── Built-in commands (hardcoded handlers, not user-configurable) ─
// TODO: Example actions for now
const BUILT_IN_COMMANDS = [
  { type: 'command', label: 'Open in environment' },
];

// ── Runtime command list (built-ins + storage-loaded entries) ─
// Defaults are seeded into storage by the background service worker on install.
// Edit defaults/menu-items.json, defaults/tables.json, defaults/odata-entities.json
// to change what ships with the extension.
let allCommands = [...BUILT_IN_COMMANDS];

async function loadCommands() {
  const { customCommands } = await chrome.storage.local.get(['customCommands']);
  const custom = customCommands ?? {};

  const menuItems     = (custom.menuItems     ?? []).map((item) => ({ type: 'menu',  label: item.label, mi: item.mi }));
  const odataEntities = (custom.odataEntities ?? []).map((item) => ({ type: 'odata', label: item.label }));
  const tables        = (custom.tables        ?? []).map((item) => ({ type: 'table', label: item.label }));

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

let palette    = null;
let activeIdx  = 0;
let filteredResults = [];
let suppressMouseEnter = false;

// env-picker sub-mode state
let paletteMode   = 'normal'; // 'normal' | 'env-picker'
let savedQuery    = '';
let envPickerEnvs = [];

// ── Message listener ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'OPEN_PALETTE') togglePalette();
});

// Reload commands and re-render if the palette is open when storage changes
chrome.storage.onChanged.addListener(async (changes) => {
  if ('customCommands' in changes) {
    await loadCommands();
    if (palette && paletteMode === 'normal') {
      renderResults(document.getElementById('d365-palette-search')?.value ?? '');
    }
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
  paletteMode = 'normal';

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
        <input id="d365-palette-search" type="text" placeholder="Search…" autocomplete="off" spellcheck="false" />
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
  input.addEventListener('input', onPaletteInput);

  palette.addEventListener('keydown', handlePaletteKey);
  palette.addEventListener('mousemove', () => { suppressMouseEnter = false; });
  palette.addEventListener('click', (e) => { if (e.target === palette) closePalette(); });

  renderResults('');
}

function closePalette() {
  palette?.remove();
  palette       = null;
  paletteMode   = 'normal';
  savedQuery    = '';
  envPickerEnvs = [];
}

function onPaletteInput() {
  const val = document.getElementById('d365-palette-search')?.value ?? '';
  if (paletteMode === 'env-picker') {
    renderEnvPicker(val);
  } else {
    renderResults(val);
  }
}

// ── Normal results ────────────────────────────────────────────

function renderResults(query) {
  const { filter, types } = parseQuery(query);
  const terms = filter ? filter.toLowerCase().split(/\s+/).filter(Boolean) : [];
  const list = document.getElementById('d365-palette-results');
  if (!list) return;

  filteredResults = [];
  list.innerHTML = '';

  types.forEach((type) => {
    const items = allCommands.filter(
      (c) => c.type === type && (!terms.length || matchesAllTerms(c.label, terms))
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

      if (item.type === 'menu') {
        const friendlyName = item.label.split(' > ').pop();
        li.innerHTML = `
          <span class="d365-pip" style="background:${meta.color};"></span>
          <span class="d365-result-text">
            <span class="d365-result-name">${highlightMatch(friendlyName, terms)}</span>
            <span class="d365-result-path">${highlightMatch(item.label, terms)}</span>
          </span>
          <span class="d365-enter-hint" aria-hidden="true">&#8629;</span>
        `;
      } else {
        li.innerHTML = `
          <span class="d365-pip" style="background:${meta.color};"></span>
          <span class="d365-result-label">${highlightMatch(item.label, terms)}</span>
          <span class="d365-enter-hint" aria-hidden="true">&#8629;</span>
        `;
      }

      li.addEventListener('click', (e) => executeItem(item, e.ctrlKey));
      li.addEventListener('mouseenter', () => { if (!suppressMouseEnter) setActiveIdx(idx); });
      list.appendChild(li);
    });
  });

  activeIdx = 0;
  updateActiveRow();
}

// ── Environment picker sub-mode ───────────────────────────────

async function enterEnvPicker() {
  const data = await new Promise((r) => chrome.storage.local.get(['environments'], r));
  const environments = data.environments ?? [];
  const currentOrigin = window.location.origin.toLowerCase();

  envPickerEnvs = environments.filter((env) => {
    try { return new URL(env.url).origin.toLowerCase() !== currentOrigin; } catch { return false; }
  });

  paletteMode = 'env-picker';

  const input = document.getElementById('d365-palette-search');
  savedQuery = input.value;
  input.value = '';
  input.placeholder = 'Select environment…';
  input.focus();

  const footer = palette.querySelector('.d365-palette-footer');
  footer.innerHTML = `
    <span>&#8593; &#8595; navigate</span>
    <span>&#8629; open in new tab</span>
    <span>Esc back</span>
  `;

  renderEnvPicker('');
}

function exitEnvPicker() {
  paletteMode   = 'normal';
  envPickerEnvs = [];

  const input = document.getElementById('d365-palette-search');
  input.value = savedQuery;
  input.placeholder = 'Search…';
  input.focus();

  const footer = palette.querySelector('.d365-palette-footer');
  footer.innerHTML = `
    <span>&#8593; &#8595; navigate</span>
    <span>&#8629; open</span>
    <span>Ctrl+&#8629; new tab</span>
    <span>Esc dismiss</span>
    <span>&nbsp;·&nbsp;</span>
    <span>&gt; commands</span>
    <span>/ menus</span>
    <span>| odata</span>
    <span># tables</span>
  `;

  renderResults(savedQuery);
}

function renderEnvPicker(filter) {
  const list = document.getElementById('d365-palette-results');
  if (!list) return;

  const terms = filter ? filter.toLowerCase().split(/\s+/).filter(Boolean) : [];
  const shown = terms.length
    ? envPickerEnvs.filter((e) => matchesAllTerms(e.name, terms))
    : envPickerEnvs;

  filteredResults = shown;
  list.innerHTML = '';

  if (shown.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'd365-group-label';
    empty.style.padding = '12px 14px';
    empty.textContent = envPickerEnvs.length === 0
      ? 'No other environments configured.'
      : 'No environments match.';
    list.appendChild(empty);
    activeIdx = 0;
    return;
  }

  const groupLabel = document.createElement('li');
  groupLabel.className = 'd365-group-label';
  groupLabel.textContent = 'Environments';
  groupLabel.setAttribute('role', 'presentation');
  list.appendChild(groupLabel);

  shown.forEach((env, idx) => {
    const li = document.createElement('li');
    li.className = 'd365-result-row';
    li.setAttribute('role', 'option');
    li.dataset.idx = idx;
    li.innerHTML = `
      <span class="d365-pip" style="background:${escHtml(env.color ?? '#0f6cbd')};"></span>
      <span class="d365-result-label">${highlightMatch(env.name, terms)}</span>
      <span class="d365-enter-hint" aria-hidden="true">&#8629;</span>
    `;
    li.addEventListener('click', () => executeEnvItem(env));
    li.addEventListener('mouseenter', () => setActiveIdx(idx));
    list.appendChild(li);
  });

  activeIdx = 0;
  updateActiveRow();
}

function executeEnvItem(env) {
  try {
    const targetOrigin = new URL(env.url).origin;
    const path = window.location.pathname + window.location.search + window.location.hash;
    navigate(targetOrigin + path, true);
  } catch {
    closePalette();
  }
}

// ── Shared palette helpers ────────────────────────────────────

function matchesAllTerms(text, terms) {
  const lower = text.toLowerCase();
  return terms.every((t) => lower.includes(t));
}

function highlightMatch(text, terms) {
  if (!terms.length) return escHtml(text);
  const lower = text.toLowerCase();

  // Collect all match ranges for every term
  const ranges = [];
  for (const term of terms) {
    let pos = 0;
    while (pos < lower.length) {
      const idx = lower.indexOf(term, pos);
      if (idx === -1) break;
      ranges.push([idx, idx + term.length]);
      pos = idx + 1;
    }
  }
  if (!ranges.length) return escHtml(text);

  // Sort and merge overlapping ranges
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [[...ranges[0]]];
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1];
    if (ranges[i][0] <= last[1]) {
      last[1] = Math.max(last[1], ranges[i][1]);
    } else {
      merged.push([...ranges[i]]);
    }
  }

  // Build highlighted string
  let result = '';
  let pos = 0;
  for (const [start, end] of merged) {
    result += escHtml(text.slice(pos, start));
    result += `<mark style="color:var(--d365-accent);font-weight:700;background:none;">${escHtml(text.slice(start, end))}</mark>`;
    pos = end;
  }
  return result + escHtml(text.slice(pos));
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
  e.stopPropagation();
  if (e.key === 'Escape') {
    if (paletteMode === 'env-picker') { exitEnvPicker(); return; }
    closePalette();
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    suppressMouseEnter = true;
    setActiveIdx(Math.min(activeIdx + 1, filteredResults.length - 1));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    suppressMouseEnter = true;
    setActiveIdx(Math.max(activeIdx - 1, 0));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (paletteMode === 'env-picker') {
      if (filteredResults[activeIdx]) executeEnvItem(filteredResults[activeIdx]);
    } else {
      if (filteredResults[activeIdx]) executeItem(filteredResults[activeIdx], e.ctrlKey);
    }
  }
}

async function executeItem(item, newTab) {
  const base = window.location.origin;

  if (item.label === 'Open in environment') {
    await enterEnvPicker();
    return;
  }


  const fn = builtInActions[item.label];
  if (fn) { fn(); return; }

  // Menu items: use explicit `mi` if provided, fall back to last label segment
  if (item.type === 'menu') {
    const mi = item.mi ?? item.label.split(' > ').pop().replace(/\s+/g, '');
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

  const pos    = env.markerPosition ?? 'top-left';
  const isTop  = pos.startsWith('top');
  const isLeft = pos.endsWith('left');
  const color  = env.color ?? '#0f6cbd';

  // Outer container — clips the ribbon to the corner
  markerEl = document.createElement('div');
  markerEl.id = 'd365-env-marker';
  Object.assign(markerEl.style, {
    position:      'fixed',
    width:         '160px',
    height:        '160px',
    overflow:      'hidden',
    zIndex:        '999999',
    pointerEvents: 'none',
    top:           isTop  ? '0'    : 'auto',
    bottom:        isTop  ? 'auto' : '0',
    left:          isLeft ? '0'    : 'auto',
    right:         isLeft ? 'auto' : '0',
  });

  // Inner strip — diagonal label rotated into the corner
  const strip = document.createElement('div');
  // TL and BR rotate the same way; TR and BL rotate the opposite way
  const deg = (isTop === isLeft) ? -45 : 45;
  Object.assign(strip.style, {
    position:     'absolute',
    width:        '240px',
    padding:      '8px 4px',
    background:   color,
    color:        '#ffffff',
    fontSize:     '12px',
    fontWeight:   '700',
    fontFamily:   '"Segoe UI Variable","Segoe UI",system-ui,sans-serif',
    textAlign:    'center',
    whiteSpace:   'nowrap',
    overflow:     'hidden',
    textOverflow: 'ellipsis',
    transform:    `rotate(${deg}deg)`,
    top:          isTop  ? '40px' : 'auto',
    bottom:       isTop  ? 'auto' : '40px',
    left:         isLeft ? '-60px' : 'auto',
    right:        isLeft ? 'auto'  : '-60px',
  });
  strip.textContent = env.name;

  markerEl.appendChild(strip);
  document.body.appendChild(markerEl);
}

syncMarker();

// ── Helpers ───────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
