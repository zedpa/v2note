## gene_local_config
### 功能描述
本地配置存储层。用户个性化数据（soul、skills、tools、settings）存储在设备本地。

### 详细功能
- 功能1：类型化 get/set 函数（LocalSoul, LocalUser, LocalTools, LocalSkills, LocalSettings）
- 功能2：跨平台存储（Capacitor Preferences / localStorage）
- 功能3：发送录音/聊天时附带 localConfig
- 功能4：首次加载从服务器迁移现有数据
- 功能5：Gateway 优先使用 localConfig，回退到 DB

### 关键文件
- `shared/lib/local-config.ts` — 本地配置存储
- `shared/lib/storage.ts` — 底层存储抽象
- `gateway/src/handlers/process.ts` — localConfig 字段处理
- `gateway/src/handlers/chat.ts` — localConfig 字段处理

### 测试描述
- 输入：在技能页面关闭某技能 → 录音
- 输出：Gateway 使用本地技能配置，被关闭的技能不参与处理
