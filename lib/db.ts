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

  // Idempotent: add auth columns if migrating from anonymous-only schema
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS image TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS ui_lang TEXT`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)`;

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

  await sql`
    CREATE TABLE IF NOT EXISTS phrase_blocks (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      source_lang TEXT NOT NULL,
      target_lang TEXT NOT NULL,
      level TEXT NOT NULL,
      block_index INTEGER NOT NULL,
      description TEXT NOT NULL,
      phrase_count INTEGER NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at BIGINT NOT NULL,
      UNIQUE (user_id, source_lang, target_lang, level, block_index)
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_blocks_lookup
      ON phrase_blocks (user_id, source_lang, target_lang, level, block_index)
  `;

  await sql`ALTER TABLE phrases ADD COLUMN IF NOT EXISTS block_id INTEGER`;
  await sql`CREATE INDEX IF NOT EXISTS idx_phrases_block ON phrases (block_id)`;

  // Telegram linking columns
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_link_code TEXT`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_chat ON users(telegram_chat_id)`;
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
