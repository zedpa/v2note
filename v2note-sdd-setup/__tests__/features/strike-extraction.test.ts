/**
 * 测试文件：Strike 提取（认知引擎核心）
 * 对应 Spec：specs/strike-extraction.md
 *
 * 每个 describe 块对应 spec 中的一个场景
 * 测试命名格式：should_[期望行为]_when_[条件]
 */

import { describe, it, expect } from 'vitest'
import { digestRecord } from '@/features/strike-extraction/digest'
import type { DigestInput, DigestResult, ExtractedStrike, ExtractedBond } from '@/features/strike-extraction/types'

// 固定测试时间
const MOCK_NOW = new Date('2026-03-23T10:00:00+08:00')

// 辅助：快速构建 DigestInput
function makeInput(text: string, overrides?: Partial<DigestInput>): DigestInput {
  return {
    record_id: 'test_record_001',
    text,
    source_type: 'think',
    timestamp: MOCK_NOW,
    user_id: 'test_user_001',
    ...overrides,
  }
}

// 辅助：在 strikes 中找到特定极性的 Strike
function findByPolarity(strikes: ExtractedStrike[], polarity: string): ExtractedStrike[] {
  return strikes.filter(s => s.polarity === polarity)
}

describe('Strike 提取 (Strike Extraction)', () => {

  // ============================================
  // 场景 1: 单条事实陈述 → 单个 perceive Strike
  // ============================================
  describe('场景 1: 事实陈述 → perceive', () => {
    it('should_提取perceive极性_when_输入事实陈述', async () => {
      const input = makeInput('张总说铝价涨了15%')
      const result = await digestRecord(input)

      expect(result.success).toBe(true)
      expect(result.strikes).toHaveLength(1)

      const strike = result.strikes[0]
      expect(strike.polarity).toBe('perceive')
      expect(strike.nucleus).toContain('铝价涨了15%')
      expect(strike.confidence).toBeGreaterThanOrEqual(0.7)
    })

    it('should_提取关联人_when_文本提到人名', async () => {
      const input = makeInput('张总说铝价涨了15%')
      const result = await digestRecord(input)

      expect(result.strikes[0].people).toContain('张总')
    })

    it('should_设置正常salience_when_source_type为think', async () => {
      const input = makeInput('张总说铝价涨了15%')
      const result = await digestRecord(input)

      // think 类型 salience 应为正常值（>= 0.5）
      expect(result.strikes[0].salience).toBeGreaterThanOrEqual(0.5)
    })
  })

  // ============================================
  // 场景 2: 判断性观点 → judge Strike
  // ============================================
  describe('场景 2: 判断观点 → judge', () => {
    it('should_提取judge极性_when_输入包含主观判断', async () => {
      const input = makeInput('我觉得我们应该换供应商')
      const result = await digestRecord(input)

      expect(result.success).toBe(true)
      expect(result.strikes).toHaveLength(1)
      expect(result.strikes[0].polarity).toBe('judge')
      expect(result.strikes[0].nucleus).toContain('换供应商')
    })

    it('should_识别judge_when_使用不同判断词', async () => {
      const inputs = [
        '我认为这个方案不可行',
        '应该把预算砍掉一半',
        '这个产品太平庸了',
      ]

      for (const text of inputs) {
        const result = await digestRecord(makeInput(text))
        expect(result.strikes.length).toBeGreaterThanOrEqual(1)
        expect(result.strikes[0].polarity).toBe('judge')
      }
    })
  })

  // ============================================
  // 场景 3: 顿悟认知 → realize Strike
  // ============================================
  describe('场景 3: 顿悟 → realize（高权重）', () => {
    it('should_提取realize极性_when_输入包含顿悟表述', async () => {
      const input = makeInput('突然想明白了，根本原因不是材料成本，是流程效率')
      const result = await digestRecord(input)

      expect(result.success).toBe(true)
      expect(result.strikes.length).toBeGreaterThanOrEqual(1)

      const realizes = findByPolarity(result.strikes, 'realize')
      expect(realizes.length).toBeGreaterThanOrEqual(1)

      const strike = realizes[0]
      expect(strike.nucleus).toMatch(/流程效率|根本原因/)
    })

    it('should_设置高置信度_when_极性为realize', async () => {
      const input = makeInput('突然想明白了，根本原因不是材料成本，是流程效率')
      const result = await digestRecord(input)

      const realizes = findByPolarity(result.strikes, 'realize')
      expect(realizes[0].confidence).toBeGreaterThanOrEqual(0.8)
    })
  })

  // ============================================
  // 场景 4: 意图行动 → intend Strike
  // ============================================
  describe('场景 4: 意图行动 → intend', () => {
    it('should_提取intend极性_when_输入包含行动意图', async () => {
      const input = makeInput('必须在Q2之前把吨成本降到X以下')
      const result = await digestRecord(input)

      expect(result.success).toBe(true)
      expect(result.strikes.length).toBeGreaterThanOrEqual(1)
      expect(result.strikes[0].polarity).toBe('intend')
    })

    it('should_提取intend_when_使用不同意图表达', async () => {
      const inputs = [
        '下周一定要完成报告',
        '让小李去做成本对比',
        '接下来要把核心功能赶紧搞好',
      ]

      for (const text of inputs) {
        const result = await digestRecord(makeInput(text))
        expect(result.strikes.length).toBeGreaterThanOrEqual(1)

        const intends = findByPolarity(result.strikes, 'intend')
        expect(intends.length).toBeGreaterThanOrEqual(1)
      }
    })
  })

  // ============================================
  // 场景 5: 情感表达 → feel Strike
  // ============================================
  describe('场景 5: 情感 → feel（排除逻辑链）', () => {
    it('should_提取feel极性_when_输入表达情感', async () => {
      const input = makeInput('这件事让我很不安')
      const result = await digestRecord(input)

      expect(result.success).toBe(true)
      expect(result.strikes.length).toBeGreaterThanOrEqual(1)
      expect(result.strikes[0].polarity).toBe('feel')
    })

    it('should_标记不参与逻辑链_when_极性为feel', async () => {
      const input = makeInput('这件事让我很不安')
      const result = await digestRecord(input)

      expect(result.strikes[0].participatesInLogicChain).toBe(false)
    })
  })

  // ============================================
  // 场景 6: 复杂段落 → 多个不同极性的 Strike
  // ============================================
  describe('场景 6: 复杂段落 → 多极性分拆', () => {
    const COMPLEX_TEXT = '今天和张总开会，他说铝价涨了15%，我觉得应该换供应商，但老王反对说风险太大，让小李去做成本对比'

    it('should_提取至少4个Strike_when_输入复杂段落', async () => {
      const input = makeInput(COMPLEX_TEXT)
      const result = await digestRecord(input)

      expect(result.success).toBe(true)
      expect(result.strikes.length).toBeGreaterThanOrEqual(4)
    })

    it('should_包含perceive_when_段落含事实', async () => {
      const input = makeInput(COMPLEX_TEXT)
      const result = await digestRecord(input)

      const perceives = findByPolarity(result.strikes, 'perceive')
      expect(perceives.length).toBeGreaterThanOrEqual(1)
      // 铝价事实
      expect(perceives.some(s => s.nucleus.includes('铝价') || s.nucleus.includes('15%'))).toBe(true)
    })

    it('should_包含judge_when_段落含观点', async () => {
      const input = makeInput(COMPLEX_TEXT)
      const result = await digestRecord(input)

      const judges = findByPolarity(result.strikes, 'judge')
      // 至少 "应该换供应商" 和 "风险太大"
      expect(judges.length).toBeGreaterThanOrEqual(2)
    })

    it('should_包含intend_when_段落含行动指令', async () => {
      const input = makeInput(COMPLEX_TEXT)
      const result = await digestRecord(input)

      const intends = findByPolarity(result.strikes, 'intend')
      expect(intends.length).toBeGreaterThanOrEqual(1)
      // "让小李做成本对比"
      expect(intends.some(s => s.people.includes('小李'))).toBe(true)
    })

    it('should_提取所有关联人_when_段落提到多人', async () => {
      const input = makeInput(COMPLEX_TEXT)
      const result = await digestRecord(input)

      const allPeople = result.strikes.flatMap(s => s.people)
      expect(allPeople).toContain('张总')
      expect(allPeople).toContain('老王')
      expect(allPeople).toContain('小李')
    })
  })

  // ============================================
  // 场景 7: 同段内 Bond 生成
  // ============================================
  describe('场景 7: 同段内 Bond', () => {
    const COMPLEX_TEXT = '今天和张总开会，他说铝价涨了15%，我觉得应该换供应商，但老王反对说风险太大，让小李去做成本对比'

    it('should_生成Bond_when_多Strike来自同段落', async () => {
      const input = makeInput(COMPLEX_TEXT)
      const result = await digestRecord(input)

      expect(result.bonds.length).toBeGreaterThan(0)
    })

    it('should_包含causal类型_when_存在因果关系', async () => {
      const input = makeInput(COMPLEX_TEXT)
      const result = await digestRecord(input)

      // "铝价涨了" → "应该换供应商" 是因果
      const causals = result.bonds.filter(b => b.type === 'causal')
      expect(causals.length).toBeGreaterThanOrEqual(1)
    })

    it('should_包含contradiction类型_when_存在矛盾', async () => {
      const input = makeInput(COMPLEX_TEXT)
      const result = await digestRecord(input)

      // "应该换供应商" ↔ "风险太大" 是矛盾
      const contradictions = result.bonds.filter(b => b.type === 'contradiction')
      expect(contradictions.length).toBeGreaterThanOrEqual(1)
    })

    it('should_Bond强度在合理范围_when_生成Bond', async () => {
      const input = makeInput(COMPLEX_TEXT)
      const result = await digestRecord(input)

      for (const bond of result.bonds) {
        expect(bond.strength).toBeGreaterThanOrEqual(0.5)
        expect(bond.strength).toBeLessThanOrEqual(1.0)
      }
    })

    it('should_Bond索引有效_when_指向strikes数组', async () => {
      const input = makeInput(COMPLEX_TEXT)
      const result = await digestRecord(input)

      for (const bond of result.bonds) {
        expect(bond.source_index).toBeGreaterThanOrEqual(0)
        expect(bond.source_index).toBeLessThan(result.strikes.length)
        expect(bond.target_index).toBeGreaterThanOrEqual(0)
        expect(bond.target_index).toBeLessThan(result.strikes.length)
        expect(bond.source_index).not.toBe(bond.target_index)
      }
    })
  })

  // ============================================
  // 场景 8: material 类型输入降权处理
  // ============================================
  describe('场景 8: material 降权', () => {
    it('should_降低salience_when_source_type为material', async () => {
      const input = makeInput('铝价在过去一个月上涨了15%，主要受到供应链中断的影响', {
        source_type: 'material',
      })
      const result = await digestRecord(input)

      expect(result.success).toBe(true)
      expect(result.strikes.length).toBeGreaterThanOrEqual(1)

      // material 的 salience 应 <= 0.2（正常值的 1/5）
      for (const strike of result.strikes) {
        expect(strike.salience).toBeLessThanOrEqual(0.2)
      }
    })

    it('should_标记不参与涌现_when_source_type为material', async () => {
      const input = makeInput('供应链报告：全球铝产量下降3%', {
        source_type: 'material',
      })
      const result = await digestRecord(input)

      for (const strike of result.strikes) {
        expect(strike.participatesInEmergence).toBe(false)
      }
    })

    it('should_think类型参与涌现_when_source_type为think', async () => {
      const input = makeInput('我觉得铝价还会继续涨')
      const result = await digestRecord(input)

      for (const strike of result.strikes) {
        expect(strike.participatesInEmergence).toBe(true)
      }
    })
  })

  // ============================================
  // 场景 9: 空输入或无意义输入
  // ============================================
  describe('场景 9: 空/无意义输入', () => {
    it('should_返回空strikes_when_输入为空字符串', async () => {
      const input = makeInput('')
      const result = await digestRecord(input)

      expect(result.success).toBe(true)
      expect(result.strikes).toHaveLength(0)
      expect(result.bonds).toHaveLength(0)
      expect(result.digested).toBe(true)
    })

    it('should_返回空strikes_when_输入为纯标点', async () => {
      const input = makeInput('。。。')
      const result = await digestRecord(input)

      expect(result.success).toBe(true)
      expect(result.strikes).toHaveLength(0)
      expect(result.digested).toBe(true)
    })

    it('should_不抛出错误_when_输入为空格和换行', async () => {
      const input = makeInput('   \n\t  ')
      await expect(digestRecord(input)).resolves.not.toThrow()

      const result = await digestRecord(input)
      expect(result.success).toBe(true)
      expect(result.digested).toBe(true)
    })
  })

  // ============================================
  // 边界条件
  // ============================================
  describe('边界条件', () => {
    it('should_不崩溃_when_输入超过5000字符', async () => {
      const longText = '我觉得应该换供应商' + '，这个问题需要深入分析'.repeat(500)
      const input = makeInput(longText)

      const result = await digestRecord(input)
      expect(result.success).toBe(true)
      expect(result.strikes.length).toBeGreaterThan(0)
    })

    it('should_识别极性_when_输入为纯英文', async () => {
      const input = makeInput('I think we should change the supplier immediately')
      const result = await digestRecord(input)

      expect(result.success).toBe(true)
      // 至少不崩溃，能提取出 Strike
      expect(result.strikes.length).toBeGreaterThanOrEqual(1)
    })

    it('should_设置field.timestamp_when_提供timestamp', async () => {
      const input = makeInput('张总说铝价涨了')
      const result = await digestRecord(input)

      expect(result.strikes[0].field.timestamp).toBeDefined()
      expect(result.strikes[0].field.timestamp).toContain('2026-03-23')
    })

    it('should_confidence低于阈值_when_极性判定模糊', async () => {
      // 这段话没有明确的极性倾向
      const input = makeInput('嗯')
      const result = await digestRecord(input)

      if (result.strikes.length > 0) {
        // 模糊输入的置信度应较低
        expect(result.strikes[0].confidence).toBeLessThan(0.7)
      }
    })
  })

  // ============================================
  // 真实数据验证（来自 flomo 导出）
  // ============================================
  describe('真实数据: flomo 日记样本', () => {
    it('should_提取realize_when_输入包含第一性原理洞察', async () => {
      const input = makeInput(
        '大家都焦虑说明都没有把握秦楚本质：发展的第一性原理从来都是已有的东西自动化，然后人不得不继续开拓新的边界'
      )
      const result = await digestRecord(input)

      expect(result.success).toBe(true)
      const realizes = findByPolarity(result.strikes, 'realize')
      expect(realizes.length).toBeGreaterThanOrEqual(1)
    })

    it('should_提取intend_when_输入包含产品规划', async () => {
      const input = makeInput(
        '花一周时间跑通最核心的"语音录入 -> 主动拆解为待办/知识图谱 -> 推动行动->复盘"'
      )
      const result = await digestRecord(input)

      expect(result.success).toBe(true)
      const intends = findByPolarity(result.strikes, 'intend')
      expect(intends.length).toBeGreaterThanOrEqual(1)
    })

    it('should_提取feel_when_输入包含焦虑情绪', async () => {
      const input = makeInput('30，今年过年总是感觉难受，一种巨大的惶恐追逐着我')
      const result = await digestRecord(input)

      expect(result.success).toBe(true)
      const feels = findByPolarity(result.strikes, 'feel')
      expect(feels.length).toBeGreaterThanOrEqual(1)
      expect(feels[0].participatesInLogicChain).toBe(false)
    })

    it('should_提取judge_when_输入包含产品判断', async () => {
      const input = makeInput(
        '老是想要做加法，老是想要我产品里面塞一堆功能。能不能反过来，能不能做减法。能不能只把一个核心的功能打磨出来'
      )
      const result = await digestRecord(input)

      expect(result.success).toBe(true)
      const judges = findByPolarity(result.strikes, 'judge')
      expect(judges.length).toBeGreaterThanOrEqual(1)
    })

    it('should_提取多极性_when_输入复杂语音段落', async () => {
      const input = makeInput(
        '我的一个产品，我需要有一个明确的、清晰的规划。因为现在的话，我整个做事情就是没有一个非常明确的目标和节点，现在还是处在一个凭感觉做的阶段。每天都在坚持往前做一点，往前优化一点，但是没有一个阶段，没有一个节点。这样的话，我也不知道什么时候是失败。其实，失败应该给它一个明确的界限，不应该让一个不好的产品一直浪费你的时间。'
      )
      const result = await digestRecord(input)

      expect(result.success).toBe(true)
      // 这段话包含 intend（需要明确规划）、judge（凭感觉不好）、realize（失败要有界限）
      expect(result.strikes.length).toBeGreaterThanOrEqual(2)
      const polarities = new Set(result.strikes.map(s => s.polarity))
      expect(polarities.size).toBeGreaterThanOrEqual(2)
    })
  })
})
