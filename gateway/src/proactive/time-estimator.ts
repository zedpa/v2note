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
      { json: true, temperature: 0.3 },
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
 * Estimate time for multiple todos in a single AI call.
 */
export async function estimateBatchTodos(
  todos: Array<{ id: string; text: string }>,
  context?: { soul?: string },
): Promise<Map<string, TimeEstimate>> {
  const results = new Map<string, TimeEstimate>();

  if (todos.length === 0) return results;

  const todoList = todos.map((t, i) => `${i + 1}. ${t.text}`).join("\n");

  try {
    const response = await chatCompletion(
      [
        {
          role: "system",
          content: `你是一个时间管理助手。对以下待办事项进行分析，估算完成时间和优先级。
${context?.soul ? `\n用户画像：${context.soul}` : ""}

返回 JSON 对象，格式：
{
  "estimates": [
    {"index": 1, "estimated_minutes": 30, "priority": 3, "reasoning": "..."},
    ...
  ]
}

estimated_minutes: 预估完成所需分钟数(5-480)
priority: 优先级 1-5 (5最高)
reasoning: 简短理由`,
        },
        { role: "user", content: todoList },
      ],
      { json: true, temperature: 0.3 },
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
          });
        }
      }
    }
  } catch (err: any) {
    console.warn(`[time-estimator] Batch estimation failed: ${err.message}`);
    // Fall back to default estimates
    for (const todo of todos) {
      results.set(todo.id, { estimated_minutes: 30, priority: 3 });
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
