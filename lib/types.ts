export interface Device {
  id: string
  device_identifier: string
  platform: string
  created_at: string
}

export interface Record {
  id: string
  device_id: string
  status: 'uploading' | 'uploaded' | 'processing' | 'completed' | 'failed'
  audio_path: string | null
  duration_seconds: number | null
  location_text: string | null
  archived: boolean
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

export interface WeeklyReview {
  id: string
  device_id: string
  week_start: string
  week_end: string
  summary: string
  stats: {
    total_records?: number
    total_todos?: number
    completed_todos?: number
    total_ideas?: number
  }
  created_at: string
}

// Composite type for note display (record + summary + tags)
export interface NoteItem {
  id: string
  title: string
  short_summary: string
  tags: string[]
  date: string
  time: string
  location: string | null
  status: Record['status']
  duration_seconds: number | null
  created_at: string
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
}

export interface IdeaItem {
  id: string
  text: string
  source: string | null
  record_id: string
  created_at: string
}
