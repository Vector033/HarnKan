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
  await expect(page.getByText("ออนไลน์", { exact: true })).toBeVisible();
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
  await expect(page.getByText("ออนไลน์", { exact: true })).toBeVisible();
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
  await expect(a.page.getByText("ออนไลน์", { exact: true })).toBeVisible();
  await addExpense(a.page, "ค่าที่พัก", "1,000");
  await expect(b.page.getByText("ค่าที่พัก")).toBeVisible();
  await expect(b.page.getByText("1,000").first()).toBeVisible();

  await b.page.getByRole("button", { name: /สรุปยอด/ }).click();
  await expect(b.page.getByTestId("my-balance")).toContainText("คุณต้องโอนรวม");
  await expect(b.page.getByTestId("my-balance")).toContainText("500");
  await expect(b.page.getByTestId("transfer")).toHaveCount(1);
  const line = await b.page.getByRole("link", { name: "ส่งสรุปเข้า LINE" }).getAttribute("href");
  expect(decodeURIComponent(line!.split("text=")[1])).toContain("• บี โอนให้ เอ 500 บาท");
  // B says they paid; A confirms; both end square.
  await b.page.getByRole("button", { name: "โอนแล้ว (ไม่มีสลิป)" }).click();
  await expect(b.page.getByText(/รอ เอ ยืนยัน/)).toBeVisible();
  await a.page.getByRole("button", { name: /สรุปยอด/ }).click();
  await a.page.getByTestId("confirm-payment").click();
  await expect(a.page.getByText("ทุกคนโอนกันครบแล้ว")).toBeVisible();
  await expect(b.page.getByText("ทุกคนโอนกันครบแล้ว")).toBeVisible();
});

test("an open sheet and its draft survive resizing across the wide layout", async ({ browser }) => {
  const { page } = await friend(browser);
  await createTrip(page, "ระยอง", "เอ");
  const narrow = page.viewportSize()!;
  const title = page.getByLabel("รายการ");

  await page.getByRole("button", { name: /เพิ่มรายจ่าย/ }).click();
  await title.fill("ค่าทางด่วน");
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(title).toHaveValue("ค่าทางด่วน");
  await page.setViewportSize(narrow);
  await expect(title).toHaveValue("ค่าทางด่วน");
  await page.getByRole("button", { name: "ปิด" }).click();
  await page.getByRole("button", { name: "ทิ้ง", exact: true }).click();

  // Opened from the expense column on a wide screen, then the screen narrows onto the settle tab,
  // which hides that column: the sheet must still show and take input.
  await page.getByRole("button", { name: /สรุปยอด/ }).click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: /เพิ่มรายจ่าย/ }).click();
  await title.fill("ค่าที่จอด");
  await page.setViewportSize(narrow);
  await expect(title).toBeVisible();
  await expect(title).toHaveValue("ค่าที่จอด");
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
  await expect(b.page.getByText("มีคนแก้ไขรายการเดียวกัน")).toBeVisible();
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
  await expect(b.page.getByText("รอส่ง", { exact: true })).toBeVisible();
  await expect(a.page.getByText("ค่าเรือ")).toHaveCount(0);

  await b.context.setOffline(false);
  await expect(a.page.getByText("ค่าเรือ")).toBeVisible({ timeout: 30_000 });
  await expect(b.page.getByText("รอส่ง", { exact: true })).toHaveCount(0);
});

test("my own queued expense landing is not reported as someone else's edit", async ({ browser }) => {
  const a = await friend(browser);
  await createTrip(a.page, "บางแสน", "เอ");
  await a.context.setOffline(true);
  await addExpense(a.page, "ค่าเรือ", "300");
  await a.page.getByTestId("expense-row").first().click(); // opened while still queued

  await a.context.setOffline(false);
  await expect(a.page.getByText("รอส่ง", { exact: true })).toHaveCount(0, { timeout: 30_000 });
  await expect(a.page.getByTestId("changed-underneath")).toHaveCount(0);
  await a.page.getByLabel("จำนวนเงิน (บาท)").fill("350");
  await a.page.getByTestId("save-expense").click();
  await expect(a.page.getByText("350", { exact: false }).first()).toBeVisible();
  await expect(a.page.getByText("มีคนแก้ไขรายการเดียวกัน")).toHaveCount(0);
});

test("a matching slip ticks the payment and the receiver confirms", async ({ browser }) => {
  test.skip(!!process.env.E2E_PROD, "the fake slip reader is refused in production builds");
  const a = await friend(browser);
  const b = await friend(browser);
  const link = await createTrip(a.page, "ภูเก็ต", "เอ");

  // A sets up PromptPay so B gets a QR and the slip can be matched by number.
  await a.page.getByRole("button", { name: /สมาชิก/ }).click();
  await a.page.getByLabel("เบอร์มือถือหรือเลขพร้อมเพย์").fill("0812345678");
  await a.page.getByLabel("ชื่อที่ขึ้นในสลิป (ไม่บังคับ)").fill("สมหญิง ด.");
  await a.page.getByRole("button", { name: "บันทึก" }).click();
  await a.page.getByRole("button", { name: /รายจ่าย/ }).click();

  await join(b.page, link, "บี");
  await a.page.reload();
  await expect(a.page.getByText("ออนไลน์", { exact: true })).toBeVisible();
  await addExpense(a.page, "ดำน้ำ", "2,400");

  await b.page.getByRole("button", { name: /สรุปยอด/ }).click();
  await b.page.getByRole("button", { name: "QR พร้อมเพย์" }).click();
  const payload = await b.page.getByTestId("promptpay-qr").getAttribute("data-payload");
  expect(payload).toContain("54071200.00"); // tag 54, 7 chars, 1200.00 baht
  await b.page.getByRole("button", { name: "โอนแล้ว แนบสลิป" }).click();

  // With SLIP_READER=fake the file's bytes are the model's answer.
  const now = new Date();
  const thai = `${now.getDate()} ${["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][now.getMonth()]} ${(now.getFullYear() + 543) % 100} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const party = (name: string, bank: string, account: string) => ({
    name,
    name_confidence: 0.95,
    bank,
    bank_confidence: 0.95,
    account_masked: account,
    account_confidence: 0.95,
  });
  const answer = {
    is_transfer_slip: true,
    amount: 1200,
    amount_confidence: 0.98,
    date_text: thai,
    datetime_iso: null,
    datetime_confidence: 0.95,
    sender: party("นาย บี บี.", "KBANK", "xxx-x-x1111-x"),
    receiver: party("น.ส. สมหญิง ด.", "SCB", "xxx-xxx-5678"),
    reference: `E2E${Date.now()}`,
    reference_confidence: 0.95,
    memo: null,
    memo_confidence: 0,
  };
  await b.page.getByTestId("slip-input").setInputFiles({
    name: "slip.png",
    mimeType: "image/png",
    buffer: Buffer.from(JSON.stringify(answer)),
  });
  await expect(b.page.getByTestId("slip-result")).toContainText("บันทึกว่าโอนแล้ว");
  await b.page.getByRole("button", { name: "เสร็จ" }).click();

  await a.page.getByRole("button", { name: /สรุปยอด/ }).click();
  await expect(a.page.getByTestId("claim")).toContainText("AI อ่านจากสลิป");
  await a.page.getByTestId("confirm-payment").click();
  await expect(b.page.getByText("ทุกคนโอนกันครบแล้ว")).toBeVisible();
});
