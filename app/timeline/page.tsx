'use client'

import { useState, useEffect, useCallback, type MouseEvent } from 'react'
import { fetchClusters, type ClusterSummary } from '@/shared/lib/api/cognitive'
import { listRecords, getRecord } from '@/shared/lib/api/records'
import { PCLayout } from '@/components/layout/pc-layout'

type FilterType = '全部' | '语音' | '文字' | '图片' | '带文件'

const INPUT_ICONS: Record<string, string> = {
  voice: '🎙',
  text: '✏️',
  image: '📷',
  file: '📎',
}

function getInputIcon(source?: string): string {
  if (!source) return '✏️'
  return INPUT_ICONS[source] ?? '✏️'
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function TimelinePage() {
  const [clusters, setClusters] = useState<ClusterSummary[]>([])
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)
  const [records, setRecords] = useState<any[]>([])
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null)
  const [loadingClusters, setLoadingClusters] = useState(true)
  const [loadingRecords, setLoadingRecords] = useState(false)
  const [filter, setFilter] = useState<FilterType>('全部')
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clusterId: string } | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    fetchClusters()
      .then(setClusters)
      .catch(() => {})
      .finally(() => setLoadingClusters(false))
  }, [])

  useEffect(() => {
    setLoadingRecords(true)
    setSelectedRecord(null)
    listRecords({ limit: 50, notebook: selectedCluster ?? undefined })
      .then(setRecords)
      .catch(() => {})
      .finally(() => setLoadingRecords(false))
  }, [selectedCluster])

  const handleRecordClick = useCallback(async (id: string) => {
    try {
      const detail = await getRecord(id)
      setSelectedRecord(detail)
    } catch {
      // ignore
    }
  }, [])

  const toggleExpand = useCallback((id: string, e: MouseEvent) => {
    e.stopPropagation()
    setExpandedCards((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleTopicContextMenu = useCallback((e: MouseEvent, clusterId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, clusterId })
  }, [])

  const handleContextAction = useCallback((action: string, clusterId: string) => {
    console.log(`${action} topic:`, clusterId)
    setContextMenu(null)
  }, [])

  // Close context menu on click anywhere
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [contextMenu])

  const filteredRecords = records.filter((r) => {
    if (filter === '语音' && r.source !== 'voice') return false
    if (filter === '文字' && r.source !== 'text') return false
    if (filter === '图片' && r.source !== 'image') return false
    if (filter === '带文件' && !(r.attachments?.length > 0 || r.source === 'file')) return false
    if (dateFrom && r.created_at && new Date(r.created_at) < new Date(dateFrom)) return false
    if (dateTo && r.created_at && new Date(r.created_at) > new Date(dateTo + 'T23:59:59')) return false
    return true
  })

  return (
    <PCLayout>
    <div className="h-screen bg-cream flex" onClick={() => setContextMenu(null)}>
      {/* Left: Structure Navigation */}
      <aside className="w-[200px] shrink-0 border-r border-brand-border overflow-y-auto bg-sand">
        <div className="p-3">
          <h2 className="text-xs font-display text-bark/50 uppercase tracking-wider mb-2">主题</h2>
          <button
            onClick={() => setSelectedCluster(null)}
            className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors duration-200 ease-out ${
              selectedCluster === null ? 'bg-cream text-bark font-bold' : 'text-bark/70 hover:bg-sand/50'
            }`}
          >
            全部
          </button>
          {loadingClusters ? (
            <p className="text-xs text-bark/40 px-2 py-4">加载中…</p>
          ) : (
            clusters.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCluster(c.id)}
                onContextMenu={(e) => handleTopicContextMenu(e, c.id)}
                className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors duration-200 ease-out ${
                  selectedCluster === c.id ? 'bg-cream text-bark font-bold' : 'text-bark/70 hover:bg-sand/50'
                }`}
              >
                <span className="flex items-center gap-1">
                  <span className="block truncate">{c.name}</span>
                  {c.recentlyActive && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-deer shrink-0" />
                  )}
                </span>
                <span className="text-xs text-bark/40">{c.memberCount} 条</span>
              </button>
            ))
          )}
          <button
            onClick={() => console.log('新主题')}
            className="w-full text-left px-2 py-1.5 mt-2 rounded text-sm text-deer hover:bg-sand/50 transition-colors duration-200 ease-out"
          >
            + 新主题
          </button>
        </div>
      </aside>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white border border-brand-border rounded-lg shadow-md py-1 text-sm text-bark"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button onClick={() => handleContextAction('rename', contextMenu.clusterId)} className="block w-full text-left px-4 py-1.5 hover:bg-sand/50">重命名</button>
          <button onClick={() => handleContextAction('merge', contextMenu.clusterId)} className="block w-full text-left px-4 py-1.5 hover:bg-sand/50">合并</button>
          <button onClick={() => handleContextAction('delete', contextMenu.clusterId)} className="block w-full text-left px-4 py-1.5 hover:bg-sand/50 text-red-600">删除</button>
        </div>
      )}

      {/* Center: Diary Card Flow */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-4">
          {/* Filter bar */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {(['全部', '语音', '文字', '图片', '带文件'] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-xs transition-colors duration-200 ease-out ${
                  filter === f
                    ? 'bg-deer text-white'
                    : 'bg-sand/60 text-bark/60 hover:bg-sand'
                }`}
              >
                {f}
              </button>
            ))}
            <span className="mx-1 text-bark/30">|</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2 py-1 rounded text-xs bg-sand/60 text-bark/60 border-none outline-none"
              placeholder="开始日期"
            />
            <span className="text-xs text-bark/40">—</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-2 py-1 rounded text-xs bg-sand/60 text-bark/60 border-none outline-none"
              placeholder="结束日期"
            />
          </div>

          {loadingRecords ? (
            <p className="text-sm text-bark/40">加载中…</p>
          ) : filteredRecords.length === 0 ? (
            <p className="text-sm text-bark/40">暂无记录</p>
          ) : (
            <ul>
              {filteredRecords.map((r: any) => {
                const isExpanded = expandedCards.has(r.id)
                return (
                  <li key={r.id} className="mb-3">
                    <button
                      onClick={() => handleRecordClick(r.id)}
                      className={`w-full text-left px-4 py-4 rounded-lg border border-brand-border transition-all duration-200 ease-out hover:shadow-sm ${
                        selectedRecord?.id === r.id
                          ? 'bg-sand text-bark shadow-sm'
                          : 'bg-white text-bark/80 hover:bg-sand/50'
                      }`}
                    >
                      {/* Header: avatar + username + timestamp + input icon */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-6 h-6 rounded-full bg-deer/20 flex items-center justify-center text-xs font-medium text-bark">
                          Z
                        </div>
                        <span className="text-xs font-medium text-bark/70">Zed</span>
                        {r.created_at && (
                          <span className="text-xs text-bark/40">
                            {formatTime(r.created_at)}
                          </span>
                        )}
                        <span className="ml-auto text-sm">{getInputIcon(r.source)}</span>
                      </div>

                      {/* Body text */}
                      <p
                        className={`font-body text-sm leading-relaxed ${isExpanded ? '' : 'line-clamp-4'}`}
                        onClick={(e) => toggleExpand(r.id, e)}
                      >
                        {r.content || r.short_summary || r.source || r.id}
                      </p>

                      {/* Media preview */}
                      {r.source === 'image' && r.image_url && (
                        <div className="mt-2">
                          <img src={r.image_url} alt="" className="rounded max-h-40 object-cover" />
                        </div>
                      )}
                      {(r.source === 'file' || r.attachments?.length > 0) && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {(r.attachments ?? []).map((a: any, i: number) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-sand/60 rounded text-xs text-bark/60">
                              📎 {a.name || `文件 ${i + 1}`}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Bottom: topic tags + comment count + relation count */}
                      <div className="flex items-center gap-2 mt-2 text-xs text-bark/50">
                        {r.tags?.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {r.tags.map((t: string) => (
                              <span key={t} className="px-1.5 py-0.5 bg-sand rounded text-[#6B5E52]">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                        <span className="ml-auto flex items-center gap-2">
                          <span>💬 {r.comment_count ?? 0}</span>
                          <span>🔗 {r.relation_count ?? 0}</span>
                        </span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </main>

      {/* Right: Focus Sidebar (hidden by default, appears on diary click) */}
      <aside
        className={`w-[320px] shrink-0 border-l border-brand-border overflow-y-auto bg-sand transition-all duration-200 ease-out ${
          selectedRecord ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 hidden'
        }`}
      >
        {selectedRecord && (
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-display text-bark/50 uppercase tracking-wider">详情</h2>
              <button
                onClick={() => setSelectedRecord(null)}
                className="text-bark/40 hover:text-bark text-sm transition-colors duration-200 ease-out"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4 text-sm text-bark">
              {/* 📝 Full original text */}
              <section>
                <h3 className="text-xs font-semibold text-bark/50 mb-1">📝 原始记录</h3>
                {selectedRecord.content && (
                  <p className="whitespace-pre-wrap text-bark/80 leading-relaxed">
                    {selectedRecord.content}
                  </p>
                )}
                {/* Voice playback */}
                {selectedRecord.source === 'voice' && (
                  <div className="flex items-center gap-2 p-2 bg-sand/50 rounded-lg mt-2">
                    <span>🎙</span>
                    {selectedRecord.audio_url ? (
                      <audio controls className="flex-1 h-8" src={selectedRecord.audio_url}>
                        <track kind="captions" />
                      </audio>
                    ) : (
                      <span className="text-xs text-bark/40">语音回放（暂未可用）</span>
                    )}
                  </div>
                )}
              </section>

              {/* 📎 Attachments */}
              {selectedRecord.attachments?.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-bark/50 mb-1">📎 附件</h3>
                  <ul className="space-y-1">
                    {selectedRecord.attachments.map((a: any, i: number) => (
                      <li key={i} className="text-xs text-deer underline truncate">
                        📎 {a.name || a.url || `附件 ${i + 1}`}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* 🔗 Related records with percentage bars */}
              {selectedRecord.relations?.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-bark/50 mb-1">🔗 相关记录</h3>
                  <ul className="space-y-2">
                    {selectedRecord.relations.map((rel: any, i: number) => (
                      <li key={i} className="text-xs">
                        <div className="flex justify-between mb-0.5">
                          <span className="truncate text-bark/70">{rel.summary || rel.id}</span>
                          <span className="text-bark/40 shrink-0 ml-1">{Math.round((rel.score ?? 0) * 100)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-sand rounded-full overflow-hidden">
                          <div
                            className="h-full bg-sky/20 rounded-full"
                            style={{ width: `${Math.round((rel.score ?? 0) * 100)}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* 📂 Belonging topic/goal */}
              <section>
                {selectedRecord.notebook && (
                  <div className="text-xs text-bark/60">
                    <span className="font-semibold text-bark/50">📂 所属主题：</span>
                    <button
                      onClick={() => {
                        const match = clusters.find((c) => c.name === selectedRecord.notebook || c.id === selectedRecord.notebook)
                        if (match) setSelectedCluster(match.id)
                      }}
                      className="text-deer underline hover:text-deer/80 transition-colors duration-200 ease-out"
                    >
                      {selectedRecord.notebook}
                    </button>
                  </div>
                )}
                {selectedRecord.goal && (
                  <div className="text-xs text-bark/60 mt-1">
                    <span className="font-semibold text-bark/50">🎯 关联目标：</span>
                    {selectedRecord.goal}
                  </div>
                )}
              </section>

              {/* Metadata */}
              <dl className="space-y-2 text-xs text-bark/60">
                {selectedRecord.status && (
                  <div>
                    <dt className="text-bark/40">状态</dt>
                    <dd>{selectedRecord.status}</dd>
                  </div>
                )}
                {selectedRecord.source && (
                  <div>
                    <dt className="text-bark/40">来源</dt>
                    <dd>{selectedRecord.source}</dd>
                  </div>
                )}
                {selectedRecord.location_text && (
                  <div>
                    <dt className="text-bark/40">位置</dt>
                    <dd>{selectedRecord.location_text}</dd>
                  </div>
                )}
                {selectedRecord.created_at && (
                  <div>
                    <dt className="text-bark/40">创建时间</dt>
                    <dd>{new Date(selectedRecord.created_at).toLocaleString('zh-CN')}</dd>
                  </div>
                )}
                {selectedRecord.tags?.length > 0 && (
                  <div>
                    <dt className="text-bark/40">标签</dt>
                    <dd className="flex flex-wrap gap-1 mt-1">
                      {selectedRecord.tags.map((t: string) => (
                        <span key={t} className="px-1.5 py-0.5 bg-sand rounded text-bark/70">
                          {t}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>

              {/* 💬 Chat button */}
              <button className="w-full mt-2 py-2 rounded-lg bg-deer/10 text-deer text-sm font-medium hover:bg-deer/20 transition-colors duration-200 ease-out">
                💬 和路路聊聊这条记录
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
    </PCLayout>
  )
}
