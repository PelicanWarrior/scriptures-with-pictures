import * as cheerio from "cheerio";
import { getCachedBibleData } from "@/lib/bible-cache";
import { BibleBook, ChapterData } from "@/lib/types";

const WOL_BOOKS_URL = "https://wol.jw.org/en/wol/binav/r1/lp-e";
const BOOKS_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24;
const CHAPTER_LIST_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24;
const CHAPTER_DATA_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

const CANONICAL_BOOK_NAMES: Record<number, string> = {
  1: "Genesis",
  2: "Exodus",
  3: "Leviticus",
  4: "Numbers",
  5: "Deuteronomy",
  6: "Joshua",
  7: "Judges",
  8: "Ruth",
  9: "1 Samuel",
  10: "2 Samuel",
  11: "1 Kings",
  12: "2 Kings",
  13: "1 Chronicles",
  14: "2 Chronicles",
  15: "Ezra",
  16: "Nehemiah",
  17: "Esther",
  18: "Job",
  19: "Psalms",
  20: "Proverbs",
  21: "Ecclesiastes",
  22: "Song of Solomon",
  23: "Isaiah",
  24: "Jeremiah",
  25: "Lamentations",
  26: "Ezekiel",
  27: "Daniel",
  28: "Hosea",
  29: "Joel",
  30: "Amos",
  31: "Obadiah",
  32: "Jonah",
  33: "Micah",
  34: "Nahum",
  35: "Habakkuk",
  36: "Zephaniah",
  37: "Haggai",
  38: "Zechariah",
  39: "Malachi",
  40: "Matthew",
  41: "Mark",
  42: "Luke",
  43: "John",
  44: "Acts",
  45: "Romans",
  46: "1 Corinthians",
  47: "2 Corinthians",
  48: "Galatians",
  49: "Ephesians",
  50: "Philippians",
  51: "Colossians",
  52: "1 Thessalonians",
  53: "2 Thessalonians",
  54: "1 Timothy",
  55: "2 Timothy",
  56: "Titus",
  57: "Philemon",
  58: "Hebrews",
  59: "James",
  60: "1 Peter",
  61: "2 Peter",
  62: "1 John",
  63: "2 John",
  64: "3 John",
  65: "Jude",
  66: "Revelation",
};

async function fetchWolHtml(url: string, revalidateSeconds: number): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "ScripturesWithPictures/1.0",
    },
    next: {
      revalidate: revalidateSeconds,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch WOL content (${response.status})`);
  }

  return response.text();
}

function normalizeText(text: string): string {
  return text
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\uFFFD]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getBookUrl(bookId: number): string {
  return `https://wol.jw.org/en/wol/binav/r1/lp-e/nwtsty/${bookId}`;
}

function getChapterUrl(bookId: number, chapter: number): string {
  return `https://wol.jw.org/en/wol/b/r1/lp-e/nwtsty/${bookId}/${chapter}`;
}

async function loadBibleBooksFromSource(): Promise<BibleBook[]> {
  const html = await fetchWolHtml(WOL_BOOKS_URL, 60 * 60 * 24);
  const $ = cheerio.load(html);
  const booksMap = new Map<number, BibleBook>();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href") ?? "";
    const match = href.match(/\/en\/wol\/binav\/r1\/lp-e\/nwtsty\/(\d{1,2})$/);

    if (!match) {
      return;
    }

    const id = Number(match[1]);

    if (!Number.isInteger(id) || id < 1 || id > 66) {
      return;
    }

    const name = CANONICAL_BOOK_NAMES[id] ?? normalizeText($(element).text());

    if (!name || /^\d+$/.test(name)) {
      return;
    }

    booksMap.set(id, { id, name });
  });

  return Array.from(booksMap.values()).sort((a, b) => a.id - b.id);
}

export async function getBibleBooks(): Promise<BibleBook[]> {
  return getCachedBibleData({
    key: "books",
    maxAgeMs: BOOKS_CACHE_MAX_AGE_MS,
    loader: loadBibleBooksFromSource,
  });
}

async function loadBookChaptersFromSource(bookId: number): Promise<number[]> {
  if (!Number.isInteger(bookId) || bookId < 1 || bookId > 66) {
    throw new Error("Invalid book id");
  }

  const html = await fetchWolHtml(getBookUrl(bookId), 60 * 60 * 24);
  const $ = cheerio.load(html);
  const chapters = new Set<number>();
  const chapterRegex = new RegExp(`/en/wol/b/r1/lp-e/nwtsty/${bookId}/(\\d{1,3})$`);

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href") ?? "";
    const match = href.match(chapterRegex);

    if (!match) {
      return;
    }

    const chapter = Number(match[1]);
    if (Number.isInteger(chapter) && chapter > 0 && chapter < 200) {
      chapters.add(chapter);
    }
  });

  return Array.from(chapters).sort((a, b) => a - b);
}

export async function getBookChapters(bookId: number): Promise<number[]> {
  return getCachedBibleData({
    key: `book:${bookId}:chapters`,
    maxAgeMs: CHAPTER_LIST_CACHE_MAX_AGE_MS,
    loader: () => loadBookChaptersFromSource(bookId),
  });
}

function parseBookName($: cheerio.CheerioAPI, bookId: number, chapter: number): string {
  const canonical = CANONICAL_BOOK_NAMES[bookId];
  if (canonical) {
    return canonical;
  }

  const navText = normalizeText(
    $("a[href*='/en/wol/binav/r1/lp-e/nwtsty/']").first().text(),
  );

  if (navText) {
    return navText.replace(new RegExp(`\\s+${chapter}$`), "");
  }

  const titleText = normalizeText($("title").text());
  const titleMatch = titleText.match(new RegExp(`^(.+?)\\s+${chapter}(?:\\s|$)`));
  if (titleMatch?.[1]) {
    return titleMatch[1];
  }

  return `Book ${bookId}`;
}

async function loadChapterDataFromSource(bookId: number, chapter: number): Promise<ChapterData> {
  if (!Number.isInteger(bookId) || bookId < 1 || bookId > 66) {
    throw new Error("Invalid book id");
  }

  if (!Number.isInteger(chapter) || chapter < 1 || chapter > 200) {
    throw new Error("Invalid chapter number");
  }

  const html = await fetchWolHtml(getChapterUrl(bookId, chapter), 60 * 60 * 24 * 7);
  const $ = cheerio.load(html);
  const versesMap = new Map<number, string>();

  $("span.v[id^='v']").each((_, element) => {
    const id = $(element).attr("id") ?? "";
    const match = id.match(/^v\d+-\d+-(\d+)-/);

    if (!match) {
      return;
    }

    const verse = Number(match[1]);

    if (!Number.isInteger(verse) || verse < 1 || verse > 200) {
      return;
    }

    const clone = $(element).clone();
    clone.find("a").remove();

    const text = normalizeText(clone.text());

    if (!text) {
      return;
    }

    versesMap.set(verse, text);
  });

  const verses = Array.from(versesMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([verse, text]) => ({ verse, text }));

  if (verses.length === 0) {
    throw new Error("No verses found for this chapter");
  }

  return {
    bookId,
    bookName: parseBookName($, bookId, chapter),
    chapter,
    verses,
  };
}

export async function getChapterData(bookId: number, chapter: number): Promise<ChapterData> {
  return getCachedBibleData({
    key: `book:${bookId}:chapter:${chapter}`,
    maxAgeMs: CHAPTER_DATA_CACHE_MAX_AGE_MS,
    loader: () => loadChapterDataFromSource(bookId, chapter),
  });
}
