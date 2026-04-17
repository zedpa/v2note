/**
 * Sentry 错误监控 — lazy-load 模式
 * 仅在 SENTRY_DSN 配置时初始化，否则所有操作为空操作
 */

let initialized = false;
let sentryModule: typeof import("@sentry/node") | null = null;

/** 初始化 Sentry（仅在 SENTRY_DSN 存在时生效） */
export async function initSentry(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log("[sentry] SENTRY_DSN not set, skipping initialization");
    return;
  }

  const Sentry = await import("@sentry/node");
  sentryModule = Sentry;

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? "production",
    release: process.env.npm_package_version ?? "unknown",
    // 采样率：免费版 5K errors/月，保守采样
    sampleRate: 1.0,
    tracesSampleRate: 0.1,
    // 过滤噪音
    beforeSend(event) {
      // 忽略客户端断连等非关键错误
      const msg = event.exception?.values?.[0]?.value ?? "";
      if (msg.includes("ECONNRESET") || msg.includes("EPIPE")) {
        return null;
      }
      return event;
    },
  });

  console.log("[sentry] Initialized with environment:", process.env.SENTRY_ENVIRONMENT ?? "production");
}

/** 上报异常到 Sentry（未初始化时为空操作） */
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

/** 上报消息到 Sentry */
export function captureMessage(message: string, level: "info" | "warning" | "error" = "info"): void {
  if (!sentryModule) return;
  sentryModule.captureMessage(message, level);
}

/** 设置用户上下文 */
export function setUser(user: { id: string; email?: string }): void {
  if (!sentryModule) return;
  sentryModule.setUser(user);
}
