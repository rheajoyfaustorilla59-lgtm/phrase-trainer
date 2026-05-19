"use client";

import { useEffect, useRef, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { LANGUAGES, LEVELS, type LanguageCode, type LevelCode } from "@/lib/languages";

/* ─── Types ─── */

type PhraseItem = {
  phrase_index: number;
  source_text: string;
  target_text: string;
  new_words: string[];
};

type SessionBlock = {
  id: number;
  description: string;
  phrase_count: number;
  completed: boolean;
  delivered_count: number;
};

type BlockSummary = {
  id: number;
  block_index: number;
  description: string;
  phrase_count: number;
  completed: boolean;
};

type ProgressRow = {
  source_lang: string;
  target_lang: string;
  level: string;
  current_n: number;
  learned_word_count: number;
  block_count: number;
  completed_block_count: number;
  active_block_description: string | null;
};

type KnownWordsData = {
  words: string[];
  count: number;
};

type DashboardData = {
  progress: ProgressRow[];
  blocksByLang: Record<string, BlockSummary[]>;
  uiLang: string;
};

type Stage =
  | { kind: "dashboard-loading" }
  | { kind: "dashboard"; data: DashboardData }
  | { kind: "block-create"; submitting: boolean; error: string | null }
  | { kind: "loading" }
  | {
      kind: "session";
      mode: "repeat" | "test";
      block: SessionBlock;
      phrases: PhraseItem[];
      currentN: number;
      submitting: boolean;
      mistake: { correct: string; wrong: string } | null;
      wrongByPhrase: Record<number, string[]>;
    }
  | { kind: "block-done"; block: SessionBlock; phrases: PhraseItem[]; words: string[]; wordCount: number };

/* ─── Helpers ─── */

function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:"'()\[\]{}«»¿¡]/g, "")
    .replace(/\s+/g, " ");
}

/* ─── Shared chrome ─── */

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
  sessionInfo?: { pair: string; done: number; total: number };
  onChange?: () => void;
  user?: { name?: string | null; email?: string | null; image?: string | null };
}) {
  return (
    <div className="flex items-center justify-between px-9 py-5 border-b border-rule">
      <div className="flex items-center gap-3.5">
        <Mark />
        <span className="font-serif text-[22px] leading-none text-ink">Phrase Trainer</span>
      </div>
      <div className="flex items-center gap-6">
        {sessionInfo && (
          <>
            <div className="text-right">
              <div className="eyebrow">{sessionInfo.pair}</div>
              <div className="text-[12.5px] text-ink-2 mt-[3px] tabular">
                <span className="text-ink font-medium">{sessionInfo.done}</span>
                <span className="text-ink-3"> / {sessionInfo.total} phrases</span>
              </div>
            </div>
            {onChange && (
              <button
                onClick={onChange}
                className="inline-flex items-center border border-rule bg-transparent text-ink-2 text-[11.5px] font-medium px-3 py-[7px] rounded-full hover:text-ink hover:border-ink-3 transition-colors"
              >
                Back to Dashboard
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="ml-1.5">
                  <path d="M1.5 5H8.5 M5 8.5L8.5 5L5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
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
                <img src={user.image} alt={user.name ?? "User"} className="w-6 h-6 rounded-full" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-good/30 flex items-center justify-center text-[11px] font-medium text-good">
                  {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] uppercase tracking-wider text-good font-semibold">Signed in</span>
                {user.name && (
                  <span className="text-[12px] text-ink font-medium max-w-[140px] truncate" title={user.email ?? undefined}>
                    {user.name}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => signOut()}
              className="inline-flex items-center border border-rule bg-transparent text-ink-2 text-[11.5px] font-medium px-3 py-[7px] rounded-full hover:text-ink hover:border-ink-3 transition-colors"
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

/* ─── Main component ─── */

export default function Home() {
  const { data: session, status } = useSession();
  const [sourceLang, setSourceLang] = useState<LanguageCode>("english");
  const [targetLang, setTargetLang] = useState<LanguageCode>("cebuano");
  const [level, setLevel] = useState<LevelCode>("A1");
  const [stage, setStage] = useState<Stage>({ kind: "dashboard-loading" });
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phrasesModal, setPhrasesModal] = useState<{
    source: string;
    target: string;
    level: string;
    blockDescription: string;
    phrases: PhraseItem[];
    loading: boolean;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stage.kind === "session") inputRef.current?.focus();
  }, [stage.kind]);

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
          setStage({ kind: "dashboard", data: { progress: [], blocksByLang: {}, uiLang: "english" } });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [status, stage.kind]);

  /* ─── AUTH GATE ─── */

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
            <button onClick={() => signIn("google")} className={PRIMARY_BTN}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Sign in with Google
            </button>
            <p className="mt-5 text-[11.5px] text-ink-3">
              Privacy: name + email + avatar only.
            </p>
          </div>
        </div>
        <Footer left={<span>Sign in required to save progress.</span>} />
      </Page>
    );
  }

  /* ─── Handlers ─── */

  async function startSession() {
    if (sourceLang === targetLang) {
      setError("Pick two different languages.");
      return;
    }
    setError(null);
    setStage({ kind: "loading" });
    try {
      const res = await fetch(`/api/blocks?source=${sourceLang}&target=${targetLang}&level=${level}`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { activeBlock: { id: number } | null };
      if (data.activeBlock) {
        await loadSession();
      } else {
        setStage({ kind: "block-create", submitting: false, error: null });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setStage({ kind: "dashboard-loading" });
    }
  }

  async function loadSession() {
    setStage({ kind: "loading" });
    setInput("");
    try {
      const res = await fetch(
        `/api/session-phrases?source=${sourceLang}&target=${targetLang}&level=${level}`,
      );
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as {
        currentN: number;
        block: SessionBlock | null;
        phrases: PhraseItem[];
      };
      if (!data.block) {
        setStage({ kind: "block-create", submitting: false, error: null });
        return;
      }
      setStage({
        kind: "session",
        mode: "repeat",
        block: data.block,
        phrases: data.phrases,
        currentN: data.currentN,
        submitting: false,
        mistake: null,
        wrongByPhrase: {},
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load session");
      setStage({ kind: "dashboard-loading" });
    }
  }

  async function submitBlockCreate(description: string | null) {
    setStage({ kind: "block-create", submitting: true, error: null });
    try {
      const res = await fetch("/api/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceLang, targetLang, level, description }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to create block");
      }
      await loadSession();
    } catch (e) {
      setStage({
        kind: "block-create",
        submitting: false,
        error: e instanceof Error ? e.message : "Failed",
      });
    }
  }

  async function submitAnswer() {
    if (stage.kind !== "session" || stage.submitting) return;
    const val = input.trim();
    if (!val) return;

    const currentPhrase = stage.phrases.find((p) => p.phrase_index > stage.currentN);
    if (!currentPhrase) return;

    if (stage.mistake) {
      if (normalize(val) !== normalize(stage.mistake.correct)) {
        setInput("");
        return;
      }
      await advancePhrase(currentPhrase);
      return;
    }

    if (normalize(val) === normalize(currentPhrase.target_text)) {
      await advancePhrase(currentPhrase);
    } else if (stage.mode === "test") {
      // Test mode: mistake resets to beginning
      const firstPhrase = stage.phrases[0];
      setStage({
        ...stage,
        currentN: firstPhrase ? firstPhrase.phrase_index - 1 : 0,
        mistake: null,
        wrongByPhrase: {},
      });
      setInput("");
    } else {
      // Repeat mode: just show the correct answer, continue
      const prev = stage.wrongByPhrase[currentPhrase.phrase_index] ?? [];
      setStage({
        ...stage,
        mistake: { correct: currentPhrase.target_text, wrong: val },
        wrongByPhrase: {
          ...stage.wrongByPhrase,
          [currentPhrase.phrase_index]: [...prev, val],
        },
      });
      setInput("");
    }
  }

  async function advancePhrase(phrase: PhraseItem) {
    setStage((prev) =>
      prev.kind === "session" ? { ...prev, submitting: true, mistake: null } : prev,
    );
    setInput("");
    try {
      await fetch("/api/next-phrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceLang, targetLang, level }),
      });
      setStage((prev) => {
        if (prev.kind !== "session") return prev;
        const newCurrentN = phrase.phrase_index;
        const remaining = prev.phrases.filter((p) => p.phrase_index > newCurrentN);
        if (remaining.length === 0) {
          (async () => {
            try {
              const res = await fetch(`/api/known-words?source=${sourceLang}&target=${targetLang}&level=${level}`);
              if (res.ok) {
                const data = (await res.json()) as KnownWordsData;
                setStage({ kind: "block-done", block: prev.block, phrases: prev.phrases, words: data.words, wordCount: data.count });
              }
            } catch {}
          })();
          return { kind: "block-done", block: prev.block, phrases: prev.phrases, words: [], wordCount: 0 };
        }
        return { ...prev, currentN: newCurrentN, submitting: false, mistake: null };
      });
      setTimeout(() => inputRef.current?.focus(), 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to advance");
      setStage((prev) => (prev.kind === "session" ? { ...prev, submitting: false } : prev));
    }
  }

  function reset() {
    setStage({ kind: "dashboard-loading" });
    setError(null);
    setInput("");
  }

  /* ─── DASHBOARD LOADING ─── */

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

  /* ─── DASHBOARD ─── */

  if (stage.kind === "dashboard") {
    const { progress, blocksByLang } = stage.data;
    return (
      <>
      <Page>
        <Masthead user={session?.user} />
        <div className="flex-1 overflow-y-auto">
          <div className="px-10 lg:px-14 pt-12 pb-8 border-b border-rule">
            <div className="eyebrow text-terracotta mb-3">Dashboard</div>
            <h1 className="font-serif text-[42px] md:text-[48px] leading-[1.05] tracking-[-0.02em]">
              {session?.user?.name ? (
                <>
                  Welcome back,{" "}
                  <span className="italic text-terracotta">
                    {session.user.name.split(" ")[0]}
                  </span>
                  .
                </>
              ) : (
                "Welcome back."
              )}
            </h1>
          </div>

          {/* In-progress languages */}
          <div className="px-10 lg:px-14 py-9 border-b border-rule">
            <div className="eyebrow text-good mb-5">● In progress</div>
            {progress.length === 0 ? (
              <p className="text-[13px] text-ink-3 italic">
                Nothing started yet — start a new language below.
              </p>
            ) : (
              <div className="space-y-5">
                {progress.map((p) => {
                  const tgtLabel =
                    LANGUAGES.find((l) => l.code === p.target_lang)?.label ?? p.target_lang;
                  const langKey = `${p.source_lang}-${p.target_lang}-${p.level}`;
                  const blocks = blocksByLang[langKey] ?? [];

                  return (
                    <div
                      key={langKey}
                      className="bg-paper border border-rule rounded-2xl px-5 py-4"
                    >
                      {/* Language name only — e.g. "Russian" */}
                      <div className="flex items-baseline justify-between mb-3">
                        <div className="font-serif text-[22px] leading-none text-ink">
                          {tgtLabel}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[12px] text-ink-3">
                            {p.learned_word_count} words
                          </span>
                          <span className="font-mono text-[11px] text-ink-3 uppercase">
                            {p.level}
                          </span>
                        </div>
                      </div>

                      {/* Block list */}
                      <div className="space-y-2">
                        {blocks.length === 0 ? (
                          <p className="text-[12px] text-ink-3 italic">
                            No blocks yet — start a new one below.
                          </p>
                        ) : (
                          blocks.map((b) => (
                            <div
                              key={b.id}
                              className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-rule bg-cream"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${b.completed ? "bg-good" : "bg-terracotta"}`} />
                                <span className="font-serif text-[15px] text-ink truncate">
                                  &ldquo;{b.description}&rdquo;
                                </span>
                                <span className="font-mono text-[10px] text-ink-3 shrink-0">
                                  {b.phrase_count} phrases
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  onClick={async () => {
                                    setSourceLang(p.source_lang as LanguageCode);
                                    setTargetLang(p.target_lang as LanguageCode);
                                    setLevel(p.level as LevelCode);
                                    setStage({ kind: "loading" });
                                    try {
                                      const res = await fetch(`/api/session-phrases?source=${p.source_lang}&target=${p.target_lang}&level=${p.level}`);
                                      if (!res.ok) throw new Error();
                                      const data = await res.json();
                                      if (!data.block) { setStage({ kind: "block-create", submitting: false, error: null }); return; }
                                      setStage({
                                        kind: "session", mode: "repeat",
                                        block: data.block, phrases: data.phrases,
                                        currentN: data.currentN, submitting: false,
                                        mistake: null, wrongByPhrase: {},
                                      });
                                    } catch { setStage({ kind: "dashboard-loading" }); }
                                  }}
                                  className="text-[10px] bg-ink text-paper rounded-full px-2.5 py-1 font-medium hover:bg-ink-2 transition-colors"
                                  title="Repeat mode — mistakes are forgiving"
                                >
                                  🔁 Repeat
                                </button>
                                <button
                                  onClick={async () => {
                                    setSourceLang(p.source_lang as LanguageCode);
                                    setTargetLang(p.target_lang as LanguageCode);
                                    setLevel(p.level as LevelCode);
                                    setStage({ kind: "loading" });
                                    try {
                                      const res = await fetch(`/api/session-phrases?source=${p.source_lang}&target=${p.target_lang}&level=${p.level}`);
                                      if (!res.ok) throw new Error();
                                      const data = await res.json();
                                      if (!data.block) { setStage({ kind: "block-create", submitting: false, error: null }); return; }
                                      setStage({
                                        kind: "session", mode: "test",
                                        block: data.block, phrases: data.phrases,
                                        currentN: data.currentN, submitting: false,
                                        mistake: null, wrongByPhrase: {},
                                      });
                                    } catch { setStage({ kind: "dashboard-loading" }); }
                                  }}
                                  className="text-[10px] border border-ink text-ink rounded-full px-2.5 py-1 font-medium hover:bg-ink hover:text-paper transition-colors"
                                  title="Test mode — one mistake resets everything"
                                >
                                  📝 Test
                                </button>
                                <button
                                  onClick={async () => {
                                    const src = p.source_lang; const tgt = p.target_lang; const lvl = p.level;
                                    setPhrasesModal({ source: src, target: tgt, level: lvl, blockDescription: b.description, phrases: [], loading: true });
                                    try {
                                      const res = await fetch(`/api/session-phrases?source=${src}&target=${tgt}&level=${lvl}`);
                                      if (!res.ok) throw new Error();
                                      const data = await res.json();
                                      setPhrasesModal({ source: src, target: tgt, level: lvl, blockDescription: b.description, phrases: data.phrases ?? [], loading: false });
                                    } catch { setPhrasesModal(null); }
                                  }}
                                  className="text-[10px] border border-rule text-ink-2 rounded-full px-2.5 py-1 font-medium hover:text-ink hover:border-ink-3 transition-colors"
                                >
                                  👁 View list
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* New block button */}
                      <button
                        onClick={async () => {
                          setSourceLang(p.source_lang as LanguageCode);
                          setTargetLang(p.target_lang as LanguageCode);
                          setLevel(p.level as LevelCode);
                          setStage({ kind: "block-create", submitting: false, error: null });
                        }}
                        className="mt-2 text-[11px] text-ink-2 hover:text-ink underline underline-offset-2"
                      >
                        + New block
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Start new */}
          <div className="px-10 lg:px-14 py-9">
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
            <button
              onClick={() => { void startSession(); }}
              className={`${PRIMARY_BTN} mt-5`}
            >
              Begin session
              <ArrowRight />
            </button>
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

      {phrasesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setPhrasesModal(null)} />
          <div className="relative bg-paper border border-rule rounded-2xl shadow-2xl w-full max-w-[600px] max-h-[80vh] flex flex-col">
            <div className="flex items-baseline justify-between px-6 pt-5 pb-3 border-b border-rule">
              <div>
                <div className="eyebrow mb-1">Block phrases</div>
                <div className="font-serif text-[20px] text-ink">
                  {LANGUAGES.find((l) => l.code === phrasesModal.source)?.label ?? phrasesModal.source}
                  {" "}→{" "}
                  <span className="italic text-terracotta">
                    {LANGUAGES.find((l) => l.code === phrasesModal.target)?.label ?? phrasesModal.target}
                  </span>
                  {" · "}{phrasesModal.level}
                </div>
                {phrasesModal.blockDescription && (
                  <div className="text-[12px] text-ink-3 mt-1 italic">
                    &ldquo;{phrasesModal.blockDescription}&rdquo;
                  </div>
                )}
              </div>
              <span className="font-mono text-[13px] text-ink-3">
                {phrasesModal.loading ? "..." : phrasesModal.phrases.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {phrasesModal.loading ? (
                <div className="flex justify-center py-8">
                  <p className="eyebrow">Loading phrases…</p>
                </div>
              ) : phrasesModal.phrases.length === 0 ? (
                <p className="text-[13px] text-ink-3 italic">No phrases in this block yet.</p>
              ) : (
                <div className="space-y-2">
                  {phrasesModal.phrases.map((ph) => (
                    <div
                      key={ph.phrase_index}
                      className="px-4 py-3 bg-cream border border-rule rounded-xl flex items-baseline justify-between gap-4"
                    >
                      <div className="text-[13px] text-ink-3 shrink-0">{ph.source_text}</div>
                      <div className="font-serif text-[17px] text-ink text-right">{ph.target_text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-3 border-t border-rule text-right">
              <button
                onClick={() => setPhrasesModal(null)}
                className="text-[12px] text-ink-2 hover:text-ink underline underline-offset-2"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
    );
  }

  /* ─── BLOCK CREATE ─── */

  if (stage.kind === "block-create") {
    return (
      <BlockCreateView
        sourceLabel={LANGUAGES.find((l) => l.code === sourceLang)?.label}
        targetLabel={LANGUAGES.find((l) => l.code === targetLang)?.label}
        level={level}
        submitting={stage.submitting}
        error={stage.error}
        onSubmit={submitBlockCreate}
        onBack={() => setStage({ kind: "dashboard-loading" })}
        user={session?.user}
      />
    );
  }

  /* ─── LOADING ─── */

  if (stage.kind === "loading") {
    return (
      <Page>
        <Masthead user={session?.user} />
        <div className="flex-1 grid place-items-center px-9">
          <div className="text-center">
            <div className="eyebrow text-terracotta">Loading</div>
            <p className="font-serif text-[36px] mt-3 leading-tight">
              Reaching for your phrases…
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

  /* ─── SESSION ─── */

  if (stage.kind === "session") {
    const sourceLabel = LANGUAGES.find((l) => l.code === sourceLang)?.label ?? sourceLang;
    const targetLabel = LANGUAGES.find((l) => l.code === targetLang)?.label ?? targetLang;
    const currentPhrase = stage.phrases.find((p) => p.phrase_index > stage.currentN);
    const doneCount = stage.phrases.filter((p) => p.phrase_index <= stage.currentN).length;
    const totalCount = stage.phrases.length;

    return (
      <Page>
        <Masthead
          sessionInfo={{
            pair: `${sourceLabel} → ${targetLabel} · ${level}`,
            done: doneCount,
            total: totalCount,
          }}
          onChange={() => setStage({ kind: "dashboard-loading" })}
          user={session?.user}
        />

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] min-h-0 overflow-hidden">
          {/* Left: current phrase + input */}
          <div className="px-10 lg:px-12 py-10 flex flex-col lg:border-r border-rule">
            {currentPhrase ? (
              <>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <span className="eyebrow">
                      {stage.mode === "test" ? "📝 Test" : "🔁 Repeat"} · Phrase {doneCount + 1} of {totalCount}
                    </span>
                  </div>
                  <BlockDots done={doneCount} total={totalCount} />
                </div>

                {stage.mistake ? (
                  <div className="mt-2">
                    <div className="eyebrow text-bad mb-2">● Not quite</div>
                    <div className="text-[13px] text-ink-3 mb-1">
                      {currentPhrase.source_text}
                    </div>
                    <div className="font-serif text-[38px] leading-[1.12] tracking-[-0.015em] text-ink mb-4">
                      {stage.mistake.correct}
                    </div>
                    {(stage.wrongByPhrase[currentPhrase.phrase_index] ?? []).map((w, i) => (
                      <div key={i} className="font-mono text-[13px] text-bad line-through">
                        {w || "(empty)"}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2">
                    <div className="eyebrow mb-2">{sourceLabel}</div>
                    <div className="font-serif text-[42px] md:text-[46px] leading-[1.12] tracking-[-0.015em] text-ink">
                      {currentPhrase.source_text}
                    </div>
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitAnswer();
                  }}
                  className="mt-auto pt-8"
                >
                  <div className="eyebrow mb-2.5">
                    {stage.mistake
                      ? "Type the correct answer to continue"
                      : `Type in ${targetLabel}`}
                  </div>
                  <label className={INPUT_WRAP}>
                    <input
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={
                        stage.mistake
                          ? "Type the answer above…"
                          : `Type in ${targetLabel}…`
                      }
                      className="font-serif text-[22px] text-ink flex-1 bg-transparent outline-none placeholder:text-ink-3 placeholder:italic leading-tight"
                      disabled={stage.submitting}
                      autoFocus
                    />
                    <span className="font-mono text-[11px] text-ink-3">↵</span>
                  </label>
                  <button
                    type="submit"
                    disabled={!input.trim() || stage.submitting}
                    className="sr-only"
                  >
                    Submit
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 grid place-items-center">
                <p className="eyebrow text-good">All phrases answered</p>
              </div>
            )}
          </div>

          {/* Right: block phrase list */}
          <div className="px-7 py-8 flex flex-col min-h-0 overflow-hidden">
            <div className="mb-4 flex-shrink-0">
              <div className="eyebrow text-terracotta mb-1">Block</div>
              <div className="font-serif text-[17px] leading-tight text-ink">
                &ldquo;{stage.block.description}&rdquo;
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {stage.phrases.map((phrase) => {
                const isDone = phrase.phrase_index <= stage.currentN;
                const isCurrent = currentPhrase?.phrase_index === phrase.phrase_index;
                const wrongs = stage.wrongByPhrase[phrase.phrase_index] ?? [];

                if (isDone) {
                  return (
                    <div
                      key={phrase.phrase_index}
                      className="px-3 py-2.5 rounded-xl border border-good/30 bg-good-soft"
                    >
                      <div className="text-[11px] text-ink-3 mb-0.5">{phrase.source_text}</div>
                      <div className="font-serif text-[15px] text-ink leading-tight">
                        {phrase.target_text}
                      </div>
                      {phrase.new_words.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {phrase.new_words.map((w) => (
                            <span key={w} className="text-[10px] text-good bg-good/10 px-1.5 py-[1px] rounded-full font-medium">
                              {w}
                            </span>
                          ))}
                        </div>
                      )}
                      {wrongs.map((w, i) => (
                        <div key={i} className="font-mono text-[10px] text-bad line-through mt-0.5">
                          {w}
                        </div>
                      ))}
                    </div>
                  );
                }

                if (isCurrent) {
                  return (
                    <div
                      key={phrase.phrase_index}
                      className="px-3 py-2.5 rounded-xl border border-terracotta bg-terracotta-soft"
                    >
                      <div className="eyebrow text-terracotta text-[10px] mb-0.5">● Now</div>
                      <div className="text-[13px] text-ink leading-tight">
                        {phrase.source_text}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={phrase.phrase_index}
                    className="px-3 py-2 rounded-xl border border-rule opacity-30"
                  >
                    <div className="eyebrow text-[10px]">#{phrase.phrase_index}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <Footer
          left={
            stage.mistake ? (
              <span className="text-bad">● Type the correct answer to continue</span>
            ) : (
              <>
                <Kbd>↵</Kbd>
                <span>Submit</span>
              </>
            )
          }
          right={
            <span>
              {doneCount} / {totalCount} done
            </span>
          }
        />
      </Page>
    );
  }

  /* ─── BLOCK DONE ─── */

  if (stage.kind === "block-done") {
    return (
      <Page>
        <Masthead user={session?.user} />
        <div className="flex-1 overflow-y-auto">
          <div className="px-10 lg:px-14 pt-12 pb-8 border-b border-rule">
            <div className="eyebrow text-good mb-3">✦ Block complete</div>
            <h1 className="font-serif text-[44px] md:text-[52px] leading-[1.05] tracking-[-0.02em] mb-2">
              &ldquo;
              <span className="italic text-terracotta">{stage.block.description}</span>
              &rdquo; done.
            </h1>
            <p className="text-[14px] text-ink-2">
              {stage.phrases.length} phrases learned in this block.
            </p>
            <button
              onClick={() => setStage({ kind: "block-create", submitting: false, error: null })}
              className={`${PRIMARY_BTN} mt-7`}
            >
              Create next block
              <ArrowRight />
            </button>
          </div>

          <div className="px-10 lg:px-14 py-9">
            <div className="flex items-baseline justify-between mb-4">
              <div className="eyebrow">Words learned in this block</div>
              <span className="font-mono text-[13px] text-ink-3">{stage.wordCount} words</span>
            </div>
            {stage.words.length === 0 ? (
              <p className="text-[13px] text-ink-3 italic">No new words in this block.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {stage.words.map((w) => (
                  <div
                    key={w}
                    className="inline-flex items-center gap-1.5 bg-paper border border-rule rounded-full pl-3 pr-1.5 py-1 group hover:border-bad/40 transition-colors"
                  >
                    <span className="text-[13px] text-ink font-medium">{w}</span>
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/known-words?source=${sourceLang}&target=${targetLang}&level=${level}&word=${encodeURIComponent(w)}`, { method: "DELETE" });
                          if (!res.ok) throw new Error();
                          setStage((prev) =>
                            prev.kind === "block-done"
                              ? { ...prev, words: prev.words.filter((x) => x !== w), wordCount: prev.wordCount - 1 }
                              : prev,
                          );
                        } catch {}
                      }}
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] text-ink-3 hover:text-bad hover:bg-bad/10 opacity-0 group-hover:opacity-100 transition-all"
                      title="Remove word"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <Footer
          left={<span>Block saved to your history.</span>}
          right={
            <button
              onClick={() => setStage({ kind: "dashboard-loading" })}
              className="text-[11px] text-ink-2 hover:text-ink underline underline-offset-2"
            >
              Back to dashboard
            </button>
          }
        />
      </Page>
    );
  }

  return null;
}

/* ─── Helper components ─── */

function Page({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-[1100px] min-h-[720px] bg-cream rounded-3xl border border-rule shadow-[0_30px_80px_-30px_rgba(26,23,20,0.25)] flex flex-col overflow-hidden">
        {children}
      </div>
    </main>
  );
}

function FieldRow({
  label,
  children,
  last,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`${last ? "" : "border-b border-rule"}`}
      style={{ paddingTop: 18, paddingBottom: 18 }}
    >
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
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        className="absolute right-4 pointer-events-none"
      >
        <path
          d="M3 5L6 8L9 5"
          stroke="#8A8278"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
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
            <div
              className={`text-[9.5px] mt-0.5 tracking-wide ${
                isActive ? "text-paper/65" : "text-ink-3"
              }`}
            >
              {l.targetWords >= 1000 ? `${l.targetWords / 1000}k` : l.targetWords}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function BlockDots({ done, total }: { done: number; total: number }) {
  return (
    <div className="flex gap-[3px]">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-[3px] transition-all duration-200 ${
            i < done ? "bg-good" : i === done ? "bg-terracotta" : "bg-rule"
          }`}
          style={{ width: i === done ? 12 : 5 }}
        />
      ))}
    </div>
  );
}

function BlockCreateView({
  sourceLabel,
  targetLabel,
  level,
  submitting,
  error,
  onSubmit,
  onBack,
  user,
}: {
  sourceLabel: string | undefined;
  targetLabel: string | undefined;
  level: string;
  submitting: boolean;
  error: string | null;
  onSubmit: (description: string | null) => void;
  onBack: () => void;
  user?: { name?: string | null; email?: string | null; image?: string | null };
}) {
  const [description, setDescription] = useState("");

  return (
    <Page>
      <Masthead user={user} />
      <div className="flex-1 overflow-y-auto px-10 lg:px-14 py-12">
        <div className="max-w-[640px] mx-auto">
          <button
            onClick={onBack}
            className="text-[11.5px] text-ink-2 hover:text-ink underline underline-offset-2 mb-6"
          >
            ← Back to dashboard
          </button>

          <div className="eyebrow text-terracotta mb-3">New block</div>
          <h1 className="font-serif text-[44px] leading-[1.05] tracking-[-0.02em] mb-3">
            What should the next{" "}
            <span className="italic text-terracotta">block</span> teach you?
          </h1>
          <p className="text-[14.5px] text-ink-2 leading-[1.6] mb-8">
            20 phrases in {targetLabel ?? "your target language"} ({level}), generated by AI
            based on your description.
          </p>

          <div className="bg-paper border border-rule rounded-2xl p-6 mb-5">
            <div className="eyebrow mb-2">Describe the theme</div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='e.g. "Ordering food at a restaurant" — or leave empty for auto-pick'
              rows={4}
              disabled={submitting}
              className="w-full bg-cream border border-rule rounded-xl px-4 py-3 text-[15px] text-ink placeholder:text-ink-3 placeholder:italic outline-none focus:border-ink resize-none"
            />
            <p className="text-[11.5px] text-ink-3 mt-2">
              AI will generate 20 phrases on your theme.
            </p>
          </div>

          {error && (
            <div className="bg-bad-soft border border-bad/30 text-bad rounded-xl px-4 py-3 mb-5 text-[13px]">
              {error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => onSubmit(description.trim() || null)}
              disabled={submitting || !description.trim()}
              className={`${PRIMARY_BTN} flex-1`}
            >
              {submitting ? "Generating…" : "Create block"}
              {!submitting && <ArrowRight />}
            </button>
            <button
              onClick={() => onSubmit(null)}
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 border border-ink bg-transparent text-ink rounded-full px-6 py-3.5 text-sm font-medium hover:bg-ink hover:text-paper transition-colors disabled:opacity-40"
            >
              ✨ Generate automatically
            </button>
          </div>

          <p className="text-[11.5px] text-ink-3 mt-5 text-center">
            Pair: {sourceLabel} → {targetLabel} · Level {level} · 20 phrases per block
          </p>
        </div>
      </div>
      <Footer
        left={<span>Each block is a set of phrases on one theme.</span>}
        right={<span>~30 seconds to generate</span>}
      />
    </Page>
  );
}
