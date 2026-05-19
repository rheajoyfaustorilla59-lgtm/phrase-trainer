import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ensureUserByEmail,
  ensureUserLevel,
  getProgress,
  getWindowPhrases,
} from "@/lib/session";
import { levelInfo, type LanguageCode, type LevelCode } from "@/lib/languages";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await req.json()) as {
      sourceLang: LanguageCode;
      targetLang: LanguageCode;
      level: LevelCode;
    };

    const userId = await ensureUserByEmail(
      session.user.email,
      session.user.name,
      session.user.image,
    );

    await ensureUserLevel(userId, body.sourceLang, body.targetLang, body.level);
    const progress = await getProgress(userId, body.sourceLang, body.targetLang, body.level);
    const windowPhrases = await getWindowPhrases(
      userId,
      body.sourceLang,
      body.targetLang,
      body.level,
      progress.current_n,
    );

    return NextResponse.json({
      currentN: progress.current_n,
      learnedWordCount: progress.learned_word_count,
      targetWordCount: levelInfo(body.level).targetWords,
      window: windowPhrases,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
