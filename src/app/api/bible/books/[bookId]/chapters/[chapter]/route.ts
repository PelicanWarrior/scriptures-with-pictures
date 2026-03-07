import { NextRequest, NextResponse } from "next/server";
import { getChapterData } from "@/lib/wol";

interface RouteContext {
  params: Promise<{ bookId: string; chapter: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { bookId, chapter } = await context.params;
    const parsedBookId = Number(bookId);
    const parsedChapter = Number(chapter);

    if (!Number.isInteger(parsedBookId) || parsedBookId < 1 || parsedBookId > 66) {
      return NextResponse.json({ error: "Invalid book id" }, { status: 400 });
    }

    if (!Number.isInteger(parsedChapter) || parsedChapter < 1 || parsedChapter > 200) {
      return NextResponse.json({ error: "Invalid chapter" }, { status: 400 });
    }

    const chapterData = await getChapterData(parsedBookId, parsedChapter);
    return NextResponse.json(chapterData);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load chapter";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
