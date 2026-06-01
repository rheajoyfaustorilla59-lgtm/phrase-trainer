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
import { getUserIdByLinkCode, linkTelegramChat, getUserIdByTelegramChat } from "@/lib/session";

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

    // Check if Telegram is linked to a web app account
    const linkedUserId = await getUserIdByTelegramChat(chatId);
    if (linkedUserId) {
      await sendMessage(
        chatId,
        "🔗 Your Telegram is linked to your Phrase Trainer account! You can practice directly.\n\nChoose your <b>source language</b>:",
        languageKeyboard("source"),
      );
    } else {
      await sendMessage(
        chatId,
        "🌍 <b>Let's set up your practice!</b>\n\nFirst, choose your <b>source language</b> (the language you speak):",
        languageKeyboard("source"),
      );
    }
    return;
  }

  // Handle /link command: /link ABC123
  if (lower.startsWith("/link ")) {
    const code = text.slice(6).trim().toUpperCase();
    if (code.length < 4) {
      await sendMessage(chatId, "❌ Invalid code. Please use the code from the web app dashboard.");
      return;
    }
    const userId = await getUserIdByLinkCode(code);
    if (!userId) {
      await sendMessage(chatId, "❌ Invalid or expired code. Generate a new one from the web app dashboard.");
      return;
    }
    await linkTelegramChat(userId, chatId);
    await sendMessage(
      chatId,
      "✅ <b>Telegram linked successfully!</b>\n\nYour Telegram account is now connected to your Phrase Trainer account. You can practice directly here!\n\nType /start to begin. 📚",
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
      "🤖 <b>Phrase Trainer Bot</b>\n\n/start — Start or restart\n/link CODE — Link to your web app account\n/cancel — Cancel current session\n/funny — Tell me a joke\n\nTo get a linking code, go to the web app dashboard and click 'Link Telegram'.",
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

  // Check if user is linked
  const linkedUserId = await getUserIdByTelegramChat(chatId);

  try {
    // Try fetching existing session (using linked user ID if available)
    let sessionUrl = `${getBaseUrl()}/api/session-phrases?source=${state.sourceLang}&target=${state.targetLang}&level=${state.level}`;
    if (linkedUserId) {
      sessionUrl += `&telegram_user_id=${linkedUserId}`;
    }

    const res = await fetch(sessionUrl);

    if (res.ok) {
      const data = await res.json();
      const phrases = data.phrases ?? [];
      const currentN = data.currentN ?? 0;

      if (phrases.length > 0) {
        state.phrases = phrases.map((p: { phrase_index: number; source_text: string; target_text: string }) => ({
          phrase_index: p.phrase_index,
          source_text: p.source_text,
          target_text: p.target_text,
        }));
        state.currentN = currentN;
        setUserState(chatId, state);
        await showCurrentPhrase(chatId, messageId);
        return;
      }
    }

    // No block — create one if user is linked
    if (!linkedUserId) {
      await sendMessage(
        chatId,
        `🤔 No blocks found for ${srcLabel} → ${tgtLabel} (${state.level}).\n\nLink your Telegram account first via the web app dashboard, then try again! 📚`,
      );
      clearUserState(chatId);
      return;
    }

    // Create a block automatically!
    await sendMessage(chatId, `⏳ Creating a new block for you (${tgtLabel} · ${state.level})… This may take a moment.`);

    const createRes = await fetch(`${getBaseUrl()}/api/blocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceLang: state.sourceLang,
        targetLang: state.targetLang,
        level: state.level,
        description: null, // auto-generate
        telegramUserId: linkedUserId,
      }),
    });

    if (!createRes.ok) {
      const errData = await createRes.json().catch(() => ({}));
      console.error("Block creation failed:", createRes.status, JSON.stringify(errData));
      throw new Error(errData.error ?? `Server responded with ${createRes.status}`);
    }

    // Now fetch the freshly created session
    const sessionRes = await fetch(
      `${getBaseUrl()}/api/session-phrases?source=${state.sourceLang}&target=${state.targetLang}&level=${state.level}&telegram_user_id=${linkedUserId}`,
    );
    if (!sessionRes.ok) throw new Error("Failed to load session after creating block");

    const sessionData = await sessionRes.json();
    const phrases = sessionData.phrases ?? [];
    const currentN = sessionData.currentN ?? 0;

    if (phrases.length === 0) throw new Error("Block created but no phrases found");

    state.phrases = phrases.map((p: { phrase_index: number; source_text: string; target_text: string }) => ({
      phrase_index: p.phrase_index,
      source_text: p.source_text,
      target_text: p.target_text,
    }));
    state.currentN = currentN;
    setUserState(chatId, state);

    await sendMessage(chatId, `✨ Block created: "${sessionData.block?.description ?? "Auto-generated"}"`);
    await showCurrentPhrase(chatId, messageId);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("startPractice error:", errorMsg);
    if (linkedUserId) {
      await sendMessage(
        chatId,
        `⚠️ Could not create a block. Error: ${errorMsg}`,
      );
    } else {
      await sendMessage(
        chatId,
        `⚠️ No blocks found. Link your Telegram account first via the web app dashboard:\nhttps://phrase-trainer-pi.vercel.app`,
      );
    }
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
