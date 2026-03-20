import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const PHONE = '18793198472';
const PASSWORD = '718293';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' })).newPage();

  const logs = [];
  const responses = [];
  const FILTER = /cognitive|cluster|error/i;

  // Listen to console
  page.on('console', msg => {
    const text = msg.text();
    if (FILTER.test(text)) {
      const entry = `[console:${msg.type()}] ${text}`;
      logs.push(entry);
      console.log(entry);
    }
  });

  // Listen to page errors
  page.on('pageerror', err => {
    const entry = `[pageerror] ${err.message}`;
    logs.push(entry);
    console.log(entry);
  });

  // Listen to responses
  page.on('response', resp => {
    const url = resp.url();
    if (FILTER.test(url)) {
      const entry = `[response] ${resp.status()} ${resp.request().method()} ${url}`;
      responses.push(entry);
      console.log(entry);
    }
  });

  // Listen to request failures
  page.on('requestfailed', req => {
    const url = req.url();
    if (FILTER.test(url)) {
      const entry = `[requestfailed] ${req.method()} ${url} — ${req.failure()?.errorText}`;
      responses.push(entry);
      console.log(entry);
    }
  });

  try {
    // 1. Login
    console.log('=== 1. Login ===');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const inputs = page.locator('input');
    if (await inputs.count() >= 2) {
      await inputs.nth(0).fill(PHONE);
      await inputs.nth(1).fill(PASSWORD);
      await page.locator('button:has-text("登录")').click();
      await page.waitForTimeout(4000);
    }
    console.log('  ✅ Logged in');

    // 2. Click Brain button
    console.log('\n=== 2. Click Brain → Cognitive Map ===');
    const brainBtn = page.locator('[aria-label="认知地图"]');
    const hasBrain = await brainBtn.isVisible().catch(() => false);
    if (hasBrain) {
      await brainBtn.click();
      console.log('  ✅ Brain clicked');
    } else {
      console.log('  ❌ Brain button not found');
    }

    // 3. Wait 5 seconds for data loading
    console.log('\n=== 3. Waiting 5s for data ===');
    await page.waitForTimeout(5000);

    // 4. Print all captured logs
    console.log('\n=== 4. Captured Console Logs ===');
    if (logs.length === 0) {
      console.log('  (none)');
    } else {
      logs.forEach(l => console.log(`  ${l}`));
    }

    console.log('\n=== 5. Captured Network (cognitive/cluster/error) ===');
    if (responses.length === 0) {
      console.log('  (none)');
    } else {
      responses.forEach(r => console.log(`  ${r}`));
    }

    // 5. Screenshot
    await page.screenshot({ path: 'scripts/screenshots/debug-lifemap.png' });
    console.log('\n=== 6. Screenshot saved → scripts/screenshots/debug-lifemap.png ===');

  } catch (err) {
    console.error('Script error:', err);
    await page.screenshot({ path: 'scripts/screenshots/debug-lifemap.png' }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main();
