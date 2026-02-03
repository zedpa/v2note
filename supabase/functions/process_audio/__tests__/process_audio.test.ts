import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { processAudio } from "../index.ts";

Deno.test("processAudio returns structured fields", async () => {
  const deps = {
    env: {
      ASR_URL: "https://asr.example",
      ASR_API_KEY: "asr",
      OPENAI_URL: "https://openai.example",
      OPENAI_API_KEY: "openai",
    },
    fetch: async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("asr")) {
        return new Response(JSON.stringify({ transcript: "hello" }), { status: 200 });
      }
      if (url.includes("openai")) {
        return new Response(
          JSON.stringify({
            summary: "sum",
            tags: ["work"],
            todos: ["do"],
            ideas: ["idea"],
          }),
          { status: 200 },
        );
      }
      return new Response("", { status: 404 });
    },
  };

  const result = await processAudio({ audio_url: "https://audio" }, deps);
  assertEquals(result.transcript, "hello");
  assertEquals(result.summary, "sum");
  assertEquals(result.tags, ["work"]);
  assertEquals(result.todos, ["do"]);
  assertEquals(result.ideas, ["idea"]);
});
