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
