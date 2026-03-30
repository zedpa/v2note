# 领域词库 — DashScope 热词 + 自动收录

> 状态：✅ 完成 | 优先级：Phase 7.3
> 依赖：cold-start-onboarding（5 问流程）
>
> ### 架构决策（2026-03-29 简化）
>
> **删除自建 ASR 后处理纠正引擎**，改用 DashScope VocabularyService 原生热词。
>
> 理由：
> - DashScope `fun-asr-realtime` 原生支持 `vocabulary_id` 参数
> - 热词在识别阶段生效，准确率远高于后处理替换
> - 免费，无额外费用
> - 代码改动极小（Python 脚本加 1 个参数）
>
> 删除项：
> - ~~场景 3: ASR 后处理修正引擎~~ → 由 DashScope 热词替代
> - ~~场景 4: 用户确认/拒绝修正 UI~~ → 热词在识别阶段生效，无"修正"概念
> - ~~`gateway/src/cognitive/vocabulary.ts` 的 alias 匹配逻辑~~ → 不再需要
> - ~~`POST /api/v1/vocabulary/correct` API~~ → 不再需要
>
> 进度：
>   ✅ 场景 1 冷启动领域选择（DomainSelector + onboarding 集成）
>   ✅ 场景 2 预设词库结构（routes/vocabulary.ts）
>   ✅ 场景 5 手动管理词库（vocabulary-page.tsx）
>   ✅ 数据库迁移 031
>   ✅ 场景 3 DashScope 热词同步（vocabulary-sync.ts）
>   ✅ 场景 4 自动收录 + 热词刷新（auto-vocabulary.ts 收录后触发同步）
>   ✅ 场景 6 自定义领域 AI 生成（/generate 路由）

## 概述

用户在不同行业有大量专业术语，ASR 对专业词汇准确率较低。通过 DashScope VocabularyService 的热词能力，在识别阶段直接提升准确率，无需后处理纠正。

**简化后流程：**
```
domain_vocabulary 表（用户词库）
  → 同步到 DashScope VocabularyService（最多 500 词，权重 1-5）
  → 生成 vocabulary_id
  → Python ASR 脚本传入 vocabulary_id
  → 识别阶段即生效，无后处理
```

## 场景

### 场景 1: 冷启动 — 领域选择 ✅
```
假设 (Given)  用户在冷启动 Q2 回答后
当   (When)   系统分析 Q2 回答
那么 (Then)   展示领域选择页面（2 列网格，8 预设 + 自定义）
并且 (And)    选择后存入 UserProfile.domains
并且 (And)    加载对应预设词库到 domain_vocabulary 表
并且 (And)    触发场景 3 同步到 DashScope
```

### 场景 2: 预设词库结构 ✅
```
假设 (Given)  用户选择了某个领域
当   (When)   词库加载
那么 (Then)   导入预设词汇到 domain_vocabulary 表
  每条：term（正确写法）, domain, frequency, source='preset'
并且 (And)    每个领域预设 25-100 个核心术语
```

### 场景 3: DashScope 热词同步 🟡
```
假设 (Given)  domain_vocabulary 表中有词汇
当   (When)   以下事件触发同步：
  a. 冷启动领域选择后
  b. 用户手动添加/删除词汇后
  c. 自动收录新术语后（场景 4）
  d. daily-loop 每日检查
那么 (Then)   从 domain_vocabulary 取 top-500（按 frequency DESC）
并且 (And)    调用 DashScope VocabularyService：
  - 首次：create_vocabulary → 存储 vocabulary_id 到 device 表
  - 后续：update_vocabulary（覆盖式更新）
并且 (And)    词汇权重映射：
  - frequency >= 10 → weight 5
  - frequency >= 5  → weight 4
  - frequency >= 1  → weight 3
  - frequency == 0  → weight 2（预设词）
并且 (And)    vocabulary_id 通过环境变量传递给 Python ASR 脚本

边界条件：
- DashScope 每表最多 500 词，超出时按 frequency 截断
- 同步失败不阻断 ASR（降级为无热词）
- vocabulary_id 缓存在 device 表，避免重复创建
```

### 场景 4: 自动收录 + 热词刷新 🟡
```
假设 (Given)  用户多次提到某个词（如「OKR」），但词库中没有
当   (When)   daily-loop 执行自动收录（auto-vocabulary.ts 已实现）
并且 (And)    该词在近 7 天内出现 ≥ 3 次
那么 (Then)   自动添加到 domain_vocabulary（source='auto'）
并且 (And)    触发场景 3 同步到 DashScope
并且 (And)    晚间回顾中提示：「路路新学了几个词：OKR、Sprint，对吗？」
```

### 场景 5: 手动管理词库 ✅
```
假设 (Given)  用户进入设置 → 「我的词库」
当   (When)   词库页面显示
那么 (Then)   按领域分组展示，可搜索/删除/添加
当   (When)   用户添加或删除词汇
那么 (Then)   触发场景 3 同步到 DashScope
```

### 场景 6: 自定义领域 AI 生成 🟡
```
假设 (Given)  冷启动时用户选择「自定义」
当   (When)   输入领域名（如「量化交易」）
那么 (Then)   AI 根据领域名生成初始词库（50-100 词）
并且 (And)    展示给用户确认/删减
并且 (And)    确认后导入 domain_vocabulary
并且 (And)    触发场景 3 同步到 DashScope
```

## 接口约定

### 数据库（已有）

```sql
-- domain_vocabulary 表（迁移 031 已创建）
-- 新增字段：
ALTER TABLE device ADD COLUMN IF NOT EXISTS asr_vocabulary_id TEXT;
-- 存储 DashScope vocabulary_id，避免重复创建
```

### API（精简）

```
GET  /api/v1/vocabulary           → 用户词库列表（按领域分组）
POST /api/v1/vocabulary           → 手动添加 { term, domain }
DELETE /api/v1/vocabulary/:id     → 删除词汇
POST /api/v1/vocabulary/import-domain → 导入预设领域 { domain }
POST /api/v1/vocabulary/sync      → 手动触发同步到 DashScope（通常自动）
POST /api/v1/vocabulary/generate  → AI 生成自定义领域词库 { domain_name }
```

~~`POST /api/v1/vocabulary/correct`~~ — 已删除

### DashScope VocabularyService 集成

```python
# gateway/scripts/asr_realtime.py 改动（1 行）
recognition = Recognition(
    model=MODEL,
    callback=callback,
    vocabulary_id=os.environ.get('ASR_VOCABULARY_ID'),  # 新增
)
```

```typescript
// gateway/src/cognitive/vocabulary-sync.ts（新建）
// 负责 domain_vocabulary → DashScope VocabularyService 同步
export async function syncVocabularyToDashScope(deviceId: string): Promise<string>
// 返回 vocabulary_id，存入 device.asr_vocabulary_id
```

## 涉及文件

| 文件 | 改动类型 |
|------|---------|
| `gateway/scripts/asr_realtime.py` | 修改：加 `vocabulary_id` 参数 |
| `gateway/scripts/asr_transcribe.py` | 修改：加 `vocabulary_id` 参数 |
| 新建 `gateway/src/cognitive/vocabulary-sync.ts` | DashScope VocabularyService 同步 |
| `gateway/src/cognitive/auto-vocabulary.ts` | 修改：收录后触发同步 |
| `gateway/src/routes/vocabulary.ts` | 修改：增删后触发同步，新增 /sync 和 /generate |
| `gateway/src/cognitive/vocabulary.ts` | 删除 alias 匹配逻辑（或标记废弃） |
| `supabase/migrations/0xx_device_vocabulary_id.sql` | device 表加 asr_vocabulary_id |

## 删除/废弃项

| 原有 | 处置 |
|------|------|
| `vocabulary.ts` 的 `correctText()` 函数 | 废弃，不再在 process 中调用 |
| `POST /api/v1/vocabulary/correct` | 删除 |
| 场景 4（确认/拒绝修正 UI） | 删除，热词无"修正"概念 |
| aliases 字段 | 保留但不再用于后处理，仅作参考 |

## 验收标准

选择领域后，DashScope 热词同步完成，语音中的专业术语识别准确率在 ASR 阶段即显著提升。用户能在设置中管理词库，增删会自动同步到 DashScope。
