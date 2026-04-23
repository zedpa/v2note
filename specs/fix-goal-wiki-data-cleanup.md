---
id: "fix-goal-wiki-data-cleanup"
title: "Fix: Goal/Wiki Page 数据清洗 — 去重 + 孤儿修复 + 重挂载"
status: completed
backport: cognitive-wiki-core.md
domain: cognitive
risk: medium
dependencies: ["fix-goal-quality.md", "fix-sidebar-wiki-mgmt.md", "fix-domain-deprecation.md"]
created: 2026-04-13
updated: 2026-04-13
---

# Fix: Goal/Wiki Page 数据清洗

## 概述

旧系统在 goal_sync 无去重、无层级挂载、domain 工具并行运行期间积累了大量脏数据，
导致侧边栏杂乱、待办项目页目标重复。虽然 `fix-goal-quality.md` 已修复了增量写入逻辑，
但**存量脏数据**需要一次性迁移清洗。

**问题清单**：
1. **重复目标** — 同语义的 level>=1 todo 存在多个（如"学英语"和"英语学习"）
2. **孤儿 goal todo** — level>=1 的 todo 但 wiki_page_id=NULL（创建时未关联 page）
3. **孤儿 goal page** — page_type='goal' 的 wiki_page 但无对应 todo
4. **空页面** — recordCount=0 且无子页面的 wiki page（分类后记录被移走，壳留着）
5. **goal page 平铺** — 所有 goal page 都是 L3 顶层（旧代码硬编码 level=3, parent_id=NULL），不挂 topic 下
6. **suggested 积压** — status='suggested' 的目标长期未确认，占据侧边栏

## 1. 重复目标合并

### 场景 1.1: 精确文本重复 todo 合并
```
假设 (Given)  同一 user_id 下存在多条 level>=1 的 todo，LOWER(TRIM(text)) 相同
当   (When)   执行迁移脚本
那么 (Then)   按 created_at ASC 保留最早创建的一条（"主记录"）
并且 (And)    其余记录标记 done=true, status='completed'
并且 (And)    如果被合并的 todo 有 wiki_page_id 且主记录没有 → 转移给主记录
并且 (And)    如果被合并的 todo 有子 todo (parent_id) → 重挂到主记录下
并且 (And)    LOG 输出：合并了 N 组共 M 条重复 goal
```

### 场景 1.2: 重复 goal page 合并
```
假设 (Given)  同一 user_id 下存在多条 page_type='goal' 的 wiki_page，LOWER(TRIM(title)) 相同且 status='active'
当   (When)   执行迁移脚本
那么 (Then)   按 created_at ASC 保留最早的一条
并且 (And)    其余 page 的 wiki_page_record 全部 transferAll 到主 page（ON CONFLICT DO NOTHING）
并且 (And)    其余 page 标记 status='merged', merged_into=主page.id
并且 (And)    引用被合并 page 的 todo.wiki_page_id 更新为主 page.id
```

## 2. 孤儿修复

### 场景 2.1: 孤儿 goal todo（有 todo 无 page）→ 关联或创建 page
```
假设 (Given)  存在 level>=1 的 todo，wiki_page_id IS NULL
当   (When)   执行迁移脚本
那么 (Then)   尝试按 LOWER(TRIM(text)) 匹配已有 goal page (page_type='goal', status='active')
并且 (And)    匹配成功 → 设 todo.wiki_page_id = 匹配到的 page.id
并且 (And)    匹配失败 → 创建新 wiki_page (page_type='goal', title=todo.text, level=3)
             并设 todo.wiki_page_id = 新 page.id
```

### 场景 2.2: 孤儿 goal page（有 page 无 todo）→ 降级或归档
```
假设 (Given)  存在 page_type='goal' 的 wiki_page，但不存在 wiki_page_id 指向它的 level>=1 todo
当   (When)   执行迁移脚本
那么 (Then)   检查该 page 的 recordCount（wiki_page_record 关联数）
并且 (And)    recordCount > 0 → 改为 page_type='topic'（有内容，保留为主题页）
并且 (And)    recordCount = 0 → 标记 status='archived'（空壳，直接归档）
```

## 3. 空页面清理

### 场景 3.1: 空壳 topic page 归档
```
假设 (Given)  存在 wiki_page：
              - status='active'
              - page_type='topic'
              - recordCount = 0（无 wiki_page_record 关联）
              - 无子页面（无 parent_id 指向它的 active page）
              - created_at < 7 天前（排除刚创建的）
当   (When)   执行迁移脚本
那么 (Then)   标记 status='archived'
说明 (Note)   保守策略：有子页面或近期创建的不动
```

### 场景 3.2: 跳过有子页面的空 page
```
假设 (Given)  存在 wiki_page，recordCount=0，但有 active 子页面
当   (When)   执行迁移脚本
那么 (Then)   不归档（它是结构性父节点）
```

## 4. Goal page 重挂载到 topic 下

### 场景 4.1: 用 title 语义匹配找最近 topic
```
假设 (Given)  存在 goal page（parent_id=NULL, level=3）
并且 (And)    存在多个 topic page（page_type='topic', status='active'）
当   (When)   执行迁移脚本
那么 (Then)   用 embedding 余弦相似度找最接近的 topic page（阈值 > 0.5）
并且 (And)    匹配成功 → 设 parent_id=topic.id, level=Math.max(1, topic.level-1)
并且 (And)    匹配失败（所有相似度 <= 0.5）→ 保持 L3 顶层不动
说明 (Note)   需要 goal page 和 topic page 都有 embedding
```

### 场景 4.2: 无 embedding 时用 pg_trgm 文本相似度 fallback
```
假设 (Given)  goal page 没有 embedding（大概率：goal_sync 创建的 page 不走 compiler，无 embedding）
当   (When)   执行迁移脚本
那么 (Then)   先统计 embedding 覆盖率：
             SELECT COUNT(*) FILTER (WHERE embedding IS NOT NULL) * 100.0 / COUNT(*) FROM wiki_page WHERE status='active'
并且 (And)    如果覆盖率 < 30% → 全部使用 pg_trgm 的 similarity(goal.title, topic.title) 做文本匹配
并且 (And)    pg_trgm 匹配阈值 > 0.3（三字符组相似度）
并且 (And)    如果数据库未安装 pg_trgm → CREATE EXTENSION IF NOT EXISTS pg_trgm
并且 (And)    embedding 和 pg_trgm 都无法匹配 → 保持 L3 顶层不动
说明 (Note)   不在迁移中调 AI。pg_trgm 对中文短标题效果有限但优于完全不匹配
```

## 5. Suggested 目标清理

### 场景 5.1: 过期 suggested 目标降级
```
假设 (Given)  存在 level>=1 的 todo，status='suggested'，created_at < 14 天前
当   (When)   执行迁移脚本
那么 (Then)   标记 done=true, status='dismissed'
并且 (And)    如果有关联 goal page → page 标记 status='archived'
说明 (Note)   超过 14 天未确认的建议视为过期，使用 'dismissed' 状态（CHECK 约束允许值）
```

## 验收行为（E2E 锚点）

> 数据迁移脚本，无法自动化 E2E。以迁移前后查询对比 + 日志验证为主。

### 行为 1: 迁移前后侧边栏对比
1. 迁移前：记录侧边栏 page 数量、goal page 数量、L3 goal page 数量
2. 执行迁移
3. 迁移后：侧边栏 page 数量减少（空 page 被归档）
4. goal page 不再有重复标题
5. goal page 部分已挂载到 topic 下（不全是 L3）

### 行为 2: 待办项目页不再有重复
1. 打开待办项目页
2. 不出现同名目标卡片

### 行为 3: 迁移幂等
1. 连续执行迁移两次
2. 第二次不产生任何变更

## 边界条件
- [ ] 用户无任何 goal → 迁移跳过该用户
- [ ] 所有 goal 都是唯一的 → 无合并发生
- [ ] goal page 已有 parent_id → 不重复挂载
- [ ] 合并时两个 todo 都有 wiki_page_id → 保留主记录的，被合并的 page 设 merged
- [ ] embedding 为 NULL → 跳过相似度匹配
- [ ] 合并 todo 的子 todo 去重 → 不做去重，允许暂时重复，后续手动清理
- [ ] 幂等保证 → 每个场景的 WHERE 条件排除已处理的行（如 done=false、status='active'）
- [ ] 迁移脚本必须幂等 — 所有操作带 WHERE 条件防止重复执行

## 接口约定

### 迁移脚本类型
Supabase SQL migration（非代码脚本），纯 SQL，幂等，可重复执行。

### 迁移执行顺序
```
Step 1: 重复 goal todo 合并（场景 1.1）
Step 2: 重复 goal page 合并（场景 1.2）
Step 3: 孤儿 goal todo 修复（场景 2.1）
Step 4: 孤儿 goal page 修复（场景 2.2）
Step 5: 空页面清理（场景 3.1）
Step 6: Suggested 过期清理（场景 5.1）
Step 7: Goal page 重挂载（场景 4.1）— 依赖 embedding，放最后
```

## Implementation Phases
- [ ] Phase 1: SQL migration — Step 1-6（纯 SQL，不依赖 embedding）
- [ ] Phase 2: SQL migration — Step 7（embedding 匹配，如果 embedding 列为空则跳过）
- [ ] Phase 3: 验证查询 — 输出迁移前后统计对比

## 回滚策略

迁移前创建快照表记录所有被修改的行：
```sql
CREATE TABLE IF NOT EXISTS _goal_cleanup_snapshot (
  id SERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  row_id UUID NOT NULL,
  column_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  migrated_at TIMESTAMPTZ DEFAULT now()
);
```
每次 UPDATE 前 INSERT 快照。回滚时根据快照表 REVERSE UPDATE。

## 备注
- 所有删除操作均为 soft delete（status='archived' 或 status='merged'）
- 迁移不调用 AI API，纯 SQL 操作
- embedding 匹配使用 pgvector 的 `<=>` 余弦距离运算符
- 建议在低峰期执行，避免锁竞争
- 场景 5.1 中 suggested 过期用 status='completed' + done=true 而非新状态值（避免 CHECK 约束问题）
