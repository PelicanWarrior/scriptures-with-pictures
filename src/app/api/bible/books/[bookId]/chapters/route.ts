import { NextRequest, NextResponse } from "next/server";
import { getBookChapters } from "@/lib/wol";

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { bookId } = await context.params;
    const parsedBookId = Number(bookId);

    if (!Number.isInteger(parsedBookId) || parsedBookId < 1 || parsedBookId > 66) {
      return NextResponse.json({ error: "Invalid book id" }, { status: 400 });
    }

    const chapters = await getBookChapters(parsedBookId);
    return NextResponse.json({ bookId: parsedBookId, chapters });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load chapters";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
