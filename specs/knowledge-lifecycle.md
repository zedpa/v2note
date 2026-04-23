---
id: "088"
title: "知识生命周期管理"
status: active
domain: cognitive
risk: medium
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-03-30
---
# 知识生命周期管理

> 状态：✅ completed | 优先级：Phase 6 | 预计：3 天

## 概述
Strike 不是永恒真理——事实会过时（"铝价涨了15%" → 实际跌了），立场会变化（"应该换" → "还是不换"）。系统需要自动检测过期和变化，区分 supersede（事实更正）和 evolution（立场演变）。

## 场景

### 场景 1: 过期事实检测
```
假设 (Given)  3 月前 perceive Strike "铝价涨了15%"
并且 (And)    最近 perceive Strike 暗示铝价已跌
当   (When)   maintenance 执行过期扫描
那么 (Then)   旧 Strike → status='superseded', superseded_by=新 Strike ID
并且 (And)    晚间回顾提示确认："铝价信息可能已过时，要更新吗？"
并且 (And)    旧 Strike 不删除（保留认知考古价值）
```

### 场景 2: 立场变化追踪（非矛盾）
```
假设 (Given)  1 月 judge "应该换供应商"
并且 (And)    3 月 judge "还是不换供应商了"
当   (When)   Digest L1 处理新 Strike
那么 (Then)   建立 evolution Bond（非 contradiction）
并且 (And)    旧 Strike salience 不衰减（立场变化是有价值的历史）
并且 (And)    参谋对话中可引用立场变化轨迹
```

### 场景 3: 用户确认/修正 supersede
```
假设 (Given)  系统自动标记旧 Strike 为 superseded
当   (When)   用户不同意（"那个数据还是对的"）
那么 (Then)   撤销 supersede 标记
并且 (And)    旧 Strike 恢复 active 状态
并且 (And)    系统记住偏好，后续不再自动 supersede 该 Strike
```

## 涉及文件
| 文件 | 改动类型 |
|------|---------|
| `gateway/src/cognitive/maintenance.ts` | 修改：新增过期扫描逻辑 |
| `gateway/src/cognitive/digest.ts` | 修改：新 Strike 检测是否 supersede 旧的 |
| `gateway/src/cognitive/alerts.ts` | 修改：新增过期确认 alert |

## 验收标准
旧事实被标记过期时，用户在晚间回顾中收到提示且可确认/撤销。
