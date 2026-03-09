// services/cacheService.ts

const DB_NAME = 'rt-pos-cache-db';
const DB_VERSION = 1;
const STORE_NAME = 'app-cache';

interface CacheEntry<T> {
  key: string;
  data: T;
  timestamp: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => {
        console.error('Error opening IndexedDB for cache:', request.error);
        reject('Error al abrir la base de datos de caché local.');
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
    });
  }
  return dbPromise;
}

export const cacheService = {
  async setCache<T>(key: string, data: T): Promise<void> {
    const db = await getDb();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const entry: CacheEntry<T> = {
      key,
      data,
      timestamp: Date.now(),
    };

    store.put(entry);
    
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => {
        console.error('Error setting cache:', transaction.error);
        reject(transaction.error);
      };
    });
  },

  async getCache<T>(key: string): Promise<CacheEntry<T> | null> {
    const db = await getDb();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result as CacheEntry<T> | null);
      };
      request.onerror = () => {
        console.error('Error getting cache:', request.error);
        reject(request.error);
      };
    });
  },

  async clearCache(): Promise<void> {
    const db = await getDb();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
    
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },
};