/**
 * Test script for debugging edge function errors.
 * Run: node test-edge-function.mjs
 */

const SUPABASE_URL = "https://vzzuyrwduadvhoxxzokn.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6enV5cndkdWFkdmhveHh6b2tuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzOTk4OTEsImV4cCI6MjA4NTk3NTg5MX0.vL-dP_5nT_2inVoQnVKYiBnToswrcImroK03L3vJJM4";

// ── Step 1: Test basic connectivity ──

async function testConnectivity() {
  console.log("=== Step 1: Test Supabase connectivity ===");
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/device?select=id&limit=1`, {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
    });
    console.log(`  Status: ${res.status}`);
    const data = await res.json();
    console.log(`  Response:`, JSON.stringify(data).slice(0, 200));
    return res.ok;
  } catch (err) {
    console.error(`  Error:`, err.message);
    return false;
  }
}

// ── Step 2: Check if edge function is deployed ──

async function testEdgeFunctionDeployed() {
  console.log("\n=== Step 2: Test edge function reachable (OPTIONS) ===");
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/process_audio`, {
      method: "OPTIONS",
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
      },
    });
    console.log(`  Status: ${res.status}`);
    const text = await res.text();
    console.log(`  Response: ${text.slice(0, 200)}`);
    return res.ok;
  } catch (err) {
    console.error(`  Error:`, err.message);
    return false;
  }
}

// ── Step 3: Invoke edge function with minimal payload (expect validation error) ──

async function testEdgeFunctionValidation() {
  console.log("\n=== Step 3: Invoke process_audio with empty body (expect 400) ===");
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/process_audio`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ANON_KEY}`,
        apikey: ANON_KEY,
      },
      body: JSON.stringify({}),
    });
    console.log(`  Status: ${res.status}`);
    const text = await res.text();
    console.log(`  Response: ${text.slice(0, 500)}`);
    return true; // We just want to see the response
  } catch (err) {
    console.error(`  Error:`, err.message);
    return false;
  }
}

// ── Step 4: Invoke with text (skip ASR) to isolate OpenAI step ──

async function testWithText() {
  console.log("\n=== Step 4: Invoke with text (skip ASR) ===");

  // First, create a test record
  console.log("  Creating test record...");
  const createRes = await fetch(`${SUPABASE_URL}/rest/v1/device?select=id&limit=1`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
  });
  const devices = await createRes.json();
  if (!devices || devices.length === 0) {
    console.log("  No device found, skipping this test");
    return false;
  }
  const deviceId = devices[0].id;
  console.log(`  Using device: ${deviceId}`);

  // Create a test record
  const recordRes = await fetch(`${SUPABASE_URL}/rest/v1/record`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      device_id: deviceId,
      status: "uploaded",
      source: "manual",
      duration_seconds: 0,
    }),
  });

  console.log(`  Create record status: ${recordRes.status}`);
  const recordText = await recordRes.text();
  console.log(`  Create record response: ${recordText.slice(0, 300)}`);

  let recordId;
  try {
    const records = JSON.parse(recordText);
    recordId = Array.isArray(records) ? records[0]?.id : records?.id;
  } catch {
    console.log("  Failed to parse record response");
    return false;
  }

  if (!recordId) {
    console.log("  No record ID returned");
    return false;
  }
  console.log(`  Test record ID: ${recordId}`);

  // Call edge function with text (skip ASR)
  console.log("  Invoking process_audio with text...");
  const fnRes = await fetch(`${SUPABASE_URL}/functions/v1/process_audio`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON_KEY}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify({
      record_id: recordId,
      text: "今天开了一个产品会议，讨论了新版本的发布计划。需要明天跟客户确认需求细节。",
      user_type: null,
      available_tags: ["工作", "会议", "待办"],
    }),
  });

  console.log(`  Edge function status: ${fnRes.status}`);
  const fnHeaders = Object.fromEntries(fnRes.headers.entries());
  console.log(`  Response headers:`, JSON.stringify(fnHeaders, null, 2));
  const fnText = await fnRes.text();
  console.log(`  Response body: ${fnText.slice(0, 1000)}`);

  // Clean up test record if it failed
  if (!fnRes.ok) {
    console.log("\n  Cleaning up test record...");
    await fetch(`${SUPABASE_URL}/rest/v1/record?id=eq.${recordId}`, {
      method: "DELETE",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
    });
    console.log("  Test record deleted");
  } else {
    console.log("\n  SUCCESS! Edge function works with text input.");
    console.log("  Test record kept (status should be 'completed')");
  }

  return fnRes.ok;
}

// ── Step 5: Test generate_review edge function ──

async function testGenerateReview() {
  console.log("\n=== Step 5: Test generate_review edge function ===");
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate_review`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ANON_KEY}`,
        apikey: ANON_KEY,
      },
      body: JSON.stringify({}),
    });
    console.log(`  Status: ${res.status}`);
    const text = await res.text();
    console.log(`  Response: ${text.slice(0, 500)}`);
  } catch (err) {
    console.error(`  Error:`, err.message);
  }
}

// ── Run all tests ──

async function main() {
  console.log("Edge Function Diagnostics\n");

  await testConnectivity();
  await testEdgeFunctionDeployed();
  await testEdgeFunctionValidation();
  await testWithText();
  await testGenerateReview();

  console.log("\n=== Done ===");
}

main().catch(console.error);
