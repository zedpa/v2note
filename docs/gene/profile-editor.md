## gene_profile_editor
### 功能描述
用户画像/用户信息/工具配置编辑器。三个 tab 页分别展示用户画像（SoulTab，来自服务端 AI 生成）、用户信息和 MCP 工具配置。

### 详细功能
- 功能1：用户画像 tab — 展示 AI 生成的用户画像（SoulTab 组件，支持 markdown 渲染 + 内联编辑）
- 功能2：User tab — 编辑用户名称、简介、特征标签
- 功能3：Tools tab — JSON 编辑器配置 MCP 工具服务器，实时JSON格式校验（绿色/红色提示）
- 功能4：保存到本地配置（用户信息/工具配置），用户画像通过 SoulTab 自带保存

### 关键文件
- `features/profile/components/profile-editor.tsx`
- `features/memory/components/soul-tab.tsx` — 用户画像组件（支持 title prop）
- `shared/lib/local-config.ts`

### 测试描述
- 输入：打开个人画像 → 用户画像 tab 显示 AI 生成的画像内容
- 输出：markdown 格式正确渲染，可点击编辑按钮修改
- 输入：工具配置tab → 输入无效JSON
- 输出：实时显示"JSON格式错误"红色提示
