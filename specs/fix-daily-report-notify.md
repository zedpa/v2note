---
id: fix-daily-report-notify
title: "Fix: 早报通知未持久化 + 重复发送"
status: completed
domain: report
risk: medium
dependencies: []
created: 2026-04-08
updated: 2026-04-08
---

# Fix: 早报通知未持久化 + 重复发送

## Bug 现象

1. **未持久化**：收到早报推送通知，但进入 app 后简报页空白，需要等待刷新（AI 重新生成）才能看到内容
2. **重复/错时发送**：早上的提醒在中午也发、下午也发

## 根因分析

### 问题 1: 通知推送了但简报内容未预生成

**当前流程**：
```
07:30 handleTimedPush("morning")
  → 发送 WebSocket 通知："新的一天开始了，查看今日简报"
  → 写入 notification 表（仅通知元数据）
  → ✗ 不生成简报内容

用户打开 app
  → 前端调用 /api/v1/daily/briefing
  → 后端检查 daily_briefing 表
  → 无缓存 → 调用 AI 生成（耗时）→ 用户等待
```

**问题**：`handleTimedPush()` (engine.ts:255-272) 只发通知文本，不触发 `generateMorningBriefing()`。简报内容按需生成（懒加载），但用户期望推送时内容已就绪。

### 问题 2: 重复发送

**根因 A：`dailyPushSent` 仅在内存中** (engine.ts:37)

```typescript
private dailyPushSent = new Set<string>(); // ← 内存，重启即丢
```

- Gateway 重启 → Set 清空 → fallback 模式重新检查 → 重复推送
- 多进程模式 → 每个 worker 独立 Set → 同一通知发多次

**根因 B：BullMQ ↔ fallback 切换无协调**

BullMQ cron 在 07:30 触发了晨报推送。随后 Redis 连接断开，降级到 fallback。fallback 的 `checkDevice()` 在 `hour >= 7 && hour < 9` 窗口内再次检查，此时 `dailyPushSent` 是空的（Set 属于当前进程，BullMQ worker 可能是另一进程），导致重复发送。

**根因 C：fallback 时间窗口过宽**

- 晨报：`hour >= 7 && hour < 9`（2 小时窗口）
- 转达：`hour >= 14 && hour < 17`（3 小时窗口！）
- 晚报：`hour >= 20 && hour < 22`（2 小时窗口）

每 30 分钟 `checkAll()` 一次，如果 Set 被清空，窗口内每次检查都会重复发送。

## 1. 推送时预生成简报内容

### 场景 1.1: 晨报推送同时生成内容
```
假设 (Given)  到达晨报推送时间（07:30）
当   (When)   handleTimedPush 触发晨报推送
那么 (Then)   先调用 generateMorningBriefing() 生成并缓存到 daily_briefing 表
并且 (And)    生成成功后再发送通知
并且 (And)    用户打开 app 时直接加载缓存，无需等待
```

### 场景 1.2: 生成失败时仍发通知
```
假设 (Given)  晨报推送时 AI 生成失败（超时/错误）
当   (When)   生成异常被捕获
那么 (Then)   仍发送通知（降级为按需生成）
并且 (And)    记录错误日志
```

### 场景 1.3: 晚报同理
```
假设 (Given)  到达晚报推送时间（20:00）
当   (When)   handleTimedPush 触发晚报推送
那么 (Then)   先调用 generateEveningSummary() 生成并缓存
并且 (And)    再发送通知
```

## 2. 通知去重持久化

### 场景 2.1: 使用数据库去重替代内存 Set
```
假设 (Given)  需要发送定时通知（晨报/转达/晚报）
当   (When)   检查是否已发送
那么 (Then)   查询 notification 表：同一 user_id + type + 当天日期是否已有记录
并且 (And)    已有则跳过，不重复发送
并且 (And)    不依赖内存中的 dailyPushSent Set
```

### 场景 2.2: 多进程安全
```
假设 (Given)  gateway 运行在多 worker 模式
当   (When)   两个 worker 同时检测到需要发送晨报
那么 (Then)   只有一个 worker 成功写入 notification 表（利用 UNIQUE 约束）
并且 (And)    另一个 worker 检测到已存在，跳过发送
```

### 场景 2.3: 重启后不重复
```
假设 (Given)  gateway 在 08:00 重启
当   (When)   重启后 fallback 模式检查晨报（仍在 7-9 窗口内）
那么 (Then)   查询 notification 表发现今天已发过 morning_briefing
并且 (And)    跳过发送
```

## 3. BullMQ ↔ fallback 协调

### 场景 3.1: 降级时不重复
```
假设 (Given)  BullMQ 已在 07:30 成功发送晨报通知
当   (When)   Redis 连接断开，降级到 fallback 模式
那么 (Then)   fallback 的 checkDevice 查询 notification 表
并且 (And)    发现今天已有 morning_briefing 记录，跳过
```

## 验收行为（E2E 锚点）

### 行为 1: 收到通知后立即可看简报
1. 用户收到晨报推送通知
2. 用户点击通知或打开 app
3. 简报页**立即**显示内容（不出现加载等待）

### 行为 2: 一天只收一次晨报
1. 用户在 07:30 收到晨报通知
2. 无论 gateway 是否重启、Redis 是否断连
3. 用户在同一天内不再收到第二次晨报通知

### 行为 3: 晚报同理
1. 用户在 20:00 收到晚报通知
2. 内容已预生成
3. 同一天不重复发送

## 边界条件
- [ ] AI 生成超时（>30s）→ 降级：发通知但内容按需生成
- [ ] 用户在推送前已手动打开简报 → 内容已缓存，推送不触发重复生成
- [ ] 跨午夜：23:50 的推送记录不影响第二天的推送
- [ ] 用户多设备：同一用户的多个设备各收一次通知
- [ ] notification 表的 UNIQUE 约束需要确认是否支持 (user_id, type, date) 去重

## 修复方案

### 改动 1: `engine.ts` handleTimedPush — 推送前预生成
```typescript
case "morning": {
  // 先生成简报内容（缓存到 daily_briefing 表）
  try {
    await generateMorningBriefing(device.deviceId, device.userId);
  } catch (e) {
    console.warn(`[proactive] Briefing pre-generate failed: ${e.message}`);
  }
  // 再发通知
  this.sendMessage(device, { ... });
  this.persistNotification(device, ...);
  break;
}
```

### 改动 2: 去重逻辑迁移到数据库查询
- 在发送前查询 `notification` 表：
  ```sql
  SELECT 1 FROM notification
  WHERE (user_id = $1 OR device_id = $2)
    AND type = $3
    AND created_at::date = CURRENT_DATE
  LIMIT 1
  ```
- 已有记录 → 跳过发送
- `dailyPushSent` Set 降级为性能优化缓存（减少 DB 查询），不再作为唯一防线

### 改动 3: notification 表添加去重索引
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_dedup
  ON notification (COALESCE(user_id, device_id), type, (created_at::date));
```
- 利用 UNIQUE 约束保证多进程安全
- INSERT 改为 `INSERT ... ON CONFLICT DO NOTHING`

### 改动 4: fallback checkDevice 收窄窗口 + 查 DB
- 晨报窗口：`hour >= 7 && hour < 8`（缩小到 1 小时）
- 转达窗口：`hour >= 14 && hour < 15`
- 晚报窗口：`hour >= 20 && hour < 21`
- 每次检查前先查 notification 表去重

## 依赖
- gateway/src/proactive/engine.ts
- gateway/src/handlers/daily-loop.ts（generateMorningBriefing）
- gateway/src/db/repositories/notification.ts
- supabase/migrations/（新增去重索引）

## Implementation Phases
- [ ] Phase 1: handleTimedPush 推送前调用 generateMorningBriefing/EveningSummary
- [ ] Phase 2: 去重逻辑从内存 Set → DB 查询 + UNIQUE 约束
- [ ] Phase 3: notification 表添加去重索引 + migration
- [ ] Phase 4: fallback 收窄时间窗口
- [ ] Phase 5: 单元测试

## 备注
- 预生成简报会增加 07:30 时的服务器负载（AI 调用），但用户体验显著提升
- 如果用户量大，可考虑错峰生成（07:00-07:30 分批）
- `dailyPushSent` Set 保留作为内存缓存加速，但不再是去重的唯一依据
