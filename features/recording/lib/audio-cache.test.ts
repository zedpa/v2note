import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Phase 2: audio-cache.ts IndexedDB 封装
 * 由于 vitest jsdom 不完全支持 IndexedDB，这里测试模块导出和辅助逻辑
 */

describe("audio-cache — 模块导出", () => {
  it("should_export_all_required_functions", async () => {
    const mod = await import("./audio-cache");

    expect(typeof mod.saveAudio).toBe("function");
    expect(typeof mod.getAudio).toBe("function");
    expect(typeof mod.deleteAudio).toBe("function");
    expect(typeof mod.getAllPending).toBe("function");
    expect(typeof mod.markCompleted).toBe("function");
    expect(typeof mod.getCacheStats).toBe("function");
  });
});

describe("audio-cache — mergeChunks 辅助", () => {
  it("should_export_mergeChunks_to_combine_arraybuffers", async () => {
    const mod = await import("./audio-cache");
    expect(typeof mod.mergeChunks).toBe("function");

    // 两个小 buffer 合并
    const a = new Uint8Array([1, 2, 3]).buffer;
    const b = new Uint8Array([4, 5]).buffer;
    const merged = mod.mergeChunks([a, b]);
    expect(merged.byteLength).toBe(5);
    const view = new Uint8Array(merged);
    expect(Array.from(view)).toEqual([1, 2, 3, 4, 5]);
  });

  it("should_return_empty_buffer_for_empty_array", async () => {
    const mod = await import("./audio-cache");
    const merged = mod.mergeChunks([]);
    expect(merged.byteLength).toBe(0);
  });
});

describe("audio-cache — addWavHeader 辅助", () => {
  it("should_export_addWavHeader_to_wrap_pcm_as_wav", async () => {
    const mod = await import("./audio-cache");
    expect(typeof mod.addWavHeader).toBe("function");

    // 创建假 PCM 数据
    const pcm = new Uint8Array(320).buffer; // 10ms @ 16kHz 16-bit mono
    const wav = mod.addWavHeader(pcm);

    // WAV header 44 bytes + PCM data
    expect(wav.byteLength).toBe(44 + 320);

    // 验证 RIFF header
    const view = new DataView(wav);
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    expect(riff).toBe("RIFF");

    // 验证 WAVE
    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
    expect(wave).toBe("WAVE");

    // 验证采样率 16000
    expect(view.getUint32(24, true)).toBe(16000);

    // 验证 channels = 1
    expect(view.getUint16(22, true)).toBe(1);

    // 验证 bits per sample = 16
    expect(view.getUint16(34, true)).toBe(16);
  });
});
