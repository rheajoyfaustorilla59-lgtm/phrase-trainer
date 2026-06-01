import OpenAI from "openai";
import { languageLabel, levelInfo, type LanguageCode, type LevelCode } from "./languages";

let cachedClient: OpenAI | null = null;
function getClient(): OpenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not set. Add it to .env.local or your hosting env vars.");
  }
  cachedClient = new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });
  return cachedClient;
}

export type GeneratedPhrase = {
  source_text: string;
  target_text: string;
  new_words: string[];
};

export async function generatePhrase(params: {
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  level: LevelCode;
  knownWords: string[];
  recentPhrases: string[];
  phraseIndex: number;
}): Promise<GeneratedPhrase> {
  const sourceLabel = languageLabel(params.sourceLang);
  const targetLabel = languageLabel(params.targetLang);
  const level = levelInfo(params.level);

  const knownList = params.knownWords.slice(-200);
  const recent = params.recentPhrases.slice(-5);

  const system = `You generate language-learning phrases for a memorization app.

Hard rules:
- The phrase in ${targetLabel} must contain between 2 and 5 words (inclusive).
- Vocabulary and grammar must match CEFR level ${level.code} (~${level.targetWords} total target words).
- Use words appropriate for ${level.code}; never pull obscure or higher-level vocabulary.
- Provide an accurate translation in ${sourceLabel}.
- Output ONLY a JSON object, no markdown, no commentary.

Variety rules (very important):
- Every word in the phrase should be DIFFERENT from words in the known vocabulary list whenever possible. Aim for fully new vocabulary in each phrase.
- The phrase MUST introduce at least 2 brand-new words. If only 1 word can be new, still emit only fully novel content elsewhere.
- The new phrase must NOT repeat the theme, structure, or topic of the recent phrases (e.g. if recent phrases are greetings, do NOT generate another greeting; pick a completely new domain like food, family, weather, numbers, places, feelings, etc.).
- Rotate domains aggressively: each new phrase should explore a new everyday topic.

Output schema:
{
  "source_text": "translation in ${sourceLabel}",
  "target_text": "phrase in ${targetLabel} (2-5 words)",
  "new_words": ["new", "words", "introduced"]
}`;

  const user = `Generate phrase #${params.phraseIndex + 1} for a ${level.code} learner.
Source language: ${sourceLabel}
Target language: ${targetLabel}

Already-known ${targetLabel} words (do NOT count any of these as "new"):
${knownList.length ? knownList.join(", ") : "(none yet — this is the first phrase)"}

Recent phrases (avoid these themes, structures, and overlapping words):
${recent.length ? recent.map((p, i) => `${i + 1}. ${p}`).join("\n") : "(none yet)"}

Pick a completely fresh topic and emit a phrase with maximum new vocabulary. Return JSON only.`;

  const completion = await getClient().chat.completions.create({
    model: "deepseek-chat",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
    temperature: 1.0,
    max_tokens: 200,
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("DeepSeek returned empty content");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`DeepSeek returned invalid JSON: ${raw.slice(0, 200)}`);
  }

  const phrase = parsed as Partial<GeneratedPhrase>;
  if (
    typeof phrase.source_text !== "string" ||
    typeof phrase.target_text !== "string" ||
    !Array.isArray(phrase.new_words)
  ) {
    throw new Error(`DeepSeek response missing required fields: ${raw.slice(0, 200)}`);
  }

  const wordCount = phrase.target_text.trim().split(/\s+/).length;
  if (wordCount < 2 || wordCount > 5) {
    throw new Error(`Phrase has ${wordCount} words (must be 2-5): "${phrase.target_text}"`);
  }

  const knownSet = new Set(params.knownWords.map((w) => w.toLowerCase()));
  const newWords = phrase.new_words
    .filter((w): w is string => typeof w === "string")
    .map((w) => w.toLowerCase().trim())
    .filter((w) => w.length > 0 && !knownSet.has(w));

  return {
    source_text: phrase.source_text.trim(),
    target_text: phrase.target_text.trim(),
    new_words: newWords,
  };
}

export type BlockPhrase = {
  source_text: string;
  target_text: string;
};

export type GeneratedBlock = {
  description: string;
  phrases: BlockPhrase[];
};

export async function generateBlock(params: {
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  level: LevelCode;
  knownWords: string[];
  userDescription: string | null;
  phraseCount: number;
}): Promise<GeneratedBlock> {
  const sourceLabel = languageLabel(params.sourceLang);
  const targetLabel = languageLabel(params.targetLang);
  const level = levelInfo(params.level);
  const knownList = params.knownWords.slice(-300);

  const requestCount = params.phraseCount + 8;

  const system = `You generate themed blocks of language-learning phrases.

A block is a coherent set of ${requestCount} phrases connected by a theme or topic.

Hard rules:
- Generate exactly ${requestCount} phrases in ${targetLabel}.
- Every phrase must contain between 2 and 5 words.
- Vocabulary and grammar must match CEFR level ${level.code} (~${level.targetWords} total target words).
- Use simple words appropriate for ${level.code}; never pull obscure or higher-level vocabulary.
- Each phrase must introduce at least 1 NEW word not in the known list. Aim for fresh vocabulary across the block.
- Phrases within the block should connect to the theme/topic but explore different angles (don't repeat the same sentence pattern).
- Provide accurate ${sourceLabel} translations.

If the user gives a description, follow it. If empty, pick a useful everyday topic (food, family, weather, travel, feelings, work, time, places, body, numbers, etc.) suited to the level.

Output ONLY a JSON object. Schema:
{
  "description": "short theme label (3-6 words)",
  "phrases": [
    { "source_text": "translation in ${sourceLabel}", "target_text": "phrase in ${targetLabel}" },
    ...
  ]
}`;

  const user = `Source: ${sourceLabel}
Target: ${targetLabel}
Level: ${level.code}
Phrases per block: ${requestCount}

User description (theme guidance):
${params.userDescription?.trim() ? params.userDescription.trim() : "(empty — pick a fresh, useful theme yourself)"}

Already-known ${targetLabel} words (do NOT count any as new; prefer fully novel vocabulary):
${knownList.length ? knownList.join(", ") : "(none yet)"}

Return JSON only.`;

  const completion = await getClient().chat.completions.create({
    model: "deepseek-chat",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
    temperature: 0.9,
    max_tokens: 1600,
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("DeepSeek returned empty content");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`DeepSeek returned invalid JSON: ${raw.slice(0, 200)}`);
  }

  const block = parsed as Partial<GeneratedBlock>;
  if (typeof block.description !== "string" || !Array.isArray(block.phrases)) {
    throw new Error(`Block response missing fields: ${raw.slice(0, 200)}`);
  }
  if (block.phrases.length === 0) {
    throw new Error("Block returned zero phrases");
  }

  const phrases: BlockPhrase[] = [];
  for (const p of block.phrases) {
    if (phrases.length >= params.phraseCount) break;
    if (
      typeof (p as BlockPhrase).source_text !== "string" ||
      typeof (p as BlockPhrase).target_text !== "string"
    )
      continue;
    const target = (p as BlockPhrase).target_text.trim();
    const count = target.split(/\s+/).length;
    if (count < 2 || count > 5) continue;
    phrases.push({
      source_text: (p as BlockPhrase).source_text.trim(),
      target_text: target,
    });
  }
  if (phrases.length === 0) {
    throw new Error("All phrases in block failed validation (word count 2-5)");
  }

  return {
    description: block.description.trim(),
    phrases,
  };
}

export function tokenizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[.,!?;:"'()\[\]{}«»¿¡]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

export function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:"'()\[\]{}«»¿¡]/g, "")
    .replace(/\s+/g, " ");
}
