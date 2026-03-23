import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

const MAX_OUTPUT = 10_000;

const ALLOWED_EXTENSIONS = new Set([
  "pdf", "docx", "xlsx", "xls", "txt", "md", "csv", "json", "log",
]);

export interface ParseResult {
  success: boolean;
  content: string;
  error?: string;
}

export async function parseFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<ParseResult> {
  try {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";

    // Validate extension against allowed list
    if (ext && !ALLOWED_EXTENSIONS.has(ext) && !mimeType.startsWith("text/")) {
      // Fall through to mimeType-based handling below
    }

    let text: string;

    if (mimeType === "application/pdf" || ext === "pdf") {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      text = result.text;
      await parser.destroy();
    } else if (
      mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      ext === "docx"
    ) {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (
      mimeType ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      ext === "xlsx" ||
      ext === "xls"
    ) {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const parts: string[] = [];
      for (const name of workbook.SheetNames) {
        const sheet = workbook.Sheets[name];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        parts.push(`--- ${name} ---\n${csv}`);
      }
      text = parts.join("\n\n");
    } else if (
      mimeType.startsWith("text/") ||
      ["txt", "md", "csv", "json", "log"].includes(ext)
    ) {
      text = buffer.toString("utf-8");
    } else {
      return {
        success: false,
        content: "",
        error: `不支持的文件格式: ${mimeType} (${ext})`,
      };
    }

    if (!text.trim()) {
      return { success: true, content: "", error: "文件内容为空" };
    }

    return { success: true, content: text.slice(0, MAX_OUTPUT) };
  } catch (err: any) {
    const message = err.message ?? String(err);
    console.error("[file-parser] parse failed:", message);
    return { success: false, content: "", error: `文件解析失败: ${message}` };
  }
}
