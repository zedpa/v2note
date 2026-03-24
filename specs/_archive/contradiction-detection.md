# 矛盾检测（Contradiction Detection）

> 状态：🟡 待开发

## 概述
扫描近期的 judge/perceive 类型 Strike，通过混合检索的反向极性通道找到潜在矛盾对，再由 AI 判定是否构成真正的矛盾（contradiction）或视角差异（perspective_of）。帮助用户发现自己认知中的冲突和多元视角。

## 场景

### 场景 1: 明确矛盾 → contradiction Bond
```
假设 (Given)  存在 judge Strike A "应该换供应商"
并且 (And)    存在 judge Strike B "不应该换供应商，风险太大"
当   (When)   矛盾检测运行
那么 (Then)   系统应在 A 和 B 之间创建 contradiction Bond
并且 (And)    Bond strength >= 0.8
并且 (And)    created_by = "digest"
```

### 场景 2: 视角差异 → perspective_of Bond
```
假设 (Given)  存在 judge Strike "从成本角度应该换供应商"
并且 (And)    存在 judge Strike "从供应稳定性角度不该换"
当   (When)   矛盾检测运行
那么 (Then)   系统应在两者之间创建 perspective_of Bond
并且 (And)    Bond strength >= 0.6
并且 (And)    非 contradiction（观点出发点不同，不构成直接矛盾）
```

### 场景 3: 语义相近但不矛盾 → 不创建 Bond
```
假设 (Given)  存在 perceive Strike "铝价涨了15%"
并且 (And)    存在 perceive Strike "铜价涨了10%"
当   (When)   矛盾检测运行
那么 (Then)   不应创建 contradiction 或 perspective_of Bond
并且 (And)    AI 判定结果为 "none"
```

### 场景 4: feel 类型排除
```
假设 (Given)  存在 feel Strike "这件事让我很焦虑"
当   (When)   矛盾检测选择候选 Strike
那么 (Then)   feel 类型 Strike 不应参与矛盾检测
```

### 场景 5: 双重去重保护
```
假设 (Given)  Strike A 和 B 之间已存在 contradiction Bond
当   (When)   矛盾检测再次扫描到 A 和 B
那么 (Then)   不应创建重复的 Bond
并且 (And)    使用内存 Set + DB 查询双重去重
```

### 场景 6: 事实更新 → supersede 而非矛盾
```
假设 (Given)  存在 perceive Strike "铝价涨了15%"（较早）
并且 (And)    存在 perceive Strike "铝价实际只涨了8%"（较新）
当   (When)   矛盾检测运行
那么 (Then)   AI 应判定为事实更正
并且 (And)    旧 Strike 标记为 superseded，指向新 Strike
并且 (And)    不创建 contradiction Bond
```

### 场景 7: 无矛盾候选
```
假设 (Given)  数据库中所有 Strike 语义方向一致
当   (When)   矛盾检测运行
那么 (Then)   不应创建任何 Bond
并且 (And)    正常结束，不报错
```

## 边界条件
- [x] 已有 Bond 去重（场景 5）
- [x] feel 排除（场景 4）
- [x] 无候选（场景 7）
- [ ] 同一用户大量 judge Strike（>100）：应限制扫描范围（近 7 天 + 高 salience）
- [ ] AI 服务超时：跳过本轮，下次补扫
- [ ] 矛盾对中一方已被 superseded：不检测已废弃的 Strike

## 接口约定

输入：
```typescript
interface ContradictionScanInput {
  user_id: string
  options?: {
    lookbackDays?: number     // 默认 7
    maxCandidates?: number    // 默认 50
    polarityFilter?: ('judge' | 'perceive')[]  // 默认两者都扫描
  }
}
```

输出：
```typescript
interface ContradictionScanResult {
  success: boolean
  newBonds: ContradictionBond[]
  supersedes: SupersedeAction[]
  stats: {
    candidatesScanned: number
    contradictionsFound: number
    perspectivesFound: number
    supersedesFound: number
    skippedDuplicate: number
  }
}

interface ContradictionBond {
  sourceStrikeId: string
  targetStrikeId: string
  type: 'contradiction' | 'perspective_of'
  strength: number
  reason: string            // AI 给出的判定理由
}

interface SupersedeAction {
  oldStrikeId: string
  newStrikeId: string
  reason: string
}
```

## 依赖
- hybrid-retrieval 模块（Channel B4 反向极性检索）
- AI 服务（判定矛盾 / 视角 / 无关 / supersede）
- strike / bond 表
- daily-cycle.ts 调度器

## 备注
- 与聚类一起在 daily-cycle.ts 中编排，每日 3am 运行
- 矛盾检测的输出直接影响决策工坊（Decision Workshop）的展示
- superseded ≠ 删除，保留认知考古价值
- Phase 3+ 矛盾超过阈值时主动推送提醒给用户
