# v2note 认知引擎演进计划

> **核心使命：链接认知与行动。**
> 不是笔记工具，不是 AI 助手，是个人认知操作系统。

---

## 设计哲学

1. **不预设结构，让结构涌现。** 不画抽屉往里塞，提供原子和连接的能力，结构从数据中长出来。
2. **输入不是我们的核心。** 多模态输入通过社区方案或大模型厂商产品解决（OCR、Vision、ASR、文档解析），我们聚焦消化和建模。
3. **应用层和认知层分离。** 现有的 todo/goal/memory 服务 UI，认知层（strike/bond/cluster）服务深度理解和决策。

---

## 架构总览

```
输入层（多模态，非核心）
  语音 → ASR（已有）
  文字 → 直接（已有）
  图片 → Vision LLM（厂商能力）
  文档/PDF → 解析服务（社区方案）
  会议纪要 → 结构化提取（社区方案）
  网页/剪藏 → 提取（社区方案）
  微信/邮件 → 转发解析（社区方案）
      │
      ▼
处理层
  Process（快速通道）→ 转写清理 + 意图分类 + 入库
      │
      ▼
认知层（核心）
  Digest（消化器）→ Strike 拆解 + Bond 建立
  Emergence（涌现）→ 聚类 + 高阶结构 + 冲突检测
      │
      ▼
应用层（面向 UI）
  record / todo / goal / memory / soul / profile
```

---

## 认知层核心概念：Strike 模型

### 什么是 Strike？

不是"一段内容被存储了"，而是**一次意义发生的最小事件**——一个主体，在一个特定时空状态下，对一个语义内容，产生了一个特定朝向的认知响应。

Strike 有四个不可缺少的组成部分：**内核、极性、场、键。**

---

## Strike 四要素

### 一、内核（Nucleus）：语义负载

"到底说了什么"——经大模型压缩后的最小语义单元。

**拆分示例**：

"我觉得张总说的预算削减30%这件事不太靠谱，上次他也这么说但最后没执行"

拆为三个 Strike：

| # | nucleus | polarity |
|---|---------|----------|
| 1 | 张总宣称预算将削减30% | Perceive |
| 2 | 张总有过言行不一致的先例 | Perceive |
| 3 | 我对这次声称持怀疑态度 | Judge |

每个内核是一次推理就能处理的最小单位。

**更完整的示例**：

"今天和张总开会，他说原材料涨了15%，我觉得我们应该换供应商，但老王反对，他觉得风险太大质量不好保证。回头让小李做个成本对比。"

| # | nucleus | polarity | 说明 |
|---|---------|----------|------|
| 1 | 和张总开了会 | Perceive | 事件感知 |
| 2 | 原材料涨了15%（张总说的） | Perceive | 事实感知，有来源归属 |
| 3 | 我认为应该换供应商 | Judge | 主观判断 |
| 4 | 老王反对换供应商，理由是风险大、质量难保证 | Perceive | 感知他人立场（立场+理由不拆） |
| 5 | 让小李做成本对比 | Intend | 行动意图 |

### 二、极性（Polarity）：认知朝向

同一个语义内核，在不同极性下是完全不同的知识资产。极性是一级字段，不是 tag。

| 极性 | 定义 | 朝向 | 示例 |
|------|------|------|------|
| **Perceive** | 我注意到了一件事 | 外部世界 → 自我 | "铝价又涨了" |
| **Judge** | 我对某事形成了评价 | 自我 → 外部世界 | "这个供应商不靠谱" |
| **Realize** | 我理解了之前不理解的东西 | 内部重组 | "原来根源在工艺不在材料" |
| **Intend** | 我想要实现某个状态 | 现在 → 未来 | "下季度必须把吨成本降到 X 以下" |
| **Feel** | 我产生了情绪反应 | 内在、非理性 | "这件事让我非常不安" |

**为什么极性必须是一级字段**：

极性决定了 Strike 在系统中的行为方式——
- Perceive 可以被验证或推翻
- Judge 只能被支持或反对
- Intend 有完成/未完成状态
- Feel 不应该参与逻辑推理链
- Realize 是认知跃迁，权重最高

如果极性混在 tag 里，后续检索和推理逻辑会到处 if-else。

### 三、场（Field）：时空与状态上下文

每个 Strike 发生时，人处在一个特定的场中。场解释了**为什么同一个人在不同时刻对同一件事会有不同的认知响应。**

| 场维度 | 说明 | 示例 |
|--------|------|------|
| timestamp | 时间戳（必有） | 2026-03-19T14:30 |
| life_phase | 人生阶段 | 创业初期、职业转型期 |
| space | 空间 | 工厂车间、家、旅途中 |
| energy | 精力状态 | 0-1 |
| mood | 情绪基底 | 焦虑期、平静期、亢奋期 |
| social_context | 社会情境 | 独处、会议中、与张总对话 |

**设计原则**：大部分时候只有 timestamp 是确定的，其他字段可以为空或由 agent 推断。结构上预留位置，数据可用时填充，不改 schema。

### 四、键（Bond）：连接潜力

Strike 之所以是原子而不是尘埃，因为它能与其他 Strike 成键。

| 键类型 | 定义 | 示例 |
|--------|------|------|
| **Causal** | A 导致了 B | "铝价上涨" → "我决定找替代材料" |
| **Contradiction** | A 与 B 互相否定 | "张总说不砍预算" vs "张总说砍30%" |
| **Resonance** | 语义不同但指向同一深层模式 | "供应商延迟"+"质检问题"+"新人离职" 共振出"管理系统失灵" |
| **Evolution** | 同一认知在不同时间的演变 | "数字化太难了" → "数字化是唯一出路" |

**键不需要在 Strike 创建时就确定。** Agent 持续运行关联分析，键会随时间不断被发现和更新。

Bond type 采用**软建议列表**策略：常见类型（causal, contradiction, resonance, evolution, supports, context_of, elaborates, triggers, resolves）作为建议，AI 可以使用也可以自创。80% 标准词，20% 突破边界。

### Bond Strength

| strength | 含义 | 例子 |
|----------|------|------|
| 0.9-1.0 | 直接因果/明确矛盾 | "涨价" causes "换供应商" |
| 0.7-0.8 | 强关联 | "张总说成本压力" supports "原材料涨价" |
| 0.4-0.6 | 可能相关 | "上周开会" context_of "讨论供应链" |
| 0.1-0.3 | 弱关联/跨域联想 | 隐性联系 |

**Strength 会演化**：长期没被新 Strike 加强的 bond 逐渐衰减；反复出现的因果关系 strength 上升。

### 补充 Bond 类型

在软建议列表中追加两个高价值类型：

| 类型 | 定义 | 场景 |
|------|------|------|
| **depends_on** | A 的执行前提是 B | "让小李做成本对比" depends_on "小李下周在"。行动转化场景的关键依赖链 |
| **perspective_of** | A 和 B 是对同一件事的不同视角 | "我认为应该换" 和 "老王认为不该换"——不只是 contradiction，还共享同一议题。决策支持时可自动生成"关于 X 议题的各方观点汇总" |

完整软建议列表：`causal, contradiction, resonance, evolution, supports, context_of, elaborates, triggers, resolves, depends_on, perspective_of, abstracted_from`

---

## Strike 生命周期

Strike 不只有出生和连接。它们会死亡、变异和融合。

### 状态机

```
active → superseded → archived
```

| 状态 | 含义 | 触发条件 |
|------|------|---------|
| **active** | 当前有效 | 创建时默认 |
| **superseded** | 被新信息取代 | 事实被修正、判断被推翻 |
| **archived** | 不再活跃但保留 | 长期无关联、手动归档 |

**superseded 不是删除。** "原材料涨了15%" 三个月后证实是张总记错了，实际涨了8%。原 Strike 标记为 superseded，`superseded_by` 指向新 Strike。它参与过的决策链保持完整——这是认知考古学。

### 融合（Promote）

当多个 Strike 本质上在说同一件事——"供应商延迟了"、"又延迟了"、"第三次延迟"——Level 2 不只是被动聚类，还应**主动提升（Promote）**：

1. 识别出这组 Strike 指向同一个更高阶的认知
2. 创建一个新 Strike（is_cluster=true）："供应商存在系统性交期问题"
3. 新 Strike 与每个底层 Strike 之间建 `abstracted_from` bond
4. 底层 Strike 保留为证据链，不归档

这和被动 Cluster 的区别：Cluster 是"这些东西经常一起出现"（拓扑发现），Promote 是"这些东西**本质上是同一个更深层认知**"（语义提升）。Promote 产生的 Strike 有自己的 nucleus 和 polarity，它是一等公民，能参与后续的推理和决策。

### 演化 vs 新建

"我觉得应该换供应商"（Judge，低确信） → 一周后 → "我决定换供应商"（Intend，高确信）

**创建两个 Strike，加一条 evolution bond。** 不是修改同一个。保留认知变化的轨迹，Level 2 做反思时能看到"这个人是怎么从犹豫走向确定的"。

### 元属性

| 属性 | 说明 |
|------|------|
| confidence | 这个人对此有多确信（0-1） |
| salience | 当前活跃度（会随时间衰减，被引用时回升） |
| source | voice / text / import / inference（来源类型） |

---

## 认知层数据模型（Schema）

### strike 表

```sql
CREATE TABLE strike (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES app_user(id),

  -- 内核
  nucleus TEXT NOT NULL,                 -- 最小语义单元

  -- 极性（一级字段，不是 tag）
  polarity TEXT NOT NULL CHECK (polarity IN ('perceive', 'judge', 'realize', 'intend', 'feel')),

  -- 场（JSON，按需填充，不改 schema）
  field JSONB DEFAULT '{}',              -- {timestamp, life_phase?, space?, energy?, mood?, social_context?}

  -- 来源
  source_id UUID REFERENCES record(id),  -- 来自哪条记录
  source_span TEXT,                      -- 原文中的具体位置
  source_type TEXT DEFAULT 'voice',      -- voice / text / import / inference

  -- 元属性
  confidence REAL DEFAULT 0.5,           -- 确信度 0-1
  salience REAL DEFAULT 1.0,             -- 活跃度（衰减+回升）
  embedding VECTOR(1024),                -- 语义向量

  -- 生命周期
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'archived')),
  superseded_by UUID REFERENCES strike(id),

  -- 涌现
  is_cluster BOOLEAN DEFAULT FALSE,      -- cluster 也是 strike

  created_at TIMESTAMPTZ DEFAULT now(),
  digested_at TIMESTAMPTZ
);

CREATE INDEX idx_strike_user ON strike(user_id);
CREATE INDEX idx_strike_polarity ON strike(user_id, polarity);
CREATE INDEX idx_strike_status ON strike(user_id, status);
CREATE INDEX idx_strike_source ON strike(source_id);
```

### bond 表

```sql
CREATE TABLE bond (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_strike_id UUID NOT NULL REFERENCES strike(id) ON DELETE CASCADE,
  target_strike_id UUID NOT NULL REFERENCES strike(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                    -- causal, contradiction, resonance, evolution, supports, ...
  strength REAL DEFAULT 0.5,             -- 0-1（会演化）
  created_by TEXT DEFAULT 'digest',      -- digest / user / emergence
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bond_source ON bond(source_strike_id);
CREATE INDEX idx_bond_target ON bond(target_strike_id);
CREATE INDEX idx_bond_type ON bond(type);
```

### tag 表

```sql
CREATE TABLE strike_tag (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strike_id UUID NOT NULL REFERENCES strike(id) ON DELETE CASCADE,
  label TEXT NOT NULL,                   -- AI 生成或用户手动
  confidence REAL DEFAULT 0.8,
  created_by TEXT DEFAULT 'digest',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tag_strike ON strike_tag(strike_id);
CREATE INDEX idx_tag_label ON strike_tag(label);
```

### cluster 成员表

```sql
CREATE TABLE cluster_member (
  cluster_strike_id UUID NOT NULL REFERENCES strike(id) ON DELETE CASCADE,
  member_strike_id UUID NOT NULL REFERENCES strike(id) ON DELETE CASCADE,
  PRIMARY KEY (cluster_strike_id, member_strike_id)
);
-- cluster 的 label/description 存在 strike.nucleus 中
-- cluster 的 embedding 是成员的聚合向量
```

### record 扩展

```sql
ALTER TABLE record ADD COLUMN digested BOOLEAN DEFAULT FALSE;
ALTER TABLE record ADD COLUMN digested_at TIMESTAMPTZ;
```

---

## Digest 管道（三层级）

### Level 1: Strike 拆解（高频）

**触发**：
- 路径 A：Process 完成后判断深度内容（reflection/goal/complaint + 文本>80字）→ 立即触发
- 路径 B：Cron 每 3 小时 → 查 undigested 记录 → 批量触发

**一次 Digest 调用的完整流程**：
1. 加载待消化记录的 summary + 原文
2. AI 拆解为 Strike（nucleus + polarity + confidence）
3. AI 输出同记录内 Strike 之间的 bond
4. 为每个 Strike 生成 embedding
5. **混合检索**历史 Strike（不只是 embedding 相似度）：
   - 通道 A：embedding 语义搜索 top-5（找语义相近的）
   - 通道 B：结构化查询——同 tag 的 Strike、涉及同一人物的、同时间窗口的、同极性反向的（找逻辑相关但语义可能很远的）
   - 通道 C（Phase 2 后可用）：cluster 层面检索——先找相关 cluster，再在 cluster 内部找具体 Strike
   - 三通道结果合并去重，取 top-10
6. 将新 Strike + 命中的历史 Strike 一起给 AI，判断跨记录 bond
7. 同时判断：是否有历史 Strike 应被 superseded
8. 写入 strike / bond / strike_tag 表
9. 同步更新应用层（memory/goal 等）
10. 标记 record.digested = true

**Digest prompt 核心指令**：

```
将以下内容拆解为 Strike（认知触动）。

每个 Strike 包含：
- nucleus: 能被独立理解的最小语义单元。包含足够的上下文（谁、什么、何时），
  保留原文的不确定性和归属。
- polarity: perceive（感知）| judge（判断）| realize（领悟）| intend（意欲）| feel（感受）
- confidence: 0-1，这个人对此有多确信
- tags: 自由标签数组

同时输出 Strike 之间的 bond：
- type: 自由命名（常见：causal, contradiction, resonance, evolution, supports,
  context_of, elaborates, triggers, resolves）
- strength: 0-1

如果某个新 Strike 修正或取代了已有 Strike，标注 supersedes: <id>。
```

### Level 2: 关联聚类 + 矛盾检测 + 融合（每日）

**触发**：每日 cron（凌晨或用户空闲时段）

**职责**：

**2a. 聚类**
1. 扫描最近 Strike 的 bond 拓扑
2. 发现连接密集区域（三角闭合度高）→ 尝试聚类
3. 创建新 cluster（is_cluster=true 的 Strike）或将 Strike 归入已有 cluster
4. AI 为 cluster 命名和生成描述（存入 nucleus）
5. 计算 cluster 聚合 embedding
6. cluster 之间建 bond

**2b. 主动矛盾扫描**
1. 取最近新增的 Judge / Perceive 类 Strike
2. 专门搜索**同主题但极性相反**的历史 Strike（不是搜相似，是搜对立）
3. AI 判断是否构成真正矛盾（vs 只是不同视角 perspective_of）
4. 确认的矛盾 → 建 contradiction bond + 可选推送给用户

矛盾是认知管理中最高价值的信号——一个人同时持有两个矛盾信念而不自知，正是 agent 最能帮上忙的地方。

**2c. 融合（Promote）**
1. 在聚类结果中识别"本质说同一件事"的 Strike 组
2. 为其创建更高阶 Strike（Promote），建 abstracted_from bond
3. 底层 Strike 保留为证据链

**2d. 维护**
1. 归一化 bond type（合并同义：causes/caused_by/leads_to → causal）
2. 衰减长期未被加强的 bond strength
3. 衰减长期未被引用的 Strike salience

### Level 3: 涌现（每周）

**触发**：每周 cron 或手动触发

**职责**：
1. 扫描 cluster 间的 bond → 发现更高阶结构
2. 检测 cluster 演化（增长？萎缩？分裂？合并？）
3. 检测跨 cluster 冲突（contradiction bond 连接不同 cluster 的成员）
4. 提炼认知模式（用户反复出现的决策风格、思维习惯）
5. 发现 resonance：表面不同但深层相关的 cluster
6. 更新 cluster 描述和标签
7. 可选：生成周报推送给用户

---

## 涌现层级类比

| 层级 | 对应 | 说明 |
|------|------|------|
| 原子 | Strike | 一次认知触动 |
| 分子 | 小 cluster | 几个有因果/共振键的 Strike 聚合（"那次项目失败的完整故事"） |
| 细胞 | 大 cluster | 多个叙事片段构成认知模块（"我对供应链管理的整套理解"） |
| 器官 | cluster 的 cluster | 多个认知模块构成人生领域（"我的职业"、"我的家庭"） |
| 有机体 | 全图 | 所有领域的动态整体 = 这个人 |

每一层都是下一层的涌现。系统只需要把最底层的 Strike 做对，上面的结构会自己长出来。

---

## 输出能力（基于认知图谱）

| 场景 | 用户触发 | 系统行为 |
|------|---------|---------|
| 决策辅助 | "帮我想想要不要换供应商" | 图谱遍历：召回所有相关 Strike + cluster，用用户自己的认知模式分析，每个论据标注来源 Strike ID |
| 人物画像 | "张总是什么人" | 聚合张总 cluster 下所有交互、评价、事件 |
| 项目回顾 | "v2note 这三个月" | 项目 cluster 全量召回，自动生成时间线 |
| 模式洞察 | "我最近有什么问题" | Level 3 涌现结果：行为模式 + 情绪趋势 + 目标偏移 |
| 冲突预警 | 主动推送 | "你说想早睡，但最近 2 周凌晨 1 点还在录音"（cluster 间 contradiction） |
| 认知统计 | "我是什么样的人" | 极性分布（偏观察还是偏行动）、Realize 滞后 Perceive 多久（消化速度）、共振键最强的领域 |

---

## 质量校验回路

整个系统的地基是 Digest 的原子化质量。如果 AI 拆得不好——太碎、丢语气、归属标错——后面所有 bond 和 cluster 都建在错误基础上。

### 轻量方案（Phase 1）

Digest 完成后，在前端以简洁方式展示结果（Strike 数量 + 关键词摘要 + 极性分布），给用户一个纠错入口。不是让用户校对每个 Strike，而是让用户说"不对，我那句话的意思不是这样"。

**交互设计**：
- 录音卡片展开后，增加一行"认知提取：3 个感知 / 1 个判断 / 1 个意图"
- 点击展开可以看到具体 Strike 列表
- 用户可以直接修改 nucleus、改极性、合并/拆分 Strike
- 用户修改 → 对应 bond 的 created_by 标记为 "user"（权重高于 digest）

### 自我改进闭环（Phase 3+）

积累足够多的"用户纠正"数据后：
1. 分析纠正模式（AI 经常在哪类内容上犯什么错）
2. 生成针对性的 few-shot examples 追加到 Digest prompt
3. 形成 prompt 的自动演化——系统越用越准

---

## 实施路线

### Phase 1: Digest 基础 + Strike 模型
- [ ] 创建 strike / bond / strike_tag / cluster_member 表
- [ ] record 表加 digested 字段
- [ ] 实现 digest.ts Level 1（Strike 拆解 + Bond 建立）
- [ ] 混合检索：embedding 通道 A + 结构化查询通道 B
- [ ] Process 深度判断 → 立即触发
- [ ] 3h cron 批量触发
- [ ] 现有 maybeCreateMemory / updateSoul / updateProfile 收拢进 Digest
- [ ] Strike embedding 生成 + 跨记录语义搜索
- [ ] 前端轻量质量展示（Strike 摘要 + 纠错入口）

### Phase 2: 聚类 + 涌现基础
- [ ] Level 2 每日 cron（聚类算法：三角闭合度检测）
- [ ] Cluster 创建 + AI 命名
- [ ] Cluster 也是 Strike 的循环引用实现
- [ ] Promote（融合）机制：识别 + 提升 + abstracted_from bond
- [ ] 主动矛盾扫描（同主题反向极性检索）
- [ ] 混合检索通道 C 上线（cluster 层面检索）
- [ ] Bond type 归一化
- [ ] Strength 衰减 + 加强机制
- [ ] Salience 衰减机制

### Phase 3: 高阶涌现 + 决策输出
- [ ] Level 3 每周 cron（高阶结构）
- [ ] 决策分析模式（chat mode="decision"）
- [ ] 溯源标注（Strike ID → 原始记录跳转）
- [ ] 冲突检测 + 主动推送
- [ ] 认知统计（极性分布、消化速度等）
- [ ] Digest prompt 自我改进闭环（用户纠正 → few-shot 演化）

### Phase 4: 多模态输入扩展
- [ ] 图片输入 → Vision LLM → Digest
- [ ] 文档/PDF → 解析 → Digest
- [ ] 集成社区方案或厂商 API，只做对接层

---

## 与现有代码的关系

**保留**：Process pipeline、应用层表（record/todo/goal/memory/soul/profile）、前端 UI
**新增**：认知层表（strike/bond/strike_tag/cluster_member）、digest.ts、emergence cron
**改造**：Process 末尾触发逻辑、chat.ts 新增 decision 模式
**渐进替代**：memory 表的职责逐渐被 strike+cluster 吸收，但不急于删除

---

*最后更新：2026-03-19*
*状态：Strike 模型已定义，待确认后启动 Phase 1*
