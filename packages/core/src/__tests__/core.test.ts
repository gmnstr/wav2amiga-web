import { describe, it, expect } from "vitest";
import {
  mapPcm16To8Bit,
  alignTo256,
  isAligned256,
  ALIGN,
  buildStacked,
  buildStackedEqual,
  formatOffsetHex,
  filenameForStacked,
  filenameForStackedEqual,
  PAL_PERIODS,
  noteToTargetHz,
  generateSingleFilename,
  generateStackedFilename,
  generateStackedEqualFilename,
  calculateStackedEqualLayout,
  validateMonoPcm16,
  ResampleAPI,
  ResamplerMeta,
} from "../index";

describe("mapPcm16To8Bit", () => {
  it("maps quantization edges correctly", () => {
    // Test edge cases as specified in section 6
    const testCases = [
      { input: -32768, expected: 0 },
      { input: -32767, expected: 0 },
      { input: -256, expected: 127 },
      { input: -1, expected: 127 },
      { input: 0, expected: 128 },
      { input: 255, expected: 128 },
      { input: 256, expected: 129 },
      { input: 32767, expected: 255 },
    ];

    for (const { input, expected } of testCases) {
      const inputArray = new Int16Array([input]);
      const result = mapPcm16To8Bit(inputArray);
      expect(result[0]).toBe(expected);
    }
  });

  it("handles full range mapping", () => {
    const input = new Int16Array([-32768, -16384, 0, 16384, 32767]);
    const result = mapPcm16To8Bit(input);
    expect(result).toEqual(new Uint8Array([0, 64, 128, 192, 255]));
  });
});

describe("alignTo256", () => {
  it("aligns lengths correctly", () => {
    // Test lengths as specified in section 6
    const testCases = [
      { input: 1, expected: 256 },
      { input: 255, expected: 256 },
      { input: 256, expected: 256 },
      { input: 257, expected: 512 },
      { input: 511, expected: 512 },
      { input: 512, expected: 512 },
      { input: 513, expected: 768 },
      { input: 65535, expected: 65536 },
    ];

    for (const { input, expected } of testCases) {
      expect(alignTo256(input)).toBe(expected);
    }
  });

  it("implements (len + 0xFF) & ~0xFF correctly", () => {
    // Test the formula directly
    for (let len = 0; len < 1000; len++) {
      const aligned = alignTo256(len);
      expect(aligned % 256).toBe(0);
      expect(aligned).toBeGreaterThanOrEqual(len);
    }
  });

  it("no extra padding on multiples of 0x100", () => {
    for (let len = 256; len < 1000; len += 256) {
      expect(alignTo256(len)).toBe(len);
    }
  });
});

describe("noteToTargetHz", () => {
  it("converts PAL periods to targetHz using floor policy", () => {
    // Test some known notes
    expect(noteToTargetHz("C-2")).toBe(Math.floor(3546895 / 428));
    expect(noteToTargetHz("A-4")).toBe(Math.floor(3546895 / 64));
    expect(noteToTargetHz("C-1")).toBe(Math.floor(3546895 / 856));
  });

  it("rejects invalid notes", () => {
    expect(() => noteToTargetHz("Invalid")).toThrow("Invalid note: Invalid");
    expect(() => noteToTargetHz("")).toThrow("Invalid note:");
    expect(() => noteToTargetHz("X-1")).toThrow("Invalid note: X-1");
  });

  it("has all expected PAL periods", () => {
    expect(Object.keys(PAL_PERIODS)).toHaveLength(96); // C-1 to B-8
    expect(PAL_PERIODS["C-2"]).toBe(428);
    expect(PAL_PERIODS["A-4"]).toBe(64);
    expect(PAL_PERIODS["C-8"]).toBe(6);
  });
});

describe("filename generation", () => {
  describe("generateSingleFilename", () => {
    it("creates correct single mode filenames", () => {
      expect(generateSingleFilename("kick")).toBe("kick.8SVX");
      expect(generateSingleFilename("my-sample")).toBe("my-sample.8SVX");
    });
  });

  describe("generateStackedFilename", () => {
    it("creates correct stacked mode filenames with hex offsets", () => {
      const segments = [
        { startByte: 0, paddedLength: 256 },
        { startByte: 256, paddedLength: 256 },
        { startByte: 512, paddedLength: 256 },
      ];
      expect(generateStackedFilename("kit", segments)).toBe("kit_00_01_02.8SVX");
    });

    it("ensures hex offsets are uppercase and zero-padded", () => {
      const segments = [
        { startByte: 0, paddedLength: 256 },
        { startByte: 15 * 256, paddedLength: 256 },
        { startByte: 255 * 256, paddedLength: 256 },
      ];
      expect(generateStackedFilename("test", segments)).toBe("test_00_0F_FF.8SVX");
    });

    it("handles larger offsets", () => {
      const segments = [
        { startByte: 4096, paddedLength: 256 },
        { startByte: 8192, paddedLength: 256 },
      ];
      expect(generateStackedFilename("large", segments)).toBe("large_10_20.8SVX");
    });
  });

  describe("generateStackedEqualFilename", () => {
    it("creates correct stacked-equal mode filenames", () => {
      expect(generateStackedEqualFilename("kit", 5)).toBe("kit_05.8SVX");
      expect(generateStackedEqualFilename("drum", 16)).toBe("drum_10.8SVX");
    });

    it("ensures increment is uppercase hex and zero-padded", () => {
      expect(generateStackedEqualFilename("test", 0)).toBe("test_00.8SVX");
      expect(generateStackedEqualFilename("test", 15)).toBe("test_0F.8SVX");
      expect(generateStackedEqualFilename("test", 255)).toBe("test_FF.8SVX");
    });
  });
});

describe("stacked-equal layout", () => {
  it("calculates uniform slot size as max(align256(len_i))", () => {
    const lengths = [100, 200, 150];
    const { slotSize, increment } = calculateStackedEqualLayout(lengths);

    const expectedSlotSize = alignTo256(Math.max(...lengths));
    expect(slotSize).toBe(expectedSlotSize);
    expect(increment).toBe(slotSize >> 8);
  });

  it("handles various length combinations", () => {
    const testCases = [
      { lengths: [256], expectedSlotSize: 256, expectedIncrement: 1 },
      { lengths: [257], expectedSlotSize: 512, expectedIncrement: 2 },
      { lengths: [100, 300], expectedSlotSize: 512, expectedIncrement: 2 },
      { lengths: [1000, 2000, 1500], expectedSlotSize: 2048, expectedIncrement: 8 },
    ];

    for (const { lengths, expectedSlotSize, expectedIncrement } of testCases) {
      const { slotSize, increment } = calculateStackedEqualLayout(lengths);
      expect(slotSize).toBe(expectedSlotSize);
      expect(increment).toBe(expectedIncrement);
    }
  });
});

describe("validateMonoPcm16", () => {
  it("accepts mono inputs", () => {
    const monoInput = new Int16Array(100);
    expect(() => validateMonoPcm16(monoInput, 1)).not.toThrow();
  });

  it("rejects non-mono inputs", () => {
    const stereoInput = new Int16Array(200);
    expect(() => validateMonoPcm16(stereoInput, 2)).toThrow(
      "Input must be mono (1 channel), got 2 channels"
    );
    expect(() => validateMonoPcm16(stereoInput, 0)).toThrow(
      "Input must be mono (1 channel), got 0 channels"
    );
  });
});

describe("ALIGN constant and isAligned256", () => {
  it("exports ALIGN as 0x100", () => {
    expect(ALIGN).toBe(0x100);
  });

  it("isAligned256 checks alignment correctly", () => {
    expect(isAligned256(0x100)).toBe(true);
    expect(isAligned256(0x200)).toBe(true);
    expect(isAligned256(0x000)).toBe(true);
    expect(isAligned256(0x101)).toBe(false);
    expect(isAligned256(0x1FF)).toBe(false);
  });
});

describe("buildStacked", () => {
  it("builds stacked segments with correct offsets", () => {
    const part1 = new Uint8Array([1, 2, 3]); // length 3 -> align to 256
    const part2 = new Uint8Array([4, 5]);    // length 2 -> align to 256
    const part3 = new Uint8Array([6]);       // length 1 -> align to 256

    const result = buildStacked([part1, part2, part3]);

    expect(result.starts).toEqual([0, 256, 512]);
    expect(result.output.length).toBe(768); // 3 * 256
    expect(result.output[0]).toBe(1);
    expect(result.output[1]).toBe(2);
    expect(result.output[2]).toBe(3);
    expect(result.output[256]).toBe(4);
    expect(result.output[257]).toBe(5);
    expect(result.output[512]).toBe(6);
  });

  it("handles empty input", () => {
    const result = buildStacked([]);
    expect(result.starts).toEqual([]);
    expect(result.output.length).toBe(0);
  });

  it("handles already aligned lengths", () => {
    const part1 = new Uint8Array(256); // already aligned
    const part2 = new Uint8Array(512); // already aligned

    const result = buildStacked([part1, part2]);

    expect(result.starts).toEqual([0, 256]);
    expect(result.output.length).toBe(768);
  });
});

describe("buildStackedEqual", () => {
  it("builds stacked-equal with uniform slots", () => {
    const part1 = new Uint8Array([1, 2, 3]); // length 3 -> align to 256
    const part2 = new Uint8Array([4, 5]);    // length 2 -> align to 256
    const part3 = new Uint8Array([6]);       // length 1 -> align to 256

    const result = buildStackedEqual([part1, part2, part3]);

    expect(result.slot).toBe(256);
    expect(result.starts).toEqual([0, 256, 512]);
    expect(result.output.length).toBe(768); // 3 * 256
    expect(result.output[0]).toBe(1);
    expect(result.output[256]).toBe(4);
    expect(result.output[512]).toBe(6);
  });

  it("handles empty input", () => {
    const result = buildStackedEqual([]);
    expect(result.slot).toBe(0);
    expect(result.starts).toEqual([]);
    expect(result.output.length).toBe(0);
  });

  it("uses largest aligned length as slot", () => {
    const part1 = new Uint8Array(100); // aligns to 256
    const part2 = new Uint8Array(300); // aligns to 512

    const result = buildStackedEqual([part1, part2]);

    expect(result.slot).toBe(512);
    expect(result.starts).toEqual([0, 512]);
    expect(result.output.length).toBe(1024); // 2 * 512
  });
});

describe("formatOffsetHex", () => {
  it("formats offsets as uppercase hex with minimum 2 characters", () => {
    expect(formatOffsetHex(0)).toBe("00");
    expect(formatOffsetHex(5)).toBe("05");
    expect(formatOffsetHex(15)).toBe("0F");
    expect(formatOffsetHex(255)).toBe("FF");
    expect(formatOffsetHex(256)).toBe("100");
    expect(formatOffsetHex(0xAB)).toBe("AB");
  });

  it("handles negative values by clamping to 0", () => {
    expect(formatOffsetHex(-1)).toBe("00");
    expect(formatOffsetHex(-100)).toBe("00");
  });
});

describe("filenameForStacked", () => {
  it("generates correct stacked filenames", () => {
    expect(filenameForStacked("kit", [0x000, 0x500, 0x900])).toBe("kit_00_05_09.8SVX");
    expect(filenameForStacked("test", [0, 256, 512])).toBe("test_00_01_02.8SVX");
  });
});

describe("filenameForStackedEqual", () => {
  it("generates correct stacked-equal filenames", () => {
    expect(filenameForStackedEqual("kit", 0x500)).toBe("kit_05.8SVX");
    expect(filenameForStackedEqual("test", 256)).toBe("test_01.8SVX");
    expect(filenameForStackedEqual("drum", 0x1000)).toBe("drum_10.8SVX");
  });
});

describe("ResampleAPI interface", () => {
  it("exports ResampleAPI interface", () => {
    // TypeScript interface test - just verify it exists
    const mockApi: ResampleAPI = {
      meta: {
        name: "wasm",
        version: "1.0.0",
        sha256: "abc123"
      },
      resamplePCM16: (input, srcHz, dstHz) => {
        if (srcHz === dstHz) return input.slice();
        return new Int16Array(Math.ceil(input.length * dstHz / srcHz));
      }
    };

    expect(mockApi.meta.name).toBe("wasm");
    expect(mockApi.meta.version).toBe("1.0.0");
    expect(mockApi.meta.sha256).toBe("abc123");
  });

  it("exports ResamplerMeta interface", () => {
    const mockMeta: ResamplerMeta = {
      name: "ffmpeg",
      version: "6.0.0",
      sha256: undefined
    };

    expect(mockMeta.name).toBe("ffmpeg");
    expect(mockMeta.version).toBe("6.0.0");
    expect(mockMeta.sha256).toBeUndefined();
  });
});
