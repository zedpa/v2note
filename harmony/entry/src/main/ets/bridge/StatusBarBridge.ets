import { window } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';

const TAG = 'StatusBarBridge';
const DOMAIN = 0x0000;

/**
 * 状态栏桥接
 * 控制状态栏背景色和文字颜色
 */
export class StatusBarBridge {
  async handle(method: string, args: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case 'init':
        return this.init(args as { backgroundColor: string; style: 'light' | 'dark' });
      default:
        throw new Error(`StatusBarBridge: unknown method ${method}`);
    }
  }

  private async init(options: { backgroundColor: string; style: 'light' | 'dark' }): Promise<void> {
    try {
      const windowClass = await window.getLastWindow(getContext(this));

      // 非全屏布局，状态栏占据独立空间
      await windowClass.setWindowLayoutFullScreen(false);

      // 设置状态栏背景色
      const systemBarProperties: window.SystemBarProperties = {
        statusBarColor: options.backgroundColor,
        statusBarContentColor: options.style === 'dark' ? '#000000' : '#FFFFFF',
      };
      await windowClass.setWindowSystemBarProperties(systemBarProperties);

      hilog.info(DOMAIN, TAG, 'Status bar initialized: bg=%{public}s, style=%{public}s',
        options.backgroundColor, options.style);
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'Failed to init status bar: %{public}s', JSON.stringify(err));
      throw err;
    }
  }
}
