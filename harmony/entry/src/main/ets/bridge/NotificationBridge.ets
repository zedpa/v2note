import { notificationManager } from '@kit.NotificationKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

const TAG = 'NotificationBridge';
const DOMAIN = 0x0000;

/**
 * 通知桥接
 * 使用 @ohos.notificationManager 实现本地通知
 */
export class NotificationBridge {
  async handle(method: string, args: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case 'schedule':
        return this.schedule(args as {
          id: number;
          title: string;
          body: string;
          scheduledAt?: string;
          repeatInterval?: 'daily' | 'weekly';
        });
      case 'cancel':
        return this.cancel(args.id as number);
      case 'cancelAll':
        return this.cancelAll();
      default:
        throw new Error(`NotificationBridge: unknown method ${method}`);
    }
  }

  private async schedule(options: {
    id: number;
    title: string;
    body: string;
    scheduledAt?: string;
    repeatInterval?: 'daily' | 'weekly';
  }): Promise<void> {
    try {
      const notificationRequest: notificationManager.NotificationRequest = {
        id: options.id,
        content: {
          notificationContentType: notificationManager.ContentType.NOTIFICATION_CONTENT_BASIC_TEXT,
          normal: {
            title: options.title,
            text: options.body,
          },
        },
      };

      await notificationManager.publish(notificationRequest);
      hilog.info(DOMAIN, TAG, 'Notification scheduled: id=%{public}d', options.id);
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'Failed to schedule notification: %{public}s', JSON.stringify(err));
      throw err;
    }
  }

  private async cancel(id: number): Promise<void> {
    try {
      await notificationManager.cancel(id);
      hilog.info(DOMAIN, TAG, 'Notification cancelled: id=%{public}d', id);
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'Failed to cancel notification: %{public}s', JSON.stringify(err));
      throw err;
    }
  }

  private async cancelAll(): Promise<void> {
    try {
      await notificationManager.cancelAll();
      hilog.info(DOMAIN, TAG, 'All notifications cancelled');
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'Failed to cancel all notifications: %{public}s', JSON.stringify(err));
      throw err;
    }
  }
}
