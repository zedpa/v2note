"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ArrowLeft,
  Search,
  ChevronDown,
  ChevronRight,
  Trash2,
  Plus,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SwipeBack } from "@/shared/components/swipe-back";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  fetchVocabulary,
  addVocabulary,
  deleteVocabulary,
  importDomain,
  type VocabItem,
} from "@/shared/lib/api/vocabulary";

interface VocabularyPageProps {
  onClose: () => void;
}

/** 领域显示配置 */
const DOMAIN_META: Record<string, { icon: string; label: string }> = {
  manufacturing: { icon: "\uD83C\uDFED", label: "制造/供应链" },
  finance: { icon: "\uD83D\uDCB0", label: "金融/财务" },
  tech: { icon: "\uD83D\uDCBB", label: "科技/互联网" },
  medical: { icon: "\uD83C\uDFE5", label: "医疗/健康" },
  design: { icon: "\uD83C\uDFA8", label: "设计/创意" },
  education: { icon: "\uD83C\uDF93", label: "教育/学术" },
  construction: { icon: "\uD83C\uDFD7\uFE0F", label: "建筑/工程" },
  ecommerce: { icon: "\uD83D\uDED2", label: "电商/零售" },
};

function domainLabel(domain: string): string {
  return DOMAIN_META[domain]?.label ?? domain;
}

function domainIcon(domain: string): string {
  return DOMAIN_META[domain]?.icon ?? "\uD83D\uDCCC";
}

export function VocabularyPage({ onClose }: VocabularyPageProps) {
  const [items, setItems] = useState<VocabItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);
  const [addTerm, setAddTerm] = useState("");
  const [addDomain, setAddDomain] = useState("");
  const [addAliases, setAddAliases] = useState("");
  const [importingDomain, setImportingDomain] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 加载词库
  useEffect(() => {
    fetchVocabulary()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // 按领域分组 + 搜索过滤
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? items.filter(
          (v) =>
            v.term.toLowerCase().includes(q) ||
            v.aliases.some((a) => a.toLowerCase().includes(q)) ||
            domainLabel(v.domain).toLowerCase().includes(q),
        )
      : items;

    const map = new Map<string, VocabItem[]>();
    for (const item of filtered) {
      const list = map.get(item.domain) ?? [];
      list.push(item);
      map.set(item.domain, list);
    }
    // 按词数降序排列
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [items, search]);

  const toggleDomain = useCallback((domain: string) => {
    setExpandedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteVocabulary(id);
        setItems((prev) => prev.filter((v) => v.id !== id));
      } catch {
        // 静默失败
      }
    },
    [],
  );

  const handleAdd = useCallback(async () => {
    const term = addTerm.trim();
    const domain = addDomain.trim();
    if (!term || !domain) return;
    setSubmitting(true);
    try {
      const aliases = addAliases
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const newItem = await addVocabulary({ term, domain, aliases });
      setItems((prev) => [...prev, newItem]);
      setAddTerm("");
      setAddDomain("");
      setAddAliases("");
      setShowAddForm(false);
    } catch {
      // 静默失败
    } finally {
      setSubmitting(false);
    }
  }, [addTerm, addDomain, addAliases]);

  const handleImport = useCallback(async () => {
    const domain = importingDomain.trim();
    if (!domain) return;
    setSubmitting(true);
    try {
      await importDomain(domain);
      // 重新加载词库
      const refreshed = await fetchVocabulary();
      setItems(refreshed);
      setShowImportForm(false);
      setImportingDomain("");
    } catch {
      // 静默失败
    } finally {
      setSubmitting(false);
    }
  }, [importingDomain]);

  return (
    <SwipeBack onClose={onClose}>
      <div className="flex flex-col min-h-dvh pt-safe bg-surface">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-surface/80 backdrop-blur-[12px]">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-secondary/60 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-on-surface" />
          </button>
          <h1 className="font-serif text-lg text-on-surface">我的词库</h1>
        </div>

        {/* 搜索栏 */}
        <div className="px-4 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-accessible" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索词汇..."
              className="w-full rounded-xl bg-surface-lowest pl-9 pr-4 py-2.5 text-sm text-on-surface placeholder:text-muted-accessible/50 outline-none focus:ring-2 focus:ring-deer/30"
            />
          </div>
        </div>

        {/* 词库列表 */}
        <ScrollArea className="flex-1">
          <div className="max-w-lg mx-auto px-4 pb-32 space-y-3">
            {loading ? (
              <div className="space-y-3 pt-4">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-14 bg-surface-low rounded-xl animate-pulse"
                  />
                ))}
              </div>
            ) : grouped.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-sm text-muted-accessible">
                  {search ? "没有找到匹配的词汇" : "词库为空，导入领域开始吧"}
                </p>
              </div>
            ) : (
              grouped.map(([domain, domainItems]) => (
                <div
                  key={domain}
                  className="rounded-xl bg-surface-lowest shadow-ambient overflow-hidden"
                >
                  {/* 领域标题 */}
                  <button
                    type="button"
                    onClick={() => toggleDomain(domain)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-low/50 transition-colors"
                  >
                    <span className="text-base">{domainIcon(domain)}</span>
                    <span className="font-serif text-sm text-on-surface flex-1 text-left">
                      {domainLabel(domain)}
                    </span>
                    <span className="text-xs text-muted-accessible font-mono">
                      {domainItems.length} 词
                    </span>
                    {expandedDomains.has(domain) ? (
                      <ChevronDown className="w-4 h-4 text-muted-accessible" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-accessible" />
                    )}
                  </button>

                  {/* 展开的词汇列表 */}
                  {expandedDomains.has(domain) && (
                    <div className="border-t border-ghost-border">
                      {domainItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-low/30 transition-colors"
                        >
                          <span className="text-sm text-on-surface flex-1 truncate">
                            {item.term}
                            {item.aliases.length > 0 && (
                              <span className="text-xs text-muted-accessible ml-1.5">
                                ({item.aliases.join(", ")})
                              </span>
                            )}
                          </span>
                          {item.frequency > 0 && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-deer/10 text-[10px] font-mono text-deer">
                              {item.frequency}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
                            className="shrink-0 p-1 rounded-full text-muted-accessible hover:text-maple hover:bg-maple/10 transition-colors"
                            aria-label={`删除 ${item.term}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* 添加词汇表单 */}
        {showAddForm && (
          <div className="fixed inset-0 z-50 bg-black/30 flex items-end justify-center">
            <div className="w-full max-w-lg bg-surface rounded-t-2xl p-5 space-y-4 animate-slide-up">
              <h3 className="font-serif text-base text-on-surface">添加词汇</h3>
              <input
                type="text"
                value={addTerm}
                onChange={(e) => setAddTerm(e.target.value)}
                placeholder="词汇名称"
                className="w-full rounded-xl bg-surface-lowest px-4 py-2.5 text-sm text-on-surface placeholder:text-muted-accessible/50 outline-none focus:ring-2 focus:ring-deer/30"
              />
              <input
                type="text"
                value={addDomain}
                onChange={(e) => setAddDomain(e.target.value)}
                placeholder="所属领域（如 manufacturing, finance）"
                className="w-full rounded-xl bg-surface-lowest px-4 py-2.5 text-sm text-on-surface placeholder:text-muted-accessible/50 outline-none focus:ring-2 focus:ring-deer/30"
              />
              <input
                type="text"
                value={addAliases}
                onChange={(e) => setAddAliases(e.target.value)}
                placeholder="别名（逗号分隔，可选）"
                className="w-full rounded-xl bg-surface-lowest px-4 py-2.5 text-sm text-on-surface placeholder:text-muted-accessible/50 outline-none focus:ring-2 focus:ring-deer/30"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 h-10 rounded-xl text-sm text-muted-accessible hover:bg-surface-low transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!addTerm.trim() || !addDomain.trim() || submitting}
                  className="flex-1 h-10 rounded-xl text-sm font-medium text-white disabled:opacity-40 transition-opacity"
                  style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
                >
                  {submitting ? "添加中..." : "确认添加"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 导入领域表单 */}
        {showImportForm && (
          <div className="fixed inset-0 z-50 bg-black/30 flex items-end justify-center">
            <div className="w-full max-w-lg bg-surface rounded-t-2xl p-5 space-y-4 animate-slide-up">
              <h3 className="font-serif text-base text-on-surface">导入领域词库</h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(DOMAIN_META).map(([key, meta]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setImportingDomain(key)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors",
                      importingDomain === key
                        ? "bg-deer/15 text-on-surface ring-1 ring-deer/40"
                        : "bg-surface-lowest text-muted-accessible hover:bg-surface-low",
                    )}
                  >
                    <span>{meta.icon}</span>
                    <span>{meta.label}</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowImportForm(false);
                    setImportingDomain("");
                  }}
                  className="flex-1 h-10 rounded-xl text-sm text-muted-accessible hover:bg-surface-low transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={!importingDomain || submitting}
                  className="flex-1 h-10 rounded-xl text-sm font-medium text-white disabled:opacity-40 transition-opacity"
                  style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
                >
                  {submitting ? "导入中..." : "确认导入"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 底部操作栏 */}
        <div className="fixed bottom-0 left-0 right-0 bg-surface/90 backdrop-blur-[12px] border-t border-ghost-border px-4 py-3 pb-safe flex gap-3">
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="flex-1 h-11 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 transition-opacity"
            style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
          >
            <Plus className="w-4 h-4" />
            添加词汇
          </button>
          <button
            type="button"
            onClick={() => setShowImportForm(true)}
            className="flex-1 h-11 rounded-xl text-sm font-medium text-on-surface bg-surface-lowest border border-ghost-border flex items-center justify-center gap-2 hover:bg-surface-low transition-colors"
          >
            <Download className="w-4 h-4" />
            导入领域
          </button>
        </div>
      </div>
    </SwipeBack>
  );
}
