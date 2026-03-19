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

  // Capture console logs from the page
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('strike')) {
      console.log(`  [browser] ${msg.text()}`);
    }
  });

  try {
    // Step 1: Login
    console.log('\n--- Step 1: Login ---');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    
    const inputs = page.locator('input');
    const inputCount = await inputs.count();
    console.log(`  Found ${inputCount} input fields`);
    
    if (inputCount >= 2) {
      await inputs.nth(0).fill(PHONE);
      await inputs.nth(1).fill(PASSWORD);
      await page.locator('button:has-text("登录")').click();
      console.log('  Clicked login');
      await page.waitForTimeout(4000);
    }
    
    await page.screenshot({ path: 'scripts/screenshots/01-logged-in.png' });
    console.log('  📸 01-logged-in.png');

    // Step 2: Check API with auth from browser context
    console.log('\n--- Step 2: API verification ---');
    const apiResult = await page.evaluate(async (gw) => {
      const token = localStorage.getItem('voicenote:accessToken');
      if (!token) return { error: 'No token in localStorage' };
      
      const headers = { 'Authorization': `Bearer ${token}` };
      
      // Get recent records
      const recRes = await fetch(`${gw}/api/v1/records?limit=5`, { headers });
      const records = await recRes.json();
      
      // Find one with strikes
      for (const r of records) {
        const stRes = await fetch(`${gw}/api/v1/records/${r.id}/strikes`, { headers });
        const strikes = await stRes.json();
        if (strikes.length > 0) {
          return { 
            recordId: r.id, 
            status: r.status,
            digested: r.digested,
            strikeCount: strikes.length, 
            strikes: strikes.map(s => ({ polarity: s.polarity, nucleus: s.nucleus.slice(0, 40) }))
          };
        }
      }
      
      return { records: records.length, noneHaveStrikes: true, firstRecord: records[0] };
    }, GATEWAY);
    
    console.log('  API result:', JSON.stringify(apiResult, null, 2));

    // Step 3: Click on the note card that has strikes
    console.log('\n--- Step 3: Find and click the card with strikes ---');
    
    if (apiResult.recordId) {
      // Scroll through cards and look for clickable ones
      const cards = page.locator('button[class*="rounded"]');
      const cardCount = await cards.count();
      console.log(`  Found ${cardCount} clickable cards`);
      
      // Click on first completed card
      for (let i = 0; i < Math.min(cardCount, 5); i++) {
        const card = cards.nth(i);
        const isVisible = await card.isVisible().catch(() => false);
        if (isVisible) {
          console.log(`  Clicking card ${i}...`);
          await card.click();
          await page.waitForTimeout(2000);
          
          // Check if strikes appeared
          const strikeSummary = page.locator('text=/个感知|个判断|个领悟|个意图|个感受/');
          const found = await strikeSummary.count();
          if (found > 0) {
            const text = await strikeSummary.first().textContent();
            console.log(`  ✅ Strike summary found: "${text}"`);
            await page.screenshot({ path: 'scripts/screenshots/02-strike-summary.png' });
            console.log('  📸 02-strike-summary.png');
            
            // Click to expand strikes
            await strikeSummary.first().click();
            await page.waitForTimeout(1500);
            await page.screenshot({ path: 'scripts/screenshots/03-strikes-expanded.png' });
            console.log('  📸 03-strikes-expanded.png');
            break;
          }
          
          await page.screenshot({ path: `scripts/screenshots/02-card-${i}.png` });
          console.log(`  📸 02-card-${i}.png (no strikes)`);
        }
      }
    } else {
      console.log('  ⚠️ No records with strikes found via API');
    }

    // Final
    await page.screenshot({ path: 'scripts/screenshots/99-final.png', fullPage: true });
    console.log('\n📸 99-final.png');
    console.log('\n✅ Done');

  } catch (err) {
    console.error('❌ Error:', err.message);
    await page.screenshot({ path: 'scripts/screenshots/error.png' }).catch(() => {});
  } finally {
    console.log('\nBrowser open 15s for inspection...');
    await page.waitForTimeout(15000);
    await browser.close();
  }
}

main().catch(console.error);
