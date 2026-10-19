import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  let checks = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/verifications"))
      checks++;
  });
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  assert.match(await page.title(), /CharityCheck/);
  await page.getByLabel("Bank tujuan", { exact: true }).selectOption("BCA");
  await page.getByLabel("Nomor rekening").fill("123");
  await page.waitForTimeout(800);
  assert.equal(checks, 0, "incomplete input must not request verification");
  await page.getByLabel("Nomor rekening").fill("1234567890");
  await page
    .getByLabel("Jenis penerima", { exact: true })
    .selectOption("Yayasan");
  await page.getByLabel("Nama penerima").fill("Yayasan Contoh");
  await page
    .getByLabel("Website atau akun media sosial")
    .fill("https://example.org");
  await page
    .getByLabel("Tujuan penggalangan dana")
    .fill("Bantuan pendidikan anak");
  await page.waitForTimeout(250);
  assert.equal(checks, 0, "debounce must delay checks");
  await page
    .getByRole("heading", { name: "Informasi untuk langkah berikutnya" })
    .waitFor();
  assert.equal(checks, 1);
  const report = page.locator(".report-section");
  assert.match(await report.innerText(), /Tidak Dapat Diverifikasi/);
  assert.ok(!(await report.innerText()).includes("1234567890"));
  await page.getByRole("button", { name: "Lihat hasil pemeriksaan" }).click();
  await mkdir("playwright-results", { recursive: true });
  await page.screenshot({
    path: "playwright-results/desktop.png",
    fullPage: true,
  });
  // Stale response scenario uses test-only network delays, never a mock production provider.
  await page.route("**/api/verifications", async (route) => {
    const data = route.request().postDataJSON();
    const response = await route.fetch();
    if (data.accountNumber === "1111111111")
      await new Promise((resolve) => setTimeout(resolve, 1200));
    try {
      await route.fulfill({ response });
    } catch {
      /* Request may have been cancelled by AbortController. */
    }
  });
  await page.getByLabel("Nomor rekening").fill("1111111111");
  await page.waitForTimeout(750);
  await page.getByLabel("Nomor rekening").fill("2222222222");
  await page.waitForTimeout(2300);
  assert.match(await report.innerText(), /•••• 2222/);
  assert.ok(!(await report.innerText()).includes("•••• 1111"));
  await page.unroute("**/api/verifications");
  await page.route("**/api/verifications", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Layanan audit tidak tersedia." }),
    }),
  );
  await page.getByLabel("Nomor rekening").fill("3333333333");
  await page.getByRole("alert").waitFor();
  assert.equal(await page.locator(".report-section").count(), 0);
  assert.match(await page.getByRole("alert").innerText(), /tidak tersedia/);
  await page.unroute("**/api/verifications");
  await page
    .getByRole("button", { name: "Coba kembali", exact: true })
    .last()
    .click();
  await page.locator(".report-section").waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "playwright-results/mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
    "mobile layout must not overflow",
  );
  await page.getByRole("tab", { name: /QRIS/ }).click();
  await page
    .getByRole("heading", { name: "Pemeriksaan QRIS sedang disiapkan" })
    .waitFor();
  assert.equal(await page.locator(".report-section").count(), 0);
  assert.deepEqual(pageErrors, []);
  console.log(
    "PASS: desktop/mobile, validation, debounce, real API partial report, masking, stale responses, errors/retry, QRIS availability, no browser errors.",
  );
} finally {
  await browser.close();
}
