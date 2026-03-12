# gene_memory_architecture — 记忆架构三层分离

## 概述

将原来 soul 表承载的"AI人格"和"用户信息"两个职责拆分为三个独立层：

| 层 | 存储 | 职责 | 更新频率 |
|----|------|------|----------|
| Soul | `soul` 表 | AI 人格设定（语气、风格、禁忌、交互偏好） | 低频，用户主动设定 |
| UserProfile | `user_profile` 表 | 用户事实信息（职业、习惯、日程、偏好） | 每次对话后 AI 自动提取 |
| Memory | `memory` 表 | 长期记忆（事件、决策、观察、目标） | 高频，interaction-driven |

## 数据库

```sql
-- migration 012
CREATE TABLE user_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL REFERENCES device(id) ON DELETE CASCADE UNIQUE,
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

## 文件结构

| 文件 | 职责 |
|------|------|
| `gateway/src/db/repositories/user-profile.ts` | CRUD: findByDevice(), upsert() |
| `gateway/src/profile/manager.ts` | loadProfile() + updateProfile()（AI 提取用户事实） |
| `gateway/src/routes/profile.ts` | GET/PATCH /api/v1/profile |
| `gateway/src/soul/manager.ts` | updateSoul() 限定为仅 AI 人格相关 |

## Soul 限定规则

updateSoul 的 AI 提示词明确排除用户个人信息：
- **写入 soul**：用户对 AI 的期望、行为偏好、语气风格、禁忌话题、交互模式
- **排除（→ user_profile）**：职业、日程、个人习惯、家庭情况、健康状态

## 上下文集成

- `context/loader.ts` 并行加载 `loadProfileSafe(deviceId)`
- `prompt-builder.ts` warm 层新增 `## 用户画像` section（与 `## AI灵魂` 分开）
- process/chat handler 结束时并行调用 `updateProfile()` + `updateSoul()`

## 测试

- `gateway/src/db/repositories/user-profile.test.ts` — findByDevice, upsert
- `gateway/src/profile/manager.test.ts` — loadProfile, updateProfile (AI prompt 验证)
- `gateway/src/context/loader.test.ts` — userProfile 加载+失败优雅降级
