# 数据库锁与连接池陷阱

> 按需加载：当改动涉及 `pg_advisory_lock`、长事务、Supabase pooler、`gateway/src/cognitive/wiki-compiler`。

## Supabase Transaction Pooler 的锁行为

- **禁止**在 Supabase transaction pooler（端口 6543）上使用 session-level advisory lock（`pg_advisory_lock` / `pg_advisory_unlock`）
  - lock 和 unlock 会被路由到不同后端连接，导致锁永远无法释放
- 必须使用 `pg_try_advisory_xact_lock`（事务级）：
  - 包裹在 BEGIN / COMMIT（或 ROLLBACK）中
  - 事务结束自动释放
- 来源：2026-04-10 wiki-compiler lock 泄漏

## 长事务会被杀

- Supabase Transaction Pooler 会杀死持有超过约 60 秒的事务连接
- **禁止**在事务中执行 AI 调用或其他长时间操作
- 如果需要并发控制，单实例服务使用**进程内 Set/Map 内存锁**替代 DB advisory lock
- 来源：2026-04-11 wiki-compiler 连接被杀
