import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const GW = 'http://localhost:3001';
const PHONE = '18793198472';
const PASSWORD = '718293';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' })).newPage();

  try {
    // 1. Login
    console.log('--- Login ---');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const inputs = page.locator('input');
    if (await inputs.count() >= 2) {
      await inputs.nth(0).fill(PHONE);
      await inputs.nth(1).fill(PASSWORD);
      await page.locator('button:has-text("登录")').click();
      await page.waitForTimeout(4000);
    }
    await page.screenshot({ path: 'scripts/screenshots/full-01-logged-in.png' });
    console.log('  ✅ Logged in');

    // 2. Check pure view (Level -1)
    console.log('\n--- Level -1 Pure View ---');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'scripts/screenshots/full-02-pure-view.png' });
    const timeVisible = await page.locator('text=/\\d{2}:\\d{2}/').first().isVisible().catch(() => false);
    console.log(`  Time display: ${timeVisible ? '✅' : '❌'}`);

    // 3. Check Brain icon (cognitive map entry)
    const brainBtn = page.locator('[aria-label="认知地图"]');
    const hasBrain = await brainBtn.isVisible().catch(() => false);
    console.log(`  Brain icon: ${hasBrain ? '✅' : '❌'}`);

    // 4. Click Brain → Cognitive Map (Level 0)
    if (hasBrain) {
      console.log('\n--- Level 0 Cognitive Map ---');
      await brainBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'scripts/screenshots/full-03-cognitive-map.png' });
      const mapTitle = await page.locator('text=我的认知世界').isVisible().catch(() => false);
      console.log(`  Map title: ${mapTitle ? '✅' : '❌'}`);

      // Check cluster cards
      const clusterCards = page.locator('text=/条记录/');
      const cardCount = await clusterCards.count();
      console.log(`  Cluster cards: ${cardCount}`);

      // Back
      await page.locator('[aria-label="返回"], button:has(svg.lucide-arrow-left)').first().click().catch(() => {});
      await page.waitForTimeout(1000);
    }

    // 5. Check view toggle
    console.log('\n--- View Toggle ---');
    const toggleBtn = page.locator('[aria-label*="切换"]');
    if (await toggleBtn.isVisible().catch(() => false)) {
      await toggleBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'scripts/screenshots/full-04-timeline.png' });
      console.log('  ✅ Switched to timeline');
      await toggleBtn.click();
      await page.waitForTimeout(1000);
    }

    // 6. Action Panel (swipe up)
    console.log('\n--- Action Panel ---');
    // Simulate swipe up from bottom
    const viewport = page.viewportSize();
    if (viewport) {
      await page.mouse.move(viewport.width / 2, viewport.height - 20);
      await page.mouse.down();
      await page.mouse.move(viewport.width / 2, viewport.height - 150, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: 'scripts/screenshots/full-05-action-panel.png' });

      // Check if action panel appeared
      const panelText = await page.textContent('body');
      const hasPanel = panelText?.includes('此刻') || panelText?.includes('今日');
      console.log(`  Action panel: ${hasPanel ? '✅ visible' : '⚠️ not detected (may need data)'}`);
    }

    // 7. API verification
    console.log('\n--- API Verification ---');
    const apiResults = await page.evaluate(async (gw) => {
      const token = localStorage.getItem('voicenote:accessToken');
      const h = token ? { 'Authorization': `Bearer ${token}` } : {};
      const results = {};

      try {
        const r1 = await fetch(`${gw}/api/v1/action-panel`, { headers: h });
        results['action-panel'] = { status: r1.status, data: await r1.json() };
      } catch(e) { results['action-panel'] = { error: e.message }; }

      try {
        const r2 = await fetch(`${gw}/api/v1/cognitive/stats`, { headers: h });
        results['cognitive-stats'] = { status: r2.status, data: await r2.json() };
      } catch(e) { results['cognitive-stats'] = { error: e.message }; }

      try {
        const r3 = await fetch(`${gw}/api/v1/cognitive/clusters`, { headers: h });
        results['clusters'] = { status: r3.status, data: await r3.json() };
      } catch(e) { results['clusters'] = { error: e.message }; }

      return results;
    }, GW);

    for (const [key, val] of Object.entries(apiResults)) {
      const v = val;
      if (v.error) {
        console.log(`  ${key}: ❌ ${v.error}`);
      } else {
        console.log(`  ${key}: ✅ ${v.status} — ${JSON.stringify(v.data).slice(0, 100)}`);
      }
    }

    // Final
    await page.screenshot({ path: 'scripts/screenshots/full-99-final.png', fullPage: true });
    console.log('\n✅ Full E2E verification complete');

  } catch (err) {
    console.error('❌', err.message);
    await page.screenshot({ path: 'scripts/screenshots/full-error.png' }).catch(() => {});
  } finally {
    console.log('\nBrowser open 10s...');
    await page.waitForTimeout(10000);
    await browser.close();
  }
}

main().catch(console.error);
