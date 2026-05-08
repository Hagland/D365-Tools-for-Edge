// IndexedDB wrapper for extension contexts (popup, background service worker).
// Content scripts cannot access extension IndexedDB — they use chrome.storage.local
// via the sync helpers in storage.js.

const DB_NAME    = 'd365-helper';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = ({ target: { result: db } }) => {
      // environments — individual records, keyPath: id
      if (!db.objectStoreNames.contains('environments')) {
        db.createObjectStore('environments', { keyPath: 'id' });
      }
      // kv — simple key/value pairs (defaults, version, menuItems, tables)
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv', { keyPath: 'key' });
      }
      // odataEntities — individual records ready for rich metadata later
      if (!db.objectStoreNames.contains('odataEntities')) {
        db.createObjectStore('odataEntities', { keyPath: 'label' });
      }
    };

    req.onsuccess = ({ target: { result } }) => resolve(result);
    req.onerror   = ({ target: { error  } }) => reject(error);
  });
}

// ── Primitive helpers ─────────────────────────────────────────

export async function dbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function dbGet(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function dbPut(storeName, record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, 'readwrite').objectStore(storeName).put(record);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

export async function dbDelete(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// Replace all records in a store atomically (clear + put in one transaction)
export async function dbClearAndPutAll(storeName, records) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    records.forEach((r) => store.put(r));
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}
