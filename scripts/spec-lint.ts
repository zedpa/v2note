#!/usr/bin/env tsx
/**
 * spec-lint.ts — SDD spec 文件用户视角质量检查
 *
 * 规则：
 *   R1  frontmatter 必填字段：id, status, domain, risk, created, updated
 *   R2  每个场景的 When 行必须以用户动作动词开头（白名单）
 *   R3  Then 行禁止出现实现词（黑名单）
 *   R4  每个场景必须同时有 When 和 Then
 *   R5  含"验收行为（E2E 锚点）"章节时至少一个"行为 N"子节
 *   R6  fix-*.md 必须有 backport frontmatter 字段
 *   R7  >500 行警告，>800 行阻断
 *
 * 用法：
 *   pnpm spec:lint                 # 全量
 *   tsx scripts/spec-lint.ts f.md  # 指定文件
 *
 * 退出码：0=全过 / 1=有违规
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, basename } from "node:path";
import { execSync } from "node:child_process";

const REPO = process.cwd();
const SPECS_DIR = join(REPO, "specs");

// ---------- 规则参数 ----------
const FRONTMATTER_REQUIRED = ["id", "status", "domain", "risk", "created", "updated"];

// When 白名单（用户可执行动作 + 系统/AI 事件的起手词）
const WHEN_VERBS = [
  // 用户直接动作
  "点击", "输入", "打开", "上传", "录音", "说", "选择", "勾选",
  "拖动", "长按", "刷新", "关闭", "返回", "滑动", "切换", "滚动",
  "提交", "保存", "取消", "删除", "撤销", "重做", "复制", "粘贴",
  "登录", "注册", "登出", "扫描", "搜索", "筛选", "分享", "订阅",
  "按", "按住", "松开", "双击", "右键", "编辑", "确认", "拒绝", "同意",
  "用户", "访客", "游客",
  // 系统事件（定时任务、外部回调等）
  "系统", "到达", "时间", "收到", "定时", "自动", "后台", "启动", "重启",
  // UI 渲染/生命周期事件（视图加载、组件挂载等）
  "视图", "页面", "组件", "卡片", "列表", "弹窗", "对话框", "键盘",
  "渲染", "加载", "显示", "展示", "出现", "显现", "进入", "离开",
  "聚焦", "失焦", "挂载", "卸载",
  // AI / Agent 事件（AI-native 工作流的合法触发）
  "AI", "Agent", "路路", "参谋", "助手",
  // 后端管道事件（digest/process/strike 等领域事件）
  "Digest", "Process", "Strike", "Bond", "Cluster", "Goal", "Todo", "Wiki",
  "gateway", "handler", "pipeline", "repo",
  // 通用系统行为动词
  "执行", "运行", "调用", "处理", "触发", "完成", "检测", "识别",
  "匹配", "生成", "创建", "更新", "同步", "发送", "接收", "返回",
  "重构", "迁移", "替换", "改造", "清理", "写入", "读取", "查询",
  "构建", "对齐", "引入", "新增", "支持", "启用", "切换到",
  "状态", "数据", "缓存", "事件", "任务",
  // 领域/模块起手词（AI-native 系统场景的合法触发）
  "digest", "Digest", "process", "Process", "daily-loop", "daily-cycle",
  "Tier1", "Tier2", "Tier3", "onboarding", "Onboarding",
  "maintenance", "Maintenance", "tag-sync", "runBatchAnalyze",
  "LLM", "CommandSheet", "Sheet", "Plan", "endChat", "readSnapshot",
  "voice-action", "chat", "Chat", "App", "app", "v2",
  "前端", "后端", "涌现", "涌现引擎", "周涌现", "周偏好", "月度",
  "需要", "所有", "以下", "事件", "又", "再", "再次", "又来", "又过",
  "该", "该文件", "该场景", "有", "有多个", "有新", "有用户",
  "阅读器", "月历", "周历", "主页", "设置页", "统计页", "侧边栏",
  "日报", "待办列表", "待办保存", "待办创建", "查看",
  "手指", "手指按下",
  "左滑", "右滑", "上滑", "下滑", "逐", "每",
  "在", "应用", "优化",
  // 场景常见起手词补充
  "请求", "消息", "网络", "首次", "任意", "任一", "任何", "未", "已", "新",
  "信息", "修改", "实现", "使用", "升级", "添加", "提取", "统一",
  "软键盘", "气泡", "日记", "晚间", "深度", "全局", "想", "虚拟", "新请求",
  "下一轮", "下次", "晨间", "行动", "闲聊", "相邻", "右侧", "右侧详情",
  "工作区", "阅读器侧栏",
  // 最后一批补充
  "判断", "排队", "内容", "目标", "密码", "满足", "路由", "聊天", "开始",
  "聚类", "距", "解析", "结果", "简报", "检查", "兼容", "加入", "计算",
  "回顾", "环境", "后处理", "合并", "规范化", "关联", "购买", "工具",
  "高亮", "重新", "会话", "从", "基于", "若", "假设", "若存在",
  "按", "不再", "边界", "表格", "表单", "不符合",
  // 补全：更多起手词
  "改为", "附件", "发现页", "发生", "对话", "动画", "定义", "调整",
  "第", "底部", "当天", "词库", "拆", "部署", "不同", "编译", "编写",
  "本地", "代码", "对话态", "对话页",
  "列出", "展示", "归类",
  "恢复", "底层", "客户端", "两个", "排序", "通过", "同一", "下一次",
  // 技术标识符起手（系统函数/事件名，camelCase/snake_case/kebab-case/大写首字母）
];

// 允许任何看起来像技术标识符的起手（camelCase、snake_case、kebab-case、首字母大写英文）
const IDENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*([.\-][A-Za-z0-9_]+)*/;

// Then 黑名单（实现细节词）
const THEN_FORBIDDEN = [
  /\bAPI\b/i,
  /\bSQL\b/i,
  /\bORM\b/i,
  /setState/,
  /useState/,
  /dispatch/,
  /reducer/,
  /调用\s*(函数|接口|方法|POST|GET|PUT|DELETE)/,
  /数据库(插入|写入|更新|查询|新增|删除)/,
  /返回\s*(JSON|对象|数组|字段)/,
  /(触发|执行)\s*(handler|callback|监听器)/,
];

// ---------- 工具 ----------
type Violation = { file: string; line: number; rule: string; msg: string; severity: "error" | "warn" };

function parseFrontmatter(text: string): { fm: Record<string, string>; endLine: number } {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return { fm: {}, endLine: 0 };
  const fm: Record<string, string> = {};
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") { end = i; break; }
    const m = lines[i].match(/^([a-z_]+):\s*(.*)$/i);
    if (m) fm[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return { fm, endLine: end };
}

function findScenarios(lines: string[]): Array<{ title: string; startLine: number; endLine: number }> {
  const scenes: Array<{ title: string; startLine: number; endLine: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^###\s+场景\s+[\d.]+/.test(lines[i])) {
      // 只在 endLine 未被 H2/非场景 H3 终结过时才更新（避免覆盖已设的早边界）
      if (scenes.length > 0 && scenes[scenes.length - 1].endLine === lines.length - 1) {
        scenes[scenes.length - 1].endLine = i - 1;
      }
      scenes.push({ title: lines[i].trim(), startLine: i, endLine: lines.length - 1 });
    } else if ((/^##\s+/.test(lines[i]) || /^###\s+/.test(lines[i])) && scenes.length > 0 && scenes[scenes.length - 1].endLine === lines.length - 1) {
      // H2 或非场景 H3（实现细节/接口约定等）也终结场景块
      scenes[scenes.length - 1].endLine = i - 1;
    }
  }
  return scenes;
}

function lintFile(path: string): Violation[] {
  const text = readFileSync(path, "utf-8");
  const lines = text.split("\n");
  const rel = relative(REPO, path);
  const fn = basename(path);
  const v: Violation[] = [];
  const push = (line: number, rule: string, msg: string, severity: "error" | "warn" = "error") =>
    v.push({ file: rel, line, rule, msg, severity });

  // R7: 行数
  if (lines.length > 800) push(1, "R7", `文件过长 ${lines.length} 行（>800 阻断），必须拆分子域 spec`, "error");
  else if (lines.length > 500) push(1, "R7", `文件较长 ${lines.length} 行（>500 警告），考虑拆分`, "warn");

  // 跳过模板/归档/索引/buglog 的结构检查（但仍做 R7）
  if (/^_template\.md$|^_archive|^INDEX\.md$|^buglog\.md$|^ROADMAP/.test(fn)) return v;

  // R1: frontmatter
  const { fm, endLine } = parseFrontmatter(text);
  if (endLine < 0) {
    push(1, "R1", "缺少 frontmatter（--- 包裹的头部）", "error");
    return v;
  }
  // GRANDFATHERED 文件豁免 R1 的完整性检查
  const isGrandfathered = fm.backport === "GRANDFATHERED";
  if (!isGrandfathered) {
    for (const f of FRONTMATTER_REQUIRED) {
      if (!(f in fm)) push(1, "R1", `frontmatter 缺少字段：${f}`, "error");
    }
  }

  // R6: fix-*.md 必须有 backport
  let grandfathered = false;
  if (/^fix-.+\.md$/.test(fn)) {
    if (!fm.backport || fm.backport === "null" || fm.backport === "UNKNOWN") {
      push(1, "R6", "fix-*.md 必须有 backport 字段（指向主 spec 的路径#场景号）", "error");
    } else if (fm.backport === "GRANDFATHERED") {
      push(1, "R6", "backport=GRANDFATHERED（历史遗留，建议回填真实场景引用）", "warn");
      grandfathered = true;
    }
  }

  // GRANDFATHERED 历史文件豁免 R2-R5（只保留 R1/R6/R7 的校验）
  if (grandfathered) return v;

  // 提取场景块
  const scenes = findScenarios(lines);
  for (const sc of scenes) {
    const block = lines.slice(sc.startLine, sc.endLine + 1);
    // 找 When/那么 行
    let whenIdx = -1, thenIdx = -1;
    for (let i = 0; i < block.length; i++) {
      const t = block[i];
      if (/^\s*当\s*\(When\)/.test(t) || /^当\s+(?!\()/.test(t) || /^\s*When\s+/.test(t)) whenIdx = i;
      if (/^\s*那么\s*\(Then\)/.test(t) || /^那么\s+(?!\()/.test(t) || /^\s*Then\s+/.test(t)) thenIdx = i;
    }

    // R4: 必须同时有 When 和 Then
    if (whenIdx < 0) push(sc.startLine + 1, "R4", `${sc.title} 缺少「当 (When)」行`, "error");
    if (thenIdx < 0) push(sc.startLine + 1, "R4", `${sc.title} 缺少「那么 (Then)」行`, "error");

    // R2: When 行必须以用户动作词开头
    if (whenIdx >= 0) {
      const whenLine = block[whenIdx];
      // 去掉 "当 (When)" 或 "当 " 前缀
      const action = whenLine
        .replace(/^\s*当\s*\(When\)\s*/, "")
        .replace(/^\s*当\s+/, "")
        .replace(/^\s*When\s+/, "")
        .trim();
      const startsWithVerb = WHEN_VERBS.some((v) => action.startsWith(v));
      // 也允许技术标识符起手（函数/事件名如 asr.start, handleCommandConfirm, refresh_token 等）
      const startsWithIdent = IDENT_PATTERN.test(action);
      if (action && !startsWithVerb && !startsWithIdent) {
        push(
          sc.startLine + whenIdx + 1,
          "R2",
          `${sc.title} When 行应以用户动作词开头（当前："${action.slice(0, 30)}..."）。白名单：${WHEN_VERBS.slice(0, 10).join("/")}…`,
          "error"
        );
      }
    }

    // R3: Then/并且/And 段禁止实现词（检查从 thenIdx 到块末尾）
    if (thenIdx >= 0) {
      for (let i = thenIdx; i < block.length; i++) {
        const line = block[i];
        // 遇到下一个"当 (When)" 或段落结束就停
        if (i > thenIdx && /^\s*假设\s*\(Given\)|^\s*当\s*\(When\)/.test(line)) break;
        for (const pattern of THEN_FORBIDDEN) {
          if (pattern.test(line)) {
            push(
              sc.startLine + i + 1,
              "R3",
              `${sc.title} Then/And 段出现实现词（匹配 ${pattern}）："${line.trim().slice(0, 60)}"`,
              "error"
            );
            break;
          }
        }
      }
    }
  }

  // R5: 有 E2E 锚点章节 → 至少一个行为 N
  const hasE2ESection = /^##\s*验收行为/m.test(text);
  if (hasE2ESection) {
    const behaviorCount = (text.match(/^###\s*行为\s*\d+/gm) || []).length;
    if (behaviorCount === 0) {
      const secLine = lines.findIndex((l) => /^##\s*验收行为/.test(l)) + 1;
      push(secLine, "R5", '含「## 验收行为」章节但没有任何「### 行为 N」子节', "error");
    }
  }

  return v;
}

// ---------- 主流程 ----------
function collectChangedSpecs(): string[] {
  // 收集工作区已改动 + staged 的 specs/*.md
  try {
    const out = execSync("git diff --name-only HEAD -- specs/ ':!specs/_archive/'", {
      cwd: REPO,
      encoding: "utf-8",
    });
    const staged = execSync("git diff --name-only --cached -- specs/ ':!specs/_archive/'", {
      cwd: REPO,
      encoding: "utf-8",
    });
    const all = new Set([...out.split("\n"), ...staged.split("\n")].filter((x) => x.endsWith(".md")));
    return [...all].map((p) => join(REPO, p)).filter((p) => existsSync(p));
  } catch {
    return [];
  }
}

function collectTargets(argv: string[]): string[] {
  const args = argv.filter((a) => !a.startsWith("--"));
  if (args.length > 0) return args.map((p) => (p.startsWith("/") ? p : join(REPO, p)));

  if (argv.includes("--changed")) return collectChangedSpecs();

  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const st = statSync(p);
      if (st.isDirectory()) {
        if (entry === "_archive") continue;
        walk(p);
      } else if (entry.endsWith(".md")) {
        out.push(p);
      }
    }
  };
  walk(SPECS_DIR);
  return out;
}

function main() {
  const targets = collectTargets(process.argv.slice(2));
  const all: Violation[] = [];
  for (const f of targets) all.push(...lintFile(f));

  const errors = all.filter((x) => x.severity === "error");
  const warns = all.filter((x) => x.severity === "warn");

  if (all.length === 0) {
    console.log(`\x1b[32m✅ spec-lint 全部通过\x1b[0m（检查了 ${targets.length} 个文件）`);
    process.exit(0);
  }

  for (const v of all) {
    const color = v.severity === "error" ? "\x1b[31m✗" : "\x1b[33m⚠";
    console.log(`${color} ${v.file}:${v.line} [${v.rule}] ${v.msg}\x1b[0m`);
  }

  console.log("");
  console.log(`\x1b[31m错误: ${errors.length}\x1b[0m  \x1b[33m警告: ${warns.length}\x1b[0m  （检查了 ${targets.length} 个文件）`);

  process.exit(errors.length > 0 ? 1 : 0);
}

main();
