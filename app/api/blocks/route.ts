import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ensureUserByEmail,
  ensureUserLevel,
  listBlocks,
  getActiveBlock,
  createBlock,
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
    const blocks = await listBlocks(userId, sourceLang, targetLang, level);
    const active = await getActiveBlock(userId, sourceLang, targetLang, level);
    return NextResponse.json({ blocks, activeBlock: active });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      sourceLang: LanguageCode;
      targetLang: LanguageCode;
      level: LevelCode;
      description?: string | null;
      telegramUserId?: string;
    };

    let userId: string;

    if (body.telegramUserId) {
      // Telegram-linked request
      userId = body.telegramUserId;
    } else {
      // Normal web app request — require auth
      const session = await auth();
      if (!session?.user?.email) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }
      userId = await ensureUserByEmail(
        session.user.email,
        session.user.name,
        session.user.image,
      );
    }

    await ensureUserLevel(userId, body.sourceLang, body.targetLang, body.level);

    const block = await createBlock(
      userId,
      body.sourceLang,
      body.targetLang,
      body.level,
      body.description ?? null,
    );
    return NextResponse.json({ block });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
