/**
 * Shared test utilities for WAV file creation and testing
 */

/**
 * Creates a minimal valid WAV file buffer for testing
 */
export function createTestWav(
  sampleRate = 44100,
  channels = 1,
  bitsPerSample = 16,
  sampleCount = 100
): ArrayBuffer {
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = sampleCount * channels * bytesPerSample;
  const totalSize = 36 + dataSize;
  
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  
  // RIFF header
  view.setUint32(0, 0x46464952, true); // "RIFF"
  view.setUint32(4, totalSize, true);
  view.setUint32(8, 0x45564157, true); // "WAVE"
  
  // fmt chunk
  view.setUint32(12, 0x20746d66, true); // "fmt "
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // audio format (PCM)
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true); // byte rate
  view.setUint16(32, channels * bytesPerSample, true); // block align
  view.setUint16(34, bitsPerSample, true);
  
  // data chunk
  view.setUint32(36, 0x61746164, true); // "data"
  view.setUint32(40, dataSize, true);
  
  // Sample data (simple sine wave pattern)
  if (bitsPerSample === 16) {
    for (let i = 0; i < sampleCount; i++) {
      const sample = Math.sin(i * 0.1) * 16384; // 16-bit range
      view.setInt16(44 + i * 2, sample, true);
    }
  } else if (bitsPerSample === 8) {
    for (let i = 0; i < sampleCount; i++) {
      const sample = Math.sin(i * 0.1) * 127 + 128; // 8-bit range (0-255)
      view.setUint8(44 + i, sample);
    }
  } else if (bitsPerSample === 24) {
    for (let i = 0; i < sampleCount; i++) {
      const sample = Math.sin(i * 0.1) * 8388607; // 24-bit range
      const offset = 44 + i * 3;
      view.setUint8(offset, sample & 0xff);
      view.setUint8(offset + 1, (sample >> 8) & 0xff);
      view.setUint8(offset + 2, (sample >> 16) & 0xff);
    }
  }
  
  return buffer;
}
