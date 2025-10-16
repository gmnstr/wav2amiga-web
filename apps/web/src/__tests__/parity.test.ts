import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseWavPcm16Mono } from '../wav';
import { createTestWav } from './test-utils';

// This test compares web conversion output with CLI golden files
// to ensure byte-identical determinism

describe('CLI Parity Tests', () => {
  it('should produce byte-identical output for single C-2 sine wave', async () => {
    // Load the golden test case
    const goldenDir = join(process.cwd(), '../../goldens/cases/single_c2_sine');
    const inputWavPath = join(goldenDir, 'input.wav');
    const expectedOutputPath = join(goldenDir, 'output.8SVX');
    
    // Read the input WAV file
    const inputWavBuffer = readFileSync(inputWavPath).buffer;
    const { pcm16, srcHz } = parseWavPcm16Mono(inputWavBuffer, 'input.wav');
    
    // Import conversion functions
    const { mapPcm16To8Bit, noteToTargetHz, alignTo256 } = await import('@wav2amiga/core');
    const { createZohResampler } = await import('@wav2amiga/resampler-zoh');
    
    // Convert using the same logic as the worker
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
    
    // Create 8SVX file structure (matching CLI exactly)
    const name = "wav2amiga";
    const nameChunkSize = (name.length + 1) & ~1; // 10 bytes
    
    let totalSize = 0;
    totalSize += 8; // FORM header (CLI only counts the size field)
    totalSize += 28; // VHDR chunk
    totalSize += 8 + nameChunkSize; // NAME chunk
    totalSize += 8; // BODY chunk header
    totalSize += alignedData.length; // Sample data
    
    // Allocate buffer with actual file size (totalSize + 4 bytes for "FORM" + "8SVX")
    const buffer = new ArrayBuffer(totalSize + 4);
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
    
    const webOutput = new Uint8Array(buffer);
    
    // Read expected output from CLI golden
    const expectedOutput = new Uint8Array(readFileSync(expectedOutputPath));
    
    // Compare byte by byte
    expect(webOutput.length).toBe(expectedOutput.length);
    
    // Check for byte-identical output
    for (let i = 0; i < webOutput.length; i++) {
      if (webOutput[i] !== expectedOutput[i]) {
        console.log(`Byte mismatch at offset ${i}: web=${webOutput[i]}, expected=${expectedOutput[i]}`);
        console.log(`Context: ${webOutput.slice(Math.max(0, i-10), i+10).join(', ')}`);
        break;
      }
    }
    
    // This should pass if the conversion is deterministic
    expect(webOutput).toEqual(expectedOutput);
  });

  it('should handle different sample rates correctly', async () => {
    // Test with a different sample rate to ensure resampling works
    const testRates = [22050, 48000];
    
    for (const rate of testRates) {
      // Create a simple test WAV with the target rate
      const testWav = createTestWav(rate, 1, 16, 50);
      const { pcm16, srcHz } = parseWavPcm16Mono(testWav, `test_${rate}.wav`);
      
      expect(srcHz).toBe(rate);
      expect(pcm16.length).toBe(50);
      
      // Test resampling to C-2 (8287 Hz)
      const { noteToTargetHz } = await import('@wav2amiga/core');
      const { createZohResampler } = await import('@wav2amiga/resampler-zoh');
      
      const targetHz = noteToTargetHz('C-2');
      const zohResampler = createZohResampler();
      
      const resampled = zohResampler.resamplePCM16(pcm16, srcHz, targetHz);
      
      expect(resampled).toBeInstanceOf(Int16Array);
      expect(resampled.length).toBeGreaterThan(0);
      
      // For downsampling, output should be shorter
      if (srcHz > targetHz) {
        expect(resampled.length).toBeLessThan(pcm16.length);
      }
      // For upsampling, output should be longer
      else if (srcHz < targetHz) {
        expect(resampled.length).toBeGreaterThan(pcm16.length);
      }
      // For same rate, should be identical
      else {
        expect(resampled.length).toBe(pcm16.length);
      }
    }
  });
});

