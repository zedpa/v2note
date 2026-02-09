import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { processAudio } from "../index.ts";

Deno.test("processAudio returns structured fields via DashScope + OpenAI", async () => {
  let pollCount = 0;

  const deps = {
    env: {
      ASR_URL: "https://dashscope.example",
      ASR_API_KEY: "asr-key",
      OPENAI_URL: "https://openai.example",
      OPENAI_API_KEY: "openai-key",
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
    },
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      // ASR submit
      if (url.includes("/transcription") && init?.method === "POST") {
        return new Response(
          JSON.stringify({ output: { task_id: "task-123" } }),
          { status: 200 },
        );
      }

      // ASR poll
      if (url.includes("/tasks/task-123")) {
        pollCount++;
        return new Response(
          JSON.stringify({
            output: {
              task_status: "SUCCEEDED",
              results: [
                {
                  transcription_result: {
                    sentences: [{ text: "hello world" }],
                  },
                },
              ],
            },
          }),
          { status: 200 },
        );
      }

      // OpenAI chat completions
      if (url.includes("/chat/completions")) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: "Test Title",
                    summary: "sum",
                    tags: ["work"],
                    todos: ["do"],
                    ideas: ["idea"],
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response("", { status: 404 });
    },
  };

  const result = await processAudio(
    { audio_url: "https://audio.example/test.m4a", record_id: "rec-123" },
    deps,
  );

  assertEquals(result.transcript, "hello world");
  assertEquals(result.title, "Test Title");
  assertEquals(result.summary, "sum");
  assertEquals(result.tags, ["work"]);
  assertEquals(result.todos, ["do"]);
  assertEquals(result.ideas, ["idea"]);
  assertEquals(pollCount, 1);
});
