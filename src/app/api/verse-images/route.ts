import { NextRequest, NextResponse } from "next/server";
import {
  getVerseImageEntries,
  isValidImageUrl,
  upsertVerseImageEntry,
} from "@/lib/verse-images";

function parseOptionalNumber(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const bookId = parseOptionalNumber(url.searchParams.get("bookId"));
    const chapter = parseOptionalNumber(url.searchParams.get("chapter"));

    const entries = await getVerseImageEntries({ bookId, chapter });
    return NextResponse.json({ entries });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load verse images";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();

    const bookId = Number(body?.bookId);
    const chapter = Number(body?.chapter);
    const verse = Number(body?.verse);
    const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
    const caption = typeof body?.caption === "string" ? body.caption.trim() : "";

    if (!Number.isInteger(bookId) || bookId < 1 || bookId > 66) {
      return NextResponse.json({ error: "Invalid book id" }, { status: 400 });
    }

    if (!Number.isInteger(chapter) || chapter < 1 || chapter > 200) {
      return NextResponse.json({ error: "Invalid chapter" }, { status: 400 });
    }

    if (!Number.isInteger(verse) || verse < 1 || verse > 300) {
      return NextResponse.json({ error: "Invalid verse" }, { status: 400 });
    }

    if (!isValidImageUrl(imageUrl)) {
      return NextResponse.json({ error: "Image URL must be a valid http/https URL" }, { status: 400 });
    }

    if (!caption) {
      return NextResponse.json({ error: "Caption is required" }, { status: 400 });
    }

    const entry = await upsertVerseImageEntry({
      bookId,
      chapter,
      verse,
      imageUrl,
      caption,
    });

    return NextResponse.json({ entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save verse image";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
