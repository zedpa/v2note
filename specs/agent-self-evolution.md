# Agent 自适应——交互偏好学习 + Soul 守护

> 状态：🟡 待开发 | 优先级：Phase 5+（需要足够交互数据）| 预计：4-5 天
> 依赖：agent-plan（Plan 完成后回调触发偏好提取）、agent-tool-layer（unmet_request 表）

## 概述
路路不只是一个执行工具的 agent，更是一个能根据用户互动模式调整自身行为的"活的"系统。交互偏好（用户总是改什么、跳过什么、偏好什么风格）应融入现有 Memory 系统而非单独建表。Soul（路路人格）只在用户明确要求时调整，防止人格飘忽不定。

**当前状态：**
- `memory/manager.ts`：Mem0 两阶段（提取候选事实 → AI 决定 ADD/UPDATE/DELETE），支持 fact/preference 类型
- `soul/manager.ts`：updateSoul 在 endChat 时触发，基于对话摘要全量更新
- `profile/manager.ts`：updateProfile 在 endChat 时触发
- `lib/text-utils.ts`：maySoulUpdate / mayProfileUpdate 关键词预过滤
- 缺少：交互偏好的结构化提取、Soul 更新的严格门控

## 场景

### 场景 1: 交互偏好融入 Memory——不新建表

```
假设 (Given)  用户完成一个 Plan（目标拆解）
并且 (And)    用户在确认前修改了方案
当   (When)   Plan 执行完成后触发偏好分析回调
那么 (Then)   比对 plan.original_steps 与 plan.final_steps 的差异
并且 (And)    如果是该用户第 3 次以上做类似修改：
      → 调用 memoryManager.processContent() 提取偏好
      → Memory 类型标记为 interaction（Memory.source = 'interaction'）
      → 内容格式："用户倾向于在拆解方案中加入风险评估步骤"

并且 (And)    如果是第 1-2 次修改：
      → 仅记录到临时计数，不创建 Memory（避免噪声）
并且 (And)    Memory 去重：相似偏好 merge 而非重复创建
```

### 场景 2: 隐式偏好提取——从行为模式推断

```
假设 (Given)  用户过去 14 天有 20+ 次工具调用记录
当   (When)   周偏好分析任务执行（挂载在 daily-cycle 周任务中）
那么 (Then)   分析以下行为模式：

  工具使用偏好：
    "用户从不使用 create_goal，总是手动在目标页创建"
    → Memory: "用户偏好在 UI 中管理目标，对话中只管待办"

  时间偏好：
    "用户 80% 的对话发生在 21:00-23:00"
    → Memory: "用户习惯晚间使用，晚间回顾时间可后延"

  确认偏好：
    "用户对 Plan 方案平均修改 1.2 步/次（低修改率）"
    → Memory: "路路的 Plan 方案质量满足用户期望，可适当减少确认频率"

  话题敏感度：
    "用户 3 次跳过涉及'家庭'话题的回顾洞察"
    → Memory: "用户不希望路路主动讨论家庭话题"

并且 (And)    仅当 evidence_count >= 3 时才创建/更新 Memory
并且 (And)    所有推断以建议形式呈现："观察到你...，我以后会..."
```

### 场景 3: 偏好应用——影响路路的行为

```
假设 (Given)  Memory 中存在交互偏好记录
当   (When)   路路构建回复或生成 Plan
那么 (Then)   偏好通过 context loader 注入 system prompt
并且 (And)    注入格式：
      ## 用户交互偏好
      - 用户偏好简洁回复，不需要解释推理过程
      - 用户倾向在拆解方案中包含风险评估步骤
      - 用户不希望路路主动讨论家庭话题

并且 (And)    偏好影响范围：
      Plan 生成 → 参考历史修改模式
      工具选择 → 参考用户工具使用偏好
      回复风格 → 参考沟通偏好
      话题边界 → 参考敏感话题列表
```

### 场景 4: Soul 守护——只在明确要求时调整

```
假设 (Given)  当前 soul 在每次 endChat 时可能被更新
当   (When)   改造 Soul 更新机制
那么 (Then)   Soul 只在以下情况更新：

  用户显式要求：
    "路路你以后说话简洁点" → 更新 soul
    "路路你不要那么客气" → 更新 soul
    "路路你可以叫我老板" → 更新 soul（称呼偏好）

  不更新的情况：
    用户只是不回复路路的追问 → 不调 soul（可能只是忙）
    用户语气比较冷淡 → 不调 soul（可能只是心情不好）
    用户纠正了一个事实错误 → 更新 memory/profile，不调 soul

并且 (And)    Soul 更新需要通过 intent 分类器判断"这是对路路行为的反馈"
并且 (And)    maySoulUpdate 的关键词检测从宽泛改为严格：
      保留："你以后"、"你不要"、"你可以"、"叫我"、"你的风格"
      移除："我觉得"、"我想"（这些更新 profile 而非 soul）
```

### 场景 5: Profile 被动学习——从对话内容推断

```
假设 (Given)  用户在对话中提到新的个人信息
      例："我下周要出差去深圳"
当   (When)   endChat 触发 Profile 更新
那么 (Then)   提取事实性信息更新到 profile
并且 (And)    区分持久事实和临时事实：
      持久："用户是产品经理" → 长期保留
      临时："用户下周去深圳出差" → 标记有效期，2 周后过期

并且 (And)    profile 更新不影响 soul
并且 (And)    profile 在 context loader 中以"用户背景"形式注入
```

### 场景 6: 偏好衰减——旧偏好自动降权

```
假设 (Given)  一条交互偏好 Memory 已 60 天未被触发/验证
当   (When)   Memory 衰减检查运行（挂载在 daily-cycle 月任务中）
那么 (Then)   标记该 Memory 为 stale
并且 (And)    stale Memory 在 context 注入时排序靠后
并且 (And)    90 天后自动删除（用户可能已改变偏好）

假设 (Given)  一条偏好被用户行为反驳
      例：Memory "用户不喜欢路路主动提建议"
           但最近用户 3 次主动问"你有什么建议吗"
当   (When)   检测到矛盾
那么 (Then)   更新该 Memory 为新的偏好
并且 (And)    不保留旧偏好（不做矛盾共存）
```

### 场景 7: unmet_request 需求聚合（单用户版）

```
假设 (Given)  unmet_request 表已积累数据
当   (When)   月度需求分析任务执行
那么 (Then)   对 unmet_request 按语义聚类
并且 (And)    输出报告：
      "过去 30 天用户 5 次尝试删除目标，3 次尝试设置提醒"
并且 (And)    报告写入 AI diary（给开发者看）
并且 (And)    单用户阶段不通知维护 Agent（不存在）
并且 (And)    多用户阶段 → 跨用户聚合，超过阈值通知维护 Agent
```

### 场景 8: 交互偏好的用户可见性

```
假设 (Given)  用户想知道路路记住了什么偏好
当   (When)   用户问"你记住了我哪些偏好"或"你是怎么了解我的"
那么 (Then)   路路调用 search({ scope: "all" }) 搜索 interaction 类型 Memory
并且 (And)    以列表形式展示：
      "根据我们的互动，我了解到：
       - 你喜欢简洁的回复
       - 你在拆解目标时偏好加入风险评估
       - 你习惯晚间使用念念有路
       这些准确吗？你可以让我修改或忘掉任何一条。"

并且 (And)    用户说"忘掉第三条" → 删除对应 Memory
并且 (And)    用户说"不对，我其实喜欢详细一点的回复" → 更新对应 Memory
```

## 边界条件
- [ ] Memory 总量上限：单用户最多 200 条（含 interaction 类型），超出淘汰最旧最低权重
- [ ] Soul 更新频率上限：每天最多 1 次 Soul 更新，防止抖动
- [ ] 偏好矛盾：同一维度出现矛盾偏好 → 以最近的为准
- [ ] 冷启动：新用户无交互偏好 → 使用默认行为，不猜测

## 接口约定

Memory 类型扩展：
```typescript
// memory 表增加 source 字段（或利用现有 metadata）
interface Memory {
  id: string;
  user_id: string;
  content: string;
  importance: number;
  source: 'conversation' | 'interaction' | 'system';  // 新增 interaction
  evidence_count?: number;   // interaction 类型：被观察到的次数
  expires_at?: Date;         // 临时事实的过期时间
  last_validated?: Date;     // 上次被行为验证的时间
}
```

偏好提取回调：
```typescript
interface PlanCompletionHook {
  onPlanComplete(plan: AgentPlan): Promise<void>;
}

// plan-executor.ts 中
async function onPlanComplete(plan: AgentPlan) {
  if (!plan.had_user_modifications) return;

  const modifications = diffPlanSteps(plan.original_steps, plan.final_steps);
  const similarCount = await countSimilarModifications(plan.user_id, modifications);

  if (similarCount >= 3) {
    await memoryManager.processContent(
      plan.device_id,
      `用户在"${plan.intent}"类型的任务中倾向于${summarizeModification(modifications)}`,
      { source: 'interaction', evidence_count: similarCount }
    );
  }
}
```

Soul 更新门控：
```typescript
// 替代当前的 maySoulUpdate 宽泛匹配
function shouldUpdateSoul(userMessages: string[]): boolean {
  const soulKeywords = [
    /你(以后|今后|之后)(要|可以|不要|别)/,
    /你(的|说话)(风格|语气|方式)/,
    /(叫我|称呼我|喊我)/,
    /你(太|不够)(啰嗦|简洁|客气|正式|随意)/,
  ];
  return userMessages.some(msg =>
    soulKeywords.some(kw => kw.test(msg))
  );
}
```

## 涉及文件
| 文件 | 改动类型 |
|------|---------|
| `gateway/src/memory/manager.ts` | 修改：支持 interaction source + evidence_count |
| `gateway/src/soul/manager.ts` | 修改：严格门控，减少更新频率 |
| `gateway/src/lib/text-utils.ts` | 修改：maySoulUpdate 改为严格正则 |
| `gateway/src/handlers/chat.ts` | 修改：endChat 中 soul/profile 更新逻辑 |
| `gateway/src/agent/plan-executor.ts` | 修改：Plan 完成回调触发偏好提取 |
| `gateway/src/cognitive/daily-cycle.ts` | 修改：挂载周偏好分析 + 月衰减检查 |
| `gateway/src/context/loader.ts` | 修改：交互偏好注入格式 |
| 新 migration | memory 表加 source/evidence_count/expires_at/last_validated |

## 依赖
- agent-plan（Plan 完成回调）
- 现有 Memory/Soul/Profile 系统
- daily-cycle（周/月任务调度）

## 验收标准
用户连续 3 次修改 Plan 中相同类型的步骤后，路路下次生成 Plan 时自动包含该类步骤；Soul 不再因为普通对话被频繁调整；用户可以查看和修改路路记住的偏好。
