import { webview } from '@kit.ArkWeb';
import { window as windowManager } from '@kit.ArkUI';
import { bundleManager, common, Want } from '@kit.AbilityKit';
import { DeviceBridge } from './DeviceBridge';
import { AudioBridge } from './AudioBridge';
import { PreferencesBridge } from './PreferencesBridge';
import { StatusBarBridge } from './StatusBarBridge';
import { NotificationBridge } from './NotificationBridge';
import { hilog } from '@kit.PerformanceAnalysisKit';

const TAG = 'BridgeManager';
const DOMAIN = 0x0000;

interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface NativeCallRequest {
  id: number;
  module: string;
  method: string;
  args: Record<string, Object>;
}

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

        // 通用调用方法（含 10 秒超时）
        function callNative(module, method, args) {
          return new Promise((resolve, reject) => {
            const id = ++_requestId;
            const timer = setTimeout(() => {
              _pendingRequests.delete(id);
              reject(new Error('Bridge call timeout: ' + module + '.' + method));
            }, 10000);
            _pendingRequests.set(id, {
              resolve: (v) => { clearTimeout(timer); resolve(v); },
              reject: (e) => { clearTimeout(timer); reject(e); },
            });
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
            startStream: () => callNative('audio', 'startStream'),
            stop: () => callNative('audio', 'stop'),
            cancel: () => callNative('audio', 'cancel'),
            getData: (offset, length) => callNative('audio', 'getData', { offset, length }),
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
      // 传递 context 给 AudioBridge（用于权限请求）
      try {
        const ctx = getContext() as common.UIAbilityContext;
        this.audioBridge.setContext(ctx);
      } catch (e) {
        hilog.warn(DOMAIN, TAG, 'Failed to set context for AudioBridge: %{public}s', String(e));
      }

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

  /** safeArea 模块处理 */
  private async handleSafeArea(method: string): Promise<SafeAreaInsets> {
    if (method === 'getInsets') {
      try {
        const win = await windowManager.getLastWindow(getContext() as common.UIAbilityContext);
        const avoidArea = win.getWindowAvoidArea(windowManager.AvoidAreaType.TYPE_SYSTEM);
        const insets: SafeAreaInsets = {
          top: avoidArea.topRect.height,
          bottom: avoidArea.bottomRect.height,
          left: avoidArea.leftRect.width,
          right: avoidArea.rightRect.width,
        };
        return insets;
      } catch {
        const fallback: SafeAreaInsets = { top: 0, bottom: 0, left: 0, right: 0 };
        return fallback;
      }
    }
    throw new Error(`Unknown safeArea method: ${method}`);
  }

  /** system 模块处理 */
  private async handleSystem(method: string, args: Record<string, Object>): Promise<Object> {
    if (method === 'openUrl') {
      const url = args.url as string;
      try {
        const context = getContext() as common.UIAbilityContext;
        const want: Want = { action: 'ohos.want.action.viewData', uri: url };
        await context.startAbility(want);
      } catch (err) {
        hilog.error(DOMAIN, TAG, 'openUrl failed: %{public}s', JSON.stringify(err));
      }
      return '';
    }
    if (method === 'getVersion') {
      try {
        const info = bundleManager.getBundleInfoForSelfSync(bundleManager.BundleFlag.GET_BUNDLE_INFO_DEFAULT);
        return info.versionName;
      } catch {
        return '0.0.0';
      }
    }
    throw new Error(`Unknown system method: ${method}`);
  }

  /**
   * 处理来自 WebView 的原生调用请求
   * 在 Web 组件的 onPrompt 回调中调用此方法
   */
  async handleNativeCall(controller: webview.WebviewController, payload: string): Promise<void> {
    try {
      const request: NativeCallRequest = JSON.parse(payload) as NativeCallRequest;

      let result: Object | null = null;

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
        case 'safeArea':
          result = await this.handleSafeArea(request.method);
          break;
        case 'system':
          result = await this.handleSystem(request.method, request.args);
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
        const errorRequest: NativeCallRequest = JSON.parse(payload) as NativeCallRequest;
        const callbackScript = `window.__harmony_callback__(${errorRequest.id}, null, ${JSON.stringify(error)})`;
        controller.runJavaScript(callbackScript);
      } catch {
        hilog.error(DOMAIN, TAG, 'Failed to send error callback');
      }
    }
  }
}
