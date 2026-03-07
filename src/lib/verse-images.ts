import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { VerseImageEntry } from "@/lib/types";

interface VerseImageStore {
  entries: VerseImageEntry[];
}

const STORE_PATH = path.join(process.cwd(), "data", "verse-images.json");
const TMP_STORE_PATH = path.join("/tmp", "scriptures-with-pictures", "verse-images.json");
const blockedPaths = new Set<string>();
let resolvedStorePath: string | null = null;
let memoryStore: VerseImageStore = { entries: [] };

function makeKey(bookId: number, chapter: number, verse: number): string {
  return `${bookId}:${chapter}:${verse}`;
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

function getCandidatePaths(): string[] {
  const overridePath = process.env.VERSE_IMAGES_PATH;
  const all = [overridePath, STORE_PATH, TMP_STORE_PATH].filter(
    (candidate): candidate is string => Boolean(candidate),
  );

  const deduped = Array.from(new Set(all));
  return deduped.filter((candidate) => !blockedPaths.has(candidate));
}

async function ensureStoreExists(storePath: string): Promise<void> {
  const dir = path.dirname(storePath);
  await mkdir(dir, { recursive: true });

  try {
    await readFile(storePath, "utf8");
  } catch (error) {
    if (isErrno(error) && error.code !== "ENOENT") {
      throw error;
    }

    const initial: VerseImageStore = { entries: [] };
    await writeFile(storePath, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function resolveStorePath(): Promise<string | null> {
  if (resolvedStorePath && !blockedPaths.has(resolvedStorePath)) {
    return resolvedStorePath;
  }

  const candidates = getCandidatePaths();

  for (const candidate of candidates) {
    try {
      await ensureStoreExists(candidate);
      resolvedStorePath = candidate;
      return candidate;
    } catch (error) {
      if (isReadOnlyFsError(error)) {
        blockedPaths.add(candidate);
      }
    }
  }

  resolvedStorePath = null;
  return null;
}

async function readStore(): Promise<VerseImageStore> {
  const storePath = await resolveStorePath();
  if (!storePath) {
    return memoryStore;
  }

  let raw = "";

  try {
    raw = await readFile(storePath, "utf8");
  } catch (error) {
    if (isReadOnlyFsError(error)) {
      blockedPaths.add(storePath);
      if (resolvedStorePath === storePath) {
        resolvedStorePath = null;
      }
      return memoryStore;
    }

    return memoryStore;
  }

  try {
    const parsed = JSON.parse(raw) as VerseImageStore;
    const normalized = {
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    };

    memoryStore = normalized;
    return normalized;
  } catch {
    return memoryStore;
  }
}

async function writeStore(store: VerseImageStore): Promise<void> {
  memoryStore = store;

  let storePath = await resolveStorePath();
  for (let attempt = 0; attempt < 2 && storePath; attempt += 1) {
    try {
      await ensureStoreExists(storePath);
      await writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
      return;
    } catch (error) {
      if (isReadOnlyFsError(error)) {
        blockedPaths.add(storePath);
        if (resolvedStorePath === storePath) {
          resolvedStorePath = null;
        }

        storePath = await resolveStorePath();
        continue;
      }

      return;
    }
  }
}

export function isValidImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function getVerseImageEntries(filters?: {
  bookId?: number;
  chapter?: number;
}): Promise<VerseImageEntry[]> {
  const store = await readStore();

  return store.entries
    .filter((entry) => {
      if (filters?.bookId !== undefined && entry.bookId !== filters.bookId) {
        return false;
      }

      if (filters?.chapter !== undefined && entry.chapter !== filters.chapter) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (a.bookId !== b.bookId) {
        return a.bookId - b.bookId;
      }

      if (a.chapter !== b.chapter) {
        return a.chapter - b.chapter;
      }

      return a.verse - b.verse;
    });
}

export async function upsertVerseImageEntry(input: {
  bookId: number;
  chapter: number;
  verse: number;
  imageUrl: string;
  caption: string;
}): Promise<VerseImageEntry> {
  const store = await readStore();
  const key = makeKey(input.bookId, input.chapter, input.verse);
  const now = new Date().toISOString();

  const existingIndex = store.entries.findIndex((entry) => entry.key === key);

  if (existingIndex >= 0) {
    const updated: VerseImageEntry = {
      ...store.entries[existingIndex],
      imageUrl: input.imageUrl,
      caption: input.caption,
      updatedAt: now,
    };

    store.entries[existingIndex] = updated;
    await writeStore(store);
    return updated;
  }

  const created: VerseImageEntry = {
    key,
    bookId: input.bookId,
    chapter: input.chapter,
    verse: input.verse,
    imageUrl: input.imageUrl,
    caption: input.caption,
    createdAt: now,
    updatedAt: now,
  };

  store.entries.push(created);
  await writeStore(store);
  return created;
}
