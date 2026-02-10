import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export type ProcessAudioPayload = {
  audio_url?: string;
  record_id: string;
  language?: string;
  text?: string; // If provided, skip ASR and use this text directly
};

export type ProcessAudioResult = {
  transcript: string;
  title: string;
  summary: string;
  tags: string[];
  todos: string[];
  ideas: string[];
};

type Env = {
  ASR_URL: string;
  ASR_API_KEY: string;
  OPENAI_URL: string;
  OPENAI_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Deps = {
  fetch: typeof fetch;
  env: Env;
};

const defaultEnv = (): Env => {
  const get = (key: keyof Env) => Deno.env.get(key) ?? "";
  return {
    ASR_URL: get("ASR_URL"),
    ASR_API_KEY: get("ASR_API_KEY"),
    OPENAI_URL: get("OPENAI_URL"),
    OPENAI_API_KEY: get("OPENAI_API_KEY"),
    SUPABASE_URL: get("SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: get("SUPABASE_SERVICE_ROLE_KEY"),
  };
};

const validateEnv = (env: Env) => {
  if (!env.ASR_URL || !env.ASR_API_KEY || !env.OPENAI_URL || !env.OPENAI_API_KEY) {
    throw new Error("Missing ASR/OpenAI configuration");
  }
};

// DashScope ASR: submit transcription task
const submitAsrTask = async (audioUrl: string, language: string | undefined, deps: Deps) => {
  const body: Record<string, unknown> = {
    model: "paraformer-v2",
    input: {
      file_urls: [audioUrl],
    },
    parameters: {
      language_hints: language ? [language] : ["zh", "en"],
    },
  };

  const res = await deps.fetch(`${deps.env.ASR_URL}/api/v1/services/audio/asr/transcription`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${deps.env.ASR_API_KEY}`,
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ASR submit failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  const taskId = json.output?.task_id;
  if (!taskId) {
    throw new Error("ASR submit did not return task_id");
  }
  return taskId as string;
};

// DashScope ASR: poll for result
const pollAsrResult = async (taskId: string, deps: Deps): Promise<string> => {
  const maxAttempts = 60;
  const pollInterval = 3000;

  for (let i = 0; i < maxAttempts; i++) {
    const res = await deps.fetch(
      `${deps.env.ASR_URL}/api/v1/tasks/${taskId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${deps.env.ASR_API_KEY}`,
        },
      },
    );

    if (!res.ok) {
      throw new Error(`ASR poll failed (${res.status})`);
    }

    const json = await res.json();
    const status = json.output?.task_status;

    if (status === "SUCCEEDED") {
      // DashScope file transcription returns a transcription_url to download
      const results = json.output?.results;
      if (Array.isArray(results) && results.length > 0) {
        const transcriptionUrl = results[0]?.transcription_url;
        if (transcriptionUrl) {
          // Download the transcription result JSON
          const trRes = await deps.fetch(transcriptionUrl);
          if (!trRes.ok) {
            throw new Error(`Failed to download transcription result (${trRes.status})`);
          }
          const trJson = await trRes.json();
          // Parse transcripts array
          const transcripts = trJson.transcripts;
          if (Array.isArray(transcripts) && transcripts.length > 0) {
            // Try full text first, then join sentences
            if (transcripts[0]?.text) {
              return transcripts[0].text;
            }
            const sentences = transcripts[0]?.sentences;
            if (Array.isArray(sentences)) {
              return sentences.map((s: { text: string }) => s.text).join("");
            }
          }
        }
        // Fallback: try inline result (older API format)
        const inlineResult = results[0]?.transcription_result;
        if (inlineResult?.text) return inlineResult.text;
        if (Array.isArray(inlineResult?.sentences)) {
          return inlineResult.sentences.map((s: { text: string }) => s.text).join("");
        }
      }
      return "";
    }

    if (status === "FAILED") {
      throw new Error(`ASR task failed: ${json.output?.message ?? "unknown"}`);
    }

    // PENDING or RUNNING — wait and retry
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error("ASR polling timed out");
};

const callAsr = async (audioUrl: string, language: string | undefined, deps: Deps): Promise<string> => {
  const taskId = await submitAsrTask(audioUrl, language, deps);
  return await pollAsrResult(taskId, deps);
};

// Fetch existing tags for the device that owns this record
const fetchDeviceTags = async (recordId: string, deps: Deps): Promise<string[]> => {
  const baseUrl = deps.env.SUPABASE_URL;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${deps.env.SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: deps.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  // Get device_id from record
  const recRes = await deps.fetch(
    `${baseUrl}/rest/v1/record?id=eq.${recordId}&select=device_id`,
    { headers },
  );
  const recData = await recRes.json();
  const deviceId = Array.isArray(recData) ? recData[0]?.device_id : null;
  if (!deviceId) return [];

  // Get all record IDs for this device
  const recsRes = await deps.fetch(
    `${baseUrl}/rest/v1/record?device_id=eq.${deviceId}&select=id`,
    { headers },
  );
  const recsData = await recsRes.json();
  const recordIds: string[] = (Array.isArray(recsData) ? recsData : []).map((r: any) => r.id);
  if (recordIds.length === 0) return [];

  // Get unique tag names via record_tag + tag join
  const rtRes = await deps.fetch(
    `${baseUrl}/rest/v1/record_tag?record_id=in.(${recordIds.join(",")})&select=tag:tag_id(name)`,
    { headers },
  );
  const rtData = await rtRes.json();
  const tagNames = new Set<string>();
  for (const rt of (Array.isArray(rtData) ? rtData : [])) {
    const name = rt.tag?.name;
    if (name) tagNames.add(name);
  }
  return Array.from(tagNames);
};

const callOpenAi = async (transcript: string, existingTags: string[], deps: Deps): Promise<Omit<ProcessAudioResult, "transcript">> => {
  const tagsHint = existingTags.length > 0
    ? `\n- 优先从用户已有标签中选择：[${existingTags.join("、")}]`
    : "";

  const systemPrompt = `你是一个语音笔记助手。分析用户的语音转录文本，提取结构化信息。
请返回 JSON 格式（不要包含 markdown 代码块标记）：
{
  "title": "简短标题（10字以内）",
  "summary": "内容摘要（50-100字）",
  "tags": ["标签1", "标签2"],
  "todos": ["待办事项1", "待办事项2"],
  "ideas": ["想法或灵感1"]
}

规则：
- title: 概括核心内容的简短标题
- summary: 简洁概括语音内容
- tags: 1-3个概括性分类标签，使用中文
- 标签应为宏观分类（如"工作"、"学习"、"生活"、"健康"、"理财"），而非具体事件描述${tagsHint}
- 仅当内容明确不属于任何已有标签时，才创建新标签
- todos: 提取文本中提到的任何待办/行动事项，没有则为空数组
- ideas: 仅提取真正有创意、有启发性的想法或灵感
- 日常事务记录（如买菜、开会、通勤等流水账）不需要生成灵感，返回空数组
- 只有当内容包含独特见解、创新思路、值得深入思考的观点时，才提取为灵感`;

  const res = await deps.fetch(`${deps.env.OPENAI_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${deps.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "qwen-plus",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: transcript },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI request failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content ?? "{}";

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Failed to parse OpenAI response as JSON: ${content}`);
  }

  return {
    title: String(parsed.title ?? ""),
    summary: String(parsed.summary ?? ""),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
    todos: Array.isArray(parsed.todos) ? parsed.todos.map(String) : [],
    ideas: Array.isArray(parsed.ideas) ? parsed.ideas.map(String) : [],
  };
};

// Write results to database via Supabase REST API
const writeToDatabase = async (
  recordId: string,
  result: ProcessAudioResult,
  deps: Deps,
) => {
  const baseUrl = deps.env.SUPABASE_URL;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${deps.env.SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: deps.env.SUPABASE_SERVICE_ROLE_KEY,
    Prefer: "return=minimal",
  };

  // 1. Insert transcript
  await deps.fetch(`${baseUrl}/rest/v1/transcript`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      record_id: recordId,
      text: result.transcript,
    }),
  });

  // 2. Insert summary
  await deps.fetch(`${baseUrl}/rest/v1/summary`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      record_id: recordId,
      title: result.title,
      short_summary: result.summary,
      long_summary: result.summary,
    }),
  });

  // 3. Insert tags + record_tag
  for (const tagName of result.tags) {
    // Upsert tag
    const tagRes = await deps.fetch(
      `${baseUrl}/rest/v1/tag?on_conflict=name`,
      {
        method: "POST",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify({ name: tagName }),
      },
    );
    const tagData = await tagRes.json();
    const tagId = Array.isArray(tagData) ? tagData[0]?.id : tagData?.id;
    if (tagId) {
      await deps.fetch(`${baseUrl}/rest/v1/record_tag`, {
        method: "POST",
        headers,
        body: JSON.stringify({ record_id: recordId, tag_id: tagId }),
      });
    }
  }

  // 4. Insert todos
  if (result.todos.length > 0) {
    await deps.fetch(`${baseUrl}/rest/v1/todo`, {
      method: "POST",
      headers,
      body: JSON.stringify(
        result.todos.map((text) => ({ record_id: recordId, text, done: false })),
      ),
    });
  }

  // 5. Insert ideas
  if (result.ideas.length > 0) {
    await deps.fetch(`${baseUrl}/rest/v1/idea`, {
      method: "POST",
      headers,
      body: JSON.stringify(
        result.ideas.map((text) => ({ record_id: recordId, text })),
      ),
    });
  }

  // 6. Update record status to completed
  await deps.fetch(
    `${baseUrl}/rest/v1/record?id=eq.${recordId}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: "completed", updated_at: new Date().toISOString() }),
    },
  );
};

export const processAudio = async (
  payload: ProcessAudioPayload,
  deps: Deps,
): Promise<ProcessAudioResult> => {
  if (!payload.audio_url && !payload.text) {
    throw new Error("audio_url or text is required");
  }
  if (!payload.record_id) {
    throw new Error("record_id is required");
  }
  validateEnv(deps.env);

  // Update status to processing
  if (deps.env.SUPABASE_URL && deps.env.SUPABASE_SERVICE_ROLE_KEY) {
    await deps.fetch(
      `${deps.env.SUPABASE_URL}/rest/v1/record?id=eq.${payload.record_id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${deps.env.SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: deps.env.SUPABASE_SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({ status: "processing" }),
      },
    );
  }

  // Use provided text or run ASR
  const transcript = payload.text
    ? payload.text
    : await callAsr(payload.audio_url!, payload.language, deps);

  // Fetch existing tags for this device to encourage reuse
  let existingTags: string[] = [];
  if (deps.env.SUPABASE_URL && deps.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      existingTags = await fetchDeviceTags(payload.record_id, deps);
    } catch {
      // Non-critical: proceed without existing tags
    }
  }

  const analysis = await callOpenAi(transcript, existingTags, deps);

  const result: ProcessAudioResult = {
    transcript,
    ...analysis,
  };

  // Write to database
  if (deps.env.SUPABASE_URL && deps.env.SUPABASE_SERVICE_ROLE_KEY) {
    await writeToDatabase(payload.record_id, result, deps);
  }

  return result;
};

export const handler = async (req: Request, deps: Deps) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as ProcessAudioPayload;
    const result = await processAudio(body, deps);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message.includes("required") ? 400 : 500;

    // Try to mark record as failed
    try {
      const body = await req.clone().json();
      if (body.record_id && deps.env.SUPABASE_URL) {
        await deps.fetch(
          `${deps.env.SUPABASE_URL}/rest/v1/record?id=eq.${body.record_id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${deps.env.SUPABASE_SERVICE_ROLE_KEY}`,
              apikey: deps.env.SUPABASE_SERVICE_ROLE_KEY,
            },
            body: JSON.stringify({ status: "failed", updated_at: new Date().toISOString() }),
          },
        );
      }
    } catch {
      // ignore cleanup errors
    }

    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve((req) => handler(req, { fetch, env: defaultEnv() }));
