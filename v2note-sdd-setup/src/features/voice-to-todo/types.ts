/**
 * 语音转待办 - 类型定义
 * 来源：specs/voice-to-todo.md → 接口约定
 */

export interface ParseVoiceInput {
  /** 语音转文字后的文本 */
  text: string
  /** 输入时间（用于解析相对时间），默认 Date.now() */
  timestamp?: Date
  /** 时区，默认 'Asia/Shanghai' */
  timezone?: string
}

export interface ParseVoiceResult {
  /** 是否成功执行（即使没有待办也算成功） */
  success: boolean
  /** 解析出的待办列表 */
  todos: ParsedTodo[]
  /** 提示信息（空输入、无任务时显示） */
  message?: string
}

export interface ParsedTodo {
  /** 待办标题 */
  title: string
  /** 日期，ISO 格式 YYYY-MM-DD，无法解析时为 undefined */
  date?: string
  /** 时间，HH:mm 格式，无法解析时为 undefined */
  time?: string
  /** 时间是否待定（"找个时间"、"有空的时候"） */
  timePending?: boolean
  /** 优先级 */
  priority: 'high' | 'medium' | 'low'
  /** 关联人列表 */
  people: string[]
  /** 原始对应文本片段 */
  rawText: string
}
