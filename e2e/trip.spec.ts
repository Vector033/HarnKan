import { expect, test, type Browser, type Page } from "@playwright/test";

// Two (or three) separate browser contexts play friends on separate phones.

async function friend(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  return { context, page };
}

async function createTrip(page: Page, name: string, nickname: string) {
  await page.goto("/");
  await page.getByLabel("ชื่อทริป").fill(name);
  await page.getByLabel("ชื่อเล่นของคุณ").fill(nickname);
  await page.getByRole("button", { name: "สร้างทริป" }).click();
  await page.waitForURL(/\/t\//);
  await expect(page.getByText("สด")).toBeVisible();
  await page.getByRole("button", { name: /สมาชิก/ }).click();
  const link = await page.getByTestId("invite-link").innerText();
  await page.getByRole("button", { name: /รายจ่าย/ }).click();
  return link;
}

async function join(page: Page, link: string, nickname: string) {
  await page.goto(link);
  await page.getByLabel("ชื่อเล่นของคุณ").fill(nickname);
  await page.getByRole("button", { name: "เข้าทริป" }).click();
  await page.waitForURL(/\/t\//);
  await expect(page.getByText("สด")).toBeVisible();
}

async function addExpense(page: Page, title: string, amount: string) {
  await page.getByRole("button", { name: /เพิ่มรายจ่าย/ }).click();
  await page.getByLabel("รายการ").fill(title);
  await page.getByLabel("จำนวนเงิน (บาท)").fill(amount);
  await page.getByTestId("save-expense").click();
}

test("friends see each other's expenses live and get a minimal settlement", async ({ browser }) => {
  const a = await friend(browser);
  const b = await friend(browser);
  const link = await createTrip(a.page, "หัวหิน", "เอ");
  await join(b.page, link, "บี");

  // A adds an expense; B sees it without reloading. B was not in the trip
  // when A's form opened, so A reloads first to include B in the split.
  await a.page.reload();
  await expect(a.page.getByText("สด")).toBeVisible();
  await addExpense(a.page, "ค่าที่พัก", "1,000");
  await expect(b.page.getByText("ค่าที่พัก")).toBeVisible();
  await expect(b.page.getByText("1,000").first()).toBeVisible();

  await b.page.getByRole("button", { name: /สรุปยอด/ }).click();
  await expect(b.page.getByTestId("my-balance")).toContainText("คุณต้องโอนรวม");
  await expect(b.page.getByTestId("my-balance")).toContainText("500");
  await expect(b.page.getByTestId("transfer")).toHaveCount(1);

  // B says they paid; A confirms; both end square.
  await b.page.getByRole("button", { name: "โอนแล้ว (ไม่มีสลิป)" }).click();
  await expect(b.page.getByText(/รอ เอ ยืนยัน/)).toBeVisible();
  await a.page.getByRole("button", { name: /สรุปยอด/ }).click();
  await a.page.getByTestId("confirm-payment").click();
  await expect(a.page.getByText("ทุกคนเคลียร์กันครบแล้ว")).toBeVisible();
  await expect(b.page.getByText("ทุกคนเคลียร์กันครบแล้ว")).toBeVisible();
});

test("two people editing the same expense get a conflict instead of a silent overwrite", async ({ browser }) => {
  const a = await friend(browser);
  const b = await friend(browser);
  const link = await createTrip(a.page, "เชียงใหม่", "เอ");
  await join(b.page, link, "บี");
  await addExpense(a.page, "หมูกระทะ", "600");
  await expect(b.page.getByText("หมูกระทะ")).toBeVisible();

  // Both open the same expense.
  await a.page.getByTestId("expense-row").first().click();
  await b.page.getByTestId("expense-row").first().click();

  await a.page.getByLabel("จำนวนเงิน (บาท)").fill("650");
  await a.page.getByTestId("save-expense").click();

  // B is told while still editing, then saves anyway and has to choose.
  await expect(b.page.getByTestId("changed-underneath")).toBeVisible();
  await b.page.getByLabel("จำนวนเงิน (บาท)").fill("700");
  await b.page.getByTestId("save-expense").click();
  await expect(b.page.getByText("มีคนแก้รายการเดียวกัน")).toBeVisible();
  await b.page.getByTestId("keep-mine").click();

  await expect(a.page.getByText("700").first()).toBeVisible();
  await expect(b.page.getByText("700").first()).toBeVisible();
});

test("expenses added offline sync when the connection returns", async ({ browser }) => {
  const a = await friend(browser);
  const b = await friend(browser);
  const link = await createTrip(a.page, "เกาะล้าน", "เอ");
  await join(b.page, link, "บี");

  await b.context.setOffline(true);
  await expect(b.page.getByText("ออฟไลน์", { exact: false }).first()).toBeVisible();
  await addExpense(b.page, "ค่าเรือ", "300");
  await expect(b.page.getByText("ค่าเรือ")).toBeVisible();
  await expect(b.page.getByText("รอซิงก์")).toBeVisible();
  await expect(a.page.getByText("ค่าเรือ")).toHaveCount(0);

  await b.context.setOffline(false);
  await expect(a.page.getByText("ค่าเรือ")).toBeVisible({ timeout: 30_000 });
  await expect(b.page.getByText("รอซิงก์")).toHaveCount(0);
});

test("a matching slip ticks the payment and the receiver confirms", async ({ browser }) => {
  const a = await friend(browser);
  const b = await friend(browser);
  const link = await createTrip(a.page, "ภูเก็ต", "เอ");

  // A sets up PromptPay so B gets a QR and the slip can be matched by number.
  await a.page.getByRole("button", { name: /สมาชิก/ }).click();
  await a.page.getByLabel("เบอร์พร้อมเพย์").fill("0812345678");
  await a.page.getByLabel("ชื่อที่ขึ้นในสลิป (ไม่บังคับ)").fill("สมหญิง ด.");
  await a.page.getByRole("button", { name: "บันทึก" }).click();
  await a.page.getByRole("button", { name: /รายจ่าย/ }).click();

  await join(b.page, link, "บี");
  await a.page.reload();
  await expect(a.page.getByText("สด")).toBeVisible();
  await addExpense(a.page, "ดำน้ำ", "2,400");

  await b.page.getByRole("button", { name: /สรุปยอด/ }).click();
  await b.page.getByRole("button", { name: "QR พร้อมเพย์" }).click();
  const payload = await b.page.getByTestId("promptpay-qr").getAttribute("data-payload");
  expect(payload).toContain("54071200.00"); // tag 54, 7 chars, 1200.00 baht
  await b.page.getByRole("button", { name: "โอนแล้ว แนบสลิป" }).click();

  // With SLIP_READER=fake the file's bytes are the model's answer.
  const now = new Date();
  const thai = `${now.getDate()} ${["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][now.getMonth()]} ${(now.getFullYear() + 543) % 100} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const answer = {
    is_transfer_slip: true,
    amount_text: "1,200.00",
    amount: 1200,
    datetime_text: thai,
    datetime_iso: null,
    sender_name: "นาย บี บี.",
    sender_bank: "KBANK",
    sender_account: "xxx-x-x1111-x",
    receiver_name: "น.ส. สมหญิง ด.",
    receiver_bank: "SCB",
    receiver_account: "xxx-xxx-5678",
    reference: `E2E${Date.now()}`,
    memo: null,
    confidence: { amount: 0.98, datetime: 0.95, receiver: 0.95, sender: 0.9 },
  };
  await b.page.getByTestId("slip-input").setInputFiles({
    name: "slip.png",
    mimeType: "image/png",
    buffer: Buffer.from(JSON.stringify(answer)),
  });
  await expect(b.page.getByTestId("slip-result")).toContainText("ติ๊กว่าจ่ายแล้ว");
  await b.page.getByRole("button", { name: "เสร็จ" }).click();

  await a.page.getByRole("button", { name: /สรุปยอด/ }).click();
  await expect(a.page.getByTestId("claim")).toContainText("AI อ่านจากสลิป");
  await a.page.getByTestId("confirm-payment").click();
  await expect(b.page.getByText("ทุกคนเคลียร์กันครบแล้ว")).toBeVisible();
});
