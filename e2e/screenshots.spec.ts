// Regenerates the README screenshots from a demo trip with made-up people:
//   SCREENSHOTS=1 npx playwright test screenshots
import { expect, test, type Browser, type Page } from "@playwright/test";

test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to regenerate docs/screenshots");

// The dev server's overlay can sit over the bottom tab bar; screenshots should not show it.
async function phone(browser: Browser) {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  await context.addInitScript(() =>
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.appendChild(s);
    }),
  );
  return context.newPage();
}

const shot = (page: Page, name: string) => page.screenshot({ path: `docs/screenshots/${name}.png` });

async function addExpense(page: Page, title: string, amount: string, payer?: string, opts?: { exact?: Record<string, string>; skip?: string[] }) {
  await page.getByRole("button", { name: /เพิ่มรายจ่าย/ }).click();
  await page.getByLabel("รายการ").fill(title);
  await page.getByLabel("จำนวนเงิน (บาท)").fill(amount);
  if (payer) await page.getByLabel("ผู้จ่าย").selectOption({ label: payer });
  for (const name of opts?.skip ?? []) await page.getByRole("checkbox", { name }).uncheck();
  if (opts?.exact) {
    await page.getByRole("radio", { name: "ระบุยอดเอง" }).click();
    for (const [name, v] of Object.entries(opts.exact)) await page.getByLabel(`ยอดของ ${name}`).fill(v);
  }
  await page.getByTestId("save-expense").click();
  await expect(page.getByText(title)).toBeVisible();
}

test("README screenshots", async ({ browser }) => {
  test.setTimeout(240_000);
  const mint = await phone(browser);
  await mint.goto("/");
  await expect(mint.getByText("ยังไม่มีทริป")).toBeVisible(); // hydrated
  await shot(mint, "01-home");
  await mint.getByLabel("ชื่อทริป").fill("เชียงดาว ปีใหม่");
  await mint.getByLabel("ชื่อเล่นของคุณ").fill("มิ้นต์");
  await mint.getByRole("button", { name: "สร้างทริป" }).click();
  await mint.waitForURL(/\/t\//);

  await mint.getByRole("button", { name: /สมาชิก/ }).click();
  await mint.getByLabel("เบอร์พร้อมเพย์").fill("0812345678");
  await mint.getByLabel("ชื่อที่ขึ้นในสลิป (ไม่บังคับ)").fill("มินตรา ส.");
  await mint.getByRole("button", { name: "บันทึก" }).click();
  for (const n of ["ต้น", "แบม", "โอ๊ต"]) {
    await mint.getByLabel("ชื่อเพื่อนที่จะเพิ่ม").fill(n);
    await mint.getByRole("button", { name: "เพิ่ม", exact: true }).click();
    await expect(mint.getByText(n, { exact: true })).toBeVisible();
  }
  const link = await mint.getByTestId("invite-link").innerText();

  // ต้น joins on his own phone by claiming the name Mint already added.
  const ton = await phone(browser);
  await ton.goto(link);
  await expect(ton.getByRole("button", { name: "เข้าทริป" })).toBeVisible();
  await expect(ton.getByText("กำลังเปิดลิงก์")).toHaveCount(0);
  await shot(ton, "02-join");
  await ton.screenshot({ path: ".impeccable/review/mobile-join.png" });
  await ton.getByRole("button", { name: "ฉันคือ ต้น" }).click();
  await ton.getByRole("button", { name: "ขอเข้าทริปด้วยชื่อนี้" }).click();
  // Claiming a name the owner added waits for the owner's approval.
  await mint.getByTestId("approve-claim").click();
  await ton.waitForURL(/\/t\//, { timeout: 20_000 });
  await ton.getByRole("button", { name: /สมาชิก/ }).click();
  await ton.getByLabel("เบอร์พร้อมเพย์").fill("0898765432");
  await ton.getByRole("button", { name: "บันทึก" }).click();
  await ton.getByRole("button", { name: /รายจ่าย/ }).click();

  await mint.getByRole("button", { name: /รายจ่าย/ }).click();
  await addExpense(mint, "ที่พักบ้านดิน 2 คืน", "3,600");
  await addExpense(mint, "หมูกระทะ", "1,240", "ต้น");
  await addExpense(mint, "ค่ารถสองแถว", "480", "แบม", { skip: ["โอ๊ต"] });
  await addExpense(mint, "กาแฟดอยหลวง", "315", "โอ๊ต", { exact: { มิ้นต์: "65", ต้น: "90", แบม: "80", โอ๊ต: "80" } });
  await expect(ton.getByText("กาแฟดอยหลวง")).toBeVisible();
  await shot(ton, "03-expenses");

  await ton.getByRole("button", { name: /เพิ่มรายจ่าย/ }).click();
  await ton.getByLabel("รายการ").fill("ข้าวซอย");
  await ton.getByLabel("จำนวนเงิน (บาท)").fill("250");
  await ton.getByRole("radio", { name: "ตามสัดส่วน" }).click();
  await ton.getByLabel("สัดส่วนของ ต้น").fill("2");
  await expect(ton.getByRole("radio", { name: "ตามสัดส่วน" })).toHaveAttribute("aria-checked", "true");
  await ton.mouse.move(0, 0); // no hover state in the capture
  await ton.waitForTimeout(400);
  await shot(ton, "04-add-expense");
  await ton.getByRole("button", { name: "ปิด" }).click();

  await ton.getByRole("button", { name: /สรุปยอด/ }).click();
  await shot(ton, "05-settle");
  const qr = ton.getByRole("button", { name: "QR พร้อมเพย์" }).first();
  if (await qr.count()) {
    await qr.click();
    await expect(ton.getByTestId("promptpay-qr").locator("svg")).toBeVisible();
    await shot(ton, "06-promptpay-qr");
  }
});
