import { NextResponse } from "next/server";
import type { TelegramUpdate } from "@/lib/telegram";
import {
  sendMessage,
  randomGreeting,
  randomJoke,
  randomFunnyResponse,
  HELP_TEXT,
} from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ─── Handle incoming updates from Telegram ─── */

export async function POST(req: Request) {
  try {
    const update: TelegramUpdate = await req.json();
    const msg = update.message;
    if (!msg?.text || !msg.chat?.id) {
      return NextResponse.json({ ok: true });
    }

    const chatId = msg.chat.id;
    const text = msg.text.trim().toLowerCase();

    // Commands
    if (text === "/start") {
      await sendMessage(chatId, randomGreeting());
      await sendMessage(chatId, HELP_TEXT);
      return NextResponse.json({ ok: true });
    }

    if (text === "/help") {
      await sendMessage(chatId, HELP_TEXT);
      return NextResponse.json({ ok: true });
    }

    if (text === "/funny") {
      await sendMessage(chatId, `😂 ${randomJoke()}`);
      return NextResponse.json({ ok: true });
    }

    if (text === "/languages") {
      await sendMessage(
        chatId,
        "🌍 <b>Available languages</b>\n\nI can help with:\n• English ↔ Cebuano (Bisaya)\n• English ↔ Russian\n• English ↔ Spanish\n• English ↔ French\n• English ↔ Japanese\n• English ↔ Korean\n\nMore coming soon! For now, use the web app to start a full session: https://phrase-trainer-pi.vercel.app",
      );
      return NextResponse.json({ ok: true });
    }

    if (text === "/practice" || text === "/stats") {
      await sendMessage(
        chatId,
        "📱 <b>Full practice sessions are on the web app!</b>\n\nOpen this link to start practicing with flashcards, tests, and tracking:\n\nhttps://phrase-trainer-pi.vercel.app\n\nI'm your friendly preview bot — the real magic happens on the web! 🪄",
      );
      return NextResponse.json({ ok: true });
    }

    // Random messages — funny reply
    await sendMessage(chatId, `🤖 ${randomFunnyResponse()}`);
    await sendMessage(
      chatId,
      `Type /help to see what I can do, or visit the web app to start practicing! 📚`,
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Telegram webhook error:", err);
    return NextResponse.json({ ok: true });
  }
}

/* ─── Set webhook (called manually or via curl) ─── */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (action === "set-webhook") {
    try {
      const { setWebhook } = await import("@/lib/telegram");
      const webhookUrl = `${url.protocol}//${url.host}/api/telegram`;
      await setWebhook(webhookUrl);
      return NextResponse.json({ success: true, webhookUrl });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  }

  return NextResponse.json({
    message: "Telegram bot webhook endpoint. Use ?action=set-webhook to configure.",
  });
}
