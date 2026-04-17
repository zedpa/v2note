/**
 * Sentry 浏览器端错误监控 — 前端/Capacitor/Electron 共用
 * 仅在 NEXT_PUBLIC_SENTRY_DSN 配置时生效
 */

let initialized = false;
let sentryModule: typeof import("@sentry/browser") | null = null;

/** 初始化浏览器端 Sentry */
export async function initBrowserSentry(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  const Sentry = await import("@sentry/browser");
  sentryModule = Sentry;

  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "production",
    release: process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
    sampleRate: 1.0,
    tracesSampleRate: 0.05,
    // 过滤常见浏览器噪音
    beforeSend(event) {
      const msg = event.exception?.values?.[0]?.value ?? "";
      // 忽略浏览器扩展、网络波动等噪音
      if (
        msg.includes("ResizeObserver loop") ||
        msg.includes("Non-Error promise rejection") ||
        msg.includes("Load failed")
      ) {
        return null;
      }
      return event;
    },
    // 忽略第三方脚本错误
    allowUrls: [/v2note\.(com|online)/, /localhost/],
  });
}

/** 上报异常 */
export function captureException(err: unknown, context?: Record<string, any>): void {
  if (!sentryModule) return;
  if (context) {
    sentryModule.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) {
        scope.setExtra(key, value);
      }
      sentryModule!.captureException(err);
    });
  } else {
    sentryModule.captureException(err);
  }
}

/** 上报消息 */
export function captureMessage(message: string, level: "info" | "warning" | "error" = "info"): void {
  if (!sentryModule) return;
  sentryModule.captureMessage(message, level);
}

/** 设置用户上下文 */
export function setUser(user: { id: string; email?: string }): void {
  if (!sentryModule) return;
  sentryModule.setUser(user);
}
