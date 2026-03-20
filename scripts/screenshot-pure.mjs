import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

// Login
const inputs = page.locator('input');
if (await inputs.count() >= 2) {
  await inputs.nth(0).fill('18793198472');
  await inputs.nth(1).fill('718293');
  await page.locator('button:has-text("登录")').click();
  await page.waitForTimeout(4000);
}

// Set onboarded flag to skip onboarding, then reload
await page.evaluate(() => {
  localStorage.setItem('v2note:onboarded', 'true');
  localStorage.setItem('voicenote:gatewayUrl', 'http://localhost:3001');
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

await page.screenshot({ path: 'scripts/screenshots/p1-new-dark.png' });
console.log('Done');
await browser.close();
