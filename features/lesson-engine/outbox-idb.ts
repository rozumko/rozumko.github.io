// IndexedDB storage for the offline answer outbox (stage J). One object store
// keyed by client attempt id. It holds answers and ids only — never the
// device token, a name or a score. Falls back to memory when IndexedDB is
// unavailable (private mode, blocked storage): answers then last for the page.

import { memoryOutboxStore, type OutboxItem, type OutboxStore } from './attempt-outbox.js'

const DB_NAME = 'rozumko-lesson-outbox'
const STORE = 'attempts'

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'clientAttemptId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('outbox database blocked'))
  })
}

export function indexedDbOutboxStore(): OutboxStore {
  if (typeof indexedDB === 'undefined') return memoryOutboxStore()
  const opened = openDatabase()
  // If opening fails, every call rejects and the outbox keeps its memory copy.
  opened.catch(() => {})

  async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await opened
    const tx = db.transaction(STORE, mode)
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    const result = await promisify(action(tx.objectStore(STORE)))
    await done
    return result
  }

  return {
    load: () => run('readonly', store => store.getAll() as IDBRequest<OutboxItem[]>),
    put: async item => { await run('readwrite', store => store.put(item)) },
    remove: async id => { await run('readwrite', store => store.delete(id)) },
  }
}
