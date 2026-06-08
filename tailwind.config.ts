import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        cream: {
          DEFAULT: "rgb(var(--cream) / <alpha-value>)",
          2: "rgb(var(--cream-2) / <alpha-value>)",
        },
        paper: "rgb(var(--paper) / <alpha-value>)",
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          2: "rgb(var(--ink-2) / <alpha-value>)",
          3: "rgb(var(--ink-3) / <alpha-value>)",
        },
        rule: {
          DEFAULT: "rgb(var(--rule) / <alpha-value>)",
          2: "rgb(var(--rule-2) / <alpha-value>)",
        },
        terracotta: {
          DEFAULT: "oklch(0.58 0.13 38)",
          soft: "rgb(var(--terracotta-soft) / <alpha-value>)",
        },
        good: {
          DEFAULT: "oklch(0.55 0.10 155)",
          soft: "rgb(var(--good-soft) / <alpha-value>)",
        },
        bad: {
          DEFAULT: "oklch(0.55 0.16 25)",
          soft: "rgb(var(--bad-soft) / <alpha-value>)",
        },
        amber: {
          DEFAULT: "oklch(0.70 0.14 75)",
          soft: "rgb(var(--amber-soft) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Times New Roman", "serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
