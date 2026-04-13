/**
 * AudioWorklet processor that captures Float32 audio data,
 * converts to Int16 PCM, and sends chunks every ~100ms.
 *
 * At 16kHz mono: 100ms = 1600 samples = 3200 bytes of Int16 PCM.
 */
class PCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this._buffer = new Float32Array(0);
    // 16kHz: 100ms = 1600 samples
    this._targetSampleRate = 16000;
    this._chunkSize = 1600; 
    
    // Get actual sample rate from options or global scope
    // Note: AudioWorkletGlobalScope has sampleRate property
    this._sampleRate = options.processorOptions?.sampleRate || sampleRate;
    
    console.log(`[PCMProcessor] Initialized. Input SampleRate: ${this._sampleRate}, Target: ${this._targetSampleRate}`);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // mono channel

    // Simple downsampling if input rate > target rate
    // Note: This is a naive implementation (nearest neighbor/decimation). 
    // For production, a proper low-pass filter + interpolation is better, 
    // but for speech recognition this might suffice if ratio is integer.
    let processedData = channelData;
    
    if (this._sampleRate > this._targetSampleRate) {
        // Simple linear interpolation
        const ratio = this._sampleRate / this._targetSampleRate;
        const newLength = Math.floor(channelData.length / ratio);
        processedData = new Float32Array(newLength);
        for (let i = 0; i < newLength; i++) {
            const offset = i * ratio;
            const index = Math.floor(offset);
            const nextIndex = Math.min(index + 1, channelData.length - 1);
            const weight = offset - index;
            processedData[i] = channelData[index] * (1 - weight) + channelData[nextIndex] * weight;
        }
    }

    // Append to buffer
    const newBuffer = new Float32Array(this._buffer.length + processedData.length);
    newBuffer.set(this._buffer);
    newBuffer.set(processedData, this._buffer.length);
    this._buffer = newBuffer;

    // Send chunks when we have enough data
    while (this._buffer.length >= this._chunkSize) {
      const chunk = this._buffer.slice(0, this._chunkSize);
      this._buffer = this._buffer.slice(this._chunkSize);

      // Convert Float32 [-1, 1] to Int16 [-32768, 32767]
      const pcm = new Int16Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      
      // Post as transferable
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }

    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
