# ACTIVE_TASKS.md — PC 端开发执行计划

> 设计文档：docs/PLAN-pc-design.md
> 品牌手册：docs/brand-identity.html
> 目标：PC 端四场景 + 品牌体系集成到移动端

---

## Phase A: 品牌体系集成 + 写作面板

### TASK-W1-01: 品牌配色/字体全局替换

**复杂度**: M
**涉及文件**: tailwind.config.ts, app/globals.css, app/layout.tsx

1. tailwind.config.ts 中注册品牌色（bark/deer/antler/cream/sand/border + forest/sky/dawn/maple）
2. 注册字体：Noto Serif SC（品牌标题）+ Noto Sans SC（正文）+ SF Mono/Fira Code（写作）
3. globals.css 中引入 Google Fonts
4. 替换现有 primary/background/foreground 映射为品牌色
5. 移动端现有组件应随 CSS 变量自动更新配色

**验收**: 移动端整体色调从当前配色切换到暖奶/树皮/鹿毛体系

---

### TASK-W1-02: 路路 Logo SVG 组件

**复杂度**: S
**涉及文件**: components/brand/lulu-logo.tsx（新建）

1. 从 brand-identity.html 提取路路 SVG
2. 封装为 React 组件，支持 size/variant（light/dark/color）props
3. 呼吸动画（breathe keyframe）

---

### TASK-W1-03: 移动端品牌集成

**复杂度**: M
**涉及文件**: app/page.tsx, features/cognitive/components/life-map.tsx 等

1. Level -1 纯净入口：用品牌色替换当前 echo 暗色风格 → 暖奶底+树皮文字（或保留暗色作为可选主题）
2. 菜单栏/侧边栏：路路 Logo 替换现有 N 图标
3. 空状态（认知地图空）：路路完整形象+温暖引导文案
4. 冷启动播种页："你好，我是路路"替换"你好，我是你的认知伙伴"
5. 每日回顾文案："路路发现……"替代系统语气

---

### TASK-W1-04: 写作面板（PC 场景 A）

**复杂度**: L
**涉及文件**: app/write/page.tsx（新建）, features/writing/ 目录（新建）

1. 全屏居中编辑区（max-w-[680px]）
2. Markdown 编辑器选型：tiptap（推荐，插件生态好）或 milkdown
3. 等距字体，行高 2 倍，暖奶底
4. 日期标题自动生成
5. Ctrl+Enter 发送 → POST /api/v1/ingest
6. 发送后底部反馈"✓ 路路收到了 · 关于XXX"（1.5s 淡出）
7. 底部状态栏（hover 显现）：Markdown 标识 + 字数统计 + 提交按钮

---

### TASK-W1-05: 斜杠命令面板

**复杂度**: M
**涉及文件**: features/writing/components/command-palette.tsx（新建）

1. 行首 `/` 触发
2. 命令列表：/today /review /map /goals /actions /think /search /timeline /settings
3. 搜索过滤
4. 选择后触发对应浮层或导航
5. Markdown 语法提示（# ## - [ ] > 等）也在列表中

---

## Phase B: 时间线 + 浮层框架

### TASK-W2-01: PC 响应式布局框架

**复杂度**: M
**涉及文件**: app/layout.tsx, 响应式断点

1. < 768px：现有移动端布局
2. 768-1024px：简化三栏（可收起右栏）
3. \> 1024px：PC 三栏全展
4. 菜单栏组件（hover 滑入/滑出）

---

### TASK-W2-02: 菜单栏

**复杂度**: M
**涉及文件**: components/layout/menu-bar.tsx（新建）

1. 顶部 44px，暖奶底，backdrop-blur
2. 左：路路 Logo + "念念有路" + 四场景切换（写作/时间线/地图/目标）
3. 右：🔍搜索 + 🎙语音 + ⚡️行动 + 📋回顾 + ⚙️设置
4. 鼠标移入顶部 48px 区域滑入，离开 400ms 淡出
5. 📋有新报告时鹿毛色小圆点

---

### TASK-W2-03: 浮层容器组件

**复杂度**: S
**涉及文件**: components/layout/overlay.tsx（新建）

1. 通用浮层组件：居中弹窗 / 右侧边栏 两种模式
2. 半透明背景遮罩，Esc 关闭
3. 动画：弹窗 scale 0.95→1.0 + opacity，侧边栏 translateX

---

### TASK-W2-04: 时间线场景（PC 三栏）

**复杂度**: L
**涉及文件**: app/timeline/page.tsx（新建）, features/timeline/ 目录

1. 左栏结构导航（200px）：涌现的主题树 + 手动创建 + 拖拽归类
2. 中栏日记流：推特式卡片（原文+时间+输入方式+主题标签+关联数）
3. 右栏焦点（320px）：原文+语音回放+附件+相关记录+所属+💬参谋入口
4. 筛选器：全部/语音/文字/图片/时间范围

---

### TASK-W2-05: 每日回顾浮层

**复杂度**: M
**涉及文件**: features/review/components/daily-review.tsx（新建）

1. 居中弹窗 620px
2. 晨间/晚间 tab 切换
3. 晨间：行动线 + AI 洞察（偏差/模式/共振）
4. 晚间：统计 + 洞察 + 最有价值记录 + 情绪 + 反思引导
5. 洞察用路路口吻，高置信度陈述句，低置信度疑问句

---

## Phase C: 认知地图 + 目标

### TASK-W3-01: 认知地图场景（react-flow）

**复杂度**: XL
**涉及文件**: app/map/page.tsx（新建）, features/cognitive-map/ 目录

1. 安装 react-flow
2. 网状图视图：Cluster 节点 + Bond 连线 + 拖拽/缩放
3. 思维导图视图：经典树形展开
4. 顶部工具栏：视图切换 + 自动布局 + 缩放适配 + 搜索
5. 语义缩放（双击节点展开为日记卡片群）
6. 右栏节点详情（320px）
7. 拖线创建手动 Bond

---

### TASK-W3-02: 目标场景

**复杂度**: L
**涉及文件**: app/goals/page.tsx（新建）, features/goals/ 目录

1. 项目→目标→行动三层嵌套卡片
2. 目标健康度四要素进度条
3. 认知叙事（起点→转折→冲突→悬念）
4. 拖拽归属（目标拖入项目）
5. 右栏详情 360px
6. 未归属目标区域

---

## Phase D: 交互完善

### TASK-W4-01: 行动队列浮层

**复杂度**: M
**涉及文件**: features/actions/components/action-queue.tsx（新建）

1. 右侧边栏 320px
2. 优先级排序行动列表
3. 点击完成 / 右滑稍后 / 长按原因选择
4. 跳过 5 次视觉加重

---

### TASK-W4-02: Tab 涌现结构面板（写作中）

**复杂度**: M
**涉及文件**: features/writing/components/structure-panel.tsx（新建）

1. 写作面板中按 Tab → 右侧滑出 280px 面板
2. 实时 embedding 匹配当前内容 → 显示相关 Cluster + Strike
3. "链接到此结构"按钮
4. 再按 Tab/Esc 收起

---

### TASK-W4-03: 选中呼出工具栏

**复杂度**: S
**涉及文件**: features/writing/components/selection-toolbar.tsx（新建）

1. 选中文字 → 浮出工具栏
2. 🔍相关认知 → 弹窗显示匹配 Strike
3. 💡分析 → 决策工作台
4. 📌创建行动 → 转为 Intend Strike

---

### TASK-W4-04: 全局搜索（Ctrl+K）

**复杂度**: M
**涉及文件**: features/search/components/global-search.tsx（新建）

1. 居中弹窗 520px
2. 搜索日记/主题/目标/人物/命令
3. 结果分类展示
4. 选中跳转

---

### TASK-W4-05: 参谋对话（嵌入式）

**复杂度**: M
**涉及文件**: features/counselor/components/counselor-chat.tsx（新建）

1. 内嵌在触发位置下方，不独占场景
2. 对话头像用路路
3. 引用日记来源可点击跳转
4. 支持 /munger 等思维框架
5. 对话保存为特殊类型日记

---

### TASK-W4-06: 粘贴一切 + 附件处理

**复杂度**: M
**涉及文件**: features/writing/hooks/use-paste-handler.ts（新建）

1. 粘贴图片 → 上传 + 内联显示
2. 粘贴 URL → 链接卡片 + 可选导入
3. 粘贴长文本 → 弹确认"原声/素材"
4. 拖入文件 → 上传 + block 格式
5. 素材降级权重标记

---

## 执行顺序

```
Phase A（品牌+写作）
  W1-01 品牌配色 ──→ W1-02 Logo ──→ W1-03 移动端集成
  W1-04 写作面板 ──→ W1-05 命令面板
  （两条线并行，W1-01 先行）

Phase B（时间线+浮层）
  W2-01 响应式框架 ──→ W2-02 菜单栏 ──→ W2-03 浮层容器
  W2-04 时间线 ──→ W2-05 每日回顾
  （W2-01~03 串行，W2-04 在 W2-03 后开始）

Phase C（地图+目标）
  W3-01 认知地图（XL，最重）
  W3-02 目标场景

Phase D（交互完善）
  W4-01~06 可按需并行
```

**建议从 W1-01 开始**——品牌配色是所有后续视觉工作的基础。

---

*创建时间：2026-03-22*
*状态：待启动 W1-01*
