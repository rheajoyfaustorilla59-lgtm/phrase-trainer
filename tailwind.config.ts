import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        cream: {
          DEFAULT: "#F4EFE6",
          2: "#EDE7DB",
        },
        paper: "#FBF8F2",
        ink: {
          DEFAULT: "#1A1714",
          2: "#4A443D",
          3: "#8A8278",
        },
        rule: {
          DEFAULT: "#D9D2C3",
          2: "#E6DFCE",
        },
        terracotta: {
          DEFAULT: "oklch(0.58 0.13 38)",
          soft: "oklch(0.92 0.04 38)",
        },
        good: {
          DEFAULT: "oklch(0.55 0.10 155)",
          soft: "oklch(0.93 0.04 155)",
        },
        bad: {
          DEFAULT: "oklch(0.55 0.16 25)",
          soft: "oklch(0.93 0.05 25)",
        },
        amber: {
          DEFAULT: "oklch(0.70 0.14 75)",
          soft: "oklch(0.94 0.05 75)",
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
