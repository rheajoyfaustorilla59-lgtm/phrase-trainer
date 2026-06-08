import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureUserByEmail, getAllProgress, getAllBlocksPerLanguage, getUiLang, setUiLang, getStreak, ensureStreakColumns, getDailyProgress, setDailyGoal, ensureHeartsColumns, getHearts } from "@/lib/session";

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
    await ensureHeartsColumns();
    const progress = await getAllProgress(userId);
    const blocksByLang = await getAllBlocksPerLanguage(userId);
    const uiLang = await getUiLang(userId);
    const streak = await getStreak(userId);
    const daily = await getDailyProgress(userId);
    const hearts = await getHearts(userId);

    return NextResponse.json({ progress, blocksByLang, uiLang, streak, daily, hearts });
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

    const body = (await req.json()) as { uiLang?: string; dailyGoal?: number };

    const userId = await ensureUserByEmail(
      session.user.email,
      session.user.name,
      session.user.image,
    );

    if (body.uiLang) {
      await setUiLang(userId, body.uiLang);
    }
    if (typeof body.dailyGoal === "number" && body.dailyGoal > 0) {
      await setDailyGoal(userId, body.dailyGoal);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
