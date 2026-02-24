# Bug Fix Log — 2026-02-25

## 1. Summary 未保存到数据库 (Bug Fix)
**文件**: `gateway/src/handlers/process.ts`
- AI 处理生成的去口语化 summary 从未写入数据库
- 在 DB write 阶段添加 summaryRepo.create/update 逻辑
- 前端已有 `summary.short_summary` 读取逻辑，无需改动

## 2. Soul 从用户画像改为 AI 身份定义 (Refactor)
**文件**: `gateway/src/soul/manager.ts`, `gateway/src/skills/prompt-builder.ts`, `gateway/Agent.md`(新建)
- soul 提示词改为维护 AI 身份定义（用户对 AI 的要求、行为准则、交互风格等）
- 创建 Agent.md 作为静态 AI 基础行为逻辑
- prompt-builder 加载 Agent.md 替换硬编码人设，soul 标签改为"AI 身份定义"

## 3. 长按多选 + 删除 (New Feature)
**文件**: `features/notes/components/notes-timeline.tsx`
- 500ms 长按进入选择模式
- 选择模式下点击切换选中状态，显示 CheckCircle 图标
- 底部固定工具栏：已选计数、取消、删除按钮
- 复用 useNotes().deleteNotes()

## 4. 头像从右上移到左上 (UI Change)
**文件**: `shared/components/new-header.tsx`
- 交换 flex 容器内头像按钮和搜索栏的顺序

## 5. 复盘界面改造 (UI Redesign)
**文件**: `features/reviews/components/date-selector.tsx`, `features/reviews/components/review-overlay.tsx`
- 移除周期类型选择器、日历选择器、旧快捷键
- 替换为 4 个快捷按钮：近7天、近1月、近半年、全部日记
- 点击直接触发生成，无需额外"生成复盘"按钮
- 在选择阶段添加可折叠的技能开关面板 (SkillsPanel)

## 6. 技能入口迁移 (UI Change)
**文件**: `features/sidebar/components/sidebar-drawer.tsx`, `app/page.tsx`
- 从侧边栏移除技能管理菜单项和 onViewSkills prop
- 从 page.tsx 移除 skills overlay 渲染和 SkillsPage 导入
- 技能管理现在在复盘界面中访问
