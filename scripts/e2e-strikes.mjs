import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const PHONE = '18793198472';
const PASSWORD = '718293';

async function main() {
  console.log('🚀 Launching browser...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'zh-CN',
  });
  const page = await context.newPage();

  try {
    // Step 1: Login
    console.log('\n--- Step 1: Login ---');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    
    const phoneInput = page.locator('input').first();
    const passwordInput = page.locator('input[type="password"]');
    
    await phoneInput.fill(PHONE);
    await passwordInput.fill(PASSWORD);
    await page.screenshot({ path: 'scripts/screenshots/01-login-filled.png' });
    console.log('  📸 01-login-filled.png');
    
    await page.locator('text=登录').click();
    console.log('  Clicked login...');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'scripts/screenshots/02-after-login.png' });
    console.log('  📸 02-after-login.png');

    // Step 2: Wait for timeline
    console.log('\n--- Step 2: Timeline ---');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'scripts/screenshots/03-timeline.png' });
    console.log('  📸 03-timeline.png');

    // Step 3: Look for note cards and strike summaries
    console.log('\n--- Step 3: Strike verification ---');
    
    // Scroll through cards looking for strike summary
    let foundStrike = false;
    for (let scroll = 0; scroll < 10; scroll++) {
      const strikeSummary = page.locator('text=/认知提取|个感知|个判断|个领悟|个意图|个感受/');
      const count = await strikeSummary.count();
      
      if (count > 0) {
        const text = await strikeSummary.first().textContent();
        console.log(`  ✅ Found strike summary: "${text}"`);
        await page.screenshot({ path: 'scripts/screenshots/04-strike-found.png' });
        console.log('  📸 04-strike-found.png');
        
        // Click to expand
        await strikeSummary.first().click();
        await page.waitForTimeout(1500);
        await page.screenshot({ path: 'scripts/screenshots/05-strikes-expanded.png' });
        console.log('  📸 05-strikes-expanded.png');
        foundStrike = true;
        break;
      }
      
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(800);
    }
    
    if (!foundStrike) {
      console.log('  ⚠️ No strike summary in scroll range');
      
      // Click on first card to see if it expands with strikes
      const firstCard = page.locator('button[class*="rounded-2xl"]').first();
      if (await firstCard.isVisible().catch(() => false)) {
        console.log('  Clicking first card...');
        await firstCard.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'scripts/screenshots/04-card-expanded.png' });
        console.log('  📸 04-card-expanded.png');
      }
    }

    // Step 4: Verify Strikes API works with auth
    console.log('\n--- Step 4: API check ---');
    const apiCheck = await page.evaluate(async () => {
      try {
        const token = localStorage.getItem('voicenote:accessToken');
        const res = await fetch('http://localhost:3001/api/v1/records?limit=1', {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        const data = await res.json();
        if (data.length > 0) {
          const recordId = data[0].id;
          const strikesRes = await fetch(`http://localhost:3001/api/v1/records/${recordId}/strikes`, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
          });
          const strikes = await strikesRes.json();
          return { record: recordId, digested: data[0].digested, strikeCount: strikes.length, strikes: strikes.slice(0, 3) };
        }
        return { records: data.length };
      } catch(e) { return { error: e.message }; }
    });
    console.log('  API result:', JSON.stringify(apiCheck, null, 2));

    // Final full-page screenshot
    await page.screenshot({ path: 'scripts/screenshots/06-final.png', fullPage: true });
    console.log('\n📸 06-final.png (full page)');
    console.log('\n✅ E2E test done. Check scripts/screenshots/');

  } catch (err) {
    console.error('❌ Error:', err.message);
    await page.screenshot({ path: 'scripts/screenshots/error.png' }).catch(() => {});
  } finally {
    console.log('\nBrowser open for 10s...');
    await page.waitForTimeout(10000);
    await browser.close();
  }
}

main().catch(console.error);
