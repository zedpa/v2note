# V2Note 使用说明

本文档面向开发者与试用者，说明如何在本地运行与验证当前版本的 V2Note（Flutter + Supabase + 云端 ASR + OpenAI）。

## 1. 环境要求

- Flutter SDK（已验证路径：`C:\Users\zedpa\tools\flutter`）
- Git
- 可选：Deno（用于 Supabase Edge Function 测试）
- 可选：Supabase CLI（用于本地 Edge Function 运行）

## 2. 获取代码并安装依赖

```powershell
cd G:\AI\abc\v2note
& 'C:\Users\zedpa\tools\flutter\bin\flutter' pub get
```

## 3. 运行应用（开发模式）

```powershell
cd G:\AI\abc\v2note
& 'C:\Users\zedpa\tools\flutter\bin\flutter' run
```

应用启动后：
- 主页为 Timeline（时间线）。
- 顶部显示 Weekly Review 卡片（占位）。
- 点击右下角麦克风按钮会插入一条“Processed note”（用于模拟处理后的记录）。

> 当前为 MVP 骨架：录音与上传流程未接入真实 ASR/OpenAI，仅保留交互路径。

## 4. 测试

### Flutter 测试

```powershell
cd G:\AI\abc\v2note
& 'C:\Users\zedpa\tools\flutter\bin\flutter' test
```

### Edge Function 测试（可选）

如果已安装 Deno：

```powershell
cd G:\AI\abc\v2note
# 仅测试 process_audio
Deno test supabase/functions/process_audio/__tests__/process_audio.test.ts
```

## 5. Supabase Edge Functions（后端骨架）

当前提供两个函数：
- `supabase/functions/process_audio/index.ts`
- `supabase/functions/weekly_review/index.ts`

`process_audio` 期望的环境变量：
- `ASR_URL`
- `ASR_API_KEY`
- `OPENAI_URL`
- `OPENAI_API_KEY`

### 本地运行（示例，需 Supabase CLI）

```powershell
supabase start
supabase functions serve process_audio
```

调用示例（伪代码）：

```json
POST /functions/v1/process_audio
{
  "audio_url": "https://example.com/audio.m4a",
  "language": "zh-CN"
}
```

返回结构示例：

```json
{
  "transcript": "...",
  "summary": "...",
  "tags": ["work"],
  "todos": ["..."],
  "ideas": ["..."]
}
```

## 6. 目录结构（关键）

```
lib/
  main.dart                # 入口 + 时间线示例
  models/                  # 领域模型
  services/                # Supabase/队列/Shake 服务
  ui/                      # TimelineItem / WeeklyReviewCard
supabase/
  functions/
    process_audio/
    weekly_review/
test/
  app_smoke_test.dart
  e2e/smoke_test.dart
  services/
  ui/
```

## 7. 当前实现与限制

- Timeline 为 mock 数据。
- 录音/上传/转写未接入实际设备与 API。
- Edge Function 提供结构化输出框架，但未与 Supabase DB 写入连接。

## 8. 下一步建议

- 录音模块接入 `record` + 真实上传到 Supabase Storage。
- `process_audio` 将结果写入 Supabase Postgres。
- 客户端增加实时同步与本地缓存（Isar 或 SQLite）。

---

如需我补充「部署说明」「Supabase schema」「ASR 供应商接入步骤」，直接告诉我。
