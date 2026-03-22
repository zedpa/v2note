'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchClusters, type ClusterSummary } from '@/shared/lib/api/cognitive'
import { listRecords, getRecord } from '@/shared/lib/api/records'

export default function TimelinePage() {
  const [clusters, setClusters] = useState<ClusterSummary[]>([])
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)
  const [records, setRecords] = useState<any[]>([])
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null)
  const [loadingClusters, setLoadingClusters] = useState(true)
  const [loadingRecords, setLoadingRecords] = useState(false)

  // Load clusters on mount
  useEffect(() => {
    fetchClusters()
      .then(setClusters)
      .catch(() => {})
      .finally(() => setLoadingClusters(false))
  }, [])

  // Load records when cluster changes (or all records if none selected)
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

  return (
    <div className="h-screen bg-cream flex">
      {/* Left: Clusters */}
      <aside className="w-[200px] shrink-0 border-r border-brand-border overflow-y-auto">
        <div className="p-3">
          <h2 className="text-xs font-display text-bark/50 uppercase tracking-wider mb-2">聚类</h2>
          <button
            onClick={() => setSelectedCluster(null)}
            className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
              selectedCluster === null ? 'bg-sand text-bark font-medium' : 'text-bark/70 hover:bg-sand/50'
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
                  selectedCluster === c.id ? 'bg-sand text-bark font-medium' : 'text-bark/70 hover:bg-sand/50'
                }`}
              >
                <span className="block truncate">{c.name}</span>
                <span className="text-xs text-bark/40">{c.memberCount} 条</span>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Center: Records */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-4">
          <h2 className="text-xs font-display text-bark/50 uppercase tracking-wider mb-3">记录</h2>
          {loadingRecords ? (
            <p className="text-sm text-bark/40">加载中…</p>
          ) : records.length === 0 ? (
            <p className="text-sm text-bark/40">暂无记录</p>
          ) : (
            <ul className="space-y-1">
              {records.map((r: any) => (
                <li key={r.id}>
                  <button
                    onClick={() => handleRecordClick(r.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedRecord?.id === r.id
                        ? 'bg-sand text-bark'
                        : 'text-bark/80 hover:bg-sand/50'
                    }`}
                  >
                    <p className="truncate font-body">
                      {r.short_summary || r.source || r.id}
                    </p>
                    {r.created_at && (
                      <p className="text-xs text-bark/40 mt-0.5">
                        {new Date(r.created_at).toLocaleString('zh-CN')}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      {/* Right: Detail (shown on record select) */}
      {selectedRecord && (
        <aside className="w-[320px] shrink-0 border-l border-brand-border overflow-y-auto">
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
            <div className="space-y-3 text-sm text-bark">
              {selectedRecord.short_summary && (
                <p className="font-medium">{selectedRecord.short_summary}</p>
              )}
              {selectedRecord.content && (
                <p className="whitespace-pre-wrap text-bark/80 leading-relaxed">
                  {selectedRecord.content}
                </p>
              )}
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
            </div>
          </div>
        </aside>
      )}
    </div>
  )
}
