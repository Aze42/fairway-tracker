// Tiny IndexedDB wrapper: two stores, "courses" and "rounds", both keyed by id.
const NAME = 'fairway-db';
let opened;

function open() {
  if (opened) return opened;
  opened = new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of ['courses', 'rounds']) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opened;
}

function run(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => resolve(r ? r.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const all = s => run(s, 'readonly', st => st.getAll());
export const get = (s, id) => run(s, 'readonly', st => st.get(id));
export const put = (s, obj) => run(s, 'readwrite', st => st.put(obj));
export const del = (s, id) => run(s, 'readwrite', st => st.delete(id));
export const clear = s => run(s, 'readwrite', st => st.clear());

export async function persist() {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch { /* ignore */ }
}
