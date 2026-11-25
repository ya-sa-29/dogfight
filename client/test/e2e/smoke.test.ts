import { test, expect } from "@playwright/test";

test("click start and wait for lobby", async ({ page }) => {
    const consoleMessages: string[] = [];
    page.on("console", (msg) => consoleMessages.push(`${msg.type()}: ${msg.text()}`));
    page.on("pageerror", (err) => consoleMessages.push(`PAGE ERROR: ${err.message}`));

    await page.goto("/");
    
    const startButton = page.locator("button", { hasText: /Enable Audio & Start/ });
    await expect(startButton).toBeVisible();
    await startButton.click();
    console.log("Clicked start button");

    // Wait a bit for bootstrap to complete
    await page.waitForTimeout(3000);

    console.log("Console messages:", consoleMessages);
    
    // Check if lobby appeared
    const nameInput = page.locator("#player-name");
    const isVisible = await nameInput.isVisible();
    console.log("Name input visible:", isVisible);

    // Check body content
    const bodyText = await page.locator("body").textContent();
    console.log("Body text:", bodyText?.substring(0, 200));

    if (!isVisible) {
        await page.screenshot({ path: "test-results/debug-lobby2.png", fullPage: true });
    }
});
