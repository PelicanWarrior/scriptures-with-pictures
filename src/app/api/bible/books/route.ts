import { NextResponse } from "next/server";
import { getBibleBooks } from "@/lib/wol";

export async function GET(): Promise<NextResponse> {
  try {
    const books = await getBibleBooks();
    return NextResponse.json({ books });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load books";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
