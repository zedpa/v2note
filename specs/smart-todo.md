# 智能待办 — 从认知到行动的核心桥梁

> 状态：✅ 已完成 | 优先级：Phase 4（核心体验）
> 2026-03-29 修复：eventBus todo.created → WS 推送 → 前端 toast "已创建待办：XXX"
> 2026-03-30 修复：goal 创建也触发事件 + userId 字段补全 + 测试覆盖
> 依赖：todo-strike-bridge（数据桥梁）, agent-tool-layer + agent-plan（Agent 能力）

## 概述
待办是产品宣言"从认知到行动"的核心环节。用户用自然语言（语音/文字）管理待办全生命周期：创建、修改、完成、查询、拆解。AI 自动提取时间、人物、优先级、父子关系，通过 Agent 工具层执行操作。

**核心原则：**
- 用户不需要手动填表单——说一句话就够
- AI 准确识别待办 vs 想法 vs 目标（粒度判断）
- Agent 主动管理（提醒、推迟建议、重复检测）

## 场景

### 场景 1: 自然语言创建待办
```
假设 (Given)  用户说"明天下午3点找张总确认报价，挺急的"
当   (When)   Digest L1 处理
那么 (Then)   提取：
      text = "找张总确认报价"
      scheduled_start = 明天 15:00
      person = 张总
      priority = high（"挺急的"）
      parent_goal = 自动匹配"供应商评估"（如存在）
并且 (And)    创建 Strike(intend, granularity=action) + todo 投影
并且 (And)    路路回复"已加到明天日程，下午3点提醒你。关联到了'供应商评估'目标。"
```

### 场景 2: 语音管理已有待办
```
假设 (Given)  用户说"把找张总那个事推迟到下周一"
当   (When)   Agent 处理
那么 (Then)   search({ query: "找张总", scope: "todos" }) 找到目标 todo
并且 (And)    update_todo({ scheduled_start: 下周一 })
并且 (And)    路路回复"已推迟到下周一。"
```

### 场景 3: 批量创建子任务
```
假设 (Given)  用户说"给供应商评估加几个子任务：查资质、比价格、验质量"
当   (When)   Agent 处理
那么 (Then)   search 找到"供应商评估" goal
并且 (And)    批量创建 3 个 todo（parent_goal = 供应商评估）
并且 (And)    每个 todo 都有对应的 intend Strike
并且 (And)    路路回复确认清单
```

### 场景 4: 目标拆解（Plan 驱动）
```
假设 (Given)  用户说"帮我把Q2产品发布拆解一下"
当   (When)   Agent 进入 Plan 模式
那么 (Then)   Step 1: search 找到目标
并且 (And)    Step 2: AI 基于相关 Cluster 生成子目标+待办方案
并且 (And)    Step 3: 呈现方案卡片，等待确认（阻断点）
并且 (And)    Step 4: 用户确认/修改后 batch 创建
并且 (And)    每个创建的项都有 Strike 锚点
```

### 场景 5: 粒度自动判断
```
假设 (Given)  用户说"我要做一个供应链管理系统"
当   (When)   Digest L1 判断粒度
那么 (Then)   AI 判断 = project（复合方向）
并且 (And)    创建 project goal + 建议 2-4 个子目标
并且 (And)    子目标 status='suggested'，用户可确认

假设 (Given)  用户说"明天打个电话给张总"
当   (When)   Digest L1 判断粒度
那么 (Then)   AI 判断 = action（单步可完成）
并且 (And)    直接创建 todo，不创建 goal

假设 (Given)  用户说"今年要把身体搞好"
当   (When)   Digest L1 判断粒度
那么 (Then)   AI 判断 = goal（多步、长期）
并且 (And)    创建 goal (status='active')
并且 (And)    扫描相关 Cluster 建立关联
```

### 场景 6: 时间/优先级自动提取
```
假设 (Given)  用户说"下周之前把报告写完，不着急"
当   (When)   Digest 提取
那么 (Then)   deadline = 下周日
并且 (And)    priority = low（"不着急"）
并且 (And)    无明确 scheduled_start → 由 Agent 根据用户习惯建议

时间表达识别范围：
  绝对时间："3月25号下午3点" → 2026-03-25T15:00
  相对时间："明天" "后天" "下周一" "下个月" → 计算绝对日期
  模糊时间："这周之内" "月底前" "尽快" → deadline
  无时间："记一下" → 不设 scheduled_start
```

### 场景 7: 重复待办检测
```
假设 (Given)  用户说"记得给张总打电话"
并且 (And)    已存在未完成的"找张总确认报价"
当   (When)   创建前检查
那么 (Then)   路路提示"你已经有一个关于张总的待办了，是同一件事吗？"
并且 (And)    用户确认后合并或分开创建
```

## 边界条件
- [ ] 极短待办（"买菜"2 字）：仍然有效，不拒绝
- [ ] 时间识别模糊（"回头"）：不设时间，不硬猜
- [ ] 人名识别错误：允许用户在待办详情中修正
- [ ] 批量创建上限：单次 Plan 最多 10 个子任务

## 涉及文件
| 文件 | 改动类型 |
|------|---------|
| `gateway/src/handlers/digest-prompt.ts` | 修改：intend Strike 加 granularity + time + person 提取 |
| `gateway/src/handlers/digest.ts` | 修改：intend Strike 自动投影 todo |
| `gateway/src/tools/definitions/update-todo.ts` | 修改：支持时间修改自然语言 |
| `gateway/src/tools/definitions/create-todo.ts` | 修改：支持 parent_goal 关联 |
| 新建 `gateway/src/cognitive/todo-projector.ts` | intend Strike → todo 投影逻辑 |

## AI 调用
- 粒度判断：0 次（合并到 Digest L1 prompt 中）
- 时间/人物提取：0 次（合并到 Digest L1 prompt 中）
- 目标拆解：1 次/Plan（AI 生成方案）
- 重复检测：0 次（embedding 匹配）

## 验收标准
用户用自然语言说一句话，系统根据粒度自动创建 todo/goal/project。时间和人物准确提取。Agent 能管理待办全生命周期（修改、完成、推迟、查询）。
