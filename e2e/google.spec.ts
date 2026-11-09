import { expect, test, type Page } from "@playwright/test";

// Google itself is never reached: the local stack has a dummy client and the
// browser stops at accounts.google.com, which is enough to prove the wiring.

async function stopAtGoogle(page: Page) {
  await page.route(/accounts\.google\.com/, (r) => r.fulfill({ body: "google" }));
}

test("a guest with no trips signs in with Google", async ({ page }) => {
  await stopAtGoogle(page);
  await page.goto("/");
  await page.getByRole("button", { name: "เข้าสู่ระบบด้วย Google" }).click();
  await page.waitForURL(/accounts\.google\.com/);
  expect(page.url()).toContain("client_id=local-dummy");
});

test("a guest with trips links Google, and a taken account keeps the guest session", async ({ page }) => {
  await stopAtGoogle(page);
  await page.goto("/");
  await page.getByLabel("ชื่อทริป").fill("ทริปผูกบัญชี");
  await page.getByLabel("ชื่อเล่นของคุณ").fill("ต้น");
  await page.getByRole("button", { name: "สร้างทริป" }).click();
  await page.waitForURL(/\/t\//);

  await page.goto("/");
  await page.getByRole("button", { name: "เชื่อมกับ Google" }).click();
  await page.waitForURL(/accounts\.google\.com/);
  expect(page.url()).toContain("client_id=local-dummy");

  // Supabase sends people back like this when that Google account belongs to another user.
  await page.goto("/?error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked");
  await expect(page.getByTestId("account").getByRole("alert")).toContainText("บัญชี Google นี้ใช้กับเครื่องอื่นอยู่แล้ว");
  await expect(page.getByTestId("trip-link")).toContainText("ทริปผูกบัญชี");
  await expect(page).toHaveURL(/\/$/);
});
