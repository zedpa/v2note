import { chatCompletion } from "../ai/provider.js";
import { loadSoul } from "../soul/manager.js";
import { loadMemory } from "../memory/long-term.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let _reflectPrompt: string | null = null;

function loadReflectSkillPrompt(): string {
  if (!_reflectPrompt) {
    try {
      const raw = readFileSync(
        join(__dirname, "../../insights/reflect/SKILL.md"),
        "utf-8",
      );
      // Strip YAML frontmatter
      const match = raw.match(/^---[\s\S]*?---\s*\n([\s\S]*)$/);
      _reflectPrompt = match ? match[1].trim() : raw;
    } catch {
      _reflectPrompt = '你是一个温暖的AI陪伴者。根据用户的日记内容，生成一个苏格拉底式的反思问题。15-30字，以"你"开头。如果内容不值得追问，输出 SKIP。';
    }
  }
  return _reflectPrompt;
}

/**
 * Generate a Socratic reflection question based on user's diary entry.
 * Returns null if the content doesn't warrant a follow-up.
 */
export async function generateReflection(
  text: string,
  userId: string,
): Promise<string | null> {
  // Skip very short entries
  if (text.trim().length < 10) return null;

  const skillPrompt = loadReflectSkillPrompt();

  // Load recent memories for pattern detection
  let memoryContext = "";
  try {
    const memories = await loadMemory(userId, undefined, userId);
    if (memories.length > 0) {
      memoryContext = memories
        .slice(0, 5)
        .map((m) => m.content)
        .join("\n");
    }
  } catch {
    // Memory loading is optional
  }

  const messages = [
    { role: "system" as const, content: skillPrompt },
    {
      role: "user" as const,
      content: `日记内容：\n${text}${memoryContext ? `\n\n相关记忆：\n${memoryContext}` : ""}`,
    },
  ];

  try {
    const response = await chatCompletion(messages, {
      temperature: 0.7,
      timeout: 30000,
      tier: "fast",
    });
    const question = response.content.trim();

    // Filter invalid responses
    if (!question || question === "SKIP" || question.includes("SKIP")) {
      return null;
    }
    if (question.length < 5 || question.length > 100) return null;

    return question;
  } catch (err: any) {
    console.warn("[reflect] Generation failed:", err.message);
    return null;
  }
}

/**
 * Generate a personalized AI status message based on soul.
 */
export async function generateAiStatus(
  userId: string,
  _userId2?: string,
): Promise<string> {
  try {
    const soul = await loadSoul(userId, userId);

    if (soul?.content) {
      const response = await chatCompletion(
        [
          {
            role: "system",
            content: `你是用户定义的AI助手。以下是你的人设：\n${soul.content}\n\n请用一句话（10-20字）描述你现在的状态，要符合你的人设，轻松俏皮。只输出这句话，不要其他内容。`,
          },
          { role: "user", content: "你现在在干嘛？" },
        ],
        { temperature: 0.9, timeout: 15000, tier: "fast" },
      );
      const status = response.content.trim();
      if (status && status.length >= 3 && status.length <= 40) {
        return status;
      }
    }
  } catch (err: any) {
    console.warn("[reflect] Status generation failed:", err.message);
  }

  // Default status pool
  const defaults = [
    "AI 正在等你说话…",
    "有什么想聊的吗？",
    "随时准备好了",
    "在这里陪着你",
  ];
  return defaults[Math.floor(Math.random() * defaults.length)];
}
