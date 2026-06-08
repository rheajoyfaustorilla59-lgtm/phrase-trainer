import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureUserByEmail, ensureHeartsColumns, getHearts, loseHeart } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const userId = await ensureUserByEmail(session.user.email, session.user.name, session.user.image);
    await ensureHeartsColumns();
    const hearts = await getHearts(userId);
    return NextResponse.json(hearts);
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
    const userId = await ensureUserByEmail(session.user.email, session.user.name, session.user.image);
    await ensureHeartsColumns();

    const body = (await req.json().catch(() => ({}))) as { action?: string };
    const hearts = body.action === "lose" ? await loseHeart(userId) : await getHearts(userId);
    return NextResponse.json(hearts);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
