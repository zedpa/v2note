/**
 * 测试文件：语音转结构化待办
 * 对应 Spec：specs/voice-to-todo.md
 * 
 * 每个 describe 块对应 spec 中的一个场景
 * 测试命名格式：should_[期望行为]_when_[条件]
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { parseVoiceToTodo } from '@/features/voice-to-todo/parser'
import type { ParseVoiceInput, ParseVoiceResult } from '@/features/voice-to-todo/types'

// 固定测试时间，避免时间相关测试的不确定性
const MOCK_NOW = new Date('2026-03-23T10:00:00+08:00')

describe('语音转结构化待办 (Voice to Todo)', () => {
  
  // ============================================
  // 场景 1: 基本语音转待办（含明确时间和人物）
  // ============================================
  describe('场景 1: 基本转换 - 明确时间和人物', () => {
    it('should_提取标题时间人物_when_输入包含完整信息', async () => {
      const input: ParseVoiceInput = {
        text: '明天下午三点和张总开会讨论Q3预算',
        timestamp: MOCK_NOW,
      }

      const result = await parseVoiceToTodo(input)

      expect(result.success).toBe(true)
      expect(result.todos).toHaveLength(1)

      const todo = result.todos[0]
      expect(todo.title).toContain('开会讨论Q3预算')
      expect(todo.date).toBe('2026-03-24')       // 明天
      expect(todo.time).toBe('15:00')             // 下午三点
      expect(todo.people).toContain('张总')
    })
  })

  // ============================================
  // 场景 2: 模糊时间表述
  // ============================================
  describe('场景 2: 模糊时间', () => {
    it('should_标记时间待定_when_输入时间模糊', async () => {
      const input: ParseVoiceInput = {
        text: '下周找个时间 review 一下代码',
        timestamp: MOCK_NOW,
      }

      const result = await parseVoiceToTodo(input)

      expect(result.success).toBe(true)
      expect(result.todos).toHaveLength(1)

      const todo = result.todos[0]
      expect(
        todo.title.includes('review') || todo.title.includes('代码')
      ).toBe(true)
      expect(todo.timePending).toBe(true)
    })

    it('should_不抛出错误_when_时间无法精确解析', async () => {
      const input: ParseVoiceInput = {
        text: '有空的时候整理一下文档',
        timestamp: MOCK_NOW,
      }

      // 不应抛出异常
      await expect(parseVoiceToTodo(input)).resolves.not.toThrow()
    })
  })

  // ============================================
  // 场景 3: 多个待办事项
  // ============================================
  describe('场景 3: 一段文本中的多个待办', () => {
    it('should_生成两条待办_when_输入包含两个任务', async () => {
      const input: ParseVoiceInput = {
        text: '明天上午给李明发邮件，下午两点开产品评审会',
        timestamp: MOCK_NOW,
      }

      const result = await parseVoiceToTodo(input)

      expect(result.success).toBe(true)
      expect(result.todos).toHaveLength(2)

      // 第一条：发邮件
      const emailTodo = result.todos.find(t => t.title.includes('发邮件'))
      expect(emailTodo).toBeDefined()
      expect(emailTodo!.people).toContain('李明')

      // 第二条：产品评审会
      const meetingTodo = result.todos.find(t => t.title.includes('产品评审会'))
      expect(meetingTodo).toBeDefined()
      expect(meetingTodo!.time).toBe('14:00')
    })
  })

  // ============================================
  // 场景 4: 空白或无意义输入
  // ============================================
  describe('场景 4: 空输入处理', () => {
    it('should_返回空数组和提示_when_输入为空字符串', async () => {
      const input: ParseVoiceInput = {
        text: '',
        timestamp: MOCK_NOW,
      }

      const result = await parseVoiceToTodo(input)

      expect(result.success).toBe(true)
      expect(result.todos).toHaveLength(0)
      expect(result.message).toBeDefined()
      expect(result.message!.length).toBeGreaterThan(0)
    })

    it('should_返回空数组_when_输入只有空格', async () => {
      const input: ParseVoiceInput = {
        text: '   \n\t  ',
        timestamp: MOCK_NOW,
      }

      const result = await parseVoiceToTodo(input)

      expect(result.success).toBe(true)
      expect(result.todos).toHaveLength(0)
    })
  })

  // ============================================
  // 场景 5: 带优先级关键词
  // ============================================
  describe('场景 5: 优先级识别', () => {
    it('should_设为高优先级_when_包含紧急关键词', async () => {
      const input: ParseVoiceInput = {
        text: '紧急！今天必须完成报价单',
        timestamp: MOCK_NOW,
      }

      const result = await parseVoiceToTodo(input)

      expect(result.success).toBe(true)
      expect(result.todos).toHaveLength(1)
      expect(result.todos[0].priority).toBe('high')
      expect(result.todos[0].date).toBe('2026-03-23') // 今天
    })

    it('should_默认中优先级_when_没有优先级关键词', async () => {
      const input: ParseVoiceInput = {
        text: '周末去超市买东西',
        timestamp: MOCK_NOW,
      }

      const result = await parseVoiceToTodo(input)

      expect(result.todos[0].priority).toBe('medium')
    })
  })

  // ============================================
  // 场景 6: 纯闲聊无任务
  // ============================================
  describe('场景 6: 非任务内容过滤', () => {
    it('should_不生成待办_when_输入是闲聊', async () => {
      const input: ParseVoiceInput = {
        text: '今天天气真不错',
        timestamp: MOCK_NOW,
      }

      const result = await parseVoiceToTodo(input)

      expect(result.success).toBe(true)
      expect(result.todos).toHaveLength(0)
      expect(result.message).toContain('未检测到待办事项')
    })
  })

  // ============================================
  // 边界条件补充
  // ============================================
  describe('边界条件', () => {
    it('should_不崩溃_when_输入超过2000字符', async () => {
      const longText = '完成任务' + '额外内容'.repeat(500)
      const input: ParseVoiceInput = {
        text: longText,
        timestamp: MOCK_NOW,
      }

      const result = await parseVoiceToTodo(input)

      expect(result.success).toBe(true)
      // 不关心具体结果，关键是不崩溃
    })

    it('should_正常处理_when_输入包含emoji和特殊字符', async () => {
      const input: ParseVoiceInput = {
        text: '🔥 明天和 @王总 讨论方案!!!',
        timestamp: MOCK_NOW,
      }

      const result = await parseVoiceToTodo(input)

      expect(result.success).toBe(true)
    })

    it('should_处理中英文混合_when_输入混合两种语言', async () => {
      const input: ParseVoiceInput = {
        text: '周五 meeting with John 讨论 API design',
        timestamp: MOCK_NOW,
      }

      const result = await parseVoiceToTodo(input)

      expect(result.success).toBe(true)
      expect(result.todos.length).toBeGreaterThan(0)
    })
  })
})
