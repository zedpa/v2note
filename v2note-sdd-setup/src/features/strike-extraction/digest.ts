/**
 * Strike 提取 - 核心实现（Phase 1: 规则引擎）
 *
 * 对应 Spec：specs/strike-extraction.md
 * 对应测试：__tests__/features/strike-extraction.test.ts
 *
 * Phase 1 用规则引擎 + 关键词匹配实现，不依赖外部 AI API
 * Phase 2 接入 LLM 做深度语义解析
 */

import type {
  DigestInput,
  DigestResult,
  ExtractedStrike,
  ExtractedBond,
  Polarity,
  BondType,
  StrikeField,
} from './types'

// ============ 极性检测规则 ============

interface PolarityRule {
  polarity: Polarity
  // 每条 pattern 带权重，匹配越多置信度越高
  patterns: { regex: RegExp; weight: number }[]
  // 基础置信度
  baseConfidence: number
}

const POLARITY_RULES: PolarityRule[] = [
  {
    polarity: 'realize',
    patterns: [
      { regex: /突然(想明白|意识到|发现|领悟|醒悟)/, weight: 0.3 },
      { regex: /原来(是|如此)/, weight: 0.2 },
      { regex: /根本原因(是|在于|不是)/, weight: 0.3 },
      { regex: /本质(是|就是)/, weight: 0.25 },
      { regex: /第一性原理/, weight: 0.3 },
      { regex: /核心(是|就是)[^，。]{2,}/, weight: 0.2 },
      { regex: /深层次/, weight: 0.15 },
      { regex: /这一点对我的启发/, weight: 0.25 },
      { regex: /洞察/, weight: 0.2 },
      { regex: /想明白/, weight: 0.25 },
    ],
    baseConfidence: 0.8,
  },
  {
    polarity: 'feel',
    patterns: [
      { regex: /让我(很|非常|特别)?(不安|焦虑|惶恐|难受|痛苦|害怕|恐惧|烦躁)/, weight: 0.35 },
      { regex: /感觉(难受|不安|焦虑|惶恐|害怕)/, weight: 0.3 },
      { regex: /一种巨大的(惶恐|焦虑|恐惧|不安)/, weight: 0.35 },
      { regex: /(开心|兴奋|激动|幸福|满足|感动)/, weight: 0.2 },
      { regex: /心里(很|特别)?(难过|难受|不舒服|不是滋味)/, weight: 0.3 },
    ],
    baseConfidence: 0.75,
  },
  {
    polarity: 'intend',
    patterns: [
      { regex: /必须(在|要|得)/, weight: 0.25 },
      { regex: /一定要/, weight: 0.25 },
      { regex: /让.{1,4}(去|来)(做|搞|完成|处理|对比|调研)/, weight: 0.3 },
      { regex: /接下来(要|得|应该)/, weight: 0.2 },
      { regex: /花(一周|一天|一个月).*(跑通|完成|搞定)/, weight: 0.25 },
      { regex: /赶紧(搞|做|完成)/, weight: 0.2 },
      { regex: /下(周|个月|一步).*(要|得|必须|完成|做)/, weight: 0.2 },
      { regex: /提醒我/, weight: 0.3 },
      { regex: /(计划|打算|准备)(做|搞|去)/, weight: 0.2 },
      { regex: /(做|搞|写|建|创建)一个/, weight: 0.15 },
    ],
    baseConfidence: 0.7,
  },
  {
    polarity: 'judge',
    patterns: [
      { regex: /我(觉得|认为|感觉|怀疑)/, weight: 0.25 },
      { regex: /(应该|不应该|不该)/, weight: 0.2 },
      { regex: /能不能(反过来|做减法|换)/, weight: 0.2 },
      { regex: /太(平庸|难|简单|复杂|急躁|琐碎)了/, weight: 0.2 },
      { regex: /(最好|最优|最重要|最关键)(的|是)/, weight: 0.15 },
      { regex: /不要(再|做|让|搞)/, weight: 0.15 },
      { regex: /老是(想|在)/, weight: 0.15 },
      { regex: /永远(不|不可能)/, weight: 0.2 },
      { regex: /反对/, weight: 0.2 },
      { regex: /风险太大/, weight: 0.2 },
    ],
    baseConfidence: 0.7,
  },
  {
    polarity: 'perceive',
    patterns: [
      { regex: /.{1,4}说/, weight: 0.15 },
      { regex: /发现|看到|听到|注意到/, weight: 0.15 },
      { regex: /涨了|降了|上升|下降/, weight: 0.15 },
      { regex: /今天|昨天|刚才/, weight: 0.1 },
    ],
    baseConfidence: 0.65,
  },
]

// ============ 人名提取 ============

function extractPeople(text: string): string[] {
  const people: string[] = []
  const patterns = [
    // "张总"、"王经理"、"李工" 等
    /([张王李赵刘陈杨黄吴周徐孙马朱胡林郭何高罗][总经理工哥姐叔阿婆])/g,
    // "小李"、"小张"
    /(小[张王李赵刘陈杨黄吴周徐孙马朱胡林郭何高罗])/g,
    // "老王"、"老李"
    /(老[张王李赵刘陈杨黄吴周徐孙马朱胡林郭何高罗])/g,
    // "李明"、"张华" 等两字名
    /([张王李赵刘陈杨黄吴周徐孙马朱胡林郭何高罗][明华伟芳静强磊洋勇军亮])/g,
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1]
      if (!people.includes(name)) people.push(name)
    }
  }
  return people
}

// ============ 极性检测 ============

interface PolarityResult {
  polarity: Polarity
  confidence: number
}

function detectPolarity(text: string): PolarityResult {
  let bestPolarity: Polarity = 'perceive'
  let bestScore = 0
  let bestBaseConf = 0.65

  for (const rule of POLARITY_RULES) {
    let score = 0
    for (const p of rule.patterns) {
      if (p.regex.test(text)) {
        score += p.weight
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestPolarity = rule.polarity
      bestBaseConf = rule.baseConfidence
    }
  }

  // 置信度 = 基础置信度 + 匹配加成，上限 0.95
  const confidence = Math.min(0.95, bestBaseConf + bestScore * 0.3)

  // 极短文本且无明确匹配 → 低置信度
  if (bestScore === 0 && text.length < 5) {
    return { polarity: 'perceive', confidence: 0.4 }
  }

  return { polarity: bestPolarity, confidence }
}

// ============ 语义核心提取 ============

function extractNucleus(text: string): string {
  // 取第一句有意义的话
  const sentences = text.split(/[。！？\n]/).filter(s => s.trim().length > 3)
  if (sentences.length === 0) return text.substring(0, 80).trim()

  let nucleus = sentences[0].trim()
  // 去掉开头的连接词
  nucleus = nucleus.replace(/^(然后|接着|所以|因此|但是|不过)\s*[，,]?\s*/, '')
  if (nucleus.length > 80) nucleus = nucleus.substring(0, 77) + '...'
  return nucleus
}

// ============ 文本分句（用于复杂段落拆分） ============

interface Segment {
  text: string
  startOffset: number
}

/**
 * 将文本拆分为语义段落。
 * 策略：按逻辑连接词（"但"、"然后"、"让"等）和标点分句，
 * 每个 segment 应是一个独立的认知单元。
 */
function splitIntoSegments(text: string): Segment[] {
  // 先按强分隔符分（句号、换行等）
  const sentences = text.split(/(?<=[。！？\n])/).filter(s => s.trim().length > 0)

  const segments: Segment[] = []
  let offset = 0

  for (const sentence of sentences) {
    // 每个句子内，再按逻辑转折词分
    const clauses = sentence.split(/(?=[，,](?:但|而|让|我觉得|他说|又|还|不过|然后|接着|所以))/)
      .filter(c => c.trim().length > 3)

    if (clauses.length > 1) {
      // 多子句 → 分开
      for (const clause of clauses) {
        const trimmed = clause.replace(/^[，,\s]+/, '').trim()
        if (trimmed.length > 3) {
          segments.push({ text: trimmed, startOffset: offset })
        }
        offset += clause.length
      }
    } else {
      // 单子句 → 保留完整
      const trimmed = sentence.trim()
      if (trimmed.length > 3) {
        segments.push({ text: trimmed, startOffset: offset })
      }
      offset += sentence.length
    }
  }

  // 如果只有 1 个 segment 且文本较长，尝试更简单的逗号分句
  if (segments.length <= 1 && text.length > 40) {
    const fallbackParts = text.split(/[，,；;]/).filter(p => p.trim().length > 5)
    if (fallbackParts.length >= 3) {
      segments.length = 0
      let off = 0
      for (const part of fallbackParts) {
        segments.push({ text: part.trim(), startOffset: off })
        off += part.length + 1
      }
    }
  }

  return segments.length > 0 ? segments : [{ text: text.trim(), startOffset: 0 }]
}

// ============ Bond 检测（同段落内） ============

function detectBonds(strikes: ExtractedStrike[]): ExtractedBond[] {
  const bonds: ExtractedBond[] = []
  if (strikes.length < 2) return bonds

  for (let i = 0; i < strikes.length; i++) {
    for (let j = i + 1; j < strikes.length; j++) {
      const a = strikes[i]
      const b = strikes[j]

      // 因果检测：perceive → judge 或 perceive → intend
      if (a.polarity === 'perceive' && (b.polarity === 'judge' || b.polarity === 'intend')) {
        bonds.push({
          source_index: i,
          target_index: j,
          type: 'causal',
          strength: 0.7,
        })
      }

      // 矛盾检测：两个 judge 且一个正面一个负面
      if (a.polarity === 'judge' && b.polarity === 'judge') {
        const aText = a.rawText
        const bText = b.rawText
        const hasOpposition =
          (/应该|可以|要/.test(aText) && /反对|不应该|风险|不行|不可以/.test(bText)) ||
          (/反对|不应该|风险|不行/.test(aText) && /应该|可以|要/.test(bText))
        if (hasOpposition) {
          bonds.push({
            source_index: i,
            target_index: j,
            type: 'contradiction',
            strength: 0.8,
          })
        }
      }

      // depends_on: intend 依赖于另一个 intend 或 perceive
      if (b.polarity === 'intend' && a.polarity === 'intend' && i !== j) {
        // 简单判断：如果后一个 intend 以 "让" 开头，可能是子任务
        if (/^让/.test(b.rawText)) {
          bonds.push({
            source_index: j,
            target_index: i,
            type: 'depends_on',
            strength: 0.6,
          })
        }
      }
    }
  }

  return bonds
}

// ============ 判断是否无意义输入 ============

function isMeaningless(text: string): boolean {
  const cleaned = text.replace(/[\s\n\t\r]/g, '')
  if (cleaned.length === 0) return true

  // 纯标点
  if (/^[。，！？、；：""''（）《》…—\.\,\!\?\;\:\s]+$/.test(cleaned)) return true

  return false
}

// ============ 主函数 ============

export async function digestRecord(
  input: DigestInput
): Promise<DigestResult> {
  try {
    const { text, source_type, timestamp, user_id } = input

    // 空输入/无意义输入
    if (isMeaningless(text)) {
      return {
        success: true,
        strikes: [],
        bonds: [],
        digested: true,
      }
    }

    const isMaterial = source_type === 'material'
    const ts = timestamp ?? new Date()
    const tsStr = ts.toISOString().substring(0, 10)

    const field: StrikeField = {
      timestamp: ts.toISOString(),
    }

    // 尝试拆分为多个语义 segment
    // 短文本直接作为单个 segment，长文本按逻辑子句拆分
    const segments = text.length < 30
      ? [{ text: text.trim(), startOffset: 0 }]
      : splitIntoSegments(text)

    const strikes: ExtractedStrike[] = []

    for (const seg of segments) {
      if (seg.text.length < 2) continue

      const { polarity, confidence } = detectPolarity(seg.text)
      const nucleus = extractNucleus(seg.text)
      const people = extractPeople(seg.text)

      // salience: think 正常（1.0），material 降权（0.1 ~ 0.2）
      const baseSalience = isMaterial ? 0.1 : 1.0

      strikes.push({
        nucleus,
        polarity,
        confidence,
        salience: baseSalience,
        people,
        field: { ...field },
        rawText: seg.text,
        participatesInLogicChain: polarity !== 'feel',
        participatesInEmergence: !isMaterial,
      })
    }

    // Bond 检测
    const bonds = detectBonds(strikes)

    return {
      success: true,
      strikes,
      bonds,
      digested: true,
    }
  } catch (err) {
    return {
      success: false,
      strikes: [],
      bonds: [],
      digested: false,
      message: err instanceof Error ? err.message : String(err),
    }
  }
}
