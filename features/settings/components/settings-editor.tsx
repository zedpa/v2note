"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  getSettings,
  updateSettings as saveSettings,
  type LocalSettings,
} from "@/shared/lib/local-config";
import { SwipeBack } from "@/shared/components/swipe-back";
import schema from "../lib/settings-schema.json";

interface SettingsEditorProps {
  onClose: () => void;
  onThemeChange?: (theme: string) => void;
}

export function SettingsEditor({ onClose, onThemeChange }: SettingsEditorProps) {
  const [settings, setSettings] = useState<LocalSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const s = await getSettings();
      setSettings(s);
      setLoading(false);
    }
    load();
  }, []);

  const handleChange = async (key: string, value: unknown) => {
    if (!settings) return;

    const updated = { ...settings, [key]: value };
    setSettings(updated);

    try {
      await saveSettings(updated);

      if (key === "theme" && onThemeChange) {
        onThemeChange(value as string);
      }
    } catch {
      toast.error("保存失败");
    }
  };

  if (loading || !settings) {
    return (
      <SwipeBack onClose={onClose}>
        <div className="flex items-center justify-center min-h-dvh pt-safe">
          <span className="text-sm text-muted-foreground">加载中...</span>
        </div>
      </SwipeBack>
    );
  }

  return (
    <SwipeBack onClose={onClose}>
      <div className="flex flex-col min-h-dvh pt-safe">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <h1 className="text-lg font-bold text-foreground">设置</h1>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-secondary/60 transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {schema.sections.map((section) => (
            <div key={section.key} className="mb-6">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-3">
                {section.title}
              </h3>
              <div className="space-y-3">
                {section.fields.map((field) => (
                  <div
                    key={field.key}
                    className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/50"
                  >
                    <span className="text-sm text-foreground">{field.label}</span>

                    {field.type === "toggle" && (
                      <Switch
                        checked={Boolean((settings as any)[field.key])}
                        onCheckedChange={(checked) => handleChange(field.key, checked)}
                      />
                    )}

                    {field.type === "select" && (
                      <select
                        value={String((settings as any)[field.key] ?? field.default ?? "")}
                        onChange={(e) =>
                          handleChange(field.key, e.target.value === "null" ? null : e.target.value)
                        }
                        className="text-sm bg-secondary/50 border border-border/50 rounded-lg px-2 py-1.5 outline-none"
                      >
                        {"options" in field && (field.options as string[]).map((opt) => (
                          <option key={opt ?? "null"} value={String(opt)}>
                            {opt ?? "未设置"}
                          </option>
                        ))}
                      </select>
                    )}

                    {field.type === "number" && (
                      <input
                        type="number"
                        value={Number((settings as any)[field.key] ?? field.default)}
                        min={"min" in field ? (field as any).min : undefined}
                        max={"max" in field ? (field as any).max : undefined}
                        onChange={(e) => handleChange(field.key, Number(e.target.value))}
                        className="w-20 text-sm text-right bg-secondary/50 border border-border/50 rounded-lg px-2 py-1.5 outline-none"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SwipeBack>
  );
}
