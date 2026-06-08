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

type HeartsState = { hearts: number; max: number; nextHeartInMs: number };

type StorySentence = { target: string; source: string };
type StoryQuestion = { question: string; options: string[]; answerIndex: number };
type Story = {
  title: string;
  titleSource: string;
  sentences: StorySentence[];
  questions: StoryQuestion[];
};

type QuizQuestion = {
  type: "mc-translate" | "listening" | "fill-blank";
  promptLabel: string; // instruction shown above
  promptText: string; // source text, or the sentence with a blank
  hint?: string; // e.g. source translation for fill-blank
  audioText?: string; // target text to speak (listening)
  options: string[];
  answerIndex: number;
};

type DashboardData = {
  progress: ProgressRow[];
  blocksByLang: Record<string, BlockSummary[]>;
  uiLang: string;
  streak: number;
  daily: { phrasesToday: number; dailyGoal: number };
  hearts?: HeartsState;
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
  | { kind: "block-done"; block: SessionBlock; phrases: PhraseItem[]; words: string[]; wordCount: number }
  | { kind: "story"; source: string; target: string; level: string; story: Story }
  | { kind: "quiz"; source: string; target: string; level: string; blockId: number; blockDescription: string; questions: QuizQuestion[] }
  | { kind: "conversation"; source: string; target: string; level: string }
  | { kind: "wordtutor"; source: string; target: string; level: string };

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

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function quizWords(text: string): string[] {
  return text
    .replace(/[.,!?;:"'()\[\]{}«»¿¡]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

// Builds a mixed-type quiz from a block's phrases. Pure (uses Math.random for variety).
function buildQuiz(phrases: PhraseItem[]): QuizQuestion[] {
  const usable = phrases.filter((p) => p.source_text?.trim() && p.target_text?.trim());
  if (usable.length < 2) return [];

  // Pool of distractor words across the block (for fill-blank).
  const wordPool = Array.from(
    new Set(usable.flatMap((p) => quizWords(p.target_text)).filter((w) => w.length > 1)),
  );

  function distractorTexts(correct: string, pick: (p: PhraseItem) => string, count: number): string[] {
    const pool = shuffle(usable.map(pick).filter((t) => t && t !== correct));
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of pool) {
      if (out.length >= count) break;
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
    return out;
  }

  const selected = shuffle(usable).slice(0, Math.min(10, usable.length));
  const types: QuizQuestion["type"][] = ["mc-translate", "listening", "fill-blank"];

  const questions: QuizQuestion[] = selected.map((p, i) => {
    let type = types[i % types.length];
    const words = quizWords(p.target_text);
    if (type === "fill-blank" && words.length < 2) type = "mc-translate";

    if (type === "mc-translate") {
      const opts = shuffle([p.target_text, ...distractorTexts(p.target_text, (x) => x.target_text, 3)]);
      return {
        type,
        promptLabel: "Choose the correct translation",
        promptText: p.source_text,
        options: opts,
        answerIndex: opts.indexOf(p.target_text),
      };
    }

    if (type === "listening") {
      const opts = shuffle([p.source_text, ...distractorTexts(p.source_text, (x) => x.source_text, 3)]);
      return {
        type,
        promptLabel: "Listen and choose the meaning",
        promptText: "",
        audioText: p.target_text,
        options: opts,
        answerIndex: opts.indexOf(p.source_text),
      };
    }

    // fill-blank: blank out the longest word in the target phrase (token-based, so we
    // don't accidentally replace a substring inside another word).
    const blankWord = [...words].sort((a, b) => b.length - a.length)[0];
    const tokens = p.target_text.split(/\s+/);
    const pos = tokens.findIndex((t) => quizWords(t)[0]?.toLowerCase() === blankWord.toLowerCase());
    if (pos >= 0) tokens[pos] = tokens[pos].replace(blankWord, "_____");
    const blanked = tokens.join(" ");
    const distractors = shuffle(wordPool.filter((w) => w.toLowerCase() !== blankWord.toLowerCase())).slice(0, 3);
    const opts = shuffle([blankWord, ...distractors]);
    return {
      type,
      promptLabel: "Fill in the missing word",
      promptText: blanked,
      hint: p.source_text,
      options: opts,
      answerIndex: opts.indexOf(blankWord),
    };
  });

  return questions.filter((q) => q.options.length >= 2 && q.answerIndex >= 0);
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

function HeartsRow({ hearts }: { hearts: HeartsState }) {
  const mins = Math.ceil(hearts.nextHeartInMs / 60000);
  const title =
    hearts.hearts >= hearts.max
      ? "Full hearts"
      : hearts.hearts === 0
      ? `Out of hearts — next in ~${mins} min`
      : `${hearts.hearts} of ${hearts.max} hearts — next in ~${mins} min`;
  return (
    <div className="flex items-center gap-0.5" title={title}>
      {Array.from({ length: hearts.max }).map((_, i) => (
        <span key={i} className={`text-[18px] leading-none ${i < hearts.hearts ? "" : "opacity-25 grayscale"}`}>
          {i < hearts.hearts ? "❤️" : "🤍"}
        </span>
      ))}
    </div>
  );
}

function Masthead({
  sessionInfo,
  onChange,
  user,
  onGoToDashboard,
  onOpenSettings,
  hearts,
}: {
  sessionInfo?: { pair: string; done: number; total: number };
  onChange?: () => void;
  user?: { name?: string | null; email?: string | null; image?: string | null };
  onGoToDashboard?: () => void;
  onOpenSettings?: () => void;
  hearts?: HeartsState;
}) {
  return (
    <div className="flex items-center justify-between px-9 py-5 border-b border-rule">
      <div className="flex items-center gap-3.5">
        {onChange && (
          <button
            onClick={onChange}
            className="w-9 h-9 rounded-full flex items-center justify-center border border-rule bg-paper text-ink hover:border-ink-3 transition-colors shrink-0"
            title="Back to Dashboard"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
        <Mark />
        <span className="font-serif text-[26px] leading-none text-ink">Phrase Trainer</span>
      </div>
      <div className="flex items-center gap-4">
        {hearts && <HeartsRow hearts={hearts} />}
        {sessionInfo && (
          <div className="text-right">
            <div className="eyebrow">{sessionInfo.pair}</div>
            <div className="text-[18px] text-ink-2 mt-[3px] tabular">
              <span className="text-ink font-medium">{sessionInfo.done}</span>
              <span className="text-ink-3"> / {sessionInfo.total} phrases</span>
            </div>
          </div>
        )}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="w-9 h-9 rounded-full flex items-center justify-center border border-rule bg-paper text-ink hover:border-ink-3 transition-colors shrink-0"
            title="Settings — start a new language"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
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
  const emptyDashboard: DashboardData = { progress: [], blocksByLang: {}, uiLang: "english", streak: 0, daily: { phrasesToday: 0, dailyGoal: 10 } };
  const [stage, setStage] = useState<Stage>({ kind: "landing" });
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [hearts, setHearts] = useState<HeartsState>({ hearts: 5, max: 5, nextHeartInMs: 0 });
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  function applyTheme(t: "light" | "dark") {
    setTheme(t);
    const root = document.documentElement;
    if (t === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    try { localStorage.setItem("theme", t); } catch {}
  }
  const [settingsOpen, setSettingsOpen] = useState(false);
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


  const dashboardNeedsRefresh = stage.kind === "dashboard" && !!stage.refreshing;
  useEffect(() => {
    if (status !== "authenticated") return;
    if (!dashboardNeedsRefresh) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard");
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as DashboardData;
        if (!cancelled) {
          if (data.hearts) setHearts(data.hearts);
          setStage({ kind: "dashboard", data, refreshing: false });
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load dashboard");
          setStage({ kind: "dashboard", data: emptyDashboard, refreshing: false });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [status, dashboardNeedsRefresh]);

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

  // Deduct a heart on the server and sync local state. Fire-and-forget for UI snappiness.
  function loseHeart() {
    setHearts((h) => ({ ...h, hearts: Math.max(0, h.hearts - 1) }));
    (async () => {
      try {
        const res = await fetch("/api/hearts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "lose" }),
        });
        if (res.ok) setHearts((await res.json()) as HeartsState);
      } catch {}
    })();
  }

  async function processAnswer(val: string) {
    if (stage.kind !== "session" || stage.submitting) return;
    val = val.trim();
    if (!val) return;

    if (stage.mode === "cumulative") {
      const roundIndex = stage.roundIndex ?? 0;
      const roundUnlocked = stage.roundUnlocked ?? 1;
      // roundIndex 0 & 1 → new phrase (0=with translator, 1=recall); 2+ → old phrases
      const currentPhrase = stage.phrases[roundIndex <= 1 ? roundUnlocked - 1 : roundIndex - 2];
      if (!currentPhrase) return;

      if (stage.mistake) {
        if (normalize(val) !== normalize(stage.mistake.correct)) { setInput(""); return; }
        setStage({ ...stage, roundIndex: roundIndex + 1 <= roundUnlocked ? roundIndex + 1 : 0, mistake: null, hadMistakeInRound: true });
        setInput("");
        return;
      }

      if (normalize(val) === normalize(currentPhrase.target_text)) {
        if (roundIndex < roundUnlocked) {
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
      // Both repeat and test: show the correct answer, require retyping.
      // Hearts only have stakes in Test mode.
      if (stage.mode === "test") loseHeart();
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

  async function loadStory(src: string, tgt: string, lvl: string) {
    setStage({ kind: "loading", message: "Writing your story…" });
    try {
      const res = await fetch(`/api/story?source=${src}&target=${tgt}&level=${lvl}`);
      if (!res.ok) throw new Error(await res.text());
      const story = (await res.json()) as Story;
      setStage({ kind: "story", source: src, target: tgt, level: lvl, story });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create story");
      setStage({ kind: "dashboard", data: emptyDashboard, refreshing: true });
    }
  }

  function loadConversation(src: string, tgt: string, lvl: string) {
    setStage({ kind: "conversation", source: src, target: tgt, level: lvl });
  }

  function loadWordTutor(src: string, tgt: string, lvl: string) {
    setStage({ kind: "wordtutor", source: src, target: tgt, level: lvl });
  }

  async function loadQuiz(src: string, tgt: string, lvl: string, blockId: number, blockDescription: string) {
    setStage({ kind: "loading", message: "Building your quiz…" });
    try {
      const res = await fetch(`/api/session-phrases?source=${src}&target=${tgt}&level=${lvl}&blockId=${blockId}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const questions = buildQuiz((data.phrases ?? []) as PhraseItem[]);
      if (questions.length === 0) {
        setError("Not enough phrases in this block for a quiz yet.");
        setStage({ kind: "dashboard", data: emptyDashboard, refreshing: true });
        return;
      }
      setStage({ kind: "quiz", source: src, target: tgt, level: lvl, blockId, blockDescription, questions });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to build quiz");
      setStage({ kind: "dashboard", data: emptyDashboard, refreshing: true });
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
      // Repeat/Test should run through THIS block from its first phrase (block-relative),
      // not from the level-wide global progress. Cumulative drives position via roundUnlocked.
      const phrases = (data.phrases ?? []) as PhraseItem[];
      const firstIndex = phrases.length ? phrases[0].phrase_index : 0;
      const startN = mode === "cumulative" ? data.currentN : firstIndex - 1;
      setStage({
        kind: "session", mode,
        block: data.block, phrases,
        currentN: startN, submitting: false,
        mistake: null, wrongByPhrase: {},
        ...(mode === "cumulative" ? { roundIndex: 0, roundUnlocked: 1, hadMistakeInRound: false } : {}),
      });
    } catch { setStage({ kind: "dashboard", data: emptyDashboard, refreshing: true }); }
  }

  /* ─── DASHBOARD ─── */

  if (stage.kind === "dashboard") {
    const { progress, blocksByLang, streak, daily } = stage.data;
    const isRefreshing = stage.refreshing ?? false;
    return (
      <>
      <Page>
        <Masthead user={session?.user} onOpenSettings={() => setSettingsOpen(true)} />
        <div className="flex-1 overflow-y-auto">
          {/* Streak */}
          {streak > 0 && (
            <div className="px-10 lg:px-14 pt-5 pb-0 flex flex-wrap gap-3">
              <div className="inline-flex items-center gap-2 bg-paper border border-rule rounded-full px-4 py-2">
                <span className="text-[20px]">🔥</span>
                <span className="text-[16px] font-medium text-ink">{streak}-day streak</span>
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
                Nothing started yet — tap ⚙ Settings up top to start a new language.
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
                            setSettingsOpen(true);
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
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${b.completed ? "bg-good" : "bg-terracotta"}`} />
                                <span className="font-serif text-[15px] text-ink truncate">
                                  &ldquo;{b.description}&rdquo;
                                </span>
                                <span className="font-mono text-[12px] text-ink-3 shrink-0">
                                  {b.phrase_count}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                                <button
                                  onClick={() => { void loadBlockSession(p.source_lang, p.target_lang, p.level, "cumulative", b.id); }}
                                  className="text-[13px] bg-terracotta text-paper rounded-full px-2 py-0.5 font-medium hover:opacity-85 transition-colors"
                                  title="Cumulative mode — new phrase only when all previous are perfect"
                                >
                                  📚 Learn
                                </button>
                                <button
                                  onClick={() => { void loadBlockSession(p.source_lang, p.target_lang, p.level, "repeat", b.id); }}
                                  className="text-[13px] bg-ink text-paper rounded-full px-2 py-0.5 font-medium hover:bg-ink-2 transition-colors"
                                  title="Repeat mode — mistakes are forgiving"
                                >
                                  🔁 Repeat
                                </button>
                                <button
                                  onClick={() => { void loadBlockSession(p.source_lang, p.target_lang, p.level, "test", b.id); }}
                                  className="text-[13px] border border-ink text-ink rounded-full px-2 py-0.5 font-medium hover:bg-ink hover:text-paper transition-colors"
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
                                  className="text-[13px] border border-rule text-ink-2 rounded-full px-2 py-0.5 font-medium hover:text-ink hover:border-ink-3 transition-colors"
                                >
                                  👁 View list
                                </button>
                                <button
                                  onClick={() => { void loadQuiz(p.source_lang, p.target_lang, p.level, b.id, b.description); }}
                                  className="text-[13px] bg-good text-paper rounded-full px-2 py-0.5 font-medium hover:opacity-85 transition-colors"
                                  title="Quiz — mixed question types (multiple choice, listening, fill-in-the-blank)"
                                >
                                  🧩 Quiz
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Actions */}
                      <div className="mt-2.5 flex items-center gap-x-3.5 gap-y-1.5 flex-wrap">
                        <button
                          onClick={async () => {
                            setSourceLang(p.source_lang as LanguageCode);
                            setTargetLang(p.target_lang as LanguageCode);
                            setLevel(p.level as LevelCode);
                            setStage({ kind: "block-create", submitting: false, error: null });
                          }}
                          className="text-[13px] text-ink-2 hover:text-ink underline underline-offset-2"
                        >
                          + New block
                        </button>
                        <button
                          onClick={() => { void loadStory(p.source_lang, p.target_lang, p.level); }}
                          className="text-[13px] text-ink-2 hover:text-terracotta underline underline-offset-2"
                          title="Read a short AI story built from words you've learned"
                        >
                          📖 Read a story
                        </button>
                        <button
                          onClick={() => loadConversation(p.source_lang, p.target_lang, p.level)}
                          className="text-[13px] text-ink-2 hover:text-terracotta underline underline-offset-2"
                          title="Practice a real conversation with the AI in this language"
                        >
                          💬 Practice talking
                        </button>
                        <button
                          onClick={() => loadWordTutor(p.source_lang, p.target_lang, p.level)}
                          className="text-[13px] text-ink-2 hover:text-terracotta underline underline-offset-2"
                          title="Ask the AI to teach you specific words or phrases you want to learn"
                        >
                          🔤 Ask for words
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSettingsOpen(false)} />
          <div className="relative bg-paper border border-rule rounded-2xl shadow-2xl w-full max-w-[640px] max-h-[85vh] flex flex-col">
            <div className="flex items-baseline justify-between px-6 pt-5 pb-3 border-b border-rule">
              <div>
                <div className="eyebrow text-terracotta mb-1">⚙ Settings</div>
                <div className="font-serif text-2xl text-ink">Settings</div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="eyebrow text-terracotta mb-4">+ Start a new language</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div className="mt-2">
                <FieldRow label="Level">
                  <LevelStrip active={level} onPick={setLevel} />
                </FieldRow>
              </div>
              <div className="mt-2">
                <FieldRow label="Daily goal">
                  <DailyGoalPill
                    phrasesToday={daily.phrasesToday}
                    dailyGoal={daily.dailyGoal}
                    onGoalChange={async (goal) => {
                      await fetch("/api/dashboard", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ dailyGoal: goal }),
                      });
                      setStage((prev) =>
                        prev.kind === "dashboard"
                          ? { ...prev, data: { ...prev.data, daily: { ...prev.data.daily, dailyGoal: goal } } }
                          : prev
                      );
                    }}
                  />
                </FieldRow>
              </div>
              <div className="mt-2">
                <FieldRow label="Appearance" last>
                  <div className="inline-flex items-center gap-1 bg-cream border border-rule rounded-full p-1">
                    <button
                      onClick={() => applyTheme("light")}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[14px] font-medium transition-colors ${theme === "light" ? "bg-paper text-ink shadow-sm" : "text-ink-3 hover:text-ink"}`}
                    >
                      ☀️ Light
                    </button>
                    <button
                      onClick={() => applyTheme("dark")}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[14px] font-medium transition-colors ${theme === "dark" ? "bg-ink text-paper shadow-sm" : "text-ink-3 hover:text-ink"}`}
                    >
                      🌙 Dark
                    </button>
                  </div>
                </FieldRow>
              </div>
              {error && <p className="text-bad text-base mt-3">{error}</p>}
            </div>
            <div className="px-6 py-4 border-t border-rule flex items-center justify-between gap-4">
              <button
                onClick={() => setSettingsOpen(false)}
                className="text-[18px] text-ink-2 hover:text-ink underline underline-offset-2"
              >
                Cancel
              </button>
              <button
                onClick={() => { setSettingsOpen(false); void startSession(); }}
                className={PRIMARY_BTN}
              >
                Begin session
                <ArrowRight />
              </button>
            </div>
          </div>
        </div>
      )}

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
      ? stage.phrases[roundIndex <= 1 ? roundUnlocked - 1 : roundIndex - 2]
      : stage.phrases.find((p) => p.phrase_index > stage.currentN);
    const doneCount = isCumulative ? roundUnlocked - 1 : stage.phrases.filter((p) => p.phrase_index <= stage.currentN).length;
    const totalCount = stage.phrases.length;
    const hideTranslation = isCumulative && roundIndex > 0;

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
          hearts={stage.mode === "test" ? hearts : undefined}
        />

        {stage.mode === "test" && hearts.hearts <= 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative bg-paper border border-rule rounded-2xl shadow-2xl w-full max-w-[440px] px-8 py-9 text-center">
              <div className="text-[52px] leading-none mb-3">💔</div>
              <h2 className="font-serif text-3xl text-ink mb-2">Out of hearts</h2>
              <p className="text-[17px] text-ink-2 leading-relaxed mb-6">
                You ran out of hearts. A new one returns in about{" "}
                <span className="font-medium text-ink">{Math.max(1, Math.ceil(hearts.nextHeartInMs / 60000))} min</span>.
              </p>
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/hearts");
                      if (res.ok) setHearts((await res.json()) as HeartsState);
                    } catch {}
                  }}
                  className={PRIMARY_BTN + " w-full justify-center"}
                >
                  Check again
                </button>
                <button
                  onClick={() => setStage({ kind: "dashboard", data: emptyDashboard, refreshing: true })}
                  className="text-[16px] text-ink-2 hover:text-ink underline underline-offset-2 py-1"
                >
                  Back to dashboard
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] min-h-0 overflow-hidden">
          {/* Left: current phrase + input */}
          <div className="px-10 lg:px-12 py-10 flex flex-col lg:border-r border-rule">
            {currentPhrase ? (
              <>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <span className="eyebrow">
                      {isCumulative
                        ? roundIndex === 0
                          ? `📚 Learn · New phrase ${roundUnlocked}${stage.hadMistakeInRound ? " · ✗ redo round" : ""}`
                          : roundIndex === 1
                          ? `📚 Learn · Recall new phrase${stage.hadMistakeInRound ? " · ✗ redo round" : ""}`
                          : `📚 Learn · Recall ${roundIndex - 1} of ${roundUnlocked - 1}${stage.hadMistakeInRound ? " · ✗ redo round" : ""}`
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
                    {!hideTranslation && (
                      <div className="text-[18px] text-ink-3 mb-1">
                        {currentPhrase.source_text}
                      </div>
                    )}
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
                    <div className="eyebrow mb-2">{hideTranslation ? "From memory" : sourceLabel}</div>
                    {hideTranslation ? (
                      <div className="font-serif text-[54px] md:text-[58px] leading-[1.12] tracking-[-0.015em] text-ink-3 italic mb-3 select-none">
                        Recall from memory…
                      </div>
                    ) : (
                      <div className="font-serif text-[54px] md:text-[58px] leading-[1.12] tracking-[-0.015em] text-ink mb-3">
                        {currentPhrase.source_text}
                      </div>
                    )}
                    {!hideTranslation && (
                      <>
                        <div className="flex items-center gap-3 mb-3">
                          <SpeakerButton text={currentPhrase.target_text} langCode={targetLang} />
                          <span className="text-[18px] text-ink-3">Hear {targetLabel} pronunciation</span>
                        </div>
                        <ShowAnswerButton
                          targetText={currentPhrase.target_text}
                          targetLangCode={targetLang}
                        />
                      </>
                    )}
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
                    <button
                      type="submit"
                      disabled={!input.trim() || stage.submitting}
                      className="w-9 h-9 rounded-full bg-ink text-paper flex items-center justify-center disabled:opacity-30 transition-opacity shrink-0 ml-1"
                      aria-label="Submit"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </label>
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

  /* ─── STORY ─── */

  if (stage.kind === "story") {
    const targetLabel = LANGUAGES.find((l) => l.code === stage.target)?.label ?? stage.target;
    return (
      <StoryView
        story={stage.story}
        targetLabel={targetLabel}
        targetLang={stage.target}
        level={stage.level}
        user={session?.user}
        onBack={() => setStage({ kind: "dashboard", data: emptyDashboard, refreshing: true })}
        onAnother={() => { void loadStory(stage.source, stage.target, stage.level); }}
      />
    );
  }

  /* ─── QUIZ ─── */

  if (stage.kind === "quiz") {
    const targetLabel = LANGUAGES.find((l) => l.code === stage.target)?.label ?? stage.target;
    return (
      <QuizView
        questions={stage.questions}
        targetLabel={targetLabel}
        targetLang={stage.target}
        level={stage.level}
        blockDescription={stage.blockDescription}
        user={session?.user}
        onBack={() => setStage({ kind: "dashboard", data: emptyDashboard, refreshing: true })}
        onRetry={() => { void loadQuiz(stage.source, stage.target, stage.level, stage.blockId, stage.blockDescription); }}
      />
    );
  }

  /* ─── CONVERSATION ─── */

  if (stage.kind === "conversation") {
    const targetLabel = LANGUAGES.find((l) => l.code === stage.target)?.label ?? stage.target;
    return (
      <ConversationView
        source={stage.source}
        target={stage.target}
        targetLabel={targetLabel}
        level={stage.level}
        user={session?.user}
        onBack={() => setStage({ kind: "dashboard", data: emptyDashboard, refreshing: true })}
      />
    );
  }

  /* ─── WORD TUTOR ─── */

  if (stage.kind === "wordtutor") {
    const targetLabel = LANGUAGES.find((l) => l.code === stage.target)?.label ?? stage.target;
    return (
      <WordTutorView
        source={stage.source}
        target={stage.target}
        targetLabel={targetLabel}
        level={stage.level}
        user={session?.user}
        onBack={() => setStage({ kind: "dashboard", data: emptyDashboard, refreshing: true })}
      />
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

function speakNow(text: string, langCode: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = LANG_BCP47[langCode] ?? "en-US";
  window.speechSynthesis.speak(utt);
}

function QuizView({
  questions,
  targetLabel,
  targetLang,
  level,
  blockDescription,
  user,
  onBack,
  onRetry,
}: {
  questions: QuizQuestion[];
  targetLabel: string;
  targetLang: string;
  level: string;
  blockDescription: string;
  user?: { name?: string | null; email?: string | null; image?: string | null };
  onBack: () => void;
  onRetry: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const q = questions[index];
  const total = questions.length;
  const isLast = index === total - 1;

  // Auto-play audio when a listening question appears.
  useEffect(() => {
    if (!finished && q?.type === "listening" && q.audioText) speakNow(q.audioText, targetLang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, finished]);

  function check() {
    if (selected === null || checked) return;
    if (selected === q.answerIndex) setScore((s) => s + 1);
    setChecked(true);
  }

  function next() {
    if (isLast) {
      setFinished(true);
      return;
    }
    setIndex((i) => i + 1);
    setSelected(null);
    setChecked(false);
  }

  if (finished) {
    const pct = Math.round((score / total) * 100);
    const emoji = pct === 100 ? "🏆" : pct >= 70 ? "🎉" : pct >= 40 ? "👍" : "📚";
    return (
      <Page>
        <Masthead user={user} onChange={onBack} />
        <div className="flex-1 grid place-items-center px-9">
          <div className="text-center max-w-[440px]">
            <div className="text-[64px] leading-none mb-4">{emoji}</div>
            <div className="eyebrow text-terracotta mb-3">🧩 Quiz complete</div>
            <h1 className="font-serif text-[52px] leading-none text-ink mb-3">{score} / {total}</h1>
            <p className="text-[18px] text-ink-2 mb-8">
              {pct === 100 ? "Perfect score!" : pct >= 70 ? "Nicely done." : "Keep practicing — you'll get there."}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={onRetry} className={PRIMARY_BTN}>🧩 New quiz</button>
              <button onClick={onBack} className="text-[18px] text-ink-2 hover:text-ink underline underline-offset-2 px-3 py-2">
                Back to dashboard
              </button>
            </div>
          </div>
        </div>
      </Page>
    );
  }

  if (!q) return null;

  return (
    <Page>
      <Masthead
        sessionInfo={{ pair: `🧩 Quiz · ${targetLabel} · ${level}`, done: index + (checked ? 1 : 0), total }}
        onChange={onBack}
        user={user}
      />
      <div className="flex-1 overflow-y-auto">
        <div className="px-10 lg:px-14 py-9 max-w-[720px]">
          <div className="flex items-center justify-between mb-6">
            <span className="eyebrow">{q.promptLabel}</span>
            <BlockDots done={index} total={total} />
          </div>

          {/* Prompt */}
          {q.type === "listening" ? (
            <div className="mb-7 flex items-center gap-4">
              <button
                onClick={() => q.audioText && speakNow(q.audioText, targetLang)}
                className="inline-flex items-center gap-2.5 bg-ink text-paper rounded-full px-6 py-3.5 text-base font-medium hover:bg-ink-2 transition-colors"
              >
                🔊 Play again
              </button>
              <span className="text-[16px] text-ink-3 italic">Listen, then choose the meaning.</span>
            </div>
          ) : (
            <div className="mb-7">
              <div className="font-serif text-[40px] md:text-[46px] leading-[1.1] tracking-[-0.015em] text-ink">
                {q.promptText}
              </div>
              {q.hint && <div className="text-[17px] text-ink-3 italic mt-2">{q.hint}</div>}
            </div>
          )}

          {/* Options */}
          <div className="grid gap-2.5 max-w-[560px]">
            {q.options.map((opt, oi) => {
              const isAnswer = oi === q.answerIndex;
              const isPicked = selected === oi;
              let cls = "border-rule bg-paper hover:border-ink-3";
              if (checked) {
                if (isAnswer) cls = "border-good bg-good/10";
                else if (isPicked) cls = "border-bad bg-bad/10";
                else cls = "border-rule bg-paper opacity-60";
              } else if (isPicked) {
                cls = "border-ink bg-cream";
              }
              return (
                <button
                  key={oi}
                  disabled={checked}
                  onClick={() => setSelected(oi)}
                  className={`text-left text-[20px] px-5 py-3.5 rounded-xl border transition-colors ${cls}`}
                >
                  {opt}
                  {checked && isAnswer && <span className="text-good font-medium"> ✓</span>}
                  {checked && isPicked && !isAnswer && <span className="text-bad font-medium"> ✗</span>}
                </button>
              );
            })}
          </div>

          {/* Action */}
          <div className="mt-7">
            {!checked ? (
              <button onClick={check} disabled={selected === null} className={PRIMARY_BTN}>
                Check
              </button>
            ) : (
              <button onClick={next} className={PRIMARY_BTN}>
                {isLast ? "See results" : "Next"}
                <ArrowRight />
              </button>
            )}
          </div>
        </div>
      </div>
      <Footer left={<span className="italic max-w-[320px] truncate">🧩 &ldquo;{blockDescription}&rdquo;</span>} />
    </Page>
  );
}

function ConversationBubble({ content, targetLang }: { content: string; targetLang: string }) {
  // Assistant content has optional "✎ correction" and "↳ translation" lines.
  const lines = content.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const correction = lines.find((l) => l.startsWith("✎"));
  const translation = lines.find((l) => l.startsWith("↳"));
  const reply = lines.filter((l) => !l.startsWith("✎") && !l.startsWith("↳")).join(" ");
  return (
    <div className="space-y-1.5">
      {correction && (
        <div className="text-[14px] text-terracotta bg-terracotta/10 border border-terracotta/20 rounded-lg px-3 py-1.5">
          {correction.replace(/^✎\s*/, "✎ ")}
        </div>
      )}
      {reply && (
        <div className="flex items-start gap-2">
          <span className="font-serif text-[20px] text-ink leading-snug flex-1">{reply}</span>
          <SpeakerButton text={reply} langCode={targetLang} size="sm" />
        </div>
      )}
      {translation && (
        <div className="text-[15px] text-ink-3 italic">{translation.replace(/^↳\s*/, "")}</div>
      )}
      {!reply && !correction && !translation && <span className="text-ink-3">…</span>}
    </div>
  );
}

function ConversationView({
  source,
  target,
  targetLabel,
  level,
  user,
  onBack,
}: {
  source: string;
  target: string;
  targetLabel: string;
  level: string;
  user?: { name?: string | null; email?: string | null; image?: string | null };
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [started, setStarted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function streamReply(history: ChatMessage[]) {
    setMessages([...history, { role: "assistant", content: "" }]);
    setStreaming(true);
    try {
      const res = await fetch("/api/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, target, level, messages: history }),
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
          if (last?.role === "assistant") updated[updated.length - 1] = { ...last, content: last.content + chunk };
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
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  // Kick off with an AI opener.
  useEffect(() => {
    if (started) return;
    setStarted(true);
    void streamReply([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    void streamReply(history);
  }

  return (
    <Page>
      <Masthead
        sessionInfo={{ pair: `💬 Conversation · ${targetLabel} · ${level}`, done: 0, total: 0 }}
        onChange={onBack}
        user={user}
      />
      <div className="flex-1 overflow-y-auto px-6 lg:px-12 py-7">
        <div className="max-w-[680px] mx-auto space-y-5">
          <p className="text-[15px] text-ink-3 italic text-center">
            Chat in {targetLabel}. The AI keeps it simple, corrects gently (✎), and translates (↳).
          </p>
          {messages.map((m, i) =>
            m.role === "assistant" ? (
              <div key={i} className="bg-paper border border-rule rounded-2xl rounded-tl-md px-4 py-3 max-w-[88%]">
                <ConversationBubble content={m.content} targetLang={target} />
              </div>
            ) : (
              <div key={i} className="bg-ink text-paper rounded-2xl rounded-tr-md px-4 py-2.5 max-w-[88%] ml-auto">
                <span className="text-[18px] leading-snug">{m.content}</span>
              </div>
            ),
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="border-t border-rule px-6 lg:px-12 py-3.5">
        <div className="max-w-[680px] mx-auto flex items-center gap-2.5">
          <MicButton langCode={target} onResult={(t) => setInput((prev) => (prev ? prev + " " + t : t))} />
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex-1 flex items-center gap-2.5 bg-paper border border-ink rounded-xl px-4 py-2.5"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Reply in ${targetLabel}…`}
              className="flex-1 bg-transparent outline-none text-[18px] text-ink"
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              className="shrink-0 bg-ink text-paper rounded-full px-4 py-1.5 text-[15px] font-medium hover:bg-ink-2 transition-colors disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </Page>
  );
}

function WordListBubble({ content, targetLang }: { content: string; targetLang: string }) {
  const lines = content.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const items: { target: string; source: string }[] = [];
  const intro: string[] = [];
  for (const line of lines) {
    const bullet = line.replace(/^[•\-*]\s*/, "");
    if (line !== bullet && bullet.includes("—")) {
      const [target, ...rest] = bullet.split("—");
      items.push({ target: target.trim(), source: rest.join("—").trim() });
    } else {
      intro.push(line);
    }
  }
  return (
    <div className="space-y-2.5">
      {intro.map((t, i) => (
        <p key={i} className="text-[16px] text-ink-2">{t}</p>
      ))}
      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2.5 bg-cream border border-rule rounded-xl px-3.5 py-2.5">
              <SpeakerButton text={it.target} langCode={targetLang} size="sm" />
              <span className="font-serif text-[22px] text-ink leading-tight">{it.target}</span>
              <span className="text-[16px] text-ink-3 ml-auto text-right">{it.source}</span>
            </div>
          ))}
        </div>
      )}
      {intro.length === 0 && items.length === 0 && <span className="text-ink-3">…</span>}
    </div>
  );
}

function WordTutorView({
  source,
  target,
  targetLabel,
  level,
  user,
  onBack,
}: {
  source: string;
  target: string;
  targetLabel: string;
  level: string;
  user?: { name?: string | null; email?: string | null; image?: string | null };
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || streaming) return;
    setInput("");
    const history: ChatMessage[] = [...messages, { role: "user", content: q }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setStreaming(true);
    try {
      const res = await fetch("/api/word-tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, target, level, messages: history }),
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
          if (last?.role === "assistant") updated[updated.length - 1] = { ...last, content: last.content + chunk };
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
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  const SUGGESTIONS = ["Food and drinks", "At the market", "Greetings", "How do I say “I'm tired”?"];

  return (
    <Page>
      <Masthead
        sessionInfo={{ pair: `🔤 Word tutor · ${targetLabel} · ${level}`, done: 0, total: 0 }}
        onChange={onBack}
        user={user}
      />
      <div className="flex-1 overflow-y-auto px-6 lg:px-12 py-7">
        <div className="max-w-[680px] mx-auto space-y-5">
          {messages.length === 0 ? (
            <div className="text-center py-6">
              <div className="text-[44px] mb-3">🔤</div>
              <h2 className="font-serif text-2xl text-ink mb-2">What do you want to learn?</h2>
              <p className="text-[16px] text-ink-3 mb-6">
                Ask for any topic or phrase — I&rsquo;ll teach you {targetLabel} words with translations.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => { void ask(s); }}
                    className="text-[15px] border border-rule bg-paper rounded-full px-3.5 py-1.5 text-ink-2 hover:border-ink-3 hover:text-ink transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) =>
              m.role === "assistant" ? (
                <div key={i} className="bg-paper border border-rule rounded-2xl rounded-tl-md px-4 py-3.5">
                  <WordListBubble content={m.content} targetLang={target} />
                </div>
              ) : (
                <div key={i} className="bg-ink text-paper rounded-2xl rounded-tr-md px-4 py-2.5 max-w-[88%] ml-auto">
                  <span className="text-[18px] leading-snug">{m.content}</span>
                </div>
              ),
            )
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="border-t border-rule px-6 lg:px-12 py-3.5">
        <div className="max-w-[680px] mx-auto flex items-center gap-2.5">
          <form
            onSubmit={(e) => { e.preventDefault(); void ask(input); }}
            className="flex-1 flex items-center gap-2.5 bg-paper border border-ink rounded-xl px-4 py-2.5"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. words for ordering coffee…"
              className="flex-1 bg-transparent outline-none text-[18px] text-ink"
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              className="shrink-0 bg-ink text-paper rounded-full px-4 py-1.5 text-[15px] font-medium hover:bg-ink-2 transition-colors disabled:opacity-40"
            >
              Ask
            </button>
          </form>
        </div>
      </div>
    </Page>
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

function StoryView({
  story,
  targetLabel,
  targetLang,
  level,
  user,
  onBack,
  onAnother,
}: {
  story: Story;
  targetLabel: string;
  targetLang: string;
  level: string;
  user?: { name?: string | null; email?: string | null; image?: string | null };
  onBack: () => void;
  onAnother: () => void;
}) {
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState(false);

  const total = story.questions.length;
  const correct = story.questions.reduce((n, q, i) => n + (answers[i] === q.answerIndex ? 1 : 0), 0);
  const allAnswered = story.questions.every((_, i) => answers[i] !== undefined);

  function revealAll() {
    const all: Record<number, boolean> = {};
    story.sentences.forEach((_, i) => { all[i] = true; });
    setRevealed(all);
  }

  return (
    <Page>
      <Masthead user={user} onChange={onBack} />
      <div className="flex-1 overflow-y-auto">
        {/* Title */}
        <div className="px-10 lg:px-14 pt-10 pb-7 border-b border-rule">
          <div className="eyebrow text-terracotta mb-3">📖 Story · {targetLabel} · {level}</div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-serif text-[40px] md:text-[48px] leading-[1.05] tracking-[-0.02em] text-ink">
              {story.title}
            </h1>
            <SpeakerButton text={story.title} langCode={targetLang} />
          </div>
          {story.titleSource && (
            <div className="text-[18px] text-ink-3 italic mt-1">{story.titleSource}</div>
          )}
        </div>

        {/* Sentences */}
        <div className="px-10 lg:px-14 py-8 border-b border-rule max-w-[760px]">
          <div className="space-y-5">
            {story.sentences.map((s, i) => (
              <div key={i} className="flex items-start gap-3">
                <SpeakerButton text={s.target} langCode={targetLang} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="font-serif text-[26px] text-ink leading-snug">{s.target}</div>
                  {revealed[i] ? (
                    <div className="text-[17px] text-ink-3 mt-1">{s.source}</div>
                  ) : (
                    <button
                      onClick={() => setRevealed((r) => ({ ...r, [i]: true }))}
                      className="text-[15px] text-ink-2 hover:text-ink underline underline-offset-2 mt-1"
                    >
                      Show translation
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={revealAll}
            className="mt-5 text-[15px] text-ink-2 hover:text-ink underline underline-offset-2"
          >
            Reveal all translations
          </button>
        </div>

        {/* Comprehension */}
        {total > 0 && (
          <div className="px-10 lg:px-14 py-8 max-w-[760px]">
            <div className="eyebrow text-terracotta mb-5">✎ Comprehension</div>
            <div className="space-y-6">
              {story.questions.map((q, qi) => (
                <div key={qi}>
                  <div className="text-[19px] text-ink font-medium mb-2.5">{qi + 1}. {q.question}</div>
                  <div className="grid gap-2">
                    {q.options.map((opt, oi) => {
                      const selected = answers[qi] === oi;
                      const isCorrect = q.answerIndex === oi;
                      let cls = "border-rule bg-paper hover:border-ink-3";
                      if (checked) {
                        if (isCorrect) cls = "border-good bg-good/10";
                        else if (selected) cls = "border-bad bg-bad/10";
                        else cls = "border-rule bg-paper opacity-60";
                      } else if (selected) {
                        cls = "border-ink bg-cream";
                      }
                      return (
                        <button
                          key={oi}
                          disabled={checked}
                          onClick={() => setAnswers((a) => ({ ...a, [qi]: oi }))}
                          className={`text-left text-[17px] px-4 py-2.5 rounded-xl border transition-colors ${cls}`}
                        >
                          {opt}
                          {checked && isCorrect && <span className="text-good font-medium"> ✓</span>}
                          {checked && selected && !isCorrect && <span className="text-bad font-medium"> ✗</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {!checked ? (
              <button
                onClick={() => setChecked(true)}
                disabled={!allAnswered}
                className={`${PRIMARY_BTN} mt-6`}
              >
                Check answers
              </button>
            ) : (
              <div className="mt-6 inline-flex items-center gap-3 bg-paper border border-rule rounded-2xl px-5 py-3.5">
                <span className="text-[28px]">{correct === total ? "🎉" : correct >= total / 2 ? "👏" : "📚"}</span>
                <span className="font-serif text-2xl text-ink">{correct} / {total} correct</span>
              </div>
            )}
          </div>
        )}
      </div>
      <Footer
        left={
          <button onClick={onAnother} className="text-ink-2 hover:text-ink underline underline-offset-2">
            📖 Read another story
          </button>
        }
        right={
          <button onClick={onBack} className="text-ink-2 hover:text-ink underline underline-offset-2">
            Back to dashboard
          </button>
        }
      />
    </Page>
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

function DailyGoalPill({
  phrasesToday,
  dailyGoal,
  onGoalChange,
}: {
  phrasesToday: number;
  dailyGoal: number;
  onGoalChange: (goal: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(String(dailyGoal));
  const inputRef = useRef<HTMLInputElement>(null);
  const pct = Math.min(100, Math.round((phrasesToday / dailyGoal) * 100));
  const done = phrasesToday >= dailyGoal;

  function save() {
    const n = parseInt(input, 10);
    if (n > 0) onGoalChange(n);
    setEditing(false);
  }

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  return (
    <div className="inline-flex items-center gap-3 bg-paper border border-rule rounded-full px-4 py-2">
      <span className="text-[20px]">{done ? "✅" : "🎯"}</span>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[15px] font-medium text-ink">
            {phrasesToday}
          </span>
          <span className="text-[14px] text-ink-3">/</span>
          {editing ? (
            <form onSubmit={(e) => { e.preventDefault(); save(); }} className="inline">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onBlur={save}
                className="w-10 text-[15px] font-medium text-ink bg-cream border border-rule rounded px-1 outline-none"
                type="number"
                min="1"
                max="200"
              />
            </form>
          ) : (
            <button
              onClick={() => { setInput(String(dailyGoal)); setEditing(true); }}
              className="text-[15px] text-ink-3 underline underline-offset-2 hover:text-ink transition-colors"
            >
              {dailyGoal}
            </button>
          )}
          <span className="text-[14px] text-ink-3">today</span>
        </div>
        <div className="w-24 h-1.5 bg-cream rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${done ? "bg-good" : "bg-terracotta"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
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
