---
id: "065"
title: "附件系统：持久化 → UI → 文档 RAG"
status: active
domain: infra
risk: medium
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-04-02
---
# 附件系统：持久化 → UI → 文档 RAG

> 状态：✅ Phase 1 已实现（ingest 存储 file_url/file_name + 前端图片缓存 + 签名URL缓存 + 僵尸清扫）| 🟡 Phase 2 文档分块 RAG 待开发

## 概述
附件上传链路存在断裂：OSS URL 未持久化，前端无附件展示，长文档内容无法被 AI 深度检索。
分三个阶段递进交付，每阶段独立可用。

---

## Phase 1: 附件持久化 + UI 标识（当前执行）

> 目标：让附件"存得住、看得见"

### 现状问题
- `ingest.ts` image 分支：`imageUrl` 只传给 Vision API，未存入 DB
- `ingest.ts` file 分支：`uploadFile()` 返回值直接丢弃
- `record` 表无 `file_url` / `file_name` 字段
- 时间线卡片图标：`duration_seconds > 0` → 麦克风，否则 → 文字图标，无附件图标
- 笔记详情页无附件展示区域

### 场景

#### P1-1: 图片上传 — OSS URL 持久化
```
假设 (Given)  OSS 已配置，用户通过附件栏上传一张图片
当   (When)   后端 ingest 处理 type=image
那么 (Then)   图片上传 OSS，返回的 URL 存入 record.file_url
并且 (And)    record.file_name 存储为 "{deviceId}-{timestamp}.jpg"
并且 (And)    Vision API 提取的文字仍存入 transcript.text（现有逻辑不变）
```

#### P1-2: 文件上传 — OSS URL 持久化
```
假设 (Given)  OSS 已配置，用户通过附件栏上传一个 PDF
当   (When)   后端 ingest 处理 type=file
那么 (Then)   文件上传 OSS，返回的 URL 存入 record.file_url
并且 (And)    record.file_name 存储原始文件名（sanitized）
并且 (And)    文件解析的文本仍存入 transcript.text（现有逻辑不变）
```

#### P1-3: OSS 未配置 — 图片降级
```
假设 (Given)  OSS 未配置
当   (When)   后端 ingest 处理 type=image
那么 (Then)   record.file_url 存储 data:image/jpeg;base64,... 的 data URL
并且 (And)    record.file_name 仍记录文件名
```

#### P1-4: OSS 上传失败 — 降级处理
```
假设 (Given)  OSS 已配置但上传失败
当   (When)   后端 ingest 处理 type=image 或 type=file
那么 (Then)   图片：file_url 降级存储 data URL；文件：file_url 为 NULL
并且 (And)    不影响文本提取和摘要生成流程
```

#### P1-5: 时间线卡片 — 附件图标
```
假设 (Given)  一条 record 存在 file_url（非 null）
当   (When)   时间线渲染该 NoteItem
那么 (Then)   图标区域显示 Paperclip 图标（替代麦克风/文字图标）
并且 (And)    文字显示 file_name 或 "附件"
```

#### P1-6: 时间线卡片 — 语音/文字图标保持不变
```
假设 (Given)  一条 record 的 file_url 为 null
当   (When)   时间线渲染该 NoteItem
那么 (Then)   沿用现有逻辑：duration_seconds > 0 → 麦克风 + 时长，否则 → Paperclip + "文字"
```

#### P1-7: 笔记详情 — 图片内联预览（含本地缓存 & 离线可见）
```
假设 (Given)  一条 record 的 file_url 为图片类型
当   (When)   用户点击进入笔记详情
那么 (Then)   在 Meta 区域下方渲染 <img> 展示图片
并且 (And)    圆角，最大宽度 100%，最大高度 300px，object-fit: cover
并且 (And)    点击图片可在新窗口打开 file_url
并且 (And)    加载失败时显示 fallback 占位 + 文件名
并且 (And)    图片首次加载后写入 IndexedDB `v2note-image-cache`（key=record_id，LRU 100MB）
并且 (And)    再次进入同 record 时优先从本地读取（blob: URL），不再请求 OSS
并且 (And)    navigator.onLine === false 时若本地已缓存，图片仍可见
并且 (And)    签名 URL 变化不触发重新 fetch（effect 仅依赖 recordId，fileUrl 存 ref）
并且 (And)    缓存 miss + fetch 失败时 displaySrc=null，不 fallback 到 OSS URL（防绕过缓存）
并且 (And)    React Strict Mode 双执行 effect 时，模块级 memoryCache 防止重复 fetch
并且 (And)    同一 recordId 并发调用通过 resolveInFlight 去重，只发起一次网络请求
```

##### 补充边界（来自 fix-oss-image-traffic-storm）
- **签名 URL 进程内缓存**：gateway `getSignedUrl()` 对同一 object_path 在 TTL 内返回相同签名 URL，减少签名 API 调用
- **僵尸记录清扫**：status IN ('uploading','processing') 且 updated_at 超 30 分钟的记录，cron 自动标记为 failed（`gateway/src/jobs/sweep-stale-records.ts`）
- **轮询上限**：前端 uploading/processing 状态轮询设 MAX_POLL_ROUNDS（默认 120 轮 = 10 分钟），达到上限后停止轮询并展示提示横幅
- **Page Visibility 感知**：页面从 hidden → visible 时重置轮询计数并立即刷新一次
- **无 uploading 记录时不轮询**：当前数据中无 uploading/processing 状态记录时跳过 setInterval

> 实现锚点（来自 fix-oss-image-traffic-storm 回写）：
> - `shared/lib/image-cache.ts`（IndexedDB 封装，沿用 capture-store/audio-cache/chat-cache 相同模板）
> - `features/notes/hooks/use-cached-image.ts`（data: 短路 / hit blob / online fetch+put / offline null）
> - `features/notes/components/notes-timeline.tsx` + `note-detail.tsx` 双路径同步接入，key 必须是 record_id（不是 file_url / objectPath，避免签名轮换失效）
> - `gateway/src/storage/oss.ts`（签名 URL 进程内缓存）
> - `gateway/src/jobs/sweep-stale-records.ts`（僵尸记录 cron 清扫）
> - `features/notes/hooks/use-notes.ts`（轮询上限 + visibility 感知）

#### P1-7a: 僵尸上传记录自动清退 <!-- ✅ completed (fix-oss-image-traffic-storm) -->
```
假设 (Given)  用户之前有一条上传很久未完成的日记（客户端崩溃或网络中断遗留）
当   (When)   用户打开时间线
那么 (Then)   该条日记在一段时间内被标记为"上传失败"并展示重试入口
并且 (And)    页面不会因这条卡住的日记永远保持在"处理中"的忙碌状态
```

#### P1-7b: 长时间停留不产生持续后台流量 <!-- ✅ completed (fix-oss-image-traffic-storm) -->
```
假设 (Given)  用户打开时间线后长时间未操作
当   (When)   自动刷新累计达到上限
那么 (Then)   前端停止自动刷新，并提示"自动刷新已暂停，下拉可恢复"
并且 (And)    用户下拉刷新或回到页面前台时，自动刷新立即恢复
并且 (And)    页面切到后台 Tab 期间暂停刷新，不产生网络请求
```

#### P1-8: 笔记详情 — 文件附件卡片
```
假设 (Given)  一条 record 的 file_url 为非图片文件
当   (When)   用户点击进入笔记详情
那么 (Then)   在 Meta 区域下方显示附件卡片：FileText 图标 + file_name
并且 (And)    点击可在新窗口打开 file_url
```

#### P1-9: URL 类型 — 不涉及
```
假设 (Given)  用户通过输入框粘贴 URL 导入
当   (When)   后端 ingest 处理 type=url
那么 (Then)   record.file_url 保持 NULL（不变）
```

### 接口约定

#### 数据库迁移
```sql
ALTER TABLE record ADD COLUMN file_url TEXT;
ALTER TABLE record ADD COLUMN file_name TEXT;
```

#### record 类型扩展
```typescript
// gateway/src/db/repositories/record.ts — Record 接口新增
file_url: string | null;
file_name: string | null;
```

#### recordRepo 改动
```typescript
// create() 新增可选参数
create(fields: { ..., file_url?: string; file_name?: string }): Promise<Record>
// updateFields() 新增可选参数
updateFields(id, { ..., file_url?: string; file_name?: string }): Promise<void>
```

#### 前端类型扩展
```typescript
// shared/lib/types.ts — NoteItem 新增
file_url: string | null;
file_name: string | null;
```

#### ingest.ts 改动
```
image 分支:
  recordRepo.create({ ..., file_url: imageUrl, file_name: filename })

file 分支:
  const ossUrl = await uploadFile("files", ossName, fileBuf);
  recordRepo.create({ ..., file_url: ossUrl, file_name: safeFilename })
```

### 涉及文件

| 文件 | 改动 |
|------|------|
| `supabase/migrations/021_attachment_url.sql` | 新增 `file_url`, `file_name` 列 |
| `gateway/src/db/repositories/record.ts` | Record 接口 + create/updateFields 支持新字段 |
| `gateway/src/routes/ingest.ts` | image/file 分支存储 OSS URL |
| `shared/lib/types.ts` | NoteItem 加 `file_url`, `file_name` |
| `features/notes/hooks/use-notes.ts` | 映射新字段 |
| `features/notes/components/notes-timeline.tsx` | 图标逻辑：file_url 存在 → Paperclip |
| `features/notes/components/note-detail.tsx` | 图片预览 + 文件附件卡片 |

### 边界条件
- [ ] 历史 record 无 file_url → 迁移默认 NULL，前端兼容
- [ ] data URL 太大不适合存 DB → OSS 未配置时的降级，加长度上限
- [ ] 图片加载失败 → fallback 占位图 + 文件名
- [ ] file_name 特殊字符 → 已有 sanitize 逻辑

### 图片判断逻辑
`file_url` 以 `data:image` 开头，或以 `.jpg/.jpeg/.png/.gif/.webp` 结尾（不区分大小写）

---

## Phase 2: 文档分块 + RAG 检索（后续）

> 目标：让长文档内容"查得到"——AI 对话中能检索到文件的具体段落

### 现状瓶颈
- `parseFile()` 提取文本上限 10,000 字符，50 页 PDF 大部分丢失
- Strike 粒度是「认知触动」级别，用户问"PDF 里关于 XX 的数据"，Strike 可能没有
- `getEmbedding()` 输入上限 2,000 字符，单条长文本无法有效向量化

### 场景

#### P2-1: 文件上传 — 自动分块 + 向量化
```
假设 (Given)  用户上传一个 PDF 文件
当   (When)   后端 ingest 完成文本提取
那么 (Then)   调用 documentChunker() 将全文分为多个块（500~1000 字/块，100 字重叠）
并且 (And)    每个块写入 document_chunk 表，含 embedding 向量
并且 (And)    transcript.text 仍存储完整提取文本（提高上限至 50K~100K）
并且 (And)    现有 Strike 提取流程不受影响（仍基于 transcript.text 前 10K）
```

#### P2-2: AI 对话 — 文档检索通道
```
假设 (Given)  用户在对话中问"那个 PDF 里关于 XX 说了什么"
当   (When)   hybridRetrieve() 执行检索
那么 (Then)   除现有 5 个检索通道外，新增 document_chunk 语义检索通道
并且 (And)    匹配的 chunk 带 record_id + file_name 元信息注入 AI 上下文
并且 (And)    AI 回复中引用来源："根据《filename.pdf》第 X 段..."
```

#### P2-3: 大文件分块策略
```
假设 (Given)  提取文本超过 1000 字符
当   (When)   documentChunker() 执行分块
那么 (Then)   按段落/换行符优先切分，保持语义完整
并且 (And)    每块 500~1000 字符，相邻块重叠 100 字符
并且 (And)    保留块序号（chunk_index），用于重组上下文
```

#### P2-4: 短文件不分块
```
假设 (Given)  提取文本 <= 1000 字符
当   (When)   documentChunker() 执行
那么 (Then)   作为单块写入 document_chunk
```

### 接口约定

#### 数据库
```sql
CREATE TABLE document_chunk (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID REFERENCES record(id) ON DELETE CASCADE,
  user_id UUID,
  chunk_index INT,
  content TEXT,
  embedding vector(1024),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_chunk_embedding ON document_chunk
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX idx_chunk_record ON document_chunk(record_id);
```

#### 新增模块
```
gateway/src/ingest/document-chunker.ts
  - chunkText(text: string, opts?: { chunkSize?: number; overlap?: number }): string[]
  - writeChunks(recordId: string, userId: string, chunks: string[]): Promise<void>
```

#### 检索扩展
```
gateway/src/cognitive/retrieval.ts
  - 新增第 6 通道：documentChunkChannel()
  - 输入：query embedding
  - 输出：top-K chunk + record 元信息（file_name, chunk_index）
```

### 涉及文件

| 文件 | 改动 |
|------|------|
| `supabase/migrations/0XX_document_chunk.sql` | 新建 document_chunk 表 + 索引 |
| `gateway/src/ingest/document-chunker.ts` | 新增：分块 + 批量写入 |
| `gateway/src/ingest/file-parser.ts` | 提高提取上限至 50K~100K |
| `gateway/src/routes/ingest.ts` | file 分支触发分块流程 |
| `gateway/src/cognitive/retrieval.ts` | 新增 document_chunk 检索通道 |
| `gateway/src/cognitive/embed-writer.ts` | 新增 writeChunkEmbeddings() |

### 技术决策：为什么不用阿里云知识库服务
- 现有基础设施完整：DashScope embedding + pgvector + HNSW + 3 级缓存 + 混合检索
- 自建只需加 chunker + 1 张表 + 1 个检索通道
- 外部服务需维护两套检索链路，prompt 组装复杂，评分/排序不统一
- 自建可控：分块策略、检索权重、material 降权逻辑统一

---

## Phase 3: 检索增强（远期）

> 目标：提升 RAG 质量

### 候选方向（未定优先级）
- **查询改写**：用户模糊提问 → AI 改写为更精确的检索 query
- **Cross-encoder 重排**：初筛后用 cross-encoder 模型精排 top-K
- **多粒度索引**：chunk 级 + 文档摘要级双层检索
- **图片 OCR 分块**：图片内文字也参与 RAG（当前仅 Vision API 单次描述）
- **引用溯源**：AI 回复中标注具体 chunk 来源，支持点击跳转原文

---

## 备注
- Phase 1 和 Phase 2 完全解耦，Phase 1 不依赖分块逻辑
- Phase 2 不改变 Strike 提取链路——Strike 仍基于 transcript.text（前 10K），document_chunk 是独立的检索通道
- material 类 record 在现有检索中已 0.2x 降权（`retrieval.ts:240`），document_chunk 需要独立的权重策略
