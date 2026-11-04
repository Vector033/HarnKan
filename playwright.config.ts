import { defineConfig, devices } from "@playwright/test";

// E2E_PROD=1 runs against `next start` (after `npm run build`): the service
// worker only registers in production builds, so the offline reload test needs it.
const PROD = !!process.env.E2E_PROD;
const PORT = Number(process.env.E2E_PORT ?? (PROD ? 3006 : 3005));

// Needs the local Supabase stack running (npm run db:start).
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, ...devices["Pixel 7"], locale: "th-TH", timezoneId: "Asia/Bangkok" },
  webServer: {
    command: PROD ? `npx next start -p ${PORT}` : `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { SLIP_READER: "fake" },
  },
});
