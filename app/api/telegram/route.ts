import { NextResponse } from "next/server";
import type { TelegramUpdate } from "@/lib/telegram";
import {
  getUserState,
  setUserState,
  clearUserState,
  sendMessage,
  editMessageText,
  answerCallbackQuery,
  languageKeyboard,
  levelKeyboard,
  modeKeyboard,
  actionKeyboard,
  randomGreeting,
  randomJoke,
  randomMistakeReply,
} from "@/lib/telegram";
import type { LanguageCode, LevelCode } from "@/lib/languages";
import { LANGUAGES } from "@/lib/languages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ─── Normalize function (mirrors web app) ─── */

function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:"'()\[\]{}«»¿¡]/g, "")
    .replace(/\s+/g, " ");
}

/* ─── Handle incoming updates ─── */

export async function POST(req: Request) {
  try {
    const update: TelegramUpdate = await req.json();

    // Handle callback queries (button presses)
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.from.id;
      const data = cb.data ?? "";
      const messageId = cb.message?.message_id;

      await answerCallbackQuery(cb.id);

      await handleCallback(chatId, data, messageId);
      return NextResponse.json({ ok: true });
    }

    // Handle text messages
    const msg = update.message;
    if (!msg?.text || !msg.chat?.id) {
      return NextResponse.json({ ok: true });
    }

    const chatId = msg.chat.id;
    const text = msg.text.trim();

    await handleMessage(chatId, text);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Telegram webhook error:", err);
    return NextResponse.json({ ok: true });
  }
}

/* ─── Handle text messages ─── */

async function handleMessage(chatId: number, text: string) {
  const state = getUserState(chatId);
  const lower = text.toLowerCase();

  // Commands always work
  if (lower === "/start") {
    clearUserState(chatId);
    await sendMessage(chatId, randomGreeting());
    await sendMessage(
      chatId,
      "🌍 <b>Let's set up your practice!</b>\n\nFirst, choose your <b>source language</b> (the language you speak):",
      languageKeyboard("source"),
    );
    return;
  }

  if (lower === "/cancel" || lower === "/quit") {
    clearUserState(chatId);
    await sendMessage(chatId, "Session cancelled. Type /start to begin again! 👋");
    return;
  }

  if (lower === "/help") {
    await sendMessage(
      chatId,
      "🤖 <b>Phrase Trainer Bot</b>\n\n/start — Start or restart\n/cancel — Cancel current session\n/funny — Tell me a joke",
    );
    return;
  }

  if (lower === "/funny") {
    await sendMessage(chatId, `😂 ${randomJoke()}`);
    return;
  }

  // If in practice mode, treat text as an answer
  if (state.step === "practice" || state.step === "mistake") {
    await handleAnswer(chatId, text);
    return;
  }

  // Otherwise, ask them to start
  await sendMessage(
    chatId,
    "Type /start to begin practicing! Or /funny for a joke. 😄",
  );
}

/* ─── Handle inline keyboard callbacks ─── */

async function handleCallback(chatId: number, data: string, messageId?: number) {
  const state = getUserState(chatId);
  const [action, value] = data.split(":", 2);

  if (!value) return;

  switch (action) {
    case "source": {
      state.sourceLang = value as LanguageCode;
      state.step = "choose-target";
      setUserState(chatId, state);
      const srcLabel = getLangLabel(value);
      const msg = `🌍 <b>Source:</b> ${srcLabel}\n\nNow choose your <b>target language</b> (the one you want to learn):`;
      if (messageId) {
        await editMessageText(chatId, messageId, msg, languageKeyboard("target", value));
      } else {
        await sendMessage(chatId, msg, languageKeyboard("target", value));
      }
      break;
    }

    case "target": {
      state.targetLang = value as LanguageCode;
      state.step = "choose-level";
      setUserState(chatId, state);
      const srcLabel = getLangLabel(state.sourceLang ?? "");
      const tgtLabel = getLangLabel(value);
      const msg = `🌍 <b>${srcLabel} → ${tgtLabel}</b>\n\nNow choose your <b>level</b>:`;
      if (messageId) {
        await editMessageText(chatId, messageId, msg, levelKeyboard("level"));
      } else {
        await sendMessage(chatId, msg, levelKeyboard("level"));
      }
      break;
    }

    case "level": {
      state.level = value as LevelCode;
      state.step = "choose-mode";
      setUserState(chatId, state);
      const srcLabel = getLangLabel(state.sourceLang ?? "");
      const tgtLabel = getLangLabel(state.targetLang ?? "");
      const msg = `🌍 <b>${srcLabel} → ${tgtLabel} · ${value}</b>\n\nChoose your <b>mode</b>:`;
      if (messageId) {
        await editMessageText(chatId, messageId, msg, modeKeyboard("mode"));
      } else {
        await sendMessage(chatId, msg, modeKeyboard("mode"));
      }
      break;
    }

    case "mode": {
      state.mode = value as "repeat" | "test";
      state.step = "practice";
      setUserState(chatId, state);
      await startPractice(chatId, messageId);
      break;
    }

    case "action": {
      await handleAction(chatId, value, messageId);
      break;
    }
  }
}

/* ─── Start a practice session ─── */

async function startPractice(chatId: number, messageId?: number) {
  const state = getUserState(chatId);
  const srcLabel = getLangLabel(state.sourceLang ?? "");
  const tgtLabel = getLangLabel(state.targetLang ?? "");

  // Fetch phrases from our API
  try {
    // We use the same session-phrases endpoint to get phrases
    // For Telegram, we'll use a different approach: fetch active block or create one
    const res = await fetch(
      `${getBaseUrl()}/api/session-phrases?source=${state.sourceLang}&target=${state.targetLang}&level=${state.level}`,
    );
    if (!res.ok) {
      // No block exists — tell user to use web app to create one first
      await sendMessage(
        chatId,
        `🤔 No blocks found for ${srcLabel} → ${tgtLabel} (${state.level}).\n\nCreate a block first on the web app:\nhttps://phrase-trainer-pi.vercel.app\n\nThen come back here to practice! 📚`,
      );
      clearUserState(chatId);
      return;
    }
    const data = await res.json();
    const phrases = data.phrases ?? [];
    const currentN = data.currentN ?? 0;

    if (phrases.length === 0) {
      await sendMessage(
        chatId,
        `No phrases ready yet! Create a block on the web app first:\nhttps://phrase-trainer-pi.vercel.app`,
      );
      clearUserState(chatId);
      return;
    }

    state.phrases = phrases.map((p: { phrase_index: number; source_text: string; target_text: string }) => ({
      phrase_index: p.phrase_index,
      source_text: p.source_text,
      target_text: p.target_text,
    }));
    state.currentN = currentN;
    setUserState(chatId, state);

    // Show the first phrase
    await showCurrentPhrase(chatId, messageId);
  } catch (err) {
    await sendMessage(
      chatId,
      `⚠️ Could not start practice. Try using the web app first:\nhttps://phrase-trainer-pi.vercel.app`,
    );
    clearUserState(chatId);
  }
}

/* ─── Show current phrase ─── */

async function showCurrentPhrase(chatId: number, messageId?: number) {
  const state = getUserState(chatId);
  const currentPhrase = state.phrases?.find((p) => p.phrase_index > state.currentN);
  const doneCount = state.phrases?.filter((p) => p.phrase_index <= state.currentN).length ?? 0;
  const totalCount = state.phrases?.length ?? 0;
  const srcLabel = getLangLabel(state.sourceLang ?? "");

  if (!currentPhrase) {
    // All done!
    const joke = randomJoke();
    await sendMessage(
      chatId,
      `🎉 <b>Block complete!</b> You answered all ${totalCount} phrases!\n\n😂 ${joke}\n\nType /start to practice again or /funny for another joke.`,
    );
    clearUserState(chatId);
    return;
  }

  const modeTag = state.mode === "test" ? "📝 Test" : "🔁 Repeat";
  const msg = `<b>${modeTag}</b> · ${doneCount + 1}/${totalCount}\n\n<b>${srcLabel}:</b>\n${currentPhrase.source_text}\n\n<i>Type your answer in ${getLangLabel(state.targetLang ?? "")}!</i>`;

  if (messageId) {
    await editMessageText(chatId, messageId, msg, actionKeyboard());
  } else {
    await sendMessage(chatId, msg, actionKeyboard());
  }
}

/* ─── Handle answers during practice ─── */

async function handleAnswer(chatId: number, text: string) {
  const state = getUserState(chatId);
  const currentPhrase = state.phrases?.find((p) => p.phrase_index > state.currentN);

  if (!currentPhrase) {
    await showCurrentPhrase(chatId);
    return;
  }

  const normalizedInput = normalize(text);
  const normalizedCorrect = normalize(currentPhrase.target_text);

  if (state.step === "mistake") {
    // They must type the correct answer to proceed
    if (normalizedInput === normalizedCorrect) {
      state.step = "practice";
      state.currentN = currentPhrase.phrase_index;
      setUserState(chatId, state);
      await showCurrentPhrase(chatId);
    } else {
      await sendMessage(chatId, `Still not quite right! Type the correct answer above to continue. 📝`);
    }
    return;
  }

  if (normalizedInput === normalizedCorrect) {
    // Correct!
    state.currentN = currentPhrase.phrase_index;
    setUserState(chatId, state);
    await sendMessage(chatId, "✅ <b>Correct!</b>");
    await showCurrentPhrase(chatId);
  } else if (state.mode === "test") {
    // Test mode: reset to beginning
    const firstPhrase = state.phrases?.[0];
    state.currentN = firstPhrase ? firstPhrase.phrase_index - 1 : 0;
    state.wrongByPhrase = {};
    setUserState(chatId, state);
    await sendMessage(chatId, `❌ ${randomMistakeReply()}\n\n<b>Test mode:</b> Resetting to the beginning! 🔄`);
    await showCurrentPhrase(chatId);
  } else {
    // Repeat mode: show correct answer
    const prev = state.wrongByPhrase[currentPhrase.phrase_index] ?? [];
    state.wrongByPhrase = {
      ...state.wrongByPhrase,
      [currentPhrase.phrase_index]: [...prev, text],
    };
    state.step = "mistake";
    setUserState(chatId, state);
    await sendMessage(
      chatId,
      `${randomMistakeReply()}\n\n<b>Correct answer:</b>\n${currentPhrase.target_text}\n\n<i>Type the correct answer to continue.</i>`,
    );
  }
}

/* ─── Handle action buttons ─── */

async function handleAction(chatId: number, action: string, messageId?: number) {
  const state = getUserState(chatId);

  switch (action) {
    case "show-answer": {
      const currentPhrase = state.phrases?.find((p) => p.phrase_index > state.currentN);
      if (currentPhrase) {
        await sendMessage(
          chatId,
          `📖 <b>Translation:</b>\n${currentPhrase.target_text}`,
        );
      }
      break;
    }

    case "correct": {
      // Mark as correct and move forward
      const currentPhrase = state.phrases?.find((p) => p.phrase_index > state.currentN);
      if (currentPhrase) {
        state.currentN = currentPhrase.phrase_index;
        state.step = "practice";
        setUserState(chatId, state);
        await sendMessage(chatId, "✅ <b>Got it!</b>");
        await showCurrentPhrase(chatId, messageId);
      }
      break;
    }

    case "quit": {
      clearUserState(chatId);
      await sendMessage(chatId, "Session ended! Come back anytime. Type /start to begin again. 👋");
      break;
    }
  }
}

/* ─── Helpers ─── */

function getLangLabel(code: string): string {
  const lang = LANGUAGES.find((l) => l.code === code);
  return lang ? `${lang.flag ?? ""} ${lang.label}`.trim() : code;
}

function getBaseUrl(): string {
  // In production, use the Vercel URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/* ─── GET: Set webhook or status ─── */

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
    message: "Telegram bot webhook. Use ?action=set-webhook to configure.",
  });
}
