import { expect, test } from "@playwright/test";

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 375, height: 812 },
]) {
  test(`Docker login UI renders Ease AI on ${viewport.name}`, async ({ page }, testInfo) => {
    const consoleErrors: string[] = [];
    const failedResponses: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
    });

    await page.setViewportSize(viewport);
    await page.goto("/login", { waitUntil: "networkidle" });

    await expect(page).toHaveTitle("Ease AI — Smart Wheelchair Care Platform");
    await expect(page.getByText("Ease AI Smart Care Platform v1.0", { exact: true })).toBeVisible();
    await expect(page.getByText("WheelSense", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Username" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Password" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(consoleErrors).toEqual([]);
    expect(failedResponses).toEqual([]);

    await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-login.png`), fullPage: true });
  });
}
