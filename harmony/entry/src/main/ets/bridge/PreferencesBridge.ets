import { preferences } from '@kit.ArkData';
import { hilog } from '@kit.PerformanceAnalysisKit';

const TAG = 'PreferencesBridge';
const DOMAIN = 0x0000;
const STORE_NAME = 'v2note_preferences';

/**
 * 存储桥接
 * 使用 @ohos.data.preferences 实现键值存储
 */
export class PreferencesBridge {
  private store: preferences.Preferences | null = null;

  async handle(method: string, args: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case 'get':
        return this.get(args.key as string);
      case 'set':
        return this.set(args.key as string, args.value as string);
      case 'remove':
        return this.remove(args.key as string);
      default:
        throw new Error(`PreferencesBridge: unknown method ${method}`);
    }
  }

  private async getStore(): Promise<preferences.Preferences> {
    if (!this.store) {
      this.store = await preferences.getPreferences(getContext(this), STORE_NAME);
    }
    return this.store;
  }

  private async get(key: string): Promise<string | null> {
    try {
      const store = await this.getStore();
      const value = await store.get(key, '');
      return value === '' ? null : value as string;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'Failed to get key "%{public}s": %{public}s', key, JSON.stringify(err));
      return null;
    }
  }

  private async set(key: string, value: string): Promise<void> {
    try {
      const store = await this.getStore();
      await store.put(key, value);
      await store.flush();
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'Failed to set key "%{public}s": %{public}s', key, JSON.stringify(err));
      throw err;
    }
  }

  private async remove(key: string): Promise<void> {
    try {
      const store = await this.getStore();
      await store.delete(key);
      await store.flush();
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'Failed to remove key "%{public}s": %{public}s', key, JSON.stringify(err));
      throw err;
    }
  }
}
