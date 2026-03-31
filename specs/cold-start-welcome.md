# 冷启动欢迎体验

> 状态：✅ 已完成 | 优先级：P0 | 依赖：cold-start-onboarding✅ | 完成日期：2026-03-31

## 概述

用户完成冷启动5问后，时间线应立刻展示一组**预存欢迎日记**（material 类型），带有完整的标签、Strike 结构和跨日记关联——让用户第一眼就感知到"这个产品能从混沌中长出结构"。同时修复标签链路断裂，日记内容支持 Markdown 渲染，侧边栏"发现"按钮变灰并展示未来功能全景。

## Part A: 预存欢迎日记

### 场景 1: 冷启动完成后插入欢迎日记
```
假设 (Given)  用户刚完成冷启动5问（onboarding_done=true）
当   (When)   onboarding 流程结束、进入主界面
那么 (Then)   时间线中出现 3 条欢迎日记（source_type='material'）
并且 (And)    日记样式与用户日记完全一致，无特殊标识
并且 (And)    日记按预设顺序排列，时间戳间隔 1 分钟
并且 (And)    每条日记带有预设标签（record_tag），立刻可见
并且 (And)    欢迎日记之间有跨日记关联（Bond），展开可见"相关记录"
```

### 场景 2: 欢迎日记内容 — 3 篇
```
日记 1: "念念有路 · 功能介绍"
  内容（Markdown格式）：
    产品核心能力介绍——语音/文字混沌输入、AI 自动拆解为想法和待办、
    标签自动生成、相关日记链接、每日回顾、目标管理。
    用分段和加粗突出关键功能。
  标签：[功能介绍, 产品指南]
  Strike: 2-3 个 perceive 类

日记 2: "路路诞生的故事"
  内容（Markdown格式）：
    路路（AI 助手）的诞生背景——为什么需要一个"认知操作系统"，
    从混沌想法到结构涌现的设计理念，AI 沉默为主的哲学。
  标签：[路路的故事, 产品理念]
  Strike: 2-3 个 realize 类

日记 3: "创始人的信"
  内容（Markdown格式）：
    创始人写给用户的一封信——为什么做这个产品、
    对"记录→认知→行动"的理解、当前版本的状态、邀请用户一起探索。
  标签：[创始人, 写给你的信]
  Strike: 2 个 realize 类

Bond 关系：
  日记1 ↔ 日记2: type=context_of, strength=0.7
  日记2 ↔ 日记3: type=resonance, strength=0.6
```

### 场景 3: 欢迎日记可删除
```
假设 (Given)  时间线中有欢迎日记
当   (When)   用户删除某条欢迎日记
那么 (Then)   正常删除（CASCADE 清理 strike/bond/tag）
并且 (And)    删除后不会重新创建
```

### 场景 4: 不重复插入
```
假设 (Given)  用户已完成冷启动且欢迎日记已存在
当   (When)   用户再次打开应用或重新登录
那么 (Then)   不会重复创建欢迎日记
```

## Part B: 标签链路修复

### 场景 5: Digest L1 标签立刻可见
```
假设 (Given)  用户输入一条日记并触发 Digest L1
当   (When)   Digest 完成 Strike 分解并写入 strike_tag
那么 (Then)   同时将标签通过 tagRepo.upsert + addToRecord 写入 record_tag
并且 (And)    用户刷新时间线后立刻看到标签
并且 (And)    后续 Tier2 产出的聚类标签可追加（ON CONFLICT DO NOTHING）
```

## Part C: 日记 Markdown 渲染

### 场景 6: 日记内容支持分段和加粗
```
假设 (Given)  日记内容包含 Markdown 格式（段落、**加粗**、列表等）
当   (When)   用户在时间线查看日记卡片或展开详情
那么 (Then)   内容以 Markdown 格式渲染（使用现有 MarkdownContent 组件）
并且 (And)    卡片摘要（short_summary）支持 Markdown
并且 (And)    展开后的 transcript 支持 Markdown
```

## Part D: 侧边栏"发现"变灰 + 未来功能提示

### 场景 7: 发现按钮变灰
```
假设 (Given)  用户打开侧边栏
当   (When)   侧边栏渲染完成
那么 (Then)   "发现"按钮显示为灰色（opacity-40）
并且 (And)    图标和文字均为灰色调
```

### 场景 8: 点击弹出未来功能列表
```
假设 (Given)  侧边栏中"发现"按钮为灰色
当   (When)   用户点击"发现"按钮
那么 (Then)   弹出轻量 toast 或气泡提示：
              "更多功能还在路上 🚀
               认知地图 · 大师视角 · 行动复盘
               Skills · MCP · Tools"
并且 (And)    提示 3 秒后自动消失
并且 (And)    不触发页面跳转
```

## 边界条件
- [ ] 多设备登录不重复创建（通过 user_id 查询 source_type='material' 的 system 记录判重）
- [ ] 欢迎日记 Strike 不参与 Tier2 聚类（source_type='material' 已有降权机制）
- [ ] record_tag 复合主键防止标签重复（ON CONFLICT DO NOTHING）

## 实现要点

1. **欢迎日记数据**：独立文件 `gateway/src/handlers/welcome-seed.ts`，硬编码 3 篇内容 + Strike + Bond + Tag
2. **调用时机**：onboarding.ts Q5 完成后调用 `seedWelcomeDiaries(userId, deviceId)`
3. **标签修复**：digest.ts 写 strike_tag 后追加 tagRepo.upsert + addToRecord
4. **Markdown 渲染**：notes-timeline.tsx 中 `<p>` 替换为 `<MarkdownContent>`
5. **侧边栏灰色入口**：sidebar-drawer.tsx 修改发现按钮样式 + 点击事件

## 依赖
- cold-start-onboarding ✅
- MarkdownContent 组件 ✅（shared/components/markdown-content.tsx）
- tagRepo.upsert + addToRecord ✅
