# 共享组件与模板陷阱

> 按需加载：当改动涉及被多个 feature 引用的组件、或共享 prompt 模板。

## 共享组件修改

- 修改任何被 2+ feature 引用的组件前，必须：
  1. `grep -r <ComponentName>` 所有引用方
  2. 在 spec 中列出影响范围
  3. 检查 create/edit 路径的**对称性**（若组件同时被创建页和编辑页使用，修改一方要同步另一方）
- 来源：2026-04-16 fix-todo-anytime-time（创建页和编辑页都有 "09:00 回退" 逻辑，只改一处会漏）

## 共享 Prompt 模板

- 共享 prompt 模板（如 `gateway/src/prompts/templates.ts`）有多个消费者时，更新占位符必须同步更新所有消费者的 `.replace()` 逻辑
- 否则 AI 会收到未替换的 `{变量名}` 字面量
- 来源：fix-morning-briefing

## 同一功能多路径分裂

- 同一功能多条执行路径是高危模式：handler 层统一入口，禁止路由层分叉到不同 handler
- 举例：命令面板走 legacy handler，推送走 v2 handler，两者行为不一致
- 来源：2026-04-16 晚间总结路径分裂 bug
