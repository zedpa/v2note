# 目标粒度处理——快路径 + 慢路径

> 状态：🟡 待开发 | 优先级：Phase 4 | 预计：4-5 天
> 依赖：goals-scaffold, emergence-chain

## 概述
用户说的话粒度差异巨大——"明天打个电话"是行动级，"评估供应商"是目标级，"Q2供应链体系重建"是项目级。系统需要同时处理两种路径：自下而上涌现（慢路径）和自上而下识别（快路径）。

## 场景

### 路径 A: 自下而上涌现（慢路径）

#### 场景 A1: intend 密度超标触发目标涌现
```
假设 (Given)  Cluster "供应链管理" 有 20 个 think Strike
并且 (And)    其中 7 个 polarity='intend'，密度 35% > 阈值 30%
并且 (And)    该 Cluster 无已关联 active goal
当   (When)   周涌现引擎运行
那么 (Then)   AI 审核 7 个 intend Strike 是否指向同一方向
并且 (And)    如果是，创建 goal (status='suggested', source='emerged')
并且 (And)    goal 关联到该 Cluster
```

#### 场景 A2: 手动目标不重复涌现
```
假设 (Given)  用户已手动创建 "评估供应商"（active）
当   (When)   涌现引擎运行发现同方向 intend 密度超标
那么 (Then)   不创建重复的 suggested 目标
并且 (And)    但可能关联更多日记到已有目标
```

### 路径 B: 自上而下识别（快路径）

#### 场景 B1: 行动级意图 → 直接创建 todo
```
假设 (Given)  用户说 "明天记得打给张总"
当   (When)   Digest L1 识别 intend Strike
并且 (And)    AI 判断粒度 = action（单步可完成）
那么 (Then)   创建 todo（不创建 goal）
并且 (And)    向上关联到语义相关的 Cluster/goal（如果有）
```

#### 场景 B2: 目标级意图 → 创建 goal
```
假设 (Given)  用户说 "我要评估是否换供应商"
当   (When)   Digest L1 识别 intend Strike
并且 (And)    AI 判断粒度 = goal（多步才能完成）
那么 (Then)   创建 goal (status='active', source='explicit')
并且 (And)    扫描全量 Cluster 关联语义相关的
并且 (And)    扫描历史日记标记相关记录
并且 (And)    扫描已有 todo 关联到该 goal
```

#### 场景 B3: 项目级意图 → 创建 goal + 子目标建议
```
假设 (Given)  用户说 "Q2要完成供应链体系的重建"
当   (When)   AI 判断粒度 = project（复合方向，需拆解）
那么 (Then)   创建 project 级 goal (source='explicit')
并且 (And)    AI 分析用户历史相关 Cluster
并且 (And)    生成 2-4 个子目标建议（status='suggested', parent_id=父 goal）
并且 (And)    用户可确认/修改/增删子目标
```

## 边界条件
- [ ] 粒度判断模糊（"要好好规划一下"）：默认 goal 级，confidence 标低
- [ ] 频繁创建 goal：同方向已有 active goal 时提示而非新建

## 涉及文件
| 文件 | 改动类型 |
|------|---------|
| `gateway/src/cognitive/digest.ts` | 修改：intend Strike 加粒度判断 |
| `gateway/src/cognitive/emergence.ts` | 修改：intend 密度涌现逻辑 |
| 新建 `gateway/src/cognitive/goal-linker.ts` | 目标创建后全量关联 |
| `gateway/src/db/repositories/goal.ts` | 修改：确认 status/source 字段 |

## AI 调用
- 快路径粒度判断：1 次/条日记（可合并到 Digest L1 的 prompt 中）
- 项目拆解：1 次（创建时）
- 慢路径涌现：1 次/周

## 验收标准
用户说一句话，系统根据粒度自动选择创建 todo / goal / project+子 goal。
