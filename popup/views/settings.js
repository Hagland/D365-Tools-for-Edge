// Screen 3 — Settings (defaults & data management)

import { getStorage, getDefaults, saveDefaults, getCustomCommands, saveCustomCommands } from '../../shared/storage.js';
import {
  setToggle, getToggle, wireToggle,
  setMarkerPositionWrap, wirePositionGrid, selectPosition, getSelectedPosition,
} from '../utils.js';

/** Wire up the settings view.
 *  @param {{ onBack: () => void, onImported: () => void }} callbacks
 */
export function init({ onBack, onImported }) {
  document.getElementById('btn-settings-back').addEventListener('click', onBack);

  wireToggle('s-toggle-marker', 's-marker-position-wrap');
  wireToggle('s-toggle-table-browser');
  wireToggle('s-toggle-control-names');
  wireToggle('s-toggle-class-runner');
  wirePositionGrid('s-position-grid');

  const autoSaveIds = ['s-toggle-marker', 's-toggle-table-browser', 's-toggle-control-names', 's-toggle-class-runner'];
  autoSaveIds.forEach((id) => {
    document.getElementById(id).addEventListener('click', save);
  });
  document.getElementById('s-position-grid').querySelectorAll('.position-btn').forEach((btn) => {
    btn.addEventListener('click', save);
  });

  // Full configuration
  document.getElementById('btn-export').addEventListener('click', exportConfig);
  document.getElementById('import-file-input').addEventListener('change', (e) => importConfig(e, onImported));

  // Per-list
  document.getElementById('btn-export-menu-items').addEventListener('click', () =>
    exportList('menuItems', 'd365-menu-items.json'));
  document.getElementById('import-menu-items').addEventListener('change', (e) =>
    importList(e, 'menuItems', 'status-menu-items', onImported));

  document.getElementById('btn-export-tables').addEventListener('click', () =>
    exportList('tables', 'd365-tables.json'));
  document.getElementById('import-tables').addEventListener('change', (e) =>
    importList(e, 'tables', 'status-tables', onImported));

  document.getElementById('btn-export-odata').addEventListener('click', () =>
    exportList('odataEntities', 'd365-odata-entities.json'));
  document.getElementById('import-odata').addEventListener('change', (e) =>
    importList(e, 'odataEntities', 'status-odata', onImported));
}

/** Load current defaults into the settings form. Called each time the view is shown. */
export async function load() {
  const defaults = await getDefaults();
  setToggle('s-toggle-marker', defaults.markerEnabled);
  setMarkerPositionWrap('s-marker-position-wrap', defaults.markerEnabled);
  selectPosition('s-position-grid', defaults.markerPosition);
  setToggle('s-toggle-table-browser', defaults.tableBrowser);
  setToggle('s-toggle-control-names', defaults.showControlNames);
  setToggle('s-toggle-class-runner',  defaults.classRunner);
}

async function save() {
  await saveDefaults({
    markerEnabled:    getToggle('s-toggle-marker'),
    markerPosition:   getSelectedPosition('s-position-grid'),
    tableBrowser:     getToggle('s-toggle-table-browser'),
    showControlNames: getToggle('s-toggle-control-names'),
    classRunner:      getToggle('s-toggle-class-runner'),
  });
}

// ── Full configuration import / export ────────────────────────

async function exportConfig() {
  const { environments, defaults, version } = await getStorage();
  const customCommands = await getCustomCommands();
  const data = { version, exported: new Date().toISOString(), defaults, environments, customCommands };
  downloadJson(data, 'd365-helper-config.json');
}

async function importConfig(e, onImported) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.environments)) throw new Error('Invalid format: missing environments array.');
    await chrome.storage.local.set({
      environments:   data.environments,
      defaults:       data.defaults       ?? {},
      customCommands: data.customCommands ?? { menuItems: [], odataEntities: [], tables: [] },
      version:        data.version        ?? 1,
    });
    showStatus('import-status', 'Import successful.', 'success');
    await load();
    onImported();
  } catch (err) {
    showStatus('import-status', `Import failed: ${err.message}`, 'error');
  }
  e.target.value = '';
}

// ── Per-list import / export ──────────────────────────────────

async function exportList(listKey, filename) {
  const customCommands = await getCustomCommands();
  downloadJson(customCommands[listKey] ?? [], filename);
}

async function importList(e, listKey, statusId, onImported) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed)) throw new Error('Expected a JSON array.');
    const key    = listKey === 'menuItems' ? 'mi' : 'label';
    const unique = deduplicateByKey(parsed, key);
    const customCommands = await getCustomCommands();
    await saveCustomCommands({ ...customCommands, [listKey]: unique });
    const dupes = parsed.length - unique.length;
    const msg   = dupes > 0
      ? `Imported ${unique.length} item${unique.length !== 1 ? 's' : ''} (${dupes} duplicate${dupes !== 1 ? 's' : ''} removed).`
      : `Imported ${unique.length} item${unique.length !== 1 ? 's' : ''}.`;
    showStatus(statusId, msg, 'success');
    onImported();
  } catch (err) {
    showStatus(statusId, `Import failed: ${err.message}`, 'error');
  }
  e.target.value = '';
}

function deduplicateByKey(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const k = item[key]?.toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ── Helpers ───────────────────────────────────────────────────

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function showStatus(id, msg, type) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = `import-status ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}
