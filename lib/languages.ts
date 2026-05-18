export const LANGUAGES = [
  { code: "cebuano", label: "Cebuano", flag: "🇵🇭" },
  { code: "english", label: "English", flag: "🇬🇧" },
  { code: "tagalog", label: "Tagalog", flag: "🇵🇭" },
  { code: "portuguese", label: "Portuguese", flag: "🇵🇹" },
  { code: "russian", label: "Russian", flag: "🇷🇺" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const LEVELS = [
  { code: "A1", label: "A1 — Beginner", targetWords: 500 },
  { code: "A2", label: "A2 — Elementary", targetWords: 1000 },
  { code: "B1", label: "B1 — Intermediate", targetWords: 2000 },
  { code: "B2", label: "B2 — Upper Intermediate", targetWords: 4000 },
  { code: "C1", label: "C1 — Advanced", targetWords: 8000 },
  { code: "C2", label: "C2 — Mastery", targetWords: 16000 },
] as const;

export type LevelCode = (typeof LEVELS)[number]["code"];

export function levelInfo(code: LevelCode) {
  return LEVELS.find((l) => l.code === code)!;
}

export function languageLabel(code: LanguageCode) {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
