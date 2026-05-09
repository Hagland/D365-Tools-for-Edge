// Content script: command palette overlay + environment marker

// ── Built-in commands (hardcoded handlers, not user-configurable) ─
// TODO: Example actions for now
const BUILT_IN_COMMANDS = [
  { type: 'command', label: 'Open in environment',   description: 'Open the current page in another configured environment' },
  { type: 'command', label: 'OData query designer',  description: 'Build and run OData queries against the current environment' },
  { type: 'command', label: 'Sync entities',         description: 'Download and cache OData entity metadata from this environment' },
];

// ── Runtime command list (built-ins + storage-loaded entries) ─
// Defaults are seeded into storage by the background service worker on install.
// Edit defaults/menu-items.json, defaults/tables.json, defaults/odata-entities.json
// to change what ships with the extension.
let allCommands = [...BUILT_IN_COMMANDS];

async function loadCommands() {
  const { customCommands } = await chrome.storage.local.get(['customCommands']);
  const custom = customCommands ?? {};

  const menuItems = (custom.menuItems ?? []).map((item) => ({ type: 'menu',  label: item.label, mi: item.mi }));
  const tables    = (custom.tables    ?? []).map((item) => ({ type: 'table', label: item.label }));

  allCommands = [...BUILT_IN_COMMANDS, ...menuItems, ...tables];
}

const TYPE_META = {
  command: { label: 'Actions',    color: '#0f6cbd' },
  menu:    { label: 'Navigation', color: '#107c41' },
  table:   { label: 'Tables',     color: '#038387' },
};

const CATEGORY_ORDER = ['command', 'menu', 'table'];

// Prefix characters that scope the palette to a single category (VS Code-style)
const PREFIX_MAP = {
  '>': 'command',
  '|': 'menu',
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

// sub-mode state  ('normal' | 'env-picker' | 'odata-builder')
let paletteMode       = 'normal';
let savedQuery        = '';
let envPickerEnvs     = [];
let odataBuilderIndex = [];

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
        <span>Alt+&#8629; new tab</span>
        <span>Esc dismiss</span>
        <span>&nbsp;·&nbsp;</span>
        <span>&gt; actions</span>
        <span>| navigation</span>
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
  palette           = null;
  paletteMode       = 'normal';
  savedQuery        = '';
  envPickerEnvs     = [];
  odataBuilderIndex = [];
}

function onPaletteInput() {
  const val = document.getElementById('d365-palette-search')?.value ?? '';
  if (paletteMode === 'env-picker')    renderEnvPicker(val);
  else if (paletteMode === 'odata-builder') renderOdataBuilder(val);
  else                                 renderResults(val);
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
        const friendlyName = item.label.split('>').pop().trim();
        li.innerHTML = `
          <span class="d365-pip" style="background:${meta.color};"></span>
          <span class="d365-result-text">
            <span class="d365-result-name">${highlightMatch(friendlyName, terms)}</span>
            <span class="d365-result-path">${highlightMatch(item.label, terms)}</span>
          </span>
          <span class="d365-enter-hint" aria-hidden="true">&#8629;</span>
        `;
      } else if (item.description) {
        li.innerHTML = `
          <span class="d365-pip" style="background:${meta.color};"></span>
          <span class="d365-result-text">
            <span class="d365-result-name">${highlightMatch(item.label, terms)}</span>
            <span class="d365-result-path">${escHtml(item.description)}</span>
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

      li.addEventListener('click', (e) => executeItem(item, e.altKey));
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
    <span>Alt+&#8629; new tab</span>
    <span>Esc dismiss</span>
    <span>&nbsp;·&nbsp;</span>
    <span>&gt; actions</span>
    <span>| navigation</span>
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

function showPaletteMessage(text, { error = false, spinner = false } = {}) {
  const list = document.getElementById('d365-palette-results');
  if (!list) return;
  filteredResults = [];
  list.innerHTML = '';
  const msg = document.createElement('li');
  msg.style.cssText = `padding:20px 14px;display:flex;align-items:center;justify-content:center;gap:10px;font-size:13px;color:${error ? 'var(--d365-text-primary)' : 'var(--d365-text-secondary)'};`;
  if (spinner) {
    const spin = document.createElement('span');
    spin.className = 'd365-spinner';
    msg.appendChild(spin);
  }
  msg.appendChild(document.createTextNode(text));
  list.appendChild(msg);
}

function showNotImplemented(label) {
  showPaletteMessage(`"${label}" — to be implemented.`);
}

// ── OData builder sub-mode ────────────────────────────────────

async function enterOdataBuilder() {
  await openOdataBuilderMode();
}

async function openOdataBuilderMode() {
  showPaletteMessage('Loading entities…', { spinner: true });

  const resp = await chrome.runtime.sendMessage({ type: 'GET_ENTITY_INDEX', origin: window.location.origin });
  if (!resp?.ok) {
    showPaletteMessage(`Failed to load entities: ${resp?.error ?? 'Unknown error'}`, { error: true });
    return;
  }

  if (resp.index.length === 0) {
    await syncEntities(async () => openOdataBuilderMode());
    return;
  }

  odataBuilderIndex = resp.index;
  paletteMode = 'odata-builder';

  const input = document.getElementById('d365-palette-search');
  savedQuery = input.value;
  input.value = '';
  input.placeholder = 'Select entity…';
  input.focus();

  const footer = palette.querySelector('.d365-palette-footer');
  footer.innerHTML = `
    <span>&#8593; &#8595; navigate</span>
    <span>&#8629; select</span>
    <span>Esc back</span>
  `;
  const right = document.createElement('span');
  right.style.cssText = 'margin-left:auto;display:flex;gap:10px;align-items:center;';
  if (resp.syncedAt) {
    const ts = document.createElement('span');
    ts.textContent = `Synced ${new Date(resp.syncedAt).toLocaleString()}`;
    right.appendChild(ts);
  }
  const refreshBtn = document.createElement('span');
  refreshBtn.textContent = '⟳ Refresh';
  refreshBtn.style.cursor = 'pointer';
  refreshBtn.addEventListener('click', async () => {
    exitOdataBuilder();
    await syncEntities(async () => openOdataBuilderMode());
  });
  right.appendChild(refreshBtn);
  footer.appendChild(right);

  renderOdataBuilder('');
}

function exitOdataBuilder() {
  paletteMode       = 'normal';
  odataBuilderIndex = [];

  const input = document.getElementById('d365-palette-search');
  input.value       = savedQuery;
  input.placeholder = 'Search…';
  input.focus();

  const footer = palette.querySelector('.d365-palette-footer');
  footer.innerHTML = `
    <span>&#8593; &#8595; navigate</span>
    <span>&#8629; open</span>
    <span>Alt+&#8629; new tab</span>
    <span>Esc dismiss</span>
    <span>&nbsp;·&nbsp;</span>
    <span>&gt; actions</span>
    <span>| navigation</span>
    <span># tables</span>
  `;

  renderResults(savedQuery);
}

function renderOdataBuilder(filter) {
  const list = document.getElementById('d365-palette-results');
  if (!list) return;

  const terms = filter ? filter.toLowerCase().split(/\s+/).filter(Boolean) : [];
  const shown = terms.length
    ? odataBuilderIndex.filter((e) =>
        matchesAllTerms(e.label, terms) ||
        matchesAllTerms(e.publicEntityName, terms) ||
        matchesAllTerms(e.publicCollectionName, terms)
      )
    : odataBuilderIndex;

  filteredResults = shown.map((e) => ({ type: 'odata', ...e }));
  list.innerHTML = '';

  if (shown.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'd365-group-label';
    empty.style.padding = '12px 14px';
    empty.textContent = odataBuilderIndex.length === 0 ? 'No entities synced.' : 'No entities match.';
    list.appendChild(empty);
    activeIdx = 0;
    return;
  }

  const groupLabel = document.createElement('li');
  groupLabel.className = 'd365-group-label';
  groupLabel.textContent = 'OData entities';
  groupLabel.setAttribute('role', 'presentation');
  list.appendChild(groupLabel);

  shown.forEach((entry, idx) => {
    const li = document.createElement('li');
    li.className = 'd365-result-row';
    li.setAttribute('role', 'option');
    li.dataset.idx = idx;
    const subText = [entry.publicEntityName, entry.entityCategory].filter(Boolean).join(' · ');
    li.innerHTML = `
      <span class="d365-pip" style="background:#8764b8;"></span>
      <span class="d365-result-text">
        <span class="d365-result-name">${highlightMatch(entry.label, terms)}</span>
        <span class="d365-result-path">${escHtml(subText)}</span>
      </span>
      <span class="d365-enter-hint" aria-hidden="true">&#8629;</span>
    `;
    li.addEventListener('click', () => executeOdataEntity(entry.publicCollectionName));
    li.addEventListener('mouseenter', () => { if (!suppressMouseEnter) setActiveIdx(idx); });
    list.appendChild(li);
  });

  activeIdx = 0;
  updateActiveRow();
}

function executeOdataEntity(publicCollectionName) {
  showNotImplemented(`OData query builder for "${publicCollectionName}"`);
}

// ── Entity sync ───────────────────────────────────────────────

async function syncEntities(afterSync = null) {
  showPaletteMessage('Fetching entity data — this may take several minutes.', { spinner: true });

  let dataEntitiesRaw, dmfRaw, metadataXml;
  try {
    const base = window.location.origin;
    const [r1, r2, r3] = await Promise.all([
      fetch(`${base}/metadata/DataEntities`),
      fetch(`${base}/data/DataManagementEntities`),
      fetch(`${base}/data/$metadata`),
    ]);
    if (!r1.ok) throw new Error(`DataEntities: HTTP ${r1.status}`);
    if (!r2.ok) throw new Error(`DataManagementEntities: HTTP ${r2.status}`);
    if (!r3.ok) throw new Error(`$metadata: HTTP ${r3.status}`);
    [dataEntitiesRaw, dmfRaw, metadataXml] = await Promise.all([r1.json(), r2.json(), r3.text()]);
  } catch (err) {
    showPaletteMessage(`Fetch failed: ${err.message}`, { error: true });
    return;
  }

  showPaletteMessage('Parsing entities…', { spinner: true });

  let parsed;
  try {
    parsed = parseEntityData(dataEntitiesRaw, dmfRaw, metadataXml);
  } catch (err) {
    showPaletteMessage(`Parse failed: ${err.message}`, { error: true });
    return;
  }

  showPaletteMessage(`Saving ${parsed.index.length} entities…`, { spinner: true });

  try {
    const resp = await chrome.runtime.sendMessage({
      type: 'SAVE_ENTITIES',
      index:    parsed.index,
      entities: parsed.entities,
      enums:    parsed.enums,
      origin:   window.location.origin,
    });
    if (!resp?.ok) throw new Error(resp?.error ?? 'Unknown error');
  } catch (err) {
    showPaletteMessage(`Save failed: ${err.message}`, { error: true });
    return;
  }

  if (afterSync) {
    await afterSync();
  } else {
    showPaletteMessage(`Synced ${parsed.index.length} entities.`);
    setTimeout(closePalette, 1500);
  }
}

function parseAnnotations(el) {
  const result = {};
  for (const child of el.children) {
    if (child.localName !== 'Annotation') continue;
    const termShort = (child.getAttribute('Term') ?? '').split('.').pop();
    if (child.hasAttribute('Bool'))   result[termShort] = child.getAttribute('Bool') === 'true';
    else if (child.hasAttribute('String')) result[termShort] = child.getAttribute('String');
    else {
      const em = child.getElementsByTagNameNS('*', 'EnumMember')[0];
      if (em) result[termShort] = em.textContent.trim().split('/').pop();
    }
  }
  return result;
}

function parseEntityData(dataEntitiesRaw, dmfRaw, metadataXml) {
  const dataEntities = Array.isArray(dataEntitiesRaw) ? dataEntitiesRaw : (dataEntitiesRaw?.value ?? []);
  const dmfEntities  = Array.isArray(dmfRaw)          ? dmfRaw          : (dmfRaw?.value          ?? []);

  // DMF map: TargetName → EntityName (for cross-reference)
  const dmfMap = new Map();
  dmfEntities.forEach((e) => { if (e.TargetName && e.EntityName) dmfMap.set(e.TargetName, e.EntityName); });

  const doc = new DOMParser().parseFromString(metadataXml, 'application/xml');

  // Parse EnumTypes
  const enums = {};
  for (const enumEl of doc.getElementsByTagNameNS('*', 'EnumType')) {
    const enumName = enumEl.getAttribute('Name');
    if (!enumName) continue;
    const members = [];
    for (const memberEl of enumEl.getElementsByTagNameNS('*', 'Member')) {
      members.push({ name: memberEl.getAttribute('Name') ?? '', value: memberEl.getAttribute('Value') ?? '' });
    }
    enums[enumName] = { members };
  }

  // Parse EntityTypes → map by name
  const entityTypeMap = new Map();
  for (const etEl of doc.getElementsByTagNameNS('*', 'EntityType')) {
    const name = etEl.getAttribute('Name');
    if (!name) continue;
    const keyNames = new Set(
      [...etEl.getElementsByTagNameNS('*', 'PropertyRef')].map((pr) => pr.getAttribute('Name'))
    );
    const fields = [];
    for (const propEl of etEl.getElementsByTagNameNS('*', 'Property')) {
      const propName = propEl.getAttribute('Name');
      const ann = parseAnnotations(propEl);
      fields.push({
        name:     propName,
        type:     propEl.getAttribute('Type') ?? '',
        isKey:    keyNames.has(propName),
        label:    ann.Label ?? propName,
        nullable: propEl.getAttribute('Nullable') !== 'false',
      });
    }
    const navProps = [];
    for (const navEl of etEl.getElementsByTagNameNS('*', 'NavigationProperty')) {
      const typeAttr = navEl.getAttribute('Type') ?? '';
      const match = typeAttr.match(/\.(\w+)\)?$/);
      navProps.push({ name: navEl.getAttribute('Name'), targetEntity: match ? match[1] : typeAttr });
    }
    entityTypeMap.set(name, { fields, navProps });
  }

  // Build index + per-entity detail records from /metadata/DataEntities
  const index    = [];
  const entities = [];
  for (const de of dataEntities) {
    const publicCollectionName = de.PublicCollectionName;
    if (!publicCollectionName) continue;
    const publicEntityName = de.PublicEntityName ?? '';
    const entityName       = de.Name ?? '';
    // DMF EntityName ("Fixed assets V2 entity") is the human-friendly label, keyed by TargetName = de.Name
    const label            = dmfMap.get(entityName) ?? publicEntityName;
    const entityCategory   = de.EntityCategory ?? '';
    const etData           = entityTypeMap.get(publicEntityName) ?? { fields: [], navProps: [] };
    index.push({ publicCollectionName, label, publicEntityName, entityCategory });
    entities.push({
      publicCollectionName,
      label,
      publicEntityName,
      entityCategory,
      entityName,
      fields:               etData.fields,
      navigationProperties: etData.navProps,
    });
  }

  return { index, entities, enums };
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
    if (active) {
        const prev = row.previousElementSibling;
        (prev?.classList.contains('d365-group-label') ? prev : row)
          .scrollIntoView({ block: 'nearest' });
      }
  });
}

function handlePaletteKey(e) {
  e.stopPropagation();
  if (e.key === 'Escape') {
    if (paletteMode === 'env-picker')    { exitEnvPicker(); return; }
    if (paletteMode === 'odata-builder') { exitOdataBuilder(); return; }
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
    if (paletteMode === 'env-picker')    { if (filteredResults[activeIdx]) executeEnvItem(filteredResults[activeIdx]); }
    else if (paletteMode === 'odata-builder') { if (filteredResults[activeIdx]) executeOdataEntity(filteredResults[activeIdx].publicCollectionName); }
    else                                 { if (filteredResults[activeIdx]) executeItem(filteredResults[activeIdx], e.altKey); }
  }
}

async function executeItem(item, newTab) {
  const base = window.location.origin;

  if (item.label === 'Open in environment') {
    await enterEnvPicker();
    return;
  }

  if (item.label === 'OData query designer') {
    await enterOdataBuilder();
    return;
  }

  if (item.label === 'Sync entities') {
    await syncEntities();
    return;
  }


  // Menu items: use explicit `mi` if provided, fall back to last label segment
  if (item.type === 'menu') {
    const mi = item.mi ?? item.label.split(' > ').pop().replace(/\s+/g, '');
    navigate(`${base}/?mi=${encodeURIComponent(mi)}`, newTab);
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
