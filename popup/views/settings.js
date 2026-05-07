// Screen 3 — Settings (defaults & data management)

import { getStorage, getDefaults, saveDefaults } from '../../shared/storage.js';
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

  document.getElementById('btn-export').addEventListener('click', exportConfig);
  document.getElementById('import-file-input').addEventListener('change', (e) => importConfig(e, onImported));
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

async function exportConfig() {
  const { environments, defaults, version } = await getStorage();
  const data = { version, exported: new Date().toISOString(), defaults, environments };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = 'd365-helper-config.json';
  a.click();
  URL.revokeObjectURL(url);
}

async function importConfig(e, onImported) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.environments)) throw new Error('Invalid format: missing environments array.');
    await chrome.storage.local.set({
      environments: data.environments,
      defaults:     data.defaults ?? {},
      version:      data.version  ?? 1,
    });
    showStatus('Import successful.', 'success');
    await load();
    onImported();
  } catch (err) {
    showStatus(`Import failed: ${err.message}`, 'error');
  }
  e.target.value = '';
}

function showStatus(msg, type) {
  const el = document.getElementById('import-status');
  el.textContent = msg;
  el.className = `import-status ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}
