import { VerseImageEntry } from "@/lib/types";

interface LegacyLocalCacheRecord<T> {
  savedAt: number;
  data: T;
}

const DB_NAME = "scriptures-with-pictures";
const STORE_NAME = "verse-images";
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
  });
}

export async function getAllVerseImageEntriesFromDb(): Promise<VerseImageEntry[]> {
  const db = await openDatabase();

  return new Promise<VerseImageEntry[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      resolve((request.result as VerseImageEntry[]) ?? []);
    };

    request.onerror = () => reject(request.error ?? new Error("Failed to read verse images from IndexedDB"));
  });
}

export async function upsertVerseImageEntryInDb(entry: VerseImageEntry): Promise<void> {
  const db = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(entry);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to save verse image to IndexedDB"));
    tx.onabort = () => reject(tx.error ?? new Error("Failed to save verse image to IndexedDB"));
  });
}

export async function upsertVerseImageEntriesInDb(entries: VerseImageEntry[]): Promise<void> {
  if (entries.length === 0) {
    return;
  }

  const db = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    for (const entry of entries) {
      store.put(entry);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to save verse images to IndexedDB"));
    tx.onabort = () => reject(tx.error ?? new Error("Failed to save verse images to IndexedDB"));
  });
}

export async function migrateLegacyVerseImagesFromLocalStorage(
  legacyStorageKey: string,
): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  const raw = window.localStorage.getItem(legacyStorageKey);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw) as LegacyLocalCacheRecord<VerseImageEntry[]>;
    const entries = Array.isArray(parsed?.data) ? parsed.data : [];

    if (entries.length > 0) {
      await upsertVerseImageEntriesInDb(entries);
    }

    window.localStorage.removeItem(legacyStorageKey);
  } catch {
    // Keep legacy data if parsing fails.
  }
}
