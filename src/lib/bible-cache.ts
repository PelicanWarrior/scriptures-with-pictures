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
const TMP_STORE_PATH = path.join("/tmp", "scriptures-with-pictures", "bible-cache.json");
const inFlightRefreshes = new Map<string, Promise<void>>();
let resolvedStorePath: string | null = null;
let fileStoreDisabled = false;
let memoryStore: BibleCacheStore = createInitialStore();

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

function isErrno(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

function isReadOnlyFsError(error: unknown): boolean {
  if (!isErrno(error)) {
    return false;
  }

  return error.code === "EROFS" || error.code === "EACCES" || error.code === "EPERM";
}

async function ensureStoreExists(storePath: string): Promise<void> {
  await mkdir(path.dirname(storePath), { recursive: true });

  try {
    await readFile(storePath, "utf8");
  } catch (error) {
    if (isErrno(error) && error.code === "ENOENT") {
      await writeFile(storePath, JSON.stringify(createInitialStore(), null, 2), "utf8");
      return;
    }

    throw error;
  }
}

async function resolveStorePath(): Promise<string | null> {
  if (fileStoreDisabled) {
    return null;
  }

  if (resolvedStorePath) {
    return resolvedStorePath;
  }

  const overridePath = process.env.BIBLE_CACHE_PATH;
  const candidates = [overridePath, STORE_PATH, TMP_STORE_PATH].filter(
    (candidate): candidate is string => Boolean(candidate),
  );

  for (const candidate of candidates) {
    try {
      await ensureStoreExists(candidate);
      resolvedStorePath = candidate;
      return candidate;
    } catch (error) {
      if (isReadOnlyFsError(error)) {
        continue;
      }

      continue;
    }
  }

  fileStoreDisabled = true;
  return null;
}

async function readStore(): Promise<BibleCacheStore> {
  const storePath = await resolveStorePath();
  if (!storePath) {
    return memoryStore;
  }

  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as BibleCacheStore;

    if (parsed?.version !== 1 || typeof parsed.entries !== "object" || !parsed.entries) {
      return createInitialStore();
    }

    memoryStore = parsed;
    return parsed;
  } catch (error) {
    if (isReadOnlyFsError(error)) {
      fileStoreDisabled = true;
      resolvedStorePath = null;
      return memoryStore;
    }

    return createInitialStore();
  }
}

async function writeStore(store: BibleCacheStore): Promise<void> {
  memoryStore = store;

  const storePath = await resolveStorePath();
  if (!storePath) {
    return;
  }

  try {
    await ensureStoreExists(storePath);
    await writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
  } catch (error) {
    if (isReadOnlyFsError(error)) {
      fileStoreDisabled = true;
      resolvedStorePath = null;
    }
  }
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
