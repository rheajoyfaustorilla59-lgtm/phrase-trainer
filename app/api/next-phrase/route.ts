import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ensureUserByEmail,
  ensureUserLevel,
  getNextPendingPhrase,
  markPhraseLearned,
  updateStreak,
} from "@/lib/session";
import type { LanguageCode, LevelCode } from "@/lib/languages";

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

    const phrase = await getNextPendingPhrase(
      userId,
      body.sourceLang,
      body.targetLang,
      body.level,
    );
    if (!phrase) {
      return NextResponse.json(
        { needsBlock: true, error: "No more phrases — create a new block." },
        { status: 409 },
      );
    }

    await markPhraseLearned(
      userId,
      body.sourceLang,
      body.targetLang,
      body.level,
      phrase.phrase_index,
      phrase.new_words.length,
    );

    await updateStreak(userId);

    return NextResponse.json({ phrase });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
