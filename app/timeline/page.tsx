'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchClusters, type ClusterSummary } from '@/shared/lib/api/cognitive'
import { listRecords, getRecord } from '@/shared/lib/api/records'

type FilterType = '全部' | '语音' | '文字' | '图片'

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

export default function TimelinePage() {
  const [clusters, setClusters] = useState<ClusterSummary[]>([])
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)
  const [records, setRecords] = useState<any[]>([])
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null)
  const [loadingClusters, setLoadingClusters] = useState(true)
  const [loadingRecords, setLoadingRecords] = useState(false)
  const [filter, setFilter] = useState<FilterType>('全部')

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

  const filteredRecords = records.filter((r) => {
    if (filter === '全部') return true
    if (filter === '语音') return r.source === 'voice'
    if (filter === '文字') return r.source === 'text'
    if (filter === '图片') return r.source === 'image'
    return true
  })

  return (
    <div className="h-screen bg-cream flex">
      {/* Left: Structure Navigation */}
      <aside className="w-[200px] shrink-0 border-r border-brand-border overflow-y-auto">
        <div className="p-3">
          <h2 className="text-xs font-display text-bark/50 uppercase tracking-wider mb-2">主题</h2>
          <button
            onClick={() => setSelectedCluster(null)}
            className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
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
                className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                  selectedCluster === c.id ? 'bg-cream text-bark font-bold' : 'text-bark/70 hover:bg-sand/50'
                }`}
              >
                <span className="block truncate">{c.name}</span>
                <span className="text-xs text-bark/40">{c.memberCount} 条</span>
              </button>
            ))
          )}
          <button className="w-full text-left px-2 py-1.5 mt-2 rounded text-sm text-deer hover:bg-sand/50 transition-colors">
            + 新主题
          </button>
        </div>
      </aside>

      {/* Center: Diary Card Flow */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-4">
          {/* Filter bar */}
          <div className="flex items-center gap-2 mb-4">
            {(['全部', '语音', '文字', '图片'] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-xs transition-colors ${
                  filter === f
                    ? 'bg-deer text-white'
                    : 'bg-sand/60 text-bark/60 hover:bg-sand'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {loadingRecords ? (
            <p className="text-sm text-bark/40">加载中…</p>
          ) : filteredRecords.length === 0 ? (
            <p className="text-sm text-bark/40">暂无记录</p>
          ) : (
            <ul className="space-y-3">
              {filteredRecords.map((r: any) => (
                <li key={r.id}>
                  <button
                    onClick={() => handleRecordClick(r.id)}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                      selectedRecord?.id === r.id
                        ? 'bg-sand text-bark shadow-sm'
                        : 'bg-white text-bark/80 hover:bg-sand/50 border border-brand-border'
                    }`}
                  >
                    {/* Header: avatar + username + timestamp + input icon */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-6 h-6 rounded-full bg-deer/20 flex items-center justify-center text-xs">
                        我
                      </div>
                      <span className="text-xs font-medium text-bark/70">我</span>
                      {r.created_at && (
                        <span className="text-xs text-bark/40">
                          {new Date(r.created_at).toLocaleString('zh-CN')}
                        </span>
                      )}
                      <span className="ml-auto text-sm">{getInputIcon(r.source)}</span>
                    </div>

                    {/* Body text */}
                    <p className="font-body text-sm leading-relaxed line-clamp-3">
                      {r.content || r.short_summary || r.source || r.id}
                    </p>

                    {/* Bottom: topic tags + comment count + relation count */}
                    <div className="flex items-center gap-2 mt-2 text-xs text-bark/50">
                      {r.tags?.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {r.tags.map((t: string) => (
                            <span key={t} className="px-1.5 py-0.5 bg-sand rounded text-bark/60">
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
              ))}
            </ul>
          )}
        </div>
      </main>

      {/* Right: Focus Sidebar (hidden by default, appears on diary click) */}
      {selectedRecord && (
        <aside className="w-[320px] shrink-0 border-l border-brand-border overflow-y-auto bg-white">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-display text-bark/50 uppercase tracking-wider">详情</h2>
              <button
                onClick={() => setSelectedRecord(null)}
                className="text-bark/40 hover:text-bark text-sm"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4 text-sm text-bark">
              {/* Full original text */}
              {selectedRecord.content && (
                <p className="whitespace-pre-wrap text-bark/80 leading-relaxed">
                  {selectedRecord.content}
                </p>
              )}

              {/* Voice playback */}
              {selectedRecord.source === 'voice' && selectedRecord.audio_url && (
                <div className="flex items-center gap-2 p-2 bg-sand/50 rounded-lg">
                  <span>🎙</span>
                  <audio controls className="flex-1 h-8" src={selectedRecord.audio_url}>
                    <track kind="captions" />
                  </audio>
                </div>
              )}

              {/* Attachments */}
              {selectedRecord.attachments?.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-bark/50 mb-1">附件</h3>
                  <ul className="space-y-1">
                    {selectedRecord.attachments.map((a: any, i: number) => (
                      <li key={i} className="text-xs text-deer underline truncate">
                        📎 {a.name || a.url || `附件 ${i + 1}`}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Related records with percentage bars */}
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
                            className="h-full bg-deer rounded-full"
                            style={{ width: `${Math.round((rel.score ?? 0) * 100)}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Belonging topic/goal */}
              <section>
                {selectedRecord.notebook && (
                  <div className="text-xs text-bark/60">
                    <span className="font-semibold text-bark/50">📂 所属主题：</span>
                    {selectedRecord.notebook}
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

              {/* Chat button */}
              <button className="w-full mt-2 py-2 rounded-lg bg-deer/10 text-deer text-sm font-medium hover:bg-deer/20 transition-colors">
                💬 和路路聊聊这条记录
              </button>
            </div>
          </div>
        </aside>
      )}
    </div>
  )
}
