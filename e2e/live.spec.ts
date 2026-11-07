import { expect, test } from "@playwright/test";

// Smoke test for a deployed site. Creates a small throwaway trip.
//   E2E_BASE_URL=https://harnkan-ten.vercel.app npx playwright test live
test.skip(!process.env.E2E_BASE_URL, "set E2E_BASE_URL to the deployed site");

test("live: two phones sync, settle, and a slip is read on the server", async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();

  await a.goto("/");
  await expect(a.getByText(/ยังไม่มีทริป|ทริปของฉัน/).first()).toBeVisible();
  await a.getByLabel("ชื่อทริป").fill("smoke test (ลบได้)");
  await a.getByLabel("ชื่อเล่นของคุณ").fill("เอ");
  await a.getByRole("button", { name: "สร้างทริป" }).click();
  await a.waitForURL(/\/t\//);
  await expect(a.getByText("ออนไลน์", { exact: true })).toBeVisible({ timeout: 45_000 });
  await a.getByRole("button", { name: /สมาชิก/ }).click();
  const link = await a.getByTestId("invite-link").innerText();

  await b.goto(link);
  await b.getByLabel("ชื่อเล่นของคุณ").fill("บี");
  await b.getByRole("button", { name: "เข้าทริป" }).click();
  await b.waitForURL(/\/t\//);
  await expect(b.getByText("ออนไลน์", { exact: true })).toBeVisible({ timeout: 45_000 });

  await a.reload();
  await expect(a.getByText("ออนไลน์", { exact: true })).toBeVisible({ timeout: 45_000 });
  await a.getByRole("button", { name: /เพิ่มรายจ่าย/ }).click();
  await a.getByLabel("รายการ").fill("ค่าข้าว");
  await a.getByLabel("จำนวนเงิน (บาท)").fill("7732");
  await a.getByTestId("save-expense").click();
  await expect(b.getByText("ค่าข้าว")).toBeVisible({ timeout: 45_000 });

  await b.getByRole("button", { name: /สรุปยอด/ }).click();
  await expect(b.getByTestId("my-balance")).toContainText("3,866");

  // A real (synthetic) slip through the deployed reader: no API key, so local OCR on the server.
  await b.getByTestId("upload-slip").click();
  await b.getByTestId("slip-input").setInputFiles("eval/fixtures/synthetic/kbank-01.jpg");
  const result = b.getByTestId("slip-result");
  await expect(result).toBeVisible({ timeout: 120_000 });
  await expect(result).toContainText("3,866.00");
  // Dated before the trip and paid to someone else, so it must not be ticked.
  await expect(result).toContainText("ยังบันทึกให้อัตโนมัติไม่ได้");
});
