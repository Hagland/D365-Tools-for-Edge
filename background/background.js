// Service worker: seed default commands on install, relay keyboard shortcut

import { getCustomCommands, saveCustomCommands, saveOdataEntities, getOdataEntityIndex, getOdataEntityDetail, getOdataEntitySyncedAt } from '../shared/storage.js';

// ── Seeding ───────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(seedCustomCommands);

async function seedCustomCommands() {
  const [defaultMenuItems, defaultTables] = await Promise.all([
    loadDefault('menu-items.json'),
    loadDefault('tables.json'),
  ]);

  const existing = await getCustomCommands();

  await saveCustomCommands({
    menuItems: mergeByKey(existing.menuItems ?? [], defaultMenuItems, 'mi'),
    tables:    mergeByKey(existing.tables    ?? [], defaultTables,    'label'),
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

// ── Message handlers ──────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SAVE_ENTITIES') {
    saveOdataEntities({ index: msg.index, entities: msg.entities, enums: msg.enums }, msg.origin)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.type === 'GET_ENTITY_INDEX') {
    Promise.all([getOdataEntityIndex(msg.origin), getOdataEntitySyncedAt(msg.origin)])
      .then(([index, syncedAt]) => sendResponse({ ok: true, index, syncedAt }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.type === 'GET_ENTITY_DETAIL') {
    getOdataEntityDetail(msg.publicCollectionName, msg.origin)
      .then((entity) => sendResponse({ ok: true, entity }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

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
