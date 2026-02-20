"use client";

import { useState } from "react";
import { X, FileJson, FileText, FileDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { exportData, downloadBlob, type ExportFormat } from "@/shared/lib/export";
import { toast } from "sonner";

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

const FORMATS: { key: ExportFormat; label: string; icon: typeof FileJson; desc: string }[] = [
  { key: "json", label: "JSON", icon: FileJson, desc: "结构化数据，适合备份" },
  { key: "csv", label: "CSV", icon: FileText, desc: "表格格式，可用 Excel 打开" },
  { key: "markdown", label: "Markdown", icon: FileDown, desc: "可读性好，适合分享" },
];

export function ExportDialog({ open, onClose }: ExportDialogProps) {
  const [exporting, setExporting] = useState(false);

  if (!open) return null;

  const handleExport = async (format: ExportFormat) => {
    try {
      setExporting(true);
      const result = await exportData(format);
      downloadBlob(result.content, result.filename, result.mimeType);
      toast("导出成功！");
      onClose();
    } catch (err: any) {
      toast.error(`导出失败: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-card rounded-t-2xl p-6 pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-foreground">数据导出</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg bg-secondary">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-3">
          {FORMATS.map((fmt) => (
            <button
              type="button"
              key={fmt.key}
              disabled={exporting}
              onClick={() => handleExport(fmt.key)}
              className={cn(
                "flex items-center gap-3 w-full p-4 rounded-xl border border-border/60",
                "hover:bg-secondary/50 transition-colors text-left",
                exporting && "opacity-50 pointer-events-none",
              )}
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
                <fmt.icon className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{fmt.label}</p>
                <p className="text-[10px] text-muted-foreground">{fmt.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
