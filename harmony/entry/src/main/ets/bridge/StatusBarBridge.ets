import { window } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';

const TAG = 'StatusBarBridge';
const DOMAIN = 0x0000;

/**
 * 状态栏桥接
 * 控制状态栏背景色和文字颜色
 */
export class StatusBarBridge {
  async handle(method: string, args: Record<string, Object>): Promise<Object | null> {
    switch (method) {
      case 'init':
        await this.init(args.backgroundColor as string, args.style as string);
        return 'ok';
      default:
        throw new Error(`StatusBarBridge: unknown method ${method}`);
    }
  }

  private async init(backgroundColor: string, style: string): Promise<void> {
    try {
      const windowClass = await window.getLastWindow(getContext(this));

      // 非全屏布局，状态栏占据独立空间
      await windowClass.setWindowLayoutFullScreen(false);

      // 设置状态栏背景色
      const systemBarProperties: window.SystemBarProperties = {
        statusBarColor: backgroundColor,
        statusBarContentColor: style === 'dark' ? '#000000' : '#FFFFFF',
      };
      await windowClass.setWindowSystemBarProperties(systemBarProperties);

      hilog.info(DOMAIN, TAG, 'Status bar initialized: bg=%{public}s, style=%{public}s',
        backgroundColor, style);
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'Failed to init status bar: %{public}s', JSON.stringify(err));
      throw (err instanceof Error ? err : new Error(String(err)));
    }
  }
}
