import { LANGUAGES, LEVELS } from "./languages";
import type { LanguageCode, LevelCode } from "./languages";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

/* ─── Types ─── */

export interface TelegramMessage {
  message_id: number;
  chat: { id: number; first_name?: string; username?: string };
  text?: string;
  from?: { id: number; first_name?: string; username?: string };
}

export interface TelegramCallbackQuery {
  id: string;
  from: { id: number; first_name?: string; username?: string };
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramUserState {
  chatId: number;
  step: "idle" | "choose-source" | "choose-target" | "choose-level" | "choose-mode" | "practice" | "mistake";
  sourceLang?: LanguageCode;
  targetLang?: LanguageCode;
  level?: LevelCode;
  mode?: "repeat" | "test";
  phrases?: Array<{
    phrase_index: number;
    source_text: string;
    target_text: string;
  }>;
  currentN: number;
  wrongByPhrase: Record<number, string[]>;
}

/* ─── In-memory state (resets on Vercel cold start — but that's okay for now) ─── */
const userStates = new Map<number, TelegramUserState>();

export function getUserState(chatId: number): TelegramUserState {
  let state = userStates.get(chatId);
  if (!state) {
    state = { chatId, step: "idle", currentN: 0, wrongByPhrase: {} };
    userStates.set(chatId, state);
  }
  return state;
}

export function setUserState(chatId: number, state: TelegramUserState): void {
  userStates.set(chatId, state);
}

export function clearUserState(chatId: number): void {
  userStates.delete(chatId);
}

/* ─── API Helpers ─── */

export async function setWebhook(url: string): Promise<void> {
  if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN not set");
  const res = await fetch(`${TELEGRAM_API}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram setWebhook failed: ${JSON.stringify(data)}`);
}

export async function deleteWebhook(): Promise<void> {
  if (!BOT_TOKEN) return;
  await fetch(`${TELEGRAM_API}/deleteWebhook`, { method: "POST" });
}

export async function sendMessage(
  chatId: number,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  if (!BOT_TOKEN) return;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  };
  if (keyboard) {
    body.reply_markup = JSON.stringify({ inline_keyboard: keyboard });
  }
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  if (!BOT_TOKEN) return;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
  };
  if (keyboard) {
    body.reply_markup = JSON.stringify({ inline_keyboard: keyboard });
  }
  await fetch(`${TELEGRAM_API}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  if (!BOT_TOKEN) return;
  const body: Record<string, unknown> = { callback_query_id: callbackQueryId };
  if (text) body.text = text;
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/* ─── Inline Keyboard Type ─── */
type InlineKeyboard = Array<Array<{ text: string; callback_data: string }>>;

/* ─── Helpers for building keyboards ─── */

export function languageKeyboard(prefix: string, exclude?: string): InlineKeyboard {
  const rows: InlineKeyboard = [];
  let row: InlineKeyboard[0] = [];
  for (const lang of LANGUAGES) {
    if (lang.code === exclude) continue;
    row.push({ text: `${lang.flag ?? ""} ${lang.label}`, callback_data: `${prefix}:${lang.code}` });
    if (row.length === 2) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

export function levelKeyboard(prefix: string): InlineKeyboard {
  return LEVELS.map((l) => [
    { text: `${l.code} (${l.targetWords >= 1000 ? `${l.targetWords / 1000}k` : l.targetWords} words)`, callback_data: `${prefix}:${l.code}` },
  ]);
}

export function modeKeyboard(prefix: string): InlineKeyboard {
  return [
    [{ text: "🔁 Repeat (forgiving)", callback_data: `${prefix}:repeat` }],
    [{ text: "📝 Test (strict)", callback_data: `${prefix}:test` }],
  ];
}

export function actionKeyboard(): InlineKeyboard {
  return [
    [{ text: "📖 Show answer", callback_data: "action:show-answer" }],
    [{ text: "✅ Got it! Next →", callback_data: "action:correct" }],
    [{ text: "❌ Quit", callback_data: "action:quit" }],
  ];
}

/* ─── Funny stuff ─── */

const GREETINGS = [
  "Oy! Welcome to Phrase Trainer! I'm your language buddy. Ready to embarrass yourself? Let's go! 🇵🇭",
  "Hey hey! You found me! I teach languages and tell terrible jokes. Two for one! 🎤",
  "Welcome, brave learner! I'm a bot that teaches phrases AND roasts you. Deal? 🤝",
  "Sup! I'll help you learn Cebuano, Russian, Spanish, and more. Let's get wrong together! 💪",
];

const JOKES = [
  "Why do Cebuano speakers make great comedians? Great 'Bisaya'! 😄",
  "How do you say 'I love you' in Cebuano? 'Gihigugma tika'. Now say it 10 times fast. Good luck!",
  "Learning Cebuano is easy: just add 'ba' at the end. 'Kumusta ka ba?' See? Fluent!",
  "Your accent is like a fingerprint — unique and slightly confusing. Own it!",
  "I asked AI to write a Cebuano joke. It said: 'Wa ko kabalo' (I don't know). Solid!",
];

const MISTAKE_REPLIES = [
  "Not quite! But your keyboard is so brave. 🫡",
  "Oof. That was… a choice. I respect choices. ❤️",
  "Wrong! But you're one mistake closer to getting it right. Math checks out.",
  "If confidence was a language, you'd be fluent. Wrong, but fluent. ✨",
  "The AI is laughing. Not at you. With you. Mostly at you. 😄",
  "That answer belongs in a museum. Of wrong answers. But still!",
  "Bold move. Let's see if it pays off. (It didn't.)",
  "Almost! … if 'almost' means 'not at all'. Proud of you anyway.",
  "You typed words! They were the wrong words, but words nonetheless. 📝",
];

export function randomGreeting(): string { return GREETINGS[Math.floor(Math.random() * GREETINGS.length)]; }
export function randomJoke(): string { return JOKES[Math.floor(Math.random() * JOKES.length)]; }
export function randomMistakeReply(): string { return MISTAKE_REPLIES[Math.floor(Math.random() * MISTAKE_REPLIES.length)]; }
