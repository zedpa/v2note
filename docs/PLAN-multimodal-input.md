# v2note 多模态输入方案 v2

> 核心原则：一切混沌都能丢进来。极致零摩擦。
> 所有输入最终汇入：`POST /api/v1/ingest` → Digest → Strike。

---

## 架构决策

### Process 精简

Process 只保留**录音转文本优化**（ASR 后的填充词去除、错别字修正、句式保留）。

以下功能从 Process 移除，统一到 Digest：
- 意图分类（task/wish/goal/complaint/reflection）
- 转达检测
- 标签匹配
- JSON 结构化提取
- Todo 创建
- Memory 更新
- Soul/Profile 更新

Process 变成一个纯粹的**文本清洗层**，输出干净的转写文本，然后交给 Digest。

```
语音 → ASR → Process（仅文本优化）→ record(status=completed) → Digest
文字/图片/文件/URL → Ingest → record(status=completed) → Digest
```

### 上传默认素材

所有通过附件方式进入的内容（文件、图片、粘贴长文本、链接提取）默认标记为**素材（material）**。

用户可以在日记卡片上**点击素材标签切换为原声（voice）**，一键操作，不弹窗不确认。

```
record.source_type = 'material' | 'voice'

素材标签 UI：
┌────────────────────────┐
│  📎 素材  ←点击切换→  ✏️ 原声  │
└────────────────────────┘
```

切换后该记录获得完整认知权重，参与 Cluster 涌现、目标涌现、每日回顾。

### 移动端输入统一到文本框

不再有独立的 FAB 万能菜单。录音按钮点击后弹出**统一输入框**：

```
┌─────────────────────────────────────┐
│                                     │
│  （文本输入区，支持多行）              │
│  开始记录...                         │
│                                     │
├─────────────────────────────────────┤
│  📎  │  输入框...            │  🎙  │
└─────────────────────────────────────┘
```

- **📎 附件按钮**（左侧）：点击弹出选择器
  - 📷 拍照
  - 🖼 从相册选择
  - 📄 选择文件
  - 选择后文件/图片出现在输入区上方作为附件预览
- **🎙 语音按钮**（右侧）：按住录音，松开转写，文字插入输入区
- **粘贴链接**：输入框检测到 URL 自动识别
  - 显示链接预览卡片（标题 + 摘要 + 缩略图）
  - 后台 fetch + readability 提取
- **发送**：输入框右侧 ⏎ 按钮或键盘回车
  - 纯文本 → type='text'
  - 有附件 → type='image'/'file'，附件上传 + 文本作为备注
  - 有链接 → type='url'，链接提取 + 文本作为备注

---

## 统一 Ingest API

```
POST /api/v1/ingest
Content-Type: multipart/form-data

参数：
  type: 'text' | 'image' | 'file' | 'url' | 'audio'
  content?: string          // 文本内容或 URL
  file?: File               // 图片/文件
  source_type: 'voice' | 'material'   // 默认 material
  metadata?: {
    source: string          // 'app' | 'pc' | 'cli' | 'mcp' | 'api'
    tags?: string[]         // 用户手动标签
    linked_topic?: string   // 用户通过 @ 链接的主题 ID
  }

响应：
  { recordId: string, status: 'processing' }
```

### Ingest 内部流程

```
POST /ingest
  │
  ├─ type=text
  │   → 创建 record(source_type) + transcript
  │   → 触发 Digest
  │
  ├─ type=image
  │   → 上传 OSS
  │   → Vision LLM 描述图片内容
  │   → 创建 record(source_type='material') + transcript(=描述文本)
  │   → 触发 Digest
  │
  ├─ type=file
  │   → 上传 OSS
  │   → 按格式解析：PDF(pdf-parse) / Word(mammoth) / Excel(xlsx) / 纯文本
  │   → 创建 record(source_type='material') + transcript(=提取文本)
  │   → 触发 Digest
  │
  ├─ type=url
  │   → fetch URL
  │   → readability 提取正文 + 标题
  │   → 创建 record(source_type='material') + transcript(=正文) + summary(=标题)
  │   → 触发 Digest
  │
  └─ type=audio
      → 上传 OSS
      → ASR 转写
      → Process（仅文本优化）
      → 创建 record(source_type='voice') + transcript
      → 触发 Digest
```

### Vision LLM 调用

```typescript
// gateway/src/ai/vision.ts
export async function describeImage(imageUrl: string): Promise<string> {
  // 调用 DashScope qwen-vl-max
  // prompt: "描述这张图片的内容。如果是文字截图，提取所有文字。
  //          如果是白板/笔记，提取要点。如果是照片，描述场景和关键信息。"
  // 返回描述文本
}
```

### URL 提取

```typescript
// gateway/src/ingest/url-extractor.ts
// 使用 @mozilla/readability + jsdom
// 或 node-readability
export async function extractUrl(url: string): Promise<{title: string, content: string, image?: string}>
```

### 文件解析

```typescript
// gateway/src/ingest/file-parser.ts
// PDF: pdf-parse
// Word: mammoth
// Excel: xlsx → 转为文本表格
// 纯文本: 直接读
export async function parseFile(filePath: string, mimeType: string): Promise<string>
```

---

## 前端改动

### PC 端 (app/write/page.tsx)

已有粘贴/拖放 placeholder，需要接上真实 API：
- 粘贴图片 → FormData 上传 + POST /ingest type=image
- 粘贴 URL → POST /ingest type=url → 收到提取结果后显示预览卡片
- 拖放文件 → FormData 上传 + POST /ingest type=file
- 素材标签可切换（点击 📎素材 ↔ ✏️原声）

### 移动端 (app/page.tsx)

改造现有 FAB + TextBottomSheet：
- FAB 点击 → 弹出统一输入框（非全屏，底部 sheet）
- 输入框左侧 📎 → 文件/图片选择器（Capacitor Camera + Filesystem）
- 输入框右侧 🎙 → 录音（复用现有 usePCMRecorder）
- 粘贴链接自动识别 → 显示预览
- 发送 → POST /ingest

### 链接预览组件

```
┌──────────────────────────────────┐
│ 🌐 文章标题                      │
│ example.com                      │
│ 摘要文字的前两行...               │
│ ┌──────┐                        │
│ │ 缩略图 │                        │
│ └──────┘                        │
│                   [导入] [取消]   │
└──────────────────────────────────┘
```

---

## CLI（后续）

```bash
npm install -g v2note-cli

v2 "张总说铝价涨了"              # 文本
v2 --file report.pdf             # 文件
v2 --image whiteboard.jpg        # 图片
v2 --url https://example.com     # URL
echo "notes" | v2                # 管道
```

核心就是包装 `POST /api/v1/ingest`。

## MCP（后续）

在 MCP tools 中添加 `ingest` 工具，参数同 API。

---

## 实施优先级

### Phase 1: Ingest API + Process 精简
- [ ] 创建 POST /api/v1/ingest 端点
- [ ] type=text 处理（创建 record → Digest）
- [ ] Process 精简（移除意图分类等，只保留文本优化）
- [ ] record 表添加 source_type 字段（如果还没有）
- [ ] Digest 触发逻辑统一（不再从 Process 尾部触发，改从 Ingest 触发）

### Phase 2: 图片 + URL
- [ ] Vision LLM 封装（ai/vision.ts）
- [ ] type=image 处理
- [ ] URL 提取（url-extractor.ts）
- [ ] type=url 处理
- [ ] 链接预览组件（PC + 移动端）

### Phase 3: 文件解析
- [ ] 安装 pdf-parse, mammoth, xlsx
- [ ] file-parser.ts
- [ ] type=file 处理

### Phase 4: 移动端输入框改造
- [ ] 统一输入框组件（替代现有 FAB + TextBottomSheet）
- [ ] 📎 附件选择器（Camera + Filesystem plugin）
- [ ] 🎙 语音集成（复用 usePCMRecorder）
- [ ] 链接自动识别 + 预览

### Phase 5: PC 端真实上传
- [ ] 粘贴图片真实上传 + POST /ingest
- [ ] 拖放文件真实上传
- [ ] 粘贴 URL 真实提取 + 预览
- [ ] 素材/原声标签切换 UI

### Phase 6: CLI + MCP
- [ ] v2note-cli npm 包
- [ ] MCP ingest 工具

---

*最后更新：2026-03-22*
*状态：方案确认，待执行 Phase 1*
