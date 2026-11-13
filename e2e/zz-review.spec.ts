import { expect, test, type Browser } from "@playwright/test";
// Review captures for the finish review (not part of the suite).
test.skip(!process.env.REVIEW, "REVIEW=1");
async function phone(browser: Browser, viewport: { width: number; height: number }) {
  const c = await browser.newContext({ viewport, deviceScaleFactor: 2, reducedMotion: "reduce" });
  await c.addInitScript(() => document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = "nextjs-portal{display:none!important}"; document.head.appendChild(s); }));
  return c.newPage();
}
test("review captures", async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await phone(browser, { width: 390, height: 844 });
  const d = await phone(browser, { width: 1440, height: 900 });
  await d.goto("/");
  await expect(d.getByText("ยังไม่มีทริป")).toBeVisible();
  await d.waitForTimeout(1200);
  await d.screenshot({ path: ".impeccable/review/desktop-home.png" });
  await a.goto("/");
  await expect(a.getByText("ยังไม่มีทริป")).toBeVisible();
  await a.getByLabel("ชื่อทริป").fill("เชียงดาว ปีใหม่");
  await a.getByLabel("ชื่อเล่นของคุณ").fill("มิ้นต์");
  await a.getByRole("button", { name: "สร้างทริป" }).click();
  await a.waitForURL(/\/t\//);
  await a.getByRole("button", { name: /สมาชิก/ }).click();
  await a.getByLabel("เบอร์มือถือหรือเลขพร้อมเพย์").fill("0812345678");
  await a.getByRole("button", { name: "บันทึก" }).click();
  const link = await a.getByTestId("invite-link").innerText();
  const b = await phone(browser, { width: 390, height: 844 });
  await d.goto(link);
  await expect(d.getByRole("button", { name: "เข้าทริป" })).toBeVisible();
  await d.screenshot({ path: ".impeccable/review/desktop-join.png" });
  await b.goto(link);
  await b.getByLabel("ชื่อเล่นของคุณ").fill("ต้น");
  await b.getByRole("button", { name: "เข้าทริป" }).click();
  await b.waitForURL(/\/t\//);
  await a.reload();
  await expect(a.getByText("2 คน")).toBeVisible(); // the joined friend has loaded, not just the cached trip
  await a.getByRole("button", { name: /เพิ่มรายจ่าย/ }).click();
  await a.getByLabel("รายการ").fill("ที่พักบ้านดิน 2 คืน");
  await a.getByLabel("จำนวนเงิน (บาท)").fill("3600");
  await a.getByTestId("save-expense").click();
  await expect(b.getByText("ที่พักบ้านดิน 2 คืน")).toBeVisible();
  await b.screenshot({ path: ".impeccable/review/mobile.png", fullPage: true });
  await b.getByRole("button", { name: /สรุปยอด/ }).click();
  await b.screenshot({ path: ".impeccable/review/mobile-settle.png", fullPage: true });
  await b.getByRole("button", { name: "โอนแล้ว (ไม่มีสลิป)" }).click();
  await a.getByRole("button", { name: /สรุปยอด/ }).click();
  await expect(a.getByTestId("claim")).toBeVisible();
  await a.screenshot({ path: ".impeccable/review/mobile-confirm.png", fullPage: true });
  // History: one cancelled claim and one confirmed payment.
  await b.getByRole("button", { name: "ยกเลิกการแจ้ง" }).click();
  await expect(a.getByTestId("claim")).toHaveCount(0);
  await b.getByRole("button", { name: "โอนแล้ว (ไม่มีสลิป)" }).click();
  await a.getByTestId("confirm-payment").click();
  await a.waitForTimeout(250); // the stamp has landed, the stub has not torn yet
  await a.screenshot({ path: ".impeccable/review/mobile-stamp.png" });
  await expect(a.getByText("ประวัติการโอน")).toBeVisible();
  await expect(a.getByTestId("claim")).toHaveCount(0); // stamped, torn and filed into history
  await expect(a.getByText("ได้รับเงินแล้ว", { exact: true })).toBeVisible();
  await a.screenshot({ path: ".impeccable/review/mobile-history.png", fullPage: true });
  await a.getByRole("button", { name: /สมาชิก/ }).click();
  await a.screenshot({ path: ".impeccable/review/mobile-members.png", fullPage: true });
  await b.getByRole("button", { name: /รายจ่าย/ }).click();
  await b.getByTestId("expense-row").first().click();
  await b.screenshot({ path: ".impeccable/review/mobile-sheet.png" });
  await a.setViewportSize({ width: 1440, height: 900 });
  await a.getByRole("button", { name: /รายจ่าย/ }).click();
  await expect(a.getByRole("heading", { name: "เชียงดาว ปีใหม่" })).toBeVisible();
  await a.screenshot({ path: ".impeccable/review/desktop.png", fullPage: true });
  await a.getByRole("button", { name: /สมาชิก/ }).click();
  await a.screenshot({ path: ".impeccable/review/desktop-members.png" });
  await a.setViewportSize({ width: 1024, height: 768 });
  await a.getByRole("button", { name: /รายจ่าย/ }).click();
  await a.screenshot({ path: ".impeccable/review/desktop-1024.png" });
  await a.setViewportSize({ width: 390, height: 844 });
  await a.goto("/");
  await expect(a.getByTestId("trip-link").first()).toBeVisible();
  await a.screenshot({ path: ".impeccable/review/mobile-home-trips.png" });
  await a.goto("/settings");
  await expect(a.getByRole("button", { name: "เชื่อมกับ Google" })).toBeVisible();
  await a.screenshot({ path: ".impeccable/review/mobile-settings.png", fullPage: true });
  await a.setViewportSize({ width: 1440, height: 900 });
  await a.screenshot({ path: ".impeccable/review/desktop-settings.png", fullPage: true });
});
