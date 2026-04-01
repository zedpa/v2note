"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  X, Zap, Settings, LogOut,
  ChevronDown, ChevronRight, Target, CalendarDays,
  Sparkles, Compass, Plus, Pencil, Trash2, FolderOpen,
} from "lucide-react";
import { fabNotify } from "@/shared/lib/fab-notify";
import { cn } from "@/lib/utils";
import {
  getMyWorld,
  createGoal,
  updateGoal,
  updateCluster,
  dissolveCluster,
  type MyWorldNode,
} from "@/shared/lib/api/goals";

interface SidebarDrawerProps {
  open: boolean;
  onClose: () => void;
  onViewBriefing?: () => void;
  onViewEvening?: () => void;
  onViewSettings?: () => void;
  onViewReview?: () => void;
  onViewSearch?: () => void;
  onViewGoal?: (goalId: string) => void;
  onViewGoals?: () => void;
  onSelectToday?: () => void;
  onLogout?: () => void;
  userName?: string | null;
  userPhone?: string | null;
  onViewProfile?: () => void;
  onSelectTopic?: (clusterId: string, title: string) => void;
  onOpenChat?: (initialMsg: string) => void;
}

export function SidebarDrawer({
  open,
  onClose,
  onViewBriefing,
  onViewEvening,
  onViewSettings,
  onViewGoal,
  onViewGoals,
  onSelectToday,
  onLogout,
  userName,
  userPhone,
  onViewProfile,
  onSelectTopic,
  onOpenChat,
}: SidebarDrawerProps) {
  const [nodes, setNodes] = useState<MyWorldNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // 加载 My World 数据
  useEffect(() => {
    if (!open) return;
    getMyWorld()
      .then((res) => setNodes(res.nodes || []))
      .catch(() => {});
  }, [open]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // 刷新数据
  const refresh = useCallback(() => {
    getMyWorld()
      .then((res) => setNodes(res.nodes || []))
      .catch(() => {});
  }, []);

  const initial = userName?.charAt(0)?.toUpperCase() || "U";

  if (!open) return null;

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 z-50 bg-black/30"
        onClick={onClose}
      />

      {/* 抽屉 */}
      <div
        className={cn(
          "fixed top-0 left-0 bottom-0 z-50 flex flex-col",
          "w-[75vw] max-w-[320px]",
          "bg-surface-high",
          "animate-in slide-in-from-left duration-200",
        )}
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {/* 头部: 头像 + 用户名 */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium text-white shrink-0"
              style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
            >
              {initial}
            </div>
            <div>
              <p className="text-sm font-medium text-on-surface">
                {userName || "VoiceNote"}
              </p>
              <p className="text-xs text-muted-accessible">
                {userPhone || "AI 个人助手"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-muted-accessible hover:text-on-surface transition-colors"
            aria-label="关闭侧边栏"
          >
            <X size={16} />
          </button>
        </div>

        {/* 滚动内容 */}
        <div className="flex-1 overflow-y-auto px-5 pb-8">

          {/* ── 第一组: 导航 ── */}
          <nav className="space-y-0.5">
            <SidebarItem
              icon={<Zap size={18} />}
              label="每日回顾"
              onClick={() => {
                onClose();
                onViewEvening?.();
              }}
            />
          </nav>

          {/* ── 分隔 + 我的世界 ── */}
          <div className="my-5 flex items-center gap-3">
            <div className="flex-1 h-px bg-border/40" />
            <span className="text-xs text-muted-accessible tracking-widest">我的世界</span>
            <div className="flex-1 h-px bg-border/40" />
          </div>

          {/* ── 树结构 ── */}
          {nodes.length > 0 ? (
            <nav className="space-y-0.5">
              {nodes.map((node) => (
                <MyWorldTreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  expandedIds={expandedIds}
                  onToggle={toggleExpand}
                  onViewGoal={(id) => { onClose(); onViewGoal?.(id); }}
                  onSelectTopic={(id, title) => { onClose(); onSelectTopic?.(id, title); }}
                  onRefresh={refresh}
                />
              ))}
            </nav>
          ) : (
            <div className="px-3 py-4">
              <p className="text-xs text-muted-accessible leading-relaxed">
                持续记录想法，结构会自然浮现
              </p>
            </div>
          )}

          {/* + 新建目标 */}
          <NewGoalInline onCreated={refresh} />

          {/* ── 分隔线 ── */}
          <div className="my-5 h-px bg-border/40" />

          {/* ── 第三组: 发现(灰色) + 今日简报 + 设置 ── */}
          <nav className="space-y-0.5">
            {/* 发现 — 灰色，点击提示开发中 */}
            <button
              type="button"
              onClick={() => {
                fabNotify.info("更多功能还在路上 🚀 认知地图 · 大师视角 · 行动复盘 · Skills · MCP · Tools", 3000);
              }}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left opacity-40 cursor-pointer"
            >
              <span className="shrink-0 text-muted-foreground"><Compass size={18} /></span>
              <span className="text-sm text-muted-foreground">发现</span>
            </button>

            {(onViewBriefing || onViewEvening) && (
              <SidebarItem
                icon={<CalendarDays size={18} />}
                label="今日简报"
                showDot
                onClick={() => {
                  onClose();
                  onViewBriefing?.();
                }}
              />
            )}
            {onViewSettings && (
              <SidebarItem
                icon={<Settings size={18} />}
                label="设置"
                onClick={() => { onClose(); onViewSettings(); }}
              />
            )}
          </nav>

          {/* ── 退出登录 ── */}
          <div className="mt-5">
            {onLogout && (
              <button
                type="button"
                onClick={() => { onClose(); onLogout(); }}
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-muted-accessible hover:text-maple transition-colors"
              >
                <LogOut size={16} />
                退出登录
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ── 树节点渲染 ── */

const NODE_ICONS: Record<MyWorldNode["type"], React.ReactNode> = {
  l2_cluster: <FolderOpen size={16} />,
  l1_cluster: <Sparkles size={16} />,
  goal: <Target size={16} />,
  action: <div className="w-3.5 h-3.5 rounded-full border-2 border-muted-accessible/50" />,
};

function MyWorldTreeNode({
  node,
  depth,
  expandedIds,
  onToggle,
  onViewGoal,
  onSelectTopic,
  onRefresh,
}: {
  node: MyWorldNode;
  depth: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onViewGoal: (id: string) => void;
  onSelectTopic: (id: string, title: string) => void;
  onRefresh: () => void;
}) {
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const isCluster = node.type === "l1_cluster" || node.type === "l2_cluster";
  const isAction = node.type === "action";

  // 长按管理
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchMoved = useRef(false);

  // inline 编辑
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  // inline 新建子项
  const [creating, setCreating] = useState(false);
  const [createText, setCreateText] = useState("");
  const createRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) editRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (creating) createRef.current?.focus();
  }, [creating]);

  const handleLongPressStart = (e: React.TouchEvent | React.MouseEvent) => {
    touchMoved.current = false;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    longPressTimer.current = setTimeout(() => {
      if (!touchMoved.current) {
        setMenuPos({ x: clientX, y: clientY });
        setShowMenu(true);
      }
    }, 500);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleTouchMove = () => {
    touchMoved.current = true;
    handleLongPressEnd();
  };

  const handleClick = () => {
    if (showMenu) return;
    if (hasChildren) {
      onToggle(node.id);
    } else if (isCluster) {
      // 集群无子节点时，跳转到主题视图
      onSelectTopic(node.id, node.title);
    } else if (node.type === "goal") {
      onViewGoal(node.id);
    }
  };

  // 编辑保存
  const handleEditSave = async () => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === node.title) {
      setEditing(false);
      return;
    }
    try {
      if (isCluster) {
        await updateCluster(node.id, { name: trimmed });
      } else {
        await updateGoal(node.id, { title: trimmed });
      }
      onRefresh();
    } catch {
      fabNotify.error("保存失败");
    }
    setEditing(false);
  };

  // 删除/解散
  const handleDelete = async () => {
    const label = isCluster ? "解散" : "删除";
    if (!confirm(`确定${label}「${node.title}」？`)) return;
    try {
      if (isCluster) {
        await dissolveCluster(node.id);
      } else {
        await updateGoal(node.id, { status: "archived" });
      }
      onRefresh();
    } catch {
      fabNotify.error(`${label}失败`);
    }
    setShowMenu(false);
  };

  // 新建子项保存
  const handleCreateSave = async () => {
    const trimmed = createText.trim();
    if (!trimmed) {
      setCreating(false);
      return;
    }
    try {
      if (isCluster) {
        await createGoal({ title: trimmed, cluster_id: node.id });
      } else {
        await createGoal({ title: trimmed, parent_id: node.id });
      }
      onRefresh();
      // 确保展开
      if (!expandedIds.has(node.id)) onToggle(node.id);
    } catch {
      fabNotify.error("创建失败");
    }
    setCreating(false);
    setCreateText("");
  };

  // 进度文字
  const progressText = node.subtaskTotal != null && node.subtaskTotal > 0
    ? `${node.subtaskDone ?? 0}/${node.subtaskTotal}`
    : node.memberCount != null && node.memberCount > 0
      ? `${node.memberCount}`
      : null;

  const paddingLeft = 12 + depth * 16;

  return (
    <div>
      {/* 节点行 */}
      <div
        className={cn(
          "flex items-center gap-2 w-full rounded-xl transition-colors cursor-pointer",
          "hover:bg-surface/60 active:bg-surface/80",
          isAction && node.done && "opacity-50 line-through",
        )}
        style={{ paddingLeft, paddingRight: 12, paddingTop: 8, paddingBottom: 8 }}
        onClick={handleClick}
        onTouchStart={handleLongPressStart}
        onTouchEnd={handleLongPressEnd}
        onTouchMove={handleTouchMove}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuPos({ x: e.clientX, y: e.clientY });
          setShowMenu(true);
        }}
      >
        {/* 展开箭头或图标 */}
        {hasChildren ? (
          <span className="shrink-0 text-muted-accessible w-4 flex justify-center">
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        ) : (
          <span className="shrink-0 text-muted-accessible w-4 flex justify-center">
            {NODE_ICONS[node.type]}
          </span>
        )}

        {/* 文字 */}
        {editing ? (
          <input
            ref={editRef}
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleEditSave();
              if (e.key === "Escape") setEditing(false);
            }}
            onBlur={handleEditSave}
            className="flex-1 min-w-0 text-sm bg-transparent border-b border-deer/50 outline-none text-on-surface py-0.5"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={cn(
            "flex-1 min-w-0 text-sm truncate",
            isCluster ? "font-medium text-on-surface" : "text-on-surface",
          )}>
            {node.title}
          </span>
        )}

        {/* 计数 */}
        {progressText && !editing && (
          <span className="text-[11px] text-muted-accessible font-mono shrink-0">
            {progressText}
          </span>
        )}
      </div>

      {/* 展开子节点 */}
      {isExpanded && hasChildren && depth < 3 && (
        <div>
          {node.children.map((child) => (
            <MyWorldTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onViewGoal={onViewGoal}
              onSelectTopic={onSelectTopic}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}

      {/* 新建子项 inline 输入 */}
      {creating && (
        <div
          className="flex items-center gap-2 rounded-xl"
          style={{ paddingLeft: paddingLeft + 20, paddingRight: 12, paddingTop: 6, paddingBottom: 6 }}
        >
          <Plus size={14} className="text-muted-accessible shrink-0" />
          <input
            ref={createRef}
            type="text"
            value={createText}
            onChange={(e) => setCreateText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateSave();
              if (e.key === "Escape") { setCreating(false); setCreateText(""); }
            }}
            onBlur={() => { if (!createText.trim()) setCreating(false); }}
            placeholder={isCluster ? "新建目标..." : "新建子项..."}
            className="flex-1 min-w-0 text-sm bg-transparent border-b border-deer/30 outline-none text-on-surface placeholder:text-muted-accessible/50 py-0.5"
          />
        </div>
      )}

      {/* 长按管理菜单 */}
      {showMenu && (
        <LongPressMenu
          node={node}
          isCluster={isCluster}
          position={menuPos}
          onClose={() => setShowMenu(false)}
          onEdit={() => {
            setEditText(node.title);
            setEditing(true);
            setShowMenu(false);
          }}
          onDelete={handleDelete}
          onCreate={() => {
            setCreating(true);
            setShowMenu(false);
          }}
          onToggleDone={isAction ? async () => {
            try {
              await updateGoal(node.id, { done: !node.done } as any);
              onRefresh();
            } catch { fabNotify.error("操作失败"); }
            setShowMenu(false);
          } : undefined}
        />
      )}
    </div>
  );
}

/* ── 长按菜单 ── */

function LongPressMenu({
  node,
  isCluster,
  position,
  onClose,
  onEdit,
  onDelete,
  onCreate,
  onToggleDone,
}: {
  node: MyWorldNode;
  isCluster: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCreate: () => void;
  onToggleDone?: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [onClose]);

  // 确保菜单在视口内
  const top = Math.min(position.y, window.innerHeight - 200);
  const left = Math.min(position.x, window.innerWidth - 160);

  return (
    <div
      ref={menuRef}
      className="fixed z-[60] bg-surface-high border border-border/50 rounded-xl shadow-lg py-1 min-w-[140px] animate-in fade-in zoom-in-95 duration-100"
      style={{ top, left }}
    >
      <MenuBtn icon={<Pencil size={14} />} label="编辑" onClick={onEdit} />
      {node.type !== "action" && (
        <MenuBtn
          icon={<Plus size={14} />}
          label={isCluster ? "新建目标" : "新建子项"}
          onClick={onCreate}
        />
      )}
      {onToggleDone && (
        <MenuBtn
          icon={<Target size={14} />}
          label={node.done ? "标记未完成" : "标记完成"}
          onClick={onToggleDone}
        />
      )}
      <MenuBtn
        icon={<Trash2 size={14} />}
        label={isCluster ? "解散" : "删除"}
        onClick={onDelete}
        danger
      />
    </div>
  );
}

function MenuBtn({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-colors",
        danger
          ? "text-maple hover:bg-maple/10"
          : "text-on-surface hover:bg-surface/60",
      )}
    >
      <span className="shrink-0">{icon}</span>
      {label}
    </button>
  );
}

/* ── 底部新建目标 ── */

function NewGoalInline({ onCreated }: { onCreated: () => void }) {
  const [active, setActive] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (active) inputRef.current?.focus();
  }, [active]);

  const handleSave = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setActive(false);
      return;
    }
    try {
      await createGoal({ title: trimmed });
      onCreated();
      setText("");
      setActive(false);
    } catch {
      fabNotify.error("创建失败");
    }
  };

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => setActive(true)}
        className="flex items-center gap-2 w-full px-3 py-2 mt-1 text-xs text-muted-accessible/60 hover:text-muted-accessible transition-colors rounded-xl"
      >
        <Plus size={14} />
        新建目标
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 mt-1">
      <Plus size={14} className="text-deer shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave();
          if (e.key === "Escape") { setActive(false); setText(""); }
        }}
        onBlur={handleSave}
        placeholder="输入目标名称..."
        className="flex-1 min-w-0 text-sm bg-transparent border-b border-deer/30 outline-none text-on-surface placeholder:text-muted-accessible/50 py-0.5"
      />
    </div>
  );
}

/* ── 侧边栏菜单项 ── */

function SidebarItem({
  icon,
  label,
  badge,
  sublabel,
  showDot,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: string;
  sublabel?: string;
  showDot?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left hover:bg-surface/60 active:bg-surface/80 transition-colors"
    >
      <span className="text-muted-accessible shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-on-surface truncate block">{label}</span>
        {sublabel && (
          <span className="text-[10px] text-muted-accessible truncate block">{sublabel}</span>
        )}
      </div>
      {badge && (
        <span className="text-xs font-mono text-muted-accessible">{badge}</span>
      )}
      {showDot && (
        <span className="w-2 h-2 rounded-full bg-maple shrink-0" />
      )}
    </button>
  );
}
