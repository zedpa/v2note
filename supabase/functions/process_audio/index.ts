import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

export type ProcessAudioPayload = {
  audio_url: string;
  language?: string;
};

export type ProcessAudioResult = {
  transcript: string;
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
  };
};

const validateEnv = (env: Env) => {
  if (!env.ASR_URL || !env.ASR_API_KEY || !env.OPENAI_URL || !env.OPENAI_API_KEY) {
    throw new Error("Missing ASR/OpenAI configuration");
  }
};

const callAsr = async (audioUrl: string, language: string | undefined, deps: Deps) => {
  const res = await deps.fetch(deps.env.ASR_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${deps.env.ASR_API_KEY}`,
    },
    body: JSON.stringify({ audio_url: audioUrl, language }),
  });
  if (!res.ok) {
    throw new Error("ASR request failed");
  }
  const json = await res.json();
  return String(json.transcript ?? "");
};

const callOpenAi = async (transcript: string, deps: Deps): Promise<ProcessAudioResult> => {
  const res = await deps.fetch(deps.env.OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${deps.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ transcript }),
  });
  if (!res.ok) {
    throw new Error("OpenAI request failed");
  }
  const json = await res.json();
  return {
    transcript,
    summary: String(json.summary ?? ""),
    tags: Array.isArray(json.tags) ? json.tags.map(String) : [],
    todos: Array.isArray(json.todos) ? json.todos.map(String) : [],
    ideas: Array.isArray(json.ideas) ? json.ideas.map(String) : [],
  };
};

export const processAudio = async (
  payload: ProcessAudioPayload,
  deps: Deps,
): Promise<ProcessAudioResult> => {
  if (!payload.audio_url) {
    throw new Error("audio_url is required");
  }
  validateEnv(deps.env);
  const transcript = await callAsr(payload.audio_url, payload.language, deps);
  return await callOpenAi(transcript, deps);
};

export const handler = async (req: Request, deps: Deps) => {
  try {
    const body = (await req.json()) as ProcessAudioPayload;
    const result = await processAudio(body, deps);
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message.includes("required") ? 400 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
};

serve((req) => handler(req, { fetch, env: defaultEnv() }));
