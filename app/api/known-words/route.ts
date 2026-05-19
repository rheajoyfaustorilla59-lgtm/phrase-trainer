import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ensureUserByEmail,
  ensureUserLevel,
  getAllKnownWords,
  deleteKnownWord,
} from "@/lib/session";
import type { LanguageCode, LevelCode } from "@/lib/languages";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const url = new URL(req.url);
    const sourceLang = url.searchParams.get("source") as LanguageCode | null;
    const targetLang = url.searchParams.get("target") as LanguageCode | null;
    const level = url.searchParams.get("level") as LevelCode | null;
    if (!sourceLang || !targetLang || !level) {
      return NextResponse.json({ error: "Missing source/target/level" }, { status: 400 });
    }

    const userId = await ensureUserByEmail(
      session.user.email,
      session.user.name,
      session.user.image,
    );

    await ensureUserLevel(userId, sourceLang, targetLang, level);
    const words = await getAllKnownWords(userId, sourceLang, targetLang, level);

    return NextResponse.json({ words, count: words.length });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const url = new URL(req.url);
    const sourceLang = url.searchParams.get("source") as LanguageCode | null;
    const targetLang = url.searchParams.get("target") as LanguageCode | null;
    const level = url.searchParams.get("level") as LevelCode | null;
    const word = url.searchParams.get("word");
    if (!sourceLang || !targetLang || !level || !word) {
      return NextResponse.json({ error: "Missing source/target/level/word" }, { status: 400 });
    }

    const userId = await ensureUserByEmail(
      session.user.email,
      session.user.name,
      session.user.image,
    );

    await deleteKnownWord(userId, sourceLang, targetLang, level, word);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
