"use client";

import { useState, useEffect } from "react";
import { X, Save } from "lucide-react";
import { fabNotify } from "@/shared/lib/fab-notify";
import {
  getUserProfile,
  setUserProfile,
  getTools,
  setTools,
  type LocalUser,
  type LocalToolServer,
} from "@/shared/lib/local-config";
import { ProfileTab } from "@/features/memory/components/profile-tab";

type Tab = "soul" | "user" | "tools";

interface ProfileEditorProps {
  onClose: () => void;
}

export function ProfileEditor({ onClose }: ProfileEditorProps) {
  const [tab, setTab] = useState<Tab>("soul");
  const [userName, setUserName] = useState("");
  const [userDescription, setUserDescription] = useState("");
  const [userTraits, setUserTraits] = useState("");
  const [toolsConfig, setToolsConfig] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        // Load user profile
        const user = await getUserProfile();
        if (user) {
          setUserName(user.name ?? "");
          setUserDescription(user.description ?? "");
          setUserTraits(user.traits?.join(", ") ?? "");
        }

        // Load tools config
        const tools = await getTools();
        if (tools) {
          setToolsConfig(JSON.stringify(tools.servers, null, 2));
        } else {
          setToolsConfig("[]");
        }
      } catch {
        // Start with defaults
      }
      setLoading(false);
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const now = new Date().toISOString();

      if (tab === "user") {
        const user: LocalUser = {
          name: userName || undefined,
          description: userDescription || undefined,
          traits: userTraits
            ? userTraits.split(",").map((t) => t.trim()).filter(Boolean)
            : undefined,
          updatedAt: now,
        };
        await setUserProfile(user);
        fabNotify.info("用户信息已保存");
      } else if (tab === "tools") {
        try {
          const servers: LocalToolServer[] = JSON.parse(toolsConfig);
          await setTools({ servers, updatedAt: now });
          fabNotify.info("工具配置已保存");
        } catch {
          fabNotify.error("JSON 格式错误");
          setSaving(false);
          return;
        }
      }
    } catch (err: any) {
      fabNotify.error(`保存失败: ${err.message}`);
    }
    setSaving(false);
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "soul", label: "用户画像" },
    { key: "user", label: "用户信息" },
    { key: "tools", label: "工具配置" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col pt-safe">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <h1 className="text-lg font-bold text-foreground">个人画像</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            保存
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-secondary/60 transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border/60">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="text-sm text-muted-foreground">加载中...</span>
          </div>
        ) : tab === "soul" ? (
          <ProfileTab />
        ) : tab === "user" ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">
                名称
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-secondary/30 border border-border/50 text-sm text-foreground outline-none focus:border-primary/50 transition-colors"
                placeholder="你的名字"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">
                简介
              </label>
              <textarea
                value={userDescription}
                onChange={(e) => setUserDescription(e.target.value)}
                className="w-full h-24 p-3 rounded-xl bg-secondary/30 border border-border/50 text-sm text-foreground resize-none outline-none focus:border-primary/50 transition-colors"
                placeholder="简单介绍一下自己..."
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">
                特征标签 (逗号分隔)
              </label>
              <input
                type="text"
                value={userTraits}
                onChange={(e) => setUserTraits(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-secondary/30 border border-border/50 text-sm text-foreground outline-none focus:border-primary/50 transition-colors"
                placeholder="例如: 创业者, 技术爱好者, 设计师"
              />
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs text-muted-foreground mb-3">
              配置 MCP 工具服务器。AI 处理时可调用这些外部工具。格式为 JSON 数组。
            </p>
            <textarea
              value={toolsConfig}
              onChange={(e) => setToolsConfig(e.target.value)}
              className="w-full h-64 p-3 rounded-xl bg-secondary/30 border border-border/50 text-xs font-mono text-foreground resize-none outline-none focus:border-primary/50 transition-colors"
              placeholder={`[\n  {\n    "name": "calendar",\n    "transport": "http",\n    "url": "https://example.com/mcp",\n    "enabled": true\n  }\n]`}
              spellCheck={false}
            />
            {/* JSON validation hint */}
            {toolsConfig && (() => {
              try {
                JSON.parse(toolsConfig);
                return (
                  <p className="text-[10px] text-green-600 mt-1.5">JSON 格式正确</p>
                );
              } catch {
                return (
                  <p className="text-[10px] text-destructive mt-1.5">JSON 格式错误，请检查语法</p>
                );
              }
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
