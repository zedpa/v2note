"use client";

import { useState, useEffect } from "react";
import { X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  getSkills,
  setSkills,
  type LocalSkillConfig,
  type LocalSkills,
} from "@/shared/lib/local-config";
import { listSkills, getSkillDetail } from "@/shared/lib/api/skills";
import { getDeviceId } from "@/shared/lib/device";

interface SkillDisplay {
  name: string;
  description: string;
  enabled: boolean;
  always: boolean;
}

const DEFAULT_SKILLS: SkillDisplay[] = [
  { name: "todo-extract", description: "待办提取", enabled: true, always: false },
  { name: "customer-request", description: "客户要求", enabled: true, always: false },
  { name: "setting-change", description: "设置修改", enabled: true, always: false },
  { name: "meta-question", description: "元问题钻取", enabled: false, always: false },
];

interface SkillsPageProps {
  onClose: () => void;
}

export function SkillsPage({ onClose }: SkillsPageProps) {
  const [skills, setSkillsState] = useState<SkillDisplay[]>(DEFAULT_SKILLS);
  const [loading, setLoading] = useState(true);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [promptCache, setPromptCache] = useState<Record<string, string>>({});
  const [loadingPrompt, setLoadingPrompt] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // Try loading from local config first
        const localSkills = await getSkills();
        if (localSkills && localSkills.configs.length > 0) {
          setSkillsState(
            localSkills.configs.map((c) => ({
              name: c.name,
              description: c.description ?? c.name,
              enabled: c.enabled,
              always: false,
            })),
          );
          setLoading(false);
          return;
        }

        // Fall back to server
        await getDeviceId();
        const data = await listSkills();
        if (data && data.length > 0) {
          const mapped = data.map((s: any) => ({
            name: s.name,
            description: s.description,
            enabled: s.enabled,
            always: s.always ?? false,
          }));
          setSkillsState(mapped);

          // Migrate to local config
          await setSkills({
            configs: mapped.map((s: SkillDisplay) => ({
              name: s.name,
              enabled: s.enabled,
              description: s.description,
            })),
            updatedAt: new Date().toISOString(),
          });
        }
      } catch {
        // Use defaults
      }
      setLoading(false);
    }
    load();
  }, []);

  const toggleSkill = async (name: string) => {
    const skill = skills.find((s) => s.name === name);
    if (!skill || skill.always) return;

    const newEnabled = !skill.enabled;
    const updated = skills.map((s) =>
      s.name === name ? { ...s, enabled: newEnabled } : s,
    );
    setSkillsState(updated);

    // Save to local config
    const localSkills: LocalSkills = {
      configs: updated.map((s) => ({
        name: s.name,
        enabled: s.enabled,
        description: s.description,
      })),
      updatedAt: new Date().toISOString(),
    };
    await setSkills(localSkills);
    toast(`${skill.description} 已${newEnabled ? "启用" : "停用"}`);
  };

  const loadPrompt = async (name: string) => {
    if (promptCache[name]) return;
    setLoadingPrompt(name);
    try {
      const detail = await getSkillDetail(name);
      setPromptCache((prev) => ({ ...prev, [name]: detail.prompt }));
    } catch {
      setPromptCache((prev) => ({ ...prev, [name]: "加载失败" }));
    }
    setLoadingPrompt(null);
  };

  const handleToggleExpand = (name: string) => {
    const next = expandedSkill === name ? null : name;
    setExpandedSkill(next);
    if (next) loadPrompt(next);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col pt-safe">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <h1 className="text-lg font-bold text-foreground">技能管理</h1>
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
        <p className="text-xs text-muted-foreground mb-4">
          开启或关闭 AI 技能。录音处理时仅使用已启用的技能进行分析和提取。
        </p>

        <div className="space-y-1">
          {skills.map((skill) => (
            <Collapsible
              key={skill.name}
              open={expandedSkill === skill.name}
              onOpenChange={() => handleToggleExpand(skill.name)}
            >
              <div
                className={cn(
                  "flex items-center gap-3 w-full px-3 py-3 rounded-xl transition-colors",
                  "hover:bg-secondary/40",
                )}
              >
                <Switch
                  checked={skill.always || skill.enabled}
                  disabled={loading || skill.always}
                  onCheckedChange={() => toggleSkill(skill.name)}
                  className="shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {skill.description}
                    </span>
                    {skill.always && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        始终启用
                      </Badge>
                    )}
                  </div>
                  <span className="block text-[10px] text-muted-foreground mt-0.5">
                    {skill.name}
                  </span>
                </div>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="p-1.5 rounded-lg hover:bg-secondary/60 transition-colors"
                  >
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 text-muted-foreground transition-transform",
                        expandedSkill === skill.name && "rotate-180",
                      )}
                    />
                  </button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <div className="mx-3 mb-2 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {loadingPrompt === skill.name
                    ? "加载中..."
                    : promptCache[skill.name] ?? "点击展开加载 Prompt"}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </div>
    </div>
  );
}
