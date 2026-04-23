---
id: "092"
title: "冷启动五问与留存分析"
status: active
domain: onboarding
risk: medium
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-04-01
---
# 冷启动五问与留存分析

> 状态：🟡 待开发

## 概述

追踪用户冷启动五问的完成情况与后续 app 打开频次的关系，回答核心问题：**完成五问的用户是否比跳过的用户留存更好？在哪一步流失最多？**

## 数据模型

### 新增表：app_event（轻量级事件埋点）

```sql
CREATE TABLE app_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id),
  device_id UUID REFERENCES device(id),
  event TEXT NOT NULL,          -- 事件类型：'app_open', 'onboarding_step', 'onboarding_skip', 'onboarding_complete'
  payload JSONB DEFAULT '{}',   -- 附加数据，如 { "step": 3 }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_event_user ON app_event(user_id, event, created_at DESC);
CREATE INDEX idx_app_event_date ON app_event(created_at);
```

### 事件定义

| event | 触发时机 | payload |
|-------|---------|---------|
| `app_open` | 前端每次启动/恢复前台 | `{ "platform": "android" }` |
| `onboarding_step` | 用户完成五问中的某一步 | `{ "step": 1, "answer_length": 3 }` |
| `onboarding_skip` | 用户跳过某一步或跳过全部 | `{ "step": 3, "skip_type": "single" \| "all" }` |
| `onboarding_complete` | 五问全部完成 | `{ "total_steps": 5, "skipped_steps": [4] }` |

## 场景

### 场景 1: 记录 app 打开事件
```
假设 (Given)  用户已注册（有 user_id）
当   (When)   app 启动或从后台恢复到前台
那么 (Then)   向后端发送 app_open 事件
并且 (And)    同一自然日内，间隔 < 5 分钟的重复打开不重复计数（前端节流）
```

### 场景 2: 记录五问每一步完成
```
假设 (Given)  用户正在进行冷启动五问
当   (When)   用户回答了第 N 步（N = 1~5）
那么 (Then)   记录 onboarding_step 事件，payload 含 step 编号和回答长度
并且 (And)    回答长度 = 0 时不记录 step 事件（由 skip 事件覆盖）
```

### 场景 3: 记录跳过行为
```
假设 (Given)  用户正在进行冷启动五问
当   (When)   用户点击"跳过这个问题"
那么 (Then)   记录 onboarding_skip 事件，skip_type = "single"
```

```
假设 (Given)  用户在 Q1 或 Q2 阶段
当   (When)   用户点击"跳过，直接开始"
那么 (Then)   记录 onboarding_skip 事件，skip_type = "all"
并且 (And)    不再记录后续步骤的 step 事件
```

### 场景 4: 记录五问完成
```
假设 (Given)  用户完成了五问的最后一步（Q5）
当   (When)   后端 finishOnboarding 执行成功
那么 (Then)   记录 onboarding_complete 事件
并且 (And)    payload 包含实际完成的步数和跳过的步骤列表
```

### 场景 5: 查询留存统计
```
假设 (Given)  管理后台请求留存分析
当   (When)   调用 GET /api/v1/analytics/onboarding-retention
那么 (Then)   返回以下维度的统计数据：
             - 五问完成率（完成/跳过/中途放弃的比例）
             - 每一步的流失率（Step N → Step N+1 的转化率）
             - 按注册后天数分组的 app_open 次数（D1/D3/D7/D14/D30）
             - 按五问完成状态分组对比（completed vs skipped vs abandoned）
```

### 场景 6: 无 user_id 的匿名用户
```
假设 (Given)  用户未登录（仅有 device_id，无 user_id）
当   (When)   app 启动
那么 (Then)   不记录 app_open 事件（事件表要求 user_id NOT NULL）
并且 (And)    用户登录后，从登录时刻开始记录
```

### 场景 7: 异常处理 — 网络失败
```
假设 (Given)  用户触发了 app_open 事件
当   (When)   网络不可用，事件上报失败
那么 (Then)   前端缓存事件到本地队列
并且 (And)    下次网络恢复时批量上报（最多缓存 50 条）
并且 (And)    缓存事件保留原始 created_at 时间戳
```

## 接口约定

### 事件上报

```typescript
// POST /api/v1/events/track
interface TrackEventInput {
  event: 'app_open' | 'onboarding_step' | 'onboarding_skip' | 'onboarding_complete';
  payload?: Record<string, unknown>;
  occurred_at?: string; // ISO 8601，离线缓存事件用，默认 now()
}

interface TrackEventOutput {
  ok: boolean;
}
```

### 留存分析查询

```typescript
// GET /api/v1/analytics/onboarding-retention?days=30
interface RetentionAnalyticsOutput {
  // 五问漏斗
  funnel: {
    total_users: number;
    step_counts: Record<number, number>;  // { 1: 200, 2: 180, 3: 160, 4: 140, 5: 120 }
    completed: number;
    skipped_all: number;
    abandoned: number;  // 开始但未完成也未跳过
  };

  // 留存对比
  retention: {
    completed: { d1: number; d3: number; d7: number; d14: number; d30: number };
    skipped:   { d1: number; d3: number; d7: number; d14: number; d30: number };
    abandoned: { d1: number; d3: number; d7: number; d14: number; d30: number };
  };

  // 人均打开次数（注册后 N 天内）
  avg_opens: {
    completed: { d7: number; d30: number };
    skipped:   { d7: number; d30: number };
    abandoned: { d7: number; d30: number };
  };
}
```

## 前端埋点位置

| 文件 | 触发点 | 事件 |
|------|--------|------|
| `app/layout.tsx` 或顶层 Provider | app 启动 / visibilitychange | `app_open` |
| `features/cognitive/components/onboarding-seed.tsx` handleSubmit | 每步提交成功 | `onboarding_step` |
| `features/cognitive/components/onboarding-seed.tsx` handleSkip | 单步跳过 | `onboarding_skip` (single) |
| `features/cognitive/components/onboarding-seed.tsx` onSkip | 全局跳过 | `onboarding_skip` (all) |
| `gateway/src/handlers/onboarding.ts` finishOnboarding | 五问完成 | `onboarding_complete` |

## 边界条件

- [ ] 同一用户多设备打开：按 user_id 聚合，不重复计数同一分钟内的事件
- [ ] 五问中途关闭 app 再打开：step 事件幂等（同一 user_id + step 不重复插入）
- [ ] 离线缓存队列满（50 条）时丢弃最旧的事件
- [ ] 用户删除账号后：事件数据随 user cascade 删除
- [ ] app_open 节流：前端维护 lastOpenTime，5 分钟内不重复上报

## 依赖

- `app_user` 表（user_id 外键）
- `device` 表（device_id 外键，可选）
- 前端离线缓存机制（Capacitor Preferences 或 localStorage）

## 实现优先级

1. **P0**: `app_event` 表 + `app_open` 埋点 + `onboarding_step/skip/complete` 埋点
2. **P1**: 留存分析查询接口
3. **P2**: 离线缓存 + 批量上报
4. **P2**: 管理后台可视化（可后续单独 spec）

## 备注

- 事件表设计为通用埋点表，后续可扩展更多事件类型（如 `record_created`、`chat_opened`）
- 留存分析的 D1/D3/D7 指标定义：注册后第 N 天有至少 1 次 app_open 的用户占比
- 当前 session manager 是内存级的，不适合做持久化统计，所以新建独立的事件表
