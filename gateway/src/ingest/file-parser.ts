import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

const MAX_OUTPUT = 10_000;

export async function parseFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  try {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
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
      ext === "xlsx"
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
      ["txt", "md", "csv"].includes(ext)
    ) {
      text = buffer.toString("utf-8");
    } else {
      return `[不支持的文件格式: ${mimeType}]`;
    }

    return text.slice(0, MAX_OUTPUT);
  } catch (err: any) {
    return `[文件解析失败: ${err.message ?? String(err)}]`;
  }
}
