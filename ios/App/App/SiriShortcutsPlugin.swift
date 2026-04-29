import Foundation
import Intents
import Capacitor

/**
 * SiriShortcutsPlugin — Capacitor 8 本地插件
 *
 * Spec #131 Phase C: 向系统捐献 Siri Shortcut，
 * 让用户可通过 Siri / Action Button / 锁屏 Widget 触发快速捕获。
 *
 * 方法：
 *   - donate(activityType, title, suggestedPhrase, urlToOpen)
 *   - isAvailable() → { available: Bool }
 */
@objc(SiriShortcutsPlugin)
public class SiriShortcutsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SiriShortcutsPlugin"
    public let jsName = "SiriShortcuts"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "donate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "donateMultiple", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
    ]

    /// 保持 activity 引用防止 ARC 释放
    private var activeActivities: [NSUserActivity] = []

    /// 创建 NSUserActivity 并 becomeCurrent
    private func createActivity(activityType: String, title: String, suggestedPhrase: String?, urlToOpen: String?) -> NSUserActivity {
        let activity = NSUserActivity(activityType: activityType)
        activity.title = title
        activity.isEligibleForSearch = true
        activity.isEligibleForPrediction = true

        if let phrase = suggestedPhrase {
            activity.suggestedInvocationPhrase = phrase
        }

        if let urlStr = urlToOpen {
            activity.userInfo = ["url": urlStr]
        }

        return activity
    }

    /// 向系统捐献一个 Siri Shortcut
    @objc func donate(_ call: CAPPluginCall) {
        guard let activityType = call.getString("activityType"),
              let title = call.getString("title") else {
            call.reject("activityType and title are required")
            return
        }

        let activity = createActivity(
            activityType: activityType,
            title: title,
            suggestedPhrase: call.getString("suggestedPhrase"),
            urlToOpen: call.getString("urlToOpen")
        )
        activity.becomeCurrent()
        activeActivities.append(activity)

        if #available(iOS 12.0, *) {
            let shortcut = INShortcut(userActivity: activity)
            INVoiceShortcutCenter.shared.setShortcutSuggestions([shortcut])
        }

        call.resolve(["donated": true])
    }

    /// 批量捐献多个 Siri Shortcuts — 一次性提交，避免 setShortcutSuggestions 覆盖
    @objc func donateMultiple(_ call: CAPPluginCall) {
        guard let items = call.getArray("items") as? [[String: Any]] else {
            call.reject("items array is required")
            return
        }

        var shortcuts: [INShortcut] = []

        for item in items {
            guard let activityType = item["activityType"] as? String,
                  let title = item["title"] as? String else { continue }

            let activity = createActivity(
                activityType: activityType,
                title: title,
                suggestedPhrase: item["suggestedPhrase"] as? String,
                urlToOpen: item["urlToOpen"] as? String
            )
            activity.becomeCurrent()
            activeActivities.append(activity)

            if #available(iOS 12.0, *) {
                shortcuts.append(INShortcut(userActivity: activity))
            }
        }

        // 一次性提交所有 shortcuts，不会互相覆盖
        if #available(iOS 12.0, *), !shortcuts.isEmpty {
            INVoiceShortcutCenter.shared.setShortcutSuggestions(shortcuts)
        }

        call.resolve(["donated": true, "count": items.count])
    }

    /// 检查 Siri Shortcuts 是否可用
    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 12.0, *) {
            call.resolve(["available": true])
        } else {
            call.resolve(["available": false])
        }
    }
}
