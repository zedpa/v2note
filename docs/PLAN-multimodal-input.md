# v2note 多模态输入方案

> 核心原则：一切混沌都能丢进来。极致零摩擦。输入层不是核心，Digest 才是。
> 所有输入最终汇入同一个管道：`POST /api/v1/ingest` → Digest → Strike。

---

## 统一入口：Ingest API

新建一个通用摄入端点，所有输入源都通过它进入系统：

```
POST /api/v1/ingest
Content-Type: multipart/form-data 或 application/json

参数：
  type: 'text' | 'image' | 'file' | 'url' | 'audio'
  content?: string          // text/url 类型的内容
  file?: File               // image/file/audio 类型的文件
  metadata?: {              // 可选的上下文
    source: string          // 来源标识：'camera' | 'share' | 'cli' | 'mcp' | 'email' | 'clip' | 'api'
    title?: string
    tags?: string[]
  }

响应：
  { recordId: string, status: 'processing' }
```

Ingest 内部流程：

```
POST /ingest
  │
  ├─ type=text    → 直接创建 record + transcript → Process → Digest
  ├─ type=image   → 上传 OSS → Vision LLM 描述 → 创建 record → Digest
  ├─ type=file    → 上传 OSS → 按格式解析提取文本 → 创建 record → Digest
  ├─ type=url     → fetch → readability 提取正文 → 创建 record → Digest
  ├─ type=audio   → 上传 OSS → ASR → 走现有 Process 流程
  │
  所有路径最终 → record(status=completed) → Digest → Strike
```

---

## 输入源清单（7 个）

### 1. 📷 图片/截图（Capacitor Camera + Share）

**用户行为**：APP 内拍照 / 从相册选 / 从其他 APP 分享图片到 v2note

**技术方案**：
- 前端：`@capacitor/camera`（已有依赖）调 `Camera.getPhoto()` 或 `Camera.pickImages()`
- 上传到 gateway OSS（复用现有 `storage/oss.ts`）
- Gateway：调 Vision LLM（DashScope qwen-vl-max）描述图片内容
- 描述文本 → 创建 record → Digest

**Vision LLM 调用**：
```typescript
// 复用现有 ai/provider.ts 的模式，新增 vision 方法
const description = await visionDescribe(imageUrl, {
  prompt: '描述这张图片的内容。如果是文字截图，提取所有文字。如果是白板/笔记，提取要点。'
});
```

**Share Target（接收其他 APP 分享）**：
- Android：AndroidManifest.xml 添加 intent-filter 接收 image/*
- iOS：Share Extension
- 需要 Capacitor 插件：`@niclas-nickleby/capacitor-send-intent` 或手写原生代码
- 简化方案：先只做 APP 内拍照/选图，Share Target 后续迭代

### 2. 📄 文件/PDF

**用户行为**：分享 PDF/Word/Excel 到 v2note，或 APP 内上传

**技术方案**：
- 前端：`@capacitor/filesystem` 读文件 + 上传
- Gateway 解析：
  - PDF → `pdf-parse` 库（npm）提取文本
  - Word (.docx) → `mammoth` 库（npm）提取文本
  - Excel → `xlsx` 库（npm）提取为文本表格
  - 纯文本 → 直接用
- 提取文本 → 创建 record → Digest

### 3. 🌐 网页剪藏

**用户行为**：浏览器分享 URL 到 v2note / APP 内粘贴 URL

**技术方案**：
- 前端：检测输入框中的 URL → 显示"导入网页内容？"按钮
- Gateway：`node-readability`（或 `@mozilla/readability` + `jsdom`）提取正文
- 提取的文章正文 → 创建 record(source='clip') → Digest

### 4. 💻 CLI

**用户行为**：终端快捷命令

```bash
# 安装
npm install -g v2note-cli

# 使用
v2 "张总说铝价涨了15%"
v2 --file report.pdf
v2 --image whiteboard.jpg
v2 --url https://example.com/article
echo "meeting notes" | v2
```

**技术方案**：
- 一个极简 npm 包，核心就是 `fetch('POST /api/v1/ingest', ...)`
- 支持 `--gateway` 参数指定服务器地址
- 支持管道输入 `|`
- 认证：API key 或 JWT token（存在 ~/.v2noterc）

### 5. 🔌 MCP（外部 Agent 推送）

**已有基础**：`gateway/src/mcp/server.ts` 已暴露内置工具

**扩展**：在 MCP tools 中添加 `ingest` 工具：

```json
{
  "name": "ingest",
  "description": "将信息录入 v2note 认知系统",
  "parameters": {
    "type": "object",
    "properties": {
      "text": { "type": "string", "description": "要录入的文本" },
      "source": { "type": "string", "description": "来源标识" }
    },
    "required": ["text"]
  }
}
```

这样任何支持 MCP 的 Agent（Claude Desktop、Cursor、OpenClaw 等）都能直接往 v2note 推数据。

### 6. 📮 HTTP POST API（开放接口）

**已在 Ingest API 中覆盖**。第三方集成直接调：

```bash
curl -X POST http://localhost:3001/api/v1/ingest \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"text","content":"供应商A交期又延迟了","metadata":{"source":"zapier"}}'
```

可对接：Zapier、n8n、IFTTT、自定义 webhook。

### 7. 📧 邮件转发（最低优先级）

**用户行为**：转发邮件到专用地址 `inbox@v2note.app`

**技术方案**：
- 需要邮件接收服务（SendGrid Inbound Parse / AWS SES）
- 解析邮件主题+正文 → POST /ingest
- 成本和维护复杂度高，ROI 最低
- **建议 v2 再做**

---

## 实施计划

### Phase A: Ingest API + 文本/URL（自己做，简单）

| 任务 | 复杂度 |
|------|--------|
| POST /api/v1/ingest 端点 | M |
| type=text 处理（创建 record → Digest） | S |
| type=url 处理（fetch → readability → Digest） | M |
| 前端：输入框 URL 检测 + 导入按钮 | S |

### Phase B: 图片（核心，最高 ROI）

| 任务 | 复杂度 |
|------|--------|
| Vision LLM 调用封装（ai/vision.ts） | M |
| type=image 处理（上传 → Vision → Digest） | M |
| 前端：拍照/选图按钮（Camera plugin） | M |
| 图片上传到 OSS | S（复用现有） |

### Phase C: 文件解析

| 任务 | 复杂度 |
|------|--------|
| PDF 解析（pdf-parse） | S |
| Word 解析（mammoth） | S |
| type=file 处理 | S |
| 前端：文件选择器 | S |

### Phase D: CLI + MCP

| 任务 | 复杂度 |
|------|--------|
| CLI npm 包（v2note-cli） | M |
| MCP ingest 工具 | S |

### Phase E: Share Target（原生层）

| 任务 | 复杂度 |
|------|--------|
| Android Share Target intent-filter | L |
| iOS Share Extension | L |

---

## 前端交互设计

### 录音按钮升级为"万能入口"

现有 FAB 只是录音按钮。升级为：

**短按** → 录音（不变）
**长按** → 弹出输入源选择器：

```
┌─────────────────┐
│  🎙 录音         │
│  📷 拍照/相册     │
│  📄 导入文件      │
│  🔗 粘贴链接      │
│  ⌨️ 快速文字      │
└─────────────────┘
```

选择器从 FAB 位置向上弹出，径向菜单风格。选完后进入对应的输入流程，完成后自动消失。

### 粘贴板检测

APP 切换到前台时检测剪贴板：
- 如果有 URL → 轻提示"检测到链接，是否导入？"
- 如果有长文本 → 轻提示"检测到文字，是否记录？"
- 用户点击确认 → 直接 POST /ingest

---

*最后更新：2026-03-21*
*状态：方案确认后执行 Phase A*
