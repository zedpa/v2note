import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const GW = 'http://localhost:3001';
const PHONE = '18793198472';
const PASSWORD = '718293';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' })).newPage();

  const results = {};

  try {
    // 1. Login
    console.log('=== P2 E2E: 认知地图全链路 ===\n');
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

    // 2. Pure view — confirm big time + Brain icon
    console.log('\n--- Step 2: 纯净入口 (大时间 + Brain 图标) ---');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'scripts/screenshots/p2-01-pure-view.png' });

    const timeVisible = await page.locator('text=/\\d{2}:\\d{2}/').first().isVisible().catch(() => false);
    results['大时间显示'] = timeVisible;
    console.log(`  大时间: ${timeVisible ? '✅' : '❌'}`);

    const brainBtn = page.locator('[aria-label="认知地图"]');
    const hasBrain = await brainBtn.isVisible().catch(() => false);
    results['Brain图标'] = hasBrain;
    console.log(`  Brain 图标: ${hasBrain ? '✅' : '❌'}`);

    // 3. Click Brain → Cognitive Map, look for '供应链管理' cluster
    console.log('\n--- Step 3: 认知地图 (供应链管理 cluster) ---');
    if (!hasBrain) {
      console.log('  ❌ Brain 图标不存在，跳过认知地图');
    } else {
      await brainBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'scripts/screenshots/p2-02-cognitive-map.png' });

      const mapTitle = await page.locator('text=我的认知世界').isVisible().catch(() => false);
      results['认知地图标题'] = mapTitle;
      console.log(`  "我的认知世界" 标题: ${mapTitle ? '✅' : '❌'}`);

      // Look for 供应链管理 cluster card
      const supplyChainCard = page.locator('text=供应链管理');
      const hasSupplyChain = await supplyChainCard.first().isVisible().catch(() => false);
      results['供应链管理卡片'] = hasSupplyChain;
      console.log(`  供应链管理 cluster: ${hasSupplyChain ? '✅' : '❌'}`);

      // Count all cluster cards
      const clusterCards = page.locator('text=/条记录/');
      const cardCount = await clusterCards.count();
      results['Cluster卡片数'] = cardCount;
      console.log(`  Cluster 卡片总数: ${cardCount}`);

      // 4. Click 供应链管理 → ClusterDetail (成员时间线)
      console.log('\n--- Step 4: ClusterDetail (成员时间线) ---');
      if (hasSupplyChain) {
        await supplyChainCard.first().click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'scripts/screenshots/p2-03-cluster-detail.png' });

        // Check for timeline elements in detail view
        const bodyText = await page.textContent('body');
        const hasTimeline = bodyText?.includes('时间线') || bodyText?.includes('timeline');
        const hasMemberList = await page.locator('text=/条记录|成员|笔记/').first().isVisible().catch(() => false);
        results['ClusterDetail成员'] = hasMemberList;
        results['ClusterDetail时间线'] = hasTimeline;
        console.log(`  成员列表/笔记: ${hasMemberList ? '✅' : '❌'}`);
        console.log(`  时间线: ${hasTimeline ? '✅' : '❌'}`);

        // Back
        console.log('  返回认知地图...');
        await page.locator('[aria-label="返回"], button:has(svg.lucide-arrow-left)').first().click().catch(() => {
          console.log('  ⚠️ 返回按钮未找到，尝试浏览器后退');
          return page.goBack();
        });
        await page.waitForTimeout(1500);
      } else {
        console.log('  ⚠️ 供应链管理卡片未找到，跳过 ClusterDetail');
      }

      // 5. Back to pure view, switch to timeline view
      console.log('\n--- Step 5: 返回 → 切换 Timeline 视图 ---');
      // Go back to main view from cognitive map
      await page.locator('[aria-label="返回"], button:has(svg.lucide-arrow-left)').first().click().catch(() => {
        return page.goBack();
      });
      await page.waitForTimeout(1500);
    }

    // Switch to timeline view
    const toggleBtn = page.locator('[aria-label*="切换"]');
    const hasToggle = await toggleBtn.isVisible().catch(() => false);
    results['视图切换按钮'] = hasToggle;
    if (hasToggle) {
      await toggleBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'scripts/screenshots/p2-04-timeline.png' });
      results['Timeline切换'] = true;
      console.log('  ✅ 切换到 Timeline 视图');
      // Switch back
      await toggleBtn.click();
      await page.waitForTimeout(1000);
    } else {
      console.log('  ❌ 视图切换按钮不存在');
      results['Timeline切换'] = false;
    }

    // 6. API verification
    console.log('\n--- Step 6: API 验证 ---');
    const apiResults = await page.evaluate(async (gw) => {
      const token = localStorage.getItem('voicenote:accessToken');
      const h = token ? { 'Authorization': `Bearer ${token}` } : {};
      const out = {};

      // GET /cognitive/clusters
      try {
        const r1 = await fetch(`${gw}/api/v1/cognitive/clusters`, { headers: h });
        const data1 = await r1.json();
        out['clusters'] = { status: r1.status, data: data1 };
      } catch (e) { out['clusters'] = { error: e.message }; }

      // GET /cognitive/clusters/:id — use first cluster id if available
      try {
        if (out['clusters']?.data) {
          const items = out['clusters'].data.clusters || out['clusters'].data.data || out['clusters'].data;
          const arr = Array.isArray(items) ? items : [];
          if (arr.length > 0) {
            const id = arr[0].id || arr[0]._id;
            const r2 = await fetch(`${gw}/api/v1/cognitive/clusters/${id}`, { headers: h });
            const data2 = await r2.json();
            out['cluster-detail'] = { status: r2.status, id, data: data2 };
          } else {
            out['cluster-detail'] = { skip: 'no clusters found' };
          }
        }
      } catch (e) { out['cluster-detail'] = { error: e.message }; }

      return out;
    }, GW);

    for (const [key, val] of Object.entries(apiResults)) {
      if (val.error) {
        console.log(`  ${key}: ❌ ${val.error}`);
        results[`API:${key}`] = false;
      } else if (val.skip) {
        console.log(`  ${key}: ⚠️ ${val.skip}`);
        results[`API:${key}`] = 'skipped';
      } else {
        console.log(`  ${key}: ✅ ${val.status} — ${JSON.stringify(val.data).slice(0, 120)}`);
        results[`API:${key}`] = val.status === 200;
      }
    }

    // Final screenshot
    await page.screenshot({ path: 'scripts/screenshots/p2-99-final.png', fullPage: true });

    // 7. Print summary
    console.log('\n\n========== P2 验证结果汇总 ==========');
    let pass = 0, fail = 0, skip = 0;
    for (const [k, v] of Object.entries(results)) {
      const icon = v === true ? '✅' : v === false ? '❌' : '⚠️';
      if (v === true) pass++;
      else if (v === false) fail++;
      else skip++;
      console.log(`  ${icon} ${k}: ${v}`);
    }
    console.log(`\n  总计: ${pass} 通过 / ${fail} 失败 / ${skip} 其他`);
    console.log('=====================================\n');

  } catch (err) {
    console.error('❌ Fatal:', err.message);
    await page.screenshot({ path: 'scripts/screenshots/p2-error.png' }).catch(() => {});
  } finally {
    console.log('Browser open 10s...');
    await page.waitForTimeout(10000);
    await browser.close();
  }
}

main().catch(console.error);
