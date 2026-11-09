import { expect, test, type Page } from "@playwright/test";

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
