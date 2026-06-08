import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureUserByEmail, ensureUserLevel, getAllKnownWords } from "@/lib/session";
import { generateStory } from "@/lib/deepseek";
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

    const userId = await ensureUserByEmail(session.user.email, session.user.name, session.user.image);
    await ensureUserLevel(userId, sourceLang, targetLang, level);

    const knownWords = await getAllKnownWords(userId, sourceLang, targetLang, level);
    const story = await generateStory({ sourceLang, targetLang, level, knownWords });

    return NextResponse.json(story);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
