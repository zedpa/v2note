# 待办去重（level=0）

## 背景
目前只有目标（level>=1）有 `createWithDedup` 去重保护，普通待办（level=0）在 5 个创建路径上均无去重。

## 核心规则
- 新建 todo 时，先用 embedding 与用户已有未完成 todo 做余弦相似度比较
- 相似度 ≥ 0.65 → 视为重复，返回已有 todo，不创建新记录
- 相似度 < 0.65 → 正常创建
- embedding 获取失败时降级为直接创建（不阻塞）

## 覆盖路径
1. REST `POST /api/v1/todos`
2. AI 工具 `create_todo`
3. 语音动作 `executeCreateTodo`
4. `confirm` 工具 `promote_todo`
5. `todo-projector` Strike 行动级 todo

## 场景

### 场景 1: 相似度 ≥ 0.65 视为重复
Given 用户已有未完成 todo "联系张总确认合同"
When 创建新 todo "联系张总确认合同细节"，embedding 相似度 0.72
Then 返回已有 todo，action = "matched"，不插入新记录

### 场景 2: 相似度 < 0.65 正常创建
Given 用户已有未完成 todo "联系张总确认合同"
When 创建新 todo "去超市买菜"，embedding 相似度 0.15
Then 正常创建新 todo，action = "created"

### 场景 3: 无已有 todo 直接创建
Given 用户无任何未完成 todo
When 创建新 todo
Then 正常创建，action = "created"

### 场景 4: embedding 失败降级
Given embedding 服务不可用
When 创建新 todo
Then 降级直接创建，不报错

### 场景 5: 已完成 todo 不参与去重
Given 用户有已完成 todo "联系张总确认合同"（done=true）
When 创建相同文本的新 todo
Then 正常创建（不与已完成 todo 去重）

## 接口
```typescript
// todo.ts 新增
export async function dedupCreate(
  fields: CreateFields,
): Promise<{ todo: Todo; action: "created" | "matched" }>
```

## 状态: ✅ completed
