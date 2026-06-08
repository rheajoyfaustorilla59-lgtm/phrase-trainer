import OpenAI from "openai";
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { languageLabel, levelInfo, type LanguageCode, type LevelCode } from "@/lib/languages";

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: "https://api.deepseek.com",
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { source, target, level, messages } = (await req.json()) as {
    source: LanguageCode;
    target: LanguageCode;
    level: LevelCode;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  };

  const sourceLabel = languageLabel(source);
  const targetLabel = languageLabel(target);
  const lvl = levelInfo(level);

  const system = `You are a warm, encouraging conversation partner helping someone practice spoken ${targetLabel} at CEFR level ${lvl.code}.

How to reply (follow EVERY time):
- Speak mostly in ${targetLabel}, using simple words and grammar appropriate for ${lvl.code}. Keep it to 1–2 short sentences.
- Always end with a simple question to keep the conversation going.
- On a NEW line, add a short ${sourceLabel} translation of what you said, prefixed exactly with "↳ ". This helps the learner understand.
- If the learner's last message has a clear mistake in ${targetLabel}, gently correct it FIRST on its own line prefixed exactly with "✎ ": show the corrected ${targetLabel} and a tiny ${sourceLabel} note in parentheses. Then continue the conversation. If there's no mistake (or they wrote in ${sourceLabel}), skip the correction line.
- Never lecture. Stay friendly, short, and natural. Pick everyday topics (greetings, food, family, hobbies, weather, plans).

Format example:
✎ "Correct phrase here" (short note in ${sourceLabel})
<your ${targetLabel} reply + question>
↳ <${sourceLabel} translation of your reply>`;

  const stream = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [{ role: "system", content: system }, ...messages],
    stream: true,
    max_tokens: 400,
    temperature: 0.8,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? "";
          if (text) controller.enqueue(encoder.encode(text));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
