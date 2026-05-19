"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { LANGUAGES, LEVELS, type LanguageCode, type LevelCode } from "@/lib/languages";

type WindowPhrase = {
  phrase_index: number;
  source_text: string;
  target_text: string;
  new_words: string[];
};

type StateResponse = {
  currentN: number;
  learnedWordCount: number;
  targetWordCount: number;
  window: WindowPhrase[];
};

type ProgressRow = {
  source_lang: string;
  target_lang: string;
  level: string;
  current_n: number;
  learned_word_count: number;
};

type DashboardData = {
  progress: ProgressRow[];
  uiLang: string;
};

type Stage =
  | { kind: "dashboard-loading" }
  | { kind: "dashboard"; data: DashboardData }
  | { kind: "picker" }
  | { kind: "loading" }
  | { kind: "ready"; state: StateResponse }
  | {
      kind: "repeating";
      state: StateResponse;
      index: number;
      mistake: { wrong: string; correct: string } | null;
      wrongByPhrase: Record<number, string[]>;
    }
  | { kind: "generating"; state: StateResponse }
  | {
      kind: "new-phrase";
      state: StateResponse;
      phrase: WindowPhrase;
      mistake: { wrong: string; correct: string } | null;
      wrongAttempts: string[];
    }
  | { kind: "done"; state: StateResponse; lastPhrase: WindowPhrase };

function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:"'()\[\]{}«»¿¡]/g, "")
    .replace(/\s+/g, " ");
}

/* ───────────── Shared chrome ───────────── */

function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <circle cx="13" cy="13" r="12" stroke="#1A1714" strokeWidth="1" />
      <path d="M7 10 Q 13 4, 19 10" stroke="oklch(0.58 0.13 38)" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <path d="M7 16 Q 13 22, 19 16" stroke="#1A1714" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function Masthead({
  sessionInfo,
  onChange,
  user,
}: {
  sessionInfo?: { pair: string; learned: number; target: number; phraseN: number };
  onChange?: () => void;
  user?: { name?: string | null; email?: string | null; image?: string | null };
}) {
  return (
    <div className="flex items-center justify-between px-9 py-5 border-b border-rule">
      <div className="flex items-center gap-3.5">
        <Mark />
        <div className="flex items-baseline gap-2.5">
          <span className="font-serif text-[22px] leading-none text-ink">Phrase Trainer</span>
        </div>
      </div>
      <div className="flex items-center gap-6">
        {sessionInfo && (
          <>
            <div className="text-right">
              <div className="eyebrow">{sessionInfo.pair}</div>
              <div className="text-[12.5px] text-ink-2 mt-[3px] tabular">
                <span className="text-ink font-medium">{sessionInfo.learned.toLocaleString()}</span>
                <span className="text-ink-3"> / {sessionInfo.target.toLocaleString()} words</span>
                <span className="text-ink-3"> · phrase #{sessionInfo.phraseN}</span>
              </div>
            </div>
            {onChange && (
              <button
                onClick={onChange}
                className="inline-flex items-center border border-rule bg-transparent text-ink-2 text-[11.5px] font-medium px-3 py-[7px] rounded-full hover:text-ink hover:border-ink-3 transition-colors"
              >
                Change
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="ml-1.5">
                  <path d="M3 1.5L6.5 5L3 8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </>
        )}
        {user && (
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2 bg-good-soft border border-good/30 rounded-full pl-1 pr-3 py-[3px]">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.image}
                  alt={user.name ?? "User"}
                  className="w-6 h-6 rounded-full"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-good/30 flex items-center justify-center text-[11px] font-medium text-good">
                  {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] uppercase tracking-wider text-good font-semibold">
                  Signed in
                </span>
                {user.name && (
                  <span
                    className="text-[12px] text-ink font-medium max-w-[140px] truncate"
                    title={user.email ?? undefined}
                  >
                    {user.name}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => signOut()}
              className="inline-flex items-center border border-rule bg-transparent text-ink-2 text-[11.5px] font-medium px-3 py-[7px] rounded-full hover:text-ink hover:border-ink-3 transition-colors"
              title={user.email ?? undefined}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Footer({ left, right }: { left?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mt-auto flex items-center justify-between px-9 py-3.5 border-t border-rule text-[11px] text-ink-3">
      <div className="flex gap-4 items-center">{left}</div>
      <div className="flex gap-4 items-center">{right}</div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 border border-rule border-b-2 rounded bg-paper text-[10px] text-ink-2 leading-none">
      {children}
    </span>
  );
}

const PRIMARY_BTN =
  "inline-flex items-center justify-center gap-2.5 bg-ink text-paper border border-ink rounded-full px-7 py-3.5 text-sm font-medium cursor-pointer shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_6px_16px_-8px_rgba(26,23,20,0.5)] hover:bg-ink-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

const INPUT_WRAP =
  "flex items-center gap-2.5 bg-paper border border-ink rounded-xl px-4 py-3.5 shadow-[0_0_0_4px_rgba(26,23,20,0.06)] focus-within:border-ink";

function ArrowRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 7H12 M8 3L12 7L8 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ───────────── Main component ───────────── */

export default function Home() {
  const { data: session, status } = useSession();
  const [sourceLang, setSourceLang] = useState<LanguageCode>("english");
  const [targetLang, setTargetLang] = useState<LanguageCode>("tagalog");
  const [level, setLevel] = useState<LevelCode>("A1");
  const [stage, setStage] = useState<Stage>({ kind: "dashboard-loading" });
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [stage]);

  // Load dashboard when user becomes authenticated
  useEffect(() => {
    if (status !== "authenticated") return;
    if (stage.kind !== "dashboard-loading") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard");
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as DashboardData;
        if (!cancelled) setStage({ kind: "dashboard", data });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load dashboard");
          setStage({ kind: "dashboard", data: { progress: [], uiLang: "english" } });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, stage.kind]);

  async function reloadDashboard() {
    setStage({ kind: "dashboard-loading" });
  }

  async function saveUiLang(uiLang: string) {
    try {
      await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uiLang }),
      });
      if (stage.kind === "dashboard") {
        setStage({ kind: "dashboard", data: { ...stage.data, uiLang } });
      }
    } catch {
      // ignore — preference is purely cosmetic for now
    }
  }

  const sourceLabel = useMemo(() => LANGUAGES.find((l) => l.code === sourceLang)?.label, [sourceLang]);
  const targetLabel = useMemo(() => LANGUAGES.find((l) => l.code === targetLang)?.label, [targetLang]);

  // ───────────── AUTH GATE ─────────────
  if (status === "loading") {
    return (
      <Page>
        <div className="flex-1 grid place-items-center px-9">
          <p className="eyebrow">Loading…</p>
        </div>
      </Page>
    );
  }

  if (status === "unauthenticated") {
    return (
      <Page>
        <Masthead />
        <div className="flex-1 grid place-items-center px-9 py-14">
          <div className="text-center max-w-[440px]">
            <div className="eyebrow text-terracotta mb-4">Sign in</div>
            <h1 className="font-serif text-[44px] leading-[1.05] tracking-[-0.02em] mb-3">
              Welcome to <span className="italic text-terracotta">Phrase Trainer</span>.
            </h1>
            <p className="text-[14.5px] text-ink-2 leading-[1.6] mb-9">
              Sign in with Google to save your progress across devices.
            </p>
            <button
              onClick={() => signIn("google")}
              className={PRIMARY_BTN}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Sign in with Google
            </button>
            <p className="mt-5 text-[11.5px] text-ink-3">
              Your progress is tied to your Google account.
            </p>
          </div>
        </div>
        <Footer
          left={<span>Anonymous mode disabled — sign in required.</span>}
          right={<span>Privacy: name + email + avatar only.</span>}
        />
      </Page>
    );
  }

  async function loadState() {
    setError(null);
    setStage({ kind: "loading" });
    try {
      const res = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceLang, targetLang, level }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as StateResponse;
      setStage({ kind: "ready", state: data });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load state");
      setStage({ kind: "picker" });
    }
  }

  async function startSession() {
    if (sourceLang === targetLang) {
      setError("Pick two different languages.");
      return;
    }
    await loadState();
  }

  function beginSession() {
    if (stage.kind !== "ready") return;
    if (stage.state.window.length === 0) {
      requestNewPhrase(stage.state);
    } else {
      setStage({
        kind: "repeating",
        state: stage.state,
        index: 0,
        mistake: null,
        wrongByPhrase: {},
      });
      setInput("");
    }
  }

  async function requestNewPhrase(state: StateResponse) {
    setStage({ kind: "generating", state });
    setError(null);
    try {
      const res = await fetch("/api/next-phrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceLang, targetLang, level }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to fetch new phrase");
      }
      const { phrase } = (await res.json()) as { phrase: WindowPhrase };
      setStage({
        kind: "new-phrase",
        state,
        phrase,
        mistake: null,
        wrongAttempts: [],
      });
      setInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setStage({ kind: "ready", state });
    }
  }

  function submitRepetition() {
    if (stage.kind !== "repeating") return;
    if (stage.mistake) {
      if (normalize(input) === normalize(stage.mistake.correct)) {
        setStage({ ...stage, index: 0, mistake: null });
        setInput("");
      } else {
        const phraseIdx = stage.state.window[stage.index].phrase_index;
        const prev = stage.wrongByPhrase[phraseIdx] ?? [];
        setStage({
          ...stage,
          mistake: { wrong: input, correct: stage.mistake.correct },
          wrongByPhrase: { ...stage.wrongByPhrase, [phraseIdx]: [...prev, input] },
        });
        setInput("");
      }
      return;
    }
    const current = stage.state.window[stage.index];
    if (normalize(input) === normalize(current.target_text)) {
      const nextIndex = stage.index + 1;
      setInput("");
      if (nextIndex >= stage.state.window.length) {
        requestNewPhrase(stage.state);
      } else {
        setStage({ ...stage, index: nextIndex, mistake: null });
      }
    } else {
      const prev = stage.wrongByPhrase[current.phrase_index] ?? [];
      setStage({
        ...stage,
        mistake: { wrong: input, correct: current.target_text },
        wrongByPhrase: { ...stage.wrongByPhrase, [current.phrase_index]: [...prev, input] },
      });
      setInput("");
    }
  }

  function submitNewPhrase() {
    if (stage.kind !== "new-phrase") return;
    const correct = stage.phrase.target_text;
    if (stage.mistake) {
      if (normalize(input) === normalize(correct)) {
        setStage({ kind: "done", state: stage.state, lastPhrase: stage.phrase });
        setInput("");
      } else {
        setStage({
          ...stage,
          mistake: { wrong: input, correct },
          wrongAttempts: [...stage.wrongAttempts, input],
        });
        setInput("");
      }
      return;
    }
    if (normalize(input) === normalize(correct)) {
      setStage({ kind: "done", state: stage.state, lastPhrase: stage.phrase });
      setInput("");
    } else {
      setStage({
        ...stage,
        mistake: { wrong: input, correct },
        wrongAttempts: [...stage.wrongAttempts, input],
      });
      setInput("");
    }
  }

  function reset() {
    setStage({ kind: "dashboard-loading" });
    setError(null);
    setInput("");
  }

  const sessionInfo = (s: StateResponse) => ({
    pair: `${sourceLabel} → ${targetLabel} · ${level}`,
    learned: s.learnedWordCount,
    target: s.targetWordCount,
    phraseN: s.currentN,
  });

  /* ───────────── DASHBOARD LOADING ───────────── */
  if (stage.kind === "dashboard-loading") {
    return (
      <Page>
        <Masthead user={session?.user} />
        <div className="flex-1 grid place-items-center px-9">
          <p className="eyebrow">Loading your dashboard…</p>
        </div>
      </Page>
    );
  }

  /* ───────────── DASHBOARD ───────────── */
  if (stage.kind === "dashboard") {
    const { progress, uiLang } = stage.data;
    const totalPhrases = progress.reduce((sum, p) => sum + p.current_n, 0);
    const totalWords = progress.reduce((sum, p) => sum + p.learned_word_count, 0);

    async function handleStartFromDashboard() {
      if (sourceLang === targetLang) {
        setError("Pick two different languages.");
        return;
      }
      await startSession();
    }

    return (
      <Page>
        <Masthead user={session?.user} />
        <div className="flex-1 overflow-y-auto">
          {/* Welcome header */}
          <div className="px-10 lg:px-14 pt-12 pb-8 border-b border-rule">
            <div className="eyebrow text-terracotta mb-3">Dashboard</div>
            <h1 className="font-serif text-[42px] md:text-[48px] leading-[1.05] tracking-[-0.02em]">
              {session?.user?.name ? (
                <>
                  Welcome back,
                  <br />
                  <span className="italic text-terracotta">{session.user.name.split(" ")[0]}</span>.
                </>
              ) : (
                "Welcome back."
              )}
            </h1>
            {session?.user?.email && (
              <p className="text-[13px] text-ink-3 mt-2">{session.user.email}</p>
            )}

            {/* Stat cards */}
            <div className="mt-8 grid grid-cols-3 gap-px bg-rule rounded-2xl overflow-hidden border border-rule max-w-[640px]">
              <div className="bg-paper px-5 py-4">
                <div className="font-serif text-3xl leading-none">{progress.length}</div>
                <div className="eyebrow mt-2">Languages</div>
              </div>
              <div className="bg-paper px-5 py-4">
                <div className="font-serif text-3xl leading-none">{totalPhrases}</div>
                <div className="eyebrow mt-2">Phrases</div>
              </div>
              <div className="bg-paper px-5 py-4">
                <div className="font-serif text-3xl leading-none">{totalWords}</div>
                <div className="eyebrow mt-2">Words</div>
              </div>
            </div>
          </div>

          {/* Language progress table */}
          <div className="px-10 lg:px-14 py-9 border-b border-rule">
            <div className="flex items-baseline justify-between mb-5">
              <div>
                <div className="eyebrow text-good">● Your languages</div>
                <h2 className="font-serif text-2xl mt-1">In progress</h2>
              </div>
              <div className="text-[11.5px] text-ink-3">{progress.length} active</div>
            </div>

            {progress.length === 0 ? (
              <div className="bg-paper border border-rule rounded-2xl px-6 py-10 text-center">
                <p className="font-serif text-2xl mb-1">Nothing started yet.</p>
                <p className="text-[13px] text-ink-3">Pick a language below to begin.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {progress.map((p) => {
                  const lvl = LEVELS.find((l) => l.code === p.level);
                  const target = lvl?.targetWords ?? 1;
                  const pct = Math.min(100, Math.round((p.learned_word_count / target) * 100));
                  const remaining = Math.max(0, target - p.learned_word_count);
                  const srcLabel = LANGUAGES.find((l) => l.code === p.source_lang)?.label ?? p.source_lang;
                  const tgtLabel = LANGUAGES.find((l) => l.code === p.target_lang)?.label ?? p.target_lang;
                  return (
                    <div
                      key={`${p.source_lang}-${p.target_lang}-${p.level}`}
                      className="bg-paper border border-rule rounded-2xl px-5 py-4"
                    >
                      <div className="flex items-baseline justify-between mb-2">
                        <div className="font-serif text-[20px] leading-none">
                          {srcLabel} <span className="text-ink-3">→</span>{" "}
                          <span className="italic text-terracotta">{tgtLabel}</span>
                        </div>
                        <span className="font-mono text-[11px] text-ink-3 uppercase">{p.level}</span>
                      </div>
                      <div className="text-[12.5px] text-ink-2 tabular mb-3 flex flex-wrap gap-x-4 gap-y-1">
                        <span>
                          <span className="text-ink font-medium">{p.current_n}</span>
                          <span className="text-ink-3"> phrases</span>
                        </span>
                        <span>
                          <span className="text-ink font-medium">{p.learned_word_count}</span>
                          <span className="text-ink-3"> / {target.toLocaleString()} words</span>
                        </span>
                        <span>
                          <span className="text-terracotta font-medium">{remaining.toLocaleString()}</span>
                          <span className="text-ink-3"> to go</span>
                        </span>
                        <span className="ml-auto font-mono text-ink">{pct}%</span>
                      </div>
                      <div className="h-1.5 bg-rule rounded-full overflow-hidden">
                        <div
                          className="h-full bg-ink rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <button
                        onClick={async () => {
                          setSourceLang(p.source_lang as LanguageCode);
                          setTargetLang(p.target_lang as LanguageCode);
                          setLevel(p.level as LevelCode);
                          await loadState();
                        }}
                        className="mt-3 text-[12px] text-terracotta hover:text-ink-2 font-medium inline-flex items-center gap-1"
                      >
                        Continue →
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Start a new language */}
          <div className="px-10 lg:px-14 py-9 border-b border-rule">
            <div className="eyebrow text-terracotta mb-1">+ New</div>
            <h2 className="font-serif text-2xl mb-5">Start a new language</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-[640px]">
              <FieldRow label="I speak">
                <SelectField
                  value={sourceLang}
                  onChange={(v) => setSourceLang(v as LanguageCode)}
                  options={LANGUAGES}
                />
              </FieldRow>
              <FieldRow label="I want to learn">
                <SelectField
                  value={targetLang}
                  onChange={(v) => setTargetLang(v as LanguageCode)}
                  options={LANGUAGES}
                  accent
                />
              </FieldRow>
            </div>

            <div className="mt-2 max-w-[640px]">
              <FieldRow label="Level" last>
                <LevelStrip active={level} onPick={setLevel} />
              </FieldRow>
            </div>

            {error && <p className="text-bad text-sm mt-3">{error}</p>}

            <button onClick={handleStartFromDashboard} className={`${PRIMARY_BTN} mt-5`}>
              Begin session
              <ArrowRight />
            </button>
          </div>

          {/* Settings */}
          <div className="px-10 lg:px-14 py-9">
            <div className="eyebrow mb-1">Settings</div>
            <h2 className="font-serif text-2xl mb-5">Preferences</h2>

            <div className="max-w-[440px]">
              <FieldRow label="Interface language" last>
                <SelectField
                  value={uiLang}
                  onChange={(v) => saveUiLang(v)}
                  options={LANGUAGES}
                />
              </FieldRow>
              <p className="text-[11.5px] text-ink-3 mt-2">
                Preference is saved to your account. Full UI translation is coming soon.
              </p>
            </div>
          </div>
        </div>
        <Footer
          left={<span>Signed in as {session?.user?.email}</span>}
          right={
            <button
              onClick={() => signOut()}
              className="text-[11px] text-ink-2 hover:text-ink underline underline-offset-2"
            >
              Sign out
            </button>
          }
        />
      </Page>
    );
  }

  /* ───────────── PICKER ───────────── */
  if (stage.kind === "picker") {
    return (
      <Page>
        <Masthead user={session?.user} />
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1.15fr_1fr]">
          {/* Editorial hero */}
          <div className="px-10 lg:px-14 py-14 flex flex-col justify-between lg:border-r border-rule">
            <div>
              <div className="eyebrow mb-4">Begin</div>
              <h1 className="font-serif text-[56px] md:text-[64px] leading-[1.02] tracking-[-0.02em] m-0">
                Learn a language,
                <br />
                <span className="italic text-terracotta">one phrase</span> at a time.
              </h1>
              <p className="mt-6 text-[14.5px] leading-[1.6] text-ink-2 max-w-[380px]">
                Two to five words. Repeat the window of phrases you already know, then earn the next one. A single mistake resets the window — so type carefully.
              </p>
            </div>
            <div className="flex gap-7 pt-6">
              <Stat n="2–5" l="Words per phrase" />
              <Stat n="20" l="Window size" />
              <Stat n="5" l="Languages" />
            </div>
          </div>

          {/* Form */}
          <div className="px-10 lg:px-12 py-11 flex flex-col justify-center">
            <FieldRow label="I speak">
              <SelectField value={sourceLang} onChange={(v) => setSourceLang(v as LanguageCode)} options={LANGUAGES} />
            </FieldRow>
            <FieldRow label="I want to learn">
              <SelectField value={targetLang} onChange={(v) => setTargetLang(v as LanguageCode)} options={LANGUAGES} accent />
            </FieldRow>
            <FieldRow label="Level" last>
              <LevelStrip active={level} onPick={setLevel} />
            </FieldRow>

            {error && <p className="text-bad text-sm mt-4">{error}</p>}

            <button onClick={startSession} className={`${PRIMARY_BTN} mt-7 w-full`}>
              Continue
              <ArrowRight />
            </button>

            <p className="mt-3.5 text-[11.5px] text-ink-3 text-center">
              Anonymous · your progress is saved in this browser.
            </p>
          </div>
        </div>
        <Footer
          left={<span>A quiet way to learn — phrase by phrase.</span>}
          right={
            <>
              <span>Press</span>
              <Kbd>↵</Kbd>
              <span>to continue</span>
            </>
          }
        />
      </Page>
    );
  }

  /* ───────────── LOADING ───────────── */
  if (stage.kind === "loading" || stage.kind === "generating") {
    return (
      <Page>
        <Masthead sessionInfo={undefined} user={session?.user} />
        <div className="flex-1 grid place-items-center px-9">
          <div className="text-center">
            <div className="eyebrow text-terracotta">{stage.kind === "loading" ? "Loading" : "Generating"}</div>
            <p className="font-serif text-[36px] mt-3 leading-tight">
              {stage.kind === "loading" ? "Reaching for your phrases…" : "Writing a new phrase for you…"}
            </p>
            <div className="mt-6 flex justify-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-ink-3"
                  style={{ animation: `blink 1.4s infinite ${i * 0.2}s` }}
                />
              ))}
            </div>
          </div>
        </div>
      </Page>
    );
  }

  /* ───────────── READY ───────────── */
  if (stage.kind === "ready") {
    const s = stage.state;
    const windowLen = s.window.length;
    return (
      <Page>
        <Masthead sessionInfo={sessionInfo(s)} onChange={reset} user={session?.user} />
        <div className="flex-1 grid place-items-center px-9 py-10">
          <div className="w-full max-w-[680px] text-center">
            <div className="eyebrow text-terracotta">Ready</div>
            {s.currentN === 0 ? (
              <>
                <h2 className="font-serif text-[44px] md:text-[48px] leading-[1.05] tracking-[-0.02em] mt-3.5 mb-2">
                  Your first phrase in <span className="italic">{targetLabel}</span> awaits.
                </h2>
                <p className="text-sm text-ink-2 leading-relaxed max-w-[480px] mx-auto mb-8">
                  Tap continue and we&apos;ll generate phrase № 1.
                </p>
              </>
            ) : (
              <>
                <h2 className="font-serif text-[44px] md:text-[48px] leading-[1.05] tracking-[-0.02em] mt-3.5 mb-2">
                  Repeat <span className="text-terracotta">{windowLen} {windowLen === 1 ? "phrase" : "phrases"}</span>,
                  <br />
                  then earn phrase <span className="italic">№{s.currentN + 1}</span>.
                </h2>
                <p className="text-sm text-ink-2 leading-relaxed max-w-[480px] mx-auto mb-8">
                  A single mistake resets the window to phrase one. Slow down. Breathe.
                </p>

                {windowLen > 0 && (
                  <div className="bg-paper border border-rule rounded-2xl px-5 py-4 mb-8 text-left flex items-center gap-4">
                    <div>
                      <div className="eyebrow">Window</div>
                      <div className="font-serif text-2xl mt-0.5 leading-none">
                        {s.window[0].phrase_index} → {s.window[windowLen - 1].phrase_index}
                      </div>
                    </div>
                    <div className="w-px h-8 bg-rule" />
                    <div className="flex-1 flex gap-[3px] items-end h-8">
                      {Array.from({ length: windowLen }).map((_, i) => (
                        <div
                          key={i}
                          className="flex-1 bg-ink rounded-[1.5px]"
                          style={{
                            height: 6 + (i % 5) * 4 + Math.sin(i) * 3,
                            opacity: 0.35 + i / 30,
                          }}
                        />
                      ))}
                    </div>
                    <div className="font-mono text-[11px] text-ink-3">{windowLen} / 20</div>
                  </div>
                )}
              </>
            )}

            <button onClick={beginSession} className={PRIMARY_BTN}>
              {s.currentN === 0 ? "Generate first phrase" : "Begin session"}
              <ArrowRight />
            </button>
          </div>
        </div>
        <Footer
          left={
            <>
              Tip: <Kbd>↵</Kbd>
              <span>submits</span>
            </>
          }
          right={<span>Session #{s.currentN + 1}</span>}
        />
      </Page>
    );
  }

  /* ───────────── REPEATING ───────────── */
  if (stage.kind === "repeating") {
    const current = stage.state.window[stage.index];
    const answered = stage.state.window.slice(0, stage.index);
    const currentWrongs = stage.wrongByPhrase[current.phrase_index] ?? [];

    return (
      <Page>
        <Masthead sessionInfo={sessionInfo(stage.state)} onChange={reset} user={session?.user} />

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1.45fr_1fr]">
          {/* Prompt */}
          <div className="px-10 lg:px-12 py-10 flex flex-col lg:border-r border-rule">
            <div className="flex items-center justify-between mb-6">
              <div className="eyebrow">
                Phrase {stage.index + 1} of {stage.state.window.length}
              </div>
              <ProgressDots total={stage.state.window.length} done={stage.index} active={stage.index} />
            </div>

            {stage.mistake ? (
              <div className="mt-2">
                <div className="eyebrow text-bad mb-2">● Not quite</div>
                <div className="text-[13px] text-ink-3 mb-1">{current.source_text}</div>
                <div className="font-serif text-[38px] leading-[1.12] tracking-[-0.015em] text-ink mb-4">
                  {stage.mistake.correct}
                </div>
                {currentWrongs.map((w, i) => (
                  <div key={i} className="font-mono text-[13px] text-bad line-through">
                    {w || "(empty)"}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2">
                <div className="eyebrow mb-2">{sourceLabel}</div>
                <div className="font-serif text-[42px] md:text-[46px] leading-[1.12] tracking-[-0.015em] text-ink">
                  {current.source_text}
                </div>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitRepetition();
              }}
              className="mt-auto"
            >
              <div className="eyebrow mb-2.5">
                {stage.mistake ? "Type the correct answer to continue" : `Type in ${targetLabel}`}
              </div>
              <label className={INPUT_WRAP}>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={stage.mistake ? "Type the answer above…" : `Type in ${targetLabel}…`}
                  className="font-serif text-[22px] text-ink flex-1 bg-transparent outline-none placeholder:text-ink-3 placeholder:italic leading-tight"
                  autoFocus
                />
                <span className="font-mono text-[11px] text-ink-3">↵</span>
              </label>
              <button type="submit" disabled={!input.trim()} className="sr-only">
                Submit
              </button>
            </form>
          </div>

          {/* Answered list */}
          <div className="px-9 py-9 flex flex-col overflow-hidden">
            <div className="flex items-baseline justify-between mb-3.5">
              <div className="eyebrow text-good">● Answered</div>
              <span className="font-mono text-[11px] text-ink-3">
                {answered.length} / {stage.state.window.length}
              </span>
            </div>

            {answered.length === 0 ? (
              <p className="text-[12.5px] text-ink-3 italic">Your answered phrases will appear here.</p>
            ) : (
              <div className="flex flex-col gap-2.5 overflow-y-auto">
                {answered.map((p) => (
                  <AnsweredRow key={p.phrase_index} p={p} wrongs={stage.wrongByPhrase[p.phrase_index] ?? []} />
                ))}
              </div>
            )}
          </div>
        </div>

        <Footer
          left={
            stage.mistake ? (
              <span className="text-bad">● Window will reset to phrase 1</span>
            ) : (
              <>
                <Kbd>↵</Kbd>
                <span>Submit</span>
              </>
            )
          }
          right={<span>Window resets on any mistake.</span>}
        />
      </Page>
    );
  }

  /* ───────────── NEW PHRASE ───────────── */
  if (stage.kind === "new-phrase") {
    const p = stage.phrase;
    return (
      <Page>
        <Masthead sessionInfo={sessionInfo(stage.state)} onChange={reset} user={session?.user} />
        <div className="flex-1 grid place-items-center px-9 py-8">
          <div className="w-full max-w-[700px] text-center">
            <div className="eyebrow text-terracotta">✦ New phrase № {p.phrase_index}</div>

            <div className="mt-5 mb-1.5 text-[13px] text-ink-3">{sourceLabel}</div>
            <div className="font-serif text-[28px] md:text-[30px] leading-[1.15] text-ink-2 italic">
              &ldquo;{p.source_text}&rdquo;
            </div>

            <div className="flex items-center justify-center gap-3.5 my-6">
              <div className="h-px w-[60px] bg-rule" />
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1V11 M1 6L6 11L11 6" stroke="#8A8278" strokeWidth="1" strokeLinecap="round" />
              </svg>
              <div className="h-px w-[60px] bg-rule" />
            </div>

            <div className="text-[13px] text-ink-3">{targetLabel}</div>
            <div className="font-serif text-[44px] md:text-[54px] leading-[1.05] tracking-[-0.02em] text-ink mt-1.5">
              {p.target_text}
            </div>

            {p.new_words.length > 0 && (
              <div className="flex justify-center gap-2 mt-6 flex-wrap items-center">
                <span className="eyebrow mr-1">New</span>
                {p.new_words.map((w) => (
                  <span
                    key={w}
                    className="text-[13px] text-terracotta bg-terracotta-soft border border-terracotta px-2.5 py-1 rounded-full"
                  >
                    {w}
                  </span>
                ))}
              </div>
            )}

            {stage.wrongAttempts.length > 0 && (
              <div className="mt-5">
                <div className="eyebrow text-bad mb-1.5">● Try again</div>
                {stage.wrongAttempts.map((w, i) => (
                  <div key={i} className="font-mono text-[13px] text-bad line-through">
                    {w || "(empty)"}
                  </div>
                ))}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitNewPhrase();
              }}
              className="mt-7 text-left"
            >
              <label className={INPUT_WRAP}>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type the new phrase to lock it in…"
                  className="font-serif text-[22px] text-ink flex-1 bg-transparent outline-none placeholder:text-ink-3 placeholder:italic leading-tight"
                  autoFocus
                />
                <span className="font-mono text-[11px] text-ink-3">↵ Confirm</span>
              </label>
              <button type="submit" disabled={!input.trim()} className="sr-only">
                Confirm
              </button>
            </form>
          </div>
        </div>
        <Footer
          left={<span>Generated for level <span className="text-ink-2">{level}</span></span>}
          right={
            <>
              <span>Type to lock in</span>
              <Kbd>↵</Kbd>
            </>
          }
        />
      </Page>
    );
  }

  /* ───────────── DONE ───────────── */
  if (stage.kind === "done") {
    const s = stage.state;
    const p = stage.lastPhrase;
    return (
      <Page>
        <Masthead sessionInfo={sessionInfo(s)} onChange={reset} user={session?.user} />
        <div className="flex-1 grid place-items-center px-9 py-9">
          <div className="w-full max-w-[680px] text-center">
            <div className="eyebrow text-terracotta">Session complete</div>
            <h2 className="font-serif text-[56px] md:text-[60px] leading-[1.02] tracking-[-0.02em] mt-4 mb-1">
              Phrase <span className="italic text-terracotta">№{p.phrase_index}</span>
              <br />
              is yours.
            </h2>
            <p className="text-[14.5px] text-ink-2 leading-snug mt-4 mx-auto max-w-[440px]">
              <span className="font-serif text-[18px]">&ldquo;{p.target_text}&rdquo;</span>
              <br />
              <span className="text-ink-3 text-[12.5px]">{p.source_text}</span>
            </p>

            <div className="mt-9 grid grid-cols-3 bg-paper border border-rule rounded-2xl overflow-hidden">
              <Totals n={String(p.phrase_index)} l="Phrases" />
              <Totals
                n={String(s.learnedWordCount)}
                l="Words learned"
                sub={`/ ${s.targetWordCount.toLocaleString()}`}
              />
              <Totals n={level} l="Level" accent last />
            </div>

            <button onClick={loadState} className={`${PRIMARY_BTN} mt-8`}>
              Start next session
              <ArrowRight />
            </button>
          </div>
        </div>
        <Footer
          left={<span>Saved</span>}
          right={
            <>
              <Kbd>↵</Kbd>
              <span>Next session</span>
            </>
          }
        />
      </Page>
    );
  }

  return null;
}

/* ───────────── Helper components ───────────── */

function Page({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-[1100px] min-h-[720px] bg-cream rounded-3xl border border-rule shadow-[0_30px_80px_-30px_rgba(26,23,20,0.25)] flex flex-col overflow-hidden">
        {children}
      </div>
    </main>
  );
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div>
      <div className="font-serif text-3xl leading-none text-ink">{n}</div>
      <div className="eyebrow mt-1.5">{l}</div>
    </div>
  );
}

function FieldRow({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`py-4.5 ${last ? "" : "border-b border-rule"}`} style={{ paddingTop: 18, paddingBottom: 18 }}>
      <div className="eyebrow mb-2.5">{label}</div>
      {children}
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
  accent,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ code: string; label: string; flag?: string }>;
  accent?: boolean;
}) {
  return (
    <div className="relative flex items-center bg-paper border border-rule rounded-[10px] px-4 py-2.5">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none bg-transparent outline-none font-serif text-[22px] pr-7 flex-1 cursor-pointer ${
          accent ? "text-terracotta" : "text-ink"
        }`}
      >
        {options.map((o) => (
          <option key={o.code} value={o.code} className="font-sans text-base text-ink bg-paper">
            {o.label}
          </option>
        ))}
      </select>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="absolute right-4 pointer-events-none">
        <path d="M3 5L6 8L9 5" stroke="#8A8278" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function LevelStrip({ active, onPick }: { active: LevelCode; onPick: (l: LevelCode) => void }) {
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {LEVELS.map((l) => {
        const isActive = l.code === active;
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => onPick(l.code)}
            className={`px-1.5 pt-2.5 pb-2 rounded-lg border text-center transition-colors ${
              isActive
                ? "border-ink bg-ink text-paper"
                : "border-rule bg-paper text-ink hover:border-ink-3"
            }`}
          >
            <div className="font-mono text-[12px] font-medium">{l.code}</div>
            <div className={`text-[9.5px] mt-0.5 tracking-wide ${isActive ? "text-paper/65" : "text-ink-3"}`}>
              {l.targetWords >= 1000 ? `${l.targetWords / 1000}k` : l.targetWords}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ProgressDots({ total, done, active }: { total: number; done: number; active: number }) {
  return (
    <div className="flex gap-[3px]">
      {Array.from({ length: total }).map((_, i) => {
        const isDone = i < done;
        const isActive = i === active;
        return (
          <div
            key={i}
            className={`h-1.5 rounded-[3px] transition-all duration-200 ${
              isDone ? "bg-ink" : isActive ? "bg-terracotta" : "bg-rule"
            }`}
            style={{ width: isActive ? 14 : 6 }}
          />
        );
      })}
    </div>
  );
}

function AnsweredRow({ p, wrongs }: { p: WindowPhrase; wrongs: string[] }) {
  return (
    <div className="px-3.5 py-2.5 bg-paper border border-rule rounded-[10px]">
      <div className="text-[12px] text-ink-3 mb-0.5">{p.source_text}</div>
      <div className="font-serif text-[17px] text-ink leading-tight">{p.target_text}</div>
      {wrongs.map((w, i) => (
        <div key={i} className="font-mono text-[11px] text-bad line-through mt-0.5">
          {w || "(empty)"}
        </div>
      ))}
    </div>
  );
}

function Totals({ n, l, sub, accent, last }: { n: string; l: string; sub?: string; accent?: boolean; last?: boolean }) {
  return (
    <div className={`px-3.5 py-4.5 ${last ? "" : "border-r border-rule"}`} style={{ paddingTop: 18, paddingBottom: 18 }}>
      <div className={`font-serif text-3xl leading-none ${accent ? "text-terracotta" : "text-ink"}`}>
        {n}
        {sub && <span className="text-[13px] text-ink-3 font-mono"> {sub}</span>}
      </div>
      <div className="eyebrow mt-2">{l}</div>
    </div>
  );
}
