/**
 * URL 安全检查 — 防止 SSRF
 */

const BLOCKED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
];

const BLOCKED_HOST_PATTERNS = [
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /\.internal$/,
  /\.local$/,
];

export function isUrlSafe(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);

    // 只允许 http/https
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }

    const hostname = url.hostname.toLowerCase();

    // 显式黑名单
    if (BLOCKED_HOSTS.includes(hostname)) {
      return false;
    }

    // 模式匹配
    for (const pattern of BLOCKED_HOST_PATTERNS) {
      if (pattern.test(hostname)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}
