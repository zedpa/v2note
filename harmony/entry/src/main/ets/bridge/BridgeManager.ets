import { webview } from '@kit.ArkWeb';
import { DeviceBridge } from './DeviceBridge';
import { AudioBridge } from './AudioBridge';
import { PreferencesBridge } from './PreferencesBridge';
import { StatusBarBridge } from './StatusBarBridge';
import { NotificationBridge } from './NotificationBridge';
import { hilog } from '@kit.PerformanceAnalysisKit';

const TAG = 'BridgeManager';
const DOMAIN = 0x0000;

/**
 * JSBridge 注册管理器
 * 在 WebView 页面加载完成后注入 window.__harmony_bridge__ 对象
 */
export class BridgeManager {
  private deviceBridge: DeviceBridge = new DeviceBridge();
  private audioBridge: AudioBridge = new AudioBridge();
  private preferencesBridge: PreferencesBridge = new PreferencesBridge();
  private statusBarBridge: StatusBarBridge = new StatusBarBridge();
  private notificationBridge: NotificationBridge = new NotificationBridge();

  /**
   * 向 WebView 注入 JSBridge
   * 通过 runJavaScript 在 window 上挂载 __harmony_bridge__ 对象
   */
  inject(controller: webview.WebviewController): void {
    const bridgeScript = `
      (function() {
        // 请求 ID 计数器，用于匹配 Promise 回调
        let _requestId = 0;
        const _pendingRequests = new Map();

        // 原生回调入口，由 ArkTS 侧调用
        window.__harmony_callback__ = function(requestId, result, error) {
          const pending = _pendingRequests.get(requestId);
          if (!pending) return;
          _pendingRequests.delete(requestId);
          if (error) {
            pending.reject(new Error(error));
          } else {
            pending.resolve(result);
          }
        };

        // 通用调用方法
        function callNative(module, method, args) {
          return new Promise((resolve, reject) => {
            const id = ++_requestId;
            _pendingRequests.set(id, { resolve, reject });
            // 通过 URL scheme 通知原生端
            // 原生端在 onUrlLoadIntercept 中捕获
            const payload = JSON.stringify({ id, module, method, args: args || {} });
            window.__harmony_native_call__(payload);
          });
        }

        window.__harmony_bridge__ = {
          device: {
            getId: () => callNative('device', 'getId'),
            getInfo: () => callNative('device', 'getInfo'),
          },
          audio: {
            requestPermission: () => callNative('audio', 'requestPermission'),
            start: (options) => callNative('audio', 'start', options),
            stop: () => callNative('audio', 'stop'),
            getStatus: () => callNative('audio', 'getStatus'),
          },
          preferences: {
            get: (key) => callNative('preferences', 'get', { key }),
            set: (key, value) => callNative('preferences', 'set', { key, value }),
            remove: (key) => callNative('preferences', 'remove', { key }),
          },
          statusBar: {
            init: (options) => callNative('statusBar', 'init', options),
          },
          notification: {
            schedule: (options) => callNative('notification', 'schedule', options),
            cancel: (id) => callNative('notification', 'cancel', { id }),
            cancelAll: () => callNative('notification', 'cancelAll'),
          },
          safeArea: {
            getInsets: () => callNative('safeArea', 'getInsets'),
          },
          system: {
            openUrl: (url) => callNative('system', 'openUrl', { url }),
            getVersion: () => callNative('system', 'getVersion'),
          },
        };

        console.log('[V2Note] HarmonyBridge injected');
      })();
    `;

    try {
      // 注入 bridge 脚本
      controller.runJavaScript(bridgeScript);

      // 注册原生调用处理器
      this.registerNativeCallHandler(controller);

      hilog.info(DOMAIN, TAG, 'JSBridge injected successfully');
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'Failed to inject JSBridge: %{public}s', JSON.stringify(err));
    }
  }

  /**
   * 注册 __harmony_native_call__ 处理器
   * 通过 javaScriptProxy 将原生方法暴露给 WebView
   */
  private registerNativeCallHandler(controller: webview.WebviewController): void {
    // 注册消息处理端口
    controller.runJavaScript(`
      window.__harmony_native_call__ = function(payload) {
        // 通过 prompt() 桥接——HarmonyOS WebView 支持拦截 prompt
        window.prompt('__harmony_bridge__:' + payload);
      };
    `);
  }

  /**
   * 处理来自 WebView 的原生调用请求
   * 在 Web 组件的 onPrompt 回调中调用此方法
   */
  async handleNativeCall(controller: webview.WebviewController, payload: string): Promise<void> {
    try {
      const request = JSON.parse(payload) as {
        id: number;
        module: string;
        method: string;
        args: Record<string, unknown>;
      };

      let result: unknown;

      switch (request.module) {
        case 'device':
          result = await this.deviceBridge.handle(request.method, request.args);
          break;
        case 'audio':
          result = await this.audioBridge.handle(request.method, request.args);
          break;
        case 'preferences':
          result = await this.preferencesBridge.handle(request.method, request.args);
          break;
        case 'statusBar':
          result = await this.statusBarBridge.handle(request.method, request.args);
          break;
        case 'notification':
          result = await this.notificationBridge.handle(request.method, request.args);
          break;
        default:
          throw new Error(`Unknown module: ${request.module}`);
      }

      // 回调成功结果
      const callbackScript = `window.__harmony_callback__(${request.id}, ${JSON.stringify(result)}, null)`;
      controller.runJavaScript(callbackScript);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      hilog.error(DOMAIN, TAG, 'Native call error: %{public}s', error);

      try {
        const request = JSON.parse(payload);
        const callbackScript = `window.__harmony_callback__(${request.id}, null, ${JSON.stringify(error)})`;
        controller.runJavaScript(callbackScript);
      } catch {
        hilog.error(DOMAIN, TAG, 'Failed to send error callback');
      }
    }
  }
}
