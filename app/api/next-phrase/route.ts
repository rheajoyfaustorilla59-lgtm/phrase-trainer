import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ensureUser,
  ensureUserLevel,
  generateAndStoreNextPhrase,
  markPhraseLearned,
} from "@/lib/session";
import type { LanguageCode, LevelCode } from "@/lib/languages";

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

    const response = NextResponse.json({ phrase });
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
