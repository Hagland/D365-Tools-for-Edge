// Service worker: seed default commands on install, relay keyboard shortcut

import { getCustomCommands, saveCustomCommands } from '../shared/storage.js';

// ── Seeding ───────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(seedCustomCommands);

async function seedCustomCommands() {
  const [defaultMenuItems, defaultTables, defaultOdataEntities] = await Promise.all([
    loadDefault('menu-items.json'),
    loadDefault('tables.json'),
    loadDefault('odata-entities.json'),
  ]);

  const existing = await getCustomCommands();

  await saveCustomCommands({
    menuItems:     mergeByKey(existing.menuItems     ?? [], defaultMenuItems,     'mi'),
    tables:        mergeByKey(existing.tables        ?? [], defaultTables,        'label'),
    odataEntities: mergeByKey(existing.odataEntities ?? [], defaultOdataEntities, 'label'),
  });
}

async function loadDefault(filename) {
  const resp = await fetch(chrome.runtime.getURL(`defaults/${filename}`));
  return resp.json();
}

// Deduplicate existing, then append defaults not already present — matched by key
function mergeByKey(existing, defaults, key) {
  const seen = new Set();
  const deduped = existing.filter((item) => {
    const k = item[key]?.toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  defaults.forEach((item) => {
    const k = item[key]?.toLowerCase();
    if (k && !seen.has(k)) { seen.add(k); deduped.push(item); }
  });
  return deduped;
}

// ── Keyboard shortcut relay ───────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-palette') return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_PALETTE' });
  } catch {
    // Content script not present on this tab (non-D365 page) — silently ignore
  }
});
