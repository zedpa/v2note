import { getDeviceId } from "./device";
import { exportData as apiExportData } from "./api/export";

export type ExportFormat = "json" | "csv" | "markdown";

export async function exportData(format: ExportFormat): Promise<{ content: string; filename: string; mimeType: string }> {
  await getDeviceId(); // ensure API deviceId is set

  const apiFormat = format === "markdown" ? "md" : format;
  const result = await apiExportData(apiFormat);

  const mimeTypes: Record<string, string> = {
    json: "application/json",
    csv: "text/csv",
    markdown: "text/markdown",
  };

  return {
    content: result.content,
    filename: result.filename,
    mimeType: mimeTypes[format] ?? "text/plain",
  };
}

export function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
