import { getSql } from "./db";
import { tokenizeWords, generatePhrase } from "./deepseek";
import type { LanguageCode, LevelCode } from "./languages";
import { randomUUID } from "crypto";

export const WINDOW_SIZE = 20;

export async function ensureUser(userId: string | undefined): Promise<string> {
  const sql = await getSql();
  if (userId) {
    const rows = (await sql`SELECT id FROM users WHERE id = ${userId}`) as Array<{ id: string }>;
    if (rows[0]) return rows[0].id;
  }
  const id = randomUUID();
  await sql`INSERT INTO users (id, created_at) VALUES (${id}, ${Date.now()})`;
  return id;
}

export async function ensureUserLevel(
  userId: string,
  sourceLang: LanguageCode,
  targetLang: LanguageCode,
  level: LevelCode,
): Promise<void> {
  const sql = await getSql();
  await sql`
    INSERT INTO user_levels
      (user_id, source_lang, target_lang, level, current_n, learned_word_count, last_session_at)
    VALUES
      (${userId}, ${sourceLang}, ${targetLang}, ${level}, 0, 0, NULL)
    ON CONFLICT (user_id, source_lang, target_lang, level) DO NOTHING
  `;
}

export type ProgressRow = {
  current_n: number;
  learned_word_count: number;
};

export async function getProgress(
  userId: string,
  sourceLang: LanguageCode,
  targetLang: LanguageCode,
  level: LevelCode,
): Promise<ProgressRow> {
  const sql = await getSql();
  const rows = (await sql`
    SELECT current_n, learned_word_count FROM user_levels
    WHERE user_id = ${userId}
      AND source_lang = ${sourceLang}
      AND target_lang = ${targetLang}
      AND level = ${level}
  `) as Array<ProgressRow>;
  return rows[0] ?? { current_n: 0, learned_word_count: 0 };
}

export type PhraseRow = {
  phrase_index: number;
  source_text: string;
  target_text: string;
  new_words: string[];
};

export async function getWindowPhrases(
  userId: string,
  sourceLang: LanguageCode,
  targetLang: LanguageCode,
  level: LevelCode,
  currentN: number,
): Promise<PhraseRow[]> {
  if (currentN <= 0) return [];
  const sql = await getSql();
  const start = currentN > WINDOW_SIZE ? currentN - WINDOW_SIZE + 1 : 1;
  const rows = (await sql`
    SELECT phrase_index, source_text, target_text, new_words
    FROM phrases
    WHERE user_id = ${userId}
      AND source_lang = ${sourceLang}
      AND target_lang = ${targetLang}
      AND level = ${level}
      AND phrase_index >= ${start}
      AND phrase_index <= ${currentN}
    ORDER BY phrase_index ASC
  `) as Array<{
    phrase_index: number;
    source_text: string;
    target_text: string;
    new_words: string;
  }>;
  return rows.map((r) => ({
    phrase_index: r.phrase_index,
    source_text: r.source_text,
    target_text: r.target_text,
    new_words: JSON.parse(r.new_words) as string[],
  }));
}

export async function getAllKnownWords(
  userId: string,
  sourceLang: LanguageCode,
  targetLang: LanguageCode,
  level: LevelCode,
): Promise<string[]> {
  const sql = await getSql();
  const rows = (await sql`
    SELECT target_text FROM phrases
    WHERE user_id = ${userId}
      AND source_lang = ${sourceLang}
      AND target_lang = ${targetLang}
      AND level = ${level}
    ORDER BY phrase_index ASC
  `) as Array<{ target_text: string }>;

  const seen = new Set<string>();
  for (const r of rows) {
    for (const w of tokenizeWords(r.target_text)) seen.add(w);
  }
  return [...seen];
}

export async function getRecentPhraseTexts(
  userId: string,
  sourceLang: LanguageCode,
  targetLang: LanguageCode,
  level: LevelCode,
  limit: number = 5,
): Promise<string[]> {
  const sql = await getSql();
  const rows = (await sql`
    SELECT target_text FROM phrases
    WHERE user_id = ${userId}
      AND source_lang = ${sourceLang}
      AND target_lang = ${targetLang}
      AND level = ${level}
    ORDER BY phrase_index DESC
    LIMIT ${limit}
  `) as Array<{ target_text: string }>;
  return rows.map((r) => r.target_text).reverse();
}

export async function generateAndStoreNextPhrase(
  userId: string,
  sourceLang: LanguageCode,
  targetLang: LanguageCode,
  level: LevelCode,
): Promise<PhraseRow> {
  const sql = await getSql();
  const progress = await getProgress(userId, sourceLang, targetLang, level);
  const nextIndex = progress.current_n + 1;
  const knownWords = await getAllKnownWords(userId, sourceLang, targetLang, level);
  const recentPhrases = await getRecentPhraseTexts(userId, sourceLang, targetLang, level, 5);

  const generated = await generatePhrase({
    sourceLang,
    targetLang,
    level,
    knownWords,
    recentPhrases,
    phraseIndex: progress.current_n,
  });

  const phraseWords = tokenizeWords(generated.target_text);
  const knownSet = new Set(knownWords);
  const actualNewWords = phraseWords.filter((w) => !knownSet.has(w));

  await sql`
    INSERT INTO phrases
      (user_id, source_lang, target_lang, level, phrase_index, source_text, target_text, new_words, created_at)
    VALUES
      (${userId}, ${sourceLang}, ${targetLang}, ${level}, ${nextIndex},
       ${generated.source_text}, ${generated.target_text},
       ${JSON.stringify(actualNewWords)}, ${Date.now()})
  `;

  return {
    phrase_index: nextIndex,
    source_text: generated.source_text,
    target_text: generated.target_text,
    new_words: actualNewWords,
  };
}

export async function markPhraseLearned(
  userId: string,
  sourceLang: LanguageCode,
  targetLang: LanguageCode,
  level: LevelCode,
  newPhraseIndex: number,
  newWordsCount: number,
): Promise<void> {
  const sql = await getSql();
  await sql`
    UPDATE user_levels
    SET current_n = ${newPhraseIndex},
        learned_word_count = learned_word_count + ${newWordsCount}
    WHERE user_id = ${userId}
      AND source_lang = ${sourceLang}
      AND target_lang = ${targetLang}
      AND level = ${level}
  `;
}
