"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Plus, Pencil, Trash2, ChevronDown, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  getSkills,
  setSkills,
  type LocalSkillConfig,
  type LocalSkills,
} from "@/shared/lib/local-config";
import {
  listSkills,
  createSkill as apiCreateSkill,
  updateSkill as apiUpdateSkill,
  deleteSkill as apiDeleteSkill,
} from "@/shared/lib/api/skills";
import { getDeviceId } from "@/shared/lib/device";
import { SwipeBack } from "@/shared/components/swipe-back";

interface SkillDisplay {
  name: string;
  description: string;
  enabled: boolean;
  always: boolean;
  type: "review" | "process";
  builtin: boolean;
  prompt?: string;
  created_by?: string;
}

interface SkillsPageProps {
  onClose: () => void;
}

interface SkillFormData {
  name: string;
  description: string;
  prompt: string;
}

export function SkillsPage({ onClose }: SkillsPageProps) {
  const [skills, setSkillsState] = useState<SkillDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);

  // Form dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<string | null>(null);
  const [formData, setFormData] = useState<SkillFormData>({
    name: "",
    description: "",
    prompt: "",
  });
  const [saving, setSaving] = useState(false);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const reviewSkills = skills.filter((s) => s.type === "review");
  const processSkills = skills.filter((s) => s.type === "process");

  const loadData = useCallback(async () => {
    try {
      // Try loading from local config first
      const localSkills = await getSkills();
      if (localSkills && localSkills.configs.length > 0 && localSkills.configs.some((c) => c.type)) {
        setSkillsState(
          localSkills.configs.map((c) => ({
            name: c.name,
            description: c.description ?? c.name,
            enabled: c.enabled,
            always: false,
            type: c.type ?? "process",
            builtin: c.builtin ?? true,
            prompt: c.prompt,
          })),
        );
        setLoading(false);
        return;
      }

      // Fall back to server
      await getDeviceId();
      const data = await listSkills();
      if (data && data.length > 0) {
        const mapped: SkillDisplay[] = data.map((s: any) => ({
          name: s.name,
          description: s.description,
          enabled: s.enabled,
          always: s.always ?? false,
          type: s.type ?? "process",
          builtin: s.builtin ?? true,
          prompt: s.prompt,
          created_by: s.created_by,
        }));
        setSkillsState(mapped);

        // Persist to local config
        await persistToLocal(mapped);
      }
    } catch {
      // Use empty
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const persistToLocal = async (items: SkillDisplay[], selectedReview?: string) => {
    const current = await getSkills();
    const localSkills: LocalSkills = {
      configs: items.map((s) => ({
        name: s.name,
        enabled: s.enabled,
        description: s.description,
        type: s.type,
        prompt: s.builtin ? undefined : s.prompt,
        builtin: s.builtin,
      })),
      selectedReviewSkill: selectedReview ?? current?.selectedReviewSkill,
      updatedAt: new Date().toISOString(),
    };
    await setSkills(localSkills);
  };

  const toggleSkill = async (name: string) => {
    const skill = skills.find((s) => s.name === name);
    if (!skill || skill.always) return;

    const newEnabled = !skill.enabled;
    const updated = skills.map((s) =>
      s.name === name ? { ...s, enabled: newEnabled } : s,
    );
    setSkillsState(updated);
    await persistToLocal(updated);
    toast(`${skill.description || skill.name} 已${newEnabled ? "启用" : "停用"}`);
  };

  const openCreateForm = () => {
    setEditingSkill(null);
    setFormData({ name: "", description: "", prompt: "" });
    setFormOpen(true);
  };

  const openEditForm = (skill: SkillDisplay) => {
    setEditingSkill(skill.name);
    setFormData({
      name: skill.name,
      description: skill.description,
      prompt: skill.prompt ?? "",
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.prompt.trim()) {
      toast.error("名称和提示词不能为空");
      return;
    }

    setSaving(true);
    try {
      if (editingSkill) {
        // Update — save locally first
        const updated = skills.map((s) =>
          s.name === editingSkill
            ? {
                ...s,
                name: formData.name.trim(),
                description: formData.description.trim(),
                prompt: formData.prompt.trim(),
              }
            : s,
        );
        setSkillsState(updated);
        await persistToLocal(updated);
        toast("技能已更新");
        // Sync to server in background
        apiUpdateSkill(editingSkill, {
          name: formData.name.trim(),
          description: formData.description.trim(),
          prompt: formData.prompt.trim(),
        }).catch(() => {});
      } else {
        // Create — save locally first
        const newSkill: SkillDisplay = {
          name: formData.name.trim(),
          description: formData.description.trim(),
          enabled: true,
          always: false,
          type: "review",
          builtin: false,
          prompt: formData.prompt.trim(),
          created_by: "user",
        };
        const updated = [...skills, newSkill];
        setSkillsState(updated);
        await persistToLocal(updated);
        toast("技能已创建");
        // Sync to server in background
        apiCreateSkill({
          name: formData.name.trim(),
          description: formData.description.trim(),
          prompt: formData.prompt.trim(),
          type: "review",
        }).catch(() => {});
      }
      setFormOpen(false);
    } catch (err: any) {
      toast.error(err.message ?? "操作失败");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    // Save locally first
    const updated = skills.filter((s) => s.name !== deleteTarget);
    setSkillsState(updated);
    await persistToLocal(updated);
    toast("技能已删除");
    // Sync to server in background
    apiDeleteSkill(deleteTarget).catch(() => {});
    setDeleteTarget(null);
  };

  return (
    <SwipeBack onClose={onClose}>
      <div className="flex flex-col min-h-dvh pt-safe">
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
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {/* Review Skills Section */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">复盘视角</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  复盘对话时可选择一个视角引导 AI 分析
                </p>
              </div>
              <button
                type="button"
                onClick={openCreateForm}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                新建
              </button>
            </div>

            <div className="space-y-1">
              {reviewSkills.map((skill) => (
                <SkillRow
                  key={skill.name}
                  skill={skill}
                  expanded={expandedSkill === skill.name}
                  onToggle={() => toggleSkill(skill.name)}
                  onToggleExpand={() =>
                    setExpandedSkill(
                      expandedSkill === skill.name ? null : skill.name,
                    )
                  }
                  onEdit={() => openEditForm(skill)}
                  onDelete={() => setDeleteTarget(skill.name)}
                  loading={loading}
                />
              ))}
              {reviewSkills.length === 0 && !loading && (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  暂无复盘视角，点击右上角"新建"创建
                </p>
              )}
            </div>
          </section>

          {/* Process Skills Section */}
          <section>
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-foreground">处理技能</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                录音处理时使用已启用的技能进行提取
              </p>
            </div>

            <div className="space-y-1">
              {processSkills.map((skill) => (
                <SkillRow
                  key={skill.name}
                  skill={skill}
                  expanded={expandedSkill === skill.name}
                  onToggle={() => toggleSkill(skill.name)}
                  onToggleExpand={() =>
                    setExpandedSkill(
                      expandedSkill === skill.name ? null : skill.name,
                    )
                  }
                  loading={loading}
                />
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Create/Edit Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingSkill ? "编辑复盘视角" : "新建复盘视角"}
            </DialogTitle>
            <DialogDescription>
              {editingSkill
                ? "修改视角的名称、描述和提示词"
                : "创建一个新的复盘视角，在复盘对话中使用"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-foreground mb-1.5 block">
                名称
              </label>
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="如：用户体验视角"
                disabled={saving}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1.5 block">
                描述（可选）
              </label>
              <Input
                value={formData.description}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="简短描述这个视角的作用"
                disabled={saving}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1.5 block">
                提示词
              </label>
              <Textarea
                value={formData.prompt}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, prompt: e.target.value }))
                }
                placeholder="引导 AI 从这个视角进行分析的指令..."
                rows={6}
                disabled={saving}
              />
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 text-sm rounded-lg hover:bg-secondary/60 transition-colors"
              disabled={saving}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !formData.name.trim() || !formData.prompt.trim()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除「{deleteTarget}」吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 text-sm rounded-lg hover:bg-secondary/60 transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
            >
              删除
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SwipeBack>
  );
}

function SkillRow({
  skill,
  expanded,
  onToggle,
  onToggleExpand,
  onEdit,
  onDelete,
  loading,
}: {
  skill: SkillDisplay;
  expanded: boolean;
  onToggle: () => void;
  onToggleExpand: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  loading: boolean;
}) {
  return (
    <Collapsible open={expanded} onOpenChange={onToggleExpand}>
      <div
        className={cn(
          "flex items-center gap-3 w-full px-3 py-3 rounded-xl transition-colors",
          "hover:bg-secondary/40",
        )}
      >
        <Switch
          checked={skill.always || skill.enabled}
          disabled={loading || skill.always}
          onCheckedChange={onToggle}
          className="shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {skill.name}
            </span>
            {skill.always && (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0"
              >
                始终启用
              </Badge>
            )}
            {skill.builtin && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0"
              >
                内置
              </Badge>
            )}
            {skill.created_by === "ai" && (
              <Bot className="w-3 h-3 text-muted-foreground" />
            )}
          </div>
          {skill.description && (
            <span className="block text-[11px] text-muted-foreground mt-0.5">
              {skill.description}
            </span>
          )}
        </div>

        {/* Action buttons for custom skills */}
        {!skill.builtin && (
          <div className="flex items-center gap-1">
            {onEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="p-1.5 rounded-lg hover:bg-secondary/60 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </button>
            )}
          </div>
        )}

        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="p-1.5 rounded-lg hover:bg-secondary/60 transition-colors"
          >
            <ChevronDown
              className={cn(
                "w-4 h-4 text-muted-foreground transition-transform",
                expanded && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="mx-3 mb-2 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
          {skill.prompt ?? "无提示词"}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
