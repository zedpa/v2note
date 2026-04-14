import { notificationManager } from '@kit.NotificationKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

const TAG = 'NotificationBridge';
const DOMAIN = 0x0000;

/**
 * 通知桥接
 * 使用 @ohos.notificationManager 实现本地通知
 */
export class NotificationBridge {
  private notificationEnabled: boolean = false;

  /** 请求通知权限 */
  private async ensurePermission(): Promise<void> {
    if (this.notificationEnabled) return;
    try {
      await notificationManager.requestEnableNotification();
      this.notificationEnabled = true;
    } catch (err) {
      // 用户已授权时也会抛异常（code 1600004），忽略即可
      this.notificationEnabled = true;
      hilog.warn(DOMAIN, TAG, 'Notification permission request: %{public}s', JSON.stringify(err));
    }
  }

  async handle(method: string, args: Record<string, Object>): Promise<Object | null> {
    switch (method) {
      case 'schedule':
        await this.schedule(
          args.id as number,
          args.title as string,
          args.body as string
        );
        return 'ok';
      case 'cancel':
        await this.cancel(args.id as number);
        return 'ok';
      case 'cancelAll':
        await this.cancelAll();
        return 'ok';
      default:
        throw new Error(`NotificationBridge: unknown method ${method}`);
    }
  }

  private async schedule(id: number, title: string, body: string): Promise<void> {
    await this.ensurePermission();
    try {
      const notificationRequest: notificationManager.NotificationRequest = {
        id: id,
        content: {
          notificationContentType: notificationManager.ContentType.NOTIFICATION_CONTENT_BASIC_TEXT,
          normal: {
            title: title,
            text: body,
          },
        },
      };

      await notificationManager.publish(notificationRequest);
      hilog.info(DOMAIN, TAG, 'Notification scheduled: id=%{public}d', id);
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'Failed to schedule notification: %{public}s', JSON.stringify(err));
      throw (err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async cancel(id: number): Promise<void> {
    try {
      await notificationManager.cancel(id);
      hilog.info(DOMAIN, TAG, 'Notification cancelled: id=%{public}d', id);
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'Failed to cancel notification: %{public}s', JSON.stringify(err));
      throw (err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async cancelAll(): Promise<void> {
    try {
      await notificationManager.cancelAll();
      hilog.info(DOMAIN, TAG, 'All notifications cancelled');
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'Failed to cancel all notifications: %{public}s', JSON.stringify(err));
      throw (err instanceof Error ? err : new Error(String(err)));
    }
  }
}
