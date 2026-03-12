# gene_ai_diary — AI 日记本系统

## 概述

AI 每天自动记录工作日志，按笔记本分类。支持快速追加（无 AI 调用）、AI 摘要生成、长期记忆提取。

## 数据库

```sql
-- migration 012
CREATE TABLE notebook (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(device_id, name)
);

CREATE TABLE ai_diary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  notebook TEXT NOT NULL DEFAULT 'default',
  entry_date DATE NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  full_content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(device_id, notebook, entry_date)
);
```

## 系统笔记本

| 名称 | 用途 |
|------|------|
| `default` | 用户日常日记，process handler 自动追加 |
| `ai-self` | AI 自用，记录工作总结、互动观察、模式识别 |

用户可通过 chat 创建项目笔记本（`create_notebook` 工具）。

## 文件结构

| 文件 | 职责 |
|------|------|
| `gateway/src/db/repositories/ai-diary.ts` | upsertEntry, findByDate, findSummaries, findFull, updateSummary |
| `gateway/src/db/repositories/notebook.ts` | findByDevice, findOrCreate, ensureSystemNotebooks |
| `gateway/src/diary/manager.ts` | appendToDiary, regenerateSummary, extractToMemory |
| `gateway/src/routes/notebooks.ts` | GET /api/v1/notebooks, GET /api/v1/diary/:notebook/:date |

## 核心方法

### appendToDiary(deviceId, notebook, content)
- 快速追加到今日日记（无 AI 调用）
- 自动调用 `ensureSystemNotebooks()` 确保笔记本存在
- 使用 `ON CONFLICT ... SET full_content = full_content || content` 追加

### regenerateSummary(deviceId, notebook, date)
- AI 生成前 20 行摘要
- 跳过空内容条目
- 由 proactive engine 晚间触发

### extractToMemory(deviceId, dateRange)
- 从日记摘要提取长期记忆
- AI 分析模式、重复事项、重要变化
- 通过 MemoryManager.maybeCreateMemory 持久化
- 每周日深度提取（proactive engine）

## 集成点

- **process handler**: 处理后追加到 `default` 笔记本
- **chat handler**: 对话结束时追加到 `ai-self` 笔记本
- **proactive engine**: 晚间 regenerateSummary + 周日 extractToMemory
- **create_notebook 工具**: AI 可通过 chat 创建项目笔记本

## 测试

- `gateway/src/db/repositories/ai-diary.test.ts` — 5 个用例
- `gateway/src/db/repositories/notebook.test.ts` — 3 个用例
- `gateway/src/diary/manager.test.ts` — 6 个用例（含 AI mock）
