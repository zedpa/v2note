---
status: superseded
superseded_by: "auth.md"
id: "device-id-deprecation"
domain: device
risk: medium
created: 2026-04-17
updated: 2026-04-17
---

# device_id 身份职责下线

> 状态：✅ 已完成 | 优先级：P1（数据隔离安全）
> 关联：`specs/sidebar-my-world.md`（已暴露的 upsert 冲突）

## 背景

系统从"游客模式（device_id 即用户）"演进到"强制登录制（JWT + user_id）"，但大量代码和数据库约束仍把 device_id 当用户身份使用，导致：

1. **UNIQUE(device_id)** 约束 → 同设备多用户数据互踩
2. **userId ?? deviceId** 回退 → 写入时身份混淆
3. **device_id 当 user_id 传参** → Strike 归属错误

### 当前状态

| 表 | device_id 约束 | user_id 约束 | 问题 |
|----|---------------|-------------|------|
| user_profile | NOT NULL UNIQUE | 可选 | 同设备第二个用户写入冲突 |
| notebook | NOT NULL, UNIQUE(device_id, name) | 可选 | 同设备同名笔记本覆盖 |
| soul | UNIQUE(device_id) | 可选（有 partial unique index） | 两种 upsert 路径不一致 |
| skill_config | FK, UNIQUE(device_id, skill_name) | 可选 | 同设备配置互踩 |
| daily_briefing | UNIQUE(device_id, date, type) | 条件唯一索引（038 加的） | 已修过，尚可 |
| ai_diary | NOT NULL, UNIQUE(device_id, notebook, date) | 可选 | 同设备同日志覆盖 |

### device_id 保留的合理职责

device_id 不应废弃字段本身，而是**停止作为用户身份使用**。保留用途：

- WebSocket 连接追踪（哪台设备在线）
- ASR 音频流绑定（一个设备同时只有一路音频）
- 多设备同步标记（哪条记录来自哪台设备）
- 推送通知目标设备

## 改动原则

1. **所有写入操作必须以 user_id 为主键**，device_id 仅作为附加元数据
2. **UNIQUE 约束从 device_id 迁移到 user_id 维度**
3. **移除所有 `userId ?? deviceId` 的写入回退**（查询日志除外）
4. **device_id 列保留但改为可选**（允许 NULL）

## 场景

### 场景 1：数据库约束迁移

```
假设 (Given)  当前表有 UNIQUE(device_id) 或 UNIQUE(device_id, ...) 约束
当   (When)   执行迁移 044_identity_cleanup.sql
那么 (Then)   以下约束变更生效：

  user_profile:
    - DROP CONSTRAINT user_profile_device_id_key（去掉 UNIQUE(device_id)）
    - ALTER device_id DROP NOT NULL
    - ADD UNIQUE(user_id) WHERE user_id IS NOT NULL

  notebook:
    - DROP CONSTRAINT notebook_device_id_name_key
    - ALTER device_id DROP NOT NULL
    - ADD UNIQUE(user_id, name) WHERE user_id IS NOT NULL
    - 保留 UNIQUE(device_id, name) WHERE user_id IS NULL（兼容历史数据）

  soul:
    - DROP CONSTRAINT soul_device_id_key（去掉 UNIQUE(device_id)）
    - ALTER device_id DROP NOT NULL
    - 已有 partial unique index on user_id（014_auth 加的），保留

  skill_config:
    - DROP CONSTRAINT skill_config_device_id_skill_name_key
    - ALTER device_id DROP NOT NULL
    - ADD UNIQUE(user_id, skill_name) WHERE user_id IS NOT NULL

  ai_diary:
    - DROP CONSTRAINT ai_diary_device_id_notebook_entry_date_key
    - ALTER device_id DROP NOT NULL
    - ADD UNIQUE(user_id, notebook, entry_date) WHERE user_id IS NOT NULL

并且 (And)  回填：对所有 user_id IS NULL 的行，
            通过 device.user_id 补充 user_id
```

### 场景 2：user-profile 仓库修复

```
假设 (Given)  用户已登录（有 user_id）
当   (When)   调用 upsertOnboardingField / upsert / upsertByUser
那么 (Then)   优先按 user_id 查找已有行
并且 (And)    找到 → UPDATE
并且 (And)    未找到 → INSERT，ON CONFLICT (user_id) DO UPDATE
并且 (And)    device_id 作为可选元数据写入，不参与冲突解决

当   (When)   findByDevice 被调用
那么 (Then)   仅用于兼容旧代码，新代码统一用 findByUser
```

### 场景 3：notebook 仓库修复

```
假设 (Given)  已登录用户创建/查找笔记本
当   (When)   调用 findOrCreateByUser(userId, deviceId, name)
那么 (Then)   ON CONFLICT (user_id, name) WHERE user_id IS NOT NULL
             DO UPDATE SET device_id = $deviceId（更新最后使用设备）
并且 (And)    不再用 ON CONFLICT (device_id, name)

当   (When)   调用 findOrCreate(deviceId, name)（无 userId 的旧接口）
那么 (Then)   标记 @deprecated
并且 (And)    内部尝试通过 device.user_id 反查，有则走 user 路径
```

### 场景 4：soul 仓库修复

```
假设 (Given)  已登录用户更新 soul
当   (When)   调用 soul 的 upsert 系列函数
那么 (Then)   统一走 upsertByUser 路径
并且 (And)    旧的 upsert(deviceId, content) 标记 @deprecated
并且 (And)    ON CONFLICT 使用 user_id partial unique index
```

### 场景 5：skill_config 仓库修复

```
假设 (Given)  已登录用户配置技能
当   (When)   调用 upsert(deviceId, userId, skillName, enabled, config)
那么 (Then)   ON CONFLICT (user_id, skill_name) WHERE user_id IS NOT NULL
并且 (And)    device_id 仅作为元数据记录

当   (When)   userId 为 null（不应发生，但防御性处理）
那么 (Then)   回退到 ON CONFLICT (device_id, skill_name)
并且 (And)    打印 warning 日志
```

### 场景 6：ai_diary 仓库修复

```
假设 (Given)  系统写入 AI 日记
当   (When)   调用 upsert(deviceId, userId, notebook, date, ...)
那么 (Then)   有 userId → ON CONFLICT (user_id, notebook, entry_date)
并且 (And)    无 userId → 回退到 ON CONFLICT (device_id, notebook, entry_date)
```

### 场景 7：topics.ts 身份修复

```
假设 (Given)  用户收获目标时创建 review strike
当   (When)   topics.ts 执行 strikeRepo.create
那么 (Then)   user_id 取自请求的已认证 userId（getUserId(req)）
并且 (And)    不再使用 goal.device_id 作为 user_id
```

### 场景 8：daily-cycle.ts 修复

```
假设 (Given)  daily-cycle 函数接收参数
当   (When)   需要 deviceId
那么 (Then)   不能用 userId 回退（两者语义完全不同）
并且 (And)    deviceId 缺失时跳过该操作或从 device 表查询
```

### 场景 9：auth.ts refresh token 修复

```
假设 (Given)  用户刷新 token
当   (When)   refresh_token 表的 device_id 为 NULL
那么 (Then)   从 device 表查询该用户绑定的设备
并且 (And)    不再用 payload.userId 冒充 deviceId
```

### 场景 10：消除写入路径的 userId ?? deviceId

```
假设 (Given)  代码中存在 `const key = userId ?? deviceId`
当   (When)   该 key 用于写入操作（INSERT/UPDATE/upsert）
那么 (Then)   必须改为严格要求 userId
并且 (And)    userId 缺失时抛错或 return（不回退到 deviceId）

当   (When)   该 key 仅用于日志/队列序列化
那么 (Then)   可保留回退，但 key 前加前缀区分：
             `user:${userId}` 或 `device:${deviceId}`
```

### 场景 11：goals.ts resolveUserId 简化

```
假设 (Given)  目标 API 需要获取用户身份
当   (When)   请求头没有 user_id（JWT 缺失）
那么 (Then)   直接返回 401，不再通过 device 表反查 user_id
并且 (And)    移除 resolveUserId 函数中的 device fallback
```

## 涉及文件

### 数据库迁移（新建）

| 文件 | 改动 |
|------|------|
| `supabase/migrations/044_identity_cleanup.sql` | 约束迁移 + 数据回填 |

### 仓库层（核心修复）

| 文件 | 改动 |
|------|------|
| `gateway/src/db/repositories/user-profile.ts` | ON CONFLICT 改 user_id 维度（已部分修复） |
| `gateway/src/db/repositories/notebook.ts` | ON CONFLICT → (user_id, name) |
| `gateway/src/db/repositories/soul.ts` | 废弃 upsert(deviceId)，统一走 upsertByUser |
| `gateway/src/db/repositories/skill-config.ts` | ON CONFLICT → (user_id, skill_name) |
| `gateway/src/db/repositories/ai-diary.ts` | ON CONFLICT → (user_id, notebook, entry_date) |

### 路由/处理层（身份修复）

| 文件 | 改动 |
|------|------|
| `gateway/src/routes/topics.ts` | line 250: user_id 取自 getUserId(req) |
| `gateway/src/routes/goals.ts` | 移除 resolveUserId 的 device fallback |
| `gateway/src/routes/auth.ts` | line 133: 不用 userId 冒充 deviceId |
| `gateway/src/routes/stats.ts` | userId ?? deviceId → 要求 userId |
| `gateway/src/routes/sync.ts` | 同上 |
| `gateway/src/cognitive/daily-cycle.ts` | line 70: 修正回退方向 |
| `gateway/src/profile/manager.ts` | 队列 key 加前缀 |
| `gateway/src/soul/manager.ts` | 同上 |
| `gateway/src/handlers/daily-loop.ts` | 日志用回退可保留 |

## 边界条件

- [ ] 历史数据中 user_id 为 NULL 的行：迁移时通过 device.user_id 回填
- [ ] 回填后仍有 user_id = NULL（device 未绑用户）：保留，用 device_id 约束兜底
- [ ] 迁移幂等：所有 DROP/ADD 用 IF EXISTS / IF NOT EXISTS
- [ ] 前端仍发送 X-Device-Id header：保留，但后端不再用它做身份判断
- [ ] goalAutoLink / getProjectProgress 中 `userId ?? deviceId` 参数：改为必须 userId
- [ ] daily_briefing 已在 038 中修过 partial unique index：本次不动

## 验收标准

1. 同一设备两个用户登录后，各自 profile / notebook / soul / skill_config 独立
2. 所有 INSERT/UPSERT 语句的 ON CONFLICT 以 user_id 为维度
3. 代码中不再有 device_id 被当作 user_id 传入 strikeRepo.create
4. `grep -r "userId ?? deviceId" gateway/src/` 的结果中，无一处用于 DB 写入
5. 迁移脚本幂等，可重复执行不报错
6. E2E 冷启动测试通过（种子目标 + 侧边栏）
7. 现有用户数据不丢失（回填 + 兼容约束）
