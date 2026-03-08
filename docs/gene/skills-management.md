## gene_skills_management
### 功能描述
技能管理系统。技能分为两类：**复盘视角**（review）和**处理技能**（process）。复盘视角在复盘对话时单选使用，处理技能在录音处理时多选启用。支持完整的 CRUD 操作（创建/编辑/删除自定义技能）。AI 可通过 create_skill 工具自动创建复盘视角。

### 技能分类
- **review（复盘视角）**：复盘对话时可选择一个视角引导 AI 分析。内置：元问题视角、二阶思考视角。用户可自定义。
- **process（处理技能）**：录音处理时按 extract_fields 提取结构化数据。内置：todo-extract、customer-request、setting-change。

### 详细功能
- 功能1：/skills 独立页面，两段式布局（复盘视角 + 处理技能）
- 功能2：复盘视角支持新建/编辑/删除，内置视角仅显示 badge 不可删除
- 功能3：处理技能使用 Switch 开关启用/停用
- 功能4：review-overlay 中 RadioGroup 单选复盘视角（无视角/各review技能）
- 功能5：本地存储技能配置 + selectedReviewSkill（首次从服务器迁移）
- 功能6：自定义技能持久化到 custom_skill 表（DB + API）
- 功能7：process.ts 仅加载 type=process 技能，chat.ts 按 selectedReviewSkill 加载单个 review 技能

### 关键文件
- `features/skills/components/skills-page.tsx` — 两段式技能管理页（CRUD）
- `features/reviews/components/review-overlay.tsx` — RadioGroup 复盘视角选择
- `gateway/src/skills/types.ts` — SkillType, type/builtin 字段
- `gateway/src/skills/loader.ts` — loadSkills, mergeWithCustomSkills, filterActiveSkills(type)
- `gateway/src/db/repositories/custom-skill.ts` — 自定义技能 CRUD
- `gateway/src/routes/skills.ts` — GET/POST/PUT/DELETE API
- `shared/lib/local-config.ts`（LocalSkillConfig 含 type/prompt/builtin）
- `shared/lib/api/skills.ts` — createSkill, updateSkill, deleteSkill
- `supabase/migrations/008_custom_skill.sql` — custom_skill 表

### 测试描述
- 输入：打开 /skills → 看到"复盘视角"和"处理技能"两个区域
- 输出：review 区域显示元问题视角、二阶思考视角（内置）；process 区域显示 todo-extract 等（开关）
- 输入：点击"新建" → 填写名称和提示词 → 保存
- 输出：新视角出现在列表中，可在 review-overlay 中选择
- 输入：打开复盘 → 选择某个复盘视角 → 生成复盘
- 输出：AI 使用选定视角引导复盘对话
