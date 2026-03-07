import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { VerseImageEntry } from "@/lib/types";

interface VerseImageStore {
  entries: VerseImageEntry[];
}

const STORE_PATH = path.join(process.cwd(), "data", "verse-images.json");

function makeKey(bookId: number, chapter: number, verse: number): string {
  return `${bookId}:${chapter}:${verse}`;
}

async function ensureStoreExists(): Promise<void> {
  const dir = path.dirname(STORE_PATH);
  await mkdir(dir, { recursive: true });

  try {
    await readFile(STORE_PATH, "utf8");
  } catch {
    const initial: VerseImageStore = { entries: [] };
    await writeFile(STORE_PATH, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function readStore(): Promise<VerseImageStore> {
  await ensureStoreExists();
  const raw = await readFile(STORE_PATH, "utf8");

  try {
    const parsed = JSON.parse(raw) as VerseImageStore;
    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    };
  } catch {
    return { entries: [] };
  }
}

async function writeStore(store: VerseImageStore): Promise<void> {
  await ensureStoreExists();
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
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
