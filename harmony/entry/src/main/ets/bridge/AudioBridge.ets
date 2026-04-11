import { abilityAccessCtrl, Permissions } from '@kit.AbilityKit';
import { audio } from '@kit.AudioKit';
import { buffer } from '@kit.ArkTS';
import { hilog } from '@kit.PerformanceAnalysisKit';

const TAG = 'AudioBridge';
const DOMAIN = 0x0000;

/**
 * 录音桥接
 * 使用 OHAudio / AudioCapturer API 实现录音功能
 */
export class AudioBridge {
  private audioCapturer: audio.AudioCapturer | null = null;
  private audioData: ArrayBuffer[] = [];
  private isRecording: boolean = false;
  private startTime: number = 0;

  async handle(method: string, args: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case 'requestPermission':
        return this.requestPermission();
      case 'start':
        return this.start(args as { format?: 'aac' | 'wav' });
      case 'stop':
        return this.stop();
      case 'getStatus':
        return this.getStatus();
      default:
        throw new Error(`AudioBridge: unknown method ${method}`);
    }
  }

  /**
   * 请求麦克风权限
   */
  private async requestPermission(): Promise<boolean> {
    try {
      const atManager = abilityAccessCtrl.createAtManager();
      const permissions: Permissions[] = ['ohos.permission.MICROPHONE'];
      const result = await atManager.requestPermissionsFromUser(
        getContext(this),
        permissions
      );
      const granted = result.authResults.every((r) => r === 0);
      hilog.info(DOMAIN, TAG, 'Microphone permission: %{public}s', granted ? 'granted' : 'denied');
      return granted;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'Permission request failed: %{public}s', JSON.stringify(err));
      return false;
    }
  }

  /**
   * 开始录音
   */
  private async start(options?: { format?: 'aac' | 'wav' }): Promise<void> {
    if (this.isRecording) {
      hilog.warn(DOMAIN, TAG, 'Already recording, stopping previous');
      await this.stop();
    }

    this.audioData = [];
    this.startTime = Date.now();

    const audioStreamInfo: audio.AudioStreamInfo = {
      samplingRate: audio.AudioSamplingRate.SAMPLE_RATE_44100,
      channels: audio.AudioChannel.CHANNEL_1,
      sampleFormat: audio.AudioSampleFormat.SAMPLE_FORMAT_S16LE,
      encodingType: audio.AudioEncodingType.ENCODING_TYPE_RAW,
    };

    const audioCapturerInfo: audio.AudioCapturerInfo = {
      source: audio.SourceType.SOURCE_TYPE_MIC,
      capturerFlags: 0,
    };

    const audioCapturerOptions: audio.AudioCapturerOptions = {
      streamInfo: audioStreamInfo,
      capturerInfo: audioCapturerInfo,
    };

    try {
      this.audioCapturer = await audio.createAudioCapturer(audioCapturerOptions);

      this.audioCapturer.on('readData', (data: ArrayBuffer) => {
        this.audioData.push(data);
      });

      await this.audioCapturer.start();
      this.isRecording = true;
      hilog.info(DOMAIN, TAG, 'Recording started');
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'Failed to start recording: %{public}s', JSON.stringify(err));
      throw err;
    }
  }

  /**
   * 停止录音并返回 base64 音频数据
   */
  private async stop(): Promise<{ base64: string; mimeType: string; duration: number }> {
    if (!this.audioCapturer || !this.isRecording) {
      return { base64: '', mimeType: 'audio/wav', duration: 0 };
    }

    try {
      await this.audioCapturer.stop();
      await this.audioCapturer.release();

      const duration = Math.floor((Date.now() - this.startTime) / 1000);

      // 合并所有录音数据
      const totalLength = this.audioData.reduce((sum, buf) => sum + buf.byteLength, 0);
      const merged = new ArrayBuffer(totalLength);
      const mergedView = new Uint8Array(merged);
      let offset = 0;
      for (const chunk of this.audioData) {
        mergedView.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
      }

      // 添加 WAV 头
      const wavBuffer = this.addWavHeader(merged, 44100, 1, 16);

      // 转为 base64
      const base64 = buffer.from(wavBuffer).toString('base64');

      this.audioCapturer = null;
      this.audioData = [];
      this.isRecording = false;

      hilog.info(DOMAIN, TAG, 'Recording stopped, duration: %{public}d s', duration);

      return {
        base64,
        mimeType: 'audio/wav',
        duration,
      };
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'Failed to stop recording: %{public}s', JSON.stringify(err));
      this.isRecording = false;
      throw err;
    }
  }

  /**
   * 获取录音状态
   */
  private async getStatus(): Promise<'idle' | 'recording'> {
    return this.isRecording ? 'recording' : 'idle';
  }

  /**
   * 为 PCM 数据添加 WAV 文件头
   */
  private addWavHeader(
    pcmData: ArrayBuffer,
    sampleRate: number,
    channels: number,
    bitsPerSample: number
  ): ArrayBuffer {
    const headerSize = 44;
    const dataSize = pcmData.byteLength;
    const fileSize = headerSize + dataSize;
    const wavBuffer = new ArrayBuffer(fileSize);
    const view = new DataView(wavBuffer);

    // RIFF header
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, fileSize - 8, true);
    this.writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // sub-chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * bitsPerSample / 8, true); // byte rate
    view.setUint16(32, channels * bitsPerSample / 8, true); // block align
    view.setUint16(34, bitsPerSample, true);

    // data sub-chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // PCM data
    new Uint8Array(wavBuffer, headerSize).set(new Uint8Array(pcmData));

    return wavBuffer;
  }

  private writeString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }
}
