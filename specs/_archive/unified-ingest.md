# 统一输入（Unified Ingest API）

> 状态：🟡 待开发

## 概述
所有输入类型（文本、图片、文件、URL、音频）统一汇聚到 `POST /api/v1/ingest`，经过类型识别、内容提取、格式标准化后写入 record 表，再触发后续的 Digest 流程。这是 v2note "输入即神圣" 理念的入口。

## 场景

### 场景 1: 纯文本输入
```
假设 (Given)  用户已登录
当   (When)   发送 POST /api/v1/ingest，body 为 { text: "今天和张总开了个会", source_type: "think" }
那么 (Then)   系统应创建一条 record
并且 (And)    record.content = "今天和张总开了个会"
并且 (And)    record.source_type = "think"
并且 (And)    返回 201 和 record ID
```

### 场景 2: 图片输入 → Vision LLM 描述
```
假设 (Given)  用户已登录
当   (When)   发送 POST /api/v1/ingest，body 包含 image（base64 或文件上传）
那么 (Then)   系统应调用 Vision LLM（Qwen-VL）生成图片描述
并且 (And)    创建 record，content 为 LLM 描述文本
并且 (And)    source_type 默认为 "material"
并且 (And)    保留原始图片引用（attachment）
```

### 场景 3: URL 输入 → Readability 提取
```
假设 (Given)  用户已登录
当   (When)   发送 POST /api/v1/ingest，body 为 { url: "https://example.com/article" }
那么 (Then)   系统应使用 Readability 提取文章正文
并且 (And)    创建 record，content 为提取的正文
并且 (And)    source_type 默认为 "material"
并且 (And)    保留原始 URL 和标题
```

### 场景 4: 文件输入 → 解析提取
```
假设 (Given)  用户已登录
当   (When)   发送 POST /api/v1/ingest，body 包含 PDF 文件
那么 (Then)   系统应使用 pdf-parse 提取文本内容
并且 (And)    创建 record，content 为提取的文本
并且 (And)    source_type 默认为 "material"
```

支持的文件类型：
| 格式 | 解析器 |
|------|--------|
| PDF | pdf-parse |
| Word (.docx) | mammoth |
| Excel (.xlsx) | xlsx |
| TXT/Markdown | 直接读取 |

### 场景 5: source_type 用户可切换
```
假设 (Given)  用户上传了一篇文章，系统默认 source_type = "material"
当   (When)   用户在前端点击切换为 "think"
那么 (Then)   record.source_type 应更新为 "think"
并且 (And)    后续 Digest 按 think 权重处理（不降权）
```

### 场景 6: 长文本粘贴 → 确认提示
```
假设 (Given)  用户在 PC 写作面板
当   (When)   粘贴文本长度 >= 100 字符
那么 (Then)   系统应弹出确认 "是否作为素材导入？"
并且 (And)    用户确认后 source_type = "material"
并且 (And)    用户拒绝则作为 "think" 处理
```

### 场景 7: 无效输入拒绝
```
假设 (Given)  用户已登录
当   (When)   发送 POST /api/v1/ingest，body 为空或不含任何有效内容
那么 (Then)   系统应返回 400
并且 (And)    错误信息包含 "输入内容不能为空"
并且 (And)    不创建任何 record
```

### 场景 8: URL 无法访问
```
假设 (Given)  用户已登录
当   (When)   发送 POST /api/v1/ingest，body 为 { url: "https://not-exist.example.com" }
那么 (Then)   系统应返回 422
并且 (And)    错误信息包含 "无法提取链接内容"
```

### 场景 9: 不支持的文件类型
```
假设 (Given)  用户已登录
当   (When)   上传 .exe 文件
那么 (Then)   系统应返回 415
并且 (And)    错误信息包含 "不支持的文件类型"
```

## 边界条件
- [x] 空输入（场景 7）
- [x] URL 不可达（场景 8）
- [x] 不支持的文件类型（场景 9）
- [ ] 超大文件（>10MB）：应拒绝并提示大小限制
- [ ] Vision LLM 超时：保留图片引用，标记待重试
- [ ] 并发上传：多个文件应独立处理，互不影响
- [ ] 恶意内容：基本安全检查（文件类型白名单）

## 接口约定

输入：
```typescript
// POST /api/v1/ingest
interface IngestRequest {
  text?: string              // 文本内容
  url?: string               // URL
  image?: string | File      // base64 或文件对象
  file?: File                // 上传文件
  source_type?: 'think' | 'material'  // 默认规则见上
  metadata?: {
    title?: string
    tags?: string[]
  }
}
```

输出：
```typescript
interface IngestResponse {
  success: boolean
  record_id?: string
  content_preview?: string    // 前 200 字预览
  source_type: string
  message?: string
}
```

## 依赖
- Vision LLM（Qwen-VL / DashScope）
- Readability（URL 内容提取）
- pdf-parse / mammoth / xlsx（文件解析）
- record 表（数据库）
- Digest 流程（后续触发）

## 备注
- 所有入口（PC 写作面板、移动输入框、CLI、MCP）最终都调用同一个 Ingest API
- source_type 影响 Digest 阶段的 salience 权重（material 降至 1/5 ~ 1/10）
- 图片和文件保留原始附件，content 字段存储提取后的文本
- Phase 1 不做内容审核，Phase 2+ 可接入安全检查
