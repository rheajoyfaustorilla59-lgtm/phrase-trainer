const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

export interface TelegramMessage {
  message_id: number;
  chat: { id: number; first_name?: string; username?: string };
  text?: string;
  from?: { id: number; first_name?: string; username?: string };
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

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

export async function sendMessage(
  chatId: number,
  text: string,
): Promise<void> {
  if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN not set");
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
  });
}

export async function deleteWebhook(): Promise<void> {
  if (!BOT_TOKEN) return;
  await fetch(`${TELEGRAM_API}/deleteWebhook`, { method: "POST" });
}

/* ─── Funny replies ─── */

const GREETINGS = [
  "Oy! Welcome to Phrase Trainer! I'm your language buddy. Ready to embarrass yourself? Let's go! 🇵🇭",
  "Hey hey! You found me! I teach Cebuano and other languages. Warning: I'm also a comedian. 🎤",
  "Welcome, brave language learner! I'm a bot that teaches phrases AND makes terrible jokes. Two for one! 🎉",
  "Sup! I'm the Phrase Trainer Bot. I'll help you learn Cebuano. I'll also roast you when you're wrong. Deal? 🤝",
];

const HELP_TEXT = `🤖 <b>Phrase Trainer Bot</b>

I help you practice phrases in different languages!

<b>Commands:</b>
/practice — Start a practice session
/stats — Your learning stats
/languages — Available languages
/help — This message
/funny — I'll tell you a joke
/start — Start over

Just type any word and I'll help you learn!`;

const FUNNY_RESPONSES = [
  "You typed something! That's already a win in my book. 📖",
  "I don't know what that means, but I like your energy! 🔥",
  "Interesting choice of words. Very… creative. I respect it.",
  "Are you trying to speak Cebuano already? Because that wasn't it. But nice try! 😄",
  "I'm a bot, not a miracle worker. Baby steps!",
  "That made me laugh. In a good way. Mostly.",
  "Error 404: Translation not found. But your effort is noted! 👍",
  "Not bad for a human. Not good either. But not bad.",
];

const JOKES = [
  "Why do Cebuano speakers make great comedians? Because they have great 'Bisaya'! 😄",
  "What do you call a Cebuano who speaks English? Bilingual. What do you call an English speaker who speaks Cebuano? Brave!",
  "How do you say 'I love you' in Cebuano? 'Gihigugma tika'. Now say it 10 times fast. Good luck!",
  "Learning Cebuano is easy: just add 'ba' at the end of every sentence. 'Kumusta ka ba?' See? You're fluent!",
  "What's the Cebuano word for 'keyboard'? 'Teclado'. Yes, we just borrowed it from Spanish. We're efficient like that.",
];

export function randomGreeting(): string {
  return GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
}

export function randomJoke(): string {
  return JOKES[Math.floor(Math.random() * JOKES.length)];
}

export function randomFunnyResponse(): string {
  return FUNNY_RESPONSES[Math.floor(Math.random() * FUNNY_RESPONSES.length)];
}

export { HELP_TEXT };
