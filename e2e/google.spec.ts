import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { AUTH_COOKIE } from "../src/lib/supabase/config";

try {
  process.loadEnvFile(".env.local"); // the local stack's URL and keys, for standing in for Google below
} catch {}

// Google itself is never reached: the local stack has a dummy client and the
// browser stops at accounts.google.com, which is enough to prove the wiring.

async function stopAtGoogle(page: Page) {
  await page.route(/accounts\.google\.com/, (r) => r.fulfill({ body: "google" }));
}

async function createTrip(page: Page, name: string, nickname?: string) {
  await page.goto("/");
  await page.getByLabel("ชื่อทริป").fill(name);
  if (nickname) await page.getByLabel("ชื่อเล่นของคุณ").fill(nickname);
  await page.getByRole("button", { name: "สร้างทริป" }).click();
  await page.waitForURL(/\/t\//);
}

test("a guest with no trips signs in with Google from settings", async ({ page }) => {
  await stopAtGoogle(page);
  await page.goto("/");
  await page.getByTestId("settings-link").click();
  await page.getByRole("button", { name: "เข้าสู่ระบบด้วย Google" }).click();
  await page.waitForURL(/accounts\.google\.com/);
  expect(page.url()).toContain("client_id=local-dummy");
});

test("a guest with trips links Google, and a taken account keeps the guest session", async ({ page }) => {
  await stopAtGoogle(page);
  await createTrip(page, "ทริปผูกบัญชี", "ต้น");

  await page.goto("/settings");
  await page.getByRole("button", { name: "เชื่อมกับ Google" }).click();
  await page.waitForURL(/accounts\.google\.com/);
  expect(page.url()).toContain("client_id=local-dummy");

  // Supabase sends people back like this when that Google account belongs to another user.
  await page.goto("/settings?error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("บัญชี Google นี้ใช้กับเครื่องอื่นอยู่แล้ว");
  await expect(page).toHaveURL(/\/settings$/);
  await page.goto("/");
  await expect(page.getByTestId("trip-link")).toContainText("ทริปผูกบัญชี");
});

test("signing in to an existing Google account brings this device's guest trips along", async ({ page, context }) => {
  await stopAtGoogle(page);
  await createTrip(page, "ทริปย้ายเข้าบัญชี", "ต้น");
  const origin = new URL(page.url()).origin;
  await page.goto("/settings?error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked");
  await page.getByRole("button", { name: "เข้าสู่ระบบด้วยบัญชีนั้น" }).click();
  await page.waitForURL(/accounts\.google\.com/);

  // Stand in for Google coming back: this browser is now signed in to an account that already existed.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const email = `e2e-${randomUUID()}@example.test`;
  const password = randomUUID();
  const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const jar: { name: string; value: string }[] = [];
  const sb = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: { name: AUTH_COOKIE },
    cookies: { getAll: () => [], setAll: (set) => void jar.push(...set) },
  });
  await sb.auth.signInWithPassword({ email, password });
  await context.clearCookies();
  await context.addCookies(jar.filter((c) => c.value).map((c) => ({ name: c.name, value: c.value, url: origin })));

  await page.goto("/settings");
  await expect(page.getByTestId("signed-in")).toContainText(email);
  await expect(page.getByRole("status").filter({ hasText: "ย้าย 1 ทริปจากเครื่องนี้เข้าบัญชีนี้แล้ว" })).toBeVisible();
  await page.goto("/");
  await page.getByTestId("trip-link").filter({ hasText: "ทริปย้ายเข้าบัญชี" }).click();
  await expect(page.getByText("ออนไลน์", { exact: true })).toBeVisible();
  await expect(page.getByText("เปิดทริปนี้ไม่ได้")).toHaveCount(0);
});

test("defaults from settings fill a new trip; clearing the device signs out", async ({ page }) => {
  await page.goto("/settings");
  const promptpay = page.getByLabel("เบอร์มือถือหรือเลขพร้อมเพย์");
  await promptpay.fill("12345");
  await expect(page.getByText("โปรดใส่เบอร์มือถือ 10 หลัก")).toBeVisible();
  await expect(page.getByRole("button", { name: "บันทึก" })).toBeDisabled();
  await promptpay.fill("081-234-5678");
  await page.getByLabel("ชื่อเล่น", { exact: true }).fill("มิ้นต์");
  await page.getByRole("button", { name: "บันทึก" }).click();
  await expect(page.getByRole("status").filter({ hasText: "บันทึกแล้ว" })).toBeVisible();

  await page.goto("/");
  await expect(page.getByLabel("ชื่อเล่นของคุณ")).toHaveValue("มิ้นต์");
  await createTrip(page, "ทริปค่าตั้งต้น");
  await page.getByRole("button", { name: /สมาชิก/ }).click();
  await expect(page.getByLabel("เบอร์มือถือหรือเลขพร้อมเพย์")).toHaveValue("0812345678");

  await page.getByTestId("settings-link").click(); // reachable from inside a trip too
  await page.waitForURL(/\/settings$/);
  await page.getByRole("button", { name: "ลบข้อมูลและออกจากระบบ" }).click();
  await page.getByRole("button", { name: "ยืนยัน ลบและออกจากระบบ" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.getByText("ยังไม่มีทริป")).toBeVisible();
});
