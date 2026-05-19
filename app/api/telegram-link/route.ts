import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureUserByEmail, generateLinkCode } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ─── Generate a linking code for the current user ─── */

export async function POST(req: Request) {
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

    const code = await generateLinkCode(userId);

    return NextResponse.json({
      success: true,
      code,
      botUsername: "phrase_trainer_bot", // Replace with your bot's actual username
      instructions: `Open Telegram and send this command to the bot:\n/link ${code}\n\nThe code expires once used.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
