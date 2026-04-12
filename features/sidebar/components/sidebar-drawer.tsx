"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Zap, Settings, LogOut, Search, BookOpen, ChevronDown, ChevronRight,
  Inbox, Plus, Target, Lightbulb, MoreVertical, Pencil, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WikiPageEntry {
  id: string;
  title: string;
  level: number;
  parentId: string | null;
  createdBy: string;
  pageType: string;
  recordCount: number;
  activeGoals: { id: string; title: string }[];
  updatedAt: string;
}

interface SidebarDrawerProps {
  open: boolean;
  onClose: () => void;
  onViewBriefing?: () => void;
  onViewEvening?: () => void;
  onViewSettings?: () => void;
  onViewSearch?: () => void;
  onLogout?: () => void;
  userName?: string | null;
  userPhone?: string | null;
  onViewProfile?: () => void;
  onSelectPage?: (pageId: string | null) => void;
  wikiPages?: WikiPageEntry[];
  inboxCount?: number;
  pendingSuggestionCount?: number;
  onOpenSuggestions?: () => void;
  onCreatePage?: (title: string, pageType: "topic" | "goal") => void;
  onRenamePage?: (pageId: string, newTitle: string) => void;
  onDeletePage?: (pageId: string, recordCount: number) => void;
}

export function SidebarDrawer({
  open,
  onClose,
  onViewBriefing,
  onViewSettings,
  onViewSearch,
  onLogout,
  userName,
  userPhone,
  onViewProfile,
  onSelectPage,
  wikiPages = [],
  inboxCount = 0,
  pendingSuggestionCount = 0,
  onOpenSuggestions,
  onCreatePage,
  onRenamePage,
  onDeletePage,
}: SidebarDrawerProps) {
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [contextMenu, setContextMenu] = useState<{ pageId: string; title: string; recordCount: number } | null>(null);
  const [renaming, setRenaming] = useState<{ pageId: string; title: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const createInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // 构建树结构：顶层 page (parentId=null) + 子 page
  const { roots, childrenMap } = useMemo(() => {
    const cMap = new Map<string, WikiPageEntry[]>();
    const rootPages: WikiPageEntry[] = [];

    for (const page of wikiPages) {
      if (page.parentId) {
        const list = cMap.get(page.parentId) ?? [];
        list.push(page);
        cMap.set(page.parentId, list);
      } else {
        rootPages.push(page);
      }
    }

    return { roots: rootPages, childrenMap: cMap };
  }, [wikiPages]);

  // 自动聚焦创建输入框
  useEffect(() => {
    if (showCreateInput) createInputRef.current?.focus();
  }, [showCreateInput]);

  // 自动聚焦重命名输入框
  useEffect(() => {
    if (renaming) renameInputRef.current?.focus();
  }, [renaming]);

  const handleCreate = () => {
    const trimmed = createTitle.trim();
    if (!trimmed) return;
    onCreatePage?.(trimmed, "topic");
    setCreateTitle("");
    setShowCreateInput(false);
  };

  const handleRename = () => {
    if (!renaming) return;
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === renaming.title) {
      setRenaming(null);
      return;
    }
    onRenamePage?.(renaming.pageId, trimmed);
    setRenaming(null);
  };

  const [confirmDelete, setConfirmDelete] = useState<{ pageId: string; title: string; recordCount: number } | null>(null);

  const handleDelete = () => {
    if (!contextMenu) return;
    setConfirmDelete(contextMenu);
    setContextMenu(null);
  };

  const handleConfirmDelete = () => {
    if (!confirmDelete) return;
    onDeletePage?.(confirmDelete.pageId, confirmDelete.recordCount);
    setConfirmDelete(null);
  };

  // 锁定背景滚动
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  const initial = userName?.charAt(0)?.toUpperCase() || "U";

  if (!open) return null;

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 z-50 bg-black/30"
        style={{ touchAction: "none" }}
        onClick={onClose}
        onTouchMove={(e) => e.preventDefault()}
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
          <button
            type="button"
            onClick={() => { onClose(); onViewProfile?.(); }}
            className="flex items-center gap-3 text-left"
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium text-white shrink-0"
              style={{ background: "linear-gradient(135deg, var(--avatar-gradient-from), var(--avatar-gradient-to))" }}
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
          </button>
          <button
            type="button"
            onClick={() => { onClose(); onViewProfile?.(); }}
            className="w-8 h-8 flex items-center justify-center rounded-full text-muted-accessible hover:text-on-surface transition-colors"
            aria-label="用户设置"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* 滚动内容 */}
        <div className="flex-1 overflow-y-auto px-5 pb-8">

          {/* ── 导航菜单 ── */}
          <nav className="space-y-0.5">
            <SidebarItem
              icon={<Zap size={18} />}
              label="今日简报"
              onClick={() => {
                onClose();
                onViewBriefing?.();
              }}
            />
            <SidebarItem
              icon={<Search size={18} />}
              label="搜索"
              onClick={() => {
                onClose();
                onViewSearch?.();
              }}
            />
          </nav>

          {/* ── 收件箱 ── */}
          {inboxCount > 0 && (
            <>
              <div className="my-5 flex items-center gap-3">
                <div className="flex-1 h-px bg-border/40" />
                <span className="text-xs text-muted-accessible tracking-widest">收件箱</span>
                <div className="flex-1 h-px bg-border/40" />
              </div>
              <nav className="space-y-0.5">
                <SidebarItem
                  icon={<Inbox size={18} />}
                  label="未整理"
                  badge={String(inboxCount)}
                  onClick={() => {
                    onClose();
                    onSelectPage?.("__inbox__");
                  }}
                />
              </nav>
            </>
          )}

          {/* ── Wiki Page 主题树 ── */}
          <>
            <div className="my-5 flex items-center gap-3">
              <div className="flex-1 h-px bg-border/40" />
              <span className="text-xs text-muted-accessible tracking-widest">主题</span>
              <div className="flex-1 h-px bg-border/40" />
              <button
                type="button"
                onClick={() => setShowCreateInput(true)}
                className="w-5 h-5 flex items-center justify-center rounded text-muted-accessible hover:text-on-surface transition-colors"
                aria-label="新建主题"
              >
                <Plus size={14} />
              </button>
            </div>

            {/* 新建主题输入框 */}
            {showCreateInput && (
              <div className="flex items-center gap-2 px-3 mb-2">
                <input
                  ref={createInputRef}
                  type="text"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") { setShowCreateInput(false); setCreateTitle(""); }
                  }}
                  placeholder="输入主题名称"
                  className="flex-1 text-sm bg-surface rounded-lg px-3 py-2 text-on-surface placeholder:text-muted-accessible outline-none border border-border/40 focus:border-maple/50"
                />
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!createTitle.trim()}
                  className="text-xs text-maple font-medium disabled:opacity-30"
                >
                  创建
                </button>
              </div>
            )}

            {roots.length === 0 && !showCreateInput ? (
              <p className="px-3 text-xs text-muted-accessible leading-relaxed">
                录几段话，AI 会自动整理主题
              </p>
            ) : (
              <nav className="space-y-0.5">
                {roots.map((page) => {
                  const children = childrenMap.get(page.id) ?? [];
                  const hasChildren = children.length > 0;
                  const isExpanded = expandedPages.has(page.id);
                  const totalRecords = page.recordCount + children.reduce((s, c) => s + c.recordCount, 0);
                  const isRenaming = renaming?.pageId === page.id;

                  return (
                    <div key={page.id}>
                      <div className="group flex items-center">
                        <button
                          type="button"
                          onClick={() => {
                            if (hasChildren) {
                              setExpandedPages(prev => {
                                const next = new Set(prev);
                                next.has(page.id) ? next.delete(page.id) : next.add(page.id);
                                return next;
                              });
                            } else {
                              onClose();
                              onSelectPage?.(page.id);
                            }
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({ pageId: page.id, title: page.title, recordCount: totalRecords });
                          }}
                          className="flex items-center gap-3 flex-1 min-w-0 px-3 py-2.5 rounded-xl text-left hover:bg-surface/60 active:bg-surface/80 transition-colors select-none"
                        >
                          <span className="text-muted-accessible shrink-0">
                            {hasChildren
                              ? (isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />)
                              : <BookOpen size={16} />}
                          </span>
                          <div className="flex-1 min-w-0">
                            {isRenaming ? (
                              <input
                                ref={renameInputRef}
                                type="text"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  e.stopPropagation();
                                  if (e.key === "Enter") handleRename();
                                  if (e.key === "Escape") setRenaming(null);
                                }}
                                onBlur={handleRename}
                                onClick={(e) => e.stopPropagation()}
                                className="text-sm bg-surface rounded px-1.5 py-0.5 text-on-surface outline-none border border-maple/50 w-full"
                              />
                            ) : (
                              <>
                                <span className="text-sm text-on-surface truncate block">
                                  {page.pageType === "goal" && <span className="text-amber-500 mr-1">⭐</span>}
                                  {page.title}
                                </span>
                                {page.activeGoals.length > 0 && (
                                  <span className="text-[10px] text-muted-accessible truncate block flex items-center gap-1">
                                    <Target size={10} className="shrink-0" />
                                    {page.activeGoals[0].title}
                                    {page.activeGoals.length > 1 && ` +${page.activeGoals.length - 1}`}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                          <span className="text-xs font-mono text-muted-accessible">{totalRecords || ""}</span>
                        </button>
                        {/* 三点菜单按钮 */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setContextMenu({ pageId: page.id, title: page.title, recordCount: totalRecords });
                          }}
                          className="w-7 h-7 flex items-center justify-center rounded-full text-muted-accessible/50 hover:text-on-surface transition-all shrink-0"
                          aria-label="更多操作"
                        >
                          <MoreVertical size={14} />
                        </button>
                      </div>
                      {hasChildren && isExpanded && (
                        <div className="ml-4">
                          {page.recordCount > 0 && (
                            <button
                              type="button"
                              onClick={() => { onClose(); onSelectPage?.(page.id); }}
                              className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-left hover:bg-surface/60 transition-colors select-none"
                            >
                              <span className="text-muted-accessible shrink-0"><BookOpen size={14} /></span>
                              <span className="flex-1 min-w-0 text-sm text-on-surface truncate">概览</span>
                              <span className="text-xs font-mono text-muted-accessible">{page.recordCount}</span>
                            </button>
                          )}
                          {children.map((child) => {
                            const isChildRenaming = renaming?.pageId === child.id;
                            return (
                              <div key={child.id} className="group flex items-center">
                                <button
                                  type="button"
                                  onClick={() => { onClose(); onSelectPage?.(child.id); }}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    setContextMenu({ pageId: child.id, title: child.title, recordCount: child.recordCount });
                                  }}
                                  className="flex items-center gap-3 flex-1 min-w-0 px-3 py-2 rounded-xl text-left hover:bg-surface/60 transition-colors select-none"
                                >
                                  <span className="text-muted-accessible shrink-0"><BookOpen size={14} /></span>
                                  <div className="flex-1 min-w-0">
                                    {isChildRenaming ? (
                                      <input
                                        ref={renameInputRef}
                                        type="text"
                                        value={renameValue}
                                        onChange={(e) => setRenameValue(e.target.value)}
                                        onKeyDown={(e) => {
                                          e.stopPropagation();
                                          if (e.key === "Enter") handleRename();
                                          if (e.key === "Escape") setRenaming(null);
                                        }}
                                        onBlur={handleRename}
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-sm bg-surface rounded px-1.5 py-0.5 text-on-surface outline-none border border-maple/50 w-full"
                                      />
                                    ) : (
                                      <>
                                        <span className="text-sm text-on-surface truncate block">
                                          {child.pageType === "goal" && <span className="text-amber-500 mr-1">⭐</span>}
                                          {child.title}
                                        </span>
                                        {child.activeGoals.length > 0 && (
                                          <span className="text-[10px] text-muted-accessible truncate block flex items-center gap-1">
                                            <Target size={10} className="shrink-0" />
                                            {child.activeGoals[0].title}
                                          </span>
                                        )}
                                      </>
                                    )}
                                  </div>
                                  <span className="text-xs font-mono text-muted-accessible">{child.recordCount || ""}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setContextMenu({ pageId: child.id, title: child.title, recordCount: child.recordCount });
                                  }}
                                  className="w-7 h-7 flex items-center justify-center rounded-full text-muted-accessible/50 hover:text-on-surface transition-all shrink-0"
                                  aria-label="更多操作"
                                >
                                  <MoreVertical size={14} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </nav>
            )}
          </>

          {/* ── 上下文菜单弹窗 ── */}
          {contextMenu && (
            <>
              <div className="fixed inset-0 z-[60]" onClick={() => setContextMenu(null)} />
              <div className="fixed left-[50%] top-[50%] -translate-x-1/2 -translate-y-1/2 z-[60] bg-surface-high rounded-2xl shadow-xl border border-border/30 w-56 overflow-hidden">
                <div className="px-4 py-3 border-b border-border/20">
                  <p className="text-sm font-medium text-on-surface truncate">{contextMenu.title}</p>
                  <p className="text-[10px] text-muted-accessible">{contextMenu.recordCount} 条记录</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRenaming({ pageId: contextMenu.pageId, title: contextMenu.title });
                    setRenameValue(contextMenu.title);
                    setContextMenu(null);
                  }}
                  className="flex items-center gap-3 w-full px-4 py-3 text-left text-sm text-on-surface hover:bg-surface/60 transition-colors"
                >
                  <Pencil size={16} className="text-muted-accessible" />
                  重命名
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="flex items-center gap-3 w-full px-4 py-3 text-left text-sm text-maple hover:bg-surface/60 transition-colors"
                >
                  <Trash2 size={16} />
                  删除
                </button>
              </div>
            </>
          )}

          {/* ── 删除确认对话框 ── */}
          {confirmDelete && (
            <>
              <div className="fixed inset-0 z-[60]" onClick={() => setConfirmDelete(null)} />
              <div className="fixed left-[50%] top-[50%] -translate-x-1/2 -translate-y-1/2 z-[60] bg-surface-high rounded-2xl shadow-xl border border-border/30 w-64 overflow-hidden">
                <div className="px-4 py-4">
                  <p className="text-sm font-medium text-on-surface mb-1">删除「{confirmDelete.title}」？</p>
                  <p className="text-xs text-muted-accessible">
                    {confirmDelete.recordCount > 0
                      ? `其中 ${confirmDelete.recordCount} 条记录将变为未归类`
                      : "该主题下没有记录"}
                  </p>
                </div>
                <div className="flex border-t border-border/20">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(null)}
                    className="flex-1 py-3 text-sm text-on-surface hover:bg-surface/60 transition-colors"
                  >
                    取消
                  </button>
                  <div className="w-px bg-border/20" />
                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    className="flex-1 py-3 text-sm text-maple font-medium hover:bg-surface/60 transition-colors"
                  >
                    删除
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── 建议通知 ── */}
          {pendingSuggestionCount > 0 && (
            <>
              <div className="my-5 h-px bg-border/40" />
              <nav className="space-y-0.5">
                <SidebarItem
                  icon={<Lightbulb size={18} />}
                  label="AI 建议"
                  badge={String(pendingSuggestionCount)}
                  onClick={() => {
                    onClose();
                    onOpenSuggestions?.();
                  }}
                />
              </nav>
            </>
          )}

          {/* ── 分隔线 ── */}
          <div className="my-5 h-px bg-border/40" />

          {/* ── 设置 ── */}
          <nav className="space-y-0.5">
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
      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left hover:bg-surface/60 active:bg-surface/80 transition-colors select-none"
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
