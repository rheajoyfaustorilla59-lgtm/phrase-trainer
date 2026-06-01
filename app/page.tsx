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

type LeaderboardEntry = {
  name: string | null;
  image: string | null;
  totalWords: number;
  streak: number;
};

type DashboardData = {
  progress: ProgressRow[];
  blocksByLang: Record<string, BlockSummary[]>;
  uiLang: string;
  streak: number;
};

type Stage =
  | { kind: "landing" }
  | { kind: "dashboard"; data: DashboardData; refreshing?: boolean }
  | { kind: "block-create"; submitting: boolean; error: string | null }
  | { kind: "loading"; message?: string; blockGeneration?: boolean }
  | {
      kind: "session";
      mode: "repeat" | "test" | "cumulative";
      block: SessionBlock;
      phrases: PhraseItem[];
      currentN: number;
      submitting: boolean;
      mistake: { correct: string; wrong: string } | null;
      wrongByPhrase: Record<number, string[]>;
      roundIndex?: number;
      roundUnlocked?: number;
      hadMistakeInRound?: boolean;
    }
  | { kind: "block-done"; block: SessionBlock; phrases: PhraseItem[]; words: string[]; wordCount: number };

/* ─── Funny quotes (English) ─── */

const FUNNY_QUOTES = [
  "You opened the app. That's the hardest part. Probably.",
  "Fluency is just failure with better posture.",
  "Somewhere a native speaker sneezed. That's your motivation now.",
  "You're not bad at this. You're just pre-good.",
  "Learning a language builds character. Yours is being built very slowly.",
  "The app doesn't judge. The AI, however, absolutely does.",
  "One day you'll dream in this language. Tonight you'll just have nightmares about vocabulary.",
  "Your phone autocorrects your English. Imagine what it thinks of this.",
  "Bilingual people exist. You're going to join them. Someday. No rush. (There's a rush.)",
  "Every phrase you learn is a phrase you can use to embarrass yourself internationally.",
  "The secret to fluency: say the wrong thing loudly enough times until it sounds right.",
  "You're literally training your brain. This is a workout. You're basically at the gym.",
  "Progress is progress even when it looks like 'Whaaat is this.'",
  "A wise person once said: just do the reps. That wise person had bad grammar too.",
  "You chose to learn a language instead of watching Netflix. Respect. Questionable, but respect.",
  "This app is rooting for you. Your phone's battery is not.",
  "The goal isn't perfection. The goal is to order food without pointing at the menu.",
  "Somewhere, a toddler speaks this language fluently. Do not think about the toddler.",
  "Your future self will thank you. Your current self is mildly suffering. Balance.",
  "Language learning tip: it gets easier right after it gets much, much harder.",
  "You're doing amazing sweetie. No really. Keep going. Bestie we're watching.",
];

const MISTAKE_JOKES = [
  "STOP GIVING UP BITCH.",
  "Wrong. Embarrassingly wrong. We believe in you anyway.",
  "Girl what was that.",
  "The audacity to submit THAT.",
  "Your ancestors are watching. They're concerned.",
  "Babe no.",
  "Not even close bestie 💀",
  "My guy typed that with full confidence huh.",
  "The AI shed a single tear.",
  "That answer woke up and chose violence.",
  "Delete. Delete. DELETE.",
  "Sir/ma'am this is a language app.",
  "I've seen better guesses from a golden retriever.",
  "We don't talk about that answer. Ever.",
  "The correct answer called. It's disappointed.",
  "Wrong answer energy: immaculate. Actual answer: terrible.",
  "You typed that and pressed enter. On purpose.",
  "Bro said 'yolo' and submitted. Respect. Wrong. But respect.",
  "The dictionary just blocked you.",
  "That was so wrong it came back around and was still wrong.",
  "Your confidence is inspiring. Your answer is not.",
  "History will not remember this moment. Thankfully.",
  "Somewhere, a language teacher felt a disturbance in the force.",
];

function randomItem(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

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
  onGoToDashboard,
}: {
  sessionInfo?: { pair: string; done: number; total: number };
  onChange?: () => void;
  user?: { name?: string | null; email?: string | null; image?: string | null };
  onGoToDashboard?: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-9 py-5 border-b border-rule">
      <div className="flex items-center gap-3.5">
        <Mark />
        <span className="font-serif text-[26px] leading-none text-ink">Phrase Trainer</span>
      </div>
      <div className="flex items-center gap-4">
        {sessionInfo && (
          <div className="text-right">
            <div className="eyebrow">{sessionInfo.pair}</div>
            <div className="text-[18px] text-ink-2 mt-[3px] tabular">
              <span className="text-ink font-medium">{sessionInfo.done}</span>
              <span className="text-ink-3"> / {sessionInfo.total} phrases</span>
            </div>
          </div>
        )}
        <ThreeDotMenu user={user} onBack={onChange} onGoToDashboard={onGoToDashboard} />
      </div>
    </div>
  );
}

function ThreeDotMenu({
  user,
  onBack,
  onGoToDashboard,
}: {
  user?: { name?: string | null; email?: string | null; image?: string | null };
  onBack?: () => void;
  onGoToDashboard?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-9 h-9 rounded-full flex items-center justify-center border border-rule bg-paper text-ink hover:border-ink-3 transition-colors"
        title="Menu"
      >
        <svg width="16" height="4" viewBox="0 0 16 4" fill="none" aria-hidden="true">
          <circle cx="2" cy="2" r="1.5" fill="currentColor"/>
          <circle cx="8" cy="2" r="1.5" fill="currentColor"/>
          <circle cx="14" cy="2" r="1.5" fill="currentColor"/>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-[220px] bg-paper border border-rule rounded-2xl shadow-[0_8px_32px_-8px_rgba(26,23,20,0.2)] overflow-hidden z-50">
          {/* User info */}
          {user && (
            <div className="px-4 py-3 border-b border-rule flex items-center gap-3">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.image} alt={user.name ?? "User"} className="w-8 h-8 rounded-full shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-good/20 flex items-center justify-center text-[16px] font-medium text-good shrink-0">
                  {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                {user.name && <div className="text-[15px] font-medium text-ink truncate">{user.name}</div>}
                {user.email && <div className="text-[13px] text-ink-3 truncate">{user.email}</div>}
              </div>
            </div>
          )}

          {/* Menu items */}
          <div className="py-1.5">
            {onGoToDashboard && (
              <MenuItem icon="🏠" label="Dashboard" onClick={() => { onGoToDashboard(); setOpen(false); }} />
            )}
            {onBack && (
              <MenuItem icon="←" label="Back to Dashboard" onClick={() => { onBack(); setOpen(false); }} />
            )}
            {user ? (
              <MenuItem icon="🚪" label="Sign out" onClick={() => { signOut(); setOpen(false); }} danger />
            ) : (
              <MenuItem icon="🔑" label="Sign in" onClick={() => { signIn("google"); setOpen(false); }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-[15px] text-left transition-colors hover:bg-cream ${danger ? "text-bad hover:text-bad" : "text-ink"}`}
    >
      <span className="w-5 text-center">{icon}</span>
      {label}
    </button>
  );
}

function Footer({ left, right }: { left?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mt-auto flex items-center justify-between px-9 py-3.5 border-t border-rule text-[18px] text-ink-3">
      <div className="flex gap-4 items-center">{left}</div>
      <div className="flex gap-4 items-center">{right}</div>
    </div>
  );
}


const PRIMARY_BTN =
  "inline-flex items-center justify-center gap-2.5 bg-ink text-paper border border-ink rounded-full px-7 py-3.5 text-base font-medium cursor-pointer shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_6px_16px_-8px_rgba(26,23,20,0.5)] hover:bg-ink-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

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
  const emptyDashboard: DashboardData = { progress: [], blocksByLang: {}, uiLang: "english", streak: 0 };
  const [stage, setStage] = useState<Stage>({ kind: "landing" });
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const beginSessionRef = useRef<HTMLDivElement>(null);
  const [phrasesModal, setPhrasesModal] = useState<{
    source: string;
    target: string;
    level: string;
    blockDescription: string;
    phrases: PhraseItem[];
    loading: boolean;
  } | null>(null);
  const [funnyQuote] = useState(() => randomItem(FUNNY_QUOTES));
  const [loadingQuote] = useState(() => randomItem(FUNNY_QUOTES));
  const [dashboardFooterQuote] = useState(() => randomItem(FUNNY_QUOTES));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stage.kind === "session") inputRef.current?.focus();
  }, [stage.kind]);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (stage.kind !== "dashboard" || !stage.refreshing) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard");
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as DashboardData;
        if (!cancelled) setStage({ kind: "dashboard", data, refreshing: false });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load dashboard");
          setStage({ kind: "dashboard", data: emptyDashboard, refreshing: false });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [status, stage.kind]);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (stage.kind !== "dashboard") return;
    let cancelled = false;
    setLeaderboardLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/leaderboard");
        if (!res.ok) throw new Error();
        const data = (await res.json()) as LeaderboardEntry[];
        if (!cancelled) setLeaderboard(data);
      } catch {}
      finally { if (!cancelled) setLeaderboardLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [status, stage.kind]);

  /* ─── LANDING ─── */

  if (stage.kind === "landing") {
    return (
      <Page>
        <div className="flex-1 flex flex-col lg:flex-row min-h-0">
          {/* Left — hero */}
          <div className="flex-1 flex flex-col justify-center px-12 lg:px-16 py-14 lg:border-r border-rule">
            <div className="eyebrow text-terracotta mb-5">Phrase Trainer</div>
            <h1 className="font-serif text-[56px] md:text-[72px] leading-[1.0] tracking-[-0.03em] mb-6">
              Welcome.{" "}
              <span className="italic text-terracotta">Start learning</span>{" "}
              a new language.
            </h1>
            <p className="text-[18px] text-ink-2 leading-[1.7] max-w-[420px] mb-10">
              20 phrases per block. AI-generated. Voice-powered. One wrong answer and you stay — until you get it right.
            </p>
            <div>
              <button
                onClick={() => setStage({ kind: "dashboard", data: emptyDashboard, refreshing: true })}
                className={PRIMARY_BTN}
              >
                Get Started
                <ArrowRight />
              </button>
            </div>
          </div>

          {/* Right — feature list */}
          <div className="lg:w-[340px] flex flex-col justify-center px-10 py-12 gap-5">
            {[
              { icon: "🧱", title: "Blocks of 20", desc: "AI picks the perfect phrases for your level." },
              { icon: "🎤", title: "Voice Practice", desc: "Speak your answer — the mic checks you." },
              { icon: "🔊", title: "Hear It First", desc: "Listen to pronunciation before you type." },
              { icon: "📈", title: "Track Progress", desc: "See how far you've come, block by block." },
              { icon: "😂", title: "Actually Fun", desc: "Wrong answers come with brutally honest jokes." },
            ].map((f) => (
              <div key={f.title} className="flex items-start gap-4">
                <div className="text-[26px] mt-0.5">{f.icon}</div>
                <div>
                  <div className="text-[16px] font-semibold text-ink">{f.title}</div>
                  <div className="text-[15px] text-ink-3 leading-snug mt-0.5">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <Footer left={<span className="italic">Learn smarter, not harder.</span>} />
      </Page>
    );
  }

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
            <h1 className="font-serif text-[50px] leading-[1.05] tracking-[-0.02em] mb-3">
              Welcome to <span className="italic text-terracotta">Phrase Trainer</span>.
            </h1>
            <p className="text-[26px] text-ink-2 leading-[1.6] mb-9">
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
            <p className="mt-5 text-[18px] text-ink-3">
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
        // Auto-create a block — no intermediate screen
        setStage({ kind: "loading", message: "Building your first block…", blockGeneration: true });
        const createRes = await fetch("/api/blocks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceLang, targetLang, level, description: null }),
        });
        if (!createRes.ok) {
          const errData = (await createRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(errData.error ?? "Failed to create block");
        }
        await loadSession();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setStage({ kind: "dashboard", data: emptyDashboard, refreshing: true });
    }
  }

  async function loadSession() {
    setStage({ kind: "loading", message: "Summoning the phrases…" });
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
      setStage({ kind: "dashboard", data: emptyDashboard, refreshing: true });
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

  async function processAnswer(val: string) {
    if (stage.kind !== "session" || stage.submitting) return;
    val = val.trim();
    if (!val) return;

    if (stage.mode === "cumulative") {
      const roundIndex = stage.roundIndex ?? 0;
      const roundUnlocked = stage.roundUnlocked ?? 1;
      const currentPhrase = stage.phrases[roundIndex];
      if (!currentPhrase) return;

      if (stage.mistake) {
        if (normalize(val) !== normalize(stage.mistake.correct)) { setInput(""); return; }
        // After retyping: continue round, mark as failed
        setStage({ ...stage, roundIndex: roundIndex + 1 < roundUnlocked ? roundIndex + 1 : 0, mistake: null, hadMistakeInRound: true });
        setInput("");
        return;
      }

      if (normalize(val) === normalize(currentPhrase.target_text)) {
        if (roundIndex < roundUnlocked - 1) {
          // Continue this round
          setStage({ ...stage, roundIndex: roundIndex + 1, mistake: null });
          setInput("");
        } else {
          // End of round
          const hadMistake = stage.hadMistakeInRound ?? false;
          if (!hadMistake && roundUnlocked < stage.phrases.length) {
            // Unlock next phrase
            await advancePhrase(currentPhrase);
          } else if (!hadMistake && roundUnlocked >= stage.phrases.length) {
            // All phrases mastered!
            await advancePhrase(currentPhrase);
          } else {
            // Had mistakes — restart round, no new phrase
            setStage({ ...stage, roundIndex: 0, hadMistakeInRound: false, mistake: null });
            setInput("");
          }
        }
      } else {
        const prev = stage.wrongByPhrase[currentPhrase.phrase_index] ?? [];
        setStage({
          ...stage,
          mistake: { correct: currentPhrase.target_text, wrong: val },
          hadMistakeInRound: true,
          wrongByPhrase: { ...stage.wrongByPhrase, [currentPhrase.phrase_index]: [...prev, val] },
        });
        setInput("");
      }
      return;
    }

    const currentPhrase = stage.phrases.find((p) => p.phrase_index > stage.currentN);
    if (!currentPhrase) return;

    if (stage.mistake) {
      if (normalize(val) !== normalize(stage.mistake.correct)) {
        setInput("");
        return;
      }
      if (stage.mode === "test") {
        // Typed the correct answer — now restart from phrase 1
        const firstPhrase = stage.phrases[0];
        setStage({
          ...stage,
          currentN: firstPhrase ? firstPhrase.phrase_index - 1 : 0,
          mistake: null,
          wrongByPhrase: {},
        });
        setInput("");
      } else {
        await advancePhrase(currentPhrase);
      }
      return;
    }

    if (normalize(val) === normalize(currentPhrase.target_text)) {
      await advancePhrase(currentPhrase);
    } else {
      // Both repeat and test: show the correct answer, require retyping
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

  async function submitAnswer() {
    await processAnswer(input);
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

        if (prev.mode === "cumulative") {
          const newRoundUnlocked = (prev.roundUnlocked ?? 1) + 1;
          if (newRoundUnlocked > prev.phrases.length) {
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
          return { ...prev, submitting: false, mistake: null, roundIndex: 0, roundUnlocked: newRoundUnlocked, hadMistakeInRound: false };
        }

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

  async function loadBlockSession(src: string, tgt: string, lvl: string, mode: "repeat" | "test" | "cumulative", blockId?: number) {
    setSourceLang(src as LanguageCode);
    setTargetLang(tgt as LanguageCode);
    setLevel(lvl as LevelCode);
    setStage({ kind: "loading" });
    try {
      const url = `/api/session-phrases?source=${src}&target=${tgt}&level=${lvl}${blockId ? `&blockId=${blockId}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (!data.block) { setStage({ kind: "block-create", submitting: false, error: null }); return; }
      setStage({
        kind: "session", mode,
        block: data.block, phrases: data.phrases,
        currentN: data.currentN, submitting: false,
        mistake: null, wrongByPhrase: {},
        ...(mode === "cumulative" ? { roundIndex: 0, roundUnlocked: 1, hadMistakeInRound: false } : {}),
      });
    } catch { setStage({ kind: "dashboard", data: emptyDashboard, refreshing: true }); }
  }

  /* ─── DASHBOARD ─── */

  if (stage.kind === "dashboard") {
    const { progress, blocksByLang, streak } = stage.data;
    const isRefreshing = stage.refreshing ?? false;
    return (
      <>
      <Page>
        <Masthead user={session?.user} />
        <div className="flex-1 overflow-y-auto">
          {/* Streak banner */}
          {streak > 0 && (
            <div className="px-10 lg:px-14 pt-5 pb-0">
              <div className="inline-flex items-center gap-2 bg-paper border border-rule rounded-full px-4 py-2">
                <span className="text-[20px]">🔥</span>
                <span className="text-[16px] font-medium text-ink">{streak}-day streak</span>
                <span className="text-[15px] text-ink-3">Keep it up!</span>
              </div>
            </div>
          )}
          {/* In-progress languages */}
          <div className="px-10 lg:px-14 py-9 border-b border-rule">
            <div className="eyebrow text-good mb-5">● In progress</div>
            {isRefreshing ? (
              <p className="text-[18px] text-ink-3 italic animate-pulse">Loading…</p>
            ) : progress.length === 0 ? (
              <p className="text-[18px] text-ink-3 italic">
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
                        <div className="font-serif text-[26px] leading-none text-ink">
                          {tgtLabel}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[18px] text-ink-3">
                            {p.learned_word_count} words
                          </span>
                          <span className="font-mono text-[18px] text-ink-3 uppercase">
                            {p.level}
                          </span>
                          <button
                            onClick={() => {
                              const confirmed = window.confirm(
                                `Delete all data for ${tgtLabel} (${p.level})? This cannot be undone.`,
                              );
                              if (!confirmed) return;
                              (async () => {
                                try {
                                  await fetch(
                                    `/api/delete-language?source=${p.source_lang}&target=${p.target_lang}&level=${p.level}`,
                                    { method: "DELETE" },
                                  );
                                  setStage({ kind: "dashboard", data: emptyDashboard, refreshing: true });
                                } catch {}
                              })();
                            }}
                            className="text-[18px] text-ink-3 hover:text-bad transition-colors font-mono"
                            title={`Delete ${tgtLabel} (${p.level})`}
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* Skill Tree */}
                      <SkillTree
                        sourceLang={p.source_lang}
                        targetLang={p.target_lang}
                        allProgress={progress}
                        onLevelClick={(lvl, status) => {
                          if (status === "not-started") {
                            setSourceLang(p.source_lang as LanguageCode);
                            setTargetLang(p.target_lang as LanguageCode);
                            setLevel(lvl as LevelCode);
                            beginSessionRef.current?.scrollIntoView({ behavior: "smooth" });
                          } else {
                            void loadBlockSession(p.source_lang, p.target_lang, lvl, "repeat");
                          }
                        }}
                      />

                      {/* Block list */}
                      <div className="space-y-2">
                        {blocks.length === 0 ? (
                          <p className="text-[18px] text-ink-3 italic">
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
                                <span className="font-serif text-[18px] text-ink truncate">
                                  &ldquo;{b.description}&rdquo;
                                </span>
                                <span className="font-mono text-[18px] text-ink-3 shrink-0">
                                  {b.phrase_count} phrases
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  onClick={() => { void loadBlockSession(p.source_lang, p.target_lang, p.level, "cumulative", b.id); }}
                                  className="text-[18px] bg-terracotta text-paper rounded-full px-2.5 py-1 font-medium hover:opacity-85 transition-colors"
                                  title="Cumulative mode — new phrase only when all previous are perfect"
                                >
                                  📚 Learn
                                </button>
                                <button
                                  onClick={() => { void loadBlockSession(p.source_lang, p.target_lang, p.level, "repeat", b.id); }}
                                  className="text-[18px] bg-ink text-paper rounded-full px-2.5 py-1 font-medium hover:bg-ink-2 transition-colors"
                                  title="Repeat mode — mistakes are forgiving"
                                >
                                  🔁 Repeat
                                </button>
                                <button
                                  onClick={() => { void loadBlockSession(p.source_lang, p.target_lang, p.level, "test", b.id); }}
                                  className="text-[18px] border border-ink text-ink rounded-full px-2.5 py-1 font-medium hover:bg-ink hover:text-paper transition-colors"
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
                                  className="text-[18px] border border-rule text-ink-2 rounded-full px-2.5 py-1 font-medium hover:text-ink hover:border-ink-3 transition-colors"
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
                        className="mt-2 text-[18px] text-ink-2 hover:text-ink underline underline-offset-2"
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
          <div ref={beginSessionRef} className="px-10 lg:px-14 py-9">
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
            {error && <p className="text-bad text-base mt-3">{error}</p>}
            <button
              onClick={() => { void startSession(); }}
              className={`${PRIMARY_BTN} mt-5`}
            >
              Begin session
              <ArrowRight />
            </button>
          </div>

          {/* Leaderboard */}
          <div className="px-10 lg:px-14 py-9 border-t border-rule">
            <div className="eyebrow text-terracotta mb-5">🏆 Leaderboard</div>
            {leaderboardLoading ? (
              <p className="text-[18px] text-ink-3 italic animate-pulse">Loading…</p>
            ) : leaderboard.length === 0 ? (
              <p className="text-[18px] text-ink-3 italic">No entries yet — be the first!</p>
            ) : (
              <div className="space-y-2 max-w-[600px]">
                {leaderboard.map((entry, i) => {
                  const isMe = entry.name === session?.user?.name && entry.image === session?.user?.image;
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${isMe ? "border-terracotta bg-terracotta/5" : "border-rule bg-paper"}`}
                    >
                      <span className="font-mono text-[15px] text-ink-3 w-5 shrink-0">#{i + 1}</span>
                      {entry.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={entry.image} alt={entry.name ?? "User"} className="w-7 h-7 rounded-full shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-good/20 flex items-center justify-center text-[14px] font-medium text-good shrink-0">
                          {(entry.name ?? "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="flex-1 text-[16px] font-medium text-ink truncate">
                        {entry.name ?? "Anonymous"}{isMe && <span className="ml-1.5 text-[13px] text-terracotta font-normal">you</span>}
                      </span>
                      {entry.streak > 0 && (
                        <span className="text-[14px] text-ink-3 shrink-0">🔥 {entry.streak}</span>
                      )}
                      <span className="text-[15px] font-medium text-ink shrink-0">{entry.totalWords.toLocaleString()} words</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Link Telegram — compact */}
          <div className="px-10 lg:px-14 pb-9">
            <div className="border-t border-rule pt-4 flex items-center gap-4 flex-wrap">
              <span className="text-[15px] text-ink-3">📱 Practice on Telegram?</span>
              <TelegramLinkButton />
            </div>
          </div>
        </div>
        <Footer
          left={<span className="italic max-w-[300px] truncate">💬 {dashboardFooterQuote}</span>}
        />
      </Page>

      {phrasesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setPhrasesModal(null)} />
          <div className="relative bg-paper border border-rule rounded-2xl shadow-2xl w-full max-w-[600px] max-h-[80vh] flex flex-col">
            <div className="flex items-baseline justify-between px-6 pt-5 pb-3 border-b border-rule">
              <div>
                <div className="eyebrow mb-1">Block phrases</div>
                <div className="font-serif text-[26px] text-ink">
                  {LANGUAGES.find((l) => l.code === phrasesModal.source)?.label ?? phrasesModal.source}
                  {" "}→{" "}
                  <span className="italic text-terracotta">
                    {LANGUAGES.find((l) => l.code === phrasesModal.target)?.label ?? phrasesModal.target}
                  </span>
                  {" · "}{phrasesModal.level}
                </div>
                {phrasesModal.blockDescription && (
                  <div className="text-[18px] text-ink-3 mt-1 italic">
                    &ldquo;{phrasesModal.blockDescription}&rdquo;
                  </div>
                )}
              </div>
              <span className="font-mono text-[18px] text-ink-3">
                {phrasesModal.loading ? "..." : phrasesModal.phrases.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {phrasesModal.loading ? (
                <div className="flex justify-center py-8">
                  <p className="eyebrow">Loading phrases…</p>
                </div>
              ) : phrasesModal.phrases.length === 0 ? (
                <p className="text-[18px] text-ink-3 italic">No phrases in this block yet.</p>
              ) : (
                <div className="space-y-2">
                  {phrasesModal.phrases.map((ph) => (
                    <div
                      key={ph.phrase_index}
                      className="px-4 py-3 bg-cream border border-rule rounded-xl flex items-baseline justify-between gap-4"
                    >
                      <div className="text-[18px] text-ink-3 shrink-0">{ph.source_text}</div>
                      <div className="font-serif text-[26px] text-ink text-right">{ph.target_text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-3 border-t border-rule text-right">
              <button
                onClick={() => setPhrasesModal(null)}
                className="text-[18px] text-ink-2 hover:text-ink underline underline-offset-2"
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
        onBack={() => setStage({ kind: "dashboard", data: emptyDashboard, refreshing: true })}
        user={session?.user}
      />
    );
  }

  /* ─── LOADING ─── */

  if (stage.kind === "loading") {
    const loadingMessage = stage.message ?? "Summoning the phrases…";
    return (
      <Page>
        <Masthead user={session?.user} onGoToDashboard={() => setStage({ kind: "dashboard", data: emptyDashboard, refreshing: true })} />
        <div className="flex-1 grid place-items-center px-9">
          <div className="text-center max-w-[420px]">
            <div className="eyebrow text-terracotta">Loading</div>
            <p className="font-serif text-[40px] mt-3 leading-tight">
              {loadingMessage}
            </p>
            {stage.blockGeneration ? (
              <BlockGenerationSteps />
            ) : (
              <>
                <p className="text-[18px] text-ink-3 mt-3 italic">
                  💬 {loadingQuote}
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
              </>
            )}
          </div>
        </div>
      </Page>
    );
  }

  /* ─── SESSION ─── */

  if (stage.kind === "session") {
    const sourceLabel = LANGUAGES.find((l) => l.code === sourceLang)?.label ?? sourceLang;
    const targetLabel = LANGUAGES.find((l) => l.code === targetLang)?.label ?? targetLang;
    const isCumulative = stage.mode === "cumulative";
    const roundIndex = stage.roundIndex ?? 0;
    const roundUnlocked = stage.roundUnlocked ?? 1;
    const currentPhrase = isCumulative
      ? stage.phrases[roundIndex]
      : stage.phrases.find((p) => p.phrase_index > stage.currentN);
    const doneCount = isCumulative ? roundUnlocked - 1 : stage.phrases.filter((p) => p.phrase_index <= stage.currentN).length;
    const totalCount = stage.phrases.length;

    return (
      <Page>
        <Masthead
          sessionInfo={{
            pair: `${sourceLabel} → ${targetLabel} · ${level}`,
            done: doneCount,
            total: totalCount,
          }}
          onChange={() => setStage({ kind: "dashboard", data: emptyDashboard, refreshing: true })}
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
                      {isCumulative
                        ? `📚 Learn · Round phrase ${roundIndex + 1} of ${roundUnlocked}${stage.hadMistakeInRound ? " · ✗ redo round" : ""}`
                        : stage.mode === "test" ? `📝 Test · Phrase ${doneCount + 1} of ${totalCount}`
                        : `🔁 Repeat · Phrase ${doneCount + 1} of ${totalCount}`}
                    </span>
                  </div>
                  <BlockDots done={isCumulative ? roundIndex : doneCount} total={isCumulative ? roundUnlocked : totalCount} />
                </div>

                {stage.mistake ? (
                  <div className="mt-2">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="eyebrow text-bad">● {randomItem(MISTAKE_JOKES)}</span>
                    </div>
                    <div className="text-[18px] text-ink-3 mb-1">
                      {currentPhrase.source_text}
                    </div>
                    <div className="flex items-center gap-3 mb-1">
                      <div className="font-serif text-[50px] leading-[1.12] tracking-[-0.015em] text-ink">
                        {stage.mistake.correct}
                      </div>
                      <SpeakerButton text={stage.mistake.correct} langCode={targetLang} />
                    </div>
                    {(stage.wrongByPhrase[currentPhrase.phrase_index] ?? []).map((w, i) => (
                      <div key={i} className="font-mono text-[18px] text-bad line-through">
                        {w || "(empty)"}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2">
                    <div className="eyebrow mb-2">{sourceLabel}</div>
                    <div className="font-serif text-[54px] md:text-[58px] leading-[1.12] tracking-[-0.015em] text-ink mb-3">
                      {currentPhrase.source_text}
                    </div>
                    <div className="flex items-center gap-3 mb-3">
                      <SpeakerButton text={currentPhrase.target_text} langCode={targetLang} />
                      <span className="text-[18px] text-ink-3">Hear {targetLabel} pronunciation</span>
                    </div>
                    {/* Reveal button for beginners who need a hint */}
                    <ShowAnswerButton
                      targetText={currentPhrase.target_text}
                      targetLangCode={targetLang}
                    />
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
                      ? stage.mode === "test"
                        ? "Type the correct answer — then restart from phrase 1"
                        : "Type the correct answer to continue"
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
                      className="font-serif text-[26px] text-ink flex-1 bg-transparent outline-none placeholder:text-ink-3 placeholder:italic leading-tight"
                      disabled={stage.submitting}
                      autoFocus
                    />
                    <MicButton
                      langCode={targetLang}
                      onResult={(text) => {
                        setInput(text);
                        void processAnswer(text);
                      }}
                    />
                    <span className="font-mono text-[18px] text-ink-3 ml-1">↵</span>
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
              <div className="font-serif text-[26px] leading-tight text-ink">
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
                      <div className="text-[18px] text-ink-3 mb-0.5">{phrase.source_text}</div>
                      <div className="font-serif text-[18px] text-ink leading-tight">
                        {phrase.target_text}
                      </div>
                      {phrase.new_words.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {phrase.new_words.map((w) => (
                            <span key={w} className="text-[18px] text-good bg-good/10 px-1.5 py-[1px] rounded-full font-medium">
                              {w}
                            </span>
                          ))}
                        </div>
                      )}
                      {wrongs.map((w, i) => (
                        <div key={i} className="font-mono text-[18px] text-bad line-through mt-0.5">
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
                      <div className="eyebrow text-terracotta text-[18px] mb-0.5">● Now</div>
                      <div className="text-[18px] text-ink leading-tight">
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
                    <div className="eyebrow text-[18px]">#{phrase.phrase_index}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Session progress bar footer */}
        <div className="px-9 py-4 border-t border-rule flex items-center gap-4">
          {stage.mistake ? (
            <span className="text-[15px] text-bad font-medium shrink-0">● Type the correct answer to continue</span>
          ) : isCumulative ? (
            <span className="text-[15px] text-ink-2 shrink-0">
              {roundUnlocked - 1} <span className="text-ink-3">/ {totalCount} mastered</span>
            </span>
          ) : (
            <span className="text-[15px] text-ink-2 shrink-0">
              {doneCount} <span className="text-ink-3">/ {totalCount}</span>
            </span>
          )}
          <div className="flex-1 h-2 bg-rule rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isCumulative && stage.hadMistakeInRound ? "bg-terracotta" : "bg-good"}`}
              style={{ width: `${totalCount > 0 ? (isCumulative ? ((roundUnlocked - 1) / totalCount) * 100 : (doneCount / totalCount) * 100) : 0}%` }}
            />
          </div>
          <span className="text-[15px] text-ink-3 shrink-0 tabular">
            {totalCount > 0 ? Math.round((isCumulative ? (roundUnlocked - 1) : doneCount) / totalCount * 100) : 0}%
          </span>
        </div>
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
            <h1 className="font-serif text-[50px] md:text-[58px] leading-[1.05] tracking-[-0.02em] mb-2">
              &ldquo;
              <span className="italic text-terracotta">{stage.block.description}</span>
              &rdquo; done.
            </h1>
            <p className="text-[18px] text-ink-2">
              {stage.phrases.length} phrases learned in this block.
            </p>
            <p className="text-[18px] text-ink-3 mt-3 italic">
              💬 {funnyQuote}
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
              <span className="font-mono text-[18px] text-ink-3">{stage.wordCount} words</span>
            </div>
            {stage.words.length === 0 ? (
              <p className="text-[18px] text-ink-3 italic">No new words in this block.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {stage.words.map((w) => (
                  <div
                    key={w}
                    className="inline-flex items-center gap-1.5 bg-paper border border-rule rounded-full pl-3 pr-1.5 py-1 group hover:border-bad/40 transition-colors"
                  >
                    <span className="text-[18px] text-ink font-medium">{w}</span>
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
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[18px] text-ink-3 hover:text-bad hover:bg-bad/10 opacity-0 group-hover:opacity-100 transition-all"
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
              onClick={() => setStage({ kind: "dashboard", data: emptyDashboard, refreshing: true })}
              className="text-[18px] text-ink-2 hover:text-ink underline underline-offset-2"
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

/* ─── Speech ─── */

const LANG_BCP47: Record<string, string> = {
  english:    "en-US",
  cebuano:    "fil-PH",
  tagalog:    "fil-PH",
  portuguese: "pt-PT",
  russian:    "ru-RU",
};

function SpeakerButton({ text, langCode, size = "md" }: { text: string; langCode: string; size?: "sm" | "md" }) {
  const [playing, setPlaying] = useState(false);

  function speak() {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = LANG_BCP47[langCode] ?? "en-US";
    utt.onend = () => setPlaying(false);
    utt.onerror = () => setPlaying(false);
    setPlaying(true);
    window.speechSynthesis.speak(utt);
  }

  const sz = size === "sm"
    ? "w-6 h-6 text-[18px]"
    : "w-8 h-8 text-[18px]";

  return (
    <button
      type="button"
      onClick={speak}
      title="Listen to pronunciation"
      className={`${sz} rounded-full flex items-center justify-center border transition-colors ${
        playing
          ? "border-terracotta bg-terracotta/10 text-terracotta"
          : "border-rule bg-paper text-ink-2 hover:border-ink-3 hover:text-ink"
      }`}
    >
      {playing ? (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <rect x="2" y="2" width="4" height="10" rx="1" fill="currentColor"/>
          <rect x="8" y="2" width="4" height="10" rx="1" fill="currentColor"/>
        </svg>
      ) : (
        <svg width="15" height="14" viewBox="0 0 15 14" fill="none" aria-hidden="true">
          <path d="M2 4.5H5L9 1.5V12.5L5 9.5H2V4.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="none"/>
          <path d="M11 4C11.8 4.8 12.3 5.9 12.3 7C12.3 8.1 11.8 9.2 11 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          <path d="M12.5 2C13.9 3.3 14.8 5.1 14.8 7C14.8 8.9 13.9 10.7 12.5 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      )}
    </button>
  );
}

// Extend Window type for SpeechRecognition
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}

function MicButton({ langCode, onResult }: { langCode: string; onResult: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionInstance | null>(null);

  function toggle() {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) {
      alert("Sorry, your browser doesn't support voice input. Try Chrome.");
      return;
    }
    const rec = new SR();
    rec.lang = LANG_BCP47[langCode] ?? "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      onResult(transcript);
      setListening(false);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={listening ? "Stop recording" : "Speak your answer"}
      className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all shrink-0 ${
        listening
          ? "border-bad bg-bad/10 text-bad animate-pulse"
          : "border-rule bg-paper text-ink-2 hover:border-ink-3 hover:text-ink"
      }`}
    >
      <svg width="14" height="18" viewBox="0 0 14 18" fill="none" aria-hidden="true">
        <rect x="4" y="1" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M1 9C1 12.3137 3.68629 15 7 15C10.3137 15 13 12.3137 13 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="7" y1="15" x2="7" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="4.5" y1="17" x2="9.5" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </button>
  );
}

/* ─── Helper components ─── */

const BLOCK_GEN_STEPS = [
  { label: "Picking a theme for you…", delay: 0 },
  { label: "Choosing vocabulary for your level…", delay: 4000 },
  { label: "Writing 20 phrases…", delay: 9000 },
  { label: "Checking the translations…", delay: 16000 },
  { label: "Almost there…", delay: 22000 },
];

function BlockGenerationSteps() {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const timers = BLOCK_GEN_STEPS.map((step, i) =>
      setTimeout(() => setStepIndex(i), step.delay),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="mt-6 space-y-2 text-left">
      {BLOCK_GEN_STEPS.map((step, i) => {
        const done = i < stepIndex;
        const current = i === stepIndex;
        return (
          <div
            key={i}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-500 ${
              current ? "bg-terracotta/10 border border-terracotta/20" :
              done ? "opacity-40" : "opacity-20"
            }`}
          >
            <span className="text-[18px] w-5 text-center">
              {done ? "✓" : current ? "⋯" : "○"}
            </span>
            <span className={`text-[18px] ${current ? "text-ink font-medium" : "text-ink-2"}`}>
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex flex-col bg-cream">
      <div className="flex-1 flex flex-col">
        {children}
      </div>
      <ChatWidget />
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
        className={`appearance-none bg-transparent outline-none font-serif text-[26px] pr-7 flex-1 cursor-pointer ${
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
            <div className="font-mono text-[18px] font-medium">{l.code}</div>
            <div
              className={`text-[18px] mt-0.5 tracking-wide ${
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

function ShowAnswerButton({
  targetText,
  targetLangCode,
}: {
  targetText: string;
  targetLangCode?: string;
}) {
  const [revealed, setRevealed] = useState(false);

  if (revealed) {
    return (
      <div className="flex items-center gap-3 bg-amber-soft border border-amber/30 rounded-xl px-4 py-3">
        <span className="font-serif text-[26px] text-ink leading-tight flex-1">
          {targetText}
        </span>
        {targetLangCode && (
          <SpeakerButton text={targetText} langCode={targetLangCode} size="sm" />
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setRevealed(true)}
      className="text-[18px] text-ink-2 hover:text-ink underline underline-offset-2 transition-colors"
    >
      👁 Show translation
    </button>
  );
}


function TelegramLinkButton() {
  const [loading, setLoading] = useState(false);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleLink() {
    setLoading(true);
    setError(null);
    setLinkCode(null);
    try {
      const res = await fetch("/api/telegram-link", { method: "POST" });
      if (!res.ok) throw new Error("Failed to generate code");
      const data = await res.json();
      setLinkCode(data.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function copyCode() {
    if (!linkCode) return;
    try {
      await navigator.clipboard.writeText(linkCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  if (linkCode) {
    return (
      <div>
        <div className="bg-amber-soft border border-amber/30 rounded-xl px-5 py-4 mb-3 max-w-[500px]">
          <div className="eyebrow text-amber mb-2">✨ Your linking code</div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[32px] font-bold tracking-[0.15em] text-ink">
              {linkCode}
            </span>
            <button
              onClick={copyCode}
              className="text-[18px] text-ink-2 hover:text-ink underline underline-offset-2 transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-[18px] text-ink-3 mt-2">
            Open Telegram and send this command to the bot:
          </p>
          <div className="bg-paper border border-rule rounded-lg px-3 py-2 mt-1 font-mono text-[18px] text-ink">
            /link {linkCode}
          </div>
        </div>
        <button
          onClick={handleLink}
          className="text-[18px] text-ink-2 hover:text-ink underline underline-offset-2 transition-colors"
        >
          Generate new code
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={handleLink}
        disabled={loading}
        className="inline-flex items-center gap-2 border border-ink bg-transparent text-ink rounded-full px-5 py-2.5 text-[18px] font-medium hover:bg-ink hover:text-paper transition-colors disabled:opacity-40"
      >
        {loading ? "Generating…" : "🔗 Link Telegram"}
      </button>
      {error && <p className="text-bad text-[18px] mt-2">{error}</p>}
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
            className="text-[18px] text-ink-2 hover:text-ink underline underline-offset-2 mb-6"
          >
            ← Back to dashboard
          </button>

          <div className="eyebrow text-terracotta mb-3">New block</div>
          <h1 className="font-serif text-[50px] leading-[1.05] tracking-[-0.02em] mb-3">
            What should the next{" "}
            <span className="italic text-terracotta">block</span> teach you?
          </h1>
          <p className="text-[26px] text-ink-2 leading-[1.6] mb-8">
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
              className="w-full bg-cream border border-rule rounded-xl px-4 py-3 text-[18px] text-ink placeholder:text-ink-3 placeholder:italic outline-none focus:border-ink resize-none"
            />
            <p className="text-[18px] text-ink-3 mt-2">
              AI will generate 20 phrases on your theme.
            </p>
          </div>

          {error && (
            <div className="bg-bad-soft border border-bad/30 text-bad rounded-xl px-4 py-3 mb-5 text-[18px]">
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
              className="inline-flex items-center justify-center gap-2 border border-ink bg-transparent text-ink rounded-full px-6 py-3.5 text-base font-medium hover:bg-ink hover:text-paper transition-colors disabled:opacity-40"
            >
              ✨ Generate automatically
            </button>
          </div>

          <p className="text-[18px] text-ink-3 mt-5 text-center">
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

/* ─── Skill Tree ─── */

function SkillTree({
  sourceLang,
  targetLang,
  allProgress,
  onLevelClick,
}: {
  sourceLang: string;
  targetLang: string;
  allProgress: ProgressRow[];
  onLevelClick: (level: string, status: "not-started" | "in-progress" | "done") => void;
}) {
  return (
    <div className="mb-3">
      <div className="eyebrow mb-2">Skill tree</div>
      <div className="flex gap-1.5 flex-wrap">
        {LEVELS.map((l) => {
          const row = allProgress.find(
            (r) => r.source_lang === sourceLang && r.target_lang === targetLang && r.level === l.code,
          );
          const status: "not-started" | "in-progress" | "done" = !row
            ? "not-started"
            : row.learned_word_count >= l.targetWords
            ? "done"
            : "in-progress";

          return (
            <button
              key={l.code}
              type="button"
              onClick={() => onLevelClick(l.code, status)}
              title={status === "not-started" ? `Start ${l.code}` : `Open ${l.code} session`}
              className={`flex flex-col items-center px-3 py-2 rounded-xl border transition-colors min-w-[52px] ${
                status === "done"
                  ? "border-good bg-good/10 hover:bg-good/20"
                  : status === "in-progress"
                  ? "border-terracotta bg-terracotta/10 hover:bg-terracotta/20"
                  : "border-rule bg-paper opacity-50 hover:opacity-80"
              }`}
            >
              <span className="font-mono text-[13px] font-semibold text-ink">{l.code}</span>
              <span className="text-[12px] mt-0.5">
                {status === "done" ? "✓" : status === "in-progress" ? "▶" : "🔒"}
              </span>
              {row && (
                <span className="text-[11px] text-ink-3 tabular mt-0.5">
                  {row.learned_word_count >= 1000
                    ? `${(row.learned_word_count / 1000).toFixed(1)}k`
                    : row.learned_word_count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Chat Widget ─── */

type ChatMessage = { role: "user" | "assistant"; content: string };

function ChatWidget() {
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [aiName, setAiName] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("aiName") ?? "AI Assistant";
    return "AI Assistant";
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameInput, setRenameInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => chatInputRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (renaming) setTimeout(() => renameRef.current?.focus(), 50);
  }, [renaming]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (status !== "authenticated") return null;

  function saveName() {
    const name = renameInput.trim() || "AI Assistant";
    setAiName(name);
    localStorage.setItem("aiName", name);
    setRenaming(false);
    setMenuOpen(false);
  }

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    const newMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages([...newMessages, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      if (!res.ok || !res.body) throw new Error("Failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            updated[updated.length - 1] = { ...last, content: last.content + chunk };
          }
          return updated;
        });
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant" && !last.content) {
          updated[updated.length - 1] = { ...last, content: "Something went wrong. Try again." };
        }
        return updated;
      });
    } finally {
      setStreaming(false);
      setTimeout(() => chatInputRef.current?.focus(), 0);
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="w-[360px] h-[500px] bg-paper border border-rule rounded-2xl shadow-[0_24px_64px_-16px_rgba(26,23,20,0.35)] flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-rule shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-2 h-2 rounded-full bg-good shrink-0" />
              {renaming ? (
                <form onSubmit={(e) => { e.preventDefault(); saveName(); }} className="flex items-center gap-1.5">
                  <input
                    ref={renameRef}
                    value={renameInput}
                    onChange={(e) => setRenameInput(e.target.value)}
                    className="text-[14px] font-medium text-ink bg-cream border border-rule rounded-lg px-2 py-0.5 outline-none w-[130px]"
                    placeholder="Enter a name…"
                  />
                  <button type="submit" className="text-[12px] text-good font-medium hover:underline">Save</button>
                  <button type="button" onClick={() => setRenaming(false)} className="text-[12px] text-ink-3 hover:underline">Cancel</button>
                </form>
              ) : (
                <span className="font-medium text-[15px] text-ink truncate">{aiName}</span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="w-7 h-7 flex items-center justify-center rounded-full text-ink-3 hover:text-ink hover:bg-cream transition-colors"
                  title="Options"
                >
                  <svg width="14" height="4" viewBox="0 0 14 4" fill="none" aria-hidden="true">
                    <circle cx="2" cy="2" r="1.4" fill="currentColor"/>
                    <circle cx="7" cy="2" r="1.4" fill="currentColor"/>
                    <circle cx="12" cy="2" r="1.4" fill="currentColor"/>
                  </svg>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-9 w-[170px] bg-paper border border-rule rounded-xl shadow-[0_8px_24px_-8px_rgba(26,23,20,0.2)] overflow-hidden z-10">
                    <button
                      onClick={() => { setRenameInput(aiName); setRenaming(true); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-ink hover:bg-cream text-left"
                    >
                      ✏️ Rename AI
                    </button>
                    <button
                      onClick={() => { setMessages([]); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-ink hover:bg-cream text-left border-t border-rule"
                    >
                      🗑️ Clear chat
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full text-ink-3 hover:text-ink hover:bg-cream transition-colors text-[16px]"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-[13px] text-ink-3 italic text-center mt-8">
                Ask me anything — language tips, grammar, or just chat!
              </p>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-ink text-paper rounded-br-sm"
                      : "bg-cream border border-rule text-ink rounded-bl-sm"
                  }`}
                >
                  {msg.content || (
                    <span className="flex gap-1 items-center py-0.5">
                      {[0, 0.2, 0.4].map((d) => (
                        <span
                          key={d}
                          className="w-1.5 h-1.5 bg-ink-3 rounded-full"
                          style={{ animation: `blink 1.4s infinite ${d}s` }}
                        />
                      ))}
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); void send(); }}
            className="px-3 py-3 border-t border-rule shrink-0"
          >
            <div className="flex items-center gap-2 bg-cream border border-rule rounded-xl px-3 py-2">
              <input
                ref={chatInputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything…"
                disabled={streaming}
                className="flex-1 bg-transparent text-[14px] text-ink placeholder:text-ink-3 outline-none"
              />
              <button
                type="submit"
                disabled={!input.trim() || streaming}
                className="w-7 h-7 rounded-full bg-ink text-paper flex items-center justify-center disabled:opacity-30 transition-opacity shrink-0"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M1 11L11 1M11 1H4M11 1V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="w-14 h-14 rounded-full bg-ink text-paper shadow-[0_8px_24px_-8px_rgba(26,23,20,0.5)] flex items-center justify-center hover:bg-ink-2 transition-colors"
        title="Chat with AI"
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M2 2L16 16M16 2L2 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M2 10C2 5.58 5.58 2 10 2C14.42 2 18 5.58 18 10C18 14.42 14.42 18 10 18H2L4.5 15.5C3.01 14.17 2 12.19 2 10Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none"/>
            <circle cx="7" cy="10" r="1" fill="currentColor"/>
            <circle cx="10" cy="10" r="1" fill="currentColor"/>
            <circle cx="13" cy="10" r="1" fill="currentColor"/>
          </svg>
        )}
      </button>
    </div>
  );
}
