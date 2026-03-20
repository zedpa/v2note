# ACTIVE_TASKS.md — 前端 P3: Cluster 展开 + 目标状态

> P2 验证通过：认知地图卡片渲染成功
> P3 目标：ClusterDetail 四区域渲染 + 数据丰富 + 截图验证

---

## TASK-P3-01: Seed 丰富的测试数据

**复杂度**: S
**问题**: 当前 cluster 只有 5 个普通成员，没有 contradiction bond、pattern、intend 类 Strike

**具体任务**:
1. 创建脚本，为"供应链管理"cluster 补充：
   - 2 个 contradiction bond（对立观点）
   - 1 个 realize + source_type=inference 的 Strike（认知模式）
   - 2 个 intend 类 Strike（目标）
   - 将新 Strike 加入 cluster_member

---

## TASK-P3-02: ClusterDetail 加载问题修复

**复杂度**: S
**问题**: P2 验证中 ClusterDetail 显示"加载中"但内容没出来，可能是 API 超时

**具体任务**:
1. 检查 cluster-detail.tsx 的 fetchClusterDetail 调用
2. 添加 console.error 打印失败详情
3. 增加超时时间或添加重试

---

## TASK-P3-03: 四区域渲染验证

**复杂度**: M
**前置**: P3-01, P3-02

**具体任务**:
1. 认知模式区：有 pattern 数据时渲染紫色卡片 + 确认按钮
2. 对立观点区：有 contradiction 数据时渲染琥珀色卡片 + "帮我想想"按钮
3. 目标状态区：有 intend 数据时渲染四要素光谱
4. 时间线区：所有成员按日期分组展示
5. Playwright 截图验证

---

## 执行顺序

P3-01 + P3-02 并行 → P3-03 验证
