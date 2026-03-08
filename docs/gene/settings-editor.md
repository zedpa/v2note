## gene_settings_editor
### 功能描述
/settings 命令触发的设置编辑器，由 JSON schema 驱动界面生成。底部额外包含 Gateway 服务器地址配置（非 schema 驱动，独立实现）。

### 详细功能
- 功能1：JSON schema 定义设置项（类型、选项、默认值）
- 功能2：自动生成 toggle/select/number 控件
- 功能3：设置保存到本地配置（LocalSettings）
- 功能4：主题切换实时生效
- 功能5：Gateway 地址配置——文本输入框，保存到 localStorage，安卓/iOS 用户填写局域网或公网地址替代编译时 localhost
- 功能6：ASR 模式切换——select 控件选择「实时识别」或「录后识别」，支持 optionLabels 显示中文说明

### 关键文件
- `features/settings/components/settings-editor.tsx`
- `features/settings/lib/settings-schema.json`
- `shared/lib/local-config.ts`
- `shared/lib/gateway-url.ts` — Gateway URL 运行时管理

### 测试描述
- 输入：输入 /settings → 切换主题为 dark
- 输出：界面即时切换为深色主题，设置持久化
- 输入：输入 /settings → 修改 Gateway 地址为 ws://192.168.1.100:3001 → 重启
- 输出：所有 API 和 WebSocket 连接使用新地址
