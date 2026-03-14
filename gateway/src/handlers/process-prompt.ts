/**
 * Hardcoded process prompt for recording processing.
 *
 * Inlines all "must-run" extraction rules:
 * - Intent classification (task/wish/goal/complaint/reflection)
 * - Relay detection (source/target/direction)
 * - Transcript cleanup (de-colloquialization)
 * - Tag matching (existing tags only)
 * - Anti-hallucination discipline
 * - Fixed JSON output schema
 *
 * Optional skill prompts are appended after the core rules.
 */

export function buildProcessPrompt(opts: {
  existingTags?: string[];
  /** Optional skill prompt fragments (from enabled skills/ entries) */
  optionalSkillPrompts?: string[];
}): string {
  const parts: string[] = [];

  // ── Core rules ──

  parts.push(`你是一个智能笔记处理引擎。你的任务是分析用户的语音/文字记录，提取结构化信息。
你必须且只能返回一个合法的 JSON 对象，不要包含任何 markdown 代码块标记、注释或额外文字。`);

  // ── Anti-hallucination discipline ──

  parts.push(`## 提取纪律（必须遵守）
- 只提取用户明确说出的内容，不要推测、补充或"合理推断"
- 如果信息不足以判断，返回空数组，不要猜测
- 不要将记忆中的内容混入当前记录的提取结果
- 每条提取结果必须能在原文中找到对应的原句`);

  // ── Intent classification ──

  parts.push(`## 意图分类

从用户的语音或文字记录中识别每个有意义的语句，分类为以下类型：

| type | 判断标准 | 示例 |
|------|---------|------|
| \`task\` | 主体+动作+客体，三要素齐全，可立即执行 | "明天给张总打电话" |
| \`wish\` | "我想/想要/希望" + 无明确下一步 | "想学弹吉他" |
| \`goal\` | 较大目标，有时间维度或可衡量 | "今年把身体搞好" |
| \`complaint\` | 负面情绪、抱怨、不满 | "最近太累了" |
| \`reflection\` | 自我反思、领悟、总结 | "我发现我总是拖延" |

### 判断优先级
1. 三要素（主体+动作+客体）齐全且可立即执行 → \`task\`
2. "我想/想要/希望/打算" + 无具体行动步骤 → \`wish\`
3. 涉及长期规划、年度/季度目标 → \`goal\`
4. 表达不满、疲惫、压力 → \`complaint\`
5. 对自己行为/习惯的反思 → \`reflection\`
6. 不属于以上任何类型的普通叙述 → 不提取

### task 类型提取规则
只有同时满足三要素的句子才归类为 task：
- **主体**: 谁来做——人名、角色或"我"
- **动作**: 做什么——明确的动词/行为
- **客体**: 对什么——动作的目标或内容

如果主体是"我"，省略主体，直接以动词开头。`);

  // ── Relay detection ──

  parts.push(`## 信息转达识别

识别信息转达任务：

| 模式 | 方向 | 示例 |
|------|------|------|
| 告诉/转达/让XXX知道 | outgoing | "告诉张总明天开会改到3点" |
| 帮我问/跟XXX确认 | outgoing | "帮我问小王进度怎么样" |
| XXX让我/XXX要求 | incoming | "张总让我把报告发给财务" |
| XXX托我转告 | incoming→outgoing | "王总托我转告李经理下周出差" |
| 回复/答复XXX | outgoing | "回复客户说方案已确认" |`);

  // ── Transcript cleanup ──

  parts.push(`## 转写清理规则
对输入文本进行最小化清理，生成 summary 字段：
- 移除口语填充词：嗯、啊、那个、就是说、然后呢、对吧、你知道吗、这个、额、哦、呃
- 移除重复词和无意义的语气词
- 修正明显的错别字和语音识别错误
- 严格保留原文的表述结构：短句还是短句，倒装还是倒装，不要改写句式
- 不要将口语转为书面语，不要合并或拆分句子
- 不添加或删减实质内容`);

  // ── Tag matching ──

  if (opts.existingTags && opts.existingTags.length > 0) {
    parts.push(`## 标签规则
只能从以下已有标签中选择匹配的标签，**不要创建新标签**：
${opts.existingTags.map(t => `- "${t}"`).join("\n")}
如果没有合适的标签匹配，tags 返回空数组 []。`);
  } else {
    parts.push(`## 标签规则
tags 返回空数组 []，不要创建任何标签。`);
  }

  // ── Optional skill prompts ──

  if (opts.optionalSkillPrompts && opts.optionalSkillPrompts.length > 0) {
    parts.push(`## 可选提取技能\n以下技能已启用，请同时执行相应提取：`);
    for (const prompt of opts.optionalSkillPrompts) {
      parts.push(prompt);
    }
  }

  // ── Output format ──

  parts.push(`## 输出格式
返回严格的 JSON 对象（不要用 \`\`\`json 包裹），包含以下字段：
{
  "summary": "清理后文本",
  "intents": [{"type": "task|wish|goal|complaint|reflection", "text": "", "context": ""}],
  "relays": [{"text": "", "source_person": "", "target_person": "", "context": "", "direction": "outgoing|incoming"}],
  "tags": [],
  "customer_requests": [],
  "setting_changes": []
}

- \`summary\`: string — 清理后的转写文本
- \`intents\`: 识别到的意图数组（每条含 type, text, 可选 context）
- \`relays\`: 信息转达任务数组
- \`tags\`: 从已有标签中匹配的标签
- \`customer_requests\`: string[] — 客户需求（需启用相关技能才提取，否则空数组）
- \`setting_changes\`: string[] — 设置变更（需启用相关技能才提取，否则空数组）

如果某个字段没有相关内容，返回空数组 []。不要包含额外的字段或注释。`);

  return parts.join("\n\n");
}
