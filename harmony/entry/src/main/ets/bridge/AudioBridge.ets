import { abilityAccessCtrl, common, Permissions } from '@kit.AbilityKit';
import { audio } from '@kit.AudioKit';
import { buffer } from '@kit.ArkTS';
import { hilog } from '@kit.PerformanceAnalysisKit';

const TAG = 'AudioBridge';
const DOMAIN = 0x0000;

interface AudioStopMeta {
  duration: number;
  totalBytes: number;
}

/**
 * 录音桥接
 * 16kHz 16-bit mono PCM
 * stop() 只返回元信息，前端通过 getData(offset, length) 分段获取 base64
 */
export class AudioBridge {
  private audioCapturer: audio.AudioCapturer | null = null;
  private isRecording: boolean = false;
  private startTime: number = 0;
  private context: common.UIAbilityContext | null = null;
  private chunks: ArrayBuffer[] = [];
  // 录音完成后的合并 PCM 数据，供 getData 分段读取
  private mergedPcm: ArrayBuffer | null = null;

  setContext(context: common.UIAbilityContext): void {
    this.context = context;
  }

  async handle(method: string, args: Record<string, Object>): Promise<Object | null> {
    switch (method) {
      case 'requestPermission':
        return this.requestPermission();
      case 'startStream':
      case 'start':
        await this.start();
        return 'ok';
      case 'stop':
        return this.stop();
      case 'getData': {
        const offset = args.offset as number;
        const length = args.length as number;
        return this.getData(offset, length);
      }
      case 'cancel':
        this.cancel();
        return 'ok';
      case 'getStatus':
        return this.getStatus();
      default:
        throw new Error(`AudioBridge: unknown method ${method}`);
    }
  }

  private async requestPermission(): Promise<boolean> {
    try {
      const atManager = abilityAccessCtrl.createAtManager();
      const permissions: Permissions[] = ['ohos.permission.MICROPHONE'];
      const ctx = this.context ?? (getContext() as common.UIAbilityContext);
      const result = await atManager.requestPermissionsFromUser(ctx, permissions);
      const granted = result.authResults.every((r) => r === 0);
      hilog.info(DOMAIN, TAG, 'Microphone permission: %{public}s', granted ? 'granted' : 'denied');
      return granted;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'Permission request failed: %{public}s', JSON.stringify(err));
      return false;
    }
  }

  private async start(): Promise<void> {
    if (this.isRecording) {
      await this.stop();
    }

    this.mergedPcm = null;
    this.chunks = [];
    this.startTime = Date.now();

    const capturerOptions: audio.AudioCapturerOptions = {
      streamInfo: {
        samplingRate: audio.AudioSamplingRate.SAMPLE_RATE_16000,
        channels: audio.AudioChannel.CHANNEL_1,
        sampleFormat: audio.AudioSampleFormat.SAMPLE_FORMAT_S16LE,
        encodingType: audio.AudioEncodingType.ENCODING_TYPE_RAW,
      },
      capturerInfo: {
        source: audio.SourceType.SOURCE_TYPE_MIC,
        capturerFlags: 0,
      },
    };

    try {
      this.audioCapturer = await audio.createAudioCapturer(capturerOptions);

      this.audioCapturer.on('readData', (data: ArrayBuffer) => {
        const copy = new ArrayBuffer(data.byteLength);
        new Uint8Array(copy).set(new Uint8Array(data));
        this.chunks.push(copy);
        if (this.chunks.length <= 3 || this.chunks.length % 50 === 0) {
          hilog.info(DOMAIN, TAG, 'readData callback: %{public}d bytes, total chunks=%{public}d', data.byteLength, this.chunks.length);
        }
      });

      await this.audioCapturer.start();
      this.isRecording = true;
      hilog.info(DOMAIN, TAG, 'Recording started');
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'Failed to start: %{public}s', JSON.stringify(err));
      throw (err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * 停止录音，合并 PCM 数据到 mergedPcm，返回元信息
   */
  private async stop(): Promise<AudioStopMeta> {
    if (!this.audioCapturer || !this.isRecording) {
      return { duration: 0, totalBytes: 0 };
    }

    try {
      await this.audioCapturer.stop();
      await this.audioCapturer.release();
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'Failed to stop capturer: %{public}s', JSON.stringify(err));
    }

    const duration = Math.floor((Date.now() - this.startTime) / 1000);

    // 合并所有 chunk
    const totalBytes = this.chunks.reduce((sum, buf) => sum + buf.byteLength, 0);
    const merged = new ArrayBuffer(totalBytes);
    const view = new Uint8Array(merged);
    let offset = 0;
    for (const chunk of this.chunks) {
      view.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }
    this.mergedPcm = merged;

    this.audioCapturer = null;
    this.isRecording = false;
    this.chunks = [];

    hilog.info(DOMAIN, TAG, 'Stopped: duration=%{public}ds, pcm=%{public}d bytes', duration, totalBytes);

    return { duration, totalBytes };
  }

  /**
   * 分段读取录音 PCM 数据（base64），每次最大 32KB
   */
  private getData(offset: number, length: number): string {
    if (!this.mergedPcm || offset >= this.mergedPcm.byteLength) {
      return '';
    }
    const end = Math.min(offset + length, this.mergedPcm.byteLength);
    const slice = this.mergedPcm.slice(offset, end);
    return buffer.from(slice).toString('base64');
  }

  /**
   * 取消录音，直接释放资源，不合并 chunks（节省内存）
   */
  private cancel(): void {
    if (this.audioCapturer) {
      try {
        this.audioCapturer.stop();
        this.audioCapturer.release();
      } catch (err) {
        hilog.error(DOMAIN, TAG, 'Cancel release error: %{public}s', String(err));
      }
    }
    this.audioCapturer = null;
    this.isRecording = false;
    this.chunks = [];
    this.mergedPcm = null;
    hilog.info(DOMAIN, TAG, 'Recording cancelled');
  }

  private async getStatus(): Promise<'idle' | 'recording'> {
    return this.isRecording ? 'recording' : 'idle';
  }
}
