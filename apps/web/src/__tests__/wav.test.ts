import { describe, it, expect } from 'vitest';
import { parseWavPcm16Mono, parseWavMetadata } from '../wav';
import { createTestWav } from './test-utils';

describe('parseWavPcm16Mono', () => {
  it('should parse valid PCM16 mono WAV file', () => {
    const wavBuffer = createTestWav(44100, 1, 16, 100);
    const result = parseWavPcm16Mono(wavBuffer, 'test.wav');
    
    expect(result.srcHz).toBe(44100);
    expect(result.pcm16).toBeInstanceOf(Int16Array);
    expect(result.pcm16.length).toBe(100);
  });

  it('should reject files that are too small', () => {
    const smallBuffer = new ArrayBuffer(20);
    expect(() => {
      parseWavPcm16Mono(smallBuffer, 'small.wav');
    }).toThrow('small.wav: file too small to be a valid WAV file');
  });

  it('should reject files without RIFF header', () => {
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);
    view.setUint32(0, 0x12345678, true); // Invalid header
    
    expect(() => {
      parseWavPcm16Mono(buffer, 'invalid.wav');
    }).toThrow('invalid.wav: not a valid WAV file (missing RIFF header)');
  });

  it('should reject files without WAVE format', () => {
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);
    view.setUint32(0, 0x46464952, true); // "RIFF"
    view.setUint32(8, 0x12345678, true); // Invalid format
    
    expect(() => {
      parseWavPcm16Mono(buffer, 'invalid.wav');
    }).toThrow('invalid.wav: not a valid WAV file (missing WAVE format)');
  });

  it('should reject stereo files', () => {
    const wavBuffer = createTestWav(44100, 2, 16, 100); // 2 channels
    
    expect(() => {
      parseWavPcm16Mono(wavBuffer, 'stereo.wav');
    }).toThrow('stereo.wav: unsupported audio format (browser only supports WAV PCM16 mono)');
  });

  it('should reject 8-bit files', () => {
    const wavBuffer = createTestWav(44100, 1, 8, 100); // 8-bit
    
    expect(() => {
      parseWavPcm16Mono(wavBuffer, '8bit.wav');
    }).toThrow('8bit.wav: unsupported audio format (browser only supports WAV PCM16 mono)');
  });

  it('should reject 24-bit files', () => {
    const wavBuffer = createTestWav(44100, 1, 24, 100); // 24-bit
    
    expect(() => {
      parseWavPcm16Mono(wavBuffer, '24bit.wav');
    }).toThrow('24bit.wav: unsupported audio format (browser only supports WAV PCM16 mono)');
  });

  it('should reject non-PCM format files', () => {
    const wavBuffer = createTestWav(44100, 1, 16, 100);
    const view = new DataView(wavBuffer);
    view.setUint16(20, 2, true); // μ-law format instead of PCM
    
    expect(() => {
      parseWavPcm16Mono(wavBuffer, 'mulaw.wav');
    }).toThrow('mulaw.wav: unsupported audio format (browser only supports WAV PCM16 mono)');
  });

  it('should reject files without fmt chunk', () => {
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);
    view.setUint32(0, 0x46464952, true); // "RIFF"
    view.setUint32(8, 0x45564157, true); // "WAVE"
    // No fmt chunk
    
    expect(() => {
      parseWavPcm16Mono(buffer, 'nofmt.wav');
    }).toThrow('nofmt.wav: invalid WAV file (missing fmt chunk)');
  });

  it('should reject files without data chunk', () => {
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);
    view.setUint32(0, 0x46464952, true); // "RIFF"
    view.setUint32(8, 0x45564157, true); // "WAVE"
    view.setUint32(12, 0x20746d66, true); // "fmt "
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, 44100, true); // sample rate
    view.setUint16(34, 16, true); // 16-bit
    // No data chunk
    
    expect(() => {
      parseWavPcm16Mono(buffer, 'nodata.wav');
    }).toThrow('nodata.wav: invalid WAV file (missing data chunk)');
  });

  it('should reject files with odd data chunk size', () => {
    const wavBuffer = createTestWav(44100, 1, 16, 100);
    const view = new DataView(wavBuffer);
    view.setUint32(40, 201, true); // Odd data size (should be even for 16-bit)
    
    expect(() => {
      parseWavPcm16Mono(wavBuffer, 'odddatasize.wav');
    }).toThrow('odddatasize.wav: invalid WAV file (chunk extends beyond file)');
  });

  it('should reject files with no sample data', () => {
    const wavBuffer = createTestWav(44100, 1, 16, 0); // 0 samples
    
    expect(() => {
      parseWavPcm16Mono(wavBuffer, 'nosamples.wav');
    }).toThrow('nosamples.wav: invalid WAV file (missing data chunk)');
  });

  it('should parse different sample rates correctly', () => {
    const rates = [22050, 44100, 48000, 96000];
    
    for (const rate of rates) {
      const wavBuffer = createTestWav(rate, 1, 16, 50);
      const result = parseWavPcm16Mono(wavBuffer, `test_${rate}.wav`);
      expect(result.srcHz).toBe(rate);
    }
  });

  it('should extract PCM16 data correctly', () => {
    const wavBuffer = createTestWav(44100, 1, 16, 4);
    const result = parseWavPcm16Mono(wavBuffer, 'test.wav');
    
    expect(result.pcm16.length).toBe(4);
    // The test data should contain sine wave samples
    expect(typeof result.pcm16[0]).toBe('number');
    expect(result.pcm16[0]).toBeGreaterThanOrEqual(-32768);
    expect(result.pcm16[0]).toBeLessThanOrEqual(32767);
  });
});

describe('parseWavMetadata', () => {
  it('should parse metadata from valid WAV file', () => {
    const wavBuffer = createTestWav(48000, 1, 16, 200);
    const metadata = parseWavMetadata(wavBuffer, 'test.wav');
    
    expect(metadata.sampleRate).toBe(48000);
    expect(metadata.channels).toBe(1);
    expect(metadata.bitDepth).toBe(16);
  });

  it('should reject invalid files in metadata parsing', () => {
    const buffer = new ArrayBuffer(20);
    expect(() => {
      parseWavMetadata(buffer, 'small.wav');
    }).toThrow('small.wav: file too small to be a valid WAV file');
  });
});
