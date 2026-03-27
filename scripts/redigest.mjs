/**
 * 补跑未 digest 的记录 + 手动触发认知循环
 *
 * 用法: node scripts/redigest.mjs
 *
 * 触发后台 redigest，轮询 stats 直到 Strike 数量稳定，
 * 然后触发认知循环（聚类+涌现）。
 */

const GW = process.env.GW_URL || "http://localhost:3001";
const PHONE = process.env.PHONE || "18793198472";
const PASSWORD = process.env.PASSWORD || "718293";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  // 1. 登录
  const devRes = await fetch(`${GW}/api/v1/devices/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "redigest-script", platform: "script" }),
  });
  const { id: deviceId } = await devRes.json();

  const loginRes = await fetch(`${GW}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: PHONE, password: PASSWORD, deviceId }),
  });
  const { accessToken, user } = await loginRes.json();
  console.log(`✅ 登录: userId=${user.id}`);
  const h = { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, "X-Device-Id": deviceId };

  // 2. 修复前统计
  const before = await fetch(`${GW}/api/v1/cognitive/stats`, { headers: h }).then(r => r.json());
  console.log(`\n📊 修复前: Strikes=${before.totalStrikes} Bonds=${before.totalBonds} Clusters=${before.totalClusters}`);
  console.log(`   极性: ${JSON.stringify(before.polarityDistribution)}`);

  // 3. 触发后台 redigest
  console.log(`\n🔄 触发后台 redigest...`);
  const redigestRes = await fetch(`${GW}/api/v1/cognitive/redigest`, { method: "POST", headers: h });
  const redigest = await redigestRes.json();
  console.log(`   ${redigest.message}`);

  if (redigest.remaining === 0) {
    console.log("   没有需要补跑的记录");
  } else {
    // 4. 轮询 stats 直到 Strike 数量稳定
    console.log(`\n⏳ 等待后台处理...\n`);
    let lastStrikes = before.totalStrikes;
    let stableCount = 0;
    for (let i = 0; i < 60; i++) { // 最多等 10 分钟
      await sleep(10000);
      const stats = await fetch(`${GW}/api/v1/cognitive/stats`, { headers: h }).then(r => r.json());
      const delta = stats.totalStrikes - lastStrikes;
      console.log(`   [${(i + 1) * 10}s] Strikes=${stats.totalStrikes} (+${delta}) Bonds=${stats.totalBonds} Clusters=${stats.totalClusters}`);

      if (delta === 0) {
        stableCount++;
        if (stableCount >= 3) {
          console.log("   ✅ Strike 数量稳定，digest 可能完成");
          break;
        }
      } else {
        stableCount = 0;
      }
      lastStrikes = stats.totalStrikes;
    }
  }

  // 5. 触发认知循环
  console.log(`\n🧠 触发认知循环 (聚类 + 涌现)...`);
  await fetch(`${GW}/api/v1/cognitive/cycle`, { method: "POST", headers: h });
  console.log("   已启动，等待处理...");

  // 等待认知循环完成
  await sleep(30000);

  // 6. 最终统计
  const after = await fetch(`${GW}/api/v1/cognitive/stats`, { headers: h }).then(r => r.json());
  const goals = await fetch(`${GW}/api/v1/goals`, { headers: h }).then(r => r.json());
  const clusters = await fetch(`${GW}/api/v1/cognitive/clusters`, { headers: h }).then(r => r.json());

  console.log(`\n📊 最终结果:`);
  console.log(`   Strikes: ${before.totalStrikes} → ${after.totalStrikes}`);
  console.log(`   Bonds:   ${before.totalBonds} → ${after.totalBonds}`);
  console.log(`   Clusters: ${before.totalClusters} → ${after.totalClusters}`);
  console.log(`   极性: ${JSON.stringify(after.polarityDistribution)}`);

  if (Array.isArray(clusters) && clusters.length > 0) {
    console.log(`\n🔮 聚类列表:`);
    clusters.forEach((c, i) => console.log(`   ${i + 1}. ${c.name} (${c.memberCount} 条记录)`));
  }

  console.log(`\n🎯 目标: ${Array.isArray(goals) ? goals.length : '?'} 个`);
  if (Array.isArray(goals) && goals.length > 0) {
    goals.forEach((g, i) => console.log(`   ${i + 1}. ${g.title} [${g.status}] source=${g.source}`));
  } else {
    console.log("   暂无涌现目标（需要更多 intend 类 Strike，当前 intend 占比可能不足 30%）");
  }

  console.log(`\n✅ 完成！`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
