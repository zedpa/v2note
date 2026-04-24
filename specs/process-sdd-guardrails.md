---
id: "PROC-001"
title: "SDD 流程守卫（Hook + Lint）"
status: completed
domain: infra
risk: medium
dependencies: []
created: 2026-04-17
updated: 2026-04-24
---

# SDD 流程守卫：用 Hook + Lint 堵住"被遗忘的 CLAUDE.md"

## 背景与要解决的三个问题

1. **Spec 场景质量低**：写出的 Given/When/Then 常滑向"接口测试脚本"，不是用户视角。
2. **fix-*.md 修改未回写**：Bug 修复的新场景/边界长期只活在 fix spec 里，主 spec 过期。
3. **CLAUDE.md 被跳过**：核心流程（先读 INDEX、先写 E2E、先写测试再实现）靠 LLM 自觉，会漏。

解决思路：**把软约束变硬约束**。LLM 合规性不可信，靠 harness 的 hook 和 CI 层的 lint 来拦。

---

## 总体架构

```
用户输入
  └─▶ UserPromptSubmit hook ──▶ 关键词 → 自动注入"先读 specs/INDEX.md"提醒
  └─▶ Claude 工作
        ├─ PreToolUse(Write/Edit features|gateway) ──▶ 校验前置条件（spec 已读、E2E 已写）
        ├─ PreToolUse(Write/Edit specs/*.md) ──▶ 强制加载 _template.md
        ├─ PostToolUse(Edit specs/fix-*.md) ──▶ 校验 backport 字段
        └─ Stop hook ──▶ 运行 spec-lint + sdd-gate，未过不让声明完成
  └─▶ pre-commit (lint-staged)
        ├─ spec-lint.sh     ──▶ 用户视角检查
        └─ sdd-gate.sh      ──▶ fix 回写 / 测试覆盖 / E2E 同步
```

---

## 实施阶段

### Phase A：硬隔离的基础设施（无业务风险，先做）

**A1. 建 `.claude/hooks/` 目录**，放 hook 脚本（bash + node 混合）。
- `hooks/check-spec-read.sh` — 检查 transcript 里是否已读过 `specs/INDEX.md` 或目标 domain 的 spec
- `hooks/check-e2e-first.sh` — 检查是否存在对应 `e2e/*.spec.ts`
- `hooks/inject-spec-reminder.sh` — UserPromptSubmit 触发时输出提醒
- `hooks/check-fix-backport.sh` — fix-*.md 标 completed 时检查主 spec 是否被 touch
- `hooks/on-stop.sh` — 汇总 Stop 时的全局检查

**A2. 建 `scripts/spec-lint.ts`（新）**
校验规则（每条违规输出文件+行号）：
- [R1] frontmatter 必须有 `id/status/domain/risk/created/updated`
- [R2] 每个 `### 场景 X.X` 下 When 行必须以用户动作动词开头（白名单：点击/输入/打开/上传/录音/说/选择/拖动/长按/刷新/关闭/返回/滑动）
- [R3] Then 行禁止出现实现词（黑名单：调用/函数/API/数据库/SQL/setState/dispatch/reducer/表/字段/index/ORM）
- [R4] 每个场景必须同时存在 When 和 Then
- [R5] 文件若含 `## 验收行为（E2E 锚点）` 则至少一个 "行为 N" 子节
- [R6] fix-*.md 必须有 `backport:` frontmatter 字段（指向主 spec 的 path#场景号）
- [R7] 单 spec 文件 > 500 行打警告（非阻断），> 800 行阻断

**A3. 扩展 `scripts/spec-check.sh`（已有）**
- 新增：扫描所有 `status: completed` 的 `fix-*.md`，比对其 `backport:` 指向的主 spec 的最后 mtime 是否晚于 fix 的 `updated`。晚 → 回写过；早 → 报错。
- 新增：扫描 `specs/buglog.md` 每条 entry 必须有 `backported_to:` 字段，空则报错。

**A4. 改 `specs/_template.md`**
加一段「反例 vs 正例」小抄（放在 `## 1. [功能模块 A]` 前面），不超过 30 行：
```
❌ 当 调用 POST /todos 接口                  → 不是用户视角
✅ 当 用户在待办输入框敲 "周五交报告" 并回车

❌ 那么 数据库 todos 表新增一行             → 泄露实现
✅ 那么 待办列表顶部出现 "周五交报告" 条目

❌ 那么 setState 更新 isOpen=true            → 泄露实现
✅ 那么 侧边栏展开，显示今日 3 条待办
```
同时给 fix-*.md 的 frontmatter 增加示例：
```yaml
backport: todos/todo-core.md#场景 2.3
```

### Phase B：配置 Hook（改变 Claude 实际行为）

**B1. 创建 `.claude/settings.json`**（项目级，非 local）
```jsonc
{
  "hooks": {
    "UserPromptSubmit": [
      { "command": ".claude/hooks/inject-spec-reminder.sh" }
    ],
    "PreToolUse": [
      {
        "matcher": { "tool": "Write|Edit", "paths": ["features/**", "gateway/src/**", "shared/**", "app/**"] },
        "command": ".claude/hooks/check-spec-read.sh"
      },
      {
        "matcher": { "tool": "Write|Edit", "paths": ["features/**", "gateway/src/**"] },
        "command": ".claude/hooks/check-e2e-first.sh"
      },
      {
        "matcher": { "tool": "Write|Edit", "paths": ["specs/*.md"] },
        "command": ".claude/hooks/load-spec-template.sh"
      }
    ],
    "PostToolUse": [
      {
        "matcher": { "tool": "Edit", "paths": ["specs/fix-*.md"] },
        "command": ".claude/hooks/check-fix-backport.sh"
      }
    ],
    "Stop": [
      { "command": ".claude/hooks/on-stop.sh" }
    ]
  }
}
```

**B2. 每个 hook 的退出码契约**
- `0` = 放行
- `2` = 阻断并把 stderr 作为 reminder 回注给 Claude（LLM 必须响应）
- 其他 = 错误，日志提示用户

**B3. 绕过机制（留后门避免死锁）**
环境变量 `SDD_SKIP=1` 跳过所有 hook。只用于紧急情况，且每次触发在终端打印红色警告。

### Phase C：CLAUDE.md 瘦身 + 按需加载

**C1. 把「已知陷阱」整体搬到 `docs/pitfalls/`**
- `docs/pitfalls/timezone.md`
- `docs/pitfalls/shared-components.md`
- `docs/pitfalls/ai-hallucination.md`
- `docs/pitfalls/db-lock.md`
- `docs/pitfalls/migration.md`

**C2. 新增 `.claude/hooks/load-pitfalls.sh`**
PreToolUse 时按被修改文件路径注入对应陷阱：
- 改 `gateway/src/lib/tz.ts` 相关 / `new Date`  → 注入 timezone.md
- 改 `components/` 被多引用文件 → 注入 shared-components.md
- 改 `gateway/src/cognitive/` 或 SQL 迁移 → 注入相应 pitfall

**C3. CLAUDE.md 主体保留：**
- 6 阶段流程
- 时区契约（已经是契约不是陷阱）
- 禁止事项
- 风险分级
陷阱区只留一句："详见 `docs/pitfalls/`，hook 会按需加载"

### Phase D：pre-commit 兜底

**D1. 新增 `scripts/sdd-gate.sh`** 作为 git pre-commit：
- 若 diff 包含 `features/**` 或 `gateway/src/**`（非 *.test.ts）→ 必须同 commit 或历史 commit 里有对应 `e2e/*.spec.ts`
- 若 diff 包含 `specs/fix-*.md` 且 status 变为 completed → 必须同 commit touch 其 backport 指向的主 spec
- 若 diff 包含 `specs/**/*.md` → 跑 spec-lint

**D2. 接入 husky**（或 simple-git-hooks）
`package.json` 加：
```jsonc
"simple-git-hooks": {
  "pre-commit": "bash scripts/sdd-gate.sh"
}
```

**D3. CI 也跑一遍**（GitHub Actions / 本地 `pnpm verify`）
`npm run verify` 链加入 `spec-lint` + `sdd-gate --ci`。

---

## 验收行为（E2E 锚点）

### 行为 1：Claude 没读 spec 就想改代码 → 被拦
1. 新开一个会话，直接说「改下 `features/todos/components/todo-create-sheet.tsx` 的按钮文案」
2. Claude 调 Edit，hook 检测 transcript 里没读过 `specs/todo-ui.md` 或 `specs/INDEX.md`
3. 退出码 2，Claude 收到 reminder「你必须先读 specs/INDEX.md」
4. Claude 读 INDEX 后再次 Edit，放行

### 行为 2：Spec 场景写成接口脚本 → lint 报错
1. 新建 `specs/foo.md`，场景写「当 调用 POST /foo」「那么 数据库新增一行」
2. `pnpm spec:lint` 输出两条违规，退出码非 0
3. pre-commit 阻断 commit

### 行为 3：fix-*.md 标 completed 但没回写主 spec → 被拦
1. 编辑 `specs/fix-xxx.md`，把 status 改为 completed，不动主 spec
2. PostToolUse hook 触发 `check-fix-backport.sh`
3. 发现 `backport: todo-core.md#场景 X` 指向的文件 mtime 早于 fix.updated，退出码 2
4. Claude 必须在同任务内 touch 主 spec

### 行为 4：CLAUDE.md 被瘦身，陷阱按需加载
1. Claude 改 `gateway/src/handlers/report.ts`（含日期计算）
2. PreToolUse hook `load-pitfalls.sh` 检测到路径匹配 → 注入 timezone.md 内容作为 reminder
3. Claude 拿到陷阱信息，不再用 `new Date()`

### 行为 5：紧急旁路
1. 用户说「这个是纯文档改动，SDD_SKIP=1 跑一下」
2. 设置环境变量后 hook 全部放行
3. 终端打印 ⚠️ 红色警告提醒本次跳过

---

## 边界条件 / 坑

- [ ] hook 脚本执行权限（`chmod +x`）必须在脚本创建时一起设置
- [ ] PreToolUse hook 慢（>2s）会严重影响体验 → 所有脚本必须 <500ms，超过用异步 preflight
- [ ] "transcript 里是否读过 spec" 的检测方式：hook 能拿到 transcript 路径（`$CLAUDE_TRANSCRIPT_PATH`），grep 文件名即可；注意要允许 `Agent` 子代理读过也算
- [ ] `check-e2e-first.sh` 的 E2E 存在判断要宽松：允许本次会话创建中（只要目标路径下有 `*.spec.ts` 就放行），避免死锁
- [ ] fix-*.md 的 `backport` 字段是新字段，历史 fix 全部缺失 → 先加 migration 脚本批量填 `backport: UNKNOWN`，lint 只对新/改动的 fix 报错
- [ ] spec-lint 的动词/黑名单会误伤合法场景（如"上传"属于用户动作但也常在实现里出现）→ 白名单宽松一些，先采集真实 spec 统计动词分布再定
- [ ] Stop hook 跑 `pnpm test` 太慢（全量几十秒）→ Stop 只跑 lint 和 spec-check；测试留给 Phase 4 显式触发

---

## 实施顺序建议

按 **A → C → B → D** 的顺序做最稳：

1. **A（脚本 + 模板）** 先落地，不改 Claude 行为，可独立验证
2. **C（CLAUDE.md 瘦身 + pitfalls 拆分）** 纯文档，低风险
3. **B（Hook 配置）** 最后接入，因为它是"硬约束"，调错会卡住开发
4. **D（pre-commit）** 最后加，一上来就加容易堵 commit

每个 Phase 完成后，跑一遍 5 个验收行为验证。

---

## 本 spec 自身的完成标准

- [ ] `.claude/hooks/` 5 个脚本存在且可执行
- [ ] `scripts/spec-lint.ts` 能跑，`pnpm spec:lint` 接入 package.json
- [ ] `scripts/spec-check.sh` 扩展了 backport 检查
- [ ] `.claude/settings.json` 配好 4 类 hook
- [ ] `specs/_template.md` 加入反例/正例小抄
- [ ] `docs/pitfalls/` 5 个分类文件，CLAUDE.md 陷阱区精简到 < 10 行
- [ ] 5 个验收行为手动跑通
- [ ] 在 `specs/buglog.md` 留一条「流程改进」记录

## 备注

- 这份 plan 本身就是 SDD 流程的产物（spec 先行），实施过程中任何偏差都要回写此 spec
- 落地后观察 2 周，根据 hook 日志（`.claude/hooks/logs/`）评估误伤率，再迭代规则
- 如果某条 hook 规则误伤频繁 → 不要关 hook，要细化规则，关 hook 等于回到起点
