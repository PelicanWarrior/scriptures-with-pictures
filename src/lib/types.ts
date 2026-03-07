export interface BibleBook {
  id: number;
  name: string;
}

export interface ChapterVerse {
  verse: number;
  text: string;
}

export interface ChapterData {
  bookId: number;
  bookName: string;
  chapter: number;
  verses: ChapterVerse[];
}

export interface VerseImageEntry {
  key: string;
  bookId: number;
  chapter: number;
  verse: number;
  imageUrl: string;
  caption: string;
  createdAt: string;
  updatedAt: string;
}
