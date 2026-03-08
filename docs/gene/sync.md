## gene_sync
### 功能描述
数据同步。本地数据与服务器之间的同步机制。

### 详细功能
- 功能1：设备注册和身份管理
- 功能2：笔记/待办/灵感通过 REST API 同步
- 功能3：标签同步（fire-and-forget）

### 关键文件
- `features/workspace/lib/sync.ts`
- `shared/lib/api/*.ts`
- `gateway/src/routes/sync.ts`

### 测试描述
- 输入：离线创建笔记 → 恢复网络
- 输出：数据自动同步到服务器
