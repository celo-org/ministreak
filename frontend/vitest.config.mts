import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "dist"],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      include: ["lib/**", "components/**", "app/api/**"],
      exclude: ["**/*.test.*", "**/*.d.ts", "lib/wagmi.ts", "lib/graphql.ts"],
    },
  },
});
