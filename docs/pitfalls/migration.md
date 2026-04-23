# 数据迁移 / 身份迁移陷阱

> 按需加载：当改动涉及 `supabase/migrations/`、DROP TABLE、身份体系迁移（deviceId/userId 等）、JWT/认证链路。

## DROP TABLE 后必须全局清理 SQL

- DROP TABLE migration 提交后，**必须**全局搜索以下模式清理所有代码引用：
  - `FROM <table_name>`
  - `INTO <table_name>`
  - `UPDATE <table_name>`
  - `JOIN <table_name>`
  - `DELETE FROM <table_name>`
- 不能只修触发报错的路径
- 低频调用路径（定时任务、侧边栏、认知引擎）的残留 SQL 会在后续运行时爆炸
- 来源：2026-04-12 fix-record-delete-strike（strike 表删除后 11 处 SQL 残留）

## 身份体系迁移必须覆盖全链路

身份迁移（如 deviceId→userId）必须同步覆盖所有层：

1. **JWT 签发**：token 载荷字段
2. **WS 认证**：WebSocket 握手校验
3. **Session 管理**：session 存储 key
4. **HTTP 路由层**：helper 函数（如 `getDeviceId`）必须同步替换，否则大量路由返回 401
5. **DB Schema**：列的 NOT NULL 约束必须同步迁移
6. **编译部署**：修改 gateway 代码后必须 `pnpm build` 并重启服务

遗漏任一层会在不同时机爆炸。

来源：2026-04-13 fix-device-id-cleanup
