import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ensureUserByEmail,
  ensureUserLevel,
  generateAndStoreNextPhrase,
  markPhraseLearned,
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

    const phrase = await generateAndStoreNextPhrase(
      userId,
      body.sourceLang,
      body.targetLang,
      body.level,
    );

    await markPhraseLearned(
      userId,
      body.sourceLang,
      body.targetLang,
      body.level,
      phrase.phrase_index,
      phrase.new_words.length,
    );

    return NextResponse.json({ phrase });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
