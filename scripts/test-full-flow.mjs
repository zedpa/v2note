/**
 * 端到端流程测试脚本
 * 用法: node scripts/test-full-flow.mjs
 *
 * 逐步检查:
 * 1. 查询数据库中已有的 record
 * 2. 为真实音频生成签名 URL
 * 3. 调用 process_audio edge function
 * 4. 检查数据库中的 transcript / summary / tag / todo / idea
 */

const SUPABASE_URL = "https://vzzuyrwduadvhoxxzokn.supabase.co";
const ANON_KEY = "sb_publishable_-YX-r7iAw_dgqcgqZtbC_w_NV5sMmS6";

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${ANON_KEY}`,
  apikey: ANON_KEY,
};

async function query(table, params = "") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers });
  return { status: res.status, data: await res.json() };
}

async function main() {
  console.log("=".repeat(60));
  console.log("端到端流程测试");
  console.log("=".repeat(60));

  // ---- Step 1: 查询所有 record ----
  console.log("\n--- Step 1: 查询 record 表 ---");
  const records = await query("record", "select=id,status,audio_path,duration_seconds,created_at&order=created_at.desc&limit=5");
  if (records.status !== 200 || !Array.isArray(records.data)) {
    console.log(`  ❌ 无法查询 record 表: ${JSON.stringify(records.data)}`);
    return;
  }
  if (records.data.length === 0) {
    console.log("  ❌ record 表为空，请先在真机上录一段音");
    return;
  }
  console.log(`  ✅ 找到 ${records.data.length} 条记录:`);
  records.data.forEach((r, i) => {
    console.log(`     [${i}] id=${r.id} status=${r.status} path=${r.audio_path} duration=${r.duration_seconds}s`);
  });

  // Pick the latest record
  const record = records.data[0];
  console.log(`\n  使用最新记录: ${record.id} (status: ${record.status})`);

  // ---- Step 2: 检查已有的处理结果 ----
  console.log("\n--- Step 2: 检查该记录的已有处理结果 ---");

  const transcript = await query("transcript", `record_id=eq.${record.id}&select=*`);
  console.log(`  transcript: ${transcript.data.length > 0 ? JSON.stringify(transcript.data[0]) : "❌ 无"}`);

  const summary = await query("summary", `record_id=eq.${record.id}&select=*`);
  console.log(`  summary: ${summary.data.length > 0 ? JSON.stringify(summary.data[0]) : "❌ 无"}`);

  const tags = await query("record_tag", `record_id=eq.${record.id}&select=tag_id,tag(name)`);
  console.log(`  tags: ${tags.data.length > 0 ? JSON.stringify(tags.data) : "❌ 无"}`);

  const todos = await query("todo", `record_id=eq.${record.id}&select=*`);
  console.log(`  todos: ${todos.data.length > 0 ? JSON.stringify(todos.data) : "❌ 无"}`);

  const ideas = await query("idea", `record_id=eq.${record.id}&select=*`);
  console.log(`  ideas: ${ideas.data.length > 0 ? JSON.stringify(ideas.data) : "❌ 无"}`);

  // ---- Step 3: 生成签名 URL ----
  console.log("\n--- Step 3: 为音频生成签名 URL ---");
  if (!record.audio_path) {
    console.log("  ❌ record 没有 audio_path");
    return;
  }

  const signRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/sign/audio-recordings/${record.audio_path}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ expiresIn: 3600 }),
    }
  );
  const signData = await signRes.json();

  if (!signData.signedURL) {
    console.log(`  ❌ 无法生成签名 URL: ${JSON.stringify(signData)}`);
    return;
  }

  const audioUrl = `${SUPABASE_URL}/storage/v1${signData.signedURL}`;
  console.log(`  ✅ 签名 URL: ${audioUrl.substring(0, 80)}...`);

  // Verify the URL is accessible
  try {
    const audioCheck = await fetch(audioUrl, { method: "HEAD" });
    console.log(`  音频文件状态: ${audioCheck.status} (Content-Type: ${audioCheck.headers.get("content-type")}, Size: ${audioCheck.headers.get("content-length")} bytes)`);
  } catch (e) {
    console.log(`  ⚠️  无法验证音频 URL: ${e.message}`);
  }

  // ---- Step 4: 调用 process_audio ----
  console.log("\n--- Step 4: 调用 process_audio Edge Function ---");
  console.log("  (这可能需要 30-60 秒，DashScope ASR 是异步的...)");

  const startTime = Date.now();
  try {
    const fnRes = await fetch(`${SUPABASE_URL}/functions/v1/process_audio`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        record_id: record.id,
        audio_url: audioUrl,
      }),
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const fnBody = await fnRes.text();
    let fnJson;
    try { fnJson = JSON.parse(fnBody); } catch { fnJson = null; }

    console.log(`  耗时: ${elapsed}s`);
    console.log(`  Status: ${fnRes.status}`);

    if (fnRes.status === 200 && fnJson) {
      console.log(`  ✅ 处理成功!`);
      console.log(`  transcript: ${fnJson.transcript?.substring(0, 100)}...`);
      console.log(`  title: ${fnJson.title}`);
      console.log(`  summary: ${fnJson.summary}`);
      console.log(`  tags: ${JSON.stringify(fnJson.tags)}`);
      console.log(`  todos: ${JSON.stringify(fnJson.todos)}`);
      console.log(`  ideas: ${JSON.stringify(fnJson.ideas)}`);
    } else {
      console.log(`  ❌ 处理失败: ${fnJson ? JSON.stringify(fnJson) : fnBody}`);
    }
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  ❌ 请求失败 (${elapsed}s): ${err.message}`);
  }

  // ---- Step 5: 再次检查数据库 ----
  console.log("\n--- Step 5: 再次检查数据库结果 ---");

  const record2 = await query("record", `id=eq.${record.id}&select=status`);
  console.log(`  record status: ${record2.data[0]?.status ?? "unknown"}`);

  const transcript2 = await query("transcript", `record_id=eq.${record.id}&select=text`);
  console.log(`  transcript: ${transcript2.data.length > 0 ? transcript2.data[0].text?.substring(0, 100) : "❌ 无"}`);

  const summary2 = await query("summary", `record_id=eq.${record.id}&select=title,short_summary`);
  console.log(`  summary: ${summary2.data.length > 0 ? JSON.stringify(summary2.data[0]) : "❌ 无"}`);

  const tags2 = await query("record_tag", `record_id=eq.${record.id}&select=tag_id,tag(name)`);
  console.log(`  tags: ${tags2.data.length > 0 ? JSON.stringify(tags2.data) : "❌ 无"}`);

  const todos2 = await query("todo", `record_id=eq.${record.id}&select=text,done`);
  console.log(`  todos: ${todos2.data.length > 0 ? JSON.stringify(todos2.data) : "❌ 无"}`);

  const ideas2 = await query("idea", `record_id=eq.${record.id}&select=text`);
  console.log(`  ideas: ${ideas2.data.length > 0 ? JSON.stringify(ideas2.data) : "❌ 无"}`);

  console.log("\n" + "=".repeat(60));
  console.log("测试完成");
  console.log("=".repeat(60));
}

main();
