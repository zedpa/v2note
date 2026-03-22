'use client'

import { useState } from 'react'
import { api } from '@/shared/lib/api'
import { toast } from 'sonner'

interface SourceTypeBadgeProps {
  recordId: string
  currentType: 'think' | 'material'
}

export function SourceTypeBadge({ recordId, currentType }: SourceTypeBadgeProps) {
  const [type, setType] = useState(currentType)

  const toggle = () => {
    const newType = type === 'think' ? 'material' : 'think'
    setType(newType)
    api.patch(`/api/v1/records/${recordId}/source-type`, { source_type: newType })
      .catch(() => {
        setType(type) // rollback
        toast.error('切换失败')
      })
  }

  return (
    <button
      onClick={toggle}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors duration-200 border border-brand-border hover:bg-sand/60"
    >
      {type === 'material' ? '📎 素材' : '🧠 Think'}
    </button>
  )
}
