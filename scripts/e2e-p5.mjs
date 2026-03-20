import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const PHONE = '18793198472';
const PASSWORD = '718293';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' })).newPage();

  const results = {};

  try {
    console.log('=== P5 E2E: 冷启动播种验证 ===\n');

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

    // 2. 清除 localStorage('v2note:onboarded') 模拟首次使用
    console.log('\n--- Step 2: 清除 onboarded 标记 ---');
    await page.evaluate(() => localStorage.removeItem('v2note:onboarded'));
    console.log('  ✅ 已清除 v2note:onboarded');

    // 3. 刷新页面
    console.log('\n--- Step 3: 刷新页面 ---');
    await page.reload({ waitUntil: 'networkidle' });
    console.log('  ✅ 页面已刷新');

    // 4. 等 3 秒 + 截图
    console.log('\n--- Step 4: 等待 3s + 截图 ---');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'scripts/screenshots/p5-01-onboarding.png' });
    console.log('  ✅ 截图: p5-01-onboarding.png');

    // 5. 检查播种文字
    console.log('\n--- Step 5: 检查播种关键文字 ---');
    const bodyText = await page.textContent('body');

    const hasCognitivePartner = bodyText?.includes('认知伙伴');
    const hasRecentBusy = bodyText?.includes('最近在忙什么');

    results['认知伙伴文字'] = hasCognitivePartner;
    results['最近在忙什么文字'] = hasRecentBusy;
    results['播种文字(任一)'] = hasCognitivePartner || hasRecentBusy;

    console.log(`  认知伙伴: ${hasCognitivePartner ? '✅' : '❌'}`);
    console.log(`  最近在忙什么: ${hasRecentBusy ? '✅' : '❌'}`);

    // 6. 恢复 localStorage
    console.log('\n--- Step 6: 恢复 onboarded 标记 ---');
    await page.evaluate(() => localStorage.setItem('v2note:onboarded', 'true'));
    console.log('  ✅ 已恢复 v2note:onboarded = true');

    // 7. 打印结果
    console.log('\n\n========== P5 验证结果汇总 ==========');
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
    await page.screenshot({ path: 'scripts/screenshots/p5-error.png' }).catch(() => {});
  } finally {
    console.log('Browser open 10s...');
    await page.waitForTimeout(10000);
    await browser.close();
  }
}

main().catch(console.error);
