import { describe, it, expect } from "vitest";
import { createZohResampler } from "../index.js";

describe("ZOH Resampler", () => {
  const resampler = createZohResampler();

  describe("metadata", () => {
    it("has correct metadata", () => {
      expect(resampler.meta.name).toBe('zoh');
      expect(resampler.meta.version).toBe('1.0.0');
    });
  });

  describe("impulse preservation (upsample)", () => {
    it("preserves impulse exactly when upsampling", () => {
      // Input: [0, 1000, 0] @ 8kHz → 16kHz
      const input = new Int16Array([0, 1000, 0]);
      const output = resampler.resamplePCM16(input, 8000, 16000);
      
      // Should repeat 1000 for exactly 2 samples
      expect(output.length).toBe(6); // 3 * 2
      expect(output[0]).toBe(0);
      expect(output[1]).toBe(0);
      expect(output[2]).toBe(1000);
      expect(output[3]).toBe(1000);
      expect(output[4]).toBe(0);
      expect(output[5]).toBe(0);
    });

    it("preserves impulse in longer sequence", () => {
      // Input: [0, 0, 0, 1000, 0, 0, 0] @ 8kHz → 16kHz
      const input = new Int16Array([0, 0, 0, 1000, 0, 0, 0]);
      const output = resampler.resamplePCM16(input, 8000, 16000);
      
      // Should have exactly 2 samples of 1000
      const nonZeroSamples = Array.from(output).filter((x: number) => x !== 0);
      expect(nonZeroSamples).toEqual([1000, 1000]);
    });
  });

  describe("impulse preservation (downsample)", () => {
    it("keeps impulse as single sample or drops it when downsampling", () => {
      // Input: [0, 0, 1000, 0, 0] @ 16kHz → 8kHz
      const input = new Int16Array([0, 0, 1000, 0, 0]);
      const output = resampler.resamplePCM16(input, 16000, 8000);
      
      // Should be either 1 non-zero sample or 0 (never multiple)
      const nonZeroSamples = Array.from(output).filter((x: number) => x !== 0);
      expect(nonZeroSamples.length).toBeLessThanOrEqual(1);
      
      if (nonZeroSamples.length === 1) {
        expect(nonZeroSamples[0]).toBe(1000);
      }
    });

    it("handles multiple impulses correctly", () => {
      // Input: [1000, 0, 0, 0, 2000, 0, 0, 0] @ 16kHz → 8kHz
      const input = new Int16Array([1000, 0, 0, 0, 2000, 0, 0, 0]);
      const output = resampler.resamplePCM16(input, 16000, 8000);
      
      // Should have at most 2 non-zero samples
      const nonZeroSamples = Array.from(output).filter((x: number) => x !== 0);
      expect(nonZeroSamples.length).toBeLessThanOrEqual(2);
    });
  });

  describe("step response", () => {
    it("preserves step without pre/post-ringing", () => {
      // Input: step from 0 to 1000
      const input = new Int16Array([0, 0, 0, 1000, 1000, 1000]);
      const output = resampler.resamplePCM16(input, 8000, 16000);
      
      // Should be a clean step - no intermediate values
      const uniqueValues = [...new Set(Array.from(output))];
      expect(uniqueValues).toEqual(expect.arrayContaining([0, 1000]));
      expect(uniqueValues.length).toBeLessThanOrEqual(2);
    });

    it("handles step down correctly", () => {
      // Input: step from 1000 to 0
      const input = new Int16Array([1000, 1000, 1000, 0, 0, 0]);
      const output = resampler.resamplePCM16(input, 8000, 16000);
      
      // Should be a clean step down
      const uniqueValues = [...new Set(Array.from(output))];
      expect(uniqueValues).toEqual(expect.arrayContaining([0, 1000]));
      expect(uniqueValues.length).toBeLessThanOrEqual(2);
    });
  });

  describe("boundary tie behavior", () => {
    it("chooses earlier sample on exact boundary", () => {
      // Test case where n * srcHz is exactly divisible by dstHz
      // 2 * 8000 = 16000, which is exactly divisible by 8000
      const input = new Int16Array([100, 200, 300]);
      const output = resampler.resamplePCM16(input, 8000, 8000);
      
      // Should be identical (no resampling)
      expect(output).toEqual(input);
    });

    it("handles exact ratio correctly", () => {
      // 1:2 ratio should be exact
      const input = new Int16Array([100, 200]);
      const output = resampler.resamplePCM16(input, 8000, 16000);
      
      expect(output.length).toBe(4);
      expect(output[0]).toBe(100);
      expect(output[1]).toBe(100);
      expect(output[2]).toBe(200);
      expect(output[3]).toBe(200);
    });
  });

  describe("length mapping consistency", () => {
    it("produces consistent output length for C-2 conversion", () => {
      // src=44100, dst=8287 (C-2)
      const input = new Int16Array(44100); // 1 second of audio
      const output = resampler.resamplePCM16(input, 44100, 8287);
      
      // Should be consistent across platforms
      const expectedLength = Math.round(input.length * 8287 / 44100);
      expect(output.length).toBe(expectedLength);
    });

    it("handles various ratios consistently", () => {
      const testCases = [
        { src: 44100, dst: 22050, inputLen: 1000 },
        { src: 48000, dst: 8000, inputLen: 1000 },
        { src: 8000, dst: 44100, inputLen: 100 },
        { src: 11025, dst: 22050, inputLen: 500 }
      ];

      for (const { src, dst, inputLen } of testCases) {
        const input = new Int16Array(inputLen);
        const output = resampler.resamplePCM16(input, src, dst);
        
        const expectedLength = Math.round(inputLen * dst / src);
        expect(output.length).toBe(expectedLength);
      }
    });
  });

  describe("edge cases", () => {
    it("handles empty input", () => {
      const input = new Int16Array(0);
      const output = resampler.resamplePCM16(input, 8000, 16000);
      expect(output.length).toBe(0);
    });

    it("handles single sample", () => {
      const input = new Int16Array([1000]);
      const output = resampler.resamplePCM16(input, 8000, 16000);
      expect(output.length).toBe(2);
      expect(output[0]).toBe(1000);
      expect(output[1]).toBe(1000);
    });

    it("handles same sample rate", () => {
      const input = new Int16Array([100, 200, 300]);
      const output = resampler.resamplePCM16(input, 8000, 8000);
      expect(output).toEqual(input);
    });

    it("handles very small ratios", () => {
      const input = new Int16Array([100, 200, 300, 400, 500]);
      const output = resampler.resamplePCM16(input, 8000, 1);
      expect(output.length).toBe(0); // 5 * 1/8000 = 0.000625, rounds to 0
    });

    it("handles very large ratios", () => {
      const input = new Int16Array([1000]);
      const output = resampler.resamplePCM16(input, 1, 8000);
      expect(output.length).toBe(8000);
      expect(output.every(x => x === 1000)).toBe(true);
    });
  });

  describe("transient preservation", () => {
    it("preserves sharp attacks without smoothing", () => {
      // Sharp attack: immediate jump from silence to full amplitude
      const input = new Int16Array([0, 0, 0, 0, 32767, 32767, 32767]);
      const output = resampler.resamplePCM16(input, 8000, 16000);
      
      // Should maintain sharp transition
      const hasSharpTransition = output.some((val: number, i: number) => 
        i > 0 && output[i-1] === 0 && val === 32767
      );
      expect(hasSharpTransition).toBe(true);
    });

    it("preserves high-frequency content", () => {
      // High-frequency square wave pattern
      const input = new Int16Array([-1000, 1000, -1000, 1000, -1000, 1000]);
      const output = resampler.resamplePCM16(input, 8000, 16000);
      
      // Should preserve the pattern without smoothing
      const hasHighFreq = output.some((val: number, i: number) => 
        i > 0 && Math.abs(val - output[i-1]) > 1000
      );
      expect(hasHighFreq).toBe(true);
    });
  });

  describe("phase 3 transient checks", () => {
    it("repeats an impulse exactly across upsampled frames", () => {
      const input = new Int16Array([0, 15000, 0]);
      const output = resampler.resamplePCM16(input, 5000, 20000);
      expect(output.length).toBe(12);
      const nonZero: number[] = [];
      for (let i = 0; i < output.length; i++) {
        if (output[i] !== 0) {
          nonZero.push(i);
        }
      }
      expect(nonZero).toEqual([4, 5, 6, 7]);
      expect(output[nonZero[0]]).toBe(15000);
      expect(output[nonZero[nonZero.length - 1]]).toBe(15000);
    });

    it("does not smear impulses when heavily downsampling", () => {
      const input = new Int16Array([0, 0, 18000, 0, 0, 0, 0, 0]);
      const output = resampler.resamplePCM16(input, 44100, 4000);
      const nonZero = output.filter((value) => value !== 0);
      expect(nonZero.length).toBeLessThanOrEqual(1);
      if (nonZero.length === 1) {
        expect(nonZero[0]).toBe(18000);
      }
    });

    it("keeps step transitions crisp", () => {
      const input = new Int16Array([0, 0, 20000, 20000, 20000]);
      const output = resampler.resamplePCM16(input, 11025, 44100);
      const min = Math.min(...output);
      const max = Math.max(...output);
      expect([min, max]).toEqual([0, 20000]);
      for (let i = 1; i < output.length; i++) {
        const delta = output[i] - output[i - 1];
        if (delta !== 0) {
          expect(Math.abs(delta)).toBe(20000);
        }
      }
    });

    it("keeps first sample aligned regardless of ratio", () => {
      const scenarios = [
        { src: 44100, dst: 8287 },
        { src: 16000, dst: 48000 },
        { src: 8000, dst: 11025 },
      ];

      for (const { src, dst } of scenarios) {
        const input = new Int16Array([12345, 23456, -12000, 0]);
        const output = resampler.resamplePCM16(input, src, dst);
        expect(output[0]).toBe(12345);
      }
    });
  });
});
