# source_type 权重全链路落地

> 状态：⚠️ 部分完成（retrieval降权✅，clustering未过滤material）| 优先级：Phase 1
> ⚠️ batch-analyze-prompt中未过滤material Strike参与聚类种子

## 概述
Ingest 层区分了 think/material，retrieval.ts 已实现 material ×0.2 降权，但 clustering 和 emergence 管道中 material Strike 未被过滤。一份 50 页 PDF 会产出几十个高权重 Strike，直接污染 Cluster 结构和认知地图。同时需要统一 cluster_member 存储方式（migration 017 建了 cluster_member 表，但代码用 bond.type='cluster_member'）。

## 前置条件：统一 cluster_member 存储

### 场景 0: 统一 Cluster 成员存储方式
```
假设 (Given)  clustering.ts 使用 bond.type='cluster_member' 存储成员关系
并且 (And)    migration 017 创建的 cluster_member 表实际未被使用
当   (When)   执行存储统一
那么 (Then)   选择一种方式并全量迁移（建议保留 bond 方式，废弃 cluster_member 表）
并且 (And)    所有 clustering/emergence/retrieval 中的成员查询统一为同一方式
并且 (And)    新 migration 标注 cluster_member 表为 deprecated
```

## 场景

### 场景 1: Digest L1 正确传递 source_type 到 Strike
```
假设 (Given)  一条 source_type='material' 的 record 被 Digest
当   (When)   digest.ts 拆解出 Strike 并写入数据库
那么 (Then)   Strike.source_type = 'material'
并且 (And)    Strike.salience <= 0.2（正常 think 的 1/5）
```

**当前状态：** digest.ts 中 Strike 创建时 source_type 字段已传递，但 salience 计算逻辑需确认。

### 场景 2: 混合检索降权 material Strike（已实现，确认行为）
```
假设 (Given)  检索候选含 3 个 think Strike 和 2 个 material Strike
当   (When)   retrieval.ts 计算综合得分
那么 (Then)   material Strike 的得分 × 0.2
并且 (And)    最终排序中 material 排在同分 think 之后
```

**当前状态：** ✅ retrieval.ts line 320-324 已实现。本场景为确认测试。

### 场景 3: 聚类排除 material 作为种子
```
假设 (Given)  clustering.ts 计算三角闭合密度
当   (When)   判断候选 Strike 是否参与三角闭合
那么 (Then)   source_type='material' 的 Strike 不参与三角密度计算
并且 (And)    material Strike 可在 BFS 扩展阶段被吸附到已有 Cluster
并且 (And)    但吸附不影响 Cluster 是否成立的判定
```

### 场景 4: 目标涌现只统计 think Strike
```
假设 (Given)  emergence.ts 检测 Cluster 中 intend 极性密度
当   (When)   判断是否触发目标涌现
那么 (Then)   只统计 source_type='think' 且 polarity='intend' 的 Strike
并且 (And)    material 来源的 intend 不计入密度
```

### 场景 5: 认知统计分离 think/material
```
假设 (Given)  cognitive-stats 端点被请求
当   (When)   计算极性分布、领悟频率等
那么 (Then)   主统计只基于 think Strike
并且 (And)    可选参数 include_material=true 时返回 material 独立统计作为参考
```

## 边界条件
- [x] 检索降权（场景 2，已实现）
- [ ] 用户切换 source_type 后重新 Digest：旧 Strike 的 salience 应更新
- [x] 100% material 的 Cluster：不应存在（因为 material 不参与种子计算）

## 涉及文件
| 文件 | 改动类型 |
|------|---------|
| `gateway/src/cognitive/clustering.ts` | 修改：三角闭合过滤 material |
| `gateway/src/cognitive/emergence.ts` | 修改：intend 密度过滤 material |
| `gateway/src/cognitive/retrieval.ts` | 确认测试（已实现） |
| `gateway/src/cognitive/digest.ts` | 确认 salience 计算 |
| `gateway/src/routes/cognitive.ts` | 修改：stats 端点加 include_material 参数 |
| 新 migration | cluster_member 表 deprecation 标注 |

## 数据库变更
- 确认 strike.source_type 字段存在且有值（migration 018 已加在 record 上，strike 上需确认）
- cluster_member 表标注 deprecated（新 migration 加 comment）

## AI 调用
0 次（纯逻辑修改）

## 验收标准
拖入一份 PDF 后，认知地图的 Cluster 分布不受显著影响。对比测试：相同 think 日记 + 有/无 PDF，Cluster 结构应一致。
