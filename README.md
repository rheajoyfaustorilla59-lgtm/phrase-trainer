# Phrase Trainer

Programa para sa pagsasaulo ng mga parirala (phrase memorization). Pick a CEFR level (A1–C2), and learn through 2–5 word phrases generated on-demand by DeepSeek. Repeat your window, earn the next phrase.

## How it works

- One session = repeat your window of recent phrases, then receive one new phrase.
- Window:
  - If current phrase N ≤ 20 → repeat phrases 1...N−1
  - If N > 20 → repeat phrases N−20...N−1
- **One mistake resets the window** to phrase 1.
- After the window is cleared, DeepSeek generates a new phrase with translation.
- Words count toward your level total only when their first phrase has been successfully passed.

## Setup

1. Install:
   ```
   npm install
   ```
2. Create env file:
   ```
   cp .env.local.example .env.local
   ```
3. Fill in `.env.local`:
   - `DATABASE_URL` — Postgres connection string. Get a free database from [Neon](https://neon.tech) (5-second signup, generous free tier). Or auto-provisioned via Vercel deploy.
   - `DEEPSEEK_API_KEY` — your [DeepSeek key](https://platform.deepseek.com/).
4. Run:
   ```
   npm run dev
   ```
5. Open http://localhost:3000

Tables are auto-created on first request.

## Languages

Cebuano, English, Tagalog, Portuguese, Russian — pick any pair.

## Levels (CEFR)

| Level | Target words |
|-------|--------------|
| A1    | 500          |
| A2    | 1,000        |
| B1    | 2,000        |
| B2    | 4,000        |
| C1    | 8,000        |
| C2    | 16,000       |

## Storage

- Neon Postgres (`@neondatabase/serverless`) — auto-creates `users`, `user_levels`, `phrases` tables.
- Anonymous user identity via `uid` cookie.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript + Tailwind
- Neon Postgres for storage
- DeepSeek API (OpenAI-compatible) via `openai` SDK

## Deploy

1. Push to GitHub.
2. Import the repo at [vercel.com/new](https://vercel.com/new).
3. In project Settings → Storage → Create Neon Postgres (auto-injects `DATABASE_URL`).
4. In Settings → Environment Variables, add `DEEPSEEK_API_KEY`.
5. Redeploy.
