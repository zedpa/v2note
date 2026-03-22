/**
 * Vision LLM — image description via DashScope multimodal API.
 */

import { getProvider } from "./provider.js";
import { generateText } from "ai";

const SYSTEM_PROMPT =
  "描述这张图片的内容。如果是文字截图，提取所有文字。如果是白板/笔记，提取要点。如果是照片，描述场景和关键信息。用中文回复。";

const FALLBACK = "[图片内容无法识别]";

/**
 * Describe an image using a vision-capable LLM.
 * @param imageUrl - HTTP URL or data URL of the image
 */
export async function describeImage(imageUrl: string): Promise<string> {
  try {
    const { provider } = getProvider();
    const model = process.env.VISION_MODEL ?? "qwen-vl-max";

    const result = await generateText({
      model: provider.chat(model),
      messages: [
        {
          role: "user",
          content: [
            { type: "image", image: new URL(imageUrl) },
            { type: "text", text: SYSTEM_PROMPT },
          ],
        },
      ],
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(30_000),
    });

    return result.text || FALLBACK;
  } catch (err) {
    console.error("[vision] describeImage failed:", err);
    return FALLBACK;
  }
}
