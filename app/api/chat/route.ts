import OpenAI from "openai";
import { NextRequest } from "next/server";
import { auth } from "@/auth";

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

  const { messages } = (await req.json()) as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  };

  const stream = await getClient().chat.completions.create({
    model: "deepseek-chat",
    messages: [
      {
        role: "system",
        content:
          "You are a helpful AI assistant inside Phrase Trainer, a language learning app. Help with anything the user asks — grammar, vocabulary, culture, translation, or just casual conversation. Be friendly, clear, and concise.",
      },
      ...messages,
    ],
    stream: true,
    max_tokens: 800,
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
