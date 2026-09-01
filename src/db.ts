/**
 * A small promise wrapper over IndexedDB. Everything the app persists
 * lives in one database so a single `open()` migration keeps the schema honest.
 */

const DB_NAME = 'pwomwo'
const DB_VERSION = 1

export type StoreName = 'sessions' | 'tombstones' | 'settings' | 'timer' | 'identity' | 'peers'

let dbPromise: Promise<IDBDatabase> | null = null

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('sessions')) {
        const s = db.createObjectStore('sessions', { keyPath: 'id' })
        s.createIndex('endedAt', 'endedAt')
        s.createIndex('deviceId', 'deviceId')
      }
      if (!db.objectStoreNames.contains('tombstones'))
        db.createObjectStore('tombstones', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings')
      if (!db.objectStoreNames.contains('timer')) db.createObjectStore('timer')
      if (!db.objectStoreNames.contains('identity')) db.createObjectStore('identity', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('peers')) db.createObjectStore('peers', { keyPath: 'deviceId' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function run<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb()
  return run<T | undefined>(db.transaction(store).objectStore(store).get(key))
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb()
  return run<T[]>(db.transaction(store).objectStore(store).getAll())
}

export async function put(store: StoreName, value: unknown, key?: IDBValidKey): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).put(value, key)
  await done(tx)
}

export async function putMany(store: StoreName, values: unknown[]): Promise<void> {
  if (values.length === 0) return
  const db = await openDb()
  const tx = db.transaction(store, 'readwrite')
  const os = tx.objectStore(store)
  for (const v of values) os.put(v)
  await done(tx)
}

export async function del(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).delete(key)
  await done(tx)
}

export async function clear(store: StoreName): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).clear()
  await done(tx)
}

export async function count(store: StoreName): Promise<number> {
  const db = await openDb()
  return run<number>(db.transaction(store).objectStore(store).count())
}

/** Ask the browser not to evict us: history is the one thing we cannot refetch. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist()
  } catch {
    /* not fatal */
  }
  return false
}
