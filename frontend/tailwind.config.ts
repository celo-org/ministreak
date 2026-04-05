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
        celo: {
          green: "#35D07F",
          gold: "#FBCC5C",
        },
        arcade: {
          bg: "#0d1117",
          card: "#111827",
          muted: "#4B5563",
          dim: "#374151",
          timer: "#1a1a2e",
        },
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
