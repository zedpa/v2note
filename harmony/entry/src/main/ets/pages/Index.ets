import { webview } from '@kit.ArkWeb';
import { BridgeManager } from '../bridge/BridgeManager';
import { hilog } from '@kit.PerformanceAnalysisKit';

const TAG = 'V2Note';
const DOMAIN = 0x0000;

@Entry
@Component
struct Index {
  private webController: webview.WebviewController = new webview.WebviewController();
  private bridgeManager: BridgeManager = new BridgeManager();

  aboutToAppear(): void {
    // 启用 WebView 调试（开发模式）
    webview.WebviewController.setWebDebuggingAccess(true);
  }

  build() {
    Column() {
      Web({ src: $rawfile('index.html'), controller: this.webController })
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .mediaPlayGestureAccess(true)
        .mixedMode(MixedMode.All)
        .onPageEnd(() => {
          hilog.info(DOMAIN, TAG, 'WebView page loaded');
          // 注入 JSBridge
          this.bridgeManager.inject(this.webController);
        })
        .onPrompt((event) => {
          // JSBridge 核心通道：拦截 prompt() 调用，转发到原生处理
          if (event?.message?.startsWith('__harmony_bridge__:')) {
            const payload = event.message.substring('__harmony_bridge__:'.length);
            this.bridgeManager.handleNativeCall(this.webController, payload);
            event.result.handlePromptConfirm('');
            return true; // 已处理，不弹出 prompt 对话框
          }
          return false; // 非桥接调用，使用默认 prompt 行为
        })
        .onErrorReceive((event) => {
          if (event) {
            hilog.error(DOMAIN, TAG, 'WebView error: %{public}s', event.error.getErrorInfo());
          }
        })
        .width('100%')
        .height('100%')
    }
    .width('100%')
    .height('100%')
  }
}
