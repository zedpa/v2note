/**
 * AudioWorklet processor that captures Float32 audio data,
 * converts to Int16 PCM, and sends chunks every ~100ms.
 *
 * At 16kHz mono: 100ms = 1600 samples = 3200 bytes of Int16 PCM.
 */
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(0);
    this._chunkSize = 1600; // 100ms at 16kHz
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // mono channel

    // Append to buffer
    const newBuffer = new Float32Array(this._buffer.length + channelData.length);
    newBuffer.set(this._buffer);
    newBuffer.set(channelData, this._buffer.length);
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

      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }

    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
