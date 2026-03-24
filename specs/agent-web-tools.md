# Agent 联网工具

> 状态：🟡 待开发 | 优先级：Phase 2.5（Agent 基础能力）| 预计：3-4 天
> 依赖：agent-tool-layer（工具注册）

## 概述
路路需要联网能力：搜索最新信息、抓取用户指定 URL 内容。联网获取的内容通过 Ingest 管道作为 material 流入认知系统（降权、不参与涌现、只被动吸附），与用户自己的 think 内容严格区分。

**当前状态：**
- `gateway/src/ingest/url-extractor.ts`：已有 URL 内容提取能力（Readability 解析）
- `builtin.ts` 的 ingest 工具：已支持 URL + source_type='material'
- 缺少：联网搜索（web_search）、独立的 fetch_url 工具、来源标注

## 场景

### 场景 1: web_search——联网搜索

```
假设 (Given)  用户问"最近铝价行情怎样"
当   (When)   路路判断需要联网信息
并且 (And)    调用 web_search({ query: "铝价 最新行情 2026" })
那么 (Then)   调用搜索服务 API（Tavily / SerpAPI）
并且 (And)    返回结构化结果：
      {
        success: true,
        message: "找到 5 条搜索结果",
        data: {
          results: [
            { title, url, snippet, published_date },
            ...
          ],
          answer?: string  // Tavily 的直接回答（如有）
        }
      }
并且 (And)    搜索结果仅供 AI 参考回答，不自动录入系统
并且 (And)    自主度：Level 1（静默执行，用户不感知搜索过程）
```

### 场景 2: fetch_url——URL 内容抓取

```
假设 (Given)  用户说"帮我看看这个链接 https://xxx.com/report"
当   (When)   路路调用 fetch_url({ url: "https://xxx.com/report" })
那么 (Then)   使用 Readability 提取正文内容（复用 url-extractor.ts）
并且 (And)    返回结构化结果：
      {
        success: true,
        message: "已获取页面内容（约 2000 字）",
        data: {
          title: "2026年Q1铝价分析报告",
          content: "正文内容...",
          word_count: 2000,
          url: "https://xxx.com/report",
          fetched_at: "2026-03-24T10:30:00Z"
        }
      }
并且 (And)    AI 基于内容回答用户问题
并且 (And)    同时后台调用 Ingest 管道录入为 material
并且 (And)    自主度：Level 1（静默执行）
```

### 场景 3: fetch_url 自动进入 Ingest 管道

```
假设 (Given)  fetch_url 成功获取内容
当   (When)   内容返回给 AI 后
那么 (Then)   后台异步调用 Ingest：
      POST /api/v1/ingest {
        text: "[URL抓取] ${title}\n\n${content}",
        url: originalUrl,
        source_type: 'material'
      }
并且 (And)    进入标准 Digest 管道 → Strike (salience 1/5~1/10)
并且 (And)    不参与 Cluster 涌现
并且 (And)    只在参谋对话中可被引用（被动吸附）
并且 (And)    复用现有 builtin.ts handleIngest 逻辑，不重复实现
```

### 场景 4: 来源标注——对话中区分信息来源

```
假设 (Given)  路路的回复引用了联网获取的信息
当   (When)   渲染回复
那么 (Then)   联网内容带来源标注：
      "根据最新数据，LME铝价目前在2750美元/吨左右。"
      🌐 来源：metal.com/aluminum-price · 2026-03-24

并且 (And)    标注格式与参谋上下文的引用一致：
      📝 用户原声  — 日记引用
      📄 外部素材  — material 引用
      🌐 联网信息  — 实时搜索/抓取
并且 (And)    来源标注可点击打开原始 URL
```

### 场景 5: 联网安全边界

```
假设 (Given)  路路需要执行联网操作
当   (When)   检查安全限制
那么 (Then)   遵循以下边界：

  内容限制：
    max_content_length: 50000 字符（~50KB）
    request_timeout_ms: 10000（10秒）
    超出截断并标注"（内容已截断，原文约 N 字）"

  URL 限制：
    仅允许 http / https 协议
    禁止访问：localhost, 127.0.0.1, 10.*, 172.16-31.*, 192.168.*
    禁止访问：*.internal, *.local

  频率限制：
    max_searches_per_session: 5 次/会话
    max_fetches_per_session: 3 次/会话
    超出限制时路路说明原因，不静默失败

  内容安全：
    PDF/图片等非 HTML → 尝试提取文本，失败则返回"无法解析此格式"
    页面需要登录 → 返回"此页面需要登录，无法获取内容"
```

### 场景 6: web_search 服务选型与降级

```
假设 (Given)  系统配置搜索服务
当   (When)   环境变量 WEB_SEARCH_PROVIDER 决定使用哪个服务
那么 (Then)   支持以下提供商（按推荐顺序）：

  1. Tavily API（推荐）
     优势：为 AI agent 优化，返回结构化摘要 + answer
     配置：TAVILY_API_KEY

  2. SerpAPI
     优势：Google 搜索结果包装，覆盖面广
     配置：SERPAPI_KEY

  3. 禁用（默认）
     未配置任何 API key → web_search 工具不注册到 ToolRegistry
     路路说"联网搜索未启用"

并且 (And)    搜索失败时不重试，直接告知用户"搜索暂时不可用"
并且 (And)    搜索服务的 API key 通过环境变量注入，不硬编码
```

### 场景 7: 联网结果在对话上下文中的生命周期

```
假设 (Given)  路路在本次对话中搜索了铝价信息
当   (When)   同一会话中用户后续追问"刚才的铝价数据源是哪里"
那么 (Then)   路路可以引用之前的搜索结果（在 session context 中）
并且 (And)    搜索结果作为 tool_result 保留在对话历史中

当   (When)   下次新会话用户问"上次你查的铝价是多少"
那么 (Then)   路路通过 search({ scope: "records" }) 查找已录入的 material
并且 (And)    因为 fetch_url 已通过 Ingest 管道持久化为 material record
```

### 场景 8: 用户主动分享 URL 的处理

```
假设 (Given)  用户在对话中直接发了一个 URL
      例："https://xxx.com/article 你看看这个"
当   (When)   路路检测到消息中包含 URL
那么 (Then)   自动调用 fetch_url 获取内容（Level 1 静默）
并且 (And)    基于内容回答或总结
并且 (And)    不需要用户显式说"帮我看这个链接"

假设 (Given)  URL 无法访问或解析失败
当   (When)   fetch_url 返回错误
那么 (Then)   路路说明："这个链接我打不开（原因），你能把关键内容贴给我吗？"
并且 (And)    不反复重试
```

## 边界条件
- [ ] HTTPS 证书错误 → 拒绝访问，告知用户
- [ ] 页面返回 403/404 → 告知用户"页面不可访问"
- [ ] 超大页面 (>50KB 正文) → 截断前 50KB，标注截断
- [ ] 非文本内容 (图片/视频页) → 返回页面 title + meta description
- [ ] 搜索结果全不相关 → 路路说"没找到有用信息"，不硬编答案
- [ ] 搜索服务限流/超额 → 返回友好提示，降级为"建议你搜索一下xxx"

## 接口约定

工具定义：
```typescript
// web_search
const webSearchTool = {
  name: 'web_search',
  description: `联网搜索最新信息。
    使用：用户问到需要实时数据的问题（价格、新闻、最新政策）。
    使用：用户明确要求"帮我搜一下"、"查查看"。
    不用：用户问的是系统内已有的信息 → 用 search。
    不用：用户给了具体 URL → 用 fetch_url。`,
  parameters: z.object({
    query: z.string().describe('搜索关键词'),
    max_results: z.number().optional().default(5).describe('最大结果数'),
  }),
  autonomy: 'silent' as const,
};

// fetch_url
const fetchUrlTool = {
  name: 'fetch_url',
  description: `获取指定网页的内容。
    使用：用户分享了一个 URL 想让你看。
    使用：需要获取特定网页的详细内容。
    不用：用户只是想搜索信息 → 用 web_search。
    不用：URL 是系统内部链接（/goals/xxx）→ 用 search。`,
  parameters: z.object({
    url: z.string().url().describe('要抓取的网页 URL'),
  }),
  autonomy: 'silent' as const,
};
```

搜索服务抽象层：
```typescript
interface WebSearchProvider {
  search(query: string, maxResults: number): Promise<WebSearchResult[]>;
}

interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  published_date?: string;
}

// 根据环境变量选择实现
function createSearchProvider(): WebSearchProvider | null {
  if (process.env.TAVILY_API_KEY) return new TavilyProvider();
  if (process.env.SERPAPI_KEY) return new SerpApiProvider();
  return null;  // 未配置，web_search 工具不注册
}
```

## 涉及文件
| 文件 | 改动类型 |
|------|---------|
| 新建 `gateway/src/tools/definitions/web-search.ts` | web_search 工具定义 + handler |
| 新建 `gateway/src/tools/definitions/fetch-url.ts` | fetch_url 工具定义 + handler |
| 新建 `gateway/src/web/search-provider.ts` | 搜索服务抽象层 |
| 新建 `gateway/src/web/tavily.ts` | Tavily 实现 |
| `gateway/src/ingest/url-extractor.ts` | 复用：fetch_url 的内容提取 |
| `gateway/src/tools/registry.ts` | 修改：条件注册 web 工具 |
| `features/chat/components/chat-bubble.tsx` | 修改：🌐 来源标注渲染 |

## 依赖
- agent-tool-layer（ToolRegistry 注册机制）
- 已有 url-extractor.ts（Readability 解析）
- 已有 Ingest 管道（material 录入 + Digest）
- 外部：Tavily API 或 SerpAPI（需 API key）

## AI 调用
- web_search：0-5 次/会话（取决于用户是否需要联网信息）
- fetch_url：0-3 次/会话
- 搜索结果不消耗 Digest AI 调用（仅在后台 Ingest 时触发）

## 验收标准
用户说"查查最近的铝价"→ 路路联网搜索并给出带来源标注的回答；用户分享 URL → 路路自动获取内容并总结，内容同时作为 material 进入认知系统。
