/**
 * Capacitor 音频会话管理封装。
 * 原生环境: 通过自定义 Capacitor 插件控制 AVAudioSession (iOS) / AudioFocus (Android)
 * Web 环境: 静默降级（no-op）
 */

interface AudioSessionPlugin {
  /** 激活录音会话，打断其他音频 */
  activate(): Promise<void>;
  /** 停用录音会话，通知其他音频可恢复 */
  deactivate(): Promise<void>;
}

/** Web 降级实现 — 所有方法均为 no-op */
const noopPlugin: AudioSessionPlugin = {
  activate: () => Promise.resolve(),
  deactivate: () => Promise.resolve(),
};

/**
 * 延迟初始化：首次调用时检测平台，
 * 原生环境通过 registerPlugin 获取桥接对象，
 * Web 环境使用 no-op。
 */
let _plugin: AudioSessionPlugin | null = null;

async function getPlugin(): Promise<AudioSessionPlugin> {
  if (_plugin) return _plugin;

  try {
    const { Capacitor, registerPlugin } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      _plugin = registerPlugin<AudioSessionPlugin>("AudioSession");
    } else {
      _plugin = noopPlugin;
    }
  } catch {
    // Capacitor 不可用（纯 Web 环境），使用 no-op
    _plugin = noopPlugin;
  }

  return _plugin;
}

/**
 * 导出的 AudioSession 对象。
 * activate/deactivate 内部自动检测平台。
 * 所有异常都被静默（console.warn），不阻塞调用方。
 */
export const AudioSession: AudioSessionPlugin = {
  async activate(): Promise<void> {
    try {
      const plugin = await getPlugin();
      await plugin.activate();
    } catch (err) {
      console.warn("[audio-session] activate failed:", err);
    }
  },

  async deactivate(): Promise<void> {
    try {
      const plugin = await getPlugin();
      await plugin.deactivate();
    } catch (err) {
      console.warn("[audio-session] deactivate failed:", err);
    }
  },
};
