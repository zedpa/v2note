import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const PHONE = '18793198472';
const PASSWORD = '718293';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' })).newPage();

  const results = {};

  try {
    console.log('=== P3 E2E: ClusterDetail 验证 ===\n');

    // 1. Login
    console.log('--- Step 1: Login ---');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const inputs = page.locator('input');
    if (await inputs.count() >= 2) {
      await inputs.nth(0).fill(PHONE);
      await inputs.nth(1).fill(PASSWORD);
      await page.locator('button:has-text("登录")').click();
      await page.waitForTimeout(4000);
    }
    console.log('  ✅ Logged in');

    // 2. Click Brain icon → 认知地图
    console.log('\n--- Step 2: 进入认知地图 ---');
    const brainBtn = page.locator('[aria-label="认知地图"]');
    const hasBrain = await brainBtn.isVisible().catch(() => false);
    if (!hasBrain) {
      console.log('  ❌ Brain 图标不存在，终止');
      return;
    }
    await brainBtn.click();
    await page.waitForTimeout(3000);
    console.log('  ✅ 已进入认知地图');

    // 3. Click '供应链管理' card
    console.log('\n--- Step 3: 点击供应链管理卡片 ---');
    const supplyChainCard = page.locator('text=供应链管理');
    const hasCard = await supplyChainCard.first().isVisible().catch(() => false);
    if (!hasCard) {
      console.log('  ❌ 供应链管理卡片未找到，终止');
      return;
    }
    await supplyChainCard.first().click();
    console.log('  ✅ 已点击供应链管理');

    // 4. Wait for API load + screenshot
    console.log('\n--- Step 4: 等待加载 + 截图 ---');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'scripts/screenshots/p3-01-cluster-detail.png' });
    console.log('  ✅ 截图: p3-01-cluster-detail.png');

    // 5. Check for key text content
    console.log('\n--- Step 5: 检查关键文字 ---');
    const bodyText = await page.textContent('body');

    const hasCognitivePattern = bodyText?.includes('认知模式');
    const hasOpposingView = bodyText?.includes('对立观点');
    const hasTargetState = bodyText?.includes('目标状态');

    results['认知模式文字'] = hasCognitivePattern;
    results['对立观点文字'] = hasOpposingView;
    results['目标状态文字'] = hasTargetState;
    results['关键文字(任一)'] = hasCognitivePattern || hasOpposingView || hasTargetState;

    console.log(`  认知模式: ${hasCognitivePattern ? '✅' : '❌'}`);
    console.log(`  对立观点: ${hasOpposingView ? '✅' : '❌'}`);
    console.log(`  目标状态: ${hasTargetState ? '✅' : '❌'}`);

    // 6. Check polarity icons (text-blue-500, text-red-500, text-green-500, etc.)
    console.log('\n--- Step 6: 检查极性图标 ---');
    const polarityClasses = ['text-blue-500', 'text-red-500', 'text-green-500', 'text-amber-500', 'text-purple-500'];
    const foundPolarities = [];

    for (const cls of polarityClasses) {
      const count = await page.locator(`.${cls.replace(/:/g, '\\:')}`).count();
      if (count > 0) {
        foundPolarities.push(`${cls} (${count})`);
      }
    }

    results['极性图标'] = foundPolarities.length > 0;
    console.log(`  极性 class 匹配: ${foundPolarities.length > 0 ? '✅' : '❌'}`);
    if (foundPolarities.length > 0) {
      console.log(`  找到: ${foundPolarities.join(', ')}`);
    }

    // 7. Scroll to bottom + full page screenshot
    console.log('\n--- Step 7: 滚动到底部 + 全页截图 ---');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'scripts/screenshots/p3-02-full.png', fullPage: true });
    console.log('  ✅ 截图: p3-02-full.png');

    // 8. Print summary
    console.log('\n\n========== P3 验证结果汇总 ==========');
    let pass = 0, fail = 0;
    for (const [k, v] of Object.entries(results)) {
      const icon = v ? '✅' : '❌';
      if (v) pass++; else fail++;
      console.log(`  ${icon} ${k}: ${v}`);
    }
    console.log(`\n  总计: ${pass} 通过 / ${fail} 失败`);
    console.log('=====================================\n');

  } catch (err) {
    console.error('❌ Fatal:', err.message);
    await page.screenshot({ path: 'scripts/screenshots/p3-error.png' }).catch(() => {});
  } finally {
    console.log('Browser open 10s...');
    await page.waitForTimeout(10000);
    await browser.close();
  }
}

main().catch(console.error);
