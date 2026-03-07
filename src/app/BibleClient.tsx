"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { BibleBook, ChapterData, VerseImageEntry } from "@/lib/types";

type ViewLevel = "books" | "chapters" | "chapter";
type MainTab = "bible" | "upload";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface SaveFormState {
  bookId: string;
  chapter: string;
  verse: string;
  imageUrl: string;
  caption: string;
}

const INITIAL_FORM_STATE: SaveFormState = {
  bookId: "",
  chapter: "",
  verse: "",
  imageUrl: "",
  caption: "",
};

function verseKey(bookId: number, chapter: number, verse: number): string {
  return `${bookId}:${chapter}:${verse}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || `Request failed (${response.status})`);
  }

  return data as T;
}

export function BibleClient(): ReactElement {
  const [activeTab, setActiveTab] = useState<MainTab>("bible");
  const [books, setBooks] = useState<BibleBook[]>([]);
  const [selectedBook, setSelectedBook] = useState<BibleBook | null>(null);
  const [bookChapters, setBookChapters] = useState<number[]>([]);
  const [uploadChapters, setUploadChapters] = useState<number[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [chapterData, setChapterData] = useState<ChapterData | null>(null);
  const [entries, setEntries] = useState<VerseImageEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<VerseImageEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [formState, setFormState] = useState<SaveFormState>(INITIAL_FORM_STATE);
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [saveError, setSaveError] = useState<string>("");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installMessage, setInstallMessage] = useState<string>("");

  const view: ViewLevel = useMemo(() => {
    if (chapterData) {
      return "chapter";
    }

    if (selectedBook) {
      return "chapters";
    }

    return "books";
  }, [chapterData, selectedBook]);

  const entryMap = useMemo(() => {
    const map = new Map<string, VerseImageEntry>();
    for (const entry of entries) {
      map.set(entry.key, entry);
    }
    return map;
  }, [entries]);

  const locationLabel = useMemo(() => {
    if (activeTab === "upload") {
      return "Upload Picture";
    }

    if (!selectedBook) {
      return "Bible Books";
    }

    if (!selectedChapter) {
      return selectedBook.name;
    }

    return `${selectedBook.name} Chapter ${selectedChapter}`;
  }, [activeTab, selectedBook, selectedChapter]);

  const loadBooks = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");

    try {
      const data = await fetchJson<{ books: BibleBook[] }>("/api/bible/books");
      setBooks(data.books);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load books");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };

    const syncInstalledState = (): void => {
      const standalone = mediaQuery.matches || navigatorWithStandalone.standalone === true;
      setIsInstalled(standalone);
    };

    const onBeforeInstallPrompt = (event: Event): void => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setInstallMessage("");
    };

    const onAppInstalled = (): void => {
      setDeferredPrompt(null);
      setIsInstalled(true);
      setInstallMessage("App installed successfully.");
    };

    syncInstalledState();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Install still works without caching if registration fails.
      });
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    mediaQuery.addEventListener("change", syncInstalledState);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      mediaQuery.removeEventListener("change", syncInstalledState);
    };
  }, []);

  async function loadChapters(book: BibleBook): Promise<void> {
    setLoading(true);
    setError("");

    try {
      const data = await fetchJson<{ chapters: number[] }>(`/api/bible/books/${book.id}/chapters`);
      setSelectedBook(book);
      setBookChapters(data.chapters);
      setSelectedChapter(null);
      setChapterData(null);
      setSelectedEntry(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load chapters");
    } finally {
      setLoading(false);
    }
  }

  async function loadChapter(book: BibleBook, chapter: number): Promise<void> {
    setLoading(true);
    setError("");

    try {
      const [chapterResponse, entriesResponse] = await Promise.all([
        fetchJson<ChapterData>(`/api/bible/books/${book.id}/chapters/${chapter}`),
        fetchJson<{ entries: VerseImageEntry[] }>(`/api/verse-images?bookId=${book.id}&chapter=${chapter}`),
      ]);

      setSelectedBook(book);
      setSelectedChapter(chapter);
      setChapterData(chapterResponse);
      setEntries(entriesResponse.entries);
      setSelectedEntry(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load chapter");
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePicture(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaveMessage("");
    setSaveError("");

    const body = {
      bookId: Number(formState.bookId),
      chapter: Number(formState.chapter),
      verse: Number(formState.verse),
      imageUrl: formState.imageUrl.trim(),
      caption: formState.caption.trim(),
    };

    try {
      const response = await fetch("/api/verse-images", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = (await response.json()) as { error?: string; entry?: VerseImageEntry };

      if (!response.ok) {
        throw new Error(data.error || "Failed to save image link");
      }

      setSaveMessage("Picture linked to verse successfully.");

      if (
        selectedBook &&
        selectedChapter &&
        selectedBook.id === body.bookId &&
        selectedChapter === body.chapter
      ) {
        await loadChapter(selectedBook, selectedChapter);
      }
    } catch (saveErr) {
      setSaveError(saveErr instanceof Error ? saveErr.message : "Failed to save image link");
    }
  }

  function handleBack(): void {
    setError("");

    if (view === "chapter") {
      setChapterData(null);
      setSelectedChapter(null);
      setEntries([]);
      setSelectedEntry(null);
      return;
    }

    if (view === "chapters") {
      setSelectedBook(null);
      setBookChapters([]);
      return;
    }
  }

  async function handleUploadBookChange(bookId: number): Promise<void> {
    setSaveMessage("");
    setSaveError("");

    const book = books.find((item) => item.id === bookId);
    if (!book) {
      return;
    }

    setFormState((prev) => ({ ...prev, bookId: String(bookId), chapter: "", verse: "" }));

    try {
      const data = await fetchJson<{ chapters: number[] }>(`/api/bible/books/${bookId}/chapters`);
      setUploadChapters(data.chapters);
    } catch {
      setUploadChapters([]);
    }
  }

  function openBibleTab(): void {
    setActiveTab("bible");
    setSaveMessage("");
    setSaveError("");
  }

  function openUploadTab(): void {
    // Reset form controls each time Upload tab is opened.
    setFormState(INITIAL_FORM_STATE);
    setUploadChapters([]);
    setSaveMessage("");
    setSaveError("");
    setActiveTab("upload");
  }

  async function handleInstallClick(): Promise<void> {
    setInstallMessage("");

    if (isInstalled) {
      setInstallMessage("App is already installed on this device.");
      return;
    }

    if (!deferredPrompt) {
      setInstallMessage(
        "Install prompt is not available in this browser right now. Use your browser menu and choose Add to Home Screen.",
      );
      return;
    }

    setIsInstalling(true);

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;

      if (choice.outcome === "accepted") {
        setInstallMessage("Install request accepted.");
      } else {
        setInstallMessage("Install canceled.");
      }

      setDeferredPrompt(null);
    } finally {
      setIsInstalling(false);
    }
  }

  return (
    <main className="page">
      <section className="panel header">
        <div className="headerTop">
          <h1 className="title">Scriptures with Pictures</h1>
          <div className="headerActions">
            {activeTab === "bible" && view !== "books" ? (
              <button type="button" className="backButton" onClick={handleBack}>
                Back
              </button>
            ) : null}
            <button
              type="button"
              className="primaryButton installButton"
              onClick={() => void handleInstallClick()}
              disabled={isInstalling}
            >
              {isInstalled ? "Installed" : isInstalling ? "Installing..." : "Install App"}
            </button>
          </div>
        </div>
        <div className="location">{locationLabel}</div>
        {installMessage ? <p className="installHint">{installMessage}</p> : null}
        <div className="tabs">
          <button
            type="button"
            className={`tabButton ${activeTab === "bible" ? "tabButtonActive" : ""}`}
            onClick={openBibleTab}
          >
            Bible Books
          </button>
          <button
            type="button"
            className={`tabButton ${activeTab === "upload" ? "tabButtonActive" : ""}`}
            onClick={openUploadTab}
          >
            Upload Picture
          </button>
        </div>
      </section>

      {activeTab === "bible" ? (
        <section className="panel card">
          {view === "books" ? (
            <>
              <h2>Bible Books</h2>
              <div className="gridList">
                {books.map((book) => (
                  <button
                    key={book.id}
                    type="button"
                    className="listButton"
                    onClick={() => void loadChapters(book)}
                  >
                    {book.name}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {view === "chapters" && selectedBook ? (
            <>
              <h2>{selectedBook.name} Chapters</h2>
              <div className="chapterList">
                {bookChapters.map((chapter) => (
                  <button
                    key={chapter}
                    type="button"
                    className="chapterButton"
                    onClick={() => void loadChapter(selectedBook, chapter)}
                  >
                    {chapter}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {view === "chapter" && chapterData ? (
            <>
              <h2>
                {chapterData.bookName} {chapterData.chapter}
              </h2>
              <div className="verses">
                {chapterData.verses.map((verseData) => {
                  const key = verseKey(chapterData.bookId, chapterData.chapter, verseData.verse);
                  const linked = entryMap.get(key);

                  return (
                    <article
                      key={key}
                      className="verseRow"
                      onClick={() => setSelectedEntry(linked ?? null)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedEntry(linked ?? null);
                        }
                      }}
                    >
                      <div className="verseHead">
                        <span className="verseNumber">{verseData.verse}</span>
                        {linked ? <span className="verseMarker">* picture</span> : null}
                      </div>
                      <div
                        className={`verseContent ${
                          linked && selectedEntry?.key === linked.key ? "withImage" : ""
                        }`}
                      >
                        <div>{verseData.text}</div>
                        {linked && selectedEntry?.key === linked.key ? (
                          <div className="inlineImage">
                            <Image
                              src={linked.imageUrl}
                              alt={linked.caption}
                              width={640}
                              height={420}
                              className="verseImage"
                              unoptimized
                            />
                            <div className="caption">{linked.caption}</div>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          ) : null}

          {loading ? <p className="notice">Loading...</p> : null}
          {error ? <p className="notice error">{error}</p> : null}
        </section>
      ) : (
        <section className="panel card">
          <h2>Upload Picture URL</h2>
          <p className="notice">
            Choose the verse, paste an internet image URL, and add a caption.
          </p>

          <form onSubmit={(event) => void handleSavePicture(event)}>
            <div className="formField">
              <label htmlFor="book-select">Book</label>
              <select
                id="book-select"
                value={formState.bookId}
                onChange={(event) => {
                  void handleUploadBookChange(Number(event.target.value));
                }}
                required
              >
                <option value="">Select a book</option>
                {books.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="formField">
              <label htmlFor="chapter-select">Chapter</label>
              <select
                id="chapter-select"
                value={formState.chapter}
                onChange={(event) => setFormState((prev) => ({ ...prev, chapter: event.target.value }))}
                required
              >
                <option value="">Select a chapter</option>
                {uploadChapters.map((chapter) => (
                  <option key={chapter} value={chapter}>
                    {chapter}
                  </option>
                ))}
              </select>
            </div>

            <div className="formField">
              <label htmlFor="verse-input">Verse</label>
              <input
                id="verse-input"
                type="number"
                min={1}
                value={formState.verse}
                onChange={(event) => setFormState((prev) => ({ ...prev, verse: event.target.value }))}
                required
              />
            </div>

            <div className="formField">
              <label htmlFor="image-url">Picture URL</label>
              <input
                id="image-url"
                type="url"
                value={formState.imageUrl}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, imageUrl: event.target.value }))
                }
                placeholder="https://..."
                required
              />
            </div>

            <div className="formField">
              <label htmlFor="caption">Caption</label>
              <textarea
                id="caption"
                value={formState.caption}
                onChange={(event) => setFormState((prev) => ({ ...prev, caption: event.target.value }))}
                required
              />
            </div>

            <button className="primaryButton" type="submit">
              Link Picture To Verse
            </button>
          </form>

          {saveMessage ? <p className="notice">{saveMessage}</p> : null}
          {saveError ? <p className="notice error">{saveError}</p> : null}
        </section>
      )}
    </main>
  );
}
