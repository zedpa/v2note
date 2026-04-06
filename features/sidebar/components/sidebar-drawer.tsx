"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Zap, Settings, LogOut, Search, FolderOpen, ChevronDown, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DomainEntry { domain: string; count: number }

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
  onSelectDomain?: (domain: string | null) => void;
  domains?: DomainEntry[];
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
  onSelectDomain,
  domains: domainsProp = [],
}: SidebarDrawerProps) {
  const [expandedL1, setExpandedL1] = useState<Set<string>>(new Set());

  // 总 record 数决定展示深度
  const totalCount = useMemo(() => domainsProp.reduce((sum, d) => sum + d.count, 0), [domainsProp]);

  // 按一级分类聚合
  const folderTree = useMemo(() => {
    const map = new Map<string, { count: number; children: Map<string, number> }>();
    for (const { domain, count } of domainsProp) {
      const parts = domain.split("/");
      const l1 = parts[0];
      if (!map.has(l1)) map.set(l1, { count: 0, children: new Map() });
      const entry = map.get(l1)!;
      entry.count += count;
      if (parts.length > 1) {
        const l2 = parts.slice(1).join("/");
        entry.children.set(l2, (entry.children.get(l2) ?? 0) + count);
      }
    }
    return map;
  }, [domainsProp]);

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

          {/* ── 自动归类文件夹 ── */}
          {folderTree.size > 0 && (
            <>
              <div className="my-5 flex items-center gap-3">
                <div className="flex-1 h-px bg-border/40" />
                <span className="text-xs text-muted-accessible tracking-widest">自动归类</span>
                <div className="flex-1 h-px bg-border/40" />
              </div>
              <nav className="space-y-0.5">
                {Array.from(folderTree.entries()).map(([l1, { count, children }]) => {
                  const showChildren = totalCount > 20 && children.size > 0;
                  const isExpanded = expandedL1.has(l1);
                  return (
                    <div key={l1}>
                      <button
                        type="button"
                        onClick={() => {
                          if (showChildren) {
                            setExpandedL1(prev => {
                              const next = new Set(prev);
                              next.has(l1) ? next.delete(l1) : next.add(l1);
                              return next;
                            });
                          } else {
                            onClose();
                            onSelectDomain?.(l1);
                          }
                        }}
                        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left hover:bg-surface/60 active:bg-surface/80 transition-colors select-none"
                      >
                        <span className="text-muted-accessible shrink-0">
                          {showChildren ? (isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : <FolderOpen size={16} />}
                        </span>
                        <span className="flex-1 min-w-0 text-sm text-on-surface truncate">{l1}</span>
                        <span className="text-xs font-mono text-muted-accessible">{count}</span>
                      </button>
                      {showChildren && isExpanded && (
                        <div className="ml-4">
                          {Array.from(children.entries()).map(([l2, c]) => (
                            <button
                              key={l2}
                              type="button"
                              onClick={() => { onClose(); onSelectDomain?.(`${l1}/${l2}`); }}
                              className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-left hover:bg-surface/60 transition-colors select-none"
                            >
                              <span className="text-muted-accessible shrink-0"><FolderOpen size={14} /></span>
                              <span className="flex-1 min-w-0 text-sm text-on-surface truncate">{l2}</span>
                              <span className="text-xs font-mono text-muted-accessible">{c}</span>
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
