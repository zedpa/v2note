# 路路小鹿 — Rive 动画设计规范

## 概述

路路（Lulu）是念念有路的 AI 伴侣角色，以小鹿为原型。
本文档定义了在 [Rive Editor](https://rive.app/) 中创建 `.riv` 文件的完整规范。

## 文件结构

```
Artboard: "Lulu"
├── State Machine: "LuluStateMachine"
│   ├── Trigger: idle       → 吃草（默认）
│   ├── Trigger: notes      → 整理笔记
│   ├── Trigger: happy      → 晒太阳
│   ├── Trigger: drinking   → 喝饮料
│   ├── Trigger: spacing    → 发呆
│   ├── Trigger: angry      → 生气
│   ├── Trigger: caring     → 心疼
│   ├── Trigger: speaking   → 说话
│   ├── Trigger: thinking   → 思考
│   └── Trigger: running    → 跑来跑去
```

## Artboard 规格

| 属性 | 值 |
|------|-----|
| 尺寸 | 256 × 256 px |
| 背景 | 透明 |
| 帧率 | 60fps（Rive 默认） |

## 色彩系统

| 名称 | 色值 | 用途 |
|------|------|------|
| deer-body | `#C8845C` | 身体主色 |
| deer-dark | `#89502C` | 暗部/鹿角 |
| deer-light | `#D4A574` | 亮部 |
| deer-cream | `#E8C9A8` | 面部/腹部 |
| deer-spot | `#F5E6D3` | 斑点 |
| deer-eye | `#3D2B1A` | 眼睛 |
| deer-nose | `#8B5E3C` | 鼻子 |
| deer-blush | `#E8A87C` | 腮红 |
| antler | `#A06B42` | 鹿角 |

## 10 种状态动画

### 1. idle（吃草）— 默认态
- **循环动画** 1.5-2s
- 头部轻微上下点头（幅度 3-5px），模拟低头吃草
- 耳朵偶尔轻微抖动
- 尾巴缓慢左右摆动
- 全身缓慢呼吸（微缩放 scale 0.98-1.0）

### 2. notes（整理笔记）
- 坐姿，前蹄拿着小本子
- 头部左右看（像在翻笔记）
- 笔记本偶尔翻页动画
- 循环 2s

### 3. happy（晒太阳）
- 趴在地上，身体舒展
- 眼睛弯成 ^_^ 月牙形
- 微笑嘴角上扬
- 右上方有小太阳旋转
- 身体微微起伏（满足感）

### 4. drinking（喝饮料）
- 站立，面前一杯饮料
- 头低下吸饮料的动画
- 杯子上方有蒸汽飘动
- 偶尔抬头舔嘴
- 循环 2s

### 5. spacing（发呆）
- 站立但略微松懈
- 眼睛半闭（眼皮下垂）
- 头上飘出 "..." 气泡
- 偶尔眨眼
- 身体轻微摇晃

### 6. angry（生气）
- 身体膨胀变宽（puffed up）
- 眉毛 V 形
- 头上冒红色蒸汽
- 尾巴竖起僵硬
- 身体轻微颤抖
- 脸颊更红

### 7. caring（心疼）
- 头歪向一侧
- 眼睛柔和、略带忧伤
- 旁边飘出蓝色爱心
- 一只前蹄微微伸出（想安慰的姿态）
- 循环 2s

### 8. speaking（说话）
- 嘴巴张合动画
- 旁边有语音波纹/小横线
- 耳朵竖起（专注态）
- 身体略前倾
- 嘴巴 open-close 0.5s 循环

### 9. thinking（思考）
- 头微微仰起，看向右上方
- 一只前蹄抬起托下巴
- 头上方有思考泡泡（小→中→大三个圈）
- 泡泡中可以有 ✦ 闪烁
- 眼睛看向上方

### 10. running（跑来跑去）
- 四肢交替跑步动画
- 身体前倾
- 后方有 3 条速度线
- 尾巴向后飘
- 快速循环 0.8s

## 状态过渡

- 所有状态间使用 **Fade** 过渡，时长 150ms
- idle 是默认状态（Entry → idle）
- 每个 Trigger 触发后过渡到对应状态
- 各状态的动画循环播放，直到下一个 Trigger 触发

## 适配规格

| 使用场景 | 渲染尺寸 | 说明 |
|---------|---------|------|
| AI Window 头像 | 32px | 最常见，需要在极小尺寸下可辨识 |
| 聊天界面头像 | 24-28px | 气泡旁小头像 |
| 欢迎页/空态 | 80-96px | 居中展示 |
| 登录/注册 | 80px | 品牌标识 |
| 品牌展示 | 128-256px | 完整细节展示 |
| 侧边栏图标 | 18px | 极简，需保持轮廓可辨 |

**关键**：32px 下鹿角不要超过 2 叉，眼睛用实心圆点即可。

## 导出

1. 在 Rive Editor 中完成设计后，导出为 `.riv` 文件
2. 命名为 `lulu-mascot.riv`
3. 放置到项目 `public/lulu-mascot.riv`
4. 组件会自动加载，无需额外配置

## 设计参考

- `docs/brand/lulu-base.png` — Gemini 生成的主品牌 Logo
- `docs/brand/lulu-face-icon.png` — 正面鹿头
- `docs/brand/lulu-sideview.png` — 侧面矢量图
- `components/brand/lulu-logo.tsx` — 现有静态 SVG（色彩和比例参考）
- 风格关键词：温暖、圆润、干净、专业，**不是复古游戏像素风**
