## gene_tag_system
### 功能描述
标签管理系统。AI 处理时仅从已有标签中匹配，不再创建新标签。Header 标签筛选 UI 已移除。

### 详细功能
- 功能1：标签存储在数据库 tag 表
- 功能2：AI 处理时通过 existingTags 列表限制标签选择
- 功能3：gateway tagRepo.findByName() 查询而非 upsert()
- 功能4：NoteDetail 中仍可手动编辑标签
- 功能5：标签同步到本地和服务器

### 关键文件
- `gateway/src/db/repositories/tag.ts`
- `features/tags/hooks/use-tags.ts`
- `features/tags/lib/tag-manager.ts`

### 测试描述
- 输入：录音提到"工作"（已有标签）和"新标签"（不存在）
- 输出：仅关联"工作"标签，不创建"新标签"
