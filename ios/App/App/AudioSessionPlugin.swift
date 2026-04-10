import Foundation
import AVFoundation
import Capacitor

/**
 * AudioSessionPlugin — Capacitor 8 本地插件
 * 管理 AVAudioSession，在录音时打断系统音频，录音结束后恢复。
 */
@objc(AudioSessionPlugin)
public class AudioSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AudioSessionPlugin"
    public let jsName = "AudioSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "activate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deactivate", returnType: CAPPluginReturnPromise),
    ]

    /// 激活录音音频会话，打断系统音频
    @objc func activate(_ call: CAPPluginCall) {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, options: [.defaultToSpeaker])
            try session.setActive(true)
            call.resolve()
        } catch {
            call.reject("Failed to activate audio session: \(error.localizedDescription)")
        }
    }

    /// 停用录音音频会话，通知其他音频可恢复
    @objc func deactivate(_ call: CAPPluginCall) {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setActive(false, options: .notifyOthersOnDeactivation)
            call.resolve()
        } catch {
            // deactivate 失败通常是因为没有活跃的音频会话，不阻塞
            call.resolve()
        }
    }
}
