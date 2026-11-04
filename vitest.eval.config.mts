import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Accuracy evals (slow, may call a paid API): npm run eval:match
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["eval/**/*.eval.ts"], testTimeout: 30 * 60_000 },
});
