import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const PHONE = '18793198472';
const PASSWORD = '718293';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' })).newPage();

  const results = {};

  try {
    console.log('=== P4 E2E: 决策工作台验证 ===\n');

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

    // 2. Click Brain → 供应链管理 → 等 5 秒截图
    console.log('\n--- Step 2: Brain → 供应链管理 ---');
    const brainBtn = page.locator('[aria-label="认知地图"]');
    const hasBrain = await brainBtn.isVisible().catch(() => false);
    if (!hasBrain) {
      console.log('  ❌ Brain 图标不存在，终止');
      return;
    }
    await brainBtn.click();
    await page.waitForTimeout(3000);

    const supplyChainCard = page.locator('text=供应链管理');
    const hasCard = await supplyChainCard.first().isVisible().catch(() => false);
    if (!hasCard) {
      console.log('  ❌ 供应链管理卡片未找到，终止');
      return;
    }
    await supplyChainCard.first().click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'scripts/screenshots/p4-01-detail.png' });
    console.log('  ✅ 截图: p4-01-detail.png');

    // 3. 找'帮我想想这个问题'按钮并点击
    console.log('\n--- Step 3: 点击"帮我想想这个问题" ---');
    const thinkBtn = page.locator('button:has-text("帮我想想这个问题")');
    const hasThinkBtn = await thinkBtn.first().isVisible().catch(() => false);
    if (!hasThinkBtn) {
      console.log('  ❌ "帮我想想这个问题"按钮未找到，终止');
      results['帮我想想按钮'] = false;
      return;
    }
    await thinkBtn.first().click();
    results['帮我想想按钮'] = true;
    console.log('  ✅ 已点击"帮我想想这个问题"');

    // 4. 等 3 秒截图
    console.log('\n--- Step 4: 等待决策面板 + 截图 ---');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'scripts/screenshots/p4-02-decision.png' });
    console.log('  ✅ 截图: p4-02-decision.png');

    // 5. 检查页面关键文字
    console.log('\n--- Step 5: 检查关键文字 ---');
    const bodyText = await page.textContent('body');

    const hasSupport = bodyText?.includes('支持');
    const hasOppose = bodyText?.includes('反对');
    const hasSearching = bodyText?.includes('正在从你的认知图谱中寻找线索');

    results['支持文字'] = hasSupport;
    results['反对文字'] = hasOppose;
    results['寻找线索文字'] = hasSearching;
    results['关键文字(任一)'] = hasSupport || hasOppose || hasSearching;

    console.log(`  支持: ${hasSupport ? '✅' : '❌'}`);
    console.log(`  反对: ${hasOppose ? '✅' : '❌'}`);
    console.log(`  正在寻找线索: ${hasSearching ? '✅' : '❌'}`);

    // 6. Print summary
    console.log('\n\n========== P4 验证结果汇总 ==========');
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
    await page.screenshot({ path: 'scripts/screenshots/p4-error.png' }).catch(() => {});
  } finally {
    console.log('Browser open 10s...');
    await page.waitForTimeout(10000);
    await browser.close();
  }
}

main().catch(console.error);
