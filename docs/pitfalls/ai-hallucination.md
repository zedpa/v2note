# AI 幻觉与输出校验陷阱

> 按需加载：当改动涉及 LLM 输出解析、AI 生成的 ID/FK、`INSERT` 语句使用 AI 产物。

## AI 产出的 ID 不可信

LLM 输出的任何 ID（UUID / FK 引用）都不可信。在执行 DB 写入前必须：

1. **正则校验格式**：`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`
2. **存在性检查**：`SELECT 1 FROM target_table WHERE id = $1`
3. **INSERT 时用 `WHERE EXISTS` 子查询防护**

AI 会：
- 编造格式正确但不存在的 UUID
- 编造格式非法的伪 UUID
- 混淆不同表的 ID

## 去重的双层防护

- AI 输出去重需双层防护：
  - **prompt 引导**语义去重（在 prompt 中给出已存在的列表）
  - **DB 层**精确匹配兜底（`LOWER(TRIM(text))` 归一化）
- 单靠 prompt 不可靠，AI 在长列表下会重复
- 来源：2026-04-13 fix-goal-quality

## 来源

- 2026-04-11 wiki-compiler 6 层 FK violation
