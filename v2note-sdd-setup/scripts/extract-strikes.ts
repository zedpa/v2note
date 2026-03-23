/**
 * Strike 提取演示脚本
 * 从 flomo 导出的 HTML 中解析 memo，模拟 Strike 提取 + 聚类涌现
 *
 * 用法: npx tsx scripts/extract-strikes.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============ 1. 解析 HTML 提取 memo ============

interface Memo {
  time: string
  content: string
  hasAudio: boolean
}

function parseFlomoHtml(htmlPath: string): Memo[] {
  const html = fs.readFileSync(htmlPath, 'utf-8')
  const memos: Memo[] = []

  // 匹配每个 memo 块
  const memoRegex = /<div class="memo">\s*<div class="time">(.*?)<\/div>\s*<div class="content">(.*?)<\/div>/gs
  let match
  while ((match = memoRegex.exec(html)) !== null) {
    const time = match[1].trim()
    // 清理 HTML 标签
    const content = match[2]
      .replace(/<\/?p>/g, '\n')
      .replace(/<\/?strong>/g, '')
      .replace(/<\/?ul>/g, '')
      .replace(/<\/?ol>/g, '')
      .replace(/<li>/g, '- ')
      .replace(/<\/li>/g, '\n')
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/-&gt;/g, '→')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    const hasAudio = match[0].includes('audio-player') || html.substring(match.index!, match.index! + 2000).includes('audio-player')

    if (content.length > 0) {
      memos.push({ time, content, hasAudio })
    }
  }

  return memos
}

// ============ 2. Strike 提取（规则引擎模拟） ============

type Polarity = 'perceive' | 'judge' | 'realize' | 'intend' | 'feel'

interface Strike {
  id: string
  nucleus: string
  polarity: Polarity
  confidence: number
  people: string[]
  tags: string[]
  sourceTime: string
  rawText: string
}

interface Bond {
  sourceId: string
  targetId: string
  type: 'causal' | 'contradiction' | 'resonance' | 'evolution' | 'depends_on' | 'perspective_of' | 'abstracted_from'
  strength: number
}

// 极性关键词检测
const POLARITY_RULES: { polarity: Polarity; patterns: RegExp[]; weight: number }[] = [
  {
    polarity: 'realize',
    patterns: [
      /突然(想明白|意识到|发现|领悟)/,
      /原来(是|如此)/,
      /根本原因(是|在于)/,
      /本质(是|就是)/,
      /第一性原理/,
      /核心(是|就是)/,
      /洞察/,
      /深层次/,
      /启发/,
    ],
    weight: 0.9
  },
  {
    polarity: 'intend',
    patterns: [
      /必须|一定要|应该做|要做/,
      /接下来|下一步/,
      /计划|规划/,
      /提醒我/,
      /花一周|花一天|今天开始/,
      /赶紧|尽快/,
      /可以做|可以搞|可以把/,
      /做一个|搞一个|写一个/,
      /把.{2,8}做(好|完|出来)/,
      /先.{2,6}再/,
    ],
    weight: 0.8
  },
  {
    polarity: 'judge',
    patterns: [
      /我(觉得|认为|感觉|怀疑)/,
      /应该|不应该/,
      /一定(是|要)/,
      /(好的|坏的|最好|最优|最重要)/,
      /不要|不能|不可以/,
      /能不能/,
      /永远不/,
      /太.{1,4}了/,
    ],
    weight: 0.75
  },
  {
    polarity: 'feel',
    patterns: [
      /焦虑|不安|惶恐|难受|痛苦/,
      /开心|兴奋|激动/,
      /感觉到/,
      /哎|唉|啊/,
      /无奈/,
    ],
    weight: 0.7
  },
  {
    polarity: 'perceive',
    patterns: [
      /发现|看到|听到|注意到/,
      /刚才|今天|昨天/,
      /说的是|讲的是/,
      /存在|有一个/,
    ],
    weight: 0.65
  },
]

// 人名提取（中文常见称呼模式）
function extractPeople(text: string): string[] {
  const people: string[] = []
  const patterns = [
    /([张王李赵刘陈杨黄吴周徐孙马朱胡林郭何高罗][总经理工哥姐叔阿]+)/g,
    /(小[张王李赵刘陈杨黄吴周徐孙马朱胡林郭何高罗])/g,
    /(老[张王李赵刘陈杨黄吴周徐孙马朱胡林郭何高罗])/g,
    /([张王李赵刘陈杨黄吴周徐孙马朱胡林郭何高罗][明华伟芳静强磊洋勇军])/g,
  ]
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      if (!people.includes(match[1])) people.push(match[1])
    }
  }
  return people
}

// 标签提取
function extractTags(text: string): string[] {
  const tags: string[] = []
  // flomo 标签格式 #xxx
  const tagMatches = text.match(/#(\w+)/g)
  if (tagMatches) {
    tags.push(...tagMatches.map(t => t.replace('#', '')))
  }

  // 语义关键词标签
  const TOPIC_KEYWORDS: Record<string, RegExp[]> = {
    'v2note产品': [/v2note|笔记产品|日记产品|语音转|待办/],
    'AI认知': [/AI|人工智能|大模型|LLM|智能体|agent/i],
    '创业商业': [/创业|市场|客户|用户|变现|收费|营销|推广|布道|品牌/],
    '软件胚胎学': [/细胞|基因|DNA|胚胎|分裂|进化|自组织|母体/],
    '个人成长': [/成长|努力|坚持|耐心|聚焦|思考|认知/],
    '产品方法论': [/聚焦|单点突破|减法|极致|MVP|核心功能/],
    '技术实现': [/代码|编程|前端|后端|框架|架构|MCP|API/],
    '哲学思考': [/映射|本质|边界|杠杆|第一性原理|规律/],
    '情绪状态': [/焦虑|惶恐|难受|无奈|不安/],
    '内容创作': [/视频|文案|B站|知乎|布道|讲故事|表达/],
  }

  for (const [tag, patterns] of Object.entries(TOPIC_KEYWORDS)) {
    if (patterns.some(p => p.test(text))) {
      tags.push(tag)
    }
  }

  return [...new Set(tags)]
}

// 检测极性
function detectPolarity(text: string): { polarity: Polarity; confidence: number } {
  let bestPolarity: Polarity = 'perceive'
  let bestScore = 0

  for (const rule of POLARITY_RULES) {
    const matchCount = rule.patterns.filter(p => p.test(text)).length
    const score = matchCount * rule.weight
    if (score > bestScore) {
      bestScore = score
      bestPolarity = rule.polarity
    }
  }

  // 置信度: 基于匹配强度
  const confidence = Math.min(0.95, 0.5 + bestScore * 0.15)
  return { polarity: bestPolarity, confidence }
}

// 提取 nucleus（语义核心）
function extractNucleus(text: string): string {
  // 取第一句有意义的话，限制长度
  const sentences = text.split(/[。！？\n]/).filter(s => s.trim().length > 5)
  if (sentences.length === 0) return text.substring(0, 80)

  let nucleus = sentences[0].trim()
  if (nucleus.length > 80) nucleus = nucleus.substring(0, 77) + '...'
  return nucleus
}

function extractStrikes(memo: Memo): Strike[] {
  const text = memo.content

  // 短文本 → 单个 Strike
  if (text.length < 100) {
    const { polarity, confidence } = detectPolarity(text)
    return [{
      id: `S_${memo.time.replace(/[\s:-]/g, '').substring(0, 12)}_0`,
      nucleus: extractNucleus(text),
      polarity,
      confidence,
      people: extractPeople(text),
      tags: extractTags(text),
      sourceTime: memo.time,
      rawText: text,
    }]
  }

  // 长文本 → 按段落分拆
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 10)

  return paragraphs.map((para, i) => {
    const { polarity, confidence } = detectPolarity(para)
    return {
      id: `S_${memo.time.replace(/[\s:-]/g, '').substring(0, 12)}_${i}`,
      nucleus: extractNucleus(para),
      polarity,
      confidence,
      people: extractPeople(para),
      tags: extractTags(para),
      sourceTime: memo.time,
      rawText: para,
    }
  })
}

// ============ 3. Bond 检测 ============

function detectBonds(strikes: Strike[]): Bond[] {
  const bonds: Bond[] = []

  for (let i = 0; i < strikes.length; i++) {
    for (let j = i + 1; j < strikes.length; j++) {
      const a = strikes[i]
      const b = strikes[j]

      // 共享标签 → resonance
      const sharedTags = a.tags.filter(t => b.tags.includes(t))
      if (sharedTags.length >= 2) {
        bonds.push({
          sourceId: a.id,
          targetId: b.id,
          type: 'resonance',
          strength: Math.min(0.9, 0.3 + sharedTags.length * 0.15),
        })
      }

      // 同主题但不同极性 → 可能矛盾或视角差异
      if (sharedTags.length >= 1 && a.polarity === 'judge' && b.polarity === 'judge') {
        // 简单检测：一个说"应该"一个说"不应该"
        const aPositive = /应该|要做|可以|好的/.test(a.rawText)
        const bNegative = /不应该|不要|不能|不可以/.test(b.rawText)
        if (aPositive && bNegative || (!aPositive && !bNegative)) {
          bonds.push({
            sourceId: a.id,
            targetId: b.id,
            type: 'perspective_of',
            strength: 0.6,
          })
        }
      }

      // 时间接近 + 同标签 → evolution
      const dayDiff = Math.abs(
        new Date(a.sourceTime).getTime() - new Date(b.sourceTime).getTime()
      ) / (1000 * 60 * 60 * 24)

      if (dayDiff < 3 && sharedTags.length >= 1 && a.polarity === b.polarity) {
        bonds.push({
          sourceId: a.id,
          targetId: b.id,
          type: 'evolution',
          strength: Math.max(0.3, 0.7 - dayDiff * 0.1),
        })
      }
    }
  }

  // 去重
  const seen = new Set<string>()
  return bonds.filter(b => {
    const key = `${b.sourceId}-${b.targetId}-${b.type}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ============ 4. 简易聚类 ============

interface Cluster {
  name: string
  tags: string[]
  strikes: Strike[]
  topNuclei: string[]
}

function clusterStrikes(strikes: Strike[], bonds: Bond[]): Cluster[] {
  // 基于标签的简易聚类
  const tagGroups = new Map<string, Strike[]>()

  for (const s of strikes) {
    for (const tag of s.tags) {
      if (!tagGroups.has(tag)) tagGroups.set(tag, [])
      tagGroups.get(tag)!.push(s)
    }
  }

  const clusters: Cluster[] = []
  for (const [tag, members] of tagGroups) {
    if (members.length < 3) continue // 最少 3 个成员

    // 取置信度最高的 3 个作为代表
    const sorted = [...members].sort((a, b) => b.confidence - a.confidence)
    const topNuclei = sorted.slice(0, 3).map(s => s.nucleus)

    clusters.push({
      name: tag,
      tags: [tag],
      strikes: members,
      topNuclei,
    })
  }

  return clusters.sort((a, b) => b.strikes.length - a.strikes.length)
}

// ============ 5. 主程序 ============

function main() {
  const htmlPath = path.resolve(__dirname, '..', 'v2note.html')

  console.log('═══════════════════════════════════════════════════')
  console.log('  v2note Strike 提取演示 — 从 flomo 日记到认知结构')
  console.log('═══════════════════════════════════════════════════\n')

  // 解析
  const memos = parseFlomoHtml(htmlPath)
  console.log(`📝 解析到 ${memos.length} 条 memo (${memos[memos.length - 1]?.time} ~ ${memos[0]?.time})\n`)

  // 提取 Strikes
  const allStrikes: Strike[] = []
  for (const memo of memos) {
    allStrikes.push(...extractStrikes(memo))
  }
  console.log(`⚡ 提取到 ${allStrikes.length} 个 Strike\n`)

  // 极性分布
  const polarityCount: Record<string, number> = {}
  for (const s of allStrikes) {
    polarityCount[s.polarity] = (polarityCount[s.polarity] || 0) + 1
  }
  console.log('📊 极性分布:')
  const polarityIcons: Record<string, string> = {
    perceive: '👁  perceive (感知)',
    judge: '⚖️  judge (判断)',
    realize: '💡 realize (顿悟)',
    intend: '🎯 intend (意图)',
    feel: '❤️  feel (感受)',
  }
  for (const [p, icon] of Object.entries(polarityIcons)) {
    const count = polarityCount[p] || 0
    const bar = '█'.repeat(Math.round(count / 2))
    console.log(`   ${icon}: ${count} ${bar}`)
  }

  // Bond 检测
  const bonds = detectBonds(allStrikes)
  console.log(`\n🔗 检测到 ${bonds.length} 条 Bond`)
  const bondTypeCount: Record<string, number> = {}
  for (const b of bonds) {
    bondTypeCount[b.type] = (bondTypeCount[b.type] || 0) + 1
  }
  for (const [type, count] of Object.entries(bondTypeCount)) {
    console.log(`   ${type}: ${count}`)
  }

  // 聚类
  const clusters = clusterStrikes(allStrikes, bonds)
  console.log(`\n🧩 涌现出 ${clusters.length} 个聚类:\n`)

  for (const cluster of clusters) {
    console.log(`  ┌─ 📌 ${cluster.name} (${cluster.strikes.length} 条 Strike)`)

    // 极性分布
    const cp: Record<string, number> = {}
    for (const s of cluster.strikes) cp[s.polarity] = (cp[s.polarity] || 0) + 1
    const polarityStr = Object.entries(cp)
      .sort((a, b) => b[1] - a[1])
      .map(([p, c]) => `${p}:${c}`)
      .join(' ')
    console.log(`  │  极性: ${polarityStr}`)

    // 代表性 nucleus
    console.log(`  │  代表认知:`)
    for (const n of cluster.topNuclei) {
      console.log(`  │    • "${n}"`)
    }
    console.log('  └───────────────────────────────────────\n')
  }

  // 矛盾检测
  console.log('⚔️  潜在认知矛盾:\n')
  const contradictions = bonds.filter(b => b.type === 'perspective_of')
  const shown = new Set<string>()
  for (const c of contradictions.slice(0, 5)) {
    const a = allStrikes.find(s => s.id === c.sourceId)
    const b = allStrikes.find(s => s.id === c.targetId)
    if (!a || !b) continue
    const key = `${a.nucleus}|${b.nucleus}`
    if (shown.has(key)) continue
    shown.add(key)
    console.log(`  "${a.nucleus}"`)
    console.log(`    ↔ 视角差异 ↔`)
    console.log(`  "${b.nucleus}"`)
    console.log(`  (strength: ${c.strength})\n`)
  }

  // intend 行动队列
  console.log('🎯 行动队列 (intend Strikes):\n')
  const intends = allStrikes
    .filter(s => s.polarity === 'intend')
    .sort((a, b) => new Date(b.sourceTime).getTime() - new Date(a.sourceTime).getTime())
    .slice(0, 10)
  for (const s of intends) {
    console.log(`  [${s.sourceTime.substring(5, 10)}] ${s.nucleus}`)
  }

  // realize 顿悟洞察
  console.log('\n💡 顿悟洞察 (realize Strikes):\n')
  const realizes = allStrikes
    .filter(s => s.polarity === 'realize')
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8)
  for (const s of realizes) {
    console.log(`  [${s.sourceTime.substring(5, 10)}] (${s.confidence.toFixed(2)}) ${s.nucleus}`)
  }

  console.log('\n═══════════════════════════════════════════════════')
  console.log('  以上为规则引擎提取结果（Phase 1）')
  console.log('  Phase 2 接入 LLM 后将获得更精准的语义提取')
  console.log('═══════════════════════════════════════════════════')
}

main()
