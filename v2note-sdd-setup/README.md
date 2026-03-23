# V2Note — Spec-Driven Development 配置指南

## 📦 快速开始

### 1. 把这些文件放入你的 v2note 项目

```bash
# 假设你的项目在 ~/v2note

# 复制核心文件（不覆盖已有文件）
cp CLAUDE.md ~/v2note/
cp vitest.config.ts ~/v2note/
cp tsconfig.json ~/v2note/          # 如果已有，手动合并 paths 部分

# 复制目录
cp -r specs/ ~/v2note/
cp -r scripts/ ~/v2note/
cp -r __tests__/ ~/v2note/
cp -r src/features/ ~/v2note/src/features/

# 给脚本加执行权限
chmod +x ~/v2note/scripts/*.sh
```

### 2. 安装依赖

```bash
cd ~/v2note
npm install vitest @vitest/coverage-v8 --save-dev
```

### 3. 合并 package.json scripts

在你的 `package.json` 的 `scripts` 中加入：

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "verify": "bash scripts/dev-loop.sh",
    "spec:check": "bash scripts/spec-check.sh"
  }
}
```

---

## 🔄 日常工作流

### 写新功能时（完整流程）

```
Step 1  →  复制 specs/_template.md 为 specs/新功能名.md
           用自然语言写场景（Given/When/Then）

Step 2  →  打开 Claude Code，输入：
           "读取 specs/新功能名.md，按照 CLAUDE.md 的规则，
            先生成测试文件，等我确认后再写实现"

Step 3  →  Claude Code 生成测试 → 你审核测试
           （问自己：这些测试通过了，功能就算做完了吗？）

Step 4  →  确认后告诉 Claude Code：
           "测试OK，现在写实现代码，运行测试直到全部通过"

Step 5  →  Claude Code 自动进入循环：
           写代码 → npm test → 失败 → 改代码 → npm test → ...

Step 6  →  全部通过后 Claude Code 会报告结果
```

### 修 bug 时（简化流程）

```
Step 1  →  在对应的测试文件中，添加一个能复现 bug 的测试用例
Step 2  →  告诉 Claude Code：
           "运行 npm test，有一个新增的测试会失败，
            修改实现代码让它通过，但不要破坏其他测试"
```

### 常用命令

```bash
# 运行所有测试
npm test

# 只跑某个功能的测试
npx vitest run voice-to-todo

# 自动循环（失败→重试）
npm run verify

# 只跑某个关键词的测试循环
bash scripts/dev-loop.sh voice

# 检查 spec 覆盖率
npm run spec:check

# 看测试覆盖率报告
npm run test:coverage
```

---

## 📁 文件结构一览

```
v2note/
├── CLAUDE.md                           ← Claude Code 的行为规则
├── vitest.config.ts                    ← 测试框架配置
├── package.json                        ← scripts 命令
├── tsconfig.json                       ← TypeScript 配置
│
├── specs/                              ← 📝 你写的（自然语言需求）
│   ├── _template.md                    ← 新功能模板
│   └── voice-to-todo.md               ← 示例：语音转待办
│
├── __tests__/                          ← 🧪 Claude 生成的（可执行测试）
│   └── features/
│       └── voice-to-todo.test.ts       ← 与 spec 一一对应
│
├── src/
│   └── features/
│       └── voice-to-todo/              ← 💻 Claude 生成的（实现代码）
│           ├── types.ts                ← 类型定义（来自 spec 接口约定）
│           ├── parser.ts               ← 核心实现
│           └── index.ts                ← 导出
│
└── scripts/
    ├── dev-loop.sh                     ← 🔄 自动化验证循环
    └── spec-check.sh                   ← 📋 Spec 覆盖检查
```

---

## 💡 给 Claude Code 的提示词模板

### 开始新功能
```
我要开发 [功能名]。请按照 CLAUDE.md 的 Spec-Driven 流程：
1. 先读 specs/[功能名].md
2. 生成测试文件到 __tests__/features/[功能名].test.ts
3. 等我审核测试后再写实现
```

### 让 Claude Code 自动循环修复
```
运行 npm test，看哪些测试失败了。
根据失败信息修改 src/features/[功能名]/ 下的代码。
修改后重新运行测试，循环直到全部通过。
不要修改测试文件。最多尝试 5 次。
```

### 扩展现有功能
```
我在 specs/voice-to-todo.md 中新增了场景 7。
请在 __tests__/features/voice-to-todo.test.ts 中添加对应测试，
然后修改实现代码让新测试通过，同时不破坏现有测试。
```

---

## ⚙️ 高级：与 GitHub Spec Kit 集成（可选）

如果你还想用 GitHub Spec Kit 的完整工作流：

```bash
# 安装 Spec Kit CLI
pip install uv  # 如果还没装
uvx --from git+https://github.com/github/spec-kit.git specify init v2note

# 在 Claude Code 中使用 Spec Kit 命令
# /specify  — 生成完整规格
# /plan     — 生成技术方案
# /tasks    — 拆解为可执行任务
```

Spec Kit 和本配置可以共存。Spec Kit 管宏观（项目级规格和计划），
我们的 specs/ 目录管微观（功能级场景和测试驱动循环）。
