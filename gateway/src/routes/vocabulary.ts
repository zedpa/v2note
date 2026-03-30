import type { Router } from "../router.js";
import { readBody, sendJson, sendError, getDeviceId, getUserId } from "../lib/http-helpers.js";
import * as vocabRepo from "../db/repositories/vocabulary.js";
import { invalidateCache } from "../cognitive/vocabulary.js";
import { syncVocabularyToDashScope } from "../cognitive/vocabulary-sync.js";
import { chatCompletion } from "../ai/provider.js";

// ── 预设领域词汇 ──────────────────────────────────────────────────────

interface PresetTerm {
  term: string;
  aliases: string[];
}

const PRESET_DOMAINS: Record<string, PresetTerm[]> = {
  manufacturing: [
    { term: "良品率", aliases: ["良率", "良品律", "量品率"] },
    { term: "不良率", aliases: ["不良律", "不量率"] },
    { term: "产能", aliases: ["产能量", "产能力"] },
    { term: "工序", aliases: ["工续", "工叙"] },
    { term: "模具", aliases: ["模据", "磨具", "磨据"] },
    { term: "注塑", aliases: ["注速", "注俗", "柱塑"] },
    { term: "CNC加工", aliases: ["CNC加功", "cnc加工", "数控加工"] },
    { term: "品控", aliases: ["品空", "频控"] },
    { term: "来料检验", aliases: ["来料检验", "来料检查"] },
    { term: "OQC", aliases: ["oqc", "出货检验"] },
    { term: "IQC", aliases: ["iqc", "进料检验"] },
    { term: "SOP", aliases: ["sop", "标准作业流程", "作业指导书"] },
    { term: "治具", aliases: ["制具", "治据"] },
    { term: "夹具", aliases: ["加具", "夹据"] },
    { term: "公差", aliases: ["工差", "公插"] },
    { term: "毛刺", aliases: ["毛次", "毛刺儿"] },
    { term: "抛光", aliases: ["跑光", "刨光"] },
    { term: "阳极氧化", aliases: ["阳极氧话", "阳级氧化"] },
    { term: "电镀", aliases: ["电度", "电渡"] },
    { term: "冲压", aliases: ["充压", "冲呀"] },
    { term: "焊接", aliases: ["汉接", "焊节"] },
    { term: "SMT", aliases: ["smt", "贴片"] },
    { term: "BOM", aliases: ["bom", "物料清单"] },
    { term: "MES", aliases: ["mes", "制造执行系统"] },
    { term: "ERP", aliases: ["erp", "企业资源计划"] },
  ],
  finance: [
    { term: "资产负债表", aliases: ["资产负债标", "资产附债表"] },
    { term: "利润表", aliases: ["利润标", "利润报"] },
    { term: "现金流量表", aliases: ["现金流量标", "现金留量表"] },
    { term: "毛利率", aliases: ["毛利律", "茅利率"] },
    { term: "净利率", aliases: ["净利律", "净力率"] },
    { term: "ROE", aliases: ["roe", "净资产收益率"] },
    { term: "ROI", aliases: ["roi", "投资回报率"] },
    { term: "PE", aliases: ["pe", "市盈率"] },
    { term: "PB", aliases: ["pb", "市净率"] },
    { term: "应收账款", aliases: ["应收帐款", "应收账贯"] },
    { term: "应付账款", aliases: ["应付帐款", "应付账贯"] },
    { term: "折旧", aliases: ["折旧费", "折久"] },
    { term: "摊销", aliases: ["摊消", "谈销"] },
    { term: "资本开支", aliases: ["资本开只", "资本开枝"] },
    { term: "现金流", aliases: ["现金留", "现金溜"] },
    { term: "股息", aliases: ["股息率", "古息"] },
    { term: "增发", aliases: ["增法", "赠发"] },
    { term: "回购", aliases: ["回够", "汇购"] },
    { term: "杠杆", aliases: ["杠杆率", "扛杆"] },
    { term: "对冲", aliases: ["对充", "队冲"] },
    { term: "期权", aliases: ["期全", "其权"] },
    { term: "期货", aliases: ["期活", "其货"] },
    { term: "基金", aliases: ["基经", "鸡金"] },
    { term: "债券", aliases: ["债劵", "寨券"] },
    { term: "IPO", aliases: ["ipo", "首次公开发行"] },
  ],
  tech: [
    { term: "API", aliases: ["api", "接口"] },
    { term: "SDK", aliases: ["sdk", "开发工具包"] },
    { term: "微服务", aliases: ["微服物", "围服务"] },
    { term: "容器化", aliases: ["容器话", "融器化"] },
    { term: "Kubernetes", aliases: ["kubernetes", "k8s", "K8S"] },
    { term: "Docker", aliases: ["docker", "多克"] },
    { term: "CI/CD", aliases: ["cicd", "持续集成"] },
    { term: "DevOps", aliases: ["devops", "运维开发"] },
    { term: "数据库", aliases: ["数据苦", "数剧库"] },
    { term: "缓存", aliases: ["环存", "缓村"] },
    { term: "Redis", aliases: ["redis", "瑞迪斯"] },
    { term: "消息队列", aliases: ["消息对列", "消息队例"] },
    { term: "负载均衡", aliases: ["负载均横", "付载均衡"] },
    { term: "高可用", aliases: ["高可用性", "高科用"] },
    { term: "分布式", aliases: ["分布是", "分不式"] },
    { term: "前端", aliases: ["前段", "浅端"] },
    { term: "后端", aliases: ["后段", "候端"] },
    { term: "全栈", aliases: ["全站", "泉栈"] },
    { term: "TypeScript", aliases: ["typescript", "ts", "TS"] },
    { term: "React", aliases: ["react", "瑞艾克特"] },
    { term: "Vue", aliases: ["vue", "维尤"] },
    { term: "Node.js", aliases: ["nodejs", "node"] },
    { term: "PostgreSQL", aliases: ["postgresql", "pg", "PG"] },
    { term: "GraphQL", aliases: ["graphql", "图查询"] },
    { term: "WebSocket", aliases: ["websocket", "ws", "长连接"] },
  ],
};

// ── Routes ─────────────────────────────────────────────────────────────

export function registerVocabularyRoutes(router: Router) {
  // ── GET /api/v1/vocabulary ──
  // 返回用户词汇，按 domain 分组（userId 优先，跨设备共享）
  router.get("/api/v1/vocabulary", async (req, res) => {
    try {
      const deviceId = getDeviceId(req);
      const userId = getUserId(req);
      const entries = userId
        ? await vocabRepo.findByUser(userId)
        : await vocabRepo.findByDevice(deviceId);

      // 按 domain 分组
      const grouped: Record<string, typeof entries> = {};
      for (const entry of entries) {
        if (!grouped[entry.domain]) grouped[entry.domain] = [];
        grouped[entry.domain].push(entry);
      }

      sendJson(res, grouped);
    } catch (err: any) {
      sendError(res, err.message ?? "Internal error", err.status ?? 500);
    }
  });

  // ── POST /api/v1/vocabulary ──
  // 添加词汇 { term, domain, aliases? }
  router.post("/api/v1/vocabulary", async (req, res) => {
    try {
      const deviceId = getDeviceId(req);
      const userId = getUserId(req);
      const body = await readBody<{ term: string; domain: string; aliases?: string[] }>(req);

      if (!body.term || !body.domain) {
        sendError(res, "Missing required fields: term, domain", 400);
        return;
      }

      const entry = await vocabRepo.create({
        deviceId,
        userId,
        term: body.term,
        domain: body.domain,
        aliases: body.aliases ?? [],
        source: "user",
      });

      invalidateCache(deviceId);
      // 异步同步到 DashScope（不阻断响应）
      syncVocabularyToDashScope(deviceId).catch(() => {});
      sendJson(res, entry, 201);
    } catch (err: any) {
      sendError(res, err.message ?? "Internal error", err.status ?? 500);
    }
  });

  // ── DELETE /api/v1/vocabulary/:id ──
  router.delete("/api/v1/vocabulary/:id", async (req, res, params) => {
    try {
      const deviceId = getDeviceId(req);
      const userId = getUserId(req);
      const id = params.id;

      // 校验所有权：只能删除属于自己设备或账号的词汇
      const affected = await vocabRepo.deleteByIdOwned(id, deviceId, userId);
      if (affected === 0) {
        sendError(res, "Vocabulary entry not found", 404);
        return;
      }

      invalidateCache(deviceId);
      // 异步同步到 DashScope（不阻断响应）
      syncVocabularyToDashScope(deviceId).catch(() => {});
      sendJson(res, { deleted: true });
    } catch (err: any) {
      sendError(res, err.message ?? "Internal error", err.status ?? 500);
    }
  });

  // ── POST /api/v1/vocabulary/import-domain ──
  // 导入预设领域词汇 { domain }
  router.post("/api/v1/vocabulary/import-domain", async (req, res) => {
    try {
      const deviceId = getDeviceId(req);
      const userId = getUserId(req);
      const body = await readBody<{ domain: string }>(req);

      if (!body.domain) {
        sendError(res, "Missing required field: domain", 400);
        return;
      }

      const presetTerms = PRESET_DOMAINS[body.domain];
      if (!presetTerms) {
        const available = Object.keys(PRESET_DOMAINS);
        sendError(res, `Unknown domain: ${body.domain}. Available: ${available.join(", ")}`, 400);
        return;
      }

      const created: vocabRepo.VocabularyEntry[] = [];
      for (const preset of presetTerms) {
        const entry = await vocabRepo.create({
          deviceId,
          userId,
          term: preset.term,
          aliases: preset.aliases,
          domain: body.domain,
          source: "preset",
        });
        created.push(entry);
      }

      invalidateCache(deviceId);
      // 异步同步到 DashScope（不阻断响应）
      syncVocabularyToDashScope(deviceId).catch(() => {});
      sendJson(res, { domain: body.domain, imported: created.length, entries: created }, 201);
    } catch (err: any) {
      sendError(res, err.message ?? "Internal error", err.status ?? 500);
    }
  });

  // ── POST /api/v1/vocabulary/sync ──
  // 手动触发同步到 DashScope（通常由增删自动触发）
  router.post("/api/v1/vocabulary/sync", async (req, res) => {
    try {
      const deviceId = getDeviceId(req);
      const vocabularyId = await syncVocabularyToDashScope(deviceId);
      sendJson(res, { vocabulary_id: vocabularyId, synced: !!vocabularyId });
    } catch (err: any) {
      sendError(res, err.message ?? "Internal error", err.status ?? 500);
    }
  });

  // ── POST /api/v1/vocabulary/generate ──
  // AI 生成自定义领域词库 { domain_name }
  router.post("/api/v1/vocabulary/generate", async (req, res) => {
    try {
      const deviceId = getDeviceId(req);
      const userId = getUserId(req);
      const body = await readBody<{ domain_name: string }>(req);

      if (!body.domain_name) {
        sendError(res, "Missing required field: domain_name", 400);
        return;
      }

      const systemPrompt = `你是专业词库生成助手。为给定的领域生成 50-80 个核心专业术语。
返回 JSON 格式：
{
  "terms": [
    { "term": "术语名称", "aliases": ["别名1", "别名2"] }
  ]
}
要求：
- 选择该领域最常用、最具代表性的专业词汇
- aliases 填写该术语的常见误写、缩写或同义词（0-3个）
- 只返回 JSON，不要解释`;

      const aiResp = await chatCompletion(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: `领域：${body.domain_name}` },
        ],
        { json: true, temperature: 0.3, timeout: 60000, tier: "report" },
      );

      let parsed: { terms: Array<{ term: string; aliases?: string[] }> };
      try {
        parsed = JSON.parse(aiResp.content);
      } catch {
        sendError(res, "AI returned invalid JSON", 500);
        return;
      }

      const terms = parsed.terms ?? [];
      const created: vocabRepo.VocabularyEntry[] = [];
      for (const t of terms) {
        if (!t.term) continue;
        try {
          const entry = await vocabRepo.create({
            deviceId,
            userId,
            term: t.term,
            aliases: t.aliases ?? [],
            domain: body.domain_name,
            source: "preset",
          });
          created.push(entry);
        } catch {
          // 忽略重复插入
        }
      }

      invalidateCache(deviceId);
      syncVocabularyToDashScope(deviceId).catch(() => {});
      sendJson(res, { domain: body.domain_name, generated: created.length, entries: created }, 201);
    } catch (err: any) {
      sendError(res, err.message ?? "Internal error", err.status ?? 500);
    }
  });
}
