import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let cachedSql: NeonQueryFunction<false, false> | null = null;
let initPromise: Promise<void> | null = null;

function getRawSql(): NeonQueryFunction<false, false> {
  if (cachedSql) return cachedSql;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Add it to .env.local or your hosting env vars.");
  }
  cachedSql = neon(url);
  return cachedSql;
}

async function init(): Promise<void> {
  const sql = getRawSql();

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      created_at BIGINT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS user_levels (
      user_id TEXT NOT NULL,
      source_lang TEXT NOT NULL,
      target_lang TEXT NOT NULL,
      level TEXT NOT NULL,
      current_n INTEGER NOT NULL DEFAULT 0,
      learned_word_count INTEGER NOT NULL DEFAULT 0,
      last_session_at BIGINT,
      PRIMARY KEY (user_id, source_lang, target_lang, level)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS phrases (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      source_lang TEXT NOT NULL,
      target_lang TEXT NOT NULL,
      level TEXT NOT NULL,
      phrase_index INTEGER NOT NULL,
      source_text TEXT NOT NULL,
      target_text TEXT NOT NULL,
      new_words TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      UNIQUE (user_id, source_lang, target_lang, level, phrase_index)
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_phrases_lookup
      ON phrases (user_id, source_lang, target_lang, level, phrase_index)
  `;
}

export async function getSql() {
  if (!initPromise) {
    initPromise = init().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  await initPromise;
  return getRawSql();
}
