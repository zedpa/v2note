/**
 * Prompts for the Digest pipeline (cognitive layer).
 * - buildDigestPrompt: guides AI to decompose text into Strikes + internal Bonds
 * - buildCrossLinkPrompt: guides AI to link new Strikes with historical ones
 */
export function buildDigestPrompt() {
    return `你是一个认知分析引擎。将以下内容拆解为 Strike（认知触动）。每个 Strike 是一个能被独立理解的最小语义单元。

每个 Strike 包含：
- nucleus: string — 完整命题。包含足够上下文（谁、什么、何时），保留不确定性（"可能"/"觉得"）和归属（谁说的）。一年后单独读到它要能理解。
- polarity: "perceive" | "judge" | "realize" | "intend" | "feel"
  - perceive: 感知到外部事实/事件（"铝价又涨了"）
  - judge: 形成主观评价/判断（"这个供应商不靠谱"）
  - realize: 理解了之前不理解的东西（"原来根源在工艺"）
  - intend: 想要达成的状态/行动（"下季度降成本"）
  - feel: 情绪反应（"这事让我不安"）
- confidence: 0-1，确信程度
- tags: string[] — 自由标签（人名、主题、领域等）

同时输出 Strike 之间的 bond（关系）：
- source_idx: 源 Strike 索引（0-based）
- target_idx: 目标 Strike 索引
- type: string — 常见类型：causal, contradiction, resonance, evolution, supports, context_of, elaborates, triggers, resolves, depends_on, perspective_of
- strength: 0-1

返回纯 JSON，不要包含任何其他文字：
{
  "strikes": [{"nucleus": "...", "polarity": "...", "confidence": 0.9, "tags": ["..."]}],
  "bonds": [{"source_idx": 0, "target_idx": 1, "type": "causal", "strength": 0.8}]
}`;
}
export function buildCrossLinkPrompt() {
    return `你是一个认知关联引擎。以下是新提取的 Strike 和语义相关的历史 Strike。判断它们之间是否有关系。

对于每对有关系的 Strike，输出：
- new_idx: 新 Strike 索引（0-based）
- history_id: 历史 Strike 的 ID
- type: bond 类型（causal, contradiction, resonance, evolution, supports, context_of, elaborates, triggers, resolves, depends_on, perspective_of）
- strength: 0-1
- supersedes: boolean — 新 Strike 是否取代了这个历史 Strike（例如更新了同一个判断或意图）

返回纯 JSON，不要包含任何其他文字：
{
  "cross_bonds": [{"new_idx": 0, "history_id": "uuid", "type": "evolution", "strength": 0.8}],
  "supersedes": [{"new_idx": 0, "history_id": "uuid"}]
}

如果没有有意义的关系，返回空数组：{"cross_bonds": [], "supersedes": []}`;
}
//# sourceMappingURL=digest-prompt.js.map