export const LANGUAGES = [
  { code: "cebuano", label: "Cebuano", flag: "🇵🇭" },
  { code: "english", label: "English", flag: "🇬🇧" },
  { code: "tagalog", label: "Tagalog", flag: "🇵🇭" },
  { code: "portuguese", label: "Portuguese", flag: "🇵🇹" },
  { code: "russian", label: "Russian", flag: "🇷🇺" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const LEVELS = [
  { code: "A1", label: "A1 — Beginner",          targetWords: 500,   minWords: 2, maxWords: 3  },
  { code: "A2", label: "A2 — Elementary",         targetWords: 1000,  minWords: 2, maxWords: 4  },
  { code: "B1", label: "B1 — Intermediate",       targetWords: 2000,  minWords: 4, maxWords: 6  },
  { code: "B2", label: "B2 — Upper Intermediate", targetWords: 4000,  minWords: 5, maxWords: 8  },
  { code: "C1", label: "C1 — Advanced",           targetWords: 8000,  minWords: 6, maxWords: 10 },
  { code: "C2", label: "C2 — Mastery",            targetWords: 16000, minWords: 7, maxWords: 12 },
] as const;

export type LevelCode = (typeof LEVELS)[number]["code"];

export function levelInfo(code: LevelCode) {
  return LEVELS.find((l) => l.code === code)!;
}

export function languageLabel(code: LanguageCode) {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
