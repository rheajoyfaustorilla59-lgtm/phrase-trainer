import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureUserByEmail, getAllProgress, getAllBlocksPerLanguage, getUiLang, setUiLang, getStreak, ensureStreakColumns } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userId = await ensureUserByEmail(
      session.user.email,
      session.user.name,
      session.user.image,
    );

    await ensureStreakColumns();
    const progress = await getAllProgress(userId);
    const blocksByLang = await getAllBlocksPerLanguage(userId);
    const uiLang = await getUiLang(userId);
    const streak = await getStreak(userId);

    return NextResponse.json({ progress, blocksByLang, uiLang, streak });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await req.json()) as { uiLang?: string };

    const userId = await ensureUserByEmail(
      session.user.email,
      session.user.name,
      session.user.image,
    );

    if (body.uiLang) {
      await setUiLang(userId, body.uiLang);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
