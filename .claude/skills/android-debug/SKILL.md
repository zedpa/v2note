---
name: android-debug
description: 构建、部署并在 Android 模拟器中调试 V2Note App。支持 CDP 远程注入 JS、adb 截图、logcat 诊断。
argument-hint: "[build|screenshot|inject <js>|logcat|full-test]"
license: MIT
metadata:
  author: v2note
  version: "1.0.0"
---

# Android Debug Skill — 模拟器调试流水线

## 环境要求

| 组件 | 路径 | 说明 |
|------|------|------|
| Android SDK | `~/Library/Android/sdk` | 含 emulator + platform-tools |
| Java (JDK 21) | Android Studio 内置 JBR | `JAVA_HOME` 需指向 AS 内置 JDK |
| AVD | `Pixel_10`（Google APIs） | 需含 Google Calendar/Clock App |
| Python3 + websockets | 系统 Python | CDP 通信用 |

## 环境变量

每个 Bash 命令需要设置：

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
```

## 路径速查

```
ADB      = ~/Library/Android/sdk/platform-tools/adb
EMULATOR = ~/Library/Android/sdk/emulator/emulator
APK      = android/app/build/outputs/apk/debug/app-debug.apk
```

## 参数

| 参数 | 说明 |
|------|------|
| (无参数) | 完整流程：build → install → launch → 连接 CDP |
| `build` | 仅构建：npm run build → cap sync → gradlew assembleDebug |
| `screenshot` | adb 截图并显示 |
| `inject <js>` | 通过 CDP 在 WebView 中执行 JS |
| `logcat` | 查看 App 相关日志 |
| `full-test` | 完整流程 + 自动创建测试待办验证 Intent |

## 执行流程

### Phase 1: 启动模拟器（如果未运行）

```bash
# 检查是否已运行
~/Library/Android/sdk/platform-tools/adb devices | grep emulator

# 未运行则启动（后台）
~/Library/Android/sdk/emulator/emulator -avd Pixel_10 -no-snapshot-load &

# 等待启动完成
for i in $(seq 1 30); do
  boot=$(~/Library/Android/sdk/platform-tools/adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
  [ "$boot" = "1" ] && break
  sleep 10
done
```

### Phase 2: 构建前端 + Android APK

```bash
# 2a. 前端构建
npm run build

# 2b. Capacitor 同步（必须在项目根目录执行）
cd /Users/a1/workspace/v2note && npx cap sync android

# 2c. Android 构建
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
cd android && ./gradlew assembleDebug
```

### Phase 3: 安装并启动 App

```bash
~/Library/Android/sdk/platform-tools/adb install -r android/app/build/outputs/apk/debug/app-debug.apk
~/Library/Android/sdk/platform-tools/adb shell am force-stop com.v2note.app
~/Library/Android/sdk/platform-tools/adb shell am start -n com.v2note.app/.MainActivity
```

### Phase 4: 连接 Chrome DevTools Protocol (CDP)

```bash
# 4a. 找到 WebView devtools socket
~/Library/Android/sdk/platform-tools/adb shell "cat /proc/net/unix" | grep devtools
# 输出形如: @webview_devtools_remote_<PID>

# 4b. 端口转发
~/Library/Android/sdk/platform-tools/adb forward tcp:9222 localabstract:webview_devtools_remote_<PID>

# 4c. 获取 WebSocket URL
curl -s http://localhost:9222/json | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['webSocketDebuggerUrl'])"
```

### Phase 5: CDP 远程注入 JS

通过 Python + websockets 向 WebView 注入 JS：

```python
import json, asyncio, websockets

async def main():
    uri = 'ws://localhost:9222/devtools/page/<PAGE_ID>'
    async with websockets.connect(uri) as ws:
        cmd = {
            'id': 1,
            'method': 'Runtime.evaluate',
            'params': {
                'expression': '<YOUR_JS_CODE>',
                'awaitPromise': True,  # 如果 JS 返回 Promise
            }
        }
        await ws.send(json.dumps(cmd))
        r = await ws.recv()
        print(json.loads(r).get('result', {}).get('result', {}))

asyncio.run(main())
```

**常用注入操作**：

| 操作 | JS 代码 |
|------|---------|
| 设置 Gateway URL | `localStorage.setItem("voicenote:gatewayUrl", "ws://10.0.2.2:3001")` |
| 获取页面文本 | `document.body.innerText.substring(0, 500)` |
| 点击按钮 | `document.querySelector('button:has-text("xxx")').click()` |
| 填充输入框 | 用 `nativeInputValueSetter` 模式（见下方） |
| 刷新页面 | CDP method `Page.reload` |

**填充输入框模式**（React 需要触发 synthetic event）：

```javascript
const inp = document.querySelector('input[data-testid="xxx"]');
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
setter.call(inp, '目标值');
inp.dispatchEvent(new Event('input', { bubbles: true }));
```

## 关键经验 & 已知陷阱

### 模拟器网络

- 模拟器 `localhost` 指向模拟器自身，**不是宿主机**
- 宿主机地址：`10.0.2.2`
- Gateway URL 需设为 `ws://10.0.2.2:3001`

### Gradle 构建

- `JAVA_HOME` 必须指向 Android Studio 内置 JBR（`/Applications/Android Studio.app/Contents/jbr/Contents/Home`）
- `android/local.properties` 需要 `sdk.dir=/Users/a1/Library/Android/sdk`
- `gradle.properties` 中 `org.gradle.java.home` 如果是 Windows 路径需修正
- `proguard-android.txt` 已被废弃 → 需替换为 `proguard-android-optimize.txt`（影响 node_modules 中的 Capacitor 插件）
- TLS 配置：移除 `-Dhttps.protocols=TLSv1.2` 限制
- Kotlin 插件：`app/build.gradle` 需要 `apply plugin: 'kotlin-android'`，根 `build.gradle` 需要 `classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21'`

### Capacitor 插件

- `registerPlugin()` 返回 Proxy 对象，**不能从 async 函数 return**（会触发 thenable check → 报错 `"XXX.then()" is not implemented`）
- 正确做法：同步 `require('@capacitor/core')` + 同步赋值缓存变量

### adb 操作

| 操作 | 命令 |
|------|------|
| 截图 | `adb shell screencap -p /sdcard/s.png && adb pull /sdcard/s.png /tmp/emu.png` |
| 点击坐标 | `adb shell input tap <x> <y>`（设备像素坐标） |
| UI 元素定位 | `adb shell uiautomator dump /sdcard/ui.xml`（仅原生 UI，不含 WebView） |
| 查看日志 | `adb logcat -d \| grep -i "keyword"` |
| 强制停止 | `adb shell am force-stop com.v2note.app` |

### 坐标系

- adb 截图分辨率 = 设备原生分辨率（如 1080x2424）
- adb `input tap` 使用设备像素坐标
- CDP `document.elementFromPoint()` 使用 CSS 像素坐标（通常是设备像素 / devicePixelRatio）
- WebView 内部元素用 CDP 操作更可靠，原生弹窗用 adb + uiautomator

## 输出格式

```
✓ 模拟器已运行 — Pixel_10 (emulator-5554)
✓ 前端构建 — 8 个静态页面
✓ cap sync — 9 个插件同步
✓ APK 构建 — BUILD SUCCESSFUL (3s)
✓ 安装 — Success
✓ CDP 连接 — ws://localhost:9222/devtools/page/<ID>
✓ Gateway URL — ws://10.0.2.2:3001
```
