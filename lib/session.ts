import { getSql } from "./db";
import { tokenizeWords, generatePhrase, generateBlock } from "./deepseek";
import type { LanguageCode, LevelCode } from "./languages";
import { randomUUID } from "crypto";

export const BLOCK_SIZE = 20;

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

export async function ensureUserByEmail(
  email: string,
  name: string | null | undefined,
  image: string | null | undefined,
): Promise<string> {
  const sql = await getSql();
  const rows = (await sql`SELECT id FROM users WHERE email = ${email}`) as Array<{ id: string }>;
  if (rows[0]) {
    // Refresh name/image in case they changed
    await sql`UPDATE users SET name = ${name ?? null}, image = ${image ?? null} WHERE id = ${rows[0].id}`;
    return rows[0].id;
  }
  const id = randomUUID();
  await sql`
    INSERT INTO users (id, email, name, image, created_at)
    VALUES (${id}, ${email}, ${name ?? null}, ${image ?? null}, ${Date.now()})
  `;
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

export async function deleteKnownWord(
  userId: string,
  sourceLang: LanguageCode,
  targetLang: LanguageCode,
  level: LevelCode,
  word: string,
): Promise<void> {
  const sql = await getSql();

  // Remove the word from all new_words arrays in phrases
  const rows = (await sql`
    SELECT phrase_index, new_words FROM phrases
    WHERE user_id = ${userId}
      AND source_lang = ${sourceLang}
      AND target_lang = ${targetLang}
      AND level = ${level}
  `) as Array<{ phrase_index: number; new_words: string }>;

  for (const r of rows) {
    const words: string[] = JSON.parse(r.new_words);
    const filtered = words.filter((w) => w !== word);
    if (filtered.length !== words.length) {
      await sql`
        UPDATE phrases SET new_words = ${JSON.stringify(filtered)}
        WHERE user_id = ${userId}
          AND source_lang = ${sourceLang}
          AND target_lang = ${targetLang}
          AND level = ${level}
          AND phrase_index = ${r.phrase_index}
      `;
    }
  }

  // Recalculate the total learned_word_count
  const allRows = (await sql`
    SELECT target_text FROM phrases
    WHERE user_id = ${userId}
      AND source_lang = ${sourceLang}
      AND target_lang = ${targetLang}
      AND level = ${level}
  `) as Array<{ target_text: string }>;

  const seen = new Set<string>();
  for (const r of allRows) {
    for (const w of tokenizeWords(r.target_text)) seen.add(w);
  }
  const newCount = seen.size;

  await sql`
    UPDATE user_levels SET learned_word_count = ${newCount}
    WHERE user_id = ${userId}
      AND source_lang = ${sourceLang}
      AND target_lang = ${targetLang}
      AND level = ${level}
  `;
}

export type DashboardRow = {
  source_lang: string;
  target_lang: string;
  level: string;
  current_n: number;
  learned_word_count: number;
  block_count: number;
  completed_block_count: number;
  active_block_description: string | null;
};

export async function getAllProgress(userId: string): Promise<DashboardRow[]> {
  const sql = await getSql();
  const rows = (await sql`
    SELECT
      ul.source_lang,
      ul.target_lang,
      ul.level,
      ul.current_n,
      ul.learned_word_count,
      COALESCE((
        SELECT COUNT(*)::int FROM phrase_blocks b
        WHERE b.user_id = ul.user_id
          AND b.source_lang = ul.source_lang
          AND b.target_lang = ul.target_lang
          AND b.level = ul.level
      ), 0) AS block_count,
      COALESCE((
        SELECT COUNT(*)::int FROM phrase_blocks b
        WHERE b.user_id = ul.user_id
          AND b.source_lang = ul.source_lang
          AND b.target_lang = ul.target_lang
          AND b.level = ul.level
          AND b.completed = TRUE
      ), 0) AS completed_block_count,
      (
        SELECT b.description FROM phrase_blocks b
        WHERE b.user_id = ul.user_id
          AND b.source_lang = ul.source_lang
          AND b.target_lang = ul.target_lang
          AND b.level = ul.level
          AND b.completed = FALSE
        ORDER BY b.block_index DESC
        LIMIT 1
      ) AS active_block_description
    FROM user_levels ul
    WHERE ul.user_id = ${userId}
    ORDER BY ul.last_session_at DESC NULLS LAST, ul.level ASC
  `) as Array<DashboardRow>;
  return rows;
}

export type BlockSummary = {
  id: number;
  block_index: number;
  description: string;
  phrase_count: number;
  completed: boolean;
};

export async function getAllBlocksPerLanguage(userId: string): Promise<Record<string, BlockSummary[]>> {
  const sql = await getSql();
  const rows = (await sql`
    SELECT 
      b.id,
      b.block_index,
      b.description,
      b.phrase_count,
      b.completed,
      b.user_id,
      b.source_lang,
      b.target_lang,
      b.level
    FROM phrase_blocks b
    WHERE b.user_id = ${userId}
    ORDER BY b.source_lang, b.target_lang, b.level, b.block_index ASC
  `) as Array<{
    id: number;
    block_index: number;
    description: string;
    phrase_count: number;
    completed: boolean;
    user_id: string;
    source_lang: string;
    target_lang: string;
    level: string;
  }>;

  const grouped: Record<string, BlockSummary[]> = {};
  for (const r of rows) {
    const key = `${r.source_lang}-${r.target_lang}-${r.level}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({
      id: r.id,
      block_index: r.block_index,
      description: r.description,
      phrase_count: r.phrase_count,
      completed: r.completed,
    });
  }
  return grouped;
}

export async function getUiLang(userId: string): Promise<string> {
  const sql = await getSql();
  const rows = (await sql`SELECT ui_lang FROM users WHERE id = ${userId}`) as Array<{ ui_lang: string | null }>;
  return rows[0]?.ui_lang ?? "english";
}

export async function setUiLang(userId: string, uiLang: string): Promise<void> {
  const sql = await getSql();
  await sql`UPDATE users SET ui_lang = ${uiLang} WHERE id = ${userId}`;
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

  // Auto-complete the block if all its phrases are learned
  const rows = (await sql`
    SELECT block_id FROM phrases
    WHERE user_id = ${userId}
      AND source_lang = ${sourceLang}
      AND target_lang = ${targetLang}
      AND level = ${level}
      AND phrase_index = ${newPhraseIndex}
  `) as Array<{ block_id: number | null }>;
  const blockId = rows[0]?.block_id;
  if (blockId) {
    const remaining = (await sql`
      SELECT COUNT(*)::int AS n FROM phrases p
      WHERE p.block_id = ${blockId}
        AND p.phrase_index > ${newPhraseIndex}
    `) as Array<{ n: number }>;
    if (remaining[0]?.n === 0) {
      await sql`UPDATE phrase_blocks SET completed = TRUE WHERE id = ${blockId}`;
    }
  }
}

/* ───────────── BLOCKS ───────────── */

export type BlockRow = {
  id: number;
  block_index: number;
  description: string;
  phrase_count: number;
  completed: boolean;
  delivered_count: number;
};

export async function listBlocks(
  userId: string,
  sourceLang: LanguageCode,
  targetLang: LanguageCode,
  level: LevelCode,
): Promise<BlockRow[]> {
  const sql = await getSql();
  const rows = (await sql`
    SELECT
      b.id,
      b.block_index,
      b.description,
      b.phrase_count,
      b.completed,
      COALESCE((SELECT COUNT(*)::int FROM phrases p WHERE p.block_id = b.id), 0) AS delivered_count
    FROM phrase_blocks b
    WHERE b.user_id = ${userId}
      AND b.source_lang = ${sourceLang}
      AND b.target_lang = ${targetLang}
      AND b.level = ${level}
    ORDER BY b.block_index ASC
  `) as Array<BlockRow>;
  return rows;
}

export async function getActiveBlock(
  userId: string,
  sourceLang: LanguageCode,
  targetLang: LanguageCode,
  level: LevelCode,
): Promise<BlockRow | null> {
  const sql = await getSql();
  const rows = (await sql`
    SELECT
      b.id,
      b.block_index,
      b.description,
      b.phrase_count,
      b.completed,
      COALESCE((SELECT COUNT(*)::int FROM phrases p WHERE p.block_id = b.id), 0) AS delivered_count
    FROM phrase_blocks b
    WHERE b.user_id = ${userId}
      AND b.source_lang = ${sourceLang}
      AND b.target_lang = ${targetLang}
      AND b.level = ${level}
      AND b.completed = FALSE
    ORDER BY b.block_index DESC
    LIMIT 1
  `) as Array<BlockRow>;
  return rows[0] ?? null;
}

export async function createBlock(
  userId: string,
  sourceLang: LanguageCode,
  targetLang: LanguageCode,
  level: LevelCode,
  userDescription: string | null,
): Promise<BlockRow> {
  const sql = await getSql();

  // Disallow creating a new block while one is still in progress
  const existing = await getActiveBlock(userId, sourceLang, targetLang, level);
  if (existing) {
    throw new Error(
      `An active block already exists ("${existing.description}"). Finish it before creating a new one.`,
    );
  }

  const knownWords = await getAllKnownWords(userId, sourceLang, targetLang, level);
  const generated = await generateBlock({
    sourceLang,
    targetLang,
    level,
    knownWords,
    userDescription,
    phraseCount: BLOCK_SIZE,
  });

  const indexRows = (await sql`
    SELECT COALESCE(MAX(block_index), 0) + 1 AS next_block
    FROM phrase_blocks
    WHERE user_id = ${userId}
      AND source_lang = ${sourceLang}
      AND target_lang = ${targetLang}
      AND level = ${level}
  `) as Array<{ next_block: number }>;
  const nextBlockIndex = indexRows[0]?.next_block ?? 1;

  const phraseRows = (await sql`
    SELECT COALESCE(MAX(phrase_index), 0) AS max_phrase
    FROM phrases
    WHERE user_id = ${userId}
      AND source_lang = ${sourceLang}
      AND target_lang = ${targetLang}
      AND level = ${level}
  `) as Array<{ max_phrase: number }>;
  let nextPhraseIndex = (phraseRows[0]?.max_phrase ?? 0) + 1;

  const inserted = (await sql`
    INSERT INTO phrase_blocks
      (user_id, source_lang, target_lang, level, block_index, description, phrase_count, completed, created_at)
    VALUES
      (${userId}, ${sourceLang}, ${targetLang}, ${level}, ${nextBlockIndex},
       ${generated.description}, ${generated.phrases.length}, FALSE, ${Date.now()})
    RETURNING id
  `) as Array<{ id: number }>;
  const blockId = inserted[0]?.id;
  if (!blockId) throw new Error("Failed to insert block");

  const knownSet = new Set(knownWords);
  const runningKnown = new Set(knownWords);

  for (const phrase of generated.phrases) {
    const phraseWords = tokenizeWords(phrase.target_text);
    const actualNewWords = phraseWords.filter((w) => !runningKnown.has(w));
    for (const w of phraseWords) runningKnown.add(w);

    await sql`
      INSERT INTO phrases
        (user_id, source_lang, target_lang, level, phrase_index, source_text, target_text, new_words, created_at, block_id)
      VALUES
        (${userId}, ${sourceLang}, ${targetLang}, ${level}, ${nextPhraseIndex},
         ${phrase.source_text}, ${phrase.target_text},
         ${JSON.stringify(actualNewWords)}, ${Date.now()}, ${blockId})
    `;
    nextPhraseIndex++;
  }

  // Suppress unused warning — knownSet kept for future ref
  void knownSet;

  return {
    id: blockId,
    block_index: nextBlockIndex,
    description: generated.description,
    phrase_count: generated.phrases.length,
    completed: false,
    delivered_count: generated.phrases.length,
  };
}

export async function getBlockPhrases(
  userId: string,
  sourceLang: LanguageCode,
  targetLang: LanguageCode,
  level: LevelCode,
  blockId: number,
): Promise<PhraseRow[]> {
  const sql = await getSql();
  const rows = (await sql`
    SELECT phrase_index, source_text, target_text, new_words
    FROM phrases
    WHERE user_id = ${userId}
      AND source_lang = ${sourceLang}
      AND target_lang = ${targetLang}
      AND level = ${level}
      AND block_id = ${blockId}
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

export async function getNextPendingPhrase(
  userId: string,
  sourceLang: LanguageCode,
  targetLang: LanguageCode,
  level: LevelCode,
): Promise<PhraseRow | null> {
  const sql = await getSql();
  const progress = await getProgress(userId, sourceLang, targetLang, level);
  const nextIndex = progress.current_n + 1;
  const rows = (await sql`
    SELECT phrase_index, source_text, target_text, new_words
    FROM phrases
    WHERE user_id = ${userId}
      AND source_lang = ${sourceLang}
      AND target_lang = ${targetLang}
      AND level = ${level}
      AND phrase_index = ${nextIndex}
  `) as Array<{
    phrase_index: number;
    source_text: string;
    target_text: string;
    new_words: string;
  }>;
  if (!rows[0]) return null;
  return {
    phrase_index: rows[0].phrase_index,
    source_text: rows[0].source_text,
    target_text: rows[0].target_text,
    new_words: JSON.parse(rows[0].new_words) as string[],
  };
}
