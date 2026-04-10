"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Zap, Settings, LogOut, Search, BookOpen, ChevronDown, ChevronRight,
  Inbox, Plus, Target,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WikiPageEntry {
  id: string;
  title: string;
  level: number;
  parentId: string | null;
  createdBy: string;
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
}: SidebarDrawerProps) {
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());

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
          {roots.length > 0 && (
            <>
              <div className="my-5 flex items-center gap-3">
                <div className="flex-1 h-px bg-border/40" />
                <span className="text-xs text-muted-accessible tracking-widest">主题</span>
                <div className="flex-1 h-px bg-border/40" />
              </div>
              <nav className="space-y-0.5">
                {roots.map((page) => {
                  const children = childrenMap.get(page.id) ?? [];
                  const hasChildren = children.length > 0;
                  const isExpanded = expandedPages.has(page.id);
                  const totalRecords = page.recordCount + children.reduce((s, c) => s + c.recordCount, 0);

                  return (
                    <div key={page.id}>
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
                        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left hover:bg-surface/60 active:bg-surface/80 transition-colors select-none"
                      >
                        <span className="text-muted-accessible shrink-0">
                          {hasChildren
                            ? (isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />)
                            : <BookOpen size={16} />}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-on-surface truncate block">{page.title}</span>
                          {page.activeGoals.length > 0 && (
                            <span className="text-[10px] text-muted-accessible truncate block flex items-center gap-1">
                              <Target size={10} className="shrink-0" />
                              {page.activeGoals[0].title}
                              {page.activeGoals.length > 1 && ` +${page.activeGoals.length - 1}`}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-mono text-muted-accessible">{totalRecords || ""}</span>
                      </button>
                      {hasChildren && isExpanded && (
                        <div className="ml-4">
                          {/* 点击父节点本身也能过滤 */}
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
                          {children.map((child) => (
                            <button
                              key={child.id}
                              type="button"
                              onClick={() => { onClose(); onSelectPage?.(child.id); }}
                              className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-left hover:bg-surface/60 transition-colors select-none"
                            >
                              <span className="text-muted-accessible shrink-0"><BookOpen size={14} /></span>
                              <div className="flex-1 min-w-0">
                                <span className="text-sm text-on-surface truncate block">{child.title}</span>
                                {child.activeGoals.length > 0 && (
                                  <span className="text-[10px] text-muted-accessible truncate block flex items-center gap-1">
                                    <Target size={10} className="shrink-0" />
                                    {child.activeGoals[0].title}
                                  </span>
                                )}
                              </div>
                              <span className="text-xs font-mono text-muted-accessible">{child.recordCount || ""}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
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
