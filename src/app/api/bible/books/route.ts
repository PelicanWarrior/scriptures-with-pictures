import { NextResponse } from "next/server";
import { getBibleBooks } from "@/lib/wol";

export async function GET(): Promise<NextResponse> {
  try {
    const books = await getBibleBooks();
    return NextResponse.json(
      { books },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load books";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
