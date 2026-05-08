// Typed helpers around IndexedDB (popup + background contexts).
// Content scripts cannot use extension IndexedDB — they read from chrome.storage.local,
// which this module keeps in sync after every write.

import { dbGetAll, dbGet, dbPut, dbDelete, dbClearAndPutAll } from './db.js';

const STORAGE_VERSION = 1;

// ── chrome.storage.local sync ─────────────────────────────────
// Content scripts read environments and customCommands.{menuItems,tables} from
// chrome.storage.local. Call these after every IndexedDB write that touches those stores.

async function syncEnvsToLocal() {
  const environments = await dbGetAll('environments');
  await chrome.storage.local.set({ environments });
}

async function syncCommandsToLocal() {
  const [menuItemsRec, tablesRec] = await Promise.all([
    dbGet('kv', 'menuItems'),
    dbGet('kv', 'tables'),
  ]);
  await chrome.storage.local.set({
    customCommands: {
      menuItems: menuItemsRec?.value ?? [],
      tables:    tablesRec?.value   ?? [],
    },
  });
}

// ── Public API ────────────────────────────────────────────────

export async function getStorage() {
  const [environments, defaultsRec, versionRec] = await Promise.all([
    dbGetAll('environments'),
    dbGet('kv', 'defaults'),
    dbGet('kv', 'version'),
  ]);
  return {
    environments,
    defaults: defaultsRec?.value ?? defaultSettings(),
    version:  versionRec?.value  ?? STORAGE_VERSION,
  };
}

export async function saveEnvironment(env) {
  const record = { ...env, id: env.id ?? crypto.randomUUID() };
  await dbPut('environments', record);
  await syncEnvsToLocal();
}

export async function deleteEnvironment(id) {
  await dbDelete('environments', id);
  await syncEnvsToLocal();
}

export async function getDefaults() {
  const rec = await dbGet('kv', 'defaults');
  return rec?.value ?? defaultSettings();
}

export async function saveDefaults(defaults) {
  await dbPut('kv', { key: 'defaults', value: defaults });
}

export async function getCustomCommands() {
  const [menuItemsRec, tablesRec, odataEntities] = await Promise.all([
    dbGet('kv', 'menuItems'),
    dbGet('kv', 'tables'),
    dbGetAll('odataEntities'),
  ]);
  return {
    menuItems:     menuItemsRec?.value ?? [],
    tables:        tablesRec?.value    ?? [],
    odataEntities,
  };
}

export async function saveCustomCommands(customCommands) {
  const ops = [
    dbPut('kv', { key: 'menuItems', value: customCommands.menuItems ?? [] }),
    dbPut('kv', { key: 'tables',    value: customCommands.tables    ?? [] }),
  ];
  if (customCommands.odataEntities !== undefined) {
    ops.push(dbClearAndPutAll('odataEntities', customCommands.odataEntities));
  }
  await Promise.all(ops);
  await syncCommandsToLocal();
}

export async function getOdataEntityLabels() {
  const entities = await dbGetAll('odataEntities');
  return entities.map((e) => e.label);
}

export async function saveOdataEntities(entities) {
  const syncedAt = new Date().toISOString();
  await Promise.all([
    dbClearAndPutAll('odataEntities', entities),
    dbPut('kv', { key: 'lastEntitiesSyncedAt', value: syncedAt }),
  ]);
  await chrome.storage.local.set({ lastEntitiesSyncedAt: syncedAt });
}

/** Replace all stored data atomically — used by the full-config import. */
export async function importAll({ environments, defaults, customCommands, version }) {
  await Promise.all([
    dbClearAndPutAll('environments', environments ?? []),
    dbPut('kv', { key: 'defaults',  value: defaults   ?? defaultSettings() }),
    dbPut('kv', { key: 'version',   value: version     ?? STORAGE_VERSION }),
    dbPut('kv', { key: 'menuItems', value: customCommands?.menuItems     ?? [] }),
    dbPut('kv', { key: 'tables',    value: customCommands?.tables        ?? [] }),
    dbClearAndPutAll('odataEntities', customCommands?.odataEntities ?? []),
  ]);
  await Promise.all([syncEnvsToLocal(), syncCommandsToLocal()]);
}

function defaultSettings() {
  return {
    tableBrowser:     false,
    showControlNames: false,
    classRunner:      false,
    markerEnabled:    false,
    markerPosition:   'top-left',
  };
}
