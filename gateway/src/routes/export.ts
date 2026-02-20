import type { Router } from "../router.js";
import { sendJson, getDeviceId } from "../lib/http-helpers.js";
import {
  recordRepo,
  transcriptRepo,
  summaryRepo,
  todoRepo,
  ideaRepo,
} from "../db/repositories/index.js";

export function registerExportRoutes(router: Router) {
  router.get("/api/v1/export", async (req, res, _params, query) => {
    const deviceId = getDeviceId(req);
    const format = query.format ?? "json";

    const records = await recordRepo.findByDevice(deviceId, { limit: 10000 });
    const ids = records.map((r) => r.id);

    const [transcripts, todos, ideas] = await Promise.all([
      ids.length > 0 ? transcriptRepo.findByRecordIds(ids) : [],
      todoRepo.findByDevice(deviceId),
      ideaRepo.findByDevice(deviceId),
    ]);
    const summaries = ids.length > 0
      ? await Promise.all(ids.map((id) => summaryRepo.findByRecordId(id)))
      : [];

    const transcriptMap = Object.fromEntries(transcripts.map((t) => [t.record_id, t]));
    const summaryMap = Object.fromEntries(
      summaries.filter(Boolean).map((s) => [s!.record_id, s]),
    );

    if (format === "json") {
      const data = records.map((r) => ({
        ...r,
        transcript: transcriptMap[r.id]?.text ?? "",
        summary: summaryMap[r.id] ?? null,
      }));
      sendJson(res, {
        content: JSON.stringify({ records: data, todos, ideas }, null, 2),
        filename: `v2note-export-${new Date().toISOString().split("T")[0]}.json`,
      });
    } else if (format === "md") {
      const lines = records.map((r) => {
        const s = summaryMap[r.id];
        const t = transcriptMap[r.id];
        return `## ${s?.title ?? "Untitled"}\n_${r.created_at}_\n\n${t?.text ?? ""}\n`;
      });
      sendJson(res, {
        content: lines.join("\n---\n\n"),
        filename: `v2note-export-${new Date().toISOString().split("T")[0]}.md`,
      });
    } else {
      // CSV
      const header = "date,title,content\n";
      const rows = records.map((r) => {
        const s = summaryMap[r.id];
        const t = transcriptMap[r.id];
        const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
        return `${esc(r.created_at)},${esc(s?.title ?? "")},${esc(t?.text ?? "")}`;
      });
      sendJson(res, {
        content: header + rows.join("\n"),
        filename: `v2note-export-${new Date().toISOString().split("T")[0]}.csv`,
      });
    }
  });
}
