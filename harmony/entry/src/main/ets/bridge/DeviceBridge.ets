import { deviceInfo } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

const TAG = 'DeviceBridge';
const DOMAIN = 0x0000;

interface DeviceInfoResult {
  platform: string;
  model: string;
  osVersion: string;
}

/**
 * 设备信息桥接
 * 提供设备 ID 和设备信息查询
 */
export class DeviceBridge {
  async handle(method: string, args: Record<string, Object>): Promise<Object | null> {
    switch (method) {
      case 'getId':
        return this.getId();
      case 'getInfo':
        return this.getInfo();
      default:
        throw new Error(`DeviceBridge: unknown method ${method}`);
    }
  }

  /**
   * 获取设备唯一标识
   * 使用 AAID（匿名应用标识），不需要额外权限
   */
  private async getId(): Promise<string> {
    try {
      // 优先使用 udid（需要 ohos.permission.sec.ACCESS_UDID 权限）
      // 降级使用 AAID
      const id = deviceInfo.udid || `harmony-${deviceInfo.serial}`;
      hilog.info(DOMAIN, TAG, 'Device ID retrieved');
      return id;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'Failed to get device ID: %{public}s', JSON.stringify(err));
      throw (err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * 获取设备基本信息
   */
  private async getInfo(): Promise<DeviceInfoResult> {
    const result: DeviceInfoResult = {
      platform: 'harmony',
      model: deviceInfo.productModel || 'unknown',
      osVersion: deviceInfo.displayVersion || 'unknown',
    };
    return result;
  }
}
