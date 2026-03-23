/**
 * Strike 提取 - 类型定义
 * 来源：specs/strike-extraction.md → 接口约定
 */

// 认知极性：5 种不可约的认知方向
export type Polarity = 'perceive' | 'judge' | 'realize' | 'intend' | 'feel'

// Bond 类型：7 种标准关系
export type BondType =
  | 'causal'
  | 'contradiction'
  | 'resonance'
  | 'evolution'
  | 'depends_on'
  | 'perspective_of'
  | 'abstracted_from'

/** Digest 输入 */
export interface DigestInput {
  /** 原始记录 ID */
  record_id: string
  /** 待提取文本 */
  text: string
  /** 输入类型：think=用户思考（全权重），material=外部素材（降权） */
  source_type: 'think' | 'material'
  /** 输入时间 */
  timestamp?: Date
  /** 用户 ID */
  user_id: string
}

/** Digest 输出 */
export interface DigestResult {
  success: boolean
  strikes: ExtractedStrike[]
  bonds: ExtractedBond[]
  /** digested 标记（true 表示处理完成，即使无 Strike） */
  digested: boolean
  message?: string
}

/** 提取的 Strike */
export interface ExtractedStrike {
  /** 语义核心 */
  nucleus: string
  /** 认知极性 */
  polarity: Polarity
  /** 置信度 0-1 */
  confidence: number
  /** 显著度 0-1，material 类型降权 */
  salience: number
  /** 关联人 */
  people: string[]
  /** 上下文场 */
  field: StrikeField
  /** 对应原文片段 */
  rawText: string
  /** 是否参与逻辑链（feel 排除） */
  participatesInLogicChain: boolean
  /** 是否参与聚类涌现（material 降权的不参与） */
  participatesInEmergence: boolean
}

/** Strike 上下文场 */
export interface StrikeField {
  timestamp: string
  life_phase?: string
  space?: string
  energy?: string
  mood?: string
  social_context?: string
}

/** 提取的 Bond */
export interface ExtractedBond {
  /** 源 Strike 在 strikes 数组中的索引 */
  source_index: number
  /** 目标 Strike 在 strikes 数组中的索引 */
  target_index: number
  /** 关系类型 */
  type: BondType
  /** 强度 0-1 */
  strength: number
}
