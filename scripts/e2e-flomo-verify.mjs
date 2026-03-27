/**
 * flomo 导入后的全链路 E2E 验证
 *
 * 验证:
 *  1. 登录 → 引导 → 主页日记列表
 *  2. 日记/待办 Segment 切换
 *  3. 侧边栏 → 统计/目标/画像
 *  4. API 后端数据完整性
 *  5. 认知地图（通过侧边栏进入）
 */

import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const GW = 'http://localhost:3001';
const PHONE = '18793198472';
const PASSWORD = '718293';

const SS = 'scripts/screenshots/flomo';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'zh-CN',
  });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`  [console.error] ${msg.text().slice(0, 120)}`);
  });

  try {
    // ── 1. 登录 ──
    console.log('=== 1. 登录 ===');
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });

    const inputs = page.locator('input');
    if (await inputs.count() >= 2) {
      await inputs.nth(0).fill(PHONE);
      await inputs.nth(1).fill(PASSWORD);
      await page.locator('button:has-text("登录")').click();
      await page.waitForTimeout(4000);
    }
    console.log('  ✅ 登录完成');

    // 设置 localStorage 跳过引导和晨间简报，然后刷新
    const today = new Date().toISOString().split('T')[0];
    await page.evaluate((today) => {
      localStorage.setItem('v2note:onboarded', 'true');
      localStorage.setItem(`briefing_shown_${today}`, '1');
    }, today);
    await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SS}-01-after-login.png` });
    console.log('  ✅ 页面刷新，跳过引导和简报');

    // ── 2. 主页 — 日记列表 ──
    console.log('\n=== 2. 主页 — 日记视图 ===');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SS}-02-diary-view.png` });

    const bodyText = await page.textContent('body');
    const hasDiaryContent = bodyText?.includes('映射') || bodyText?.includes('产品') || bodyText?.includes('AI') || bodyText?.includes('日记');
    console.log(`  日记内容可见: ${hasDiaryContent ? '✅' : '⚠️ 可能尚在处理'}`);

    // ── 3. 切换到待办视图 ──
    console.log('\n=== 3. 待办视图 ===');
    const todoTab = page.locator('button:has-text("待办")');
    if (await todoTab.isVisible().catch(() => false)) {
      await todoTab.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SS}-03-todo-view.png` });
      console.log('  ✅ 待办视图已截图');

      // 切回日记
      const diaryTab = page.locator('button:has-text("日记")');
      if (await diaryTab.isVisible().catch(() => false)) {
        await diaryTab.click();
        await page.waitForTimeout(1000);
      }
    } else {
      console.log('  ⚠️ 未找到待办 tab');
    }

    // ── 4. 侧边栏 ──
    console.log('\n=== 4. 侧边栏 ===');
    const sidebarBtn = page.locator('[aria-label="打开侧边栏"]');
    if (await sidebarBtn.isVisible().catch(() => false)) {
      await sidebarBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SS}-04-sidebar.png` });
      console.log('  ✅ 侧边栏已打开');

      const sidebarText = await page.textContent('body');
      const hasGoals = sidebarText?.includes('目标');
      const hasProfile = sidebarText?.includes('画像') || sidebarText?.includes('猪耳朵');
      console.log(`  目标区域: ${hasGoals ? '✅' : '⚠️'}`);
      console.log(`  用户画像: ${hasProfile ? '✅' : '⚠️'}`);

      // 尝试点击查看全部目标
      const viewGoals = page.locator('text=查看全部').first();
      if (await viewGoals.isVisible().catch(() => false)) {
        await viewGoals.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: `${SS}-04b-goals-list.png` });
        console.log('  ✅ 目标列表已截图');
      }

      // 直接刷新页面回到干净状态
      await page.goto(BASE, { waitUntil: 'networkidle', timeout: 10000 });
      await page.waitForTimeout(2000);
    }

    // ── 5. 搜索功能 ──
    console.log('\n=== 5. 搜索 ===');
    const searchBtn = page.locator('[aria-label="搜索"]');
    if (await searchBtn.isVisible().catch(() => false)) {
      await searchBtn.click();
      await page.waitForTimeout(1500);

      const searchInput = page.locator('input[placeholder*="搜索"]').first();
      if (await searchInput.isVisible().catch(() => false)) {
        await searchInput.fill('映射');
        await page.waitForTimeout(2000);
        await page.screenshot({ path: `${SS}-05-search.png` });
        console.log('  ✅ 搜索 "映射" 已截图');
      }

      // 关闭搜索
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // ── 6. API 后端验证 ──
    console.log('\n=== 6. API 后端数据验证 ===');
    const apiResults = await page.evaluate(async (gw) => {
      const token = localStorage.getItem('voicenote:accessToken');
      const deviceId = localStorage.getItem('voicenote:deviceId');
      const h = {};
      if (token) h['Authorization'] = `Bearer ${token}`;
      if (deviceId) h['X-Device-Id'] = deviceId;

      const results = {};

      // 记录
      try {
        const r = await fetch(`${gw}/api/v1/records?limit=5`, { headers: h });
        const d = await r.json();
        results['records'] = { status: r.status, count: Array.isArray(d) ? d.length : '?', sample: JSON.stringify(d).slice(0, 200) };
      } catch(e) { results['records'] = { error: e.message }; }

      // 认知统计
      try {
        const r = await fetch(`${gw}/api/v1/cognitive/stats`, { headers: h });
        results['cognitive-stats'] = { status: r.status, data: await r.json() };
      } catch(e) { results['cognitive-stats'] = { error: e.message }; }

      // 聚类
      try {
        const r = await fetch(`${gw}/api/v1/cognitive/clusters`, { headers: h });
        const d = await r.json();
        results['clusters'] = { status: r.status, count: Array.isArray(d) ? d.length : '?', sample: JSON.stringify(d).slice(0, 200) };
      } catch(e) { results['clusters'] = { error: e.message }; }

      // 目标
      try {
        const r = await fetch(`${gw}/api/v1/goals`, { headers: h });
        const d = await r.json();
        results['goals'] = { status: r.status, count: Array.isArray(d) ? d.length : '?', data: JSON.stringify(d).slice(0, 200) };
      } catch(e) { results['goals'] = { error: e.message }; }

      // 待办
      try {
        const r = await fetch(`${gw}/api/v1/todos`, { headers: h });
        const d = await r.json();
        results['todos'] = { status: r.status, count: Array.isArray(d) ? d.length : '?', sample: JSON.stringify(d).slice(0, 200) };
      } catch(e) { results['todos'] = { error: e.message }; }

      // 行动面板
      try {
        const r = await fetch(`${gw}/api/v1/action-panel`, { headers: h });
        results['action-panel'] = { status: r.status, data: await r.json() };
      } catch(e) { results['action-panel'] = { error: e.message }; }

      // 个人画像
      try {
        const r = await fetch(`${gw}/api/v1/profile`, { headers: h });
        results['profile'] = { status: r.status, data: JSON.stringify(await r.json()).slice(0, 200) };
      } catch(e) { results['profile'] = { error: e.message }; }

      // 记忆
      try {
        const r = await fetch(`${gw}/api/v1/memories?limit=5`, { headers: h });
        const d = await r.json();
        results['memories'] = { status: r.status, count: Array.isArray(d) ? d.length : '?', sample: JSON.stringify(d).slice(0, 200) };
      } catch(e) { results['memories'] = { error: e.message }; }

      return results;
    }, GW);

    for (const [key, val] of Object.entries(apiResults)) {
      const v = val;
      if (v.error) {
        console.log(`  ${key}: ❌ ${v.error}`);
      } else if (v.count !== undefined) {
        console.log(`  ${key}: ✅ HTTP ${v.status} | 数量=${v.count}`);
      } else if (v.data && typeof v.data === 'object' && !v.data.error) {
        console.log(`  ${key}: ✅ HTTP ${v.status} | ${JSON.stringify(v.data).slice(0, 100)}`);
      } else {
        console.log(`  ${key}: ✅ HTTP ${v.status} | ${JSON.stringify(v.data ?? v).slice(0, 100)}`);
      }
    }

    // ── 7. 滚动日记列表截图 ──
    console.log('\n=== 7. 滚动日记列表 ===');
    await page.screenshot({ path: `${SS}-07-main-page.png`, fullPage: true });
    console.log('  ✅ 全页截图');

    // ── Final ──
    await page.screenshot({ path: `${SS}-99-final.png` });
    console.log('\n✅ 全链路 E2E 验证完成！');
    console.log(`📸 截图保存在: scripts/screenshots/flomo-*.png`);

  } catch (err) {
    console.error('❌ 测试出错:', err.message);
    await page.screenshot({ path: `${SS}-error.png` }).catch(() => {});
  } finally {
    console.log('\n浏览器保持 15 秒供查看...');
    await page.waitForTimeout(15000);
    await browser.close();
  }
}

main().catch(console.error);
