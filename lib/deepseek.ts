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
- The phrase in ${targetLabel} must contain between ${level.minWords} and ${level.maxWords} words (inclusive). Count carefully — phrases outside this range will be REJECTED.
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
  "target_text": "phrase in ${targetLabel} (${level.minWords}-${level.maxWords} words)",
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
  if (wordCount < level.minWords || wordCount > level.maxWords) {
    throw new Error(`Phrase has ${wordCount} words (must be ${level.minWords}-${level.maxWords}): "${phrase.target_text}"`);
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

  const requestCount = params.phraseCount * 2 + 5;

  const system = `You generate themed blocks of language-learning phrases.

A block is a coherent set of ${requestCount} phrases connected by a theme or topic.

Hard rules:
- Generate exactly ${requestCount} phrases in ${targetLabel}.
- CRITICAL: Every phrase must contain between ${level.minWords} and ${level.maxWords} words (count carefully — phrases outside this range will be REJECTED).
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
    max_tokens: 4000,
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
    if (count < level.minWords || count > level.maxWords) continue;
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

export type StorySentence = { target: string; source: string };
export type StoryQuestion = { question: string; options: string[]; answerIndex: number };
export type GeneratedStory = {
  title: string;
  titleSource: string;
  sentences: StorySentence[];
  questions: StoryQuestion[];
};

export async function generateStory(params: {
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  level: LevelCode;
  knownWords: string[];
}): Promise<GeneratedStory> {
  const sourceLabel = languageLabel(params.sourceLang);
  const targetLabel = languageLabel(params.targetLang);
  const level = levelInfo(params.level);
  const knownList = params.knownWords.slice(-300);

  const system = `You write tiny, delightful short stories to help language learners see their vocabulary in context.

Hard rules:
- Write a SHORT story in ${targetLabel}: 5 to 8 sentences. Give it a fun, simple title in ${targetLabel}.
- Strongly prefer words the learner already knows (listed below). You may introduce a FEW new words, but keep grammar and vocabulary within CEFR level ${level.code}.
- Keep sentences short and clear — appropriate for a ${level.code} learner.
- Provide an accurate ${sourceLabel} translation for EVERY sentence and for the title.
- Write exactly 3 comprehension questions ABOUT the story, written in ${sourceLabel}, each with 3 options (also in ${sourceLabel}) and exactly one correct answer.
- Output ONLY a JSON object — no markdown, no commentary.

Output schema:
{
  "title": "title in ${targetLabel}",
  "title_source": "title translated to ${sourceLabel}",
  "sentences": [
    { "target": "sentence in ${targetLabel}", "source": "translation in ${sourceLabel}" }
  ],
  "questions": [
    { "question": "question in ${sourceLabel}", "options": ["opt A", "opt B", "opt C"], "answerIndex": 0 }
  ]
}`;

  const user = `Source language: ${sourceLabel}
Target language: ${targetLabel}
Level: ${level.code}

Words the learner already knows (build the story mostly from these):
${knownList.length ? knownList.join(", ") : "(very few yet — keep it extremely simple and basic)"}

Write the story now. Return JSON only.`;

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

  const story = parsed as {
    title?: unknown;
    title_source?: unknown;
    sentences?: unknown;
    questions?: unknown;
  };

  if (typeof story.title !== "string" || !Array.isArray(story.sentences) || !Array.isArray(story.questions)) {
    throw new Error(`Story response missing required fields: ${raw.slice(0, 200)}`);
  }

  const sentences: StorySentence[] = story.sentences
    .filter(
      (s): s is StorySentence =>
        !!s && typeof (s as StorySentence).target === "string" && typeof (s as StorySentence).source === "string",
    )
    .map((s) => ({ target: s.target.trim(), source: s.source.trim() }))
    .filter((s) => s.target.length > 0);

  if (sentences.length === 0) throw new Error("Story returned zero usable sentences");

  const questions: StoryQuestion[] = story.questions
    .filter(
      (q): q is StoryQuestion =>
        !!q &&
        typeof (q as StoryQuestion).question === "string" &&
        Array.isArray((q as StoryQuestion).options) &&
        (q as StoryQuestion).options.length >= 2 &&
        typeof (q as StoryQuestion).answerIndex === "number",
    )
    .map((q) => {
      const cleaned = q.options.map((o) => String(o).trim()).filter((o) => o.length > 0);
      const correctIdx = Math.max(0, Math.min(cleaned.length - 1, Math.floor(q.answerIndex)));
      const correctText = cleaned[correctIdx];
      // Shuffle so the correct answer isn't always first (models tend to list it first).
      const shuffled = [...cleaned];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return {
        question: q.question.trim(),
        options: shuffled,
        answerIndex: shuffled.indexOf(correctText),
      };
    })
    .filter((q) => q.options.length >= 2 && q.answerIndex >= 0);

  const titleSource = typeof story.title_source === "string" ? story.title_source.trim() : "";

  return {
    title: story.title.trim(),
    titleSource,
    sentences,
    questions,
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
