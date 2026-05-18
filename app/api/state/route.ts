import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ensureUser,
  ensureUserLevel,
  getProgress,
  getWindowPhrases,
} from "@/lib/session";
import { levelInfo, type LanguageCode, type LevelCode } from "@/lib/languages";

export const runtime = "nodejs";

const COOKIE = "uid";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      sourceLang: LanguageCode;
      targetLang: LanguageCode;
      level: LevelCode;
    };

    const cookieStore = await cookies();
    const existing = cookieStore.get(COOKIE)?.value;
    const userId = await ensureUser(existing);

    await ensureUserLevel(userId, body.sourceLang, body.targetLang, body.level);
    const progress = await getProgress(userId, body.sourceLang, body.targetLang, body.level);
    const windowPhrases = await getWindowPhrases(
      userId,
      body.sourceLang,
      body.targetLang,
      body.level,
      progress.current_n,
    );

    const response = NextResponse.json({
      currentN: progress.current_n,
      learnedWordCount: progress.learned_word_count,
      targetWordCount: levelInfo(body.level).targetWords,
      window: windowPhrases,
    });

    if (!existing || existing !== userId) {
      response.cookies.set(COOKIE, userId, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
