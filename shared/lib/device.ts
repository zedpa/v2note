/**
 * @deprecated deviceId 已废弃，所有身份识别统一使用 userId。
 * 保留导出签名供未清理的调用方编译通过，getDeviceId() 现在是 no-op。
 */

/** @deprecated No-op. 返回空字符串，不再做网络调用。 */
export async function getDeviceId(): Promise<string> {
  return "";
}

/** @deprecated No-op. */
export function clearDeviceCache() {
  // no-op
}
