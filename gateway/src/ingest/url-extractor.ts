import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

const MAX_CONTENT_LENGTH = 5000;
const FETCH_TIMEOUT_MS = 10_000;

export async function extractUrl(url: string): Promise<{
  title: string;
  content: string;
  image?: string;
}> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; V2NoteBot/1.0; +https://v2note.app)",
      },
    });
    clearTimeout(timer);

    const html = await response.text();
    const dom = new JSDOM(html, { url });

    // Extract og:image before Readability modifies the DOM
    const ogImage = dom.window.document
      .querySelector('meta[property="og:image"]')
      ?.getAttribute("content") ?? undefined;

    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      return { title: url, content: "[内容无法提取]" };
    }

    const content = (article.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_CONTENT_LENGTH);

    return {
      title: article.title || url,
      content,
      image: ogImage,
    };
  } catch {
    return { title: url, content: "[内容无法提取]" };
  }
}
