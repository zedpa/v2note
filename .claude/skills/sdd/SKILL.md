---
name: sdd
description: Spec-Driven Development 全链路流水线。输入需求或 bug 描述，自动按 6 阶段流程执行：Spec → E2E 验收测试 → 单元测试+实现 → 对抗性审查 → 验证 → 流程回顾。支持批量 bug 输入自动拆分。
argument-hint: "[需求描述] 或 [fix bug描述（支持多条）]"
---

# /sdd — Spec-Driven Development 流水线

## 触发方式

```
/sdd 实现目标模块进度可视化
/sdd fix iOS端待办拖拽偶发卡顿
/sdd 继续 specs/todo-ui.md
```

**批量 bug 输入**：
```
/sdd fix
1. AI记忆错乱
2. 早报通知未持久化
3. 语音创建日记重复
```

---

## 输入解析

### 单条输入
1. 参数以 `fix` 开头且只有一条 → Bug 修复快捷流程
2. 参数是已有 spec 文件路径（如 `specs/xxx.md`）→ 跳过 Phase 1，从该 spec 继续
3. 否则 → 新功能需求，进入 Phase 1

### 批量输入（多条 bug）
当输入包含编号列表（1. 2. 3. ...）时，进入批量模式：

**Phase 0: 拆分与分组**

1. **逐条分析**每个 bug 描述，判断所属 domain
2. **读取 `specs/INDEX.md`**，找到每个 bug 对应的已有 spec
3. **按 domain 分组**：同一 domain 的 bug 合并到一个 fix spec
4. **展示拆分方案**给用户：

```
📋 Bug 拆分方案
───────────────
fix-1: fix-ai-memory.md [domain: cognitive]
  - #1 AI记忆错乱（昨天/今天分不清）
  
fix-2: fix-daily-report.md [domain: report]  
  - #2 早报未持久化 + 发送时间错误

fix-3: fix-agent-tool.md [domain: agent]
  - #3 AI不调用工具 + 暴露工具名
  
fix-4: fix-voice-diary.md [domain: voice]
  - #4 语音创建日记重复

fix-5: fix-chat-intent.md [domain: chat]
  - #5 复合日记被全部识别为查询

执行顺序建议: fix-1 → fix-5 → fix-3 → fix-2 → fix-4
（按依赖关系和影响面排序）

👉 确认拆分？或调整？
```

5. **暂停** ⏸️ 等用户确认拆分方案
6. 用户确认后，**逐个**按 Phase 1-6 执行每个 fix spec
7. 每个 fix 完成后给出简短报告，然后自动进入下一个
8. 全部完成后，给出总报告

**分组规则**：
- 同一 domain + 同一功能模块的 bug → 合并为一个 fix spec
- 不同 domain 的 bug → 必须拆成独立 fix spec
- 一个 fix spec 不超过 3 个场景，超过则继续拆分
- 如果某个 bug 涉及多个 domain → 标注为 `risk: high`，按主要 domain 归类

---

## Phase 1: Spec

1. 读取 `specs/INDEX.md`，查找是否已有匹配的 active/draft spec
2. 已有 → 在已有 spec 中追加场景；没有 → 基于 `specs/_template.md` 生成新 spec
3. 确保 spec 包含「验收行为（E2E 锚点）」部分（纯用户视角操作路径）
4. 根据任务复杂度设置 `risk` 字段（low/medium/high）
5. 如果是 bug 修复 → 创建 `fix-<简述>.md`

**Phase 1b: Spec 审查（Agent 自审）**
1. Spec 写完后，**立即**用 `code-review-global` Agent 审查 spec 变更
2. 审查要点：场景完整性、边界条件覆盖、与现有 spec 一致性、接口约定可行性
3. 主 Agent 根据审查结果修改 spec
4. 修改完成后，再展示给用户确认

**输出给用户**：审查修正后的 spec 内容
**暂停** ⏸️ 等用户确认：「ok」/「改 xxx」

---

## Phase 2a: E2E 验收测试

1. 从 spec 的「验收行为」部分生成 E2E 测试 → `e2e/` 目录
2. 测试只描述用户可见的操作和结果，不涉及内部实现
3. 如果是 `risk: low` → 跳过用户确认，直接进入 Phase 2b

**输出给用户**：E2E 测试代码
**暂停** ⏸️ 等用户确认：「这就是我要的验收标准」/「补充 xxx」

---

## Phase 2b: 单元测试 + 实现（sdd-implementer Agent）

**必须使用 `sdd-implementer` Agent 执行此阶段**，确保与 E2E 测试的上下文完全隔离。

调用方式：
```
使用 Agent 工具，指定 sdd-implementer agent：
- 传入 spec 文件路径
- Agent 独立读取 spec + CLAUDE.md + 相关代码
- Agent 禁止读取 e2e/ 目录
- Agent 完成后返回实现报告
```

主 Agent 收到报告后，检查是否有异常标注，再进入 Phase 3。

**自动执行，不暂停**

---

## Phase 3: 对抗性审查（code-review-global Agent）

**必须使用 `code-review-global` Agent 执行此阶段**，确保审查视角独立于实现。

1. 用 code-review-global Agent 审查本次 diff
2. 审查 prompt：「审查以下 diff，找出可能的 bug、未覆盖的边界条件、以及 E2E 测试未捕获的失败路径。你的目标不是验证代码正确，而是证明它是错误的。

请：
1. 构造极端输入
2. 寻找边界条件
3. 模拟用户误操作
4. 找出任何可能导致系统崩溃或数据错误的路径」
3. 发现问题 → 主 Agent 补充测试 → 修复 → 重新验证

**自动执行，不暂停**

---

## Phase 4: 验证循环

1. `pnpm test`（单元测试）
2. `npx tsc --noEmit`（类型检查）
3. `npx playwright test`（E2E 验收）
4. 失败 → 修改实现（不改测试！不改 E2E！）→ 重试，最多 5 次
5. 5 次后仍失败 → 暂停报告问题

**自动执行，失败时暂停**

---

## Phase 5: 收尾

1. 更新 spec 状态
2. bug 修复 → 回写到模块 spec + 追加 `specs/buglog.md`
3. 分析本次失败→修复循环的根因，沉淀到 CLAUDE.md「已知陷阱」

**自动执行，不暂停**

---

## Phase 6: 流程回顾

向用户展示本次执行摘要：

```
📊 SDD 执行报告
─────────────────
Spec:        [名称]
Risk:        [low/medium/high]
改动文件:     [N] 个
单元测试:     [N] 个（✅ 全部通过）
E2E 测试:     [N] 个（✅/❌）
验证循环:     [N] 次重试
对抗性审查:   发现 [N] 个问题
沉淀规则:     [N] 条写入已知陷阱

流程自检:
- [自评内容]

👉 请评估本次流程是否顺畅，有什么需要改进的？
```

**暂停** ⏸️ 等用户反馈 → 改进建议直接修改 CLAUDE.md

---

## 批量模式总报告

所有 fix spec 执行完毕后，展示汇总：

```
📊 批量修复总报告
─────────────────
总计: [N] 个 fix spec
通过: [N] ✅
失败: [N] ❌（列出具体哪个）
新增测试: [N] 个
沉淀规则: [N] 条
buglog 新增: [N] 条

👉 请评估整体流程，有什么需要改进的？
```

---

## 暂停点总结

| 阶段 | risk: low | risk: medium | risk: high |
|------|-----------|-------------|------------|
| Phase 0 拆分 | ⏸️（批量时） | ⏸️（批量时） | ⏸️（批量时） |
| Phase 1 Spec | 自审→⏸️ | 自审→⏸️ | 自审→⏸️ |
| Phase 2a E2E | 跳过 | ⏸️ | ⏸️ |
| Phase 2b 实现 | 自动 | 自动 | ⏸️ 每步确认 |
| Phase 3 审查 | 自动 | 自动 | ⏸️ |
| Phase 4 验证 | 自动 | 自动 | 自动 |
| Phase 5 收尾 | 自动 | 自动 | 自动 |
| Phase 6 回顾 | ⏸️ | ⏸️ | ⏸️ |

## 每天首次使用前

Agent 自动检查 `specs/buglog.md` 中「已提炼: ❌」的条目，判断是否需要提炼为通用规则写入 CLAUDE.md。
