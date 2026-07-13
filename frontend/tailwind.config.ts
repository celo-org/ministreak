import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: "#FAF6EC",
          tint: "#F3EDD8",
          deep: "#EFE7CC",
        },
        surface: "#FFFFFF",
        ink: {
          DEFAULT: "#1B1A17",
          mute: "#6B6452",
          faint: "#A8A192",
        },
        rule: "#E5DEC8",
        forest: {
          DEFAULT: "#1B6B3F",
          deep: "#0F4A2A",
          tint: "#DEEDE2",
        },
        gold: {
          DEFAULT: "#B8842B",
          bright: "#E5B445",
          tint: "#FBEFC9",
        },
        coral: {
          DEFAULT: "#C44536",
          tint: "#F8DDD7",
        },
        // Candy accents — small icon-chip / stat-accent use only (forest stays the hero).
        amber: { DEFAULT: "#E39A2E", tint: "#F7E7C8" },
        sky: { DEFAULT: "#3E93CE", tint: "#DCEBF6" },
        berry: { DEFAULT: "#CF5C86", tint: "#F6DEE8" },
      },
      fontFamily: {
        display: ["var(--font-fredoka)", "ui-rounded", "SF Pro Rounded", "system-ui", "sans-serif"],
        sans: ["var(--font-dm-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        eyebrow: "0.18em",
        cap: "0.06em",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(27,26,23,0.04), 0 8px 24px rgba(27,26,23,0.06)",
        card: "0 1px 0 rgba(27,26,23,0.03), 0 6px 16px -8px rgba(27,26,23,0.10)",
        ring: "inset 0 0 0 1px #E5DEC8",
      },
    },
  },
  plugins: [],
};

export default config;
