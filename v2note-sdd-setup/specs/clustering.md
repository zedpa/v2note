# 聚类涌现（Clustering & Emergence）

> 状态：🟡 待开发

## 概述
基于 Strike 之间的 Bond 密度，自动发现认知聚类（Cluster）。聚类不是用户手动创建的分类，而是从认知数据中自然涌现的主题结构。每个 Cluster 本身也是一个 Strike（is_cluster=true），可以参与更高层的涌现。每日 3am 定时执行。

## 场景

### 场景 1: 三角闭合检测 → 种子聚类
```
假设 (Given)  存在 Strike A、B、C，A↔B、B↔C、A↔C 均有 Bond（三角闭合）
并且 (And)    三角密度 > 0.3
当   (When)   聚类算法运行
那么 (Then)   系统应以 A、B、C 为种子创建一个聚类候选
```

### 场景 2: BFS 扩展种子
```
假设 (Given)  种子聚类包含 Strike A、B、C
并且 (And)    Strike D 与种子内 Strike 的连接密度 > 0.2
当   (When)   BFS 扩展执行
那么 (Then)   Strike D 应被纳入聚类
并且 (And)    Strike E（连接密度 < 0.2）不应被纳入
```

### 场景 3: 重叠聚类合并
```
假设 (Given)  聚类 X 包含 {A, B, C, D}，聚类 Y 包含 {C, D, E, F}
并且 (And)    重叠率 = 2/6 > 50%... 不对，重叠率 = 重叠成员 / 较小聚类成员数
当   (When)   聚类去重阶段
那么 (Then)   两个聚类应合并为一个 {A, B, C, D, E, F}
```

### 场景 4: 最小成员数限制
```
假设 (Given)  种子聚类仅包含 2 个 Strike
当   (When)   聚类过滤阶段
那么 (Then)   该聚类应被丢弃（最小 3 个成员）
```

### 场景 5: AI 命名聚类
```
假设 (Given)  聚类包含 Strike: "铝价涨了15%"、"应该换供应商"、"成本对比方案"
当   (When)   AI 为聚类命名
那么 (Then)   生成的聚类 Strike 的 nucleus 应为有意义的概括（如 "供应链成本决策"）
并且 (And)    is_cluster = true
并且 (And)    与每个成员 Strike 建立 cluster_member 关系
```

### 场景 6: material 类型不参与涌现
```
假设 (Given)  存在 source_type = "material" 的 Strike（外部文章提取）
当   (When)   聚类算法运行
那么 (Then)   material Strike 不应作为种子参与三角闭合
并且 (And)    但可以在 BFS 扩展阶段被吸附到已有聚类中
```

### 场景 7: 无足够 Bond 时不聚类
```
假设 (Given)  所有 Strike 之间 Bond 稀疏，无三角闭合
当   (When)   聚类算法运行
那么 (Then)   不应创建任何聚类
并且 (And)    不应抛出错误
并且 (And)    日志记录 "本轮无新聚类产生"
```

## 边界条件
- [x] 无三角闭合（场景 7）
- [x] 不足 3 成员（场景 4）
- [x] material 排除（场景 6）
- [ ] 大量 Strike（>1000 条）：算法应在 30 秒内完成
- [ ] 已有聚类的 Strike 再次被聚到新聚类：允许跨聚类成员
- [ ] 聚类运行中途异常：已创建的聚类应回滚

## 接口约定

输入：
```typescript
interface ClusteringInput {
  user_id: string
  options?: {
    triangleDensityThreshold?: number   // 默认 0.3
    bfsExpandThreshold?: number         // 默认 0.2
    overlapMergeThreshold?: number      // 默认 0.5
    minClusterSize?: number             // 默认 3
  }
}
```

输出：
```typescript
interface ClusteringResult {
  success: boolean
  newClusters: ClusterInfo[]
  mergedClusters: { from: string[]; to: string }[]
  stats: {
    totalStrikesProcessed: number
    trianglesFound: number
    clustersCreated: number
    clustersMerged: number
  }
}

interface ClusterInfo {
  clusterId: string
  nucleus: string          // AI 生成的聚类名称
  memberIds: string[]      // 成员 Strike ID
  memberCount: number
}
```

## 依赖
- strike / bond / cluster_member 表
- AI 服务（聚类命名）
- daily-cycle.ts 调度器

## 备注
- 聚类每日 3am 运行，与矛盾检测、融合、维护一起由 daily-cycle.ts 编排
- 聚类本身是 Strike（is_cluster=true），可参与更高层涌现（Phase 3）
- 重叠率计算：重叠成员数 / min(聚类A成员数, 聚类B成员数)
- 不删除旧聚类，通过 status 追踪生命周期（active → archived）
