import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.v2note.app',
  appName: '念念有路',
  webDir: 'out',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    Keyboard: {
      resize: "none",    // 关闭原生 resize，由 ViewportHeightManager 统一管理
      scroll: false,     // 禁止 WebView 自动滚动到 input
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#ff6b2b',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      overlaysWebView: false,
      style: 'DEFAULT',
    },
    CapacitorUpdater: {
      autoUpdate: false,
    },
    LocalNotifications: {
      smallIcon: "ic_stat_notification",
      iconColor: "#FF6B2B",
    },
  },
};

export default config;
