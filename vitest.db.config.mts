import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests against the local Supabase stack: npm run test:db
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["tests/db/**/*.test.ts"], testTimeout: 20_000 },
});
