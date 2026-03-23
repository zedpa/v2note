# Bond 维护（Bond Maintenance）

> 状态：🟡 待开发

## 概述
定期对 Bond（认知关系）进行维护：类型标准化、强度衰减、salience 衰减与激活。确保认知网络保持健康——不活跃的关系逐渐弱化，频繁使用的关系持续增强。

## 场景

### 场景 1: Bond 类型标准化
```
假设 (Given)  存在 Bond type 为 "cause"（非标准名称）
当   (When)   维护任务运行
那么 (Then)   Bond type 应被标准化为 "causal"
并且 (And)    其他属性不变
```

### 场景 2: 30 天未使用 Bond 衰减
```
假设 (Given)  存在 Bond，updated_at 距今 30-89 天
当   (When)   strength 衰减执行
那么 (Then)   Bond strength 应乘以 0.9
并且 (And)    updated_at 更新为当前时间
```

### 场景 3: 90 天未使用 Bond 大幅衰减
```
假设 (Given)  存在 Bond，updated_at 距今 >= 90 天
当   (When)   strength 衰减执行
那么 (Then)   Bond strength 应乘以 0.7
```

### 场景 4: 近期活跃 Bond 不衰减
```
假设 (Given)  存在 Bond，updated_at 距今 < 30 天
当   (When)   strength 衰减执行
那么 (Then)   Bond strength 不应变化
```

### 场景 5: Strike salience 衰减
```
假设 (Given)  存在 Strike，30 天内未被引用或使用
当   (When)   salience 衰减执行
那么 (Then)   salience 应乘以 0.95
并且 (And)    salience 最低不低于 0.01（不归零）
```

### 场景 6: Strike 使用时 salience 激活
```
假设 (Given)  用户在前端点击/引用了某个 Strike
当   (When)   salience 激活触发
那么 (Then)   该 Strike 的 salience 应增加 0.1
并且 (And)    salience 最高不超过 1.0
```

### 场景 7: 同义 Bond 类型映射表
```
假设 (Given)  Bond type 为以下任一同义词："cause" / "caused_by" / "leads_to"
当   (When)   类型标准化执行
那么 (Then)   统一映射为 "causal"
```

同义词映射表：
| 标准类型 | 同义词 |
|---------|--------|
| causal | cause, caused_by, leads_to |
| contradiction | contradicts, conflicts, opposes |
| resonance | resonates, similar_pattern, echoes |
| evolution | evolves, evolved_from, develops |
| depends_on | requires, prerequisite, blocks |
| perspective_of | viewpoint, angle |
| abstracted_from | summarizes, generalizes |

## 边界条件
- [ ] Bond strength 衰减到 0 以下：应钳制到 0，可考虑归档
- [ ] 大量 Bond 需要更新（>5000）：应批量处理，避免锁表
- [ ] salience 溢出：钳制在 [0.01, 1.0] 范围
- [ ] 维护期间有新 Bond 写入：不应冲突

## 接口约定

输入：
```typescript
interface MaintenanceInput {
  user_id: string
  options?: {
    dryRun?: boolean          // 仅输出统计，不实际修改
    decayConfig?: {
      tier1Days: number       // 默认 30
      tier1Factor: number     // 默认 0.9
      tier2Days: number       // 默认 90
      tier2Factor: number     // 默认 0.7
    }
    salienceDecayFactor?: number   // 默认 0.95
    salienceMinimum?: number       // 默认 0.01
    salienceBoost?: number         // 默认 0.1
  }
}
```

输出：
```typescript
interface MaintenanceResult {
  success: boolean
  stats: {
    bondsNormalized: number
    bondsDecayed: number
    bondsUnchanged: number
    strikeSalienceDecayed: number
    strikeSalienceBoosted: number
  }
}
```

## 依赖
- strike / bond 表
- daily-cycle.ts 调度器

## 备注
- 每日 3am 由 daily-cycle.ts 编排，在聚类和矛盾检测之后执行
- 衰减参数可配置，但默认值经过设计考量
- dryRun 模式方便调试和验证衰减策略
- 7 组同义词映射覆盖 Phase 1-2 已知的非标准命名
