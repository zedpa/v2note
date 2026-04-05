export interface AuthIdentity {
  deviceId: string
  userId: string
}

export interface AppUser {
  id: string
  phone: string | null
  email: string | null
  displayName: string | null
  avatarUrl: string | null
  createdAt: string
}

export type UserType = 'manager' | 'creator' | null

export interface Device {
  id: string
  device_identifier: string
  platform: string
  user_type: UserType
  created_at: string
}

export interface Record {
  id: string
  device_id: string
  status: 'uploading' | 'uploaded' | 'processing' | 'completed' | 'failed' | 'error' | 'pending_retry' | 'expired'
  audio_path: string | null
  duration_seconds: number | null
  location_text: string | null
  archived: boolean
  file_url: string | null
  file_name: string | null
  created_at: string
  updated_at: string
}

export interface Transcript {
  id: string
  record_id: string
  text: string
  language: string | null
  created_at: string
}

export interface Summary {
  id: string
  record_id: string
  title: string
  short_summary: string
  long_summary: string
  created_at: string
}

export interface Tag {
  id: string
  name: string
}

export interface RecordTag {
  record_id: string
  tag_id: string
}

export interface Todo {
  id: string
  record_id: string
  text: string
  done: boolean
  created_at: string
}

export interface Idea {
  id: string
  record_id: string
  text: string
  created_at: string
}

export interface ManagerWeeklyReviewDataA {
  state: 'A'
  state_label: string
  sections: {
    key_events: {
      new_clients: string[]
      existing_clients: string[]
      market_actions: string[]
    }
    impact_factors: {
      positive: string[]
      negative: string[]
    }
    warnings: string[]
    next_week_actions: {
      continue: string[]
      adjust: string[]
    }
  }
}

export interface ManagerWeeklyReviewDataB {
  state: 'B'
  state_label: string
  sections: {
    team_interactions: {
      outstanding: string[]
      needs_attention: string[]
    }
    recurring_issues: string[]
    management_signals: {
      frequently_mentioned: string[]
      ignored_risks: string[]
    }
    next_week_actions: {
      one_on_one: string[]
      clarify_requirements: string[]
    }
  }
}

export interface CreatorWeeklyReviewData {
  state: 'creator'
  sections: {
    themes: string[]
    best_ideas: string[]
    connections: string[]
    creative_momentum: string
    next_week_focus: string[]
  }
}

export type WeeklyReviewStructuredData =
  | ManagerWeeklyReviewDataA
  | ManagerWeeklyReviewDataB
  | CreatorWeeklyReviewData

export interface Review {
  id: string
  device_id: string
  period: 'daily' | 'weekly' | 'monthly' | 'yearly'
  period_start: string
  period_end: string
  summary: string
  stats: {
    total_records?: number
    total_todos?: number
    completed_todos?: number
    total_ideas?: number
  }
  structured_data: WeeklyReviewStructuredData | null
  created_at: string
}

/** @deprecated Use Review instead */
export type WeeklyReview = Review

export interface HierarchyTag {
  label: string
  level: number // 1=L1, 2=L2, 3=L3(domain)
}

// Composite type for note display (record + summary + tags)
export interface NoteItem {
  id: string
  title: string
  short_summary: string
  tags: string[]
  hierarchy_tags: HierarchyTag[]
  date: string
  time: string
  location: string | null
  status: Record['status']
  duration_seconds: number | null
  audio_path: string | null
  file_url: string | null
  file_name: string | null
  created_at: string
  domain?: string | null
}

// Composite type for note detail
export interface NoteDetail {
  record: Record
  transcript: Transcript | null
  summary: Summary | null
  tags: Tag[]
  todos: Todo[]
  ideas: Idea[]
}

export interface TodoItem {
  id: string
  text: string
  done: boolean
  source: string | null
  record_id: string
  created_at: string
  scheduled_start?: string
  scheduled_end?: string
  estimated_minutes?: number
  priority?: number
  domain?: string
  impact?: number
  ai_actionable?: boolean
  ai_action_plan?: string[]
  goal_id?: string
  parent_id?: string | null
  level?: number
  cluster_id?: string | null
  status?: string
  subtask_count?: number
  subtask_done_count?: number
  goal_title?: string | null
}

export interface Goal {
  id: string
  device_id: string
  title: string
  parent_id: string | null
  cluster_id?: string | null
  domain?: string | null
  status: 'active' | 'paused' | 'completed' | 'abandoned' | 'progressing' | 'blocked' | 'suggested' | 'dismissed'
  source: 'speech' | 'chat' | 'manual' | 'explicit' | 'emerged'
  created_at: string
  updated_at: string
}

export interface PendingIntent {
  id: string
  device_id: string
  record_id: string | null
  intent_type: 'wish' | 'goal' | 'complaint' | 'reflection'
  text: string
  context: string | null
  status: 'pending' | 'confirmed' | 'dismissed' | 'promoted'
  promoted_to: string | null
  created_at: string
}

export interface IdeaItem {
  id: string
  text: string
  source: string | null
  record_id: string
  created_at: string
}

export interface MemoryEntry {
  id: string
  device_id: string
  content: string
  source_date: string | null
  importance: number
  created_at: string
}

export interface Soul {
  id: string
  device_id: string
  content: string
  updated_at: string
}
