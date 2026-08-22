import { expect, test } from "@playwright/test";

const screenshots = "../.project/evidence/phase-2c";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Username" }).fill("marcus.l");
  await page.getByRole("textbox", { name: "Password" }).fill("marcus.l");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/supervisor(?:\?|$)/);
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 375, height: 812 },
]) {
  test(`validates the Supervisor workbench on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const consoleErrors: string[] = [];
    const failedResponses: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
    });

    await login(page);
    await expect(page.getByRole("main")).toBeVisible();
    await page.waitForTimeout(3_000);
    const mapButton = page.getByRole("region", { name: /Realtime zone map/i }).getByRole("button");
    await expect(mapButton).toHaveCount(1);
    await expect(page.getByText("SUPERVISOR CONTROLS")).toHaveCount(0);
    if (viewport.name === "mobile") {
      await expect(page.getByRole("banner").getByRole("button", { name: "Open EaseAI chat" })).toBeVisible();
      await expect(page.locator(".ws-ai-fab")).toBeHidden();
      await mapButton.evaluate((button) => button.scrollIntoView({ block: "center" }));
      expect(
        await mapButton.evaluate((button) => {
          const rect = button.getBoundingClientRect();
          const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return top === button || button.contains(top);
        }),
      ).toBe(true);
      for (const button of await page.getByRole("main").getByRole("button").all()) {
        expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
    }
    await expect(page.locator("body")).toHaveCSS("overflow-x", /^(clip|hidden|visible)$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `${screenshots}/supervisor-dashboard-${viewport.name}.png`, fullPage: true });

    expect(consoleErrors).toEqual([]);
    expect(failedResponses).toEqual([]);
  });
}
