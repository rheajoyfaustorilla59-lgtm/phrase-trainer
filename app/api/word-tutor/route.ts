import OpenAI from "openai";
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { languageLabel, levelInfo, type LanguageCode, type LevelCode } from "@/lib/languages";

let cachedClient: OpenAI | null = null;
function getClient(): OpenAI {
  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: "https://api.deepseek.com",
    });
  }
  return cachedClient;
}

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

  const system = `You are a friendly ${targetLabel} vocabulary tutor for a ${sourceLabel} speaker at CEFR level ${lvl.code}.

The learner will tell you what they want to learn — a topic (e.g. "food", "at the airport"), or a specific thing ("how do I say 'I'm hungry'?"). Teach them the relevant ${targetLabel} words and short phrases.

How to reply (follow EVERY time):
- Start with ONE short friendly sentence in ${sourceLabel} introducing what you'll teach.
- Then list 5–8 useful items, ONE PER LINE, each formatted EXACTLY as:
  • <word or phrase in ${targetLabel}> — <${sourceLabel} translation>
- Keep vocabulary simple and appropriate for ${lvl.code}.
- Use the • bullet and the " — " separator exactly, so the app can display each item with audio.
- If the learner asks "how do I say X", give the main answer first, then 2–4 related/alternative phrasings, still in the bullet format.
- Do NOT add extra commentary after the list. End right after the last bullet.`;

  const stream = await getClient().chat.completions.create({
    model: "deepseek-chat",
    messages: [{ role: "system", content: system }, ...messages],
    stream: true,
    max_tokens: 600,
    temperature: 0.7,
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
