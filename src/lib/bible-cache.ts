import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

interface BibleCacheEntry {
  payload: unknown;
  hash: string;
  updatedAt: string;
  lastCheckedAt: string;
}

interface BibleCacheStore {
  version: 1;
  entries: Record<string, BibleCacheEntry>;
}

interface CachedDataOptions<T> {
  key: string;
  maxAgeMs: number;
  loader: () => Promise<T>;
}

const STORE_PATH = path.join(process.cwd(), "data", "bible-cache.json");
const inFlightRefreshes = new Map<string, Promise<void>>();

function createInitialStore(): BibleCacheStore {
  return {
    version: 1,
    entries: {},
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function computeHash(payload: unknown): string {
  return createHash("sha1").update(JSON.stringify(payload)).digest("hex");
}

function getAgeMs(isoDate: string): number {
  const parsed = Date.parse(isoDate);
  if (!Number.isFinite(parsed)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Date.now() - parsed;
}

async function ensureStoreExists(): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });

  try {
    await readFile(STORE_PATH, "utf8");
  } catch {
    await writeFile(STORE_PATH, JSON.stringify(createInitialStore(), null, 2), "utf8");
  }
}

async function readStore(): Promise<BibleCacheStore> {
  await ensureStoreExists();

  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as BibleCacheStore;

    if (parsed?.version !== 1 || typeof parsed.entries !== "object" || !parsed.entries) {
      return createInitialStore();
    }

    return parsed;
  } catch {
    return createInitialStore();
  }
}

async function writeStore(store: BibleCacheStore): Promise<void> {
  await ensureStoreExists();
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

async function refreshEntryInBackground<T>(
  key: string,
  existingHash: string,
  loader: () => Promise<T>,
): Promise<void> {
  const refreshPromise = (async () => {
    try {
      const freshPayload = await loader();
      const freshHash = computeHash(freshPayload);
      const checkedAt = nowIso();

      const store = await readStore();
      const currentEntry = store.entries[key];

      if (freshHash === existingHash && currentEntry) {
        store.entries[key] = {
          ...currentEntry,
          lastCheckedAt: checkedAt,
        };
      } else {
        store.entries[key] = {
          payload: freshPayload,
          hash: freshHash,
          updatedAt: checkedAt,
          lastCheckedAt: checkedAt,
        };
      }

      await writeStore(store);
    } catch {
      // Keep stale cache when refresh fails.
    } finally {
      inFlightRefreshes.delete(key);
    }
  })();

  inFlightRefreshes.set(key, refreshPromise);
}

export async function getCachedBibleData<T>(options: CachedDataOptions<T>): Promise<T> {
  const { key, maxAgeMs, loader } = options;
  const store = await readStore();
  const entry = store.entries[key];

  if (entry) {
    const ageMs = getAgeMs(entry.lastCheckedAt || entry.updatedAt);
    if (ageMs <= maxAgeMs) {
      return entry.payload as T;
    }

    if (!inFlightRefreshes.has(key)) {
      void refreshEntryInBackground(key, entry.hash, loader);
    }

    return entry.payload as T;
  }

  const payload = await loader();
  const checkedAt = nowIso();

  store.entries[key] = {
    payload,
    hash: computeHash(payload),
    updatedAt: checkedAt,
    lastCheckedAt: checkedAt,
  };

  await writeStore(store);
  return payload;
}
