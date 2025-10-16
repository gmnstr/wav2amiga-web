import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestWav } from './test-utils';
import { parseWavPcm16Mono } from '../wav';

// Mock the worker since we can't easily test it in Node.js environment
// Instead, we'll test the conversion logic directly

describe('Worker Conversion Logic', () => {
  it('should process single file conversion', async () => {
    // Create a test WAV file
    const wavBuffer = createTestWav(44100, 1, 16, 100);
    const { pcm16, srcHz } = parseWavPcm16Mono(wavBuffer, 'test.wav');
    
    // Test the conversion pipeline that would happen in the worker
    const { mapPcm16To8Bit, noteToTargetHz, alignTo256 } = await import('@wav2amiga/core');
    const { createZohResampler } = await import('@wav2amiga/resampler-zoh');
    
    const note = 'C-2';
    const targetHz = noteToTargetHz(note);
    const zohResampler = createZohResampler();
    
    // Resample
    let resampledPcm16: Int16Array;
    if (srcHz === targetHz) {
      resampledPcm16 = pcm16;
    } else {
      resampledPcm16 = zohResampler.resamplePCM16(pcm16, srcHz, targetHz);
    }
    
    // Convert to 8-bit
    const sampleData8bit = mapPcm16To8Bit(resampledPcm16);
    
    // Align to 256-byte boundary
    const alignedLength = alignTo256(sampleData8bit.length);
    const alignedData = new Uint8Array(alignedLength);
    alignedData.set(sampleData8bit);
    // Fill padding with 0x80 (128) to match CLI
    alignedData.fill(0x80, sampleData8bit.length);
    
    expect(resampledPcm16).toBeInstanceOf(Int16Array);
    expect(sampleData8bit).toBeInstanceOf(Uint8Array);
    expect(alignedData.length).toBeGreaterThanOrEqual(sampleData8bit.length);
    expect(alignedData.length % 256).toBe(0);
  });

  it('should handle stacked mode conversion', async () => {
    // Create multiple test WAV files
    const wavBuffers = [
      createTestWav(44100, 1, 16, 50),
      createTestWav(48000, 1, 16, 75),
      createTestWav(22050, 1, 16, 100)
    ];
    
    const { mapPcm16To8Bit, noteToTargetHz, alignTo256, buildStacked } = await import('@wav2amiga/core');
    const { createZohResampler } = await import('@wav2amiga/resampler-zoh');
    
    const zohResampler = createZohResampler();
    const parts: Uint8Array[] = [];
    
    for (let i = 0; i < wavBuffers.length; i++) {
      const { pcm16, srcHz } = parseWavPcm16Mono(wavBuffers[i], `test${i}.wav`);
      const note = 'C-2';
      const targetHz = noteToTargetHz(note);
      
      // Resample
      let resampledPcm16: Int16Array;
      if (srcHz === targetHz) {
        resampledPcm16 = pcm16;
      } else {
        resampledPcm16 = zohResampler.resamplePCM16(pcm16, srcHz, targetHz);
      }
      
      // Convert to 8-bit and align
      const sampleData8bit = mapPcm16To8Bit(resampledPcm16);
      const alignedLength = alignTo256(sampleData8bit.length);
      const alignedData = new Uint8Array(alignedLength);
      alignedData.set(sampleData8bit);
      // Fill padding with 0x80 (128) to match CLI
      alignedData.fill(0x80, sampleData8bit.length);
      
      parts.push(alignedData);
    }
    
    // Build stacked output
    const { output, starts } = buildStacked(parts);
    
    expect(output).toBeInstanceOf(Uint8Array);
    expect(starts).toHaveLength(3);
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBeGreaterThan(0);
    expect(starts[2]).toBeGreaterThan(starts[1]);
  });

  it('should handle stacked-equal mode conversion', async () => {
    // Create multiple test WAV files
    const wavBuffers = [
      createTestWav(44100, 1, 16, 50),
      createTestWav(48000, 1, 16, 75),
      createTestWav(22050, 1, 16, 100)
    ];
    
    const { mapPcm16To8Bit, noteToTargetHz, alignTo256, buildStackedEqual } = await import('@wav2amiga/core');
    const { createZohResampler } = await import('@wav2amiga/resampler-zoh');
    
    const zohResampler = createZohResampler();
    const parts: Uint8Array[] = [];
    
    for (let i = 0; i < wavBuffers.length; i++) {
      const { pcm16, srcHz } = parseWavPcm16Mono(wavBuffers[i], `test${i}.wav`);
      const note = 'C-2';
      const targetHz = noteToTargetHz(note);
      
      // Resample
      let resampledPcm16: Int16Array;
      if (srcHz === targetHz) {
        resampledPcm16 = pcm16;
      } else {
        resampledPcm16 = zohResampler.resamplePCM16(pcm16, srcHz, targetHz);
      }
      
      // Convert to 8-bit and align
      const sampleData8bit = mapPcm16To8Bit(resampledPcm16);
      const alignedLength = alignTo256(sampleData8bit.length);
      const alignedData = new Uint8Array(alignedLength);
      alignedData.set(sampleData8bit);
      // Fill padding with 0x80 (128) to match CLI
      alignedData.fill(0x80, sampleData8bit.length);
      
      parts.push(alignedData);
    }
    
    // Build stacked-equal output
    const { output, starts, slot } = buildStackedEqual(parts);
    
    expect(output).toBeInstanceOf(Uint8Array);
    expect(starts).toHaveLength(3);
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBe(slot);
    expect(starts[2]).toBe(slot * 2);
    expect(slot).toBeGreaterThan(0);
  });

  it('should create valid 8SVX file structure', async () => {
    const wavBuffer = createTestWav(44100, 1, 16, 100);
    const { pcm16, srcHz } = parseWavPcm16Mono(wavBuffer, 'test.wav');
    
    const { mapPcm16To8Bit, noteToTargetHz, alignTo256 } = await import('@wav2amiga/core');
    const { createZohResampler } = await import('@wav2amiga/resampler-zoh');
    
    const note = 'C-2';
    const targetHz = noteToTargetHz(note);
    const zohResampler = createZohResampler();
    
    // Process file
    let resampledPcm16: Int16Array;
    if (srcHz === targetHz) {
      resampledPcm16 = pcm16;
    } else {
      resampledPcm16 = zohResampler.resamplePCM16(pcm16, srcHz, targetHz);
    }
    
    const sampleData8bit = mapPcm16To8Bit(resampledPcm16);
    const alignedLength = alignTo256(sampleData8bit.length);
    const alignedData = new Uint8Array(alignedLength);
    alignedData.set(sampleData8bit);
    
    // Create 8SVX structure (simplified version of worker logic)
    const name = "wav2amiga";
    const nameChunkSize = (name.length + 1) & ~1; // 10 bytes
    
    let totalSize = 0;
    totalSize += 12; // FORM header
    totalSize += 28; // VHDR chunk
    totalSize += 8 + nameChunkSize; // NAME chunk
    totalSize += 8; // BODY chunk header
    totalSize += alignedData.length; // Sample data
    
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    let pos = 0;
    
    // Write FORM header (big-endian)
    view.setUint32(pos, 0x464F524D, false); // "FORM"
    view.setUint32(pos + 4, totalSize - 8, false);
    view.setUint32(pos + 8, 0x38535658, false); // "8SVX"
    pos += 12;
    
    // Write VHDR chunk (big-endian)
    view.setUint32(pos, 0x56484452, false); // "VHDR"
    view.setUint32(pos + 4, 20, false); // size
    view.setUint32(pos + 8, 0, false); // oneShotHiSamples
    view.setUint32(pos + 12, 0, false); // repeatHiSamples
    view.setUint32(pos + 16, 0, false); // samplesPerHiCycle
    view.setUint32(pos + 20, targetHz, false); // samplesPerSec
    view.setUint16(pos + 24, 1, false); // ctOctave
    view.setUint16(pos + 26, 0, false); // sCompression
    pos += 28;
    
    // Write NAME chunk
    view.setUint32(pos, 0x4E414D45, false); // "NAME"
    view.setUint32(pos + 4, nameChunkSize, false);
    for (let i = 0; i < name.length; i++) {
      view.setUint8(pos + 8 + i, name.charCodeAt(i));
    }
    pos += 8 + nameChunkSize;
    
    // Write BODY chunk header
    view.setUint32(pos, 0x424F4459, false); // "BODY"
    view.setUint32(pos + 4, totalSize - 8 - 28 - (8 + nameChunkSize) - 8, false);
    pos += 8;
    
    // Write sample data
    for (let i = 0; i < alignedData.length; i++) {
      view.setUint8(pos + i, alignedData[i]);
    }
    
    const output = new Uint8Array(buffer);
    
    // Verify 8SVX structure
    expect(output.length).toBe(totalSize);
    
    // Check FORM header
    const formHeader = String.fromCharCode(output[0], output[1], output[2], output[3]);
    expect(formHeader).toBe('FORM');
    
    // Check 8SVX format
    const format = String.fromCharCode(output[8], output[9], output[10], output[11]);
    expect(format).toBe('8SVX');
    
    // Check VHDR chunk
    const vhdr = String.fromCharCode(output[12], output[13], output[14], output[15]);
    expect(vhdr).toBe('VHDR');
    
    // Check NAME chunk
    const nameChunk = String.fromCharCode(output[40], output[41], output[42], output[43]);
    expect(nameChunk).toBe('NAME');
    
    // Check BODY chunk
    const bodyOffset = 40 + 8 + nameChunkSize;
    const body = String.fromCharCode(output[bodyOffset], output[bodyOffset + 1], output[bodyOffset + 2], output[bodyOffset + 3]);
    expect(body).toBe('BODY');
  });
});
