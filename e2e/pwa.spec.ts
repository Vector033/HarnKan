import { expect, test } from "@playwright/test";

// Needs a production build: npm run build && E2E_PROD=1 npx playwright test pwa
test.skip(!process.env.E2E_PROD, "service worker only runs in production builds");

test("a trip opened once still opens and takes expenses after a reload with no connection", async ({ page, context }) => {
  await page.goto("/");
  await page.getByLabel("ชื่อทริป").fill("ดอยอินทนนท์");
  await page.getByLabel("ชื่อเล่นของคุณ").fill("เอ");
  await page.getByRole("button", { name: "สร้างทริป" }).click();
  await page.waitForURL(/\/t\//);
  await expect(page.getByText("สด")).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // let the worker see this page once so it is cached
  await expect(page.getByText("สด")).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "ดอยอินทนนท์" })).toBeVisible();
  await page.getByRole("button", { name: /เพิ่มรายจ่าย/ }).click();
  await page.getByLabel("รายการ").fill("ค่าอุทยาน");
  await page.getByLabel("จำนวนเงิน (บาท)").fill("100");
  await page.getByTestId("save-expense").click();
  await expect(page.getByText("รอซิงก์")).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText("รอซิงก์")).toHaveCount(0, { timeout: 30_000 });
});
