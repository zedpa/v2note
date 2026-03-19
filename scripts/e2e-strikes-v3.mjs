import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const GATEWAY = 'http://localhost:3001';
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
    // Login
    console.log('\n--- Login ---');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const inputs = page.locator('input');
    await inputs.nth(0).fill(PHONE);
    await inputs.nth(1).fill(PASSWORD);
    await page.locator('button:has-text("登录")').click();
    await page.waitForTimeout(4000);
    console.log('  ✅ Logged in');

    // Verify API
    console.log('\n--- API check ---');
    const apiResult = await page.evaluate(async (gw) => {
      const token = localStorage.getItem('voicenote:accessToken');
      const headers = { 'Authorization': `Bearer ${token}` };
      
      // Find record with strikes
      const recRes = await fetch(`${gw}/api/v1/records?limit=20`, { headers });
      const records = await recRes.json();
      
      for (const r of records) {
        const stRes = await fetch(`${gw}/api/v1/records/${r.id}/strikes`, { headers });
        const strikes = await stRes.json();
        if (strikes.length > 0) {
          return { recordId: r.id, strikeCount: strikes.length, status: r.status, digested: r.digested };
        }
      }
      return { totalRecords: records.length, noneHaveStrikes: true };
    }, GATEWAY);
    console.log('  ', JSON.stringify(apiResult));

    // Take a clean timeline screenshot
    console.log('\n--- Timeline ---');
    await page.screenshot({ path: 'scripts/screenshots/10-timeline-clean.png' });

    // Get page HTML to understand DOM structure
    const bodyHtml = await page.evaluate(() => {
      // Find elements that look like note cards (contain time + summary text)
      const allButtons = document.querySelectorAll('button');
      const cards = [];
      for (const btn of allButtons) {
        const text = btn.textContent || '';
        // Note cards typically have time (HH:MM) and content text
        if (text.match(/\d{1,2}:\d{2}/) && text.length > 30) {
          cards.push({
            classes: btn.className.slice(0, 80),
            textPreview: text.slice(0, 100),
            rect: btn.getBoundingClientRect(),
          });
        }
      }
      return cards;
    });
    console.log(`  Found ${bodyHtml.length} note-card candidates:`);
    for (const c of bodyHtml.slice(0, 5)) {
      console.log(`    "${c.textPreview.slice(0, 60)}..." (y: ${Math.round(c.rect.y)})`);
    }

    // Click the first actual note card
    if (bodyHtml.length > 0) {
      console.log('\n--- Click note card ---');
      // Use more specific selector: button with time pattern text
      const noteCards = page.locator('button').filter({ hasText: /\d{1,2}:\d{2}/ });
      const cardCount = await noteCards.count();
      console.log(`  Filtered cards with time: ${cardCount}`);
      
      if (cardCount > 0) {
        // Click first card
        await noteCards.first().click({ timeout: 5000 });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'scripts/screenshots/11-card-clicked.png' });
        console.log('  📸 11-card-clicked.png');

        // Look for strike summary after expanding
        const strikeSummary = page.locator('text=/个感知|个判断|个领悟|个意图|个感受|认知提取/');
        const strikeCount = await strikeSummary.count();
        console.log(`  Strike summary elements: ${strikeCount}`);
        
        if (strikeCount > 0) {
          const text = await strikeSummary.first().textContent();
          console.log(`  ✅✅ STRIKE SUMMARY VISIBLE: "${text}"`);
          await page.screenshot({ path: 'scripts/screenshots/12-strike-visible.png' });
          
          // Click to expand strike details
          await strikeSummary.first().click();
          await page.waitForTimeout(1500);
          await page.screenshot({ path: 'scripts/screenshots/13-strikes-detail.png' });
          console.log('  📸 13-strikes-detail.png');
        } else {
          console.log('  No strike summary after card click');
          // Check if the overlay/expanded view is showing
          const pageText = await page.textContent('body');
          const hasStrikeText = pageText.includes('感知') || pageText.includes('判断') || pageText.includes('领悟');
          console.log(`  Page contains strike polarity text: ${hasStrikeText}`);
        }
        
        // Go back
        await page.goBack().catch(() => {});
        await page.waitForTimeout(1000);
      }
    }

    // Scroll and screenshot the full page
    await page.screenshot({ path: 'scripts/screenshots/99-final.png', fullPage: true });
    console.log('\n📸 99-final.png');
    
    console.log('\n✅ E2E complete');

  } catch (err) {
    console.error('❌', err.message);
    await page.screenshot({ path: 'scripts/screenshots/error.png' }).catch(() => {});
  } finally {
    console.log('\nBrowser open 10s...');
    await page.waitForTimeout(10000);
    await browser.close();
  }
}

main().catch(console.error);
