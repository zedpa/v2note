"use client";

import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { getDeviceId } from "@/shared/lib/device";
import { listSkills, toggleSkill as apiToggleSkill, getSkillDetail } from "@/shared/lib/api/skills";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface SkillItem {
  name: string;
  description: string;
  enabled: boolean;
  always: boolean;
}

const DEFAULT_SKILLS: SkillItem[] = [
  { name: "todo-extract", description: "待办提取", enabled: true, always: false },
  { name: "customer-request", description: "客户要求", enabled: true, always: false },
  { name: "setting-change", description: "设置修改", enabled: true, always: false },
  { name: "meta-question", description: "元问题钻取", enabled: false, always: false },
];

export function SkillsPanel() {
  const [skills, setSkills] = useState<SkillItem[]>(DEFAULT_SKILLS);
  const [loading, setLoading] = useState(true);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [promptCache, setPromptCache] = useState<Record<string, string>>({});
  const [loadingPrompt, setLoadingPrompt] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        await getDeviceId();
        const data = await listSkills();

        if (data && data.length > 0) {
          setSkills(
            data.map((s: any) => ({
              name: s.name,
              description: s.description,
              enabled: s.enabled,
              always: s.always ?? false,
            })),
          );
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
    setSkills((prev) =>
      prev.map((s) => (s.name === name ? { ...s, enabled: newEnabled } : s)),
    );

    try {
      await apiToggleSkill(name, newEnabled);
      toast(`${skill.description} 已${newEnabled ? "启用" : "停用"}`);
    } catch {
      setSkills((prev) =>
        prev.map((s) => (s.name === name ? { ...s, enabled: !newEnabled } : s)),
      );
      toast.error("操作失败");
    }
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
    <div className="p-4">
      <h3 className="text-xs font-semibold text-muted-foreground mb-3">Skills</h3>
      <div className="space-y-1">
        {skills.map((skill) => (
          <Collapsible
            key={skill.name}
            open={expandedSkill === skill.name}
            onOpenChange={() => handleToggleExpand(skill.name)}
          >
            <div
              className={cn(
                "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-colors",
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
                  <span className="text-sm text-foreground">{skill.description}</span>
                  {skill.always && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      始终启用
                    </Badge>
                  )}
                </div>
                <span className="block text-[10px] text-muted-foreground">{skill.name}</span>
              </div>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="p-1 rounded hover:bg-secondary/60 transition-colors"
                >
                  <ChevronDown
                    className={cn(
                      "w-3.5 h-3.5 text-muted-foreground transition-transform",
                      expandedSkill === skill.name && "rotate-180",
                    )}
                  />
                </button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
              <div className="mx-3 mb-2 p-3 rounded-md bg-muted/50 text-xs text-muted-foreground whitespace-pre-wrap max-h-40 overflow-y-auto">
                {loadingPrompt === skill.name
                  ? "加载中..."
                  : promptCache[skill.name] ?? "点击展开加载 Prompt"}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    </div>
  );
}
