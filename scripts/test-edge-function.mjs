/**
 * Edge Function 测试脚本
 * 用法: node scripts/test-edge-function.mjs
 *
 * 逐步测试：
 * 1. 函数是否可达
 * 2. 请求体验证
 * 3. 环境变量是否配置
 * 4. 完整流程（需要真实 record_id + audio_url）
 */

const SUPABASE_URL = "https://vzzuyrwduadvhoxxzokn.supabase.co";
const ANON_KEY = "sb_publishable_-YX-r7iAw_dgqcgqZtbC_w_NV5sMmS6";

const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

async function callFunction(name, body) {
  const url = `${FUNCTIONS_URL}/${name}`;
  console.log(`\n>>> POST ${url}`);
  console.log(`    Body: ${JSON.stringify(body)}`);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ANON_KEY}`,
        apikey: ANON_KEY,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    console.log(`    Status: ${res.status} ${res.statusText}`);
    console.log(`    Response: ${json ? JSON.stringify(json, null, 2) : text}`);
    return { status: res.status, body: json ?? text };
  } catch (err) {
    console.log(`    Error: ${err.message}`);
    return { status: 0, body: err.message };
  }
}

async function testOptionsRequest(name) {
  const url = `${FUNCTIONS_URL}/${name}`;
  console.log(`\n>>> OPTIONS ${url} (CORS preflight)`);

  try {
    const res = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: "https://localhost",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,authorization,apikey",
      },
    });

    console.log(`    Status: ${res.status}`);
    console.log(
      `    Access-Control-Allow-Origin: ${res.headers.get("access-control-allow-origin") ?? "(missing)"}`
    );
    console.log(
      `    Access-Control-Allow-Headers: ${res.headers.get("access-control-allow-headers") ?? "(missing)"}`
    );
    return res.status;
  } catch (err) {
    console.log(`    Error: ${err.message}`);
    return 0;
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("Edge Function 测试");
  console.log("=".repeat(60));

  // ---- Test 1: CORS preflight ----
  console.log("\n--- Test 1: CORS preflight ---");
  const corsStatus = await testOptionsRequest("process_audio");
  if (corsStatus === 200) {
    console.log("    ✅ CORS preflight OK");
  } else {
    console.log("    ❌ CORS preflight failed");
  }

  // ---- Test 2: Empty body (should return 400) ----
  console.log("\n--- Test 2: 空请求体 (应返回 400) ---");
  const t2 = await callFunction("process_audio", {});
  if (t2.status === 400) {
    console.log("    ✅ 参数验证正常");
  } else if (t2.status === 500) {
    console.log("    ⚠️  返回500，可能是环境变量未配置或数据库表不存在");
  } else {
    console.log(`    ❓ 非预期状态码: ${t2.status}`);
  }

  // ---- Test 3: Missing audio_url ----
  console.log("\n--- Test 3: 缺少 audio_url ---");
  const t3 = await callFunction("process_audio", {
    record_id: "test-123",
  });
  if (t3.status === 400) {
    console.log("    ✅ audio_url 验证正常");
  } else {
    console.log(`    ❓ 状态码: ${t3.status}`);
  }

  // ---- Test 4: Fake payload (tests env vars) ----
  console.log("\n--- Test 4: 完整参数但假数据 (测试环境变量) ---");
  const t4 = await callFunction("process_audio", {
    record_id: "00000000-0000-0000-0000-000000000000",
    audio_url: "https://example.com/test.m4a",
  });
  if (t4.status === 500 && t4.body?.error) {
    const err = t4.body.error;
    if (err.includes("Missing ASR/OpenAI configuration")) {
      console.log("    ❌ 环境变量未配置！请在 Supabase Dashboard 设置 Secrets:");
      console.log("       ASR_URL = https://dashscope.aliyuncs.com");
      console.log("       ASR_API_KEY = <你的 DashScope API Key>");
      console.log("       OPENAI_URL = https://dashscope.aliyuncs.com/compatible-mode/v1");
      console.log("       OPENAI_API_KEY = <你的 DashScope API Key>");
    } else if (err.includes("ASR submit failed")) {
      console.log("    ✅ 环境变量已配置，ASR 请求已发出（假URL导致失败是正常的）");
      console.log(`       ASR错误: ${err}`);
    } else {
      console.log(`    ⚠️  其他错误: ${err}`);
    }
  } else if (t4.status === 200) {
    console.log("    ✅ 函数执行成功（不太可能，因为是假数据）");
  } else {
    console.log(`    ❓ 非预期响应`);
  }

  // ---- Test 5: Database connectivity ----
  console.log("\n--- Test 5: 数据库连通性 ---");
  try {
    const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/device?select=id&limit=1`, {
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
        apikey: ANON_KEY,
      },
    });
    const dbStatus = dbRes.status;
    const dbBody = await dbRes.text();
    console.log(`    Status: ${dbStatus}`);
    if (dbStatus === 200) {
      console.log("    ✅ 数据库表存在且可访问");
    } else if (dbStatus === 404) {
      console.log("    ❌ device 表不存在，请运行: pnpm supabase db push");
    } else {
      console.log(`    ⚠️  ${dbBody}`);
    }
  } catch (err) {
    console.log(`    ❌ 无法连接数据库: ${err.message}`);
  }

  // ---- Test 6: Storage bucket ----
  console.log("\n--- Test 6: Storage bucket ---");
  try {
    const bucketRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket/audio-recordings`, {
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
        apikey: ANON_KEY,
      },
    });
    const bucketStatus = bucketRes.status;
    if (bucketStatus === 200) {
      console.log("    ✅ audio-recordings bucket 存在");
    } else {
      const bucketBody = await bucketRes.text();
      console.log(`    ❌ bucket 不存在或无权限 (${bucketStatus}): ${bucketBody}`);
    }
  } catch (err) {
    console.log(`    ❌ 无法检查 bucket: ${err.message}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("测试完成");
  console.log("=".repeat(60));
}

main();
