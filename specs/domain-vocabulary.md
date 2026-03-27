# 领域词库 — 冷启动领域选择 + 语音修正 RAG

> 状态：🟡 待开发 | 优先级：Phase 7.3 | 预计：4-5 天
> 依赖：cold-start-onboarding（5 问流程），voice-action（语音指令）

## 概述

用户在不同行业（供应链、金融、医疗、IT 等）有大量专业术语。当前语音识别（ASR）对专业词汇的准确率较低，例如「铝价」可能被识别为「旅价」，「OKR」被识别为「欧开瑞」。

**核心改变：**
- 冷启动新增领域选择步骤（Q2 之后，作为 Q2.5）
- 每个领域预置一套专业词汇表
- 用户日常录音中新出现的专业词也自动收录
- ASR 转写后，用领域词库做后处理修正（RAG 式纠错）

**修正流程：**
```
用户语音 → ASR 转写（原始文本）
  → 领域词库 RAG 匹配（embedding 或编辑距离）
  → 修正候选词替换
  → 最终文本进入 Process
```

## 场景

### 场景 1: 冷启动 — 领域选择
```
假设 (Given)  用户在冷启动 Q2（"你现在主要在做什么"）回答后
当   (When)   系统分析 Q2 回答
那么 (Then)   展示领域选择页面：
  「路路想更了解你的工作，选一下你的领域吧（可多选）：」

  预设领域卡片（2 列网格，每个卡片：图标 + 领域名 + 示例术语）：
  🏭 制造/供应链    「BOM · 良品率 · 模具」
  💰 金融/投资      「对冲 · 估值 · 标的」
  💻 互联网/IT      「OKR · 灰度 · 微服务」
  🏥 医疗/生物      「靶点 · 临床 · IND」
  📐 设计/创意      「字距 · 渲染 · 色域」
  📚 教育/学术      「SCI · peer review · 课题」
  🏗️ 建筑/工程      「容积率 · 预算清单 · BIM」
  🛒 电商/零售      「SKU · 客单价 · 复购率」
  ➕ 自定义         → 输入领域名，AI 生成初始词库

并且 (And)    可选择 1-3 个领域
并且 (And)    选择后存入 UserProfile.domains（JSONB 数组）
并且 (And)    加载对应预设词库到 domain_vocabulary 表

当   (When)   用户点击「跳过」
那么 (Then)   不加载预设词库，后续通过用户录音自动积累
```

### 场景 2: 预设词库结构
```
假设 (Given)  用户选择了「制造/供应链」领域
当   (When)   词库加载
那么 (Then)   导入预设词汇表到 domain_vocabulary 表：
  每条记录：
    - term: 正确写法（如「铝价」）
    - aliases: 常见误识别（如 ["旅价", "律价", "吕价"]）
    - domain: 领域标识（如 "manufacturing"）
    - embedding: 词向量（pgvector，用于语义匹配）
    - frequency: 使用频率（初始 0，用户提及后递增）
    - source: 'preset' | 'user' | 'auto'
并且 (And)    每个领域预设 100-300 个核心术语
```

### 场景 3: ASR 转写后自动修正
```
假设 (Given)  用户录音，ASR 转写出「今天旅价又涨了百分之五」
并且 (And)    用户领域词库中有 term="铝价", aliases=["旅价"]
当   (When)   转写文本进入后处理
那么 (Then)   修正管线执行：
  1. 分词，提取每个可能是术语的片段
  2. 对每个片段查询 domain_vocabulary：
     a. 精确匹配 aliases 数组（ILIKE）
     b. 编辑距离 ≤ 2 的候选
     c. embedding 相似度 > 0.85 的候选
  3. 置信度 > 0.9：自动替换
  4. 置信度 0.7-0.9：标记待确认（用户可在日记卡片中看到高亮）
  5. 置信度 < 0.7：不修正
并且 (And)    修正后文本：「今天铝价又涨了百分之五」
并且 (And)    frequency += 1 for「铝价」
```

### 场景 4: 用户确认/拒绝修正
```
假设 (Given)  某词被置信度 0.7-0.9 自动修正
当   (When)   用户查看日记卡片
那么 (Then)   被修正的词显示淡色下划线（deer 色虚线）
并且 (And)    点击可看到原始识别文本 + [恢复原文][确认修正]
当   (When)   用户点击 [确认修正]
那么 (Then)   该 alias 的匹配权重提升
当   (When)   用户点击 [恢复原文]
那么 (Then)   该修正回滚，该 alias 的权重降低
```

### 场景 5: 自动收录新术语
```
假设 (Given)  用户多次提到某个词（如「OKR」），但词库中没有
当   (When)   该词在近 7 天内出现 ≥ 3 次
并且 (And)    不是常见词（不在通用词库中）
那么 (Then)   自动添加到 domain_vocabulary：
  term="OKR", source='auto', frequency=3
并且 (And)    AI 生成可能的误识别别名（如 ["欧开瑞", "OK啊"]）
并且 (And)    晚间回顾中提示：「路路新学了几个词：OKR、Sprint，对吗？」
```

### 场景 6: 手动管理词库
```
假设 (Given)  用户进入设置 → 「我的词库」
当   (When)   词库页面显示
那么 (Then)   按领域分组展示：
  🏭 制造/供应链 (156 词)
    铝价 · BOM · 良品率 · 注塑 · ...
  💻 自动收录 (12 词)
    OKR · Sprint · 灰度发布 · ...
并且 (And)    可搜索、删除、添加新词
并且 (And)    可添加新的 alias（误识别形式）
当   (When)   用户手动添加词汇
那么 (Then)   source='user'，AI 自动生成可能的误识别别名
```

### 场景 7: 自定义领域
```
假设 (Given)  冷启动时用户选择「自定义」
当   (When)   输入领域名（如「量化交易」）
那么 (Then)   AI 根据领域名生成初始词库（50-100 词）：
  如：alpha · 夏普比率 · 最大回撤 · 因子暴露 · tick数据 · ...
并且 (And)    展示给用户确认/删减
并且 (And)    确认后导入 domain_vocabulary
```

## 接口约定

### 数据库

```sql
-- 领域词库表
CREATE TABLE domain_vocabulary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES device(id),
  term TEXT NOT NULL,              -- 正确写法
  aliases TEXT[] DEFAULT '{}',     -- 常见误识别
  domain TEXT NOT NULL,            -- 领域标识
  embedding vector(1536),          -- 词向量
  frequency INT DEFAULT 0,         -- 使用频率
  source TEXT DEFAULT 'preset',    -- preset/user/auto
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_vocab_device_domain ON domain_vocabulary(device_id, domain);
CREATE INDEX idx_vocab_aliases ON domain_vocabulary USING GIN(aliases);

-- UserProfile 新增字段
ALTER TABLE user_profile ADD COLUMN domains JSONB DEFAULT '[]';
```

### API

```
GET /api/v1/vocabulary
  → 返回用户词库列表（按领域分组）

POST /api/v1/vocabulary
  → 手动添加词汇 { term, domain, aliases? }

DELETE /api/v1/vocabulary/:id
  → 删除词汇

POST /api/v1/vocabulary/import-domain
  → 导入预设领域词库 { domain: "manufacturing" }

POST /api/v1/vocabulary/correct
  → ASR 后处理修正 { text } → { corrected_text, corrections: [{original, corrected, confidence}] }
```

## 涉及文件

| 文件 | 改动类型 |
|------|---------|
| `features/cognitive/components/onboarding-seed.tsx` | 修改：Q2 之后插入领域选择页 |
| 新建 `gateway/src/cognitive/vocabulary.ts` | 领域词库修正引擎 |
| 新建 `gateway/src/db/repositories/vocabulary.ts` | 词库 CRUD |
| 新建 `gateway/src/routes/vocabulary.ts` | REST API |
| 新建 `gateway/data/vocabulary/` | 预设领域词库 JSON 文件 |
| `gateway/src/handlers/process.ts` | 修改：ASR 后处理环节接入词库修正 |
| 新建 `supabase/migrations/029_domain_vocabulary.sql` | 数据库迁移 |
| 新建 `features/settings/components/vocabulary-page.tsx` | 词库管理 UI |

## AI 调用

- 自定义领域初始词库生成：1 次/领域
- 误识别别名生成：1 次/新词（batch）
- 自动收录判断：复用 daily-loop，无额外 AI 调用

## 边界条件

- [ ] 多领域重叠：同一术语属于多个领域，取最高 frequency 的
- [ ] 修正冲突：一个片段匹配多个候选，取置信度最高的
- [ ] 性能：修正管线需在 200ms 内完成（索引 + 缓存热词 top-100）
- [ ] 隐私：词库按 device_id 隔离，不跨用户
- [ ] 中英混合：如「BOM表」「OKR复盘」，需支持中英混合术语
- [ ] 方言发音差异：同一术语不同地区发音可能产生不同误识别

## 验收标准

选择领域后，语音中的专业术语识别准确率显著提升。用户能在设置中管理词库。
