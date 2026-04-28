---
id: "fix-chat-quality"
title: "AI 对话质量 A/B 测试基础设施 — 提示词 + 上下文 + 模型实验框架"
status: active
domain: chat
risk: high
dependencies: ["chat-system.md", "cognitive-wiki-core.md"]
created: 2026-04-28
updated: 2026-04-28
backport: chat-system.md#场景 1.1
---

# AI 对话质量 A/B 测试基础设施

## 概述

AI 伴侣「路路」回复质量不及预期。离线 A/B 测试已验证提示词优化的可行性（Soul-B 平均 47 字/冗余分 1 vs 线上版 128 字/冗余分 40），但还需要在实战中验证：(1) 不同 Soul 变体对真实用户的效果；(2) 不同上下文注入策略（混合注入 vs 当前 hint-only）；(3) 不同模型（GLM、DeepSeek vs Qwen）的对话质量差异。本 spec 构建 A/B 实验基础设施，让以上维度可独立实验、可度量、可回滚。

## 问题诊断（A/B 测试发现）

### 已确认问题
1. **Soul 文学化倾向**：角色扮演（"喵..."、"\*尾巴\*"）、比喻堆砌（"像石头落进水里"）、冗长（128字均值）
2. **上下文沙漠**：记忆/Wiki 只注入数量提示（`chat.ts:293`），情感对话中 AI 不调 search 工具 → 零上下文回复
3. **认知上下文受限**：仅 review/insight 模式加载（`chat.ts:280`），日常聊天无认知数据
4. **Wiki 搜索不精准**：`loadWikiContext` 仅用关键词 ILIKE，不用已有的向量搜索
5. **单一模型**：只有 DashScope/Qwen，无法对比其他模型

### 优化假设（需通过 A/B 验证）
- H1: Soul-B 精简版提升回复质量（离线已验证，需在线确认）
- H2: 混合注入 top-3 记忆 + top-2 Wiki 比 hint-only 更好
- H3: 普通聊天加载认知上下文可提升个性化程度
- H4: GLM/DeepSeek 在情感对话场景可能优于 Qwen

## 1. 离线 A/B 测试工具增强

### 场景 1.1: 测试脚本支持上下文变体
```
假设 (Given)  ab-chat-test.mjs 已有 Soul 变体和模型变体
当   (When)   运行测试时指定 --context hybrid
那么 (Then)   system prompt 中注入模拟的 top-3 记忆和 top-2 Wiki 摘要
并且 (And)    与 --context hint-only（当前模式）对比输出
```

### 场景 1.2: 测试脚本支持多模型 Provider
```
假设 (Given)  环境变量配置了 GLM_API_KEY 和 DEEPSEEK_API_KEY
当   (When)   运行 node gateway/scripts/ab-chat-test.mjs --model glm-4-plus
那么 (Then)   使用 GLM provider 运行全部测试用例
并且 (And)    输出与 Qwen 基线的对比报告（字数、冗余分、延迟）
```

### 场景 1.3: 测试报告可追踪历史
```
假设 (Given)  运行了多次 A/B 测试
当   (When)   查看 gateway/test-results/ab-chat/ 目录
那么 (Then)   每次运行生成带时间戳的 JSON + Markdown 报告
并且 (And)    JSON 包含：变体名、模型、测试用例、回复全文、指标、耗时
```

## 2. 多模型 Provider 支持

### 场景 2.1: Provider 注册表初始化
```
假设 (Given)  .env 中配置了 GLM_API_KEY + GLM_BASE_URL
并且 (And)    AI_PROVIDER_CHAT=glm
当   (When)   Gateway 启动
那么 (Then)   控制台输出 provider 注册表：dashscope(默认) + glm
并且 (And)    chat 层绑定到 GLM provider
```

### 场景 2.2: 未配置的 Provider 静默跳过
```
假设 (Given)  .env 中没有 DEEPSEEK_API_KEY
当   (When)   Gateway 启动
那么 (Then)   只注册 dashscope provider
并且 (And)    不报错，日志提示 "deepseek provider not configured"
```

### 场景 2.3: Provider 调用失败自动降级
```
假设 (Given)  chat 层配置为 GLM
当   (When)   GLM API 调用超时或 4xx/5xx
那么 (Then)   自动降级到 DashScope 重试一次
并且 (And)    日志记录降级事件（provider、错误原因、耗时）
```

### 场景 2.4: 推理模型检测扩展
```
假设 (Given)  AI_MODEL_CHAT=glm-4-plus
当   (When)   构建 providerOptions
那么 (Then)   正确判断该模型不支持 enable_thinking
并且 (And)    不传 enable_thinking 参数
```

## 3. 在线实验分配

### 场景 3.1: 确定性用户分流
```
假设 (Given)  实验 "soul-variant" 定义变体 ["current", "streamlined"]
当   (When)   用户 A 发起对话
那么 (Then)   基于 hash(userId + "soul-variant") 确定性分配变体
并且 (And)    同一用户每次对话始终分配到相同变体
```

### 场景 3.2: Soul 变体实验
```
假设 (Given)  用户被分配到 "streamlined" soul 变体
并且 (And)    用户没有自定义 soul（soul 表为空或使用默认）
当   (When)   对话初始化加载 soul
那么 (Then)   使用 Soul-B（精简版）替代默认 soul
并且 (And)    有自定义 soul 的用户不受实验影响
```

### 场景 3.3: 上下文注入变体实验
```
假设 (Given)  实验 "context-strategy" 定义变体 ["hint-only", "hybrid"]
并且 (And)    用户被分配到 "hybrid"
当   (When)   initChat 构建 system prompt
那么 (Then)   注入 top-3 记忆实际内容 + top-2 Wiki 摘要
并且 (And)    附加剩余数量提示
```

### 场景 3.4: 模型变体实验
```
假设 (Given)  实验 "chat-model" 定义变体 ["qwen3.5-plus", "glm-4-plus"]
并且 (And)    用户被分配到 "glm-4-plus"
当   (When)   classifyChatTier 选择 chat 层模型
那么 (Then)   使用 GLM provider + glm-4-plus
```

## 4. 实验指标采集

### 场景 4.1: 对话指标自动记录
```
假设 (Given)  用户在实验中完成一次对话
当   (When)   AI 回复生成完毕
那么 (Then)   记录结构化日志：userId、experiment、variant、response_length、latency_ms、tool_calls_count、model
```

### 场景 4.2: 离线分析报告
```
假设 (Given)  实验运行 7 天，有足够数据
当   (When)   运行分析脚本 node gateway/scripts/ab-analyze.mjs
那么 (Then)   按变体汇总：平均回复字数、平均延迟、工具调用率
并且 (And)    输出结论：哪个变体在哪些维度更优
```

## 验收行为（E2E 锚点）

### 行为 1: 离线 A/B 测试运行
1. 开发者配置 GLM_API_KEY 到 .env
2. 运行 `node gateway/scripts/ab-chat-test.mjs --model glm-4-plus`
3. 终端输出 8 个测试用例 × GLM 模型的回复对比
4. test-results/ab-chat/ 下生成 JSON + Markdown 报告

### 行为 2: 多 Provider 启动验证
1. .env 中配置 GLM_API_KEY + AI_PROVIDER_CHAT=glm
2. 启动 Gateway
3. 控制台输出 provider 注册表，chat 层显示 GLM
4. 发送聊天消息，AI 使用 GLM 模型回复

### 行为 3: 在线实验验证
1. 配置实验 "soul-variant" 为 50/50 分流
2. 不同 userId 的用户分别看到不同 soul 风格的回复
3. 实验日志中记录每次对话的变体和指标

## 边界条件

- [ ] 所有 provider key 都未配置：只使用默认 DashScope，无报错
- [ ] 实验配置为空：所有用户使用当前默认行为
- [ ] 用户有自定义 soul：实验不覆盖自定义 soul
- [ ] 向量搜索 API 不可用：loadWikiContext 降级到关键词搜索
- [ ] 混合注入时用户零记忆：注入空，不报错
- [ ] 实验中途修改变体比例：新对话生效，已有对话不变

## 接口约定

### 环境变量（新增）

```bash
# ── 多 Provider 配置 ──
# 每个 provider 需要 KEY + BASE_URL
GLM_API_KEY=                    # ← 用户填写
GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4

DEEPSEEK_API_KEY=               # ← 用户填写  
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1

# 层级 → Provider 映射（不配则全部用 DashScope）
# AI_PROVIDER_CHAT=glm
# AI_PROVIDER_AGENT=deepseek

# ── 实验配置 ──
# AB_EXPERIMENTS=soul-variant:current,streamlined;context-strategy:hint-only,hybrid
# AB_EXPERIMENT_ENABLED=true
```

### 实验分配接口

```typescript
// gateway/src/ai/experiment.ts
interface ExperimentConfig {
  name: string;          // "soul-variant"
  variants: string[];    // ["current", "streamlined"]
}

function getVariant(userId: string, experiment: ExperimentConfig): string;
// 确定性分配，基于 hash(userId + experiment.name)
```

### 指标日志格式

```typescript
interface ExperimentLog {
  timestamp: string;
  userId: string;
  experiment: string;
  variant: string;
  model: string;
  provider: string;
  response_length: number;
  latency_ms: number;
  tool_calls_count: number;
}
```

## 依赖

- `@ai-sdk/openai` — 已有，支持所有 OpenAI 兼容 API
- GLM API Key — **用户需申请** (https://open.bigmodel.cn)
- DeepSeek API Key — **用户需申请** (https://platform.deepseek.com)

## Implementation Phases

- [ ] **Phase 1: 离线测试工具增强**
  - [ ] 1a. `ab-chat-test.mjs` — 加上下文变体（hybrid vs hint-only）
  - [ ] 1b. `ab-chat-test.mjs` — 加多 provider 支持（GLM/DeepSeek）
  - [ ] 1c. 模拟记忆/Wiki 数据用于带上下文的离线测试
- [ ] **Phase 2: 多模型 Provider 支持**
  - [ ] 2a. `provider.ts` — Provider 注册表 + 多实例
  - [ ] 2b. `provider.ts` — 推理模型检测扩展（GLM/DeepSeek）
  - [ ] 2c. `provider.ts` — Provider 降级逻辑
  - [ ] 2d. `.env` — 添加新 provider 配置模板
- [ ] **Phase 3: 在线实验框架**
  - [ ] 3a. 新文件 `experiment.ts` — 实验定义 + 确定性分配
  - [ ] 3b. `chat.ts` — 实验分流接入（soul/context/model 三个维度）
  - [ ] 3c. 实验指标日志记录
- [ ] **Phase 4: 分析工具**
  - [ ] 4a. 新脚本 `ab-analyze.mjs` — 离线分析实验数据
  - [ ] 4b. 按变体汇总指标，输出结论报告

## 用户需要做的事

1. **申请 GLM API Key** — https://open.bigmodel.cn → 注册 → 创建 Key → 填入 .env `GLM_API_KEY=xxx`
2. **申请 DeepSeek API Key** — https://platform.deepseek.com → 注册 → 创建 Key → 填入 .env `DEEPSEEK_API_KEY=xxx`
3. **决定实验维度优先级** — 先测哪个：Soul 变体？上下文策略？还是模型切换？
4. **决定灰度范围** — 实验对所有用户还是部分用户开放？

## 备注

- 离线 A/B 测试脚本已存在于 `gateway/scripts/ab-chat-test.mjs`，报告在 `gateway/test-results/ab-chat/`
- Soul-B/C/D 变体定义已嵌入测试脚本中，可直接复用
- 多 Provider 不需要新 npm 依赖，`createOpenAI` 适配所有 OpenAI 兼容 API
- 在线实验对有自定义 soul 的用户透明（不覆盖）
- 上下文混合注入增加约 250 tokens，系统提示 3000+ tokens 基础上可忽略
