/**
 * Layer 3 统一处理 Prompt — 一次 AI 调用完成全部工作
 *
 * v3 架构简化：去掉 Strike 中间层
 * Record（日记）和 Todo（待办）是唯一两个核心实体
 * AI 一次返回：summary + domain + tags + todos + commands
 */
import { buildDateAnchor } from "../lib/date-anchor.js";
export function buildUnifiedProcessPrompt(ctx) {
    const dateAnchor = buildDateAnchor();
    const goalList = ctx.activeGoals.length > 0
        ? ctx.activeGoals.map((g, i) => `  ${i + 1}. [${g.id}] "${g.title}"`).join("\n")
        : "  （无活跃目标）";
    const todoList = ctx.pendingTodos.length > 0
        ? ctx.pendingTodos.slice(0, 20).map((t, i) => `  ${i + 1}. [${t.id}] "${t.text}"${t.scheduled_start ? ` (${t.scheduled_start})` : ""}`).join("\n")
        : "  （无未完成待办）";
    const domainHint = ctx.existingDomains.length > 0
        ? `\n## 用户已有分类（仅当内容明确属于某个分类时才复用，不确定时创建新分类）\n${ctx.existingDomains.map(d => `- ${d}`).join("\n")}`
        : "";
    return `你是一个智能日记助手。用户刚说了一段话（语音转文字），你需要一次性完成处理。

${dateAnchor}

## 用户活跃目标/项目
${goalList}

## 用户未完成待办
${todoList}
${domainHint}

## 你需要做的事

### 1. 判断意图类型
- **record**：用户在记录/叙述/思考/感受（大部分情况）
- **action**：用户在下指令（"提醒我…""把XX改到…""XX做完了"）
- **mixed**：同时包含记录和指令

### 2. 文本清理 → summary
对原文做最小化清理：去掉口语填充词（嗯、啊、那个），修正明显错别字。
严格保留原文结构，不改写句式。输出为 summary 字段。

### 3. 自动归类 → domain
判断这段输入属于哪个分类：
- 一级分类：简短中文，如 "工作"、"生活"、"学习"、"健康"
- 可带子路径：如 "工作/项目A"、"生活/旅行"
- 只有当内容**明确提到**已有分类中的关键词时才复用已有分类
- 用户未提到具体产品/项目名称时，不要从已有分类中猜测，创建新的通用分类即可
- 无法判断时为 null

### 4. 提取标签 → tags
标签 = domain 路径各段 + 1 个核心内容关键词，总计 2-4 个。
- 将 domain 的每层路径拆成独立标签（如 domain="工作/项目A" → tags 包含 "工作"、"项目A"）
- 再加 1 个内容核心词（体现这条记录的独特主题，如 "UI交互"、"报价"）
- 不要重复 domain 已有的词
- 不要生成泛化标签（如"日常"、"想法"、"记录"）

### 5. 提取待办 → todos
如果内容包含用户想做的事、计划、意愿，提取为待办：
- 含未来时间 + 动作（"明天去…""后天三点…"）
- 含指令词（"提醒我""记得""别忘了"）
- 含意愿动词（"要去""得把""需要""打算"）

每个待办：
- text: 动词开头的可执行短句（✅ "明天3点找张总确认报价" ❌ "用户打算找张总"）
- scheduled_start: ISO 时间（参照锚点表解析）
- priority: "high"/"medium"/"low"（仅从语气推断，无信号则不填）
- goal_id: 属于哪个目标？从上方目标列表中匹配，不确定则 null

纯叙述/感受类内容不提取待办，todos 为空数组。

### 6. 指令提取 → commands（仅 action/mixed 时）
- create_todo: 创建新待办
- complete_todo: 完成已有待办（从待办列表匹配 target_id）
- modify_todo: 修改已有待办
- query_todo: 查询待办

## 输出格式

返回纯 JSON（不要 markdown 包裹、不要思考过程）：
{
  "intent_type": "record",
  "summary": "铝价又涨了5%，需要找张总确认报价",
  "domain": "工作/采购",
  "tags": ["工作", "采购", "报价"],
  "todos": [
    {
      "text": "明天下午3点找张总确认报价",
      "scheduled_start": "2026-04-06T15:00:00",
      "priority": "high",
      "goal_id": null
    }
  ],
  "commands": []
}

## 关键约束
1. summary 不能为空
2. record 类型时 commands 为空数组
3. todos 只提取用户明确表达意愿的事项，不要过度推断
4. goal_id 只能填上方目标列表中存在的 ID，不确定则 null
5. scheduled_start：日期从锚点表查找，时刻以用户原话为准`;
}
//# sourceMappingURL=unified-process-prompt.js.map