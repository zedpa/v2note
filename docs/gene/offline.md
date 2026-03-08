## gene_offline
### 功能描述
离线支持。网络断开时显示离线横幅，本地操作继续可用。

### 详细功能
- 功能1：OfflineBanner 组件显示网络状态
- 功能2：本地配置和缓存数据离线可用
- 功能3：WebSocket 自动重连（3 秒间隔）

### 关键文件
- `shared/components/offline-banner.tsx`
- `shared/hooks/use-network.ts`
- `features/chat/lib/gateway-client.ts`

### 测试描述
- 输入：断开网络
- 输出：显示离线横幅，本地浏览功能正常
