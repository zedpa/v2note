/**
 * AI-powered time estimation for todos.
 * Uses the AI provider to estimate completion time and suggest scheduling.
 */

import { chatCompletion } from "../ai/provider.js";

export interface TimeEstimate {
  estimated_minutes: number;
  priority: number; // 1-5, 5 being highest
  suggested_start?: string; // ISO timestamp
  suggested_end?: string; // ISO timestamp
  reasoning?: string;
}

export interface TodoEnrichment extends TimeEstimate {
  domain: string; // 工作, 生活, 社交, 学习, 健康, 创业, 家庭
  impact: number; // 1-10 strategic value
  ai_actionable: boolean;
  ai_action_plan?: string[];
}

/**
 * Estimate time and priority for a todo item.
 */
export async function estimateTodoTime(
  todoText: string,
  context?: { soul?: string; existingTodos?: string[] },
): Promise<TimeEstimate> {
  const prompt = buildEstimationPrompt(todoText, context);

  try {
    const response = await chatCompletion(
      [
        { role: "system", content: prompt },
        { role: "user", content: todoText },
      ],
      { json: true, temperature: 0.3, tier: "fast" },
    );

    const parsed = JSON.parse(response.content);
    return {
      estimated_minutes: parsed.estimated_minutes ?? 30,
      priority: Math.min(5, Math.max(1, parsed.priority ?? 3)),
      suggested_start: parsed.suggested_start,
      suggested_end: parsed.suggested_end,
      reasoning: parsed.reasoning,
    };
  } catch (err: any) {
    console.warn(`[time-estimator] Failed to estimate: ${err.message}`);
    return { estimated_minutes: 30, priority: 3 };
  }
}

/**
 * Estimate time, priority, domain, impact, and AI actionability for multiple todos.
 */
export async function estimateBatchTodos(
  todos: Array<{ id: string; text: string }>,
  context?: { soul?: string; memories?: string[] },
): Promise<Map<string, TodoEnrichment>> {
  const results = new Map<string, TodoEnrichment>();

  if (todos.length === 0) return results;

  const todoList = todos.map((t, i) => `${i + 1}. ${t.text}`).join("\n");

  // Extract high-importance memories (especially goals) for context
  const goalContext = context?.memories?.length
    ? `\n用户目标与重要记忆：\n${context.memories.join("\n")}`
    : "";

  try {
    const response = await chatCompletion(
      [
        {
          role: "system",
          content: `你是一个时间管理助手。对以下待办事项进行全面分析。
${context?.soul ? `\n用户画像：${context.soul}` : ""}${goalContext}

返回 JSON 对象，格式：
{
  "estimates": [
    {
      "index": 1,
      "estimated_minutes": 30,
      "priority": 3,
      "domain": "工作",
      "impact": 5,
      "ai_actionable": false,
      "ai_action_plan": [],
      "reasoning": "..."
    }
  ]
}

字段说明：
- estimated_minutes: 预估完成所需分钟数(5-480)
- priority: 紧急程度 1-5 (5最紧急)
- domain: 生活领域，只能是 工作/生活/社交/学习/健康/创业/家庭
- impact: 战略价值 1-10，对照用户目标评估。与核心目标直接相关=8-10，一般工作=4-6，琐事=1-3
- ai_actionable: AI是否可以帮助执行此任务
  - true: AI可通过文本生成、信息整理、搜索等完成的事（如整理会议纪要、起草邮件、总结报告）
  - false: 必须用户本人物理执行的事（如跑步、开会、面谈、搬家）
- ai_action_plan: 如果 ai_actionable=true，列出2-5个执行步骤(字符串数组)，每步以动词开头
- reasoning: 简短理由`,
        },
        { role: "user", content: todoList },
      ],
      { json: true, temperature: 0.3, tier: "fast" },
    );

    const parsed = JSON.parse(response.content);
    if (Array.isArray(parsed.estimates)) {
      for (const est of parsed.estimates) {
        const index = est.index - 1;
        if (index >= 0 && index < todos.length) {
          results.set(todos[index].id, {
            estimated_minutes: est.estimated_minutes ?? 30,
            priority: Math.min(5, Math.max(1, est.priority ?? 3)),
            reasoning: est.reasoning,
            domain: est.domain ?? "工作",
            impact: Math.min(10, Math.max(1, est.impact ?? 5)),
            ai_actionable: est.ai_actionable ?? false,
            ai_action_plan: Array.isArray(est.ai_action_plan) ? est.ai_action_plan : undefined,
          });
        }
      }
    }
  } catch (err: any) {
    console.warn(`[time-estimator] Batch estimation failed: ${err.message}`);
    for (const todo of todos) {
      results.set(todo.id, {
        estimated_minutes: 30,
        priority: 3,
        domain: "工作",
        impact: 5,
        ai_actionable: false,
      });
    }
  }

  return results;
}

function buildEstimationPrompt(
  _todoText: string,
  context?: { soul?: string; existingTodos?: string[] },
): string {
  const parts = [
    `你是一个时间管理助手。分析待办事项，返回时间估算和优先级。`,
  ];

  if (context?.soul) {
    parts.push(`\n用户画像：${context.soul}`);
  }

  if (context?.existingTodos && context.existingTodos.length > 0) {
    parts.push(`\n当前已有待办：\n${context.existingTodos.join("\n")}`);
  }

  parts.push(`\n返回 JSON：
{
  "estimated_minutes": 30,
  "priority": 3,
  "reasoning": "简短理由"
}

estimated_minutes: 预估完成所需分钟数(5-480)
priority: 优先级 1-5 (5最高，紧急且重要的事)
reasoning: 简短理由`);

  return parts.join("\n");
}
