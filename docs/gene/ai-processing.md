## gene_ai_processing
### 功能描述
AI 处理管道（v2 两级架构）。Process 负责轻量文本清理 + 意图分类，Digest 负责认知分解。结构化提取（Strike/Bond/Todo/Goal）全部由 Digest Tier1 完成。

### 处理链路（用户感知延迟 = ASR + Process）

```
松手 → ASR(2-10s) → Process(1-5s) → 前端显示结果
                      ├ 意图分类（指令型才调用 AI）
                      └ 文本清理（1次 AI 调用）
                     ↓ 后台异步（用户无感）
                     Digest Tier1 → Strike 拆解 + Todo/Goal 投影
                     ↓ 累计 ≥5 Strike
                     Digest Tier2 → 批量认知分析（聚类/矛盾/模式）
```

### Process 阶段（阻塞，用户等待）
- Step 0：Voice Action 意图分类（record/action/mixed）— 仅 text>10字触发
  - 纯指令型（action）：执行后直接返回，不走 Digest
  - 混合型（mixed）：执行指令部分，继续走 Digest
- Step 1：文本清理（1 次 AI 调用）— 去填充词 + 修错别字，严格保留原文句式
- Step 2-3：保存 summary + 更新 record status
- Step 4：写日记（后台 fire-and-forget）
- Step 5：触发 Digest（条件：冷启动 record<20 或 text>80字）

### Digest 阶段（后台异步，用户无感）
- 详见 [cognitive-engine.md](./cognitive-engine.md) 的 Tier1/Tier2 流程
- 含 Strike 去重机制（claimForDigest 原子抢占 + source_id+nucleus 去重）

### 转写清理规则
- 移除口语填充词和重复词
- 修正明显的错别字和语音识别错误
- **严格保留原文表述结构**：短句还是短句，倒装还是倒装
- 不将口语转为书面语，不合并或拆分句子

### 关键文件
- `gateway/src/handlers/process.ts` — Process 入口（意图分类 + 文本清理 + 触发 Digest）
- `gateway/src/handlers/voice-action.ts` — 语音指令分类与执行
- `gateway/src/handlers/digest.ts` — Tier1 认知分解（原子抢占 + Strike 去重）
- `gateway/src/handlers/digest-prompt.ts` — Digest AI prompt
- `gateway/src/cognitive/batch-analyze.ts` — Tier2 批量分析引擎
- `gateway/src/handlers/reflect.ts` — 反思问题生成 + AI 状态生成
- `gateway/src/proactive/engine.ts` — 定时任务（3h batch digest + 每日认知周期）

### 测试描述
- 输入：口语化文本 "嗯那个明天要开会啊然后就是说下午三点"
- 输出：summary = "明天要开会，下午三点"（仅去填充词，保留原文句式）
- 输入：无填充词文本 "现在这个录音怎么没有用呢？"
- 输出：summary = "现在这个录音怎么没有用呢？"（与原文完全一致）
