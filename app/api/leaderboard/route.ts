import { NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  try {
    const entries = await getLeaderboard();
    return NextResponse.json(entries);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
